/**
 * FixNet sync IPC — the main-process side of the client sync
 * (Gary, 2026-11-16: GitHub Pages is the daily channel).
 *
 * Channels (the renderer consumes exactly this name):
 *   fixnet:sync — GET the daily data from the FixNet repo's
 *     GitHub Pages site (status table + latest day + daily
 *     file). Pull-only: the handler takes no arguments from the
 *     renderer and sends nothing up — it only returns what
 *     Pages published. The renderer applies it via
 *     applyDailyVerificationIssuance + the verified SP grant.
 *
 * A failed pull throws into the invoke — the renderer logs it
 * and retries on the next sync (6h / startup). A pull never
 * fails startup: the renderer calls it best-effort.
 */
import type { IpcMain } from 'electron';
import { pullFixNetDaily } from '../services/fixnetSync';

export function setupFixNetHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('fixnet:sync', async () => {
    return pullFixNetDaily();
  });
}
