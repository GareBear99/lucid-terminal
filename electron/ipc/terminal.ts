import { IpcMain, BrowserWindow } from 'electron';
// REAL terminal (Gary, 2026-11-07: "terminal is not a terminal at
// all"): node-pty via shellManager - a real TTY with a login
// interactive shell. simpleTerminal (plain child_process pipe) is
// retired: a pipe is not a TTY, so the shell never went interactive.
import {
  createTerminal,
  writeToTerminal,
  resizeTerminal,
  destroyTerminal,
  getTerminalCwd,
} from '../services/shellManager';
import { runCommand } from '../core/tools/commandTools';

/**
 * Per-tab PTY owner registry (tab detach, Gary 2026-11-09): the
 * WebContents a tab's output is routed to. One tab, one owner,
 * one window at all times — the registry is the single source of
 * truth for where a tab lives, and a tab is never in two windows
 * or in zero windows.
 *
 * `terminal:create` used to close over the creating `event.sender`
 * and send `terminal:data` / `terminal:exit` / `terminal:cwd` to
 * THAT sender only. The callbacks now look the owner up here at
 * send time, so a detach/remount re-targets the PTY output by
 * moving one map entry — the PTY itself never moves, is never
 * re-created, and is never destroyed by a move.
 */
const terminalOwners = new Map<string, Electron.WebContents>();

export function setTerminalOwner(id: string, owner: Electron.WebContents): void {
  terminalOwners.set(id, owner);
}

export function getTerminalOwner(id: string): Electron.WebContents | undefined {
  const owner = terminalOwners.get(id);
  if (owner && owner.isDestroyed()) {
    terminalOwners.delete(id);
    return undefined;
  }
  return owner;
}

export function clearTerminalOwner(id: string): void {
  terminalOwners.delete(id);
}

/** The live owner for a tab, or undefined when the tab has no window. */
function sendToOwner(id: string, channel: string, ...args: unknown[]): void {
  const owner = getTerminalOwner(id);
  if (!owner) return;
  owner.send(channel, ...args);
}

export function setupTerminalHandlers(ipcMain: IpcMain): void {
  // Create a new terminal instance
  ipcMain.handle('terminal:create', async (event, id: string, cwd?: string): Promise<void> => {
    setTerminalOwner(id, event.sender);
    createTerminal(
      id,
      cwd,
      (data) => {
        // Send terminal output to the tab's CURRENT owner — the
        // registry, not the creating sender (see above).
        sendToOwner(id, 'terminal:data', id, data);
      },
      (code) => {
        // Notify the current owner that the terminal has exited.
        sendToOwner(id, 'terminal:exit', id, code);
      },
      (cwd) => {
        // The shell moved (OSC 7 / cd) - the renderer's header
        // follows the live cwd.
        sendToOwner(id, 'terminal:cwd', id, cwd);
      }
    );
  });

  // Write data to terminal
  ipcMain.on('terminal:write', (_, id: string, data: string) => {
    writeToTerminal(id, data);
  });

  // Resize terminal
  ipcMain.on('terminal:resize', (_, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows);
  });

  // Destroy terminal
  ipcMain.on('terminal:destroy', (_, id: string) => {
    clearTerminalOwner(id);
    destroyTerminal(id);
  });

  // Get current working directory
  ipcMain.handle('terminal:getCwd', async (_, id: string): Promise<string> => {
    return getTerminalCwd(id);
  });

  // Execute a one-shot shell command and return its output.
  // Reuses the command tools' runCommand (30s timeout, 10MB buffer,
  // refuses risky commands such as `sudo`, `rm -rf /`, `curl | bash`).
  // No new privilege: the renderer already has unrestricted PTY shell
  // access via terminal:create/write.
  ipcMain.handle('terminal:executeCommand', async (_, command: string) => {
    const result = await runCommand(command);
    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  });
}
