/**
 * The GitHub Copilot API client (D9, 2026-11-15) — the token
 * exchange, the chat completions call, the model list.
 *
 * The client is functional and pure: the key is passed in by
 * the IPC layer (it never reads the keychain itself), fetch is
 * injectable, and every failure is a thrown CopilotApiError
 * with a typed code — never a silent empty result, never a raw
 * fetch error. The tests pin the flow as researched from the
 * public docs:
 * - the exchange is GET api.github.com/copilot_internal/v2/token
 *   with `Authorization: token <github-token>`, and returns a
 *   short-lived Copilot token + the API host;
 * - chat is POST <api-host>/chat/completions with
 *   `Authorization: Bearer <copilot-token>`, SSE streaming;
 * - the model list is GET <api-host>/models with the Copilot
 *   token — the roster comes from the API, never hardcoded.
 *
 * The token and models caches are module-level (main-process
 * memory only) — every test clears them first, or one test's
 * cached token would answer the next test's fetch.
 *
 * Run with: npx vitest run tests/copilotClient.test.ts
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  chatCopilotCompletions,
  clearCopilotModelsCache,
  clearCopilotTokenCache,
  CopilotApiError,
  exchangeCopilotToken,
  listCopilotModels,
} from '../electron/services/copilotClient';

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

function sseResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } as Headers,
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

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

describe('copilotClient — the Copilot API flow', () => {
  beforeEach(() => {
    clearCopilotTokenCache();
    clearCopilotModelsCache();
  });

  it('exchanges the GitHub token for a Copilot token, and caches it', async () => {
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      return jsonResponse(404, { message: 'not found' });
    });
    const first = await exchangeCopilotToken('gho_test_key', fetchImpl);
    const second = await exchangeCopilotToken('gho_test_key', fetchImpl);
    expect(first.token).toBe('ghu_copilot_token');
    expect(first.apiBase).toBe('https://api.githubcopilot.com');
    expect(second).toBe(first);
    // One exchange for both calls — the token is cached in main
    // memory, never persisted, never re-fetched per call.
    const exchangeCalls = fetchImpl.mock.calls.filter(([url]) =>
      url.includes('/copilot_internal/v2/token'),
    );
    expect(exchangeCalls).toHaveLength(1);
    const [url, init] = exchangeCalls[0];
    expect(url).toBe('https://api.github.com/copilot_internal/v2/token');
    expect(init?.headers).toMatchObject({ Authorization: 'token gho_test_key' });
  });

  it('lists the models the API offers — the roster is the API\'s, never hardcoded', async () => {
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      if (url.includes('/models')) {
        return jsonResponse(200, {
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'claude-3.5-sonnet', object: 'model' },
          ],
        });
      }
      return jsonResponse(404, { message: 'not found' });
    });
    const models = await listCopilotModels('gho_test_key', fetchImpl);
    expect(models).toEqual(['gpt-4o', 'claude-3.5-sonnet']);
  });

  it('streams content deltas and accumulates tool calls split across chunks', async () => {
    const sse = [
      'data: {"choices":[{"index":0,"delta":{"content":"Listing "},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{"content":"files."},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"ls","arguments":""}}]},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\": \\".\\"}"}}]},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      return sseResponse(200, sse);
    });
    const deltas: string[] = [];
    const result = await chatCopilotCompletions({
      githubToken: 'gho_test_key',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'list the files' }],
      tools: [],
      fetchFn: fetchImpl,
      onDelta: (text) => deltas.push(text),
    });
    expect(result).toEqual({
      content: 'Listing files.',
      toolCalls: [{ id: 'call_1', name: 'ls', arguments: '{"path": "."}' }],
      model: 'gpt-4o',
    });
    expect(deltas).toEqual(['Listing ', 'files.']);
  });

  it('a 401 from chat re-exchanges once and retries', async () => {
    const sse = 'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    let chatCalls = 0;
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      chatCalls += 1;
      if (chatCalls === 1) return jsonResponse(401, { message: 'unauthorized' });
      return sseResponse(200, sse);
    });
    const result = await chatCopilotCompletions({
      githubToken: 'gho_test_key',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      fetchFn: fetchImpl,
    });
    expect(result.content).toBe('ok');
    expect(chatCalls).toBe(2);
    const exchangeCalls = fetchImpl.mock.calls.filter(([url]) =>
      url.includes('/copilot_internal/v2/token'),
    );
    expect(exchangeCalls).toHaveLength(2);
  });

  it('a 401 from the exchange is an auth failure, and it names the classic-PAT trap', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse(401, { message: 'Bad credentials' }));
    const error = await catchError(exchangeCopilotToken('gho_test_key', fetchImpl));
    expect(error).toBeInstanceOf(CopilotApiError);
    expect((error as CopilotApiError).code).toBe('auth');
    expect((error as CopilotApiError).message).toContain('ghp_');
  });

  it('a 429 carries the Retry-After value', async () => {
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      return jsonResponse(429, { message: 'rate limited' }, { 'retry-after': '120' });
    });
    const error = await catchError(
      chatCopilotCompletions({
        githubToken: 'gho_test_key',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        fetchFn: fetchImpl,
      }),
    );
    expect(error).toBeInstanceOf(CopilotApiError);
    expect((error as CopilotApiError).code).toBe('rate-limited');
    expect((error as CopilotApiError).retryAfterSeconds).toBe(120);
  });

  it('a network failure is a typed error, never a raw fetch throw', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const error = await catchError(exchangeCopilotToken('gho_test_key', fetchImpl));
    expect(error).toBeInstanceOf(CopilotApiError);
    expect((error as CopilotApiError).code).toBe('network');
  });

  it('an aborted chat reports aborted', async () => {
    const fetchImpl = vi.fn<FetchFn>(async (url, init) => {
      if (url.includes('/copilot_internal/v2/token')) return jsonResponse(200, TOKEN_BODY);
      return new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('The operation was aborted', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError')),
        );
      });
    });
    const controller = new AbortController();
    const promise = chatCopilotCompletions({
      githubToken: 'gho_test_key',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      fetchFn: fetchImpl,
      signal: controller.signal,
    });
    // Let the exchange finish and the chat fetch start, then stop it.
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    const error = await catchError(promise);
    expect(error).toBeInstanceOf(CopilotApiError);
    expect((error as CopilotApiError).code).toBe('aborted');
  });
});
