import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import * as readline from 'readline';
import { TaskQueue, TaskCancelledError } from '../core/tasks/taskQueue';
import { browserToolNames, executeTool } from './aiTools';
import { getPythonCommand } from '../core/pythonPath';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

let backendProcess: ChildProcess | null = null;
let backendInterface: readline.Interface | null = null;
let pendingRequestResolver: ((response: any) => void) | null = null;
let isBackendReady = false;

// The stdio backend answers one request at a time (a single-request
// stdio loop), so concurrent chat calls queue behind the running one
// on this single-worker queue instead of throwing "Backend is busy".
// This replaces the old dead declarations (`requestQueue` /
// `isProcessingQueue`, which nothing ever used) and the single-slot
// mutex in `chatLocal()` that failed concurrent callers outright.
const chatQueue = new TaskQueue(1);

export function startBackend(): void {
    const rootDir = app.isPackaged
        ? path.join(process.resourcesPath, 'LUCID-BACKEND')
        : path.join(__dirname, '../LUCID-BACKEND');

    // Use stdio_agent.py instead of api_server.py
    const backendPath = path.join(rootDir, 'core', 'stdio_agent.py');
    // Resolved to an absolute path: Finder-launched apps get an empty
    // PATH from launchd, so a bare 'python3' spawn fails with ENOENT
    // even though python3 exists on disk (see core/pythonPath.ts).
    // When nothing resolves, this falls back to the bare command and
    // the 'error' handler below degrades gracefully instead of crashing.
    const pythonCommand = getPythonCommand();

    console.log(`Starting Local AI Backend: ${pythonCommand} ${backendPath}`);

    try {
        backendProcess = spawn(pythonCommand, [backendPath], {
            cwd: path.dirname(backendPath),
            stdio: ['pipe', 'pipe', 'pipe'], // Stdin, Stdout, Stderr
            env: { ...process.env, LUCIFER_NON_INTERACTIVE: 'true' }
        });

        // A failed spawn (e.g. python3 not installed — ENOENT) does NOT
        // throw synchronously and is NOT caught by the try/catch around
        // this block: Node emits it async as an 'error' event, and with
        // no listener that event is an uncaught exception — Electron
        // shows the "A JavaScript error occurred in the main process"
        // dialog (Gary hit this on the Mac, 2026-11-04). Handle it here
        // and degrade to "backend down" instead of crashing: the
        // handler clears the state, so chatLocal() fails fast with
        // "Local backend is not running" and the AI chat shows its
        // honest "backend unavailable" state. Attach it immediately
        // after spawn returns, before anything else that could throw.
        backendProcess.on('error', (err) => {
            console.error('Local AI backend failed to spawn:', err);
            isBackendReady = false;
            backendProcess = null;
            backendInterface = null;
        });

        if (!backendProcess.stdout) {
            throw new Error("Failed to capture stdout");
        }

        // Setup Readline interface for line-by-line parsing
        backendInterface = readline.createInterface({
            input: backendProcess.stdout,
            terminal: false
        });

        backendInterface.on('line', (line) => {
            if (!line.trim()) return;

            // Skip non-JSON lines (emoji log messages from Python backend)
            const trimmed = line.trim();
            if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
                // Log non-JSON output for debugging (likely startup messages)
                if (trimmed.length > 0) {
                    console.log('LUCID-BACKEND/core:', trimmed);
                }
                return;
            }

            try {
                const data = JSON.parse(line);

                // Handle initial ready signal
                if (data.type === 'ready') {
                    console.log('Local AI Backend Ready');
                    isBackendReady = true;
                    return;
                }

                // Handle standard responses
                if (pendingRequestResolver) {
                    pendingRequestResolver(data);
                    pendingRequestResolver = null;
                } else {
                    console.log("Received unexpected line from backend:", line);
                }
            } catch (e) {
                console.error('Failed to parse backend output:', line, e);
            }
        });

        backendProcess.stderr?.on('data', (data) => {
            console.error(`Backend Error: ${data}`);
        });

        backendProcess.on('exit', (code) => {
            console.log(`Backend exited with code ${code}`);
            isBackendReady = false;
            backendProcess = null;
            backendInterface = null;
        });

    } catch (error) {
        console.error('Failed to spawn backend:', error);
    }
}

export function stopBackend(): void {
    if (backendProcess) {
        console.log('Stopping Local AI Backend...');
        backendProcess.kill();
        backendProcess = null;
        backendInterface = null;
        isBackendReady = false;
    }
}

export async function checkLocalBackendHealth(): Promise<boolean> {
    return isBackendReady && !!backendProcess;
}

export function chatLocal(messages: ChatMessage[], cwd?: string): Promise<string> {
    if (!backendProcess || !isBackendReady) {
        return Promise.reject(new Error("Local backend is not running"));
    }

    // Concurrent calls queue behind the running one (single worker)
    // instead of throwing "Backend is busy" — the stdio backend is a
    // single-request loop, so serialising here is what it supports.
    // A backend-down call still fails fast above, not queued.
    // NOTE: this function is deliberately NOT `async` — it returns
    // the queue's promise itself, which carries the queue's no-op
    // `.catch` against unhandled rejections. An `async` wrapper would
    // hand the caller a fresh outer promise whose rejection surfaces
    // as unhandled until the caller awaits it (a macrotask later).
    const { promise } = chatQueue.enqueue<string>(
        'ai-chat',
        { messages: messages.length, cwd: cwd ?? null },
        (_task, isCancelled) => sendChatRequest(messages, cwd, isCancelled)
    );
    return promise;
}

/**
 * One stdio round-trip: write the chat payload, resolve with the
 * backend's reply. The resolver stays installed until the backend
 * answers (the single-request protocol must stay in sync), so a
 * cancelled run still consumes its reply line — the result is just
 * dropped and the caller gets TaskCancelledError instead.
 */
function sendChatRequest(
    messages: ChatMessage[],
    cwd: string | undefined,
    isCancelled: () => boolean
): Promise<string> {
    return new Promise((resolve, reject) => {
        pendingRequestResolver = (response: any) => {
            if (isCancelled()) {
                reject(new TaskCancelledError('ai-chat'));
                return;
            }
            if (response.status === 'success') {
                resolve(response.response);
            } else {
                reject(new Error(response.error || 'Unknown backend error'));
            }
        };

        const lastMessage = messages[messages.length - 1];
        const prompt = lastMessage.content;

        const payload = JSON.stringify({
            command: 'chat',
            message: prompt,
            cwd: cwd
        });

        try {
            backendProcess?.stdin?.write(payload + '\n');
        } catch (e) {
            pendingRequestResolver = null;
            reject(e);
        }
    });
}

/**
 * Cancel the running chat task (best-effort — the reply is dropped
 * when it arrives) and drop every queued chat. Returns true when
 * anything was cancelled. Wired to `ai:cancelStream`, which until now
 * only cancelled the OpenAI path while local generations kept running.
 */
export function cancelLocalChat(): boolean {
    let cancelled = false;
    for (const task of chatQueue.list()) {
        if (task.status === 'queued' || task.status === 'running') {
            cancelled = chatQueue.cancel(task.id) || cancelled;
        }
    }
    return cancelled;
}


/**
 * Browser tool-calling for the LOCAL chat path (Area 5).
 *
 * The local backend is a stdio Python agent: it takes one prompt
 * string and returns one plain-text reply — it has no native
 * function-calling. So the tool loop lives here, in main, around
 * it: each round sends the conversation transcript plus a tool
 * instruction as a single prompt; when the reply contains a fenced
 * JSON tool call, main executes it locally (through the same
 * `executeTool` the OpenAI path uses) and feeds the result back
 * as the next round's prompt, up to LOCAL_TOOL_MAX_ROUNDS rounds.
 *
 * Only browser tools are ever offered to the local model
 * (browserToolNames) — never the file/command tools. A small
 * local model hallucinating a `run_command` call must not be able
 * to reach it. Everything runs locally: the model, the tools, the
 * page. No remote server is involved at any point.
 */

/** One browser tool call, parsed out of a local-model reply. */
export interface LocalBrowserToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Extract a browser tool call from a local-model reply. Accepts a
 * fenced ```json block, or a bare JSON object that is the whole
 * reply. Returns null for plain text, malformed JSON, a non-object,
 * a missing/unknown tool name, or non-object args. Non-browser
 * tools (read_file, run_command, ...) are rejected even when
 * well-formed: the local path allows browser tools only.
 */
export function extractBrowserToolCall(
  text: string,
): LocalBrowserToolCall | null {
  if (typeof text !== 'string') return null;
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) candidates.push(fenced[1]);
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push(trimmed);
  }
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }
    const { tool, args } = parsed as Record<string, unknown>;
    if (typeof tool !== 'string') continue;
    if (!browserToolNames.includes(tool)) continue;
    if (
      args !== undefined &&
      (typeof args !== 'object' || args === null || Array.isArray(args))
    ) {
      continue;
    }
    return { tool, args: (args ?? {}) as Record<string, unknown> };
  }
  return null;
}

/** How many browser tool rounds the local loop runs before it
 * stops and reports instead of looping forever. */
export const LOCAL_TOOL_MAX_ROUNDS = 5;

/** Tool results fed back to the local model are capped: a full
 * page read is 20k chars, and the local context is small. */
export const LOCAL_TOOL_RESULT_CAP = 8000;

export interface LocalToolChatDeps {
  /** One chat round-trip; defaults to the real local backend. */
  chat?: (messages: ChatMessage[], cwd?: string) => Promise<string>;
  /** Run one tool by name; defaults to executeTool. */
  execute?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  /** Called for every tool execution (the IPC layer streams it as
   * a `> ⚡` notice, like the OpenAI path does). */
  onToolCall?: (name: string, resultSummary: string) => void;
}

const BROWSER_TOOL_PROMPT = [
  'You are Lucid, an AI assistant inside the Lucid Terminal app. You can use the in-panel browser with these tools (they run locally in the app, no server):',
  '',
  '- browser_navigate {"url"}: open a URL in the active browser tab',
  '- browser_read_page {}: read the visible text of the current page',
  '- browser_click {"selector"}: click an element (CSS selector)',
  '- browser_fill {"selector", "value"}: type text into a form field (never a password field)',
  '- browser_get_state {}: describe the current page (URL, title, forms)',
  '- browser_screenshot {}: save a screenshot of the page, returns its file path',
  '- browser_search {"query"}: search the web, returns titles, URLs and snippets',
  '',
  'To use a tool, reply with ONLY a fenced JSON block and nothing else:',
  '```json',
  '{"tool": "browser_read_page", "args": {}}',
  '```',
  'I will run it and send you the result; then reply with your final answer in plain text. If no tool is needed, just answer in plain text.',
].join('\n');

function formatTranscript(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
}

/**
 * Chat with the local backend, with browser tools. The stdio
 * backend only ever sees the last message's content, so every
 * round sends the whole transcript plus the tool instruction as
 * one prompt. A round that returns a tool call executes it locally
 * and feeds the result back; a round that returns plain text is
 * the final answer. Tool execution never throws out of here: a
 * failing tool returns its error as the tool result, so the model
 * can react to it.
 */
export async function chatLocalWithBrowserTools(
  messages: ChatMessage[],
  cwd?: string,
  deps: LocalToolChatDeps = {},
): Promise<string> {
  const chat = deps.chat ?? chatLocal;
  const execute =
    deps.execute ?? ((name, args) => executeTool(name, args, cwd));
  let transcript = formatTranscript(messages);
  let lastToolResult: string | null = null;
  for (let round = 0; round < LOCAL_TOOL_MAX_ROUNDS; round += 1) {
    const prompt =
      `${BROWSER_TOOL_PROMPT}\n\n` +
      `Conversation so far:\n${transcript}\n\n` +
      'Reply with your next step: a tool call, or your final answer.';
    const reply = await chat([{ role: 'user', content: prompt }], cwd);
    const call = extractBrowserToolCall(reply);
    if (!call) return reply;
    let result: string;
    try {
      result = await execute(call.tool, call.args);
    } catch (error) {
      result = `Error executing tool ${call.tool}: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    const capped =
      result.length > LOCAL_TOOL_RESULT_CAP
        ? result.slice(0, LOCAL_TOOL_RESULT_CAP)
        : result;
    const summary = capped.slice(0, 100).replace(/\s+/g, ' ');
    deps.onToolCall?.(call.tool, summary);
    lastToolResult = capped;
    transcript +=
      `\nassistant: ${JSON.stringify(call)}\n` +
      `user: Tool ${call.tool} returned:\n${capped}\n` +
      '(Continue: reply with your final answer in plain text, or another tool call.)';
  }
  return (
    `I stopped after ${LOCAL_TOOL_MAX_ROUNDS} browser actions without a final answer. ` +
    `Last tool result:\n${lastToolResult ?? '(none)'}`
  );
}
