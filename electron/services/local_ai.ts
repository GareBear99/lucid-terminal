import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import * as readline from 'readline';
import { TaskQueue, TaskCancelledError } from '../core/tasks/taskQueue';
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
