/**
 * Browser Phase B — agent session tests: the mini window appears
 * when an agent browses, the glass splash shows first, then the
 * mini goes fullscreen while in use and back to PiP when idle;
 * the live mouse is clamped and pushed out; the finger queue
 * gates access; Gary's stop / take-control / lock end agent use.
 *
 * Fake deps, real (short) timers — no Electron needed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createBrowserAgentSession,
  type BrowserAgentSessionDeps,
} from '../electron/services/browserAgentSession';
import type { BrowserAgentStateSnapshot } from '../src/lib/browserAgent';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeDeps(overrides: Partial<BrowserAgentSessionDeps> = {}) {
  const states: BrowserAgentStateSnapshot[] = [];
  const fullscreenCalls: boolean[] = [];
  let locked = false;
  let luciferAiEnabled = true;
  const deps: BrowserAgentSessionDeps & {
    states: BrowserAgentStateSnapshot[];
    fullscreenCalls: boolean[];
    setLocked: (v: boolean) => void;
    setLuciferAiEnabled: (v: boolean) => void;
  } = {
    popOutActiveTab: vi.fn(() => 'tab-1'),
    setMiniFullscreen: vi.fn((inUse: boolean) => {
      fullscreenCalls.push(inUse);
    }),
    emitState: vi.fn((state: BrowserAgentStateSnapshot) => {
      states.push(state);
    }),
    getViewBounds: vi.fn(() => ({ width: 640, height: 420 })),
    onAgentStopped: vi.fn(),
    getLuciferAiEnabled: () => luciferAiEnabled,
    isFingerLocked: () => locked,
    setFingerLockedSetting: vi.fn((v: boolean) => {
      locked = v;
    }),
    states,
    fullscreenCalls,
    setLocked: (v: boolean) => {
      locked = v;
    },
    setLuciferAiEnabled: (v: boolean) => {
      luciferAiEnabled = v;
    },
    ...overrides,
  };
  return deps;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('agent session lifecycle', () => {
  it('beginTool pops the tab out and shows the glass splash first — fullscreen only after it fades', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 30,
    });
    const begun = session.beginTool('lucifer-ai');
    expect(begun).toEqual({ ok: true });
    expect(deps.popOutActiveTab).toHaveBeenCalledTimes(1);
    let state = session.getState();
    expect(state.inUse).toBe(true);
    expect(state.splash).toBe(true);
    expect(state.fullscreen).toBe(false);
    expect(state.holder).toBe('lucifer-ai');
    expect(state.poppedOutTabId).toBe('tab-1');
    // Splash loads first, then fades, then fullscreen.
    await sleep(60);
    state = session.getState();
    expect(state.splash).toBe(false);
    expect(state.fullscreen).toBe(true);
    expect(deps.fullscreenCalls).toEqual([true]);
    session.dispose();
  });

  it('a second tool call in the same burst does not re-splash', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 30,
    });
    session.beginTool('lucifer-ai');
    await sleep(60);
    expect(session.getState().fullscreen).toBe(true);
    session.endTool();
    session.beginTool('lucifer-ai');
    // Still in the burst: no new splash, still fullscreen.
    expect(session.getState().splash).toBe(false);
    expect(session.getState().fullscreen).toBe(true);
    expect(deps.popOutActiveTab).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('goes idle after the quiet window: PiP again, mouse hidden', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 30,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    await sleep(30);
    session.moveMouse(100, 50);
    expect(session.getState().mouse).toEqual({ x: 100, y: 50 });
    session.endTool();
    await sleep(60);
    const state = session.getState();
    expect(state.inUse).toBe(false);
    expect(state.fullscreen).toBe(false);
    expect(state.splash).toBe(false);
    expect(state.mouse).toBeNull();
    expect(deps.fullscreenCalls).toEqual([true, false]);
    session.dispose();
  });

  it('a tool call inside the idle window keeps the burst alive', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 40,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    await sleep(30);
    session.endTool();
    await sleep(20);
    session.beginTool('lucifer-ai');
    await sleep(60);
    expect(session.getState().inUse).toBe(true);
    expect(deps.fullscreenCalls).toEqual([true]);
    session.dispose();
  });

  it('proceeds when there is no tab to pop out (the tool reports it)', () => {
    const deps = makeDeps({ popOutActiveTab: () => null });
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    expect(session.beginTool('lucifer-ai')).toEqual({ ok: true });
    expect(session.getState().inUse).toBe(true);
    expect(session.getState().poppedOutTabId).toBeNull();
    // No pop-out, no splash, no fullscreen — nothing to show.
    expect(session.getState().splash).toBe(false);
    expect(session.getState().fullscreen).toBe(false);
    session.dispose();
  });
});

describe('agent session mouse', () => {
  it('moves the live mouse, clamped to the browser area, and pushes it out', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    // No burst yet: no mouse.
    expect(session.moveMouse(100, 50)).toBeNull();
    session.beginTool('lucifer-ai');
    expect(session.moveMouse(700, 500)).toEqual({ x: 640, y: 420 });
    expect(session.getState().mouse).toEqual({ x: 640, y: 420 });
    expect(deps.states.at(-1)?.mouse).toEqual({ x: 640, y: 420 });
    session.dispose();
  });

  it('hides the mouse when the session goes idle', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 20,
      splashMs: 5,
    });
    session.beginTool('lucifer-ai');
    session.moveMouse(10, 10);
    session.endTool();
    await sleep(50);
    expect(session.getState().mouse).toBeNull();
    session.dispose();
  });
});

describe('agent session queue + Gary controls', () => {
  it('a second agent queues while the first holds the finger', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    expect(session.beginTool('lucifer-ai')).toEqual({ ok: true });
    const second = session.beginTool('agent-2');
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/queued at position 1/);
    expect(session.getState().queuedHolders).toEqual(['agent-2']);
    session.dispose();
  });

  it('takeControl refuses agent tools until Gary gives the mouse back', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    session.takeControl();
    const state = session.getState();
    expect(state.garyHasControl).toBe(true);
    expect(state.holder).toBeNull();
    expect(state.inUse).toBe(false);
    // Waiters stay queued for when he hands it back.
    expect(session.beginTool('lucifer-ai').ok).toBe(false);
    expect(session.moveMouse(10, 10)).toBeNull();
    session.giveBackControl();
    expect(session.getState().garyHasControl).toBe(false);
    expect(session.beginTool('lucifer-ai')).toEqual({ ok: true });
    session.dispose();
  });

  it('stopAgent ends the browsing and stops running flows', async () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    session.beginTool('agent-2');
    await sleep(30);
    session.stopAgent();
    const state = session.getState();
    expect(state.holder).toBeNull();
    expect(state.queuedHolders).toEqual([]);
    expect(state.inUse).toBe(false);
    expect(state.fullscreen).toBe(false);
    expect(state.mouse).toBeNull();
    expect(deps.onAgentStopped).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('locking the finger is a kill-switch: holder released, tools refused', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    session.setFingerLocked(true);
    const state = session.getState();
    expect(state.fingerLocked).toBe(true);
    expect(state.holder).toBeNull();
    expect(state.inUse).toBe(false);
    const refused = session.beginTool('lucifer-ai');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/locked/);
    // Unlocking lets agents in again.
    session.setFingerLocked(false);
    expect(session.beginTool('lucifer-ai')).toEqual({ ok: true });
    session.dispose();
  });

  it('honours a lock that landed outside the session', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    deps.setLocked(true);
    const refused = session.beginTool('lucifer-ai');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/locked/);
    session.dispose();
  });

  it('setPoppedOutTabId keeps the snapshot honest on user pop-in', () => {
    const deps = makeDeps();
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    session.beginTool('lucifer-ai');
    expect(session.getState().poppedOutTabId).toBe('tab-1');
    session.setPoppedOutTabId(null);
    expect(session.getState().poppedOutTabId).toBeNull();
    session.dispose();
  });

  it('reports LuciferAI disabled in the snapshot for the mini window', () => {
    const deps = makeDeps();
    deps.setLuciferAiEnabled(false);
    const session = createBrowserAgentSession(deps, {
      idleMs: 50,
      splashMs: 10,
    });
    expect(session.getState().luciferAiEnabled).toBe(false);
    session.dispose();
  });
});
