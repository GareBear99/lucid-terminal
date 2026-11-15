/**
 * The Copilot IPC handlers (D9, 2026-11-15) — the main-process
 * handlers the copilot tab talks to. The key never leaves main:
 * the handlers read it from the OS keychain and pass it to the
 * client; the renderer never sees it.
 *
 * The keychain is mocked (vi.mock) — no electron, no keychain
 * here. The network is the stubbed global fetch. The tests pin
 * the two contracts: no request ever fires without the key,
 * and a handler never throws out of IPC (a failure comes back
 * as {ok: false, code, message}).
 *
 * Run with: npx vitest run tests/copilotIpc.test.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { setupCopilotHandlers } from '../electron/ipc/copilot';
import {
  clearCopilotModelsCache,
  clearCopilotTokenCache,
} from '../electron/services/copilotClient';

const keyHolder = vi.hoisted(() => ({ key: null as string | null }));

vi.mock('../electron/services/secureStorage', () => ({
  copilotApiKeyStorage: {
    getCopilotApiKey: () => keyHolder.key,
  },
}));

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function sseBody(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let delivered = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (delivered) {
        controller.close();
        return;
      }
      delivered = true;
      controller.enqueue(bytes);
    },
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const raw = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } as Headers,
    json: async () => JSON.parse(raw),
    text: async () => raw,
    body: null,
  } as unknown as Response;
}

function sseResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as Headers,
    json: async () => {
      throw new Error('not json');
    },
    text: async () => body,
    body: sseBody(body),
  } as unknown as Response;
}

const TOKEN_BODY = {
  token: 'ghu_copilot_token',
  expires_at: 1800000000,
  refresh_in: 1500,
  endpoints: { api: 'https://api.githubcopilot.com' },
};

describe('copilotIpc — the Copilot IPC handlers', () => {
  let handlers: Record<string, (...args: unknown[]) => Promise<unknown>>;
  let listeners: Record<string, (...args: unknown[]) => void>;
  let fetchImpl: ReturnType<typeof vi.fn<FetchFn>>;
  let prevFetch: typeof fetch | undefined;
  let senderSend: ReturnType<typeof vi.fn>;

  function fakeEvent() {
    return { sender: { send: senderSend } };
  }

  beforeEach(() => {
    clearCopilotTokenCache();
    clearCopilotModelsCache();
    keyHolder.key = 'gho_test_key';
    handlers = {};
    listeners = {};
    senderSend = vi.fn();
    fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      if (url.includes('/models')) {
        return jsonResponse(200, { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] });
      }
      return sseResponse(
        200,
        'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
    });
    prevFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    const ipcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        handlers[channel] = handler;
      },
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        listeners[channel] = handler;
      },
    };
    setupCopilotHandlers(ipcMain as unknown as Parameters<typeof setupCopilotHandlers>[0]);
  });

  afterEach(() => {
    globalThis.fetch = prevFetch as typeof fetch;
    keyHolder.key = null;
  });

  it('listModels without a key answers no-key and never touches the network', async () => {
    keyHolder.key = null;
    const result = (await handlers['copilot:listModels']()) as { ok: boolean; code?: string };
    expect(result).toEqual({ ok: false, code: 'no-key', message: expect.any(String) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('chatCompletions without a key answers no-key and never touches the network', async () => {
    keyHolder.key = null;
    const result = (await handlers['copilot:chatCompletions'](fakeEvent(), {
      requestId: 'req-1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })) as { ok: boolean; code?: string };
    expect(result).toEqual({ ok: false, code: 'no-key', message: expect.any(String) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('listModels with a key returns the API\'s list', async () => {
    const result = (await handlers['copilot:listModels']()) as { ok: boolean; models?: string[] };
    expect(result).toEqual({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] });
  });

  it('chatCompletions streams deltas to the sender and returns the finished result', async () => {
    const result = (await handlers['copilot:chatCompletions'](fakeEvent(), {
      requestId: 'req-2',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })) as { ok: boolean; content?: string; model?: string };
    expect(result).toEqual({ ok: true, content: 'hello', toolCalls: [], model: 'gpt-4o' });
    expect(senderSend).toHaveBeenCalledWith('copilot:chat-delta', {
      requestId: 'req-2',
      text: 'hello',
    });
  });

  it('an auth failure comes back as {ok: false, code: auth}, never a throw', async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(401, { message: 'Bad credentials' }));
    const result = (await handlers['copilot:listModels']()) as { ok: boolean; code?: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe('auth');
  });

  it('a network failure comes back as {ok: false, code: network}, never a throw', async () => {
    fetchImpl.mockImplementation(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = (await handlers['copilot:listModels']()) as { ok: boolean; code?: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe('network');
  });

  it('the abort channel stops an in-flight chat', async () => {
    fetchImpl.mockImplementation(async (url, init) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError')),
        );
      });
    });
    const promise = handlers['copilot:chatCompletions'](fakeEvent(), {
      requestId: 'req-9',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    }) as Promise<{ ok: boolean; code?: string }>;
    // Let the exchange finish and the chat fetch start.
    await new Promise((r) => setTimeout(r, 0));
    listeners['copilot:chat-abort']({}, 'req-9');
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.code).toBe('aborted');
  });
});
