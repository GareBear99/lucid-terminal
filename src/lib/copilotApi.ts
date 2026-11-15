/**
 * The Copilot API client, renderer side — D9 (2026-11-15).
 *
 * The renderer never holds the key: every call goes over IPC to
 * the main process, which reads the key from the OS keychain and
 * calls GitHub. This module is the typed wrapper over
 * `window.lucidAPI.copilot` — request ids, streamed-text deltas,
 * and abort wiring — plus the transport interface the Copilot
 * brain plans through (tests inject a fake; the real one talks
 * to IPC).
 *
 * When the bridge is absent (tests, non-Electron), every call
 * answers `unavailable` — never a crash on an undefined
 * `window.lucidAPI`.
 */

export type CopilotApiFailureCode =
  | 'no-key'
  | 'auth'
  | 'rate-limited'
  | 'bad-request'
  | 'network'
  | 'upstream'
  | 'aborted'
  | 'unavailable';

export interface CopilotApiFailure {
  code: CopilotApiFailureCode;
  message: string;
  retryAfterSeconds?: number;
}

export type CopilotApiResult<T> =
  | ({ ok: true } & T)
  | ({ ok: false } & CopilotApiFailure);

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

export interface CopilotChatCompletion {
  content: string;
  toolCalls: CopilotChatToolCall[];
  model: string;
}

export interface CopilotChatRequest {
  model: string;
  messages: CopilotChatMessage[];
  tools: CopilotChatTool[];
}

/** The transport the Copilot brain plans through. */
export interface CopilotTransport {
  listModels(): Promise<CopilotApiResult<{ models: string[] }>>;
  chatCompletions(
    request: CopilotChatRequest,
    onDelta?: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<CopilotApiResult<CopilotChatCompletion>>;
}

function unavailableResult(message?: string): CopilotApiFailure {
  return {
    code: 'unavailable',
    message: message ?? 'Copilot is unavailable in this environment.',
  };
}

function newRequestId(): string {
  return `copilot-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveBridge() {
  // The bridge is absent in tests and non-Electron runs — a
  // bare `window.lucidAPI` read would throw where `window`
  // itself does not exist.
  if (typeof window === 'undefined') return undefined;
  return window.lucidAPI?.copilot;
}

/** In-flight streamed chats, by requestId — the delta listener
 *  dispatches to the right caller. One listener for the process,
 *  registered lazily on the first streamed call. */
const deltaListeners = new Map<string, (text: string) => void>();
let deltaUnsubscribe: (() => void) | null = null;

function ensureDeltaListener(): void {
  if (deltaUnsubscribe) return;
  const bridge = resolveBridge();
  if (!bridge?.onChatDelta) return;
  deltaUnsubscribe = bridge.onChatDelta((event) => {
    const listener = deltaListeners.get(event.requestId);
    listener?.(event.text);
  });
}

export async function copilotListModels(): Promise<CopilotApiResult<{ models: string[] }>> {
  const bridge = resolveBridge();
  if (!bridge) return { ok: false, ...unavailableResult() };
  try {
    const result = await bridge.listModels();
    if (result.ok) return { ok: true, models: result.models ?? [] };
    return {
      ok: false,
      code: (result.code ?? 'upstream') as CopilotApiFailureCode,
      message: result.message ?? 'GitHub Copilot had a problem listing models — try again.',
      retryAfterSeconds: result.retryAfterSeconds,
    };
  } catch (error) {
    return {
      ok: false,
      ...unavailableResult(
        `Copilot is unavailable in this environment. (${error instanceof Error ? error.message : String(error)})`,
      ),
    };
  }
}

export async function copilotChatCompletions(
  request: CopilotChatRequest,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<CopilotApiResult<CopilotChatCompletion>> {
  const bridge = resolveBridge();
  if (!bridge) return { ok: false, ...unavailableResult() };
  if (signal?.aborted) {
    return { ok: false, code: 'aborted', message: 'The Copilot request was stopped.' };
  }
  const requestId = newRequestId();
  if (onDelta) {
    ensureDeltaListener();
    deltaListeners.set(requestId, onDelta);
  }
  const onAbort = () => {
    bridge.abortChatCompletions(requestId);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await bridge.chatCompletions({ ...request, requestId });
    if (result.ok) {
      return {
        ok: true,
        content: result.content ?? '',
        toolCalls: result.toolCalls ?? [],
        model: result.model ?? request.model,
      };
    }
    return {
      ok: false,
      code: (result.code ?? 'upstream') as CopilotApiFailureCode,
      message: result.message ?? 'GitHub Copilot had a problem answering — try again.',
      retryAfterSeconds: result.retryAfterSeconds,
    };
  } catch (error) {
    return {
      ok: false,
      ...unavailableResult(
        `Copilot is unavailable in this environment. (${error instanceof Error ? error.message : String(error)})`,
      ),
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    deltaListeners.delete(requestId);
  }
}

/** The real transport — the brain's default. */
export const realCopilotTransport: CopilotTransport = {
  listModels: copilotListModels,
  chatCompletions: copilotChatCompletions,
};
