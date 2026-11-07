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
