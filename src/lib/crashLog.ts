/**
 * Renderer crash hooks — the renderer side of the advanced
 * crash log (Gary, 2026-11-16: "should make an advanced crash
 * log").
 *
 * The renderer cannot write the log file itself (no node fs
 * in the renderer) — it reports uncaught errors + unhandled
 * rejections to main over IPC, and main appends them to the
 * same file the main-process crashes go in
 * (~/.lucid/crash-log/latest.log). The renderer also sends
 * its current profile + view to main (crashLog:setContext),
 * so main-process entries carry them too — main cannot know
 * them on its own.
 *
 * This module never formats entries (main owns the one
 * formatter — electron/services/crashLog.ts) and never throws:
 * a hook that throws would crash the app it is trying to
 * diagnose. Every send is best-effort, fire-and-forget, and
 * guarded — when lucidAPI is absent (an older build, a test),
 * the hooks are inert.
 *
 * The React ErrorBoundary (src/components/ErrorBoundary.tsx)
 * still owns render errors (it shows the fallback screen);
 * these hooks own everything else — errors outside React
 * (event handlers, timers, IPC callbacks) and rejected
 * promises nobody awaited.
 */

/** A renderer error report, as the IPC channel accepts it. */
export interface RendererCrashReport {
  kind: 'renderer-error' | 'renderer-unhandled-rejection';
  message: string;
  stack: string | null;
  url: string | null;
  view: string | null;
  profile: string | null;
}

/** One log file, as listed in Settings > Crash log. Mirrors
 *  the shape main returns (electron/services/crashLog.ts
 *  CrashLogFileInfo) — the two are the same wire shape. */
export interface CrashLogFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** A log read — the file's text, tailed at the cap when
 *  truncated. `name`/`path` are null when no log exists yet.
 *  Mirrors main's CrashLogReadResult. */
export interface CrashLogReadResult {
  name: string | null;
  path: string | null;
  text: string;
  truncated: boolean;
}

/** The renderer's own crash context — profile + view, sent
 *  to main and stamped on every report. 'unknown' until App
 *  sets it (a missing value is unknown, never guessed). */
export interface RendererCrashContext {
  profile: string;
  view: string;
}

let rendererContext: RendererCrashContext = {
  profile: 'unknown',
  view: 'unknown',
};

export function getRendererCrashContext(): RendererCrashContext {
  return { ...rendererContext };
}

type CrashLogApi = {
  reportRendererError?: (report: RendererCrashReport) => Promise<{ ok: boolean; error?: string }>;
  setContext?: (update: { profile?: string; view?: string }) => void;
};

function crashLogApi(): CrashLogApi | null {
  try {
    const api = (window as unknown as { lucidAPI?: { crashLog?: CrashLogApi } }).lucidAPI
      ?.crashLog;
    return api ?? null;
  } catch {
    return null;
  }
}

/**
 * Send the renderer's current profile + view to main, so
 * main-process entries carry them too. Best-effort: a failed
 * send never throws. Called by App when the profile or the
 * view changes.
 */
export function setCrashLogContext(partial: Partial<RendererCrashContext>): void {
  rendererContext = { ...rendererContext, ...partial };
  try {
    crashLogApi()?.setContext?.({ ...rendererContext });
  } catch {
    // Best-effort — a context send never breaks the app.
  }
}

/** Normalise any thrown value into a message + stack. An
 *  Error keeps its message + stack; anything else is
 *  stringified (a rejection with no value is 'unknown'). */
export function describeThrown(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) {
    return { message: value.message || value.name || 'Error', stack: value.stack ?? null };
  }
  if (typeof value === 'string') {
    return { message: value || 'Unknown error', stack: null };
  }
  if (value === null || value === undefined) {
    return { message: 'Unknown error', stack: null };
  }
  try {
    return { message: String(value), stack: null };
  } catch {
    return { message: 'Unknown error', stack: null };
  }
}

/** Build a report from a window error event's pieces. The
 *  file + line + column, when known, ride on the message so
 *  the log line alone says where it broke. */
export function buildRendererErrorReport(input: {
  kind: RendererCrashReport['kind'];
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}): RendererCrashReport {
  const described = describeThrown(input.error ?? input.message);
  const where =
    input.filename !== undefined && input.filename !== ''
      ? `${input.filename}${input.lineno !== undefined ? `:${input.lineno}` : ''}${input.colno !== undefined ? `:${input.colno}` : ''}`
      : null;
  const ctx = getRendererCrashContext();
  return {
    kind: input.kind,
    message: where ? `${described.message} (${where})` : described.message,
    stack: described.stack,
    url: currentRendererUrl(),
    view: ctx.view,
    profile: ctx.profile,
  };
}

function currentRendererUrl(): string | null {
  try {
    return typeof window !== 'undefined' ? window.location.href : null;
  } catch {
    return null;
  }
}

/** Validate a report payload (the renderer's own guard
 *  before sending; main re-validates on receipt). */
export function validateRendererErrorReport(value: unknown): value is RendererCrashReport {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'renderer-error' && v.kind !== 'renderer-unhandled-rejection') return false;
  if (typeof v.message !== 'string' || v.message.length === 0) return false;
  return true;
}

let hooksInstalled = false;
let errorListener: ((event: Event) => void) | null = null;
let rejectionListener: ((event: Event) => void) | null = null;

/**
 * Install the renderer crash hooks — window.onerror +
 * unhandledrejection. Installs once; a second call returns
 * the same uninstall and adds nothing. No-op entirely when
 * there is no window (node / tests) or no lucidAPI — the
 * hooks are inert, never fatal.
 *
 * Each hook builds a report and sends it to main
 * fire-and-forget. The send itself is wrapped so a failure
 * to report never throws into the error path it came from.
 *
 * Returns an uninstall that removes the listeners (used by
 * the test reset — and by any future teardown).
 */
export function installRendererCrashHooks(): () => void {
  if (hooksInstalled) return uninstallRendererCrashHooks;
  if (typeof window === 'undefined') return uninstallRendererCrashHooks;
  hooksInstalled = true;
  const report = (payload: RendererCrashReport): void => {
    try {
      const api = crashLogApi();
      if (!api?.reportRendererError) return;
      const p = api.reportRendererError(payload);
      if (p && typeof (p as Promise<unknown>).catch === 'function') {
        (p as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      // Reporting a crash must never crash the app.
    }
  };
  errorListener = (event: Event) => {
    try {
      const e = event as ErrorEvent;
      report(
        buildRendererErrorReport({
          kind: 'renderer-error',
          error: e.error ?? e.message,
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
        }),
      );
    } catch {
      // Never throw from an error hook.
    }
  };
  rejectionListener = (event: Event) => {
    try {
      report(
        buildRendererErrorReport({
          kind: 'renderer-unhandled-rejection',
          error: (event as PromiseRejectionEvent).reason,
        }),
      );
    } catch {
      // Never throw from an error hook.
    }
  };
  window.addEventListener('error', errorListener);
  window.addEventListener('unhandledrejection', rejectionListener);
  return uninstallRendererCrashHooks;
}

/** Remove the renderer crash hooks, if installed. */
export function uninstallRendererCrashHooks(): void {
  if (typeof window !== 'undefined') {
    if (errorListener) window.removeEventListener('error', errorListener);
    if (rejectionListener) {
      window.removeEventListener('unhandledrejection', rejectionListener);
    }
  }
  errorListener = null;
  rejectionListener = null;
  hooksInstalled = false;
}

/** Test-only reset — removes the hooks and resets the
 *  context, so a test can install them fresh. */
export function __resetRendererCrashHooksForTest(): void {
  uninstallRendererCrashHooks();
  rendererContext = { profile: 'unknown', view: 'unknown' };
}
