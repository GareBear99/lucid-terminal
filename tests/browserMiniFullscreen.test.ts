/**
 * Mini window fullscreen-while-in-use (Phase B): when an agent is
 * actively driving the browser the mini window expands to FULL
 * SCREEN from its floating PiP state, and returns to the PiP
 * bounds Gary left it in when idle.
 *
 * Fake BrowserWindow + electron-store, same harness as
 * tests/browserMini.test.ts — no Electron needed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeWindow {
  bounds: { x: number; y: number; width: number; height: number };
  fullscreen: boolean;
  setBoundsCalls: Array<{ x: number; y: number; width: number; height: number }>;
  setFullscreenCalls: boolean[];
  destroyed: boolean;
}

// vi.mock factories are hoisted — the fake class and its instance
// list must come from vi.hoisted, not top-level variables.
const instances = vi.hoisted(() => [] as FakeWindow[]);

vi.mock('electron', () => {
  class FakeBrowserWindow {
    bounds = { x: 100, y: 100, width: 640, height: 420 };
    fullscreen = false;
    setBoundsCalls: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    setFullscreenCalls: boolean[] = [];
    destroyed = false;

    constructor(_opts?: unknown) {
      instances.push(this as unknown as FakeWindow);
    }

    on() {}
    once() {}
    show() {}
    focus() {}
    close() {}
    isDestroyed() {
      return this.destroyed;
    }
    getBounds() {
      return { ...this.bounds };
    }
    setBounds(b: { x: number; y: number; width: number; height: number }) {
      this.bounds = { ...b };
      this.setBoundsCalls.push({ ...b });
    }
    setFullScreen(f: boolean) {
      this.fullscreen = f;
      this.setFullscreenCalls.push(f);
    }
    loadURL() {}
    loadFile() {}
  }

  return { BrowserWindow: FakeBrowserWindow };
});

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
  createMiniBrowserWindow,
  isMiniWindowFullscreen,
  resetMiniWindowFullscreenForTests,
  setMiniWindowFullscreen,
} from '../electron/services/browserMiniWindow';

beforeEach(() => {
  // The module keeps one singleton window per file run: later
  // creates return the existing window (no new instance). Only
  // the fullscreen flag resets between tests — and the fake's
  // recorded calls, so each test sees only its own.
  resetMiniWindowFullscreenForTests();
  const last = instances[instances.length - 1];
  if (last) {
    last.setFullscreenCalls.length = 0;
    last.setBoundsCalls.length = 0;
  }
});

/** Create (or focus) the mini window and return its fake. */
function miniWindow() {
  createMiniBrowserWindow({ onClosed: () => {} });
  return instances[instances.length - 1];
}

describe('mini window fullscreen while in use', () => {
  it('is not fullscreen until an agent uses the browser', () => {
    miniWindow();
    expect(isMiniWindowFullscreen()).toBe(false);
  });

  it('enters fullscreen on use and restores the PiP bounds on idle', () => {
    const fake = miniWindow();
    // Gary moved the PiP window somewhere first.
    fake.bounds = { x: 40, y: 60, width: 700, height: 460 };

    expect(setMiniWindowFullscreen(true)).toBe(true);
    expect(isMiniWindowFullscreen()).toBe(true);
    expect(fake.setFullscreenCalls).toEqual([true]);

    expect(setMiniWindowFullscreen(false)).toBe(false);
    expect(isMiniWindowFullscreen()).toBe(false);
    expect(fake.setFullscreenCalls).toEqual([true, false]);
    // Back to the PiP bounds Gary left it in — not the screen size.
    expect(fake.setBoundsCalls).toEqual([
      { x: 40, y: 60, width: 700, height: 460 },
    ]);
  });

  it('entering fullscreen twice is a no-op (bounds saved once)', () => {
    const fake = miniWindow();
    // Start from the default PiP bounds (the previous test left the
    // fake at its own restored bounds).
    fake.bounds = { x: 100, y: 100, width: 640, height: 420 };
    setMiniWindowFullscreen(true);
    fake.bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(setMiniWindowFullscreen(true)).toBe(true);
    expect(fake.setFullscreenCalls).toEqual([true]);
    expect(setMiniWindowFullscreen(false)).toBe(false);
    // The restored bounds are the pre-fullscreen PiP bounds.
    expect(fake.setBoundsCalls).toEqual([
      { x: 100, y: 100, width: 640, height: 420 },
    ]);
  });

  it('exiting when not fullscreen is a no-op', () => {
    const fake = miniWindow();
    expect(setMiniWindowFullscreen(false)).toBe(false);
    expect(fake.setFullscreenCalls).toEqual([]);
    expect(fake.setBoundsCalls).toEqual([]);
  });
});
