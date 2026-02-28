import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import { settings } from './secureStorage';

interface TerminalInstance {
  process: ChildProcess;
  cwd: string;
  isDestroyed: boolean;
}

const terminals = new Map<string, TerminalInstance>();

function getDefaultShell(): string {
  // Always use system shell first, ignore invalid settings
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  
  // On Unix/macOS, use SHELL environment variable or fallback to bash
  const shell = process.env.SHELL || '/bin/bash';
  console.log(`[SimpleTerminal] Detected shell: ${shell}`);
  return shell;
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

  console.log(`[SimpleTerminal] Creating terminal ${id} with shell: ${shell}, cwd: ${workingDir}`);

  try {
    // Spawn shell as child process
    const childProcess = spawn(shell, [], {
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      shell: false,
    });

    const terminalInstance: TerminalInstance = {
      process: childProcess,
      cwd: workingDir,
      isDestroyed: false,
    };

    terminals.set(id, terminalInstance);

    // Don't send initial prompt - terminal UI will show its own
    // Shell is ready, just waiting for commands

    // Handle stdout
    childProcess.stdout?.on('data', (data) => {
      if (terminalInstance.isDestroyed) return;
      try {
        const output = data.toString();
        onData?.(output);
      } catch (err) {
        console.error(`[SimpleTerminal] Error handling stdout for ${id}:`, err);
      }
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data) => {
      if (terminalInstance.isDestroyed) return;
      try {
        const output = data.toString();
        onData?.(output);
      } catch (err) {
        console.error(`[SimpleTerminal] Error handling stderr for ${id}:`, err);
      }
    });

    // Handle exit
    childProcess.on('exit', (code) => {
      if (terminalInstance.isDestroyed) return;
      terminalInstance.isDestroyed = true;
      console.log(`[SimpleTerminal] Terminal ${id} exited with code ${code}`);
      onExit?.(code || 0);
      terminals.delete(id);
    });

    // Handle errors
    childProcess.on('error', (error) => {
      console.error(`[SimpleTerminal] Error in terminal ${id}:`, error);
      if (!terminalInstance.isDestroyed) {
        terminalInstance.isDestroyed = true;
        onData?.(`\r\nError: ${error.message}\r\n`);
        onExit?.(1);
        terminals.delete(id);
      }
    });

    console.log(`[SimpleTerminal] ✅ Terminal ${id} created successfully`);
  } catch (error) {
    console.error(`[SimpleTerminal] Failed to create terminal ${id}:`, error);
    throw error;
  }
}

export function writeToTerminal(id: string, data: string): void {
  const terminal = terminals.get(id);
  if (terminal && !terminal.isDestroyed && terminal.process.stdin) {
    try {
      terminal.process.stdin.write(data);
    } catch (error) {
      console.error(`[SimpleTerminal] Failed to write to terminal ${id}:`, error);
    }
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  // Simple terminal doesn't support resize
  console.log(`[SimpleTerminal] Resize not supported for terminal ${id}`);
}

export function destroyTerminal(id: string): void {
  const terminal = terminals.get(id);
  if (terminal && !terminal.isDestroyed) {
    terminal.isDestroyed = true;
    try {
      terminal.process.kill('SIGTERM');
      // Force kill after 1 second if still alive
      setTimeout(() => {
        if (!terminal.process.killed) {
          terminal.process.kill('SIGKILL');
        }
      }, 1000);
    } catch (error) {
      console.error(`[SimpleTerminal] Error killing terminal ${id}:`, error);
    }
    terminals.delete(id);
  }
}

export function getTerminalCwd(id: string): string {
  const terminal = terminals.get(id);
  return terminal?.cwd || getDefaultCwd();
}

export function destroyAllTerminals(): void {
  terminals.forEach((_, id) => destroyTerminal(id));
}
