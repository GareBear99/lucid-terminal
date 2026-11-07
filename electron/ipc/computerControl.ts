/**
 * Computer-control IPC — the bridge between Lucid's renderer and
 * the computer-control segment's core (Gary, 2026-11-06). One core
 * instance lives here in the main process; every action crosses
 * this bridge, so it can be logged, locked, and audited in one
 * place. The renderer never touches the OS directly.
 *
 * The lock is read fresh from the persisted `computerControlLocked`
 * setting on every action (authoritative in the main process — the
 * renderer cannot spoof it). The renderer toggles the lock through
 * the normal settings flow (`settings:set`); there is no separate
 * setLocked channel. Read-only calls (listApps, observe, getState)
 * are never blocked by the lock — observing the screen still works
 * when locked.
 *
 * Local entry point: an agent running inside Lucid calls
 * `window.lucidAPI.computerControl.*`. An EXTERNAL agent (a local
 * MCP server / local API on the Mac) is the open connection step,
 * not built here — Gary's call.
 */
import { IpcMain } from 'electron';
import { settings } from '../services/secureStorage';
import {
  COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS,
  createComputerControlCore,
  getComputerControlSegmentState,
  listComputerControlApps,
  observeComputerControl,
  runComputerControlAction,
} from '../../src/lib/computerControl';
import type {
  ComputerControlAction,
  ComputerControlActionResult,
  ComputerControlAppWindow,
  ComputerControlObservation,
  ComputerControlSegmentState,
} from '../../src/lib/computerControl';
import { createMacComputerControlDriver } from '../services/computerControlDriver';

export function setupComputerControlHandlers(ipcMain: IpcMain): void {
  const driver = createMacComputerControlDriver();
  const core = createComputerControlCore(driver, {
    readLocked: () => settings.get<boolean>('computerControlLocked') ?? false,
    readProtectedTargets: () =>
      settings.get<string[]>('computerControlProtectedTargets') ?? [
        ...COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS,
      ],
    ownPid: process.pid,
  });

  ipcMain.handle(
    'computer-control:getState',
    async (): Promise<ComputerControlSegmentState> => {
      return getComputerControlSegmentState(core);
    },
  );

  ipcMain.handle(
    'computer-control:listApps',
    async (): Promise<ComputerControlAppWindow[]> => {
      return listComputerControlApps(core);
    },
  );

  ipcMain.handle(
    'computer-control:observe',
    async (_event, targetId: string | null): Promise<ComputerControlObservation> => {
      return observeComputerControl(core, targetId);
    },
  );

  ipcMain.handle(
    'computer-control:action',
    async (_event, action: ComputerControlAction): Promise<ComputerControlActionResult> => {
      return runComputerControlAction(core, action);
    },
  );
}
