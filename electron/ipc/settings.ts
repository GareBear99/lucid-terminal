import { IpcMain } from 'electron';
import { settings, apiKeyStorage, isStorageDegraded, getStorageDegradedReason } from '../services/secureStorage';
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

  // Storage health — degraded when the app data dir is read-only and the
  // stores fell back to memory (see secureStorage.ts). The app still
  // runs; changes just will not persist.
  ipcMain.handle('settings:getStorageStatus', async (): Promise<{ degraded: boolean; reason: string | null }> => {
    return { degraded: isStorageDegraded(), reason: getStorageDegradedReason() };
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
