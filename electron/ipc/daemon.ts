/**
 * File-watcher daemon (LuciferWatcher) management.
 *
 * The watcher (LUCID-BACKEND/core/lucifer_watcher.py) needs a long-lived
 * process, but the Python agent runs one-shot per call (stdio_agent.py).
 * So Electron spawns the watcher as a background Python subprocess and
 * manages it the way the agent manages the fan daemon (see
 * _handle_fan_command in core/enhanced_agent.py): subprocess.Popen to
 * start, `pgrep -f <script>` for status, `pkill -f <script>` to stop.
 *
 * Mode: watch (suggest-only) by default. Autofix runs ONLY when the
 * `daemonAutoFix` setting is explicitly true — Gary has not decided
 * autofix vs suggest yet, so the default must stay watch.
 *
 * Commit tracking: when the `daemonCommitTracking` setting is on, the
 * watcher is started with --commit-tracking and logs a `watch_commit`
 * event each time HEAD advances in a watched git repo (read-only —
 * the watcher never commits anything itself). When the setting is off,
 * the flag is not passed and no commits are tracked. Toggling the
 * setting restarts a running daemon so the flag takes effect, the same
 * way the autofix toggle does.
 */
import { spawn, spawnSync, execFile, ChildProcess } from 'child_process';
import { IpcMain, app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { settings } from '../services/secureStorage';
import { getPythonCommand } from '../core/pythonPath';
import {
  mapWatcherEventsToLogs,
  DaemonLogEntry,
  DaemonVerbosity,
  WatcherEvent,
} from './daemonLogs';

const WATCHER_SCRIPT = 'lucifer_watcher.py';
const WATCHER_PATTERN = 'lucifer_watcher.py';

export interface DaemonStatus {
  running: boolean;
  pids: string[];
  mode: 'watch' | 'autofix' | null;
  paths: string[];
  /** True when the (running or next) watcher tracks commits. */
  commitTracking: boolean;
}

export interface DaemonStartResult {
  success: boolean;
  alreadyRunning?: boolean;
  pid?: number;
  mode?: 'watch' | 'autofix';
  paths?: string[];
  commitTracking?: boolean;
  error?: string;
}

let watcherProc: ChildProcess | null = null;
let watcherMode: 'watch' | 'autofix' | null = null;
let watcherCommitTracking: boolean | null = null;

function resolveBackendDir(): string | null {
  const packaged = app.isPackaged
    ? path.join(process.resourcesPath, 'LUCID-BACKEND')
    : path.join(__dirname, '../LUCID-BACKEND');
  try {
    if (fs.existsSync(packaged) && fs.statSync(packaged).isDirectory()) {
      return packaged;
    }
  } catch {
    // Ignore — a missing backend means "no daemon".
  }
  return null;
}

function getWatcherScript(): string | null {
  const backendDir = resolveBackendDir();
  if (!backendDir) return null;
  const script = path.join(backendDir, 'core', WATCHER_SCRIPT);
  try {
    if (fs.existsSync(script) && fs.statSync(script).isFile()) return script;
  } catch {
    // Ignore.
  }
  return null;
}

/** LuciferLogger's file — the watcher's structured event log. */
function getMemoryLogPath(): string {
  return path.join(os.homedir(), 'LuciferAI', 'logs', 'lucifer_memory.json');
}

/** Plain-text stdout/stderr of the watcher process (fan_terminal.log pattern). */
function getStdoutLogPath(): string {
  return path.join(os.homedir(), 'LuciferAI', 'logs', 'watcher.log');
}

function readDaemonSettings(): {
  enabled: boolean;
  autoFix: boolean;
  commitTracking: boolean;
  paths: string[];
  retention: number;
  verbosity: DaemonVerbosity;
} {
  const paths = settings.get<string[]>('daemonWatchPaths');
  const verbosity = settings.get<string>('daemonLogVerbosity');
  return {
    enabled: settings.get<boolean>('daemonEnabled') ?? false,
    autoFix: settings.get<boolean>('daemonAutoFix') ?? false,
    commitTracking: settings.get<boolean>('daemonCommitTracking') ?? false,
    paths: Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : [],
    retention: settings.get<number>('daemonLogRetention') ?? 30,
    verbosity:
      verbosity === 'minimal' ||
      verbosity === 'normal' ||
      verbosity === 'verbose' ||
      verbosity === 'debug'
        ? verbosity
        : 'normal',
  };
}

/**
 * The argv for the watcher process. Pure — no spawn, so the flag wiring
 * is unit-tested directly. `--commit-tracking` is passed only when the
 * setting is on; the watcher tracks no commits without it.
 */
export function buildWatcherArgs(
  script: string,
  paths: string[],
  mode: 'watch' | 'autofix',
  commitTracking: boolean,
): string[] {
  return [
    '-u',
    script,
    '--paths',
    ...paths,
    '--mode',
    mode,
    ...(commitTracking ? ['--commit-tracking'] : []),
  ];
}

function isWatcherProcessAlive(): boolean {
  return !!watcherProc && watcherProc.exitCode === null && !watcherProc.killed;
}

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile(file, args, (error, stdout) => {
      resolve({ stdout: stdout || '', code: error ? (error as { code?: number }).code ?? 1 : 0 });
    });
  });
}

/** PIDs of running watcher processes (fan-daemon `pgrep -f` pattern). */
async function pgrepWatcher(): Promise<string[]> {
  if (process.platform === 'win32') return [];
  try {
    const { stdout, code } = await execFileAsync('pgrep', ['-f', WATCHER_PATTERN]);
    if (code !== 0 || !stdout.trim()) return [];
    return stdout.trim().split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  const pids = await pgrepWatcher();
  const running = isWatcherProcessAlive() || pids.length > 0;
  const { commitTracking } = readDaemonSettings();
  return {
    running,
    pids,
    mode: running ? watcherMode : null,
    paths: readDaemonSettings().paths,
    // While running, report the flag the live process was started with;
    // when stopped, the setting is what the next start will use.
    commitTracking: running ? (watcherCommitTracking ?? commitTracking) : commitTracking,
  };
}

export async function startDaemon(): Promise<DaemonStartResult> {
  if (isWatcherProcessAlive()) {
    const status = await getDaemonStatus();
    return {
      success: true,
      alreadyRunning: true,
      pid: watcherProc?.pid,
      mode: status.mode ?? undefined,
      paths: status.paths,
      commitTracking: status.commitTracking,
    };
  }

  // Orphan cleanup: a watcher from a previous app session (or a stale
  // process) would otherwise run alongside the new one. Kill it first so
  // there is ever exactly one watcher.
  const orphans = await pgrepWatcher();
  if (orphans.length > 0 && process.platform !== 'win32') {
    await execFileAsync('pkill', ['-f', WATCHER_PATTERN]);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const { autoFix, commitTracking, paths } = readDaemonSettings();
  if (paths.length === 0) {
    return {
      success: false,
      error: 'No directories to watch. Add a directory in Settings › Daemon first.',
    };
  }

  const script = getWatcherScript();
  if (!script) {
    return { success: false, error: 'Watcher script not found (LUCID-BACKEND/core/lucifer_watcher.py).' };
  }

  // Autofix only when the setting is explicitly on; default is watch
  // (suggest-only) until Gary decides autofix vs suggest.
  const mode: 'watch' | 'autofix' = autoFix ? 'autofix' : 'watch';
  // Resolved to an absolute path: Finder-launched apps get an empty
  // PATH from launchd, so a bare 'python3' spawn fails with ENOENT
  // even though python3 exists on disk (see core/pythonPath.ts).
  // When nothing resolves, this falls back to the bare command and
  // the 'error' handler below degrades gracefully instead of crashing.
  const pythonCommand = getPythonCommand();

  try {
    const logsDir = path.join(os.homedir(), 'LuciferAI', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    // Open the log file as an fd and hand the fd to spawn. (A WriteStream
    // does NOT work here: createWriteStream opens asynchronously, so at
    // spawn time its fd is null and Node rejects the stdio entry with
    // "The argument 'stdio' is invalid". The child dups the fd at fork,
    // so the parent's copy can be closed right after spawn returns.)
    const logFd = fs.openSync(getStdoutLogPath(), 'a');

    // -u: unbuffered stdout, so the watcher's prints reach watcher.log live.
    // (Without it Python buffers stdout when redirected and the log stays
    // empty until the buffer fills.)
    let proc: ChildProcess;
    try {
      proc = spawn(
        pythonCommand,
        buildWatcherArgs(script, paths, mode, commitTracking),
        {
          cwd: path.dirname(script),
          stdio: ['ignore', logFd, logFd],
          env: { ...process.env },
        },
      );
    } finally {
      // The child dups the fd at fork, so the parent's copy can be closed
      // right after spawn returns (or throws).
      fs.closeSync(logFd);
    }
    watcherProc = proc;
    watcherMode = mode;
    watcherCommitTracking = commitTracking;

    proc.on('error', (err) => {
      console.error('Watcher daemon failed to spawn:', err);
      if (watcherProc === proc) {
        watcherProc = null;
        watcherMode = null;
        watcherCommitTracking = null;
      }
    });
    proc.on('exit', (code) => {
      console.log(`Watcher daemon exited with code ${code}`);
      if (watcherProc === proc) {
        watcherProc = null;
        watcherMode = null;
        watcherCommitTracking = null;
      }
    });

    // Give the process a moment to fail fast (bad python, missing script).
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (proc.exitCode !== null) {
      watcherProc = null;
      watcherMode = null;
      watcherCommitTracking = null;
      return { success: false, error: `Watcher exited immediately (code ${proc.exitCode}). See ~/LuciferAI/logs/watcher.log.` };
    }

    return { success: true, pid: proc.pid, mode, paths, commitTracking };
  } catch (error) {
    watcherProc = null;
    watcherMode = null;
    watcherCommitTracking = null;
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Synchronous stop for the shutdown path (will-quit cannot await).
 * Kills the managed process and any orphaned watcher by pattern.
 */
export function stopDaemonSync(): void {
  try {
    if (isWatcherProcessAlive() && watcherProc) {
      watcherProc.kill('SIGTERM');
      watcherProc = null;
      watcherMode = null;
      watcherCommitTracking = null;
    }
  } catch {
    // Already gone.
  }
  if (process.platform !== 'win32') {
    try {
      spawnSync('pkill', ['-f', WATCHER_PATTERN]);
    } catch {
      // pkill missing or nothing to kill.
    }
  }
}

export async function stopDaemon(): Promise<{ success: boolean; error?: string }> {
  try {
    if (isWatcherProcessAlive() && watcherProc) {
      watcherProc.kill('SIGTERM');
      // Brief grace period, then force.
      const proc = watcherProc;
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (proc.exitCode === null) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }
      watcherProc = null;
      watcherMode = null;
      watcherCommitTracking = null;
    }

    // Orphan cleanup (fan-daemon pkill pattern): if a watcher is still
    // listed by pgrep after the handle is gone, kill it by pattern.
    const pids = await pgrepWatcher();
    if (pids.length > 0 && process.platform !== 'win32') {
      await execFileAsync('pkill', ['-f', WATCHER_PATTERN]);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function restartDaemonIfRunning(): Promise<void> {
  const status = await getDaemonStatus();
  if (!status.running) return;
  await stopDaemon();
  await startDaemon();
}

export function getWatchPaths(): string[] {
  return readDaemonSettings().paths;
}

/**
 * The Settings checkbox path for commit tracking: save the setting
 * (persisted through the settings store, so it survives a restart) and
 * restart a running daemon so the watcher picks up the new flag. A
 * stopped daemon needs no restart — the next start reads the setting.
 */
export async function setCommitTracking(
  enabled: boolean,
): Promise<{ commitTracking: boolean; restarted: boolean }> {
  settings.set('daemonCommitTracking', enabled);
  const wasRunning = (await getDaemonStatus()).running;
  if (wasRunning) await restartDaemonIfRunning();
  return { commitTracking: enabled, restarted: wasRunning };
}

export async function addWatchPath(dirPath: string): Promise<{ paths: string[]; restarted: boolean }> {
  const current = readDaemonSettings().paths;
  const paths = current.includes(dirPath) ? current : [...current, dirPath];
  settings.set('daemonWatchPaths', paths);
  const wasRunning = (await getDaemonStatus()).running;
  if (wasRunning) await restartDaemonIfRunning();
  return { paths, restarted: wasRunning };
}

export async function removeWatchPath(dirPath: string): Promise<{ paths: string[]; restarted: boolean }> {
  const paths = readDaemonSettings().paths.filter((p) => p !== dirPath);
  settings.set('daemonWatchPaths', paths);
  const wasRunning = (await getDaemonStatus()).running;
  if (wasRunning) await restartDaemonIfRunning();
  return { paths, restarted: wasRunning };
}

export async function getDaemonLogs(): Promise<DaemonLogEntry[]> {
  try {
    const logPath = getMemoryLogPath();
    if (!fs.existsSync(logPath)) return [];
    const raw = fs.readFileSync(logPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const events = parsed.filter(
      (e): e is WatcherEvent =>
        !!e && typeof e === 'object' && typeof (e as WatcherEvent).event === 'string',
    );
    const { retention, verbosity } = readDaemonSettings();
    return mapWatcherEventsToLogs(events, retention, verbosity);
  } catch (error) {
    console.error('Failed to read daemon logs:', error);
    return [];
  }
}

/** Start the watcher on launch when the setting says so and paths exist. */
export async function maybeAutoStartDaemon(): Promise<DaemonStartResult | null> {
  const { enabled, paths } = readDaemonSettings();
  if (!enabled || paths.length === 0) return null;
  const result = await startDaemon();
  if (!result.success) {
    console.error('Watcher daemon auto-start failed:', result.error);
  }
  return result;
}

export function setupDaemonHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('daemon:start', async (): Promise<DaemonStartResult> => startDaemon());
  ipcMain.handle('daemon:stop', async (): Promise<{ success: boolean; error?: string }> => stopDaemon());
  ipcMain.handle('daemon:status', async (): Promise<DaemonStatus> => getDaemonStatus());
  ipcMain.handle('daemon:setCommitTracking', async (_, enabled: boolean) => setCommitTracking(enabled));
  ipcMain.handle('daemon:getPaths', async (): Promise<string[]> => getWatchPaths());
  ipcMain.handle('daemon:addPath', async (_, dirPath: string) => addWatchPath(dirPath));
  ipcMain.handle('daemon:removePath', async (_, dirPath: string) => removeWatchPath(dirPath));
  ipcMain.handle('daemon:getLogs', async (): Promise<DaemonLogEntry[]> => getDaemonLogs());
}
