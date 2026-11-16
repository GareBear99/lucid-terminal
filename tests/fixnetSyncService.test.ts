// @vitest-environment node
/**
 * FixNet Pages pull tests — the main-process half of the client sync
 * (electron/services/fixnetSync.ts).
 *
 * The pull is PULL-ONLY: every request is a GET to the public Pages
 * site, no auth, no body, nothing sent up. These tests inject a
 * stub fetch and assert (a) the payloads parse into the shapes the
 * renderer applies, (b) malformed entries are skipped, never
 * trusted, (c) a missing daily file is not an error, and (d) every
 * request the pull makes is a GET to the Pages host — no POST, no
 * PUT, no upload of any kind.
 */
import { describe, test, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FIXNET_PAGES_BASE_URL,
  pullFixNetDaily,
} from '../electron/services/fixnetSync';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeFetch(
  routes: Record<string, unknown>,
  calls: { url: string; method: string }[],
): FetchStub {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (key === undefined) return new Response('not found', { status: 404 });
    const body = routes[key];
    if (body instanceof Response) return body;
    return jsonResponse(body);
  };
}

const STATUS_DOC = {
  format: 'fixnet-status-v1',
  date: '2026-11-16',
  temps: 3,
  verified: 1,
  status: [
    { tick: 1, id: 'profile-root', outcome: 'verified', day: '2026-11-15', reason: 'genesis_root' },
    { tick: 2, id: 'profile-fake', outcome: 'not_verified', day: '2026-11-16', reason: 'genesis_not_root' },
    { tick: 3, id: 'profile-child', outcome: 'pending', day: '2026-11-16', reason: 'referrer_pending' },
  ],
};

const DAILY_DOC = {
  format: 'fixnet-daily-v1',
  date: '2026-11-16',
  status: [
    { tick: 2, id: 'profile-fake', outcome: 'not_verified', day: '2026-11-16', reason: 'genesis_not_root' },
    { tick: 3, id: 'profile-child', outcome: 'pending', day: '2026-11-16', reason: 'referrer_pending' },
  ],
  counts: { verified: 0, pending: 1, not_verified: 1, expired: 0, checked: 2 },
  yield: { verified_today: 0, verified_total: 1, corpus_entries_today: 42, corpus_total_entries: 1042 },
  deposit: { sp_per_verified: 1000, overflow_queued: false, entries: [] },
};

describe('pullFixNetDaily', () => {
  test('pulls the status table + latest day + daily file', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchStub = makeFetch(
      {
        '/daily/status.json': STATUS_DOC,
        '/daily/latest.json': { date: '2026-11-16', daily: 'daily/2026-11-16.json', status: 'daily/status.json' },
        '/daily/2026-11-16.json': DAILY_DOC,
      },
      calls,
    );
    const result = await pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub as unknown as typeof fetch);
    expect(result.day).toBe('2026-11-16');
    expect(result.status).toHaveLength(3);
    expect(result.status[0]).toEqual({
      tick: 1, id: 'profile-root', outcome: 'verified', day: '2026-11-15', reason: 'genesis_root',
    });
    expect(result.daily?.yield.verified_total).toBe(1);
    expect(result.daily?.yield.corpus_entries_today).toBe(42);
    expect(result.daily?.deposit.sp_per_verified).toBe(1000);
    expect(typeof result.pulledAt).toBe('string');
  });

  test('a missing daily file is not an error — the status still applies', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchStub = makeFetch({ '/daily/status.json': STATUS_DOC }, calls);
    const result = await pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub as unknown as typeof fetch);
    expect(result.status).toHaveLength(3);
    expect(result.day).toBeNull();
    expect(result.daily).toBeNull();
    expect(result.status[0].outcome).toBe('verified');
  });

  test('malformed status entries are skipped, never trusted', async () => {
    const calls: { url: string; method: string }[] = [];
    const bad = {
      ...STATUS_DOC,
      status: [
        { tick: 1, id: 'profile-ok', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds' },
        { tick: -1, id: 'profile-bad-tick', outcome: 'verified', day: '2026-11-16', reason: 'x' },
        { tick: 2, id: '', outcome: 'verified', day: '2026-11-16', reason: 'x' },
        { tick: 3, id: 'profile-bad-outcome', outcome: 'bogus', day: '2026-11-16', reason: 'x' },
        { tick: 4, id: 'profile-ok-2', outcome: 'pending', day: '2026-11-16', reason: 'referrer_pending' },
      ],
    };
    const fetchStub = makeFetch({ '/daily/status.json': bad }, calls);
    const result = await pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub as unknown as typeof fetch);
    expect(result.status.map((s) => s.id)).toEqual(['profile-ok', 'profile-ok-2']);
  });

  test('a malformed status document throws — never a made-up status', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchStub = makeFetch({ '/daily/status.json': { format: 'x' } }, calls);
    await expect(
      pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub as unknown as typeof fetch),
    ).rejects.toThrow('malformed');
  });

  test('a failed status fetch throws', async () => {
    const fetchStub = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    await expect(pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub)).rejects.toThrow('503');
  });

  test('PULL-ONLY: every request is a GET to the Pages host', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchStub = makeFetch(
      {
        '/daily/status.json': STATUS_DOC,
        '/daily/latest.json': { date: '2026-11-16' },
        '/daily/2026-11-16.json': DAILY_DOC,
      },
      calls,
    );
    await pullFixNetDaily(FIXNET_PAGES_BASE_URL, fetchStub as unknown as typeof fetch);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method).toBe('GET');
      expect(call.url.startsWith(FIXNET_PAGES_BASE_URL)).toBe(true);
    }
    // And the module source contains no upload method at all:
    // every `method:` in it is 'GET'.
    const source = fs.readFileSync(
      path.join(__dirname, '../electron/services/fixnetSync.ts'),
      'utf8',
    );
    for (const method of ["'POST'", "'PUT'", "'PATCH'", "'DELETE'", '"POST"', '"PUT"']) {
      expect(source).not.toContain(method);
    }
    const methods = [...source.matchAll(/method:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });
});
