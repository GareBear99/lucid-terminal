/**
 * Detached-window factory (tab detach, Gary 2026-11-09): a
 * terminal tab pulled out of the main window becomes its own
 * terminal-only screen; a file pulled out becomes its own
 * editor-only screen.
 *
 * Mirrors electron/services/browserMiniWindow.ts (the proven
 * pattern): frameless, resizable, `show: false` + ready-to-show
 * + a 4-second show fallback + show-on-fail-load, bounds clamped
 * onto the display, bounds persisted in an electron-store. The
 * differences that matter: the window opens AT the drop point on
 * first creation (so the tab appears where Gary pulled it, not
 * at a fixed default spot), and it is a NORMAL window — not
 * always-on-top like the browser mini — and it takes focus on
 * show, because Gary is about to type in it.
 */
import { BrowserWindow, Rectangle } from 'electron';
import Store from 'electron-store';
import path from 'path';
import { getTheme } from '../../src/themes/themes';
import { settings } from './secureStorage';
import { clampToDisplay } from './browserMiniWindow';

/** Default size of a new detached terminal window (Q7 — Gary's
 *  call; the browser mini default is 640x420, a terminal wants
 *  more width). */
export const DETACH_TERMINAL_DEFAULT_BOUNDS: Rectangle = {
  x: 100,
  y: 100,
  width: 900,
  height: 560,
};

/** Default size of a new detached files window (Q7). */
export const DETACH_FILES_DEFAULT_BOUNDS: Rectangle = {
  x: 100,
  y: 100,
  width: 900,
  height: 600,
};

export const DETACH_WINDOW_MIN_WIDTH = 320;
export const DETACH_WINDOW_MIN_HEIGHT = 240;

/** Same 4-second show fallback as the browser mini window. */
export const DETACH_WINDOW_SHOW_FALLBACK_MS = 4000;

function makeBoundsStore(): {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
} {
  try {
    const store = new Store<Record<string, unknown>>({ name: 'lucid-terminal-detach' });
    return { get: (key) => store.get(key), set: (key, value) => store.set(key, value) };
  } catch {
    const memory = new Map<string, unknown>();
    return { get: (key) => memory.get(key), set: (key, value) => memory.set(key, value) };
  }
}

const detachBoundsStore = makeBoundsStore();

/**
 * The window background colour, read from the stored theme IN
 * MAIN so the window is never white while the renderer loads.
 * Falls back to the dark default when the settings are
 * unreadable (§6.1) — a detached window never flashes white.
 */
export function getDetachWindowBackgroundColor(): string {
  try {
    const themeId = settings.get<string>('theme');
    if (themeId) {
      const theme = getTheme(themeId);
      if (theme?.colors?.bgPrimary) return theme.colors.bgPrimary;
    }
  } catch {
    // Fall through to the default.
  }
  return '#0d1117';
}

function loadDetachBounds(key: string): Rectangle | null {
  try {
    const stored = detachBoundsStore.get(key) as Rectangle | undefined;
    if (
      stored &&
      typeof stored.x === 'number' &&
      typeof stored.y === 'number' &&
      typeof stored.width === 'number' &&
      typeof stored.height === 'number'
    ) {
      return stored;
    }
  } catch {
    // Unreadable bounds are a fallback, not a failure (§9).
  }
  return null;
}

export interface DetachedWindowOptions {
  /** Store key for this window's bounds (terminal:<tabId> or files:<path>). */
  boundsKey: string;
  /** The ?mini= query value: 'terminal' | 'files'. */
  mini: 'terminal' | 'files';
  /** Query string appended to the renderer URL (e.g. tab=terminal-3). */
  query: string;
  /** Drop point in screen coords, or null to use stored/default bounds. */
  dropPoint: { x: number; y: number } | null;
  /** Default bounds when nothing is stored and there is no drop point. */
  defaultBounds: Rectangle;
  /** Called when the window is closed (for real) — the caller
   *  pops the owned tabs/files back into the main window. */
  onClosed?: () => void;
}

/**
 * Create a detached window. On first creation (no stored bounds)
 * it opens centred on the drop point, clamped onto the display;
 * on later creations it reopens where it was. Bounds are saved
 * (debounced) on move/resize and once more on close under the
 * window's bounds key.
 */
export function createDetachedWindow(options: DetachedWindowOptions): BrowserWindow {
  const stored = loadDetachBounds(options.boundsKey);
  let bounds: Rectangle;
  if (stored) {
    bounds = {
      x: stored.x,
      y: stored.y,
      width: Math.max(DETACH_WINDOW_MIN_WIDTH, stored.width),
      height: Math.max(DETACH_WINDOW_MIN_HEIGHT, stored.height),
    };
  } else if (options.dropPoint) {
    const w = options.defaultBounds.width;
    const h = options.defaultBounds.height;
    bounds = clampToDisplay({
      x: Math.round(options.dropPoint.x - w / 2),
      y: Math.round(options.dropPoint.y - h / 2),
      width: w,
      height: h,
    });
  } else {
    bounds = { ...options.defaultBounds };
  }
  bounds = clampToDisplay(bounds);

  const win = new BrowserWindow({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    minWidth: DETACH_WINDOW_MIN_WIDTH,
    minHeight: DETACH_WINDOW_MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    resizable: true,
    show: false,
    backgroundColor: getDetachWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    try {
      const b = win.getBounds();
      detachBoundsStore.set(options.boundsKey, {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      });
    } catch {
      // Best-effort.
    }
  };
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveSoon = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveBounds, 300);
  };
  win.on('move', saveSoon);
  win.on('resize', saveSoon);
  win.on('close', saveBounds);

  win.on('closed', () => {
    options.onClosed?.();
  });

  // Show once ready, with the same 4s fallback as the browser
  // mini — a failed load shows too, so the failure is visible
  // instead of silent. A detached terminal takes focus on show:
  // Gary pulled the tab out to type in it.
  let shown = false;
  const showWindow = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
  };
  win.once('ready-to-show', showWindow);
  setTimeout(showWindow, DETACH_WINDOW_SHOW_FALLBACK_MS);
  win.webContents?.on?.('did-fail-load', showWindow);

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}?mini=${options.mini}&${options.query}`);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mini: options.mini, ...Object.fromEntries(new URLSearchParams(options.query)) },
    });
  }
  return win;
}
