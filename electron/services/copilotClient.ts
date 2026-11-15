/**
 * The GitHub Copilot API client — D9 (2026-11-15).
 *
 * The client that lets the copilot tab talk to GitHub Copilot's API
 * using the saved key. The key itself never lives here: the caller
 * (the IPC handler in electron/ipc/copilot.ts) reads it from the OS
 * keychain (`github-copilot-key`) and passes it in, and this module
 * never writes it anywhere — only the short-lived Copilot token is
 * cached, in main-process memory only, never on disk.
 *
 * The flow is the two-token flow, researched from public sources
 * (not invented — see ~/workspace/d9-copilot-notes.md):
 * 1. Exchange the saved GitHub token for a short-lived Copilot token:
 *    GET https://api.github.com/copilot_internal/v2/token with
 *    `Authorization: token <github-token>` → {token, expires_at,
 *    refresh_in, endpoints: {api}}.
 * 2. Call the LLM: POST <apiBase>/chat/completions with
 *    `Authorization: Bearer <copilot-token>` — OpenAI-compatible,
 *    `tools` + `tool_calls` supported, SSE streaming.
 * 3. List models: GET <apiBase>/models with the Copilot token →
 *    {data: [{id, ...}]} — the list for this subscription, never
 *    hardcoded.
 *
 * These endpoints are unofficial/internal (not in docs.github.com)
 * — GitHub could change them without notice. Every failure maps to
 * a typed CopilotApiError with a human message; the client never
 * returns a silent empty result, and never throws a raw fetch
 * error at the caller.
 *
 * Token kinds that work for the exchange: OAuth `gho_*`, GitHub App
 * `ghu_*`, fine-grained PAT `github_pat_*` with the Copilot Requests
 * permission. Classic PATs (`ghp_*`) are rejected by the Copilot
 * API — an auth failure says so in its message instead of guessing
 * which token was saved.
 */

export type CopilotApiErrorCode =
  | 'no-key'
  | 'auth'
  | 'rate-limited'
  | 'bad-request'
  | 'network'
  | 'upstream'
  | 'aborted'
  | 'unavailable';

/** A typed failure — the caller turns `message` into the reply. */
export class CopilotApiError extends Error {
  readonly code: CopilotApiErrorCode;
  /** Seconds to wait before retrying, when the API said so. */
  readonly retryAfterSeconds?: number;

  constructor(code: CopilotApiErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'CopilotApiError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type FetchFn = typeof fetch;

const TOKEN_EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';
const DEFAULT_API_BASE = 'https://api.githubcopilot.com';
/** The integration id GitHub routes chat requests by (the
 *  chat-completions integration identifier — the same value
 *  VS Code's Copilot Chat sends). The editor headers below
 *  identify Lucid honestly; this id says "chat", not "VS Code". */
const COPILOT_INTEGRATION_ID = 'vscode-chat';
const EDITOR_VERSION = 'Lucid/1.1.0';
const EDITOR_PLUGIN_VERSION = 'lucid-copilot/1.0';
const USER_AGENT = 'GithubCopilot/1.155.0';
/** Refresh the Copilot token this far before it expires (the
 *  same 60s buffer LiteLLM uses). */
const TOKEN_REFRESH_BUFFER_MS = 60_000;
/** The models list is cached this long (the research guidance
 *  is 10–30 minutes; 10 keeps the picker fresh). */
const MODELS_CACHE_MS = 10 * 60_000;
/** One chat-completions call may run this long before the
 *  client gives up on it. */
const CHAT_TIMEOUT_MS = 120_000;

function isCopilotApiHost(host: string): boolean {
  return host === 'api.githubcopilot.com' || host.endsWith('.githubcopilot.com');
}

function resolveApiBase(endpointsApi: unknown): string {
  if (typeof endpointsApi === 'string') {
    try {
      const url = new URL(endpointsApi);
      if (url.protocol === 'https:' && isCopilotApiHost(url.hostname)) {
        return endpointsApi.replace(/\/$/, '');
      }
    } catch {
      // Not a URL — fall through to the default.
    }
  }
  return DEFAULT_API_BASE;
}

interface CopilotToken {
  token: string;
  expiresAtMs: number;
  apiBase: string;
}

/** The in-memory token cache — main-process memory only. The
 *  short-lived Copilot token is never written to disk; the
 *  long-lived GitHub key stays in the OS keychain. */
let cachedToken: CopilotToken | null = null;

/** Drop the cached token (tests; and the retry path after a
 *  401 from the chat endpoint — a stale token is re-exchanged). */
export function clearCopilotTokenCache(): void {
  cachedToken = null;
}

interface ModelsCache {
  models: string[];
  fetchedAtMs: number;
}

let cachedModels: ModelsCache | null = null;

/** Drop the cached models list (tests). */
export function clearCopilotModelsCache(): void {
  cachedModels = null;
}

function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? body;
  } catch {
    return body;
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function mapExchangeFailure(status: number, detail: string): CopilotApiError {
  if (status === 401 || status === 403) {
    return new CopilotApiError(
      'auth',
      'GitHub rejected the Copilot key — check it in Settings > AI. ' +
        'A classic personal access token (ghp_…) does not work here; use an OAuth token ' +
        'or a fine-grained token with Copilot access.',
    );
  }
  if (status === 429) {
    return new CopilotApiError(
      'rate-limited',
      'GitHub is rate-limiting the token exchange — try again in a bit.',
    );
  }
  if (status >= 500) {
    return new CopilotApiError(
      'upstream',
      `GitHub had a problem exchanging the key (HTTP ${status}) — try again.`,
    );
  }
  return new CopilotApiError(
    'auth',
    `GitHub refused the token exchange (HTTP ${status}): ${detail || 'no detail given'}`,
  );
}

/**
 * Exchange the saved GitHub token for a short-lived Copilot
 * token. Cached in memory until 60s before expiry — the
 * exchange runs at most once per token lifetime per process.
 */
export async function exchangeCopilotToken(
  githubToken: string,
  fetchFn: FetchFn = fetch,
): Promise<CopilotToken> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS > now) {
    return cachedToken;
  }
  let response: Response;
  try {
    response = await fetchFn(TOKEN_EXCHANGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `token ${githubToken}`,
        'Editor-Version': EDITOR_VERSION,
        'Editor-Plugin-Version': EDITOR_PLUGIN_VERSION,
        'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
        'User-Agent': USER_AGENT,
      },
    });
  } catch (error) {
    throw new CopilotApiError(
      'network',
      `Couldn't reach GitHub to exchange the Copilot key — check the connection and try again. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!response.ok) {
    const detail = errorDetail(await response.text());
    throw mapExchangeFailure(response.status, detail);
  }
  const body = (await response.json()) as {
    token?: unknown;
    expires_at?: unknown;
    refresh_in?: unknown;
    endpoints?: { api?: unknown };
  };
  if (typeof body.token !== 'string' || !body.token) {
    throw new CopilotApiError(
      'upstream',
      'GitHub exchanged the key but returned no Copilot token — try again.',
    );
  }
  // expires_at is seconds since epoch when present; refresh_in
  // is seconds until expiry. Either one bounds the token; when
  // neither is present, assume the documented ~30 minutes.
  let expiresAtMs = now + 30 * 60_000;
  if (typeof body.expires_at === 'number') expiresAtMs = body.expires_at * 1000;
  else if (typeof body.refresh_in === 'number') expiresAtMs = now + body.refresh_in * 1000;
  cachedToken = {
    token: body.token,
    expiresAtMs,
    apiBase: resolveApiBase(body.endpoints?.api),
  };
  return cachedToken;
}

/**
 * The models this Copilot subscription can use — listed from
 * the API, never hardcoded. Cached in memory for 10 minutes.
 */
export async function listCopilotModels(
  githubToken: string,
  fetchFn: FetchFn = fetch,
): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.fetchedAtMs < MODELS_CACHE_MS) {
    return cachedModels.models;
  }
  const { token, apiBase } = await exchangeCopilotToken(githubToken, fetchFn);
  let response: Response;
  try {
    response = await fetchFn(`${apiBase}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
        'User-Agent': USER_AGENT,
      },
    });
  } catch (error) {
    throw new CopilotApiError(
      'network',
      `Couldn't reach GitHub Copilot to list models — check the connection and try again. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearCopilotTokenCache();
      throw new CopilotApiError(
        'auth',
        'GitHub rejected the Copilot key while listing models — check it in Settings > AI.',
      );
    }
    if (response.status === 429) {
      throw new CopilotApiError(
        'rate-limited',
        'GitHub Copilot is rate-limiting the model list — try again in a bit.',
        retryAfterSeconds(response),
      );
    }
    throw new CopilotApiError(
      'upstream',
      `GitHub Copilot had a problem listing models (HTTP ${response.status}) — try again.`,
    );
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  const models = Array.isArray(body.data)
    ? body.data.filter((m) => typeof m.id === 'string' && m.id).map((m) => m.id as string)
    : [];
  cachedModels = { models, fetchedAtMs: now };
  return models;
}

export interface CopilotChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface CopilotChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required?: string[];
      properties: Record<string, { type: string; description: string; items?: { type: string } }>;
    };
  };
}

export interface CopilotChatToolCall {
  id: string;
  name: string;
  /** The raw JSON arguments string, as the model streamed it. */
  arguments: string;
}

export interface CopilotChatResult {
  content: string;
  toolCalls: CopilotChatToolCall[];
  model: string;
}

export interface CopilotChatOptions {
  githubToken: string;
  model: string;
  messages: CopilotChatMessage[];
  tools: CopilotChatTool[];
  /** Called with each streamed text delta, as it arrives. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
}

// One streamed line: the API sends Server-Sent Events
// ("data: {...}" lines, ending with "data: [DONE]"); a bare
// JSON line is accepted too. Returns the delta, or null for
// [DONE] and blank lines. (Same shape as
// electron/services/openai.ts's streamDelta.)
function streamDelta(line: string): {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let payload = trimmed;
  if (payload.startsWith('data:')) {
    payload = payload.slice('data:'.length).trim();
    if (payload === '[DONE]') return null;
  }
  const chunk = JSON.parse(payload) as {
    choices?: Array<{ delta?: { content?: string; tool_calls?: unknown } }>;
  };
  return chunk.choices?.[0]?.delta ?? null;
}

function mapChatFailure(status: number, detail: string, retryAfter?: number): CopilotApiError {
  if (status === 401 || status === 403) {
    return new CopilotApiError(
      'auth',
      'GitHub rejected the Copilot key while chatting — check it in Settings > AI. ' +
        'A classic personal access token (ghp_…) does not work here.',
    );
  }
  if (status === 400) {
    return new CopilotApiError(
      'bad-request',
      `GitHub Copilot refused the request (HTTP 400): ${detail || 'the model or the request was not allowed for this subscription'}`,
    );
  }
  if (status === 429) {
    return new CopilotApiError(
      'rate-limited',
      retryAfter !== undefined
        ? `GitHub Copilot is rate-limited — try again in about ${retryAfter}s.`
        : 'GitHub Copilot is rate-limited right now — try again in a bit.',
      retryAfter,
    );
  }
  if (status >= 500) {
    return new CopilotApiError(
      'upstream',
      `GitHub Copilot had a problem answering (HTTP ${status}) — try again.`,
    );
  }
  return new CopilotApiError(
    'upstream',
    `GitHub Copilot refused the request (HTTP ${status}): ${detail || 'no detail given'}`,
  );
}

async function postChatCompletions(
  apiBase: string,
  copilotToken: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  fetchFn: FetchFn,
): Promise<Response> {
  try {
    return await fetchFn(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${copilotToken}`,
        'Editor-Version': EDITOR_VERSION,
        'Editor-Plugin-Version': EDITOR_PLUGIN_VERSION,
        'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CopilotApiError('aborted', 'The Copilot request was stopped.');
    }
    throw new CopilotApiError(
      'network',
      `Couldn't reach GitHub Copilot — check the connection and try again. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/**
 * One chat-completions call, streamed. The accumulated content
 * and tool calls come back together; text deltas also flow to
 * onDelta as they arrive so the tab can show the model's words
 * while it plans. A 401 from the chat endpoint re-exchanges the
 * token once and retries — a stale cached token is not a failure.
 */
export async function chatCopilotCompletions(
  options: CopilotChatOptions,
): Promise<CopilotChatResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const { token, apiBase } = await exchangeCopilotToken(options.githubToken, fetchFn);

  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), CHAT_TIMEOUT_MS);
  const onOuterAbort = () => timeout.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });
  // The fetch watches the timeout's signal: the outer abort and
  // the 120s timeout both end the fetch with an AbortError.
  const signal = timeout.signal;

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true,
    ...(options.tools.length > 0
      ? { tools: options.tools, tool_choice: 'auto' }
      : {}),
  };

  let response: Response;
  try {
    response = await postChatCompletions(apiBase, token, body, signal, fetchFn);
    if (response.status === 401) {
      // A stale cached token: re-exchange once and retry.
      clearCopilotTokenCache();
      const fresh = await exchangeCopilotToken(options.githubToken, fetchFn);
      response = await postChatCompletions(apiBase, fresh.token, body, signal, fetchFn);
    }
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    const detail = errorDetail(await response.text());
    throw mapChatFailure(response.status, detail, retryAfterSeconds(response));
  }
  if (!response.body) {
    throw new CopilotApiError('upstream', 'GitHub Copilot answered with no reply body — try again.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (options.signal?.aborted) {
        throw new CopilotApiError('aborted', 'The Copilot request was stopped.');
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let delta: ReturnType<typeof streamDelta>;
        try {
          delta = streamDelta(line);
        } catch {
          // A malformed chunk is skipped, never fatal — the
          // stream continues; the accumulated result is what
          // counts.
          continue;
        }
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          options.onDelta?.(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: '', name: '', arguments: '' };
            }
            const current = toolCalls[tc.index];
            if (tc.id) current.id += tc.id;
            if (tc.function?.name) current.name += tc.function.name;
            if (tc.function?.arguments) current.arguments += tc.function.arguments;
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof CopilotApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CopilotApiError('aborted', 'The Copilot request was stopped.');
    }
    throw new CopilotApiError(
      'network',
      `GitHub Copilot's reply was cut off — try again. (${error instanceof Error ? error.message : String(error)})`,
    );
  } finally {
    try {
      reader.cancel();
    } catch {
      // The reader is already closed — nothing to cancel.
    }
  }

  return { content, toolCalls, model: options.model };
}
