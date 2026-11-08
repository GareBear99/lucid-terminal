/**
 * AI chat route tests — `resolveChatRoute` in `electron/ipc/ai.ts`,
 * the single decision for which route answers one reply.
 *
 * The rule under test (Gary's design, 2026-11-06): an explicit
 * per-chat model (the header dropdown) is authoritative WHEN its
 * route can answer — a local choice needs a loaded local model, an
 * OpenAI choice needs a key, a ping choice needs ping enabled. When
 * the chosen route cannot answer, the choice falls through to
 * today's fixed cascade (ping → local → OpenAI) instead of erroring,
 * so the user still gets a reply from another route. No choice
 * (Auto) IS the cascade, re-decided per reply, exactly as today.
 *
 * The service modules are stubbed — this tests only the pure
 * routing decision, not the routes themselves.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {},
}));

vi.mock('../electron/services/openai', () => ({
  chat: vi.fn(),
  cancelStream: vi.fn(),
  hasApiKey: vi.fn(() => false),
}));

vi.mock('../electron/services/pingServer', () => {
  class PingRateLimitError extends Error {
    quota: unknown;
    constructor(message: string, quota: unknown) {
      super(message);
      this.name = 'PingRateLimitError';
      this.quota = quota;
    }
  }
  return {
    chatPing: vi.fn(),
    cancelPingStream: vi.fn(),
    pingServerHealth: vi.fn(),
    isPingServerEnabled: vi.fn(() => false),
    PingRateLimitError,
  };
});

vi.mock('../electron/services/local_ai', () => ({
  chatLocal: vi.fn(),
  checkLocalBackendHealth: vi.fn(),
  cancelLocalChat: vi.fn(),
  chatLocalWithBrowserTools: vi.fn(),
}));

vi.mock('../electron/services/historyManager', () => ({
  historyManager: { getSessions: vi.fn(), saveSession: vi.fn(), deleteSession: vi.fn(), clearSessions: vi.fn() },
}));

vi.mock('../electron/ipc/lucidWorkflow', () => ({
  isAnyModelAvailable: vi.fn(),
}));

import { resolveChatRoute } from '../electron/ipc/ai';
import { setupAIHandlers } from '../electron/ipc/ai';
import { chatPing, isPingServerEnabled, PingRateLimitError } from '../electron/services/pingServer';
import { chat, hasApiKey } from '../electron/services/openai';

describe('resolveChatRoute — Auto is the cascade, re-decided per reply', () => {
  it('ping wins while enabled', () => {
    expect(resolveChatRoute({ pingEnabled: true, localAvailable: true, hasApiKey: true })).toEqual({
      route: 'ping',
    });
  });

  it('local wins when ping is off and a model is loaded', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: true, hasApiKey: true })).toEqual({
      route: 'local',
    });
  });

  it('OpenAI wins when ping is off and no local model is loaded', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: false, hasApiKey: true })).toEqual({
      route: 'openai',
    });
  });

  it('none when nothing can answer', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: false, hasApiKey: false })).toEqual({
      route: 'none',
    });
  });
});

describe('resolveChatRoute — an explicit model is authoritative when its route can answer', () => {
  it('a local choice routes local with that model', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'local', model: 'tinyllama' });
  });

  it('an OpenAI choice routes OpenAI with that model', () => {
    expect(
      resolveChatRoute({ model: 'gpt-4-turbo', modelSource: 'openai', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'openai', model: 'gpt-4-turbo' });
  });

  it('a ping choice routes ping while ping is enabled, carrying the model', () => {
    expect(
      resolveChatRoute({ model: '@cf/meta/llama-3.2-1b-instruct', modelSource: 'ping', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'ping', model: '@cf/meta/llama-3.2-1b-instruct' });
  });

  it('a ping choice with no model (Auto) routes ping with no model — the default applies', () => {
    expect(
      resolveChatRoute({ modelSource: 'ping', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'ping', model: undefined });
  });
});

describe('resolveChatRoute — an unavailable choice falls through to the cascade, not an error', () => {
  it('a local choice with no local model falls back to ping when enabled', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: true, localAvailable: false, hasApiKey: true }),
    ).toEqual({ route: 'ping' });
  });

  it('a local choice with no local model and ping off falls back to OpenAI when a key is set', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: false, localAvailable: false, hasApiKey: true }),
    ).toEqual({ route: 'openai' });
  });

  it('an OpenAI choice with no key falls back to local when a model is loaded', () => {
    expect(
      resolveChatRoute({ model: 'gpt-4', modelSource: 'openai', pingEnabled: false, localAvailable: true, hasApiKey: false }),
    ).toEqual({ route: 'local' });
  });

  it('a ping choice with ping off falls back to local when a model is loaded', () => {
    expect(
      resolveChatRoute({ model: '@cf/meta/llama-3.2-1b-instruct', modelSource: 'ping', pingEnabled: false, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'local' });
  });

  it('an unavailable choice with nothing else available is none, not a crash', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: false, localAvailable: false, hasApiKey: false }),
    ).toEqual({ route: 'none' });
  });
});

describe('ai:chat — second fallback after a ping error (Gary, 2026-11-08)', () => {
  // The handler under test: setupAIHandlers registers 'ai:chat' on the
  // mocked ipcMain; the services are the stubs above. The rule under
  // test: a ping error falls through ONCE more (OpenAI, key only,
  // server-side) — never to local (user-side CPU = NONE), never past
  // a 429 (the SP gate is terminal), never after a partial reply
  // already streamed (no Franken-reply from two models).
  const fakeIpcMain = { handle: vi.fn(), on: vi.fn() };
  const fakeSender = () => ({ send: vi.fn(), isDestroyed: () => false });
  const getChatHandler = () => {
    const calls = fakeIpcMain.handle.mock.calls.filter((c) => c[0] === 'ai:chat');
    const last = calls[calls.length - 1];
    return last[1] as (
      event: unknown,
      messages: unknown[],
      contextDirectory?: string,
      stream?: boolean,
      options?: unknown,
    ) => Promise<string>;
  };
  const MESSAGES = [{ role: 'user', content: 'What is Lucid?' }];

  beforeEach(() => {
    vi.clearAllMocks();
    setupAIHandlers(fakeIpcMain as never);
    vi.mocked(isPingServerEnabled).mockReturnValue(true);
  });

  it('ping 401 + key -> OpenAI answers, no error event shown', async () => {
    vi.mocked(hasApiKey).mockReturnValue(true);
    vi.mocked(chatPing).mockRejectedValueOnce(
      new Error('Ping server error (401): {"ok": false, "error": "unauthorized: missing or wrong x-lucid-ping-key"}'),
    );
    vi.mocked(chat).mockImplementationOnce((_msgs, _dir, onStream, onEnd) => {
      (onStream as ((c: string) => void) | undefined)?.('openai reply');
      (onEnd as (() => void) | undefined)?.();
      return Promise.resolve('openai reply');
    });
    const sender = fakeSender();
    const result = await getChatHandler()({ sender }, MESSAGES, undefined, true, {});
    expect(result).toBe('openai reply');
    expect(sender.send).not.toHaveBeenCalledWith('ai:streamError', expect.anything());
    expect(sender.send).toHaveBeenCalledWith('ai:stream', 'openai reply');
    expect(sender.send).toHaveBeenCalledWith('ai:streamEnd');
  });

  it('ping 429 is terminal even with a key — OpenAI is never called', async () => {
    vi.mocked(hasApiKey).mockReturnValue(true);
    vi.mocked(chatPing).mockRejectedValueOnce(
      new PingRateLimitError('Ping server out of SP (0/200 left). Resets 09:31 UTC (in 3h 12m).', {
        limit: 200,
        remaining: 0,
        reset: 0,
        reset_in_seconds: 0,
      }),
    );
    const sender = fakeSender();
    const result = await getChatHandler()({ sender }, MESSAGES, undefined, true, {});
    expect(result).toContain('out of SP');
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
    const errors = sender.send.mock.calls.filter((c) => c[0] === 'ai:streamError');
    expect(errors).toHaveLength(1);
  });

  it('ping 401 + no key -> one honest error, OpenAI never called', async () => {
    vi.mocked(hasApiKey).mockReturnValue(false);
    vi.mocked(chatPing).mockRejectedValueOnce(new Error('Ping server error (401): unauthorized'));
    const sender = fakeSender();
    const result = await getChatHandler()({ sender }, MESSAGES, undefined, true, {});
    expect(result).toContain('401');
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
    const errors = sender.send.mock.calls.filter((c) => c[0] === 'ai:streamError');
    expect(errors).toHaveLength(1);
  });

  it('partial ping reply already streamed -> no fallback, no Franken-reply', async () => {
    vi.mocked(hasApiKey).mockReturnValue(true);
    vi.mocked(chatPing).mockImplementationOnce((_msgs, onStream) => {
      (onStream as ((c: string) => void) | undefined)?.('partial');
      return Promise.reject(new Error('Ping server error (500): boom'));
    });
    const sender = fakeSender();
    const result = await getChatHandler()({ sender }, MESSAGES, undefined, true, {});
    expect(result).toContain('500');
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith('ai:stream', 'partial');
    const errors = sender.send.mock.calls.filter((c) => c[0] === 'ai:streamError');
    expect(errors).toHaveLength(1);
  });

  it('ping success -> no fallback, OpenAI never called', async () => {
    vi.mocked(chatPing).mockImplementationOnce((_msgs, onStream, onEnd) => {
      (onStream as ((c: string) => void) | undefined)?.('ping reply');
      (onEnd as ((q: unknown) => void) | undefined)?.(null);
      return Promise.resolve('ping reply');
    });
    const sender = fakeSender();
    const result = await getChatHandler()({ sender }, MESSAGES, undefined, true, {});
    expect(result).toBe('ping reply');
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalledWith('ai:streamError', expect.anything());
  });
});
