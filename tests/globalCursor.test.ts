/**
 * Global-cursor (off-window gaze) tests.
 *
 * The Sentinel face's eyes follow the user's cursor even when it is
 * outside the Lucid window: the main process polls
 * screen.getCursorScreenPoint() and pushes the point to the renderer,
 * which converts it to client coordinates and feeds the SAME 'user'
 * registry entry the mousemove path writes. These tests cover the
 * conversion, the gaze that results from an off-screen point (any
 * direction, including a second display), the registry freshness
 * rules on the poll path, and the poller itself (dedupe, pause on
 * minimize, resume on restore).
 *
 * `electron` is mocked so the poller runs in vitest; no real window,
 * no real cursor. SAFETY NOTE: no temp dirs, no deletes of any kind
 * in this file.
 *
 * Run with: npm test
 */

import { vi } from 'vitest';

const electronMock = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const preExisting: any[] = [];
  let point = { x: 100, y: 100 };
  return {
    handlers,
    preExisting,
    setPoint: (p: { x: number; y: number }) => {
      point = p;
    },
    app: {
      on: (ev: string, fn: (...args: any[]) => void) => {
        handlers[ev] = fn;
      },
    },
    screen: {
      getCursorScreenPoint: () => ({ ...point }),
    },
    BrowserWindow: {
      getAllWindows: () => preExisting,
    },
  };
});

vi.mock('electron', () => ({
  app: electronMock.app,
  screen: electronMock.screen,
  BrowserWindow: electronMock.BrowserWindow,
}));

import {
  GAZE_MAX_DX,
  GAZE_MAX_DY,
  POINTER_IDLE_MS,
  gazeForPoint,
  resolveGazeTarget,
  pickFollowTarget,
  screenPointToClient,
  type GazeContext,
} from '../src/components/Synth/gaze';
import { setCursor, getCursors, removeCursor } from '../src/stores/gazeStore';
import {
  setupGlobalCursorPolling,
  cursorPointChanged,
  GLOBAL_CURSOR_POLL_MS,
  CURSOR_GLOBAL_POINT_CHANNEL,
} from '../electron/ipc/cursor';

describe('screenPointToClient', () => {
  test('a point inside the window converts by the window offset', () => {
    expect(screenPointToClient(500, 400, 100, 100)).toEqual({ x: 400, y: 300 });
  });

  test('a point at the window origin converts to (0, 0)', () => {
    expect(screenPointToClient(100, 100, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  test('a point on a display left of the primary gives negative client x', () => {
    // Second display to the left: screen x is negative there.
    expect(screenPointToClient(-1500, 550, 100, 100)).toEqual({ x: -1600, y: 450 });
  });

  test('a window on a second display converts against its own position', () => {
    // Window top-left at screen (-1920, 0); cursor 300px right of it.
    expect(screenPointToClient(-1620, 200, -1920, 0)).toEqual({ x: 300, y: 200 });
  });
});

describe('off-screen gaze — the eyes track the cursor outside the window', () => {
  // Face centre at client (700, 450); window top-left at screen (100, 100).
  const faceCenter = { x: 700, y: 450 };
  const windowPos = { x: 100, y: 100 };
  const wander = { dx: 0.2, dy: -0.1 };
  const now = 1_000_000;

  /** Resolve the gaze for a cursor at a SCREEN point (poll path). */
  function gazeForScreenPoint(
    sx: number,
    sy: number,
    sensitivity = 1,
    at: number = now - 100,
  ) {
    const c = screenPointToClient(sx, sy, windowPos.x, windowPos.y);
    const ctx: GazeContext = {
      faceCenter,
      attention: null,
      glowPoint: null,
      cursors: [{ id: 'user', x: c.x, y: c.y, at }],
      sensitivity,
      wander,
      now,
    };
    return resolveGazeTarget(ctx);
  }

  test('a cursor 800px right of the face (off-window) looks fully right', () => {
    const g = gazeForScreenPoint(100 + 700 + 800, 100 + 450);
    expect(g.dx).toBeCloseTo(GAZE_MAX_DX, 6);
    expect(g.dy).toBeCloseTo(0, 6);
  });

  test('a cursor on a second display to the left looks fully left', () => {
    const g = gazeForScreenPoint(-1500, 100 + 450);
    expect(g.dx).toBeCloseTo(-GAZE_MAX_DX, 6);
    expect(g.dy).toBeCloseTo(0, 6);
  });

  test('a cursor 800px below the window looks fully down', () => {
    const g = gazeForScreenPoint(100 + 700, 100 + 450 + 800);
    expect(g.dx).toBeCloseTo(0, 6);
    expect(g.dy).toBeCloseTo(GAZE_MAX_DY, 6);
  });

  test('a far diagonal off-screen point clamps both axes', () => {
    const g = gazeForScreenPoint(100 + 700 + 1000, 100 + 450 + 1000);
    expect(g.dx).toBeGreaterThan(0);
    expect(g.dx).toBeLessThanOrEqual(GAZE_MAX_DX);
    expect(g.dy).toBeGreaterThan(0);
    expect(g.dy).toBeLessThanOrEqual(GAZE_MAX_DY);
    // gazeForPoint on the same converted point agrees exactly.
    const c = screenPointToClient(1800, 1550, 100, 100);
    expect(gazeForPoint(c.x, c.y, faceCenter.x, faceCenter.y)).toEqual(g);
  });

  test('sensitivity 0 ignores an off-screen cursor entirely', () => {
    const g = gazeForScreenPoint(100 + 700 + 800, 100 + 450, 0);
    expect(g).toEqual(wander);
  });

  test('an off-screen cursor idle for 4s releases the eyes to wander', () => {
    const g = gazeForScreenPoint(100 + 700 + 800, 100 + 450, 1, now - POINTER_IDLE_MS - 1);
    expect(g).toEqual(wander);
  });
});

describe('registry freshness on the poll path', () => {
  const now = 2_000_000;

  beforeEach(() => {
    for (const c of getCursors()) removeCursor(c.id);
  });

  test('a converted poll point registers as the fresh user cursor', () => {
    const c = screenPointToClient(1600, 550, 100, 100);
    setCursor('user', c.x, c.y, now);
    const target = pickFollowTarget(getCursors(), now);
    expect(target?.id).toBe('user');
    expect(target?.x).toBe(1500);
    expect(target?.y).toBe(450);
  });

  test('a later mousemove-style write wins over an older poll write', () => {
    const c = screenPointToClient(1600, 550, 100, 100);
    setCursor('user', c.x, c.y, now - 100);
    setCursor('user', 710, 460, now); // same id, newer write
    expect(getCursors()).toHaveLength(1);
    expect(pickFollowTarget(getCursors(), now)?.x).toBe(710);
  });
});

describe('cursorPointChanged', () => {
  test('no previous point: any point counts as changed', () => {
    expect(cursorPointChanged(null, { x: 0, y: 0 })).toBe(true);
  });

  test('an identical point counts as unchanged', () => {
    expect(cursorPointChanged({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
  });

  test('a move on either axis counts as changed', () => {
    expect(cursorPointChanged({ x: 100, y: 100 }, { x: 101, y: 100 })).toBe(true);
    expect(cursorPointChanged({ x: 100, y: 100 }, { x: 100, y: 101 })).toBe(true);
  });
});

describe('global cursor poller (mocked electron)', () => {
  function makeWindow() {
    const state = { destroyed: false, visible: true, minimized: false };
    const listeners: Record<string, (...args: any[]) => void> = {};
    const sent: any[][] = [];
    const win: any = {
      state,
      listeners,
      sent,
      isDestroyed: () => state.destroyed,
      isVisible: () => state.visible,
      isMinimized: () => state.minimized,
      webContents: { send: (...args: any[]) => sent.push(args) },
      on: (ev: string, fn: (...args: any[]) => void) => {
        listeners[ev] = fn;
      },
    };
    return win;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    electronMock.handlers['browser-window-created'] = undefined as any;
    delete electronMock.handlers['browser-window-created'];
    electronMock.preExisting.length = 0;
    electronMock.setPoint({ x: 100, y: 100 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  test('polls at ~30 Hz and sends the point to the window', () => {
    expect(GLOBAL_CURSOR_POLL_MS).toBe(33);
    setupGlobalCursorPolling();
    const win = makeWindow();
    electronMock.handlers['browser-window-created']({}, win);
    expect(win.sent).toEqual([]);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toEqual([[CURSOR_GLOBAL_POINT_CHANNEL, 100, 100]]);
  });

  test('an idle cursor sends nothing — the 4s idle release still applies', () => {
    setupGlobalCursorPolling();
    const win = makeWindow();
    electronMock.handlers['browser-window-created']({}, win);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toHaveLength(1);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS * 10);
    expect(win.sent).toHaveLength(1);
  });

  test('a moved cursor sends again with the new point', () => {
    setupGlobalCursorPolling();
    const win = makeWindow();
    electronMock.handlers['browser-window-created']({}, win);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    electronMock.setPoint({ x: 150, y: 100 });
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toHaveLength(2);
    expect(win.sent[1]).toEqual([CURSOR_GLOBAL_POINT_CHANNEL, 150, 100]);
  });

  test('minimize pauses the poll; restore resumes it', () => {
    setupGlobalCursorPolling();
    const win = makeWindow();
    electronMock.handlers['browser-window-created']({}, win);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toHaveLength(1);
    win.state.minimized = true;
    win.listeners['minimize']();
    electronMock.setPoint({ x: 200, y: 100 });
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS * 10);
    expect(win.sent).toHaveLength(1);
    win.state.minimized = false;
    win.listeners['restore']();
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toHaveLength(2);
    expect(win.sent[1]).toEqual([CURSOR_GLOBAL_POINT_CHANNEL, 200, 100]);
  });

  test('a hidden window is not polled', () => {
    setupGlobalCursorPolling();
    const win = makeWindow();
    win.state.visible = false;
    electronMock.handlers['browser-window-created']({}, win);
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS * 5);
    expect(win.sent).toHaveLength(0);
  });

  test('a window created before setup is picked up too', () => {
    const win = makeWindow();
    electronMock.preExisting.push(win);
    setupGlobalCursorPolling();
    vi.advanceTimersByTime(GLOBAL_CURSOR_POLL_MS);
    expect(win.sent).toEqual([[CURSOR_GLOBAL_POINT_CHANNEL, 100, 100]]);
  });
});
