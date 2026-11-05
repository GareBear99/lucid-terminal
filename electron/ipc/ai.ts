import { IpcMain, BrowserWindow } from 'electron';

// ... imports
import { chat, cancelStream, hasApiKey, ChatMessage } from '../services/openai';
import { chatLocal, checkLocalBackendHealth, cancelLocalChat, chatLocalWithBrowserTools } from '../services/local_ai'; // Import local service
import { historyManager } from '../services/historyManager';
import { isAnyModelAvailable } from './lucidWorkflow';

export function setupAIHandlers(ipcMain: IpcMain): void {
  // Get main window reference for sending stream events
  ipcMain.handle('ai:chat', async (event, messages: ChatMessage[], contextDirectory?: string, stream = true): Promise<string> => {
    const sender = event.sender;

    try {
      // Check if local backend is running
      const isLocalUrlAvailable = await checkLocalBackendHealth();

      // The wrapper can be up with no model loaded — sending to it returns
      // a raw Python error, so only use it when a model is actually
      // available.
      const modelAvailable = isLocalUrlAvailable && (await isAnyModelAvailable());

      if (modelAvailable) {
        console.log('Using Local LuciferAI Backend');
        // Browser tools (Area 5): the local path runs the same
        // browser_* tools as the OpenAI path, through a tool loop
        // in main around the stdio backend - the model, the tools
        // and the page are all local. Tool calls stream as `> `
        // notices, like the OpenAI path does.
        const response = await chatLocalWithBrowserTools(messages, contextDirectory, {
          onToolCall: stream
            ? (name, summary) => {
                if (!sender.isDestroyed()) {
                  sender.send('ai:stream', `\n > \u26a1 ** ${name}**... \`${summary}...\`\n`);
                }
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
          sender.send('ai:stream', response);
          sender.send('ai:streamEnd');
        }
        return response;
      }

      // No local model: fall back to OpenAI when a key is configured,
      // otherwise report cleanly instead of sending to a model-less backend.
      if (!hasApiKey()) {
        const message = 'No model loaded — AI chat is unavailable. Install a model or add an API key in Settings.';
        if (!sender.isDestroyed()) {
          sender.send('ai:streamError', message);
        }
        return message;
      }

      // Fallback to OpenAI if local backend is down or has no model
      console.log('Local backend has no model available, falling back to OpenAI');

      if (stream) {
        const response = await chat(
          messages,
          contextDirectory,
          (chunk: string) => {
            if (!sender.isDestroyed()) {
              sender.send('ai:stream', chunk);
            }
          },
          () => {
            if (!sender.isDestroyed()) {
              sender.send('ai:streamEnd');
            }
          },
          (error: string) => {
            if (!sender.isDestroyed()) {
              sender.send('ai:streamError', error);
            }
          }
        );
        return response;
      } else {
        return await chat(messages, contextDirectory);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (!sender.isDestroyed()) {
        sender.send('ai:streamError', errorMessage);
      }
      throw error;
    }
  });

  // Cancel ongoing stream — both paths: the OpenAI stream and any
  // local chat task (queued or running). Until now this only
  // cancelled the OpenAI path, so a local generation kept running
  // and landed in the current chat after the user had moved on.
  ipcMain.on('ai:cancelStream', () => {
    cancelStream();
    cancelLocalChat();
  });


  // Check if API key is configured
  ipcMain.handle('ai:hasApiKey', async (): Promise<boolean> => {
    return hasApiKey();
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
