/**
 * ARC Server add-on IPC — the main-process side of the
 * fetched-at-install-time add-on (Gary, 2026-11-14 ~14:53
 * PST: ARC Server is an installable add-on, "fetched at
 * install time (from its repo/release), NOT bundled inside
 * Lucid's asar, NOT pre-downloaded").
 *
 * Channels (the renderer consumes exactly these names):
 *   arc-server:install — fetch the ARC-Server repo tarball
 *     for the repo's HEAD commit (GitHub API → codeload),
 *     extract to a staging dir, shape-verify, then one
 *     atomic rename into place (see
 *     electron/services/arcServerDownload.ts). Takes NO
 *     arguments from the renderer: the URLs are built in
 *     the main process from constants + the API-fetched SHA,
 *     so the main process never downloads an arbitrary URL.
 *   arc-server:uninstall — remove every fetched copy.
 *   arc-server:status — what the main process sees
 *     installed (the on-disk truth: a versioned directory
 *     with a valid shape). The renderer reads the installed
 *     identity from settings; this is what it is checked
 *     against.
 *
 * The electron project must not value-import from src/
 * (TS6307); the wire types below are type-imported only.
 */
import type { IpcMain } from 'electron';
import {
  arcServerStatus,
  installArcServer,
  uninstallArcServer,
} from '../services/arcServerDownload';
import type {
  ArcServerInstallResult,
  ArcServerStatusResult,
} from '../../src/lib/arcServerAddon';

export function setupArcServerHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'arc-server:install',
    async (): Promise<ArcServerInstallResult> => {
      return installArcServer();
    },
  );

  ipcMain.handle(
    'arc-server:uninstall',
    async (): Promise<{ ok: boolean; error?: string }> => {
      return uninstallArcServer();
    },
  );

  ipcMain.handle(
    'arc-server:status',
    async (): Promise<ArcServerStatusResult> => {
      return arcServerStatus();
    },
  );
}
