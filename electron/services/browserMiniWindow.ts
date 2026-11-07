import { BrowserWindow } from 'electron';
import path from 'path';
import Store from 'electron-store';
import type { BrowserViewBounds } from './browserViewAdapter';

/**
 * Mini browser window (Area 6): a compact floating browser window
 * (FreeEQ8-mini precedent), frameless, always on top, resizable,
 * bounds persisted across restarts.
 *
 * The mini window is a second `BrowserWindow` loading the same
 * renderer with `?mini=browser`, which renders `MiniBrowser`
 * instead of the full app. It owns no view of its own: popping a
 * tab out moves the tab's BrowserView from the main window to the
 * mini window (view migration — the view, its session and its
 * cookies survive the move), and popping back reverses it. The
 * migration itself lives in `electron/ipc/browser.ts`; this module
 * only creates the window and remembers its bounds.
 *
 * The GPU gate is NOT built here and NOT consulted here: the gate
 * belongs to the streaming spike (`electron/ipc/android.ts`,
 * `src/phone/streaming.ts`). The mini window's phone entries reuse
 * the spike's `getPhoneEntries` + `android:getGpuGate` exactly like
 * the panel does — same gate, same disabled reason, never a silent
 * software fallback. The in-app stream itself stays in the panel
 * (its frames are delivered to the main window); the mini window
 * only offers the entry, gated identically.
 */

/** Default mini size: a browser needs more height than the
 * FreeEQ8 mini's 640x260. */
export const MINI_WINDOW_DEFAULT_BOUNDS: BrowserViewBounds = {
  x: 100,
  y: 100,
  width: 640,
  height: 420,
};

/** Smallest the mini window can be resized to. */
export const MINI_WINDOW_MIN_WIDTH = 320;
export const MINI_WINDOW_MIN_HEIGHT = 240;

const MINI_BOUNDS_STORE_KEY = 'bounds';

/** Validate stored bounds (garbage in → defaults, never a crash
 * and never an off-screen or unusably small window). */
export function resolveMiniBounds(stored: unknown): BrowserViewBounds {
  const fallback = { ...MINI_WINDOW_DEFAULT_BOUNDS };
  if (!stored || typeof stored !== 'object') return fallback;
  const raw = stored as Record<string, unknown>;
  const num = (key: string): number | null =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key])
      ? (raw[key] as number)
      : null;
  const x = num('x');
  const y = num('y');
  const width = num('width');
  const height = num('height');
  if (x === null || y === null || width === null || height === null) {
    return fallback;
  }
  return {
    x,
    y,
    width: Math.max(MINI_WINDOW_MIN_WIDTH, width),
    height: Math.max(MINI_WINDOW_MIN_HEIGHT, height),
  };
}

let miniWindow: BrowserWindow | null = null;

/** The live mini window, if one exists. */
export function getMiniBrowserWindow(): BrowserWindow | null {
  return miniWindow && !miniWindow.isDestroyed() ? miniWindow : null;
}

/**
 * Fullscreen-while-in-use (Phase B): when an agent is actively
 * driving the browser, the mini window expands to FULL SCREEN
 * from its moveable FaceTime PiP-like floating state; when idle
 * it returns to the PiP floating window, at the bounds Gary left
 * it in (saved before entering fullscreen, restored on exit).
 *
 * The PiP bounds are remembered in module state (not the bounds
 * store — a fullscreen window's bounds are the screen's, and
 * persisting those would strand the PiP window fullscreen-sized
 * after a restart). `setMiniWindowFullscreen` is a no-op when
 * there is no mini window, and entering fullscreen twice (or
 * exiting when not fullscreen) is a no-op. Returns whether the
 * mini window is fullscreen after the call.
 */
let miniFullscreen = false;
let pipBoundsBeforeFullscreen: BrowserViewBounds | null = null;

export function isMiniWindowFullscreen(): boolean {
  return miniFullscreen && getMiniBrowserWindow() !== null;
}

export function setMiniWindowFullscreen(inUse: boolean): boolean {
  const win = getMiniBrowserWindow();
  if (!win) return false;
  if (inUse === miniFullscreen) return miniFullscreen;
  if (inUse) {
    pipBoundsBeforeFullscreen = { ...win.getBounds() };
    win.setFullScreen(true);
    miniFullscreen = true;
  } else {
    win.setFullScreen(false);
    miniFullscreen = false;
    if (pipBoundsBeforeFullscreen) {
      win.setBounds(pipBoundsBeforeFullscreen);
      pipBoundsBeforeFullscreen = null;
    }
  }
  return miniFullscreen;
}

/** Test-only: drop the remembered PiP bounds / fullscreen flag. */
export function resetMiniWindowFullscreenForTests(): void {
  miniFullscreen = false;
  pipBoundsBeforeFullscreen = null;
}

export interface MiniBrowserWindowOptions {
  /** Called when the mini window closes (Gary closed it, or it was
   * closed by a pop-in) so the browser handlers can pop the tab
   * back into the main window. */
  onClosed: () => void;
}

/**
 * Create (or focus, if one already exists) the mini window. The
 * window starts hidden and shows on ready-to-show, so Gary never
 * sees a white flash. Bounds persist in an electron-store file
 * (`lucid-browser-mini`); a store that cannot be created falls
 * back to memory (bounds last only for the session, like the
 * credential vault's degrade path).
 */
export function createMiniBrowserWindow(
  options: MiniBrowserWindowOptions,
): BrowserWindow {
  const existing = getMiniBrowserWindow();
  if (existing) {
    existing.focus();
    return existing;
  }

  let boundsStore: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  try {
    const store = new Store<Record<string, unknown>>({
      name: 'lucid-browser-mini',
    });
    boundsStore = {
      get: (key) => store.get(key),
      set: (key, value) => store.set(key, value),
    };
  } catch {
    const memory = new Map<string, unknown>();
    boundsStore = {
      get: (key) => memory.get(key),
      set: (key, value) => memory.set(key, value),
    };
  }
  const bounds = resolveMiniBounds(boundsStore.get(MINI_BOUNDS_STORE_KEY));

  const win = new BrowserWindow({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    minWidth: MINI_WINDOW_MIN_WIDTH,
    minHeight: MINI_WINDOW_MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    resizable: true,
    show: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    boundsStore.set(MINI_BOUNDS_STORE_KEY, {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    });
  };

  // Persist on move/resize (debounced: a drag fires many events)
  // and once more on close, so the next pop-out lands where Gary
  // left it.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveSoon = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveBounds, 300);
  };
  win.on('move', saveSoon);
  win.on('resize', saveSoon);
  win.on('close', saveBounds);

  win.on('closed', () => {
    if (miniWindow === win) miniWindow = null;
    // A closed window is never fullscreen; forget the PiP bounds
    // saved on entry so a later window starts from the store.
    miniFullscreen = false;
    pipBoundsBeforeFullscreen = null;
    options.onClosed();
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}?mini=browser`);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mini: 'browser' },
    });
  }

  miniWindow = win;
  return win;
}
