/**
 * Crash log IPC — the main-process side of Settings > Crash
 * log and the renderer error reports (Gary, 2026-11-16:
 * "should make an advanced crash log").
 *
 * Channels (the renderer consumes exactly these names):
 *   crashLog:list — GET the per-run log files, newest first.
 *   crashLog:readLatest — GET the newest run's log text
 *     (tailed at CRASH_LOG_MAX_READ_BYTES).
 *   crashLog:readFile — GET one run's log text by bare file
 *     name (no traversal — a name with a slash or '..' is
 *     refused).
 *   crashLog:getPaths — GET where the log lives (dir +
 *     latest.log path), so the UI can show Gary the file.
 *   crashLog:reportRendererError — SEND a renderer uncaught
 *     error / unhandled rejection; main validates it and
 *     appends it to the same file the main-process crashes
 *     go in. Read-only from the renderer's side apart from
 *     this one append.
 *   crashLog:setContext — SEND the current profile + view, so
 *     main-process entries carry them too (main cannot know
 *     them on its own).
 *
 * Validation: every payload from the renderer is treated as
 * untrusted — wrong shapes are rejected, strings are capped
 * (CRASH_LOG_MAX_PAYLOAD_CHARS), and a report never writes
 * outside the crash-log dir. A rejected report returns
 * {ok:false} and logs nothing; it never throws into main.
 */
import type { IpcMain } from 'electron';
import {
  CRASH_LOG_MAX_PAYLOAD_CHARS,
  createCrashEntry,
  getCrashContext,
  getCrashLogPaths,
  getCrashLogWriter,
  listCrashLogs,
  readCrashLog,
  setCrashContext,
  type CrashEntryKind,
  type CrashLogWriter,
} from '../services/crashLog';

/** A renderer error report, as the IPC channel accepts it. */
export interface RendererCrashReport {
  kind: 'renderer-error' | 'renderer-unhandled-rejection';
  message: string;
  stack?: string | null;
  url?: string | null;
  view?: string | null;
  profile?: string | null;
}

function cappedString(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  return value.length > cap ? value.slice(0, cap) : value;
}

/** Validate a renderer error report. Returns the cleaned
 *  report, or null when the payload is not a report at all. */
export function validateRendererCrashReport(value: unknown): RendererCrashReport | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'renderer-error' && v.kind !== 'renderer-unhandled-rejection') return null;
  const message = cappedString(v.message, CRASH_LOG_MAX_PAYLOAD_CHARS);
  if (message === null || message.length === 0) return null;
  const stack = v.stack === undefined || v.stack === null
    ? null
    : cappedString(v.stack, CRASH_LOG_MAX_PAYLOAD_CHARS);
  if (v.stack !== undefined && v.stack !== null && stack === null) return null;
  const url = v.url === undefined || v.url === null
    ? null
    : cappedString(v.url, CRASH_LOG_MAX_PAYLOAD_CHARS);
  if (v.url !== undefined && v.url !== null && url === null) return null;
  const view = v.view === undefined || v.view === null
    ? null
    : cappedString(v.view, CRASH_LOG_MAX_PAYLOAD_CHARS);
  if (v.view !== undefined && v.view !== null && view === null) return null;
  const profile = v.profile === undefined || v.profile === null
    ? null
    : cappedString(v.profile, CRASH_LOG_MAX_PAYLOAD_CHARS);
  if (v.profile !== undefined && v.profile !== null && profile === null) return null;
  return { kind: v.kind as RendererCrashReport['kind'], message, stack, url, view, profile };
}

/** Validate a context update from the renderer — profile /
 *  view strings only, capped. Returns the cleaned partial,
 *  or null when nothing usable arrived. */
export function validateCrashContextUpdate(
  value: unknown,
): { profile?: string; view?: string } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: { profile?: string; view?: string } = {};
  if (typeof v.profile === 'string' && v.profile.length > 0) {
    out.profile = v.profile.slice(0, CRASH_LOG_MAX_PAYLOAD_CHARS);
  }
  if (typeof v.view === 'string' && v.view.length > 0) {
    out.view = v.view.slice(0, CRASH_LOG_MAX_PAYLOAD_CHARS);
  }
  return out.profile === undefined && out.view === undefined ? null : out;
}

export function setupCrashLogHandlers(
  ipcMain: IpcMain,
  writer: CrashLogWriter = getCrashLogWriter(),
): void {
  ipcMain.handle('crashLog:list', () => {
    return listCrashLogs(writer.dir);
  });

  ipcMain.handle('crashLog:readLatest', () => {
    const read = readCrashLog(null, writer.dir);
    return read ?? { name: null, path: null, text: '', truncated: false };
  });

  ipcMain.handle('crashLog:readFile', (_event, name: unknown) => {
    if (typeof name !== 'string') {
      return { name: null, path: null, text: '', truncated: false };
    }
    const read = readCrashLog(name, writer.dir);
    return read ?? { name: null, path: null, text: '', truncated: false };
  });

  ipcMain.handle('crashLog:getPaths', () => {
    return getCrashLogPaths(writer.dir);
  });

  ipcMain.handle('crashLog:reportRendererError', (_event, payload: unknown) => {
    const report = validateRendererCrashReport(payload);
    if (!report) return { ok: false, error: 'Invalid crash report.' };
    // A report carries the renderer's own profile/view when
    // it has them — the entry snapshots the current context,
    // then the report's own values win for this entry only.
    const detail = report.url ? `url: ${report.url}` : null;
    const kind: CrashEntryKind = report.kind;
    const ctx = getCrashContext();
    if (report.profile) ctx.profile = report.profile;
    if (report.view) ctx.view = report.view;
    const ok = writer.append(
      createCrashEntry({
        kind,
        message: report.message,
        stack: report.stack,
        detail,
        context: ctx,
      }),
    );
    return { ok };
  });

  ipcMain.on('crashLog:setContext', (_event, update: unknown) => {
    const clean = validateCrashContextUpdate(update);
    if (clean) setCrashContext(clean);
  });
}
