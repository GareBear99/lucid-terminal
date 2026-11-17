import { describe, it, expect, vi, beforeEach } from 'vitest';

// The ping client runs in the Electron main process: secureStorage pulls
// in electron (safeStorage) and electron-store. Stand-ins keep the real
// storage logic running in-memory instead of touching the OS keychain.
// (Same stand-ins as tests/openaiDirectApi.test.ts.)
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8'),
  },
}));

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data: Record<string, unknown>;
    constructor(opts: { name: string; defaults?: Record<string, unknown> }) {
      this.data = { ...(opts.defaults ?? {}) };
    }
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    has(key: string) {
      return key in this.data;
    }
    delete(key: string) {
      delete this.data[key];
    }
    clear() {
      this.data = {};
    }
    get store() {
      return { ...this.data };
    }
  },
}));

import {
  chatPing,
  pingServerHealth,
  activateTemp,
  getOrCreateUserId,
  isPingServerEnabled,
  formatResetTime,
  getLastQuota,
  PingRateLimitError,
} from '../electron/services/pingServer';
import { settings, pingKeyStorage } from '../electron/services/secureStorage';

const ENDPOINT = 'http://127.0.0.1:8787';
const QUOTA_HEADERS = {
  'x-ratelimit-limit': '200',
  'x-ratelimit-remaining': '197',
  'x-ratelimit-reset': String(Math.floor(Date.UTC(2026, 10, 7, 9, 31) / 1000)),
};

function sseResponse(text: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(text, { status, headers: { 'content-type': 'text/event-stream', ...headers } });
}

const SSE_PINGBACK =
  'data: {"choices":[{"index":0,"delta":{"content":"PING"}}]}\n\n' +
  'data: {"choices":[{"index":0,"delta":{"content":"BACK"}}]}\n\n' +
  'data: [DONE]\n\n';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  settings.set('pingServerEnabled', true);
  settings.set('pingServerEndpoint', ENDPOINT);
  settings.set('pingServerUserId', 'test-user-1');
  pingKeyStorage.setPingKey('test-secret');
});

describe('pingServer client', () => {
  it('streams SSE chunks in order and returns the concatenated text', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));

    const chunks: string[] = [];
    let endedQuota: unknown = null;
    const text = await chatPing(
      [{ role: 'user', content: 'Say the word PINGBACK and nothing else.' }],
      (c) => chunks.push(c),
      (q) => {
        endedQuota = q;
      },
    );

    expect(text).toBe('PINGBACK');
    expect(chunks).toEqual(['PING', 'BACK']);
    expect(endedQuota).toMatchObject({ limit: 200, remaining: 197 });

    // The request: OpenAI-compatible shape, both headers, no tools.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}/v1/chat/completions`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-lucid-user']).toBe('test-user-1');
    expect(headers['x-lucid-ping-key']).toBe('test-secret');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('@cf/meta/llama-3.2-1b-instruct');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'Say the word PINGBACK and nothing else.' }]);
    expect(body).not.toHaveProperty('tools');
  });

  it('sends a chosen model as body.model so the worker serves it', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));
    await chatPing(
      [{ role: 'user', content: 'Hi.' }],
      undefined,
      undefined,
      undefined,
      '@cf/meta/llama-3.2-1b-instruct',
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('@cf/meta/llama-3.2-1b-instruct');
  });

  it('renders raw Workers AI chunks that carry a response field and no choices', async () => {
    const fetchMock = vi.mocked(fetch);
    // The live worker path once streamed the raw Workers AI shape
    // ({ response, p, usage }) with no `choices` — the old client
    // dropped every chunk and the reply came back empty. The
    // response-field fallback must render it.
    const raw =
      'data: {"response":"Hello","p":"s","usage":{"prompt_tokens":18,"completion_tokens":3}}\n\n' +
      'data: {"response":"!","p":"s"}\n\n' +
      'data: [DONE]\n\n';
    fetchMock.mockResolvedValue(sseResponse(raw, 200, QUOTA_HEADERS));

    const chunks: string[] = [];
    const text = await chatPing(
      [{ role: 'user', content: 'Say hello.' }],
      (c) => chunks.push(c),
    );

    expect(text).toBe('Hello!');
    expect(chunks).toEqual(['Hello', '!']);
  });

  it('generates the per-install user id once and reuses it', () => {
    settings.set('pingServerUserId', '');
    const first = getOrCreateUserId();
    expect(first.length).toBeGreaterThan(10);
    expect(settings.get<string>('pingServerUserId')).toBe(first);
    expect(getOrCreateUserId()).toBe(first);
  });

  it('is disabled by default; enabled only with the flag and an endpoint', () => {
    expect(isPingServerEnabled()).toBe(true);
    settings.set('pingServerEnabled', false);
    expect(isPingServerEnabled()).toBe(false);
    settings.set('pingServerEnabled', true);
    settings.set('pingServerEndpoint', '   ');
    expect(isPingServerEnabled()).toBe(false);
  });

  it('turns a 429 into a PingRateLimitError with the next refill time', async () => {
    const reset = Math.floor(Date.UTC(2026, 10, 7, 9, 31) / 1000);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'rate limit exceeded: out of SP',
          limit: 200,
          remaining: 0,
          reset,
          reset_in_seconds: 3 * 3600 + 12 * 60,
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );

    const errors: string[] = [];
    await expect(
      chatPing([{ role: 'user', content: 'hi' }], undefined, undefined, (e) => errors.push(e)),
    ).rejects.toBeInstanceOf(PingRateLimitError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('out of SP');
    expect(errors[0]).toContain('Resets 09:31 UTC (in 3h 12m)');
    expect(getLastQuota()).toMatchObject({ limit: 200, remaining: 0, reset });
  });

  it('reports a non-429 HTTP error once and throws', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'unauthorized: missing or wrong x-lucid-ping-key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const errors: string[] = [];
    await expect(
      chatPing([{ role: 'user', content: 'hi' }], undefined, undefined, (e) => errors.push(e)),
    ).rejects.toThrow('Ping server error (401)');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('401');
  });

  it('health returns the quota block and records it', async () => {
    const fetchMock = vi.mocked(fetch);
    const reset = Math.floor(Date.UTC(2026, 10, 7) / 1000);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          service: 'lucid-ping-server',
          model: '@cf/meta/llama-3.2-1b-instruct',
          mode: 'live',
          quota: { limit: 200, remaining: 88, reset, reset_in_seconds: 3600 },
          echo: { message: 'ping' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const health = await pingServerHealth();
    expect(health.ok).toBe(true);
    expect(health.quota).toMatchObject({ limit: 200, remaining: 88 });
    expect(getLastQuota()).toMatchObject({ remaining: 88 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}/ping`);
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe('test-user-1');
  });

  it('cancel aborts the in-flight fetch and resolves empty', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });
    const { cancelPingStream } = await import('../electron/services/pingServer');
    const pending = chatPing([{ role: 'user', content: 'hi' }]);
    cancelPingStream();
    await expect(pending).resolves.toBe('');
  });

  it('formats the reset time as UTC clock + time remaining', () => {
    expect(
      formatResetTime({ limit: 200, remaining: 0, reset: Math.floor(Date.UTC(2026, 10, 7, 9, 31) / 1000), reset_in_seconds: 3 * 3600 + 12 * 60 }),
    ).toBe('Resets 09:31 UTC (in 3h 12m)');
    expect(
      formatResetTime({ limit: 200, remaining: 0, reset: Math.floor(Date.UTC(2026, 10, 7, 14, 30) / 1000), reset_in_seconds: 45 * 60 }),
    ).toBe('Resets 14:30 UTC (in 45m)');
  });
});

describe('activateTemp — register a temp for the daily grab', () => {
  const ACTIVATED = {
    ok: true,
    id: 'profile-11111111-1111-4111-8111-111111111111',
    activationTick: 123456,
    verificationState: 'pending',
    windowEnd: '2026-11-17T00:00:00.000Z',
    referralId: null,
    resumed: false,
  };

  function activatedResponse(body: Record<string, unknown> = ACTIVATED, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('posts to {endpoint}/temp/activate with pingHeaders and body {id, referralId: null}', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(activatedResponse());
    const result = await activateTemp(
      'profile-11111111-1111-4111-8111-111111111111',
    );
    // The server's full body comes back (ok/id/referralId included);
    // the fields the client uses are the four below.
    expect(result).toMatchObject({
      activationTick: 123456,
      verificationState: 'pending',
      windowEnd: '2026-11-17T00:00:00.000Z',
      resumed: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}/temp/activate`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    // Fix 1 (2026-11-17): activateTemp sends the TEMP'S OWN
    // profile id as x-lucid-user — the server binds the temp
    // record's owner to it, and the grab marks that owner's
    // bucket verified. The old per-install id orphaned the
    // grant on a bucket no profile owned.
    expect(headers['x-lucid-user']).toBe(
      'profile-11111111-1111-4111-8111-111111111111',
    );
    expect(headers['x-lucid-ping-key']).toBe('test-secret');
    expect(JSON.parse(String(init.body))).toEqual({
      id: 'profile-11111111-1111-4111-8111-111111111111',
      referralId: null,
    });
  });

  it('sends the referral through when one was captured', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(activatedResponse({ ...ACTIVATED, referralId: 'profile-22222222-2222-4222-8222-222222222222' }));
    await activateTemp(
      'profile-11111111-1111-4111-8111-111111111111',
      'profile-22222222-2222-4222-8222-222222222222',
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      id: 'profile-11111111-1111-4111-8111-111111111111',
      referralId: 'profile-22222222-2222-4222-8222-222222222222',
    });
  });

  it('sends no x-lucid-ping-key header when no key is set', async () => {
    pingKeyStorage.deletePingKey();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(activatedResponse());
    await activateTemp('profile-11111111-1111-4111-8111-111111111111');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    // Fix 1: the profile id, not the install id.
    expect(headers['x-lucid-user']).toBe(
      'profile-11111111-1111-4111-8111-111111111111',
    );
    expect(headers).not.toHaveProperty('x-lucid-ping-key');
  });

  it('throws on 400 (bad id) and 401 (bad key) with no retry', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'id must start with profile-' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(activateTemp('bad-id')).rejects.toThrow(
      'Temp activation failed (400)',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      activateTemp('profile-11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Temp activation failed (401)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on 500 and returns the resumed result', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'enqueue failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        activatedResponse({ ...ACTIVATED, resumed: true }),
      );
    const result = await activateTemp(
      'profile-11111111-1111-4111-8111-111111111111',
    );
    expect(result.resumed).toBe(true);
    expect(result.activationTick).toBe(123456);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry posts the same body to the same URL.
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe(`${ENDPOINT}/temp/activate`);
    expect(JSON.parse(String(init2.body))).toEqual({
      id: 'profile-11111111-1111-4111-8111-111111111111',
      referralId: null,
    });
  });

  it('throws after the second 500 — exactly two attempts', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'enqueue failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      activateTemp('profile-11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Temp activation failed (500)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('per-profile x-lucid-user (Fix 1, 2026-11-17)', () => {
  const GENESIS_ID = 'profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const GUEST_ID = 'profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('chatPing sends the active profile id when one is passed', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));
    await chatPing(
      [{ role: 'user', content: 'Hi.' }],
      undefined,
      undefined,
      undefined,
      undefined,
      GENESIS_ID,
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe(GENESIS_ID);
  });

  it('chatPing sends a guest profile id too — Guest gets its own bucket, not Genesis’s', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));
    await chatPing(
      [{ role: 'user', content: 'Hi.' }],
      undefined,
      undefined,
      undefined,
      undefined,
      GUEST_ID,
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe(GUEST_ID);
    expect((init.headers as Record<string, string>)['x-lucid-user']).not.toBe(GENESIS_ID);
  });

  it('chatPing without a profile id falls back to the install id (old callers keep working)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));
    await chatPing([{ role: 'user', content: 'Hi.' }]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe('test-user-1');
  });

  it('chatPing with an invalid profile id falls back to the install id instead of sending junk', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(sseResponse(SSE_PINGBACK, 200, QUOTA_HEADERS));
    await chatPing(
      [{ role: 'user', content: 'Hi.' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'bad id with spaces',
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe('test-user-1');
  });

  it('pingServerHealth sends the active profile id when one is passed', async () => {
    const fetchMock = vi.mocked(fetch);
    const reset = Math.floor(Date.UTC(2026, 10, 7) / 1000);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          quota: { limit: 200, remaining: 88, reset, reset_in_seconds: 3600 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await pingServerHealth(GENESIS_ID);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-lucid-user']).toBe(GENESIS_ID);
  });
});

describe('ensureDefaultPingKey (Fix 2, 2026-11-17)', () => {
  // Fresh module instances per test: the register-attempt flag is
  // module-level (one attempt per process), so each test gets its
  // own pingServer + secureStorage via resetModules + dynamic import.
  const CLOUD_ENDPOINT = 'https://lucid-ping-server.admension.workers.dev';

  async function freshModules() {
    vi.resetModules();
    const pingServer = await import('../electron/services/pingServer');
    const secure = await import('../electron/services/secureStorage');
    return { pingServer, secure };
  }

  it('does nothing for a non-cloud endpoint (local dev keeps manual entry)', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', 'http://127.0.0.1:8787');
    secure.settings.set('pingServerUserId', 'test-install-id');
    const fetchMock = vi.fn();
    const ok = await pingServer.ensureDefaultPingKey(fetchMock);
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(secure.pingKeyStorage.hasPingKey()).toBe(false);
  });

  it('does nothing when a key is already stored', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');
    secure.pingKeyStorage.setPingKey('dummy-already-stored-key');
    const fetchMock = vi.fn();
    const ok = await pingServer.ensureDefaultPingKey(fetchMock);
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(secure.pingKeyStorage.getPingKey()).toBe('dummy-already-stored-key');
  });

  it('provisions a per-install key from the cloud /register endpoint and stores it', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, key: 'dummy-provisioned-key' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const ok = await pingServer.ensureDefaultPingKey(fetchMock);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CLOUD_ENDPOINT}/register`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ userId: 'test-install-id' });
    expect(secure.pingKeyStorage.getPingKey()).toBe('dummy-provisioned-key');
  });

  it('returns false and stores nothing when the endpoint does not exist yet (404 today)', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );
    const ok = await pingServer.ensureDefaultPingKey(fetchMock);
    expect(ok).toBe(false);
    expect(secure.pingKeyStorage.hasPingKey()).toBe(false);
  });

  it('returns false and stores nothing on a bad body (ok:false, missing key)', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');

    const badBody = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await pingServer.ensureDefaultPingKey(badBody)).toBe(false);
    expect(secure.pingKeyStorage.hasPingKey()).toBe(false);
  });

  it('returns false and stores nothing when the register call throws (network failure)', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');

    const failingFetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await pingServer.ensureDefaultPingKey(failingFetch)).toBe(false);
    expect(secure.pingKeyStorage.hasPingKey()).toBe(false);
  });

  it('tries the register call at most once per process', async () => {
    const { pingServer, secure } = await freshModules();
    secure.settings.set('pingServerEndpoint', CLOUD_ENDPOINT);
    secure.settings.set('pingServerUserId', 'test-install-id');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );
    expect(await pingServer.ensureDefaultPingKey(fetchMock)).toBe(false);
    expect(await pingServer.ensureDefaultPingKey(fetchMock)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
