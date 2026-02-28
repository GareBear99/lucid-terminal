import { IpcMain, BrowserWindow } from 'electron';

// ... imports
import { chat, cancelStream, hasApiKey, ChatMessage } from '../services/openai';
import { chatLocal, checkLocalBackendHealth } from '../services/local_ai'; // Import local service
import { historyManager } from '../services/historyManager';

export function setupAIHandlers(ipcMain: IpcMain): void {
  // Get main window reference for sending stream events
  ipcMain.handle('ai:chat', async (event, messages: ChatMessage[], contextDirectory?: string, stream = true): Promise<string> => {
    const sender = event.sender;

    try {
      // Check if local backend is running
      const isLocalUrlAvailable = await checkLocalBackendHealth();

      if (isLocalUrlAvailable) {
        console.log('Using Local LuciferAI Backend');
        // Local backend currently only supports non-streaming responses in this iteration
        // logic could be expanded to support streaming if the backend does
        const response = await chatLocal(messages, contextDirectory);
        return response;
      }

      // Fallback to OpenAI if local backend is down (or remove this if you want strictly local)
      console.log('Local backend not available, falling back to OpenAI');

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

  // Cancel ongoing stream
  ipcMain.on('ai:cancelStream', () => {
    cancelStream();
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
