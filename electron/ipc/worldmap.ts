/**
 * Offline Worldmap add-on IPC — the main-process side of the
 * fetched-at-install-time add-on (Gary, 2026-11-15: ARC v10
 * as an offline worldmap plugin, "fetched at install time
 * (from its repo), NOT bundled inside Lucid's asar, NOT
 * pre-downloaded" — the ARC Server pattern).
 *
 * Channels (the renderer consumes exactly these names):
 *   worldmap:install — fetch the repo tarball for the repo's
 *     HEAD commit (GitHub API → codeload), extract to a
 *     staging dir, shape-verify the package subdir
 *     (including the offline markers), then one atomic
 *     rename into place (see
 *     electron/services/worldmapDownload.ts). Takes NO
 *     arguments from the renderer: the URLs are built in
 *     the main process from constants + the API-fetched SHA,
 *     so the main process never downloads an arbitrary URL.
 *   worldmap:uninstall — remove every fetched copy.
 *   worldmap:status — what the main process sees
 *     installed (the on-disk truth: a versioned directory
 *     whose package dir has a valid offline shape). The
 *     renderer reads the installed identity from settings;
 *     this is what it is checked against.
 *
 * The electron project must not value-import from src/
 * (TS6307); the wire types below are type-imported only.
 */
import type { IpcMain } from 'electron';
import {
  worldmapStatus,
  installWorldmap,
  uninstallWorldmap,
} from '../services/worldmapDownload';
import type {
  WorldmapInstallResult,
  WorldmapStatusResult,
} from '../../src/lib/worldmapAddon';

export function setupWorldmapHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'worldmap:install',
    async (): Promise<WorldmapInstallResult> => {
      return installWorldmap();
    },
  );

  ipcMain.handle(
    'worldmap:uninstall',
    async (): Promise<{ ok: boolean; error?: string }> => {
      return uninstallWorldmap();
    },
  );

  ipcMain.handle(
    'worldmap:status',
    async (): Promise<WorldmapStatusResult> => {
      return worldmapStatus();
    },
  );
}
