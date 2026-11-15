import type { IpcMain } from 'electron';
import { copilotApiKeyStorage } from '../services/secureStorage';
import {
  chatCopilotCompletions,
  CopilotApiError,
  listCopilotModels,
  type CopilotApiErrorCode,
  type CopilotChatMessage,
  type CopilotChatTool,
} from '../services/copilotClient';

// The Copilot IPC — D9 (2026-11-15).
//
// The key NEVER leaves the main process: these handlers read it
// from the OS keychain (`github-copilot-key`) and pass it to the
// client module, which calls GitHub. The renderer asks with a
// prompt + context and receives streamed text + the finished
// result; it never sees the key, the GitHub token, or the
// short-lived Copilot token.
//
// Handlers never throw out of IPC: a failure comes back as
// {ok: false, code, message} so the copilot tab can answer in
// its own words instead of crashing on a rejected invoke.

export interface CopilotIpcResult {
  ok: boolean;
  code?: CopilotApiErrorCode;
  message?: string;
  /** Seconds to wait before retrying, when the API said so. */
  retryAfterSeconds?: number;
}

export interface CopilotModelsResult extends CopilotIpcResult {
  models?: string[];
}

export interface CopilotChatResult extends CopilotIpcResult {
  content?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  model?: string;
}

export interface CopilotChatRequest {
  requestId: string;
  model: string;
  messages: CopilotChatMessage[];
  tools: CopilotChatTool[];
}

function noKeyResult(): CopilotIpcResult {
  return {
    ok: false,
    code: 'no-key',
    message: 'No GitHub Copilot key is saved — add it in Settings > AI.',
  };
}

function errorResult(error: unknown): CopilotIpcResult {
  if (error instanceof CopilotApiError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  }
  return {
    ok: false,
    code: 'upstream',
    message: `GitHub Copilot had a problem answering — try again. (${error instanceof Error ? error.message : String(error)})`,
  };
}

/** In-flight chat requests, by the renderer's requestId — the
 *  abort channel ends them. Entries are removed when the
 *  request settles. */
const inFlightChats = new Map<string, AbortController>();

export function setupCopilotHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('copilot:listModels', async (): Promise<CopilotModelsResult> => {
    const key = copilotApiKeyStorage.getCopilotApiKey();
    if (!key) return noKeyResult();
    try {
      const models = await listCopilotModels(key);
      return { ok: true, models };
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle(
    'copilot:chatCompletions',
    async (event, request: CopilotChatRequest): Promise<CopilotChatResult> => {
      const key = copilotApiKeyStorage.getCopilotApiKey();
      if (!key) return noKeyResult();
      const controller = new AbortController();
      const requestId = typeof request?.requestId === 'string' ? request.requestId : '';
      if (requestId) inFlightChats.set(requestId, controller);
      try {
        const result = await chatCopilotCompletions({
          githubToken: key,
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          signal: controller.signal,
          onDelta: (text) => {
            // The sender may be gone (window closed mid-stream)
            // — a dead webContents send throws, and must not
            // kill the request.
            try {
              event.sender.send('copilot:chat-delta', { requestId, text });
            } catch {
              // The tab is gone; the stream still completes.
            }
          },
        });
        return {
          ok: true,
          content: result.content,
          toolCalls: result.toolCalls,
          model: result.model,
        };
      } catch (error) {
        return errorResult(error);
      } finally {
        if (requestId) inFlightChats.delete(requestId);
      }
    },
  );

  ipcMain.on('copilot:chat-abort', (_event, requestId: string) => {
    const controller = typeof requestId === 'string' ? inFlightChats.get(requestId) : undefined;
    controller?.abort();
  });
}
