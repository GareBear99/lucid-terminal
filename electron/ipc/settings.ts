import { IpcMain } from 'electron';
import { settings, apiKeyStorage } from '../services/secureStorage';
import { resetClient } from '../services/openai';

export function setupSettingsHandlers(ipcMain: IpcMain): void {
  // Get a setting value
  ipcMain.handle('settings:get', async <T>(_, key: string): Promise<T | undefined> => {
    return settings.get<T>(key);
  });

  // Set a setting value
  ipcMain.handle('settings:set', async (_, key: string, value: unknown): Promise<void> => {
    settings.set(key, value);
  });

  // Get all settings
  ipcMain.handle('settings:getAll', async (): Promise<Record<string, unknown>> => {
    return settings.getAll();
  });



  // Export settings (without API key)
  ipcMain.handle('settings:export', async (): Promise<string> => {
    return settings.export();
  });

  // Import settings
  ipcMain.handle('settings:import', async (_, data: string): Promise<void> => {
    settings.import(data);
  });
}
