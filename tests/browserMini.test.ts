/**
 * Mini window (Area 6) pure tests: the persisted-bounds validation
 * in `electron/services/browserMiniWindow.ts`.
 *
 * Stored bounds come from disk, so they are untrusted: garbage in
 * must yield the defaults, never a crash and never an off-screen
 * or unusably small window.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';

// The service imports Electron (BrowserWindow) and electron-store,
// but resolveMiniBounds touches neither — inert mocks so the module
// loads in the node test environment.
vi.mock('electron', () => ({
  BrowserWindow: class {},
}));

vi.mock('electron-store', () => ({
  default: class {
    constructor(_opts?: unknown) {}
    get() {
      return undefined;
    }
    set() {}
  },
}));

import {
  MINI_WINDOW_DEFAULT_BOUNDS,
  MINI_WINDOW_MIN_WIDTH,
  MINI_WINDOW_MIN_HEIGHT,
  resolveMiniBounds,
} from '../electron/services/browserMiniWindow';

describe('mini window defaults', () => {
  it('defaults to 640x420', () => {
    expect(MINI_WINDOW_DEFAULT_BOUNDS.width).toBe(640);
    expect(MINI_WINDOW_DEFAULT_BOUNDS.height).toBe(420);
  });

  it('has a usable minimum size', () => {
    expect(MINI_WINDOW_MIN_WIDTH).toBe(320);
    expect(MINI_WINDOW_MIN_HEIGHT).toBe(240);
  });
});

describe('resolveMiniBounds', () => {
  it('returns valid stored bounds as-is', () => {
    expect(
      resolveMiniBounds({ x: 50, y: 60, width: 800, height: 500 }),
    ).toEqual({ x: 50, y: 60, width: 800, height: 500 });
  });

  it('falls back to defaults for null, garbage, or partial input', () => {
    expect(resolveMiniBounds(null)).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(resolveMiniBounds(undefined)).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(resolveMiniBounds('garbage')).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(resolveMiniBounds(42)).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(resolveMiniBounds([])).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(resolveMiniBounds({ x: 1, y: 2, width: 3 })).toEqual(
      MINI_WINDOW_DEFAULT_BOUNDS,
    );
    expect(
      resolveMiniBounds({ x: 1, y: 2, width: 3, height: 'tall' }),
    ).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
  });

  it('falls back for non-finite numbers', () => {
    expect(
      resolveMiniBounds({ x: NaN, y: 2, width: 3, height: 4 }),
    ).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
    expect(
      resolveMiniBounds({ x: 1, y: 2, width: Infinity, height: 4 }),
    ).toEqual(MINI_WINDOW_DEFAULT_BOUNDS);
  });

  it('clamps a too-small window up to the minimum', () => {
    expect(
      resolveMiniBounds({ x: 0, y: 0, width: 100, height: 100 }),
    ).toEqual({ x: 0, y: 0, width: 320, height: 240 });
  });
});
