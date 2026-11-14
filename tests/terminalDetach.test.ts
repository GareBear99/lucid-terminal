// @vitest-environment jsdom
/**
 * Tab detach + remount (Gary, 2026-11-09): drag a terminal tab
 * outside the main window and it becomes its own terminal-only
 * screen; drag a tab near another window's tab hotbar and it
 * remounts into the detected one — only ONE bar detects at a
 * time, no stacking.
 *
 * Covered here: the pure volley arbitration (pickDropTarget,
 * insertionIndexFor, outsideDistance) and the terminalStore
 * detach actions (detachTab / addDetachedTab / clearTabExited /
 * releaseTabNumber), including the tab-number reservation rule
 * (a detached tab's number stays reserved while its PTY lives;
 * it is freed only when the PTY is destroyed for real).
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pickDropTarget,
  insertionIndexFor,
  outsideDistance,
  resolveDetachSpawnBounds,
  followOrigin,
  shouldAcceptPollPoint,
  clampDragFollowOrigin,
  type ScreenBar,
} from '../electron/lib/detachArbitration';
import { useTerminalStore } from '../src/stores/terminalStore';

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

function bar(windowId: number, x: number, y: number, width: number, height: number, tabs: ScreenBar['tabs'], focusedAt: number, visible = true): ScreenBar {
  return { windowId, x, y, width, height, tabs, focusedAt, visible };
}

describe('pickDropTarget', () => {
  const bars = [
    bar(1, 0, 0, 400, 36, [{ id: 'terminal-1', x: 0, width: 120 }], 1000),
    bar(2, 500, 0, 400, 36, [{ id: 'terminal-2', x: 500, width: 120 }], 2000),
  ];

  test('a bar the pointer is inside wins over a merely-near bar', () => {
    // Inside bar 1 (older focus) and near bar 2 — inside wins.
    const target = pickDropTarget({ x: 100, y: 10 }, bars, 99, 28);
    expect(target).toEqual({ windowId: 1, inside: true });
  });

  test('among several inside bars the most recently focused wins', () => {
    const overlapping = [
      bar(1, 0, 0, 400, 36, [], 1000),
      bar(2, 0, 0, 400, 36, [], 2000),
    ];
    expect(pickDropTarget({ x: 100, y: 10 }, overlapping, 99, 28)?.windowId).toBe(2);
  });

  test('among several merely-near bars the nearest wins', () => {
    const near = [
      bar(1, 0, 0, 400, 36, [], 1000),
      bar(2, 500, 0, 400, 36, [], 2000),
    ];
    // 10px below bar 1, 20px below bar 2 — bar 1 is nearer.
    expect(pickDropTarget({ x: 100, y: 46 }, near, 99, 28)?.windowId).toBe(1);
    expect(pickDropTarget({ x: 100, y: 46 }, near, 99, 28)?.inside).toBe(false);
  });

  test('the owner window is never a candidate', () => {
    // The point is inside bar 1 — but bar 1 is the owner, and
    // bar 2 is far away, so there is no target at all.
    expect(pickDropTarget({ x: 100, y: 10 }, bars, 1, 28)).toBeNull();
  });

  test('minimized / hidden windows are never candidates', () => {
    const hidden = [bar(1, 0, 0, 400, 36, [], 1000, false)];
    expect(pickDropTarget({ x: 100, y: 10 }, hidden, 99, 28)).toBeNull();
  });

  test('no bar in range returns null', () => {
    expect(pickDropTarget({ x: 100, y: 200 }, bars, 99, 28)).toBeNull();
  });
});

describe('insertionIndexFor', () => {
  const testBar = bar(1, 0, 0, 400, 36, [
    { id: 'terminal-1', x: 0, width: 100 },
    { id: 'terminal-2', x: 100, width: 100 },
    { id: 'terminal-3', x: 200, width: 100 },
  ], 1000);

  test('before the first tab centre is index 0', () => {
    expect(insertionIndexFor(10, testBar)).toBe(0);
  });

  test('between tab centres counts the tabs left of the pointer', () => {
    expect(insertionIndexFor(120, testBar)).toBe(1);
    expect(insertionIndexFor(220, testBar)).toBe(2);
  });

  test('past the last tab centre is the end', () => {
    expect(insertionIndexFor(390, testBar)).toBe(3);
  });
});

describe('outsideDistance', () => {
  const bounds = { x: 100, y: 100, width: 800, height: 600 };
  test('inside is 0', () => {
    expect(outsideDistance({ x: 200, y: 200 }, bounds)).toBe(0);
  });
  test('outside is the Euclidean distance to the rect', () => {
    expect(outsideDistance({ x: 100, y: 80 }, bounds)).toBe(20);
    expect(outsideDistance({ x: 920, y: 720 }, bounds)).toBeCloseTo(Math.hypot(20, 20));
  });
});

describe('terminalStore detach actions', () => {
  beforeEach(() => {
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      fs: { getHomeDir: async () => '/tmp' },
      terminal: {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
      },
    };
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null, exitedTabs: {}, createErrors: {} });
  });

  afterEach(() => {
    // Free every number this test reserved (detached tabs keep
    // theirs until releaseTabNumber, so release them all).
    const state = useTerminalStore.getState();
    for (const tab of [...state.tabs]) state.closeTab(tab.id);
    for (let n = 1; n <= 10; n++) state.releaseTabNumber(`terminal-${n}`);
    useTerminalStore.setState({ tabs: [], activeTabId: null, exitedTabs: {}, createErrors: {} });
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  });

  const TABS = [
    { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
    { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
    { id: 'terminal-3', title: 'Terminal 3', cwd: '/tmp', isActive: false },
  ];

  test('detachTab removes the tab but keeps its number reserved', async () => {
    const store = useTerminalStore.getState();
    const id1 = await store.createTab('/tmp');
    expect(id1).toBe('terminal-1');
    useTerminalStore.getState().detachTab('terminal-1');
    expect(useTerminalStore.getState().tabs).toHaveLength(0);
    // The number is still reserved: the next tab is terminal-2,
    // not a re-used terminal-1 (the PTY still lives).
    const id2 = await useTerminalStore.getState().createTab('/tmp');
    expect(id2).toBe('terminal-2');
  });

  test('releaseTabNumber frees the number for reuse', async () => {
    const store = useTerminalStore.getState();
    await store.createTab('/tmp');
    useTerminalStore.getState().detachTab('terminal-1');
    useTerminalStore.getState().releaseTabNumber('terminal-1');
    const id = await useTerminalStore.getState().createTab('/tmp');
    expect(id).toBe('terminal-1');
  });

  test('addDetachedTab inserts without a PTY and activates the tab', () => {
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-1' });
    useTerminalStore.getState().addDetachedTab(
      { id: 'terminal-9', title: 'Terminal 9', cwd: '/tmp', isActive: false },
      1,
    );
    const state = useTerminalStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-9', 'terminal-2', 'terminal-3']);
    expect(state.activeTabId).toBe('terminal-9');
    expect(state.tabs.find((t) => t.id === 'terminal-9')?.isActive).toBe(true);
  });

  test('addDetachedTab is idempotent — a double delivery lands once', () => {
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-1' });
    const store = useTerminalStore.getState();
    store.addDetachedTab({ id: 'terminal-9', title: 'Terminal 9', cwd: '/tmp', isActive: false });
    store.addDetachedTab({ id: 'terminal-9', title: 'Terminal 9', cwd: '/tmp', isActive: false });
    expect(useTerminalStore.getState().tabs).toHaveLength(4);
  });

  test('addDetachedTab reserves the number so a fresh tab cannot collide', async () => {
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useTerminalStore.getState().addDetachedTab({ id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false });
    // A fresh tab must not take terminal-2 (its PTY already lives).
    const id = await useTerminalStore.getState().createTab('/tmp');
    expect(id).toBe('terminal-1');
    const id2 = await useTerminalStore.getState().createTab('/tmp');
    expect(id2).toBe('terminal-3');
  });

  test('detachTab activates the previous tab when the active one leaves', () => {
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-2' });
    useTerminalStore.getState().detachTab('terminal-2');
    const state = useTerminalStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-3']);
    expect(state.activeTabId).toBe('terminal-1');
  });

  test('clearTabExited drops the exited mark (same-id restart)', () => {
    useTerminalStore.setState({
      tabs: TABS,
      activeTabId: 'terminal-1',
      exitedTabs: { 'terminal-1': 1 },
    });
    useTerminalStore.getState().clearTabExited('terminal-1');
    expect(useTerminalStore.getState().exitedTabs).toEqual({});
  });

  test('closeTab notifies main so the main window frees the number', () => {
    const notify = vi.fn();
    (win.lucidAPI as { terminal: { detach: { notifyTabClosed: unknown } } }).terminal.detach = {
      notifyTabClosed: notify,
    };
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-1' });
    useTerminalStore.getState().closeTab('terminal-1');
    expect(notify).toHaveBeenCalledWith('terminal-1');
  });

  test('reserveTabNumber reserves the number so a fresh tab cannot collide', async () => {
    // A number taken by another window (main broadcasts it):
    // a fresh tab here must skip it, like addDetachedTab.
    useTerminalStore.getState().reserveTabNumber('terminal-2');
    const id = await useTerminalStore.getState().createTab('/tmp');
    expect(id).toBe('terminal-1');
    const id2 = await useTerminalStore.getState().createTab('/tmp');
    expect(id2).toBe('terminal-3');
  });

  test('createTab reserves its number through main (broadcast)', async () => {
    const reserveNumber = vi.fn();
    const registerDetachedTab = vi.fn();
    (win.lucidAPI as { terminal: { detach: unknown } }).terminal.detach = {
      reserveNumber,
      registerDetachedTab,
    };
    const id = await useTerminalStore.getState().createTab('/tmp');
    expect(id).toBe('terminal-1');
    expect(reserveNumber).toHaveBeenCalledWith('terminal-1');
    expect(registerDetachedTab).not.toHaveBeenCalled();
  });

  test('createTab with { detached: true } registers the tab with main for pop-back', async () => {
    const reserveNumber = vi.fn();
    const registerDetachedTab = vi.fn();
    (win.lucidAPI as { terminal: { detach: unknown } }).terminal.detach = {
      reserveNumber,
      registerDetachedTab,
    };
    const id = await useTerminalStore.getState().createTab('/tmp', { detached: true });
    expect(id).toBe('terminal-1');
    // Registered (main pops it back when the window closes),
    // at the end of the strip - and NOT double-reserved: the
    // register call carries the reservation with it.
    expect(registerDetachedTab).toHaveBeenCalledWith(
      { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', hasPrompted: false },
      0,
    );
    expect(reserveNumber).not.toHaveBeenCalled();
  });
});

describe('resolveDetachSpawnBounds', () => {
  const DEFAULT = { x: 100, y: 100, width: 900, height: 560 };
  const STORED = { x: 24, y: 48, width: 900, height: 560 };

  test('a drag-out spawns at the drop point, never at remembered bounds (the glitch)', () => {
    // The tab was detached before (stored bounds exist) — the
    // window must still appear under the cursor, not at the old
    // spot. Regression: stored bounds used to win over the drop
    // point, so every later detach of the same tab popped up
    // where it was last time.
    const bounds = resolveDetachSpawnBounds({
      stored: STORED,
      dropPoint: { x: 800, y: 400 },
      defaultBounds: DEFAULT,
    });
    expect(bounds).toEqual({ x: 350, y: 120, width: 900, height: 560 });
  });

  test('a drag-out with a grab offset keeps the tab under the pointer', () => {
    const bounds = resolveDetachSpawnBounds({
      stored: STORED,
      dropPoint: { x: 800, y: 400 },
      spawnOffset: { x: 60, y: 46 },
      defaultBounds: DEFAULT,
    });
    expect(bounds).toEqual({ x: 740, y: 354, width: 900, height: 560 });
  });

  test('no drop point reopens where it was (restore, not a drag-out)', () => {
    expect(
      resolveDetachSpawnBounds({ stored: STORED, dropPoint: null, defaultBounds: DEFAULT }),
    ).toEqual(STORED);
  });

  test('no drop point and nothing stored falls back to the default', () => {
    expect(
      resolveDetachSpawnBounds({ stored: null, dropPoint: null, defaultBounds: DEFAULT }),
    ).toEqual(DEFAULT);
  });
});

describe('followOrigin', () => {
  test('the window keeps the offset it spawned with, so it moves 1:1 with the pointer', () => {
    expect(followOrigin({ x: 800, y: 400 }, { x: 60, y: 46 })).toEqual({ x: 740, y: 354 });
    expect(followOrigin({ x: 900, y: 500 }, { x: 60, y: 46 })).toEqual({ x: 840, y: 454 });
  });

  test('a centred window stays centred on the pointer', () => {
    expect(followOrigin({ x: 800, y: 400 }, { x: 450, y: 280 })).toEqual({ x: 350, y: 120 });
  });
});

describe('shouldAcceptPollPoint', () => {
  // Round 2 (Gary, 2026-11-14 — the 01:39 glitch): the poll reads
  // the REAL cursor, so it may only drive the session when the
  // renderer is silent, and only for points that agree with the
  // last authoritative point. One stream must win.
  const base = {
    silenceThresholdMs: 100,
    tolerancePx: 768,
  };

  test('while the renderer reports moves the poll is gated off entirely', () => {
    // A live renderer (0 ms, 50 ms, exactly at the threshold)
    // means the drag-move stream is the pointer — the poll's
    // real-cursor reading must not drive anything, even for a
    // point right next to the last one.
    for (const silentMs of [0, 50, 100]) {
      expect(
        shouldAcceptPollPoint({ ...base, silentMs, point: { x: 10, y: 10 }, lastPoint: { x: 0, y: 0 } }),
      ).toBe(false);
    }
  });

  test('a silent renderer hands the poll the wheel for a near point', () => {
    expect(
      shouldAcceptPollPoint({ ...base, silentMs: 150, point: { x: 600, y: 0 }, lastPoint: { x: 0, y: 0 } }),
    ).toBe(true);
  });

  test('a fast flick during the silence gap stays inside the tolerance', () => {
    // 4500 px/s × ~130 ms ≈ 600 px of drift while the renderer
    // is quiet — the fallback must still engage, or a fast real
    // drag-out would never detach.
    expect(
      shouldAcceptPollPoint({
        ...base,
        silentMs: 130,
        point: { x: 3148, y: 1322 },
        lastPoint: { x: 2548, y: 1322 },
      }),
    ).toBe(true);
  });

  test('the 01:39 incident replays as a rejection', () => {
    // The dispatched pointer was at (2548,1322) while Gary's
    // real cursor swept to (271,548) — ~2400 px apart. The poll
    // must never feed that point into the session.
    expect(
      shouldAcceptPollPoint({
        ...base,
        silentMs: 150,
        point: { x: 271, y: 548 },
        lastPoint: { x: 2548, y: 1322 },
      }),
    ).toBe(false);
  });

  test('the tolerance boundary holds: exactly 768 in, 769 out', () => {
    expect(
      shouldAcceptPollPoint({ ...base, silentMs: 150, point: { x: 768, y: 0 }, lastPoint: { x: 0, y: 0 } }),
    ).toBe(true);
    expect(
      shouldAcceptPollPoint({ ...base, silentMs: 150, point: { x: 769, y: 0 }, lastPoint: { x: 0, y: 0 } }),
    ).toBe(false);
  });

  test('no authoritative point yet means the poll is the only signal', () => {
    // Drag-start arrived but no move ever did (capture failed at
    // the press) — the poll is all there is, so it is accepted.
    expect(
      shouldAcceptPollPoint({ ...base, silentMs: 150, point: { x: 500, y: 500 }, lastPoint: null }),
    ).toBe(true);
  });
});

describe('clampDragFollowOrigin', () => {
  // Round 2 (Gary, 2026-11-14 — the solo-drag verdict): the old
  // whole-window workArea clamp shoved the detached window to the
  // middle of the screen at the bottom/left edge, so it popped up
  // in the middle of the blurred background instead of under the
  // cursor. The follow now keeps only a visible strip on-screen.
  // Gary's display: 1920x1080, workArea (0,25,1920,991).
  const AREA = { x: 0, y: 25, width: 1920, height: 991 };
  const SIZE = { width: 900, height: 560 };
  const MIN_VISIBLE = 100;

  test('mid-screen the window moves 1:1, untouched', () => {
    expect(clampDragFollowOrigin({ x: 500, y: 300 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 500, y: 300 });
  });

  test('session 1 replay (bottom edge): the tab stays under the cursor', () => {
    // Gary detached at (783,957), grab (74,24) → follow offset
    // (74,60) → origin (709,897). The old clamp forced the whole
    // window on-screen and moved it to y≈456 — the middle of the
    // screen. The strip clamp leaves it at (709,897): the tab
    // (window top + 36 strip + 24 grab) sits under the pointer.
    expect(clampDragFollowOrigin({ x: 709, y: 897 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 709, y: 897 });
  });

  test('session 2 replay (left edge): the tab stays under the cursor', () => {
    // Detached at (243,586), grab (73,24) → origin (170,526).
    // The old clamp moved it to y≈456 too. The strip clamp
    // leaves it exactly under the pointer.
    expect(clampDragFollowOrigin({ x: 170, y: 526 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 170, y: 526 });
  });

  test('a window flung far off-screen is reined in to a visible strip', () => {
    // Bottom: 1200 → maxY = 25 + 991 − 100 = 916.
    expect(clampDragFollowOrigin({ x: 709, y: 1200 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 709, y: 916 });
    // Left: −950 → minX = 0 − (900 − 100) = −800.
    expect(clampDragFollowOrigin({ x: -950, y: 500 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: -800, y: 500 });
    // Top: −600 → minY = 25 − (560 − 100) = −435.
    expect(clampDragFollowOrigin({ x: 500, y: -600 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 500, y: -435 });
    // Right: 1900 → maxX = 0 + 1920 − 100 = 1820.
    expect(clampDragFollowOrigin({ x: 1900, y: 500 }, SIZE, AREA, MIN_VISIBLE)).toEqual({ x: 1820, y: 500 });
  });
});
