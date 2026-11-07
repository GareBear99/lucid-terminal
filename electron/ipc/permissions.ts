/**
 * Permissions IPC — the bridge between Lucid's renderer and the
 * permissions probe service (Gary, 2026-11-07 ~02:47 PST: "we
 * need to track everything im allowing"). The renderer never
 * probes the OS directly; every state comes from the main
 * process, in one place, so it can be audited.
 *
 * Channels:
 * - permissions:getSnapshot — probe every tracked permission
 *   (cached 30s; force bypasses the cache, e.g. right after the
 *   user grants something in System Settings and hits Refresh).
 * - permissions:request — prompt for a permission macOS lets
 *   Lucid ask for (Screen Recording, Microphone, Camera).
 *   Accessibility / Full Disk Access cannot be prompted for.
 * - permissions:openSettings — open the System Settings pane for
 *   a permission.
 */
import { IpcMain } from 'electron';
import type { PermissionId, PermissionSnapshot } from '../../src/lib/permissions';
import {
  openPermissionSettings,
  probePermissions,
  requestPermission,
} from '../services/permissions';

export function setupPermissionsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'permissions:getSnapshot',
    async (_event, force?: boolean): Promise<PermissionSnapshot[]> => {
      return probePermissions(Boolean(force));
    },
  );

  ipcMain.handle(
    'permissions:request',
    async (_event, id: PermissionId): Promise<boolean> => {
      return requestPermission(id);
    },
  );

  ipcMain.handle(
    'permissions:openSettings',
    async (_event, id: PermissionId): Promise<boolean> => {
      return openPermissionSettings(id);
    },
  );
}
