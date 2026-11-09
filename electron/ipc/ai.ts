import { IpcMain, BrowserWindow } from 'electron';
import type { WebContents } from 'electron';

// ... imports
import { chat, cancelStream, hasApiKey, ChatMessage } from '../services/openai';
import { chatPing, cancelPingStream, pingServerHealth, pingServerStatus, isPingServerEnabled, PingRateLimitError } from '../services/pingServer';
import { chatLocal, checkLocalBackendHealth, cancelLocalChat, chatLocalWithBrowserTools } from '../services/local_ai'; // Import local service
import { historyManager } from '../services/historyManager';
import { isAnyModelAvailable } from './lucidWorkflow';
import { resolveInstantReplyFallbackAfterPingError } from '../../src/lib/instantReplyPackets';

export type ChatRoute = 'ping' | 'local' | 'openai' | 'none';

export interface ChatRouteInput {
  /** The current chat's model, if one is set (''/absent = Auto). */
  model?: string;
  modelSource?: 'local' | 'openai' | 'ping';
  /** Ping is GLOBAL (today's Settings toggle) - never per-chat. */
  pingEnabled: boolean;
  /** Local backend up AND a model actually loaded. */
  localAvailable: boolean;
  hasApiKey: boolean;
}

export interface ChatRouteResult {
  route: ChatRoute;
  /** The model to answer with, when the route takes one. */
  model?: string;
}

/**
 * Decide which route answers one reply, from the current chat's
 * model choice (the header dropdown) and what can answer now.
 * Pure - unit-tested in tests/aiChatRoute.test.ts.
 *
 * An explicit model is authoritative WHEN its route can answer:
 * a local choice needs a loaded local model, an OpenAI choice
 * needs a key, a ping choice needs ping enabled. When the chosen
 * route cannot answer, the choice falls through to today's fixed
 * cascade (ping -> local -> OpenAI) instead of erroring, so the
 * user still gets a reply from another route. No choice (Auto)
 * is the cascade itself, re-decided per reply, exactly as today.
 */
export function resolveChatRoute(input: ChatRouteInput): ChatRouteResult {
  if (input.modelSource === 'ping' && input.pingEnabled) return { route: 'ping', model: input.model };
  if (input.modelSource === 'openai' && input.hasApiKey) return { route: 'openai', model: input.model };
  if (input.modelSource === 'local' && input.localAvailable) return { route: 'local', model: input.model };
  // No explicit model, or the chosen route cannot answer: the cascade.
  if (input.pingEnabled) return { route: 'ping' };
  if (input.localAvailable) return { route: 'local' };
  if (input.hasApiKey) return { route: 'openai' };
  return { route: 'none' };
}

/**
 * Coalesce per-token stream chunks into fewer IPC messages
 * (zero-latency F5/F6). Before this, every token was one
 * `ai:stream` IPC message + one full-string concat + one zustand
 * `set` + one AIChat re-render in the renderer (O(n²) allocation
 * over a long reply, 20–50 re-renders/s). Now chunks accumulate
 * here and flush at most every AI_STREAM_FLUSH_MS, or as soon as
 * AI_STREAM_FLUSH_CHARS have buffered — whichever comes first —
 * so the renderer sees ≤20 messages/s of ≤512 chars instead of
 * one per token.
 *
 * Callers MUST flush() before sending `ai:streamEnd`, or the tail
 * of the reply is lost. A non-streaming caller never pushes, so
 * the coalescer stays inert there.
 */
export const AI_STREAM_FLUSH_MS = 50;
export const AI_STREAM_FLUSH_CHARS = 512;

export interface StreamCoalescer {
  /** Buffer one chunk; flushes automatically at the size cap. */
  push(chunk: string): void;
  /** Send whatever is buffered now (no-op when empty). */
  flush(): void;
}

export function createStreamCoalescer(sender: WebContents): StreamCoalescer {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buffer) return;
    const out = buffer;
    buffer = '';
    if (!sender.isDestroyed()) sender.send('ai:stream', out);
  };
  return {
    push(chunk: string) {
      if (!chunk) return;
      buffer += chunk;
      if (buffer.length >= AI_STREAM_FLUSH_CHARS) {
        flush();
        return;
      }
      if (!timer) timer = setTimeout(flush, AI_STREAM_FLUSH_MS);
    },
    flush,
  };
}

export function setupAIHandlers(ipcMain: IpcMain): void {
  // Get main window reference for sending stream events
  ipcMain.handle('ai:chat', async (event, messages: ChatMessage[], contextDirectory?: string, stream = true, options?: { model?: string; modelSource?: 'local' | 'openai' | 'ping'; chatId?: string }): Promise<string> => {
    const sender = event.sender;
    // One coalescer per reply (see createStreamCoalescer): every
    // stream callback below pushes into it instead of sending one
    // IPC message per token, and every stream-end path flushes it
    // first so no tail is lost.
    const streamCoalescer = createStreamCoalescer(sender);
    // The current chat's model, from the header dropdown (AIChat.tsx),
    // read at send time: this choice is for the NEXT prompted reply.
    // An explicit model is authoritative when its route can answer;
    // otherwise the cascade decides as today, so an unavailable
    // choice still gets a reply from another route instead of an error.
    //
    // The ping fast path is kept: ping stays GLOBAL (today's Settings
    // toggle) and, when it wins, the local backend is never probed -
    // isAnyModelAvailable() runs a per-backend connection test, so
    // probing it on every ping reply would slow ping down. The probe
    // only runs when the choice (or the cascade) needs the local
    // route at all.
    const pingEnabled = isPingServerEnabled();
    let route: ChatRouteResult;
    if (pingEnabled && (!options?.modelSource || options.modelSource === 'ping')) {
      route = { route: 'ping', model: options?.model };
    } else if (options?.modelSource === 'openai' && hasApiKey()) {
      route = { route: 'openai', model: options.model };
    } else {
      const isLocalUrlAvailable = await checkLocalBackendHealth();
      // The wrapper can be up with no model loaded - sending to it
      // returns a raw Python error, so only count it available when
      // a model is actually loaded.
      const modelAvailable = isLocalUrlAvailable && (await isAnyModelAvailable());
      route = resolveChatRoute({
        model: options?.model,
        modelSource: options?.modelSource,
        pingEnabled,
        localAvailable: modelAvailable,
        hasApiKey: hasApiKey(),
      });
    }

    // OpenAI path, shared by the normal OpenAI route and the second
    // fallback after a ping error (see the ping branch below). The
    // `silentOnError` call is the fallback: its error is recorded by
    // the caller instead of sent, so a failed reply sends exactly
    // one ai:streamError for the whole reply instead of one per
    // failed route. The normal route keeps the existing behaviour
    // (its onError sends immediately).
    const runOpenAIPath = async (silentOnError = false): Promise<string> => {
      console.log('Using OpenAI', route.model ? `(model ${route.model})` : '(settings default)');
      if (stream) {
        const response = await chat(
          messages,
          contextDirectory,
          (chunk: string) => {
            streamCoalescer.push(chunk);
          },
          () => {
            streamCoalescer.flush();
            if (!sender.isDestroyed()) {
              sender.send('ai:streamEnd');
            }
          },
          (error: string) => {
            if (!silentOnError && !sender.isDestroyed()) {
              sender.send('ai:streamError', error);
            }
          },
          route.model,
        );
        return response;
      }
      return await chat(messages, contextDirectory, undefined, undefined, undefined, route.model);
    };

    try {
      // Ping server (test path): when enabled in Settings, AI chat
      // routes to the Cloudflare Worker instead of the local backend
      // or OpenAI. The route was decided above - ping wins while
      // enabled and no other route is chosen, or when the chosen
      // route cannot answer (cascade fallback).
      //
      // SECOND FALLBACK (Gary, 2026-11-08): a ping error used to end
      // here — one ai:streamError, and the error text returned as
      // the reply. Now the ping error falls through once more, by
      // resolveInstantReplyFallbackAfterPingError() (the rule lives
      // in src/lib/instantReplyPackets.ts, mirrored in
      // instant_reply/branches.py): a 429 is terminal (the SP gate
      // is never bypassed), a partial ping reply already streamed
      // is terminal (no Franken-reply), otherwise OpenAI answers
      // when a key is configured, else an honest error. The local
      // route is NEVER the fallback here — running a model on the
      // user's machine is user-side CPU, and Gary's rule is
      // user-side CPU = NONE. The ping error is therefore recorded
      // (not sent) until the fallback is decided, so a successful
      // fallback shows no error event at all, and a failed reply
      // sends exactly one ai:streamError.
      if (route.route === 'ping') {
        console.log('Using Lucid ping server (test path)');
        let pingErrorText: string | null = null;
        let pingStreamedAny = false;
        try {
          if (stream) {
            const response = await chatPing(
              messages,
              (chunk: string) => {
                pingStreamedAny = true;
                streamCoalescer.push(chunk);
              },
              (quota) => {
                streamCoalescer.flush();
                if (!sender.isDestroyed()) {
                  sender.send('ai:streamEnd', quota ?? undefined);
                }
              },
              (error: string) => {
                pingErrorText = error;
              },
              // The model the dropdown chose (a Workers AI id);
              // absent (Auto) = the worker's default.
              route.model,
            );
            return response;
          }
          return await chatPing(messages, undefined, undefined, undefined, route.model);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          const pingError = pingErrorText ?? errorMessage;
          const fallback = resolveInstantReplyFallbackAfterPingError({
            isRateLimited: error instanceof PingRateLimitError,
            hasApiKey: hasApiKey(),
            partialReplyStreamed: pingStreamedAny,
          });
          if (fallback === 'openai') {
            try {
              // No partial ping reply was streamed (the fallback
              // rule guarantees it), so the coalescer holds nothing
              // of the failed ping reply; flush anyway for safety.
              streamCoalescer.flush();
              return await runOpenAIPath(true);
            } catch (openAiError) {
              const openAiMessage = openAiError instanceof Error ? openAiError.message : 'Unknown error occurred';
              streamCoalescer.flush();
              if (!sender.isDestroyed()) {
                sender.send('ai:streamError', pingError);
              }
              return `Ping server error: ${pingError} — OpenAI fallback also failed: ${openAiMessage}`;
            }
          }
          // No second fallback: rate-limited, partial reply already
          // streamed, or no OpenAI key. One error event, and the
          // error text as the reply (unchanged from before).
          streamCoalescer.flush();
          if (!sender.isDestroyed()) {
            sender.send('ai:streamError', pingError);
          }
          return pingError;
        }
      }

      // The route was already decided above (route), including the
      // local-availability probe - a wrapper up with no model loaded
      // counts as unavailable, so this branch is only entered when
      // a model can actually answer.
      if (route.route === 'local') {
        console.log('Using Local LuciferAI Backend', route.model ? `(model ${route.model})` : '(auto model)');
        // Browser tools (Area 5): the local path runs the same
        // browser_* tools as the OpenAI path, through a tool loop
        // in main around the stdio backend - the model, the tools
        // and the page are all local. Tool calls stream as `> `
        // notices, like the OpenAI path does.
        const response = await chatLocalWithBrowserTools(messages, contextDirectory, {
          // The chat's model + id, for the stdio payload: the Python
          // backend cold-loads this model and scopes its memory to
          // this chat id. Absent (Auto) = the backend's own default.
          localOptions: { model: route.model, chatId: options?.chatId },
          onToolCall: stream
            ? (name, summary) => {
                streamCoalescer.push(`\n > \u26a1 ** ${name}**... \`${summary}...\`\n`);
              }
            : undefined,
        });
        // The local backend answers whole-reply (no stream), but the UI
        // only ever receives a reply through the stream events —
        // AIChat discards this handler's return value, so returning
        // without emitting left every local reply lost and the chat
        // stuck on 'loading' (A-12). Deliver the reply as one stream
        // chunk plus stream-end, exactly like the OpenAI path below:
        // the UI accumulates it, completes the stream, and adds it to
        // the generation's origin chat with its timestamp. Gated on
        // `stream` like the OpenAI branch, so a non-streaming caller
        // still just gets the return value.
        if (stream && !sender.isDestroyed()) {
          // Tool-call notices buffered in the coalescer go first,
          // in order, then the whole reply, then stream-end.
          streamCoalescer.flush();
          sender.send('ai:stream', response);
          sender.send('ai:streamEnd');
        }
        return response;
      }

      // No route can answer (ping off, no local model, no API key):
      // report cleanly instead of sending to a model-less backend.
      if (route.route === 'none') {
        const message = 'No model loaded — AI chat is unavailable. Install a model or add an API key in Settings.';
        if (!sender.isDestroyed()) {
          sender.send('ai:streamError', message);
        }
        return message;
      }

      // Fallback to OpenAI if local backend is down or has no model
      // (the normal OpenAI route — same helper the ping-error
      // fallback uses, with its error reporting on).
      return await runOpenAIPath();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      streamCoalescer.flush();
      if (!sender.isDestroyed()) {
        sender.send('ai:streamError', errorMessage);
      }
      throw error;
    }
  });

  // Cancel ongoing stream — all paths: the OpenAI stream, the ping
  // server stream, and any local chat task (queued or running).
  ipcMain.on('ai:cancelStream', () => {
    cancelStream();
    cancelPingStream();
    cancelLocalChat();
  });


  // Check if API key is configured
  ipcMain.handle('ai:hasApiKey', async (): Promise<boolean> => {
    return hasApiKey();
  });

  // Ping server health — POST /ping through the client. /ping is
  // unmetered, and the reply carries the remaining SP balance.
  ipcMain.handle('ai:pingServerHealth', async () => {
    return pingServerHealth();
  });

  // Ping server status — GET / through the client. The public
  // root: service, model, mode, the maintenance view, the
  // server caps. Unmetered (no SP, no neurons). The Security
  // tab pulls it when it opens and on refresh (one call per
  // pull) — the admin pull for server-side tracking.
  ipcMain.handle('ai:pingServerStatus', async () => {
    return pingServerStatus();
  });

  // Check if local backend is available
  ipcMain.handle('ai:checkLocalBackend', async (): Promise<boolean> => {
    return await checkLocalBackendHealth();
  });

  // History Management
  ipcMain.handle('ai:getSessions', async () => {
    return historyManager.getSessions();
  });

  ipcMain.handle('ai:saveSession', async (_, session) => {
    await historyManager.saveSession(session);
  });

  ipcMain.handle('ai:deleteSession', async (_, id) => {
    await historyManager.deleteSession(id);
  });

  ipcMain.handle('ai:clearSessions', async () => {
    await historyManager.clearSessions();
  });
}
