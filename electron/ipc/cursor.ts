import { app, screen, BrowserWindow } from 'electron';

/**
 * Global cursor polling for off-window gaze.
 *
 * The Sentinel face's eyes follow the user's cursor — but the
 * renderer's pointer events only fire inside the app's own window.
 * Once the cursor leaves the window, no more events arrive, the
 * registry entry goes stale after 4s, and the eyes fall back to
 * wandering. This poller closes that gap: the main process reads the
 * OS cursor position with `screen.getCursorScreenPoint()`, which
 * works anywhere on the desktop (no extra macOS permission — it is
 * not screen capture; accessibility is already granted), and pushes
 * each move to the renderer over IPC. The renderer converts the
 * screen point to client coordinates and feeds the SAME 'user'
 * registry entry the mousemove path writes, so the existing
 * priority, sensitivity scaling, 4s idle timeout, and smoothing all
 * apply unchanged.
 *
 * Poll rate: ~30 Hz (33 ms). The face updates on rAF anyway, so
 * polling faster buys nothing. The poll only sends when the point
 * actually moved — an idle cursor sends nothing, so the 4s idle
 * release still applies (the eyes look at a stopped cursor for a
 * beat, then wander, same as inside the window).
 *
 * Pause: the interval only runs while its window is visible. It
 * stops on minimize/hide/closed and resumes on restore/show, and
 * each tick also guards on visibility — so a hidden window costs
 * nothing at all. One interval per window; the app normally has one
 * main window.
 */

/** Poll interval — ~30 Hz, plenty for a face that updates on rAF. */
export const GLOBAL_CURSOR_POLL_MS = 33;

/** Main → renderer channel carrying the global cursor point (x, y). */
export const CURSOR_GLOBAL_POINT_CHANNEL = 'cursor:global-point';

export interface GlobalCursorPoint {
  x: number;
  y: number;
}

/**
 * True when the cursor moved since the last sent point (or there is
 * no previous point yet). Screen points are integer DIPs, so exact
 * equality is safe.
 */
export function cursorPointChanged(
  prev: GlobalCursorPoint | null,
  next: GlobalCursorPoint,
): boolean {
  return prev === null || prev.x !== next.x || prev.y !== next.y;
}

/**
 * Start polling the global cursor position for every BrowserWindow
 * the app creates, pushing moves to that window's renderer. Call
 * once from main (app.whenReady). Windows created before this call
 * are picked up too, defensively.
 */
export function setupGlobalCursorPolling(): void {
  app.on('browser-window-created', (_event, win: BrowserWindow) => {
    attachCursorPolling(win);
  });
  for (const win of BrowserWindow.getAllWindows()) {
    attachCursorPolling(win);
  }
}

function attachCursorPolling(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  let lastSent: GlobalCursorPoint | null = null;

  const tick = (): void => {
    if (win.isDestroyed()) {
      stop();
      return;
    }
    // Paused while the window is hidden or minimized: no screen
    // read, no IPC, no work at all.
    if (!win.isVisible() || win.isMinimized()) return;
    const point = screen.getCursorScreenPoint();
    if (!cursorPointChanged(lastSent, point)) return;
    lastSent = point;
    win.webContents.send(CURSOR_GLOBAL_POINT_CHANNEL, point.x, point.y);
  };

  const start = (): void => {
    if (timer !== null) return;
    if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    timer = setInterval(tick, GLOBAL_CURSOR_POLL_MS);
  };

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  win.on('minimize', stop);
  win.on('restore', start);
  win.on('show', start);
  win.on('hide', stop);
  win.on('closed', stop);
  start();
}
