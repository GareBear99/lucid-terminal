/**
 * Main window placement (Gary, 2026-11-17): Lucid kept opening on
 * the "Muse Agent Workspace" display — a virtual/agent display Gary
 * cannot see — instead of his main display, and he waited over an
 * hour for a usable window. Root cause: `createWindow` passed no
 * `x`/`y` at all, so Electron/macOS placed the window wherever it
 * chose. The main window now opens centered on the PRIMARY display,
 * every launch, by explicit bounds.
 *
 * This module is pure (plain data in, bounds out; no Electron
 * import) so it is unit-testable in node without mocks. The caller
 * (`electron/main.ts`) passes `screen.getAllDisplays()` mapped to
 * `{ workArea, primary }`.
 *
 * Lucid does NOT persist main-window bounds today (no
 * electron-window-state, no custom save/restore — verified
 * 2026-11-17), so `savedBounds` is normally absent and the window
 * centers on the primary display. The parameter exists so that if
 * bounds persistence is ever added, bounds stranded on another
 * display (or a disconnected one) are ignored instead of stranding
 * the window off-screen — the same class of bug the mini window
 * already fixed (`resolveMiniBounds`, 2026-11-07).
 */

/** A display work area (menu bar / Dock excluded), in DIP. */
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The slice of Electron's `Display` this module needs. */
export interface DisplayInfo {
  workArea: WorkArea;
  primary: boolean;
}

/** A window rect, in DIP. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The main window's size today (electron/main.ts createWindow). */
export const MAIN_WINDOW_DEFAULT_WIDTH = 1400;
export const MAIN_WINDOW_DEFAULT_HEIGHT = 900;

/** The main window's minimum size (electron/main.ts createWindow). */
export const MAIN_WINDOW_MIN_WIDTH = 800;
export const MAIN_WINDOW_MIN_HEIGHT = 600;

/**
 * How much of a saved window must overlap the primary display's
 * work area for the saved bounds to count as "on the primary
 * display". 100px in each dimension is enough to see the window
 * and grab its title bar; anything less is effectively off-screen.
 */
export const MAIN_WINDOW_MIN_VISIBLE_PX = 100;

/** The primary display: the one flagged primary, else the first
 * listed, else null when no display is known at all. */
export function findPrimaryDisplay(
  displays: DisplayInfo[] | null | undefined,
): DisplayInfo | null {
  if (!Array.isArray(displays) || displays.length === 0) return null;
  return displays.find((d) => d && d.primary === true) ?? displays[0] ?? null;
}

/** Validate untrusted saved bounds (garbage in → null, never a
 * crash and never a degenerate rect). */
export function parseSavedBounds(stored: unknown): WindowBounds | null {
  if (!stored || typeof stored !== 'object') return null;
  const raw = stored as Record<string, unknown>;
  const num = (key: string): number | null =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key])
      ? (raw[key] as number)
      : null;
  const x = num('x');
  const y = num('y');
  const width = num('width');
  const height = num('height');
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** True when the saved rect overlaps the work area by at least
 * `MAIN_WINDOW_MIN_VISIBLE_PX` in both dimensions — i.e. a usable
 * chunk of the window is actually on that display. A rect entirely
 * on another display (or a disconnected one) fails this. */
export function isBoundsVisibleOnWorkArea(
  bounds: WindowBounds,
  workArea: WorkArea,
  minVisiblePx: number = MAIN_WINDOW_MIN_VISIBLE_PX,
): boolean {
  const overlapX =
    Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
    Math.max(bounds.x, workArea.x);
  const overlapY =
    Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
    Math.max(bounds.y, workArea.y);
  return overlapX >= minVisiblePx && overlapY >= minVisiblePx;
}

/** Clamp a rect inside a work area: shrink to fit, then pull the
 * origin in. The result is always fully inside the work area. */
export function clampBoundsToWorkArea(
  bounds: WindowBounds,
  workArea: WorkArea,
): WindowBounds {
  const width = Math.min(
    Math.max(bounds.width, MAIN_WINDOW_MIN_WIDTH),
    workArea.width,
  );
  const height = Math.min(
    Math.max(bounds.height, MAIN_WINDOW_MIN_HEIGHT),
    workArea.height,
  );
  return {
    x: Math.round(
      Math.min(
        Math.max(bounds.x, workArea.x),
        workArea.x + Math.max(0, workArea.width - width),
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(bounds.y, workArea.y),
        workArea.y + Math.max(0, workArea.height - height),
      ),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Center a size on a work area, shrinking to fit. The result is
 * always fully inside the work area. */
export function centerBoundsOnWorkArea(
  width: number,
  height: number,
  workArea: WorkArea,
): WindowBounds {
  const w = Math.min(Math.max(width, MAIN_WINDOW_MIN_WIDTH), workArea.width);
  const h = Math.min(Math.max(height, MAIN_WINDOW_MIN_HEIGHT), workArea.height);
  return {
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: Math.round(workArea.y + (workArea.height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

/**
 * Resolve where the main window opens.
 *
 * - Saved bounds that are visibly on the primary display are kept
 *   (clamped inside the primary work area).
 * - Saved bounds on another display, on a disconnected display, or
 *   garbage/missing are ignored: the window centers on the primary
 *   display instead. A window stranded where Gary cannot see it is
 *   worse than a window that opens centered.
 * - With no display information at all, the default size at the
 *   origin is returned and Electron places the window.
 */
export function resolveMainWindowBounds(opts: {
  width: number;
  height: number;
  displays: DisplayInfo[] | null | undefined;
  savedBounds?: unknown;
}): WindowBounds {
  const { width, height, displays } = opts;
  const primary = findPrimaryDisplay(displays);
  if (!primary) {
    return { x: 0, y: 0, width, height };
  }
  const saved = parseSavedBounds(opts.savedBounds);
  if (saved && isBoundsVisibleOnWorkArea(saved, primary.workArea)) {
    return clampBoundsToWorkArea(saved, primary.workArea);
  }
  return centerBoundsOnWorkArea(width, height, primary.workArea);
}
