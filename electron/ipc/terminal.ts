import { IpcMain, BrowserWindow } from 'electron';
// Switched to simpleTerminal (child_process) instead of node-pty
import {
  createTerminal,
  writeToTerminal,
  resizeTerminal,
  destroyTerminal,
  getTerminalCwd,
} from '../services/simpleTerminal';
import { runCommand } from '../core/tools/commandTools';

export function setupTerminalHandlers(ipcMain: IpcMain): void {
  // Create a new terminal instance
  ipcMain.handle('terminal:create', async (event, id: string, cwd?: string): Promise<void> => {
    const sender = event.sender;
    createTerminal(
      id,
      cwd,
      (data) => {
        // Send terminal output to renderer
        if (!sender.isDestroyed()) {
          sender.send('terminal:data', id, data);
        }
      },
      (code) => {
        // Notify renderer that terminal has exited
        if (!sender.isDestroyed()) {
          sender.send('terminal:exit', id, code);
        }
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
