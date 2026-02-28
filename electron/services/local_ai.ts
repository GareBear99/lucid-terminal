import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import * as readline from 'readline';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

let backendProcess: ChildProcess | null = null;
let backendInterface: readline.Interface | null = null;
let pendingRequestResolver: ((response: any) => void) | null = null;
let isBackendReady = false;

// Queue to serialize requests if multiple come in (though UI usually prevents this)
const requestQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

export function startBackend(): void {
    const rootDir = app.isPackaged
        ? path.join(process.resourcesPath, 'LUCID-BACKEND')
        : path.join(__dirname, '../LUCID-BACKEND');

    // Use stdio_agent.py instead of api_server.py
    const backendPath = path.join(rootDir, 'core', 'stdio_agent.py');
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    console.log(`Starting Local AI Backend: ${pythonCommand} ${backendPath}`);

    try {
        backendProcess = spawn(pythonCommand, [backendPath], {
            cwd: path.dirname(backendPath),
            stdio: ['pipe', 'pipe', 'pipe'], // Stdin, Stdout, Stderr
            env: { ...process.env, LUCIFER_NON_INTERACTIVE: 'true' }
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

export async function chatLocal(messages: ChatMessage[], cwd?: string): Promise<string> {
    if (!backendProcess || !isBackendReady) {
        throw new Error("Local backend is not running");
    }

    // Simple mutex: wait if a request is pending
    if (pendingRequestResolver) {
        // You might want to implement a proper queue here, 
        // but for now we'll just throw or wait. 
        // Let's implement a quick polling wait or queue.
        // For simplicity in this iteration:
        throw new Error("Backend is busy processing another request");
    }

    return new Promise((resolve, reject) => {
        pendingRequestResolver = (response: any) => {
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
