/**
 * Main window placement pure tests (Gary, 2026-11-17): Lucid kept
 * opening on the "Muse Agent Workspace" display — a virtual/agent
 * display Gary cannot see — instead of his main display, because
 * `createWindow` passed no x/y at all. The resolver centers the
 * main window on the PRIMARY display, every launch, and ignores
 * saved bounds stranded on another (or disconnected) display.
 *
 * The module is pure (plain data in, bounds out; no Electron
 * import), so these tests need no mocks.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';

import {
  MAIN_WINDOW_DEFAULT_HEIGHT,
  MAIN_WINDOW_DEFAULT_WIDTH,
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
  centerBoundsOnWorkArea,
  clampBoundsToWorkArea,
  findPrimaryDisplay,
  isBoundsVisibleOnWorkArea,
  parseSavedBounds,
  resolveMainWindowBounds,
  type DisplayInfo,
} from '../electron/services/mainWindowPlacement';

/** Gary's exact setup: main 1920x1080 (menu bar eats the top 25px)
 * + agent/virtual display 1984x1216 immediately to its right. */
const PRIMARY_WORK_AREA = { x: 0, y: 25, width: 1920, height: 1055 };
const AGENT_WORK_AREA = { x: 1920, y: 0, width: 1984, height: 1216 };
const GARY_DISPLAYS: DisplayInfo[] = [
  { workArea: PRIMARY_WORK_AREA, primary: true },
  { workArea: AGENT_WORK_AREA, primary: false },
];

describe('main window defaults', () => {
  it('defaults to 1400x900 with an 800x600 minimum', () => {
    expect(MAIN_WINDOW_DEFAULT_WIDTH).toBe(1400);
    expect(MAIN_WINDOW_DEFAULT_HEIGHT).toBe(900);
    expect(MAIN_WINDOW_MIN_WIDTH).toBe(800);
    expect(MAIN_WINDOW_MIN_HEIGHT).toBe(600);
  });
});

describe('findPrimaryDisplay', () => {
  it('returns the display flagged primary', () => {
    expect(findPrimaryDisplay(GARY_DISPLAYS)?.workArea).toEqual(
      PRIMARY_WORK_AREA,
    );
  });

  it('falls back to the first display when none is flagged', () => {
    const displays: DisplayInfo[] = [
      { workArea: { x: 0, y: 0, width: 1440, height: 900 }, primary: false },
      { workArea: { x: 1440, y: 0, width: 1440, height: 900 }, primary: false },
    ];
    expect(findPrimaryDisplay(displays)?.workArea.width).toBe(1440);
  });

  it('returns null for empty / missing display lists', () => {
    expect(findPrimaryDisplay([])).toBeNull();
    expect(findPrimaryDisplay(null)).toBeNull();
    expect(findPrimaryDisplay(undefined)).toBeNull();
  });
});

describe('parseSavedBounds', () => {
  it('returns a valid bounds object as-is', () => {
    expect(
      parseSavedBounds({ x: 100, y: 100, width: 1200, height: 800 }),
    ).toEqual({ x: 100, y: 100, width: 1200, height: 800 });
  });

  it('returns null for null, garbage, partial, or non-finite input', () => {
    expect(parseSavedBounds(null)).toBeNull();
    expect(parseSavedBounds(undefined)).toBeNull();
    expect(parseSavedBounds('garbage')).toBeNull();
    expect(parseSavedBounds(42)).toBeNull();
    expect(parseSavedBounds([])).toBeNull();
    expect(parseSavedBounds({ x: 1, y: 2, width: 3 })).toBeNull();
    expect(
      parseSavedBounds({ x: 1, y: 2, width: 3, height: 'tall' }),
    ).toBeNull();
    expect(
      parseSavedBounds({ x: NaN, y: 2, width: 3, height: 4 }),
    ).toBeNull();
    expect(
      parseSavedBounds({ x: 1, y: 2, width: Infinity, height: 4 }),
    ).toBeNull();
  });

  it('returns null for non-positive sizes', () => {
    expect(
      parseSavedBounds({ x: 0, y: 0, width: 0, height: 800 }),
    ).toBeNull();
    expect(
      parseSavedBounds({ x: 0, y: 0, width: 1200, height: -5 }),
    ).toBeNull();
  });
});

describe('isBoundsVisibleOnWorkArea', () => {
  it('is true for a rect fully on the work area', () => {
    expect(
      isBoundsVisibleOnWorkArea(
        { x: 100, y: 100, width: 1200, height: 800 },
        PRIMARY_WORK_AREA,
      ),
    ).toBe(true);
  });

  it('is false for a rect entirely on another display', () => {
    // The agent display starts at x=1920; this rect never touches
    // the primary work area.
    expect(
      isBoundsVisibleOnWorkArea(
        { x: 2000, y: 100, width: 1200, height: 800 },
        PRIMARY_WORK_AREA,
      ),
    ).toBe(false);
  });

  it('is false when less than 100px overlaps (not enough to grab)', () => {
    // Overlaps the primary work area by only 70px horizontally.
    expect(
      isBoundsVisibleOnWorkArea(
        { x: 1850, y: 100, width: 1200, height: 800 },
        PRIMARY_WORK_AREA,
      ),
    ).toBe(false);
  });

  it('is true at exactly 100px of overlap', () => {
    expect(
      isBoundsVisibleOnWorkArea(
        { x: 1820, y: 100, width: 1200, height: 800 },
        PRIMARY_WORK_AREA,
      ),
    ).toBe(true);
  });
});

describe('clampBoundsToWorkArea', () => {
  it('leaves on-screen bounds alone', () => {
    expect(
      clampBoundsToWorkArea(
        { x: 100, y: 100, width: 1200, height: 800 },
        PRIMARY_WORK_AREA,
      ),
    ).toEqual({ x: 100, y: 100, width: 1200, height: 800 });
  });

  it('pulls negative origins into the work area (respecting its y)', () => {
    expect(
      clampBoundsToWorkArea(
        { x: -50, y: -10, width: 1000, height: 700 },
        PRIMARY_WORK_AREA,
      ),
    ).toEqual({ x: 0, y: 25, width: 1000, height: 700 });
  });

  it('pulls an off-screen window back and shrinks it to fit', () => {
    expect(
      clampBoundsToWorkArea(
        { x: 2000, y: 1200, width: 3000, height: 2000 },
        PRIMARY_WORK_AREA,
      ),
    ).toEqual({ x: 0, y: 25, width: 1920, height: 1055 });
  });
});

describe('centerBoundsOnWorkArea', () => {
  it('centers the default size on the primary work area', () => {
    // x: (1920-1400)/2 = 260; y: 25 + (1055-900)/2 = 102.5 -> 103.
    expect(centerBoundsOnWorkArea(1400, 900, PRIMARY_WORK_AREA)).toEqual({
      x: 260,
      y: 103,
      width: 1400,
      height: 900,
    });
  });

  it('shrinks a window larger than the work area to fit', () => {
    expect(centerBoundsOnWorkArea(2000, 1200, PRIMARY_WORK_AREA)).toEqual({
      x: 0,
      y: 25,
      width: 1920,
      height: 1055,
    });
  });
});

describe('resolveMainWindowBounds — Gary\u2019s two-display setup', () => {
  it('opens centered on the PRIMARY display, not the agent display', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
      }),
    ).toEqual({ x: 260, y: 103, width: 1400, height: 900 });
  });

  it('ignores saved bounds stranded on the agent display', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
        savedBounds: { x: 2000, y: 100, width: 1200, height: 800 },
      }),
    ).toEqual({ x: 260, y: 103, width: 1400, height: 900 });
  });

  it('ignores saved bounds on a disconnected display', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
        savedBounds: { x: 4000, y: 100, width: 1200, height: 800 },
      }),
    ).toEqual({ x: 260, y: 103, width: 1400, height: 900 });
  });

  it('ignores garbage saved bounds', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
        savedBounds: 'garbage',
      }),
    ).toEqual({ x: 260, y: 103, width: 1400, height: 900 });
  });

  it('keeps saved bounds that are visibly on the primary display', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
        savedBounds: { x: 100, y: 100, width: 1200, height: 800 },
      }),
    ).toEqual({ x: 100, y: 100, width: 1200, height: 800 });
  });

  it('clamps saved bounds that only just overlap the primary display', () => {
    // 100px of horizontal overlap counts as visible; the rect is
    // pulled fully onto the primary display.
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: GARY_DISPLAYS,
        savedBounds: { x: 1820, y: 100, width: 1200, height: 800 },
      }),
    ).toEqual({ x: 720, y: 100, width: 1200, height: 800 });
  });
});

describe('resolveMainWindowBounds — other setups', () => {
  it('centers on a single display', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: [
          { workArea: { x: 0, y: 0, width: 1440, height: 900 }, primary: true },
        ],
      }),
    ).toEqual({ x: 20, y: 0, width: 1400, height: 900 });
  });

  it('uses the first display when none is flagged primary', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: [
          { workArea: { x: 0, y: 0, width: 1440, height: 900 }, primary: false },
          { workArea: { x: 1440, y: 0, width: 1440, height: 900 }, primary: false },
        ],
      }),
    ).toEqual({ x: 20, y: 0, width: 1400, height: 900 });
  });

  it('shrinks to fit a primary display smaller than the default size', () => {
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: [
          { workArea: { x: 0, y: 0, width: 1024, height: 768 }, primary: true },
        ],
      }),
    ).toEqual({ x: 0, y: 0, width: 1024, height: 768 });
  });

  it('falls back to the default size at the origin with no displays', () => {
    expect(
      resolveMainWindowBounds({ width: 1400, height: 900, displays: [] }),
    ).toEqual({ x: 0, y: 0, width: 1400, height: 900 });
    expect(
      resolveMainWindowBounds({
        width: 1400,
        height: 900,
        displays: null,
      }),
    ).toEqual({ x: 0, y: 0, width: 1400, height: 900 });
  });
});
