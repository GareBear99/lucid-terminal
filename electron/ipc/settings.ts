import { app, IpcMain } from 'electron';
import { settings, apiKeyStorage, isStorageDegraded, getStorageDegradedReason } from '../services/secureStorage';
import { resetClient } from '../services/openai';

export function setupSettingsHandlers(ipcMain: IpcMain): void {
  // Run on startup (Gary, 2026-11-12) — Lucid as a macOS login item,
  // toggled from Settings > General like any other program. The OS is
  // the truth: get reads app.getLoginItemSettings(), set applies
  // app.setLoginItemSettings() and returns the value it re-reads, so
  // the renderer never shows a state the OS disagrees with (e.g. the
  // user flipped it in System Settings instead). Default OFF — nothing
  // auto-starts unless Gary flips it on; main never sets it on its
  // own. A failure to read reports false rather than throwing, so the
  // toggle shows off instead of breaking Settings.
  ipcMain.handle('settings:getRunOnStartup', async (): Promise<boolean> => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });

  ipcMain.handle('settings:setRunOnStartup', async (_, value: boolean): Promise<boolean> => {
    try {
      app.setLoginItemSettings({ openAtLogin: value });
    } catch (error) {
      console.error('Failed to set run on startup:', error);
    }
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });

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
