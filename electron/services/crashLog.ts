/**
 * Advanced crash log — the crash log Lucid did not have (Gary,
 * 2026-11-16: "should make an advanced crash log").
 *
 * The problem it solves: Lucid kept crashing on launch for Gary
 * and there was nothing to read — no macOS DiagnosticReports
 * entry, no Lucid log file, no stack trace. We were guessing.
 * This records, with timestamps and full context, every crash
 * the app can see:
 *
 * - main-process uncaught exceptions + unhandled rejections
 *   (process handlers, installed FIRST at the top of
 *   electron/main.ts, before anything else can throw at
 *   startup);
 * - renderer crashes + unresponsive renderers (webContents
 *   'render-process-gone' / 'unresponsive' / 'responsive');
 * - renderer uncaught errors + unhandled rejections (window
 *   hooks in src/lib/crashLog.ts, reported to main over IPC
 *   and written to the same file);
 * - a session-start entry, so every log opens with the
 *   context of the run that crashed.
 *
 * The log lives on disk at `~/.lucid/crash-log/`, one file per
 * run (`crash-<ISO time>-<session>.log`), with a `latest.log`
 * symlink to the newest run. Writes are synchronous
 * (appendFile + fsync) — the entry survives the crash that
 * writes it; there is no buffering that loses the last entry.
 * Files rotate (newest 20 kept). The log is human-readable
 * and self-documenting (each file opens with a header saying
 * what it is and where it lives). Settings > Crash log reads
 * it in the app; the file is the deliverable.
 *
 * This module is self-contained: it imports only node builtins
 * (fs/os/path/crypto) plus a type-only electron import, so it
 * is importable in plain node (tests, child processes) and the
 * electron project never value-imports from src/ (TS6307 — the
 * node project only lists electron files plus a few src/lib
 * files). The renderer never formats entries — it sends
 * structured payloads and main formats everything, so there
 * is exactly one formatter and it cannot drift.
 *
 * Honesty rules (the event-log standard, src/lib/eventLog.ts):
 * a field that cannot be determined is the literal 'unknown',
 * never invented. A logging failure never throws into the app
 * — every write is best-effort with a console.error fallback.
 * An uncaught exception / unhandled rejection still crashes
 * the process (process.exit(1)) — that is Node's default
 * behaviour, and swallowing a fatal error would leave Lucid
 * running in a broken state. The crash log records the crash;
 * it does not prevent it.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The crash-log directory under the Lucid home dir. */
export const CRASH_LOG_DIR_NAME = 'crash-log';

/** The symlink name that always points at the newest run. */
export const CRASH_LOG_LATEST_NAME = 'latest.log';

/** How many per-run files are kept — older runs are deleted
 *  at the next session start. Bounded, like everything else:
 *  a crash loop must not fill the disk with logs. */
export const CRASH_LOG_MAX_FILES = 20;

/** The most bytes a read returns — the TAIL of the file, so
 *  a huge log still ends with the crash itself. */
export const CRASH_LOG_MAX_READ_BYTES = 200_000;

/** The most a single IPC-reported message / stack may carry —
 *  a rogue renderer cannot fill the disk through the report
 *  channel. */
export const CRASH_LOG_MAX_PAYLOAD_CHARS = 20_000;

/** The literal recorded when a context field cannot be
 *  determined — never invented (event-log standard). */
export const CRASH_UNKNOWN = 'unknown';

/** Where a crash can come from. */
export type CrashEntryKind =
  /** The session started (the header entry of every run). */
  | 'startup'
  /** Main process: an uncaught exception. */
  | 'main-uncaught-exception'
  /** Main process: an unhandled promise rejection. */
  | 'main-unhandled-rejection'
  /** Renderer: the renderer process died. */
  | 'renderer-crashed'
  /** Renderer: the renderer stopped responding. */
  | 'renderer-unresponsive'
  /** Renderer: the renderer responded again after a hang. */
  | 'renderer-responsive'
  /** Renderer: window.onerror / an uncaught error. */
  | 'renderer-error'
  /** Renderer: an unhandled promise rejection. */
  | 'renderer-unhandled-rejection';

/** The context stamped on every entry — what was running,
 *  where, as whom, doing what, when. */
export interface CrashContext {
  /** One run's id — entries from one run group together. */
  sessionId: string;
  /** App version (app.getVersion() — package.json). */
  appVersion: string;
  /** Commit hash when available, else 'unknown'. */
  commit: string;
  /** Profile id, 'guest' for a guest session, 'unknown'. */
  profile: string;
  /** Last known view ('terminal', 'settings', …), 'unknown'. */
  view: string;
  /** process.platform ('darwin', 'win32', 'linux'). */
  platform: string;
  /** process.arch ('x64', 'arm64'). */
  arch: string;
  /** Electron version, 'unknown' outside Electron. */
  electronVersion: string;
  /** Chrome version, 'unknown' outside Electron. */
  chromeVersion: string;
  /** Node version. */
  nodeVersion: string;
}

/** One crash-log entry — a moment, a kind, a message, a
 *  stack, and the context of the run it happened in. */
export interface CrashEntry {
  /** ms since epoch. */
  at: number;
  /** The run it belongs to. */
  sessionId: string;
  kind: CrashEntryKind;
  /** Short human message (what happened). */
  message: string;
  /** Full stack trace, when one exists. */
  stack: string | null;
  /** Extra mechanism detail (URL, exit code, reason). */
  detail: string | null;
  /** The run's context, snapshotted at write time. */
  context: CrashContext;
}

/** A short random session id — 8 hex chars. */
export function createCrashSessionId(): string {
  return crypto.randomBytes(4).toString('hex');
}

/** The crash-log directory — `~/.lucid/crash-log/`. */
export function getCrashLogDir(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), '.lucid', CRASH_LOG_DIR_NAME);
}

/** The per-run file name — filesystem-safe ISO time +
 *  session id, so runs sort chronologically. */
export function crashLogFileName(at: number, sessionId: string): string {
  const iso = new Date(at).toISOString().replace(/[:.]/g, '-');
  return `crash-${iso}-${sessionId}.log`;
}

/** The header written at the top of every run's file — the
 *  file explains itself, so Gary can read it without asking. */
export function formatCrashLogHeader(context: CrashContext, at: number): string {
  const lines = [
    '# Lucid crash log — if Lucid crashes, the reason is in this file.',
    `# session ${context.sessionId} — started ${new Date(at).toISOString()}`,
    `# app lucid-terminal ${context.appVersion} (commit ${context.commit}) | ${context.platform} ${context.arch} | electron ${context.electronVersion} | node ${context.nodeVersion}`,
    `# location: ${getCrashLogDir()} — latest run: latest.log in the same folder.`,
    '# Send this file (or latest.log) when reporting a crash.',
    '---',
  ];
  return lines.join('\n') + '\n';
}

/** One entry as human-readable text — timestamp, kind,
 *  context line, message, stack. This is the one formatter:
 *  the renderer never formats entries. */
export function formatCrashEntry(entry: CrashEntry): string {
  const c = entry.context;
  const lines = [
    `[${new Date(entry.at).toISOString()}] [session ${entry.sessionId}] [${entry.kind}]`,
    `app lucid-terminal ${c.appVersion} (commit ${c.commit}) | ${c.platform} ${c.arch} | electron ${c.electronVersion} | profile ${c.profile} | view ${c.view}`,
    entry.message,
  ];
  if (entry.stack) lines.push(entry.stack);
  if (entry.detail) lines.push(`detail: ${entry.detail}`);
  return lines.join('\n') + '\n---\n';
}

/** The context defaults — what the process itself knows.
 *  appVersion + commit are set by main (app.getVersion() +
 *  LUCID_COMMIT); profile + view arrive from the renderer
 *  over IPC (crashLog:setContext). */
export function createDefaultCrashContext(overrides?: Partial<CrashContext>): CrashContext {
  const versions = process.versions ?? ({} as NodeJS.ProcessVersions);
  return {
    sessionId: createCrashSessionId(),
    appVersion: CRASH_UNKNOWN,
    commit: CRASH_UNKNOWN,
    profile: CRASH_UNKNOWN,
    view: CRASH_UNKNOWN,
    platform: process.platform,
    arch: process.arch,
    electronVersion: versions.electron ?? CRASH_UNKNOWN,
    chromeVersion: versions.chrome ?? CRASH_UNKNOWN,
    nodeVersion: versions.node ?? process.version ?? CRASH_UNKNOWN,
    ...overrides,
  };
}

/** The module-level context — main owns it, the renderer
 *  updates profile + view over IPC. Mutable on purpose: the
 *  context is the CURRENT run's, and entries snapshot it at
 *  write time. */
let crashContext: CrashContext = createDefaultCrashContext();

export function getCrashContext(): CrashContext {
  return { ...crashContext };
}

export function setCrashContext(partial: Partial<CrashContext>): CrashContext {
  crashContext = { ...crashContext, ...partial };
  return getCrashContext();
}

/** Build an entry from a kind + message + optional stack /
 *  detail, snapshotting the current context. */
export function createCrashEntry(input: {
  kind: CrashEntryKind;
  message: string;
  stack?: string | null;
  detail?: string | null;
  at?: number;
  context?: CrashContext;
}): CrashEntry {
  return {
    at: input.at ?? Date.now(),
    sessionId: (input.context ?? crashContext).sessionId,
    kind: input.kind,
    message: input.message,
    stack: input.stack ?? null,
    detail: input.detail ?? null,
    context: input.context ?? getCrashContext(),
  };
}

/** The writer — one run's file, sync appends + fsync, so an
 *  entry survives the crash that writes it. Injectable
 *  homeDir / now / sessionId make it unit-testable without
 *  touching the real ~/.lucid. */
export class CrashLogWriter {
  readonly dir: string;
  readonly sessionId: string;
  private currentPath: string | null = null;
  private headerWritten = false;

  constructor(opts?: { homeDir?: string; sessionId?: string; now?: () => number }) {
    this.dir = getCrashLogDir(opts?.homeDir);
    this.sessionId = opts?.sessionId ?? createCrashSessionId();
    void opts?.now;
  }

  /** The current run's file path — created on first append. */
  get currentLogPath(): string | null {
    return this.currentPath;
  }

  /** The latest.log path (symlink to the newest run). */
  get latestLogPath(): string {
    return path.join(this.dir, CRASH_LOG_LATEST_NAME);
  }

  /** Ensure the directory exists. Best-effort: false on
   *  failure, never throws. */
  ensureDir(): boolean {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      return true;
    } catch (err) {
      console.error('[crash-log] cannot create crash-log dir:', err);
      return false;
    }
  }

  /** Delete per-run files older than the newest
   *  CRASH_LOG_MAX_FILES. Runs at session start. Never throws. */
  prune(): number {
    let removed = 0;
    try {
      if (!fs.existsSync(this.dir)) return 0;
      const files = fs
        .readdirSync(this.dir)
        .filter((n) => n.startsWith('crash-') && n.endsWith('.log'))
        .map((n) => ({ name: n, full: path.join(this.dir, n) }))
        .map((f) => {
          let mtime = 0;
          try {
            mtime = fs.statSync(f.full).mtimeMs;
          } catch {
            mtime = 0;
          }
          return { ...f, mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);
      for (const f of files.slice(CRASH_LOG_MAX_FILES)) {
        try {
          fs.unlinkSync(f.full);
          removed += 1;
        } catch {
          // A file that cannot be deleted stays — the next
          // prune retries. Never breaks the app.
        }
      }
    } catch (err) {
      console.error('[crash-log] prune failed:', err);
    }
    return removed;
  }

  /** Point latest.log at the current run's file. Best-effort:
   *  a symlink that cannot be created (Windows without
   *  privileges) is skipped, never fatal. */
  private updateLatestSymlink(): void {
    if (!this.currentPath) return;
    try {
      const link = this.latestLogPath;
      try {
        fs.unlinkSync(link);
      } catch {
        // No existing link — nothing to remove.
      }
      fs.symlinkSync(path.basename(this.currentPath), link);
    } catch (err) {
      console.error('[crash-log] latest.log symlink failed:', err);
    }
  }

  /** Append one entry — sync write + fsync, so it survives a
   *  crash microseconds later. Never throws: a logging
   *  failure is reported on console.error and swallowed. */
  append(entry: CrashEntry): boolean {
    try {
      if (!this.ensureDir()) return false;
      if (!this.currentPath) {
        // The writer owns the run: the file is named after
        // THIS writer's session, not the entry's — the entry's
        // session comes from the mutable module context and
        // must not rename the run's file mid-flight.
        this.currentPath = path.join(
          this.dir,
          crashLogFileName(entry.at, this.sessionId),
        );
        const header = formatCrashLogHeader(entry.context, entry.at);
        const fd = fs.openSync(this.currentPath, 'a');
        try {
          fs.writeSync(fd, header);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        this.headerWritten = true;
        this.updateLatestSymlink();
      }
      void this.headerWritten;
      const text = formatCrashEntry(entry);
      const fd = fs.openSync(this.currentPath, 'a');
      try {
        fs.writeSync(fd, text);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      return true;
    } catch (err) {
      console.error('[crash-log] append failed:', err);
      return false;
    }
  }

  /** The session-start entry — the header of every run, with
   *  the full context. Called once at startup (main, in
   *  app.whenReady). */
  logSessionStart(context?: CrashContext): boolean {
    const ctx = context ?? getCrashContext();
    return this.append(
      createCrashEntry({
        kind: 'startup',
        message: `Lucid started — session ${ctx.sessionId}.`,
        context: ctx,
      }),
    );
  }
}

/** The default writer for the running app — created lazily so
 *  importing this module never touches the disk. */
let defaultWriter: CrashLogWriter | null = null;

export function getCrashLogWriter(): CrashLogWriter {
  if (!defaultWriter) defaultWriter = new CrashLogWriter();
  return defaultWriter;
}

/** A window-like object with just the webContents surface the
 *  crash handlers need — BrowserWindow satisfies this
 *  structurally, and tests can pass a fake. */
export interface CrashLogWebContents {
  on(event: 'render-process-gone', listener: (event: unknown, details: {
    reason: string;
    exitCode: number;
  }) => void): void;
  on(event: 'unresponsive', listener: () => void): void;
  on(event: 'responsive', listener: () => void): void;
  getURL(): string;
}

export interface CrashLogWindowLike {
  webContents: CrashLogWebContents;
}

/** Attach renderer-crash handlers to a window's webContents.
 *  The URL is read at crash time (guarded — a destroyed
 *  webContents throws, and a crash handler must never throw). */
export function attachWindowCrashHandlers(
  window: CrashLogWindowLike,
  writer: CrashLogWriter = getCrashLogWriter(),
): void {
  const urlOf = (): string => {
    try {
      return window.webContents.getURL() || CRASH_UNKNOWN;
    } catch {
      return CRASH_UNKNOWN;
    }
  };
  window.webContents.on('render-process-gone', (_event, details) => {
    writer.append(
      createCrashEntry({
        kind: 'renderer-crashed',
        message: `Renderer process gone: ${details.reason} (exit code ${details.exitCode}).`,
        detail: `url: ${urlOf()}`,
      }),
    );
  });
  window.webContents.on('unresponsive', () => {
    writer.append(
      createCrashEntry({
        kind: 'renderer-unresponsive',
        message: 'Renderer stopped responding.',
        detail: `url: ${urlOf()}`,
      }),
    );
  });
  window.webContents.on('responsive', () => {
    writer.append(
      createCrashEntry({
        kind: 'renderer-responsive',
        message: 'Renderer responsive again after a hang.',
        detail: `url: ${urlOf()}`,
      }),
    );
  });
}

/**
 * Install the main-process fatal handlers. Call FIRST, at the
 * top of electron/main.ts, before anything else can throw at
 * startup — that is the crash this log was built to catch.
 *
 * Both handlers write the entry synchronously (fsync — it
 * survives), then exit(1). Exiting preserves Node's default
 * behaviour: an uncaught exception / unhandled rejection
 * crashes the process anyway, and a handler that swallowed it
 * would leave Lucid running in a broken state. The log
 * records the crash; it does not prevent it.
 *
 * Re-entrancy guard: if the handler itself throws (or a
 * second fatal error lands while the first is being written),
 * exit immediately instead of looping.
 *
 * Returns an uninstall function (for tests).
 */
export function installMainCrashHandlers(
  writer: CrashLogWriter = getCrashLogWriter(),
): () => void {
  let crashing = false;
  const onUncaughtException = (err: Error): void => {
    if (crashing) {
      process.exit(1);
      return;
    }
    crashing = true;
    try {
      writer.append(
        createCrashEntry({
          kind: 'main-uncaught-exception',
          message: `Uncaught exception: ${err?.message ?? String(err)}`,
          stack: err?.stack ?? null,
        }),
      );
    } catch {
      // The writer never throws; this is belt-and-braces.
    }
    console.error('[crash-log] uncaught exception:', err);
    process.exit(1);
  };
  const onUnhandledRejection = (reason: unknown): void => {
    if (crashing) {
      process.exit(1);
      return;
    }
    crashing = true;
    const asError = reason instanceof Error ? reason : null;
    try {
      writer.append(
        createCrashEntry({
          kind: 'main-unhandled-rejection',
          message: `Unhandled rejection: ${asError?.message ?? String(reason)}`,
          stack: asError?.stack ?? null,
        }),
      );
    } catch {
      // Belt-and-braces — the writer never throws.
    }
    console.error('[crash-log] unhandled rejection:', reason);
    process.exit(1);
  };
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  return () => {
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
  };
}

/** One log file, as listed in Settings > Crash log. */
export interface CrashLogFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** A log read — the file's text, tailed at the cap when
 *  truncated. `name`/`path` are null when no log exists yet. */
export interface CrashLogReadResult {
  name: string | null;
  path: string | null;
  text: string;
  truncated: boolean;
}

/** List the per-run log files, newest first. Never throws —
 *  an unreadable dir lists as empty. */
export function listCrashLogs(dir?: string): CrashLogFileInfo[] {
  const d = dir ?? getCrashLogDir();
  try {
    if (!fs.existsSync(d)) return [];
    return fs
      .readdirSync(d)
      .filter((n) => n.startsWith('crash-') && n.endsWith('.log'))
      .map((n) => {
        const full = path.join(d, n);
        try {
          const st = fs.statSync(full);
          return { name: n, path: full, sizeBytes: st.size, modifiedAt: st.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((f): f is CrashLogFileInfo => f !== null)
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [];
  }
}

/** Read a log file — the TAIL when it exceeds the cap, so a
 *  huge log still ends with the crash. Returns null when the
 *  file cannot be read. `name` is a bare file name only; a
 *  path that escapes the log dir is refused (no traversal). */
export function readCrashLog(
  name: string | null,
  dir?: string,
): CrashLogReadResult | null {
  const d = dir ?? getCrashLogDir();
  try {
    let target: string;
    let fileName: string;
    if (name === null) {
      const latest = listCrashLogs(d)[0];
      if (!latest) return null;
      target = latest.path;
      fileName = latest.name;
    } else {
      if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
      if (!name.startsWith('crash-') || !name.endsWith('.log')) return null;
      target = path.join(d, name);
      fileName = name;
    }
    const buf = fs.readFileSync(target);
    const truncated = buf.length > CRASH_LOG_MAX_READ_BYTES;
    const text = truncated
      ? buf.subarray(buf.length - CRASH_LOG_MAX_READ_BYTES).toString('utf8')
      : buf.toString('utf8');
    return { name: fileName, path: target, text, truncated };
  } catch {
    return null;
  }
}

/** The paths the UI shows — where the log lives, and the
 *  latest run's file. */
export function getCrashLogPaths(dir?: string): { dir: string; latestPath: string } {
  const d = dir ?? getCrashLogDir();
  return { dir: d, latestPath: path.join(d, CRASH_LOG_LATEST_NAME) };
}
