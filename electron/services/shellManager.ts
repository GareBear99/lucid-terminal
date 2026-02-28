import * as pty from 'node-pty';
import os from 'os';
import { existsSync } from 'fs';
import { settings } from './secureStorage';

interface TerminalInstance {
  pty: pty.IPty;
  cwd: string;
  isDestroyed: boolean;
}

const terminals = new Map<string, TerminalInstance>();

function getDefaultShell(): string {
  const customShell = settings.get<string>('shell');
  if (customShell && existsSync(customShell)) {
    return customShell;
  }

  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  
  // Try multiple shell options on Unix-like systems
  const shellCandidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh'
  ].filter(Boolean) as string[];
  
  for (const shell of shellCandidates) {
    if (existsSync(shell)) {
      console.log(`Using shell: ${shell}`);
      return shell;
    }
  }
  
  console.warn('No valid shell found, falling back to /bin/bash');
  return '/bin/bash';
}

function getDefaultCwd(): string {
  const customDir = settings.get<string>('startupDirectory');
  if (customDir) return customDir;
  return os.homedir();
}

export function createTerminal(
  id: string,
  cwd?: string,
  onData?: (data: string) => void,
  onExit?: (code: number) => void
): void {
  if (terminals.has(id)) {
    destroyTerminal(id);
  }

  const shell = getDefaultShell();
  const workingDir = cwd || getDefaultCwd();

  // Validate shell exists
  if (!existsSync(shell)) {
    const error = `Shell not found: ${shell}`;
    console.error(`Failed to create terminal ${id}: ${error}`);
    throw new Error(error);
  }

  console.log(`Creating terminal ${id} with shell: ${shell}, cwd: ${workingDir}`);

  try {
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });

    const terminalInstance: TerminalInstance = {
      pty: ptyProcess,
      cwd: workingDir,
      isDestroyed: false,
    };

    terminals.set(id, terminalInstance);

    ptyProcess.onData((data) => {
      if (terminalInstance.isDestroyed) return;
      try {
        onData?.(data);
        updateCwd(id, data);
      } catch (err) {
        console.error(`Error handling terminal data for ${id}:`, err);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (terminalInstance.isDestroyed) return;
      terminalInstance.isDestroyed = true;
      try {
        onExit?.(exitCode);
      } catch (err) {
        console.error(`Error handling terminal exit for ${id}:`, err);
      }
      terminals.delete(id);
    });
  } catch (error) {
    console.error(`Failed to create terminal ${id}:`, error);
  }
}

export function writeToTerminal(id: string, data: string): void {
  const terminal = terminals.get(id);
  if (terminal && !terminal.isDestroyed) {
    try {
      terminal.pty.write(data);
    } catch (error) {
      console.error(`Failed to write to terminal ${id}:`, error);
    }
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const terminal = terminals.get(id);
  // Only resize if explicitly valid and not destroyed
  if (terminal && !terminal.isDestroyed && cols > 0 && rows > 0) {
    try {
      terminal.pty.resize(Math.max(1, cols), Math.max(1, rows));
    } catch (error) {
      // Ignore resize errors as they are common during teardown
    }
  }
}

export function destroyTerminal(id: string): void {
  const terminal = terminals.get(id);
  if (terminal && !terminal.isDestroyed) {
    terminal.isDestroyed = true;
    try {
      terminal.pty.kill();
    } catch (error) {
      console.error(`Error killing terminal ${id}:`, error);
    }
    terminals.delete(id);
  }
}

export function getTerminalCwd(id: string): string {
  const terminal = terminals.get(id);
  return terminal?.cwd || getDefaultCwd();
}

// Basic cwd tracking - tries to detect cd commands
function updateCwd(id: string, data: string): void {
  const terminal = terminals.get(id);
  if (!terminal || terminal.isDestroyed) return;

  // This is a simplified approach - in production, you might want
  // to use more sophisticated methods like reading /proc on Linux
  // or using PowerShell's $PWD on Windows
  const cdMatch = data.match(/(?:^|\n)\s*cd\s+(.+?)(?:\r|\n|$)/);
  if (cdMatch) {
    const newDir = cdMatch[1].trim().replace(/["']/g, '');
    // Handle relative and absolute paths
    if (newDir.startsWith('/') || /^[A-Za-z]:/.test(newDir)) {
      terminal.cwd = newDir;
    } else if (newDir === '..') {
      const parts = terminal.cwd.split(/[\\/]/);
      parts.pop();
      terminal.cwd = parts.join('\\') || 'C:\\';
    } else if (newDir === '~') {
      terminal.cwd = os.homedir();
    }
  }
}

export function destroyAllTerminals(): void {
  terminals.forEach((_, id) => destroyTerminal(id));
}
