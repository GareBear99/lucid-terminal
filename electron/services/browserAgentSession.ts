/**
 * Browser Phase B — the agent-browser session (Gary, 2026-11-07):
 * the coordinator behind "mini window appears when an agent calls
 * the browser tool" + "fullscreen while in use" + "glass splash
 * on the browser tab" + "live separate mouse" + "finger queue" +
 * "LuciferAI-disabled stop / take control".
 *
 * One session owns the finger queue, the in-use/idle lifecycle,
 * the glass splash, and the live agent mouse. `electron/ipc/browser.ts`
 * wraps every `browser_*` tool target call in `beginTool` /
 * `endTool`, so any agent tool call — navigate, read, click, fill,
 * screenshot, search, flow, trusted click, move mouse — pops the
 * active tab into the mini window and shows Gary what the agent
 * is doing. The wrapper is the only caller; this module never
 * touches Electron itself (all effects go through `deps`), so it
 * is unit-testable with fake deps and short timers.
 *
 * Lifecycle of one burst:
 *   beginTool (idle) → pop the tab out to the mini window,
 *     glass splash on the browser tab (~3.2s, the boot splash's
 *     rhythm), then the mini window goes FULLSCREEN while the
 *     agent is using it.
 *   endTool → after `idleMs` with no further tool call, the
 *     mini window drops back to its floating PiP state and the
 *     agent mouse hides. A new tool call inside the window
 *     keeps the burst alive (no second splash).
 *
 * Gary's controls (mini window, when LuciferAI is off — but
 * wired so they work whenever):
 *   stopAgent() — ends the agent's browser use now: the holder
 *     and the whole queue are dropped, fullscreen off, mouse
 *     hidden, `onAgentStopped` fires so the caller can stop any
 *     running flow.
 *   takeControl() — Gary takes the mouse: the holder is released
 *     (waiters stay queued), agent tools are refused until
 *     giveBackControl().
 * Locking the finger (`setFingerLocked(true)`) stops new grants
 * and releases the current holder at once — a lock is a
 * kill-switch, not a "finish your click first" (unlike the
 * queue's plain `lock()`, which lets a live action finish).
 */

import {
  BROWSER_AGENT_HOLDER_ID,
  BROWSER_AGENT_IDLE_MS,
  BROWSER_GLASS_SPLASH_TOTAL_MS,
  clampAgentMousePosition,
  type BrowserAgentMousePosition,
  type BrowserAgentStateSnapshot,
  type BrowserViewSize,
} from '../../src/lib/browserAgent';
import { BrowserFingerQueue } from './browserFingerQueue';

export { BROWSER_AGENT_HOLDER_ID };

export interface BrowserAgentSessionDeps {
  /** Pop the active tab out to the mini window. Returns the
   * popped-out tab id, or null when there is no active tab (or no
   * mini window) — non-fatal: the tool itself still runs and
   * reports what happened. */
  popOutActiveTab: () => string | null;
  /** Fullscreen the mini window while the browser is in use, PiP
   * when it is not. */
  setMiniFullscreen: (inUse: boolean) => void;
  /** Push the state snapshot to both windows (main + mini). */
  emitState: (state: BrowserAgentStateSnapshot) => void;
  /** The active tab's view size, for clamping the mouse — null
   * when there is no view to lock the mouse inside. */
  getViewBounds: () => BrowserViewSize | null;
  /** Gary stopped the agent: stop any running flow. */
  onAgentStopped: () => void;
  /** Live settings reads (main's electron-store, the same store
   * the renderer persists to). */
  getLuciferAiEnabled: () => boolean;
  isFingerLocked: () => boolean;
  setFingerLockedSetting: (locked: boolean) => void;
}

export interface BrowserAgentSessionOptions {
  /** Idle delay before the mini window drops out of fullscreen
   * (default `BROWSER_AGENT_IDLE_MS`). */
  idleMs?: number;
  /** Glass-splash length (default `BROWSER_GLASS_SPLASH_TOTAL_MS`). */
  splashMs?: number;
}

export interface BrowserAgentSession {
  getState(): BrowserAgentStateSnapshot;
  /** The finger queue, for IPC request/release by other agents. */
  getQueue(): BrowserFingerQueue;
  beginTool(holderId?: string): { ok: boolean; error?: string };
  endTool(): void;
  moveMouse(
    x: number,
    y: number,
  ): BrowserAgentMousePosition | null;
  stopAgent(): void;
  takeControl(): void;
  giveBackControl(): void;
  setFingerLocked(locked: boolean): void;
  /** The popped-out tab changed outside the session (user pop-out
   * / pop-in / close) — keep the snapshot honest. */
  setPoppedOutTabId(tabId: string | null): void;
  dispose(): void;
}

export function createBrowserAgentSession(
  deps: BrowserAgentSessionDeps,
  options: BrowserAgentSessionOptions = {},
): BrowserAgentSession {
  const idleMs = options.idleMs ?? BROWSER_AGENT_IDLE_MS;
  const splashMs = options.splashMs ?? BROWSER_GLASS_SPLASH_TOTAL_MS;
  const queue = new BrowserFingerQueue(deps.isFingerLocked());

  let poppedOutTabId: string | null = null;
  let inUse = false;
  let splash = false;
  let fullscreen = false;
  let mouse: BrowserAgentMousePosition | null = null;
  let garyHasControl = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let splashTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const clearSplashTimer = () => {
    if (splashTimer) {
      clearTimeout(splashTimer);
      splashTimer = null;
    }
  };

  const snapshot = (): BrowserAgentStateSnapshot => ({
    holder: queue.getHolder(),
    queuedHolders: queue.getQueue(),
    inUse,
    splash,
    fullscreen,
    mouse: mouse ? { ...mouse } : null,
    garyHasControl,
    fingerLocked: queue.isLocked(),
    luciferAiEnabled: deps.getLuciferAiEnabled(),
    poppedOutTabId,
  });

  const emit = () => {
    if (disposed) return;
    deps.emitState(snapshot());
  };

  /** Enter fullscreen at the end of the splash: splash loads
   * first, then fades, then fullscreen. */
  const enterFullscreenAfterSplash = () => {
    clearSplashTimer();
    splashTimer = setTimeout(() => {
      splashTimer = null;
      if (disposed || !inUse) return;
      splash = false;
      fullscreen = true;
      deps.setMiniFullscreen(true);
      emit();
    }, splashMs);
  };

  /** Leave the in-use state: PiP again, mouse hidden, no splash. */
  const goIdle = () => {
    clearIdleTimer();
    clearSplashTimer();
    if (!inUse && !splash && !fullscreen) return;
    inUse = false;
    splash = false;
    if (fullscreen) {
      fullscreen = false;
      deps.setMiniFullscreen(false);
    }
    mouse = null;
    emit();
  };

  const session: BrowserAgentSession = {
    getState: () => snapshot(),

    getQueue: () => queue,

    beginTool(holderId = BROWSER_AGENT_HOLDER_ID) {
      if (disposed) return { ok: false, error: 'disposed' };
      if (garyHasControl) {
        return {
          ok: false,
          error:
            'Gary has taken control of the browser — ask him to hand it back before browsing.',
        };
      }
      // A lock that landed since the session started (Gary locked
      // it from the mini window) is honoured here, not just at
      // construction.
      if (deps.isFingerLocked()) queue.lock();
      const request = queue.request(holderId);
      if (!request.granted) {
        if (request.reason === 'locked') {
          return {
            ok: false,
            error:
              'The browser finger is locked — Gary locked it, so no agent can browse right now.',
          };
        }
        return {
          ok: false,
          error: `Another agent is using the browser — queued at position ${request.position}.`,
        };
      }
      clearIdleTimer();
      const burstStarting = !inUse;
      inUse = true;
      if (burstStarting) {
        // The mini window appears: the active tab pops out of the
        // panel into it, so Gary sees the agent's browsing. No tab
        // means no pop-out — and no splash either (there is no
        // browsing to splash for; the tool reports it).
        const popped = deps.popOutActiveTab();
        if (popped) {
          poppedOutTabId = popped;
          // Glass splash first, fullscreen after it fades.
          splash = true;
          fullscreen = false;
          enterFullscreenAfterSplash();
        }
      }
      emit();
      return { ok: true };
    },

    endTool() {
      if (disposed || !inUse) return;
      clearIdleTimer();
      idleTimer = setTimeout(goIdle, idleMs);
    },

    moveMouse(x, y) {
      if (disposed || !inUse || garyHasControl) return null;
      if (!queue.getHolder()) return null;
      const clamped = clampAgentMousePosition(x, y, deps.getViewBounds());
      mouse = clamped;
      emit();
      return { ...clamped };
    },

    stopAgent() {
      if (disposed) return;
      queue.clearAll();
      goIdle();
      mouse = null;
      deps.onAgentStopped();
      emit();
    },

    takeControl() {
      if (disposed) return;
      const holder = queue.getHolder();
      if (holder) queue.suspendHolder(holder);
      garyHasControl = true;
      goIdle();
      mouse = null;
      emit();
    },

    giveBackControl() {
      if (disposed) return;
      garyHasControl = false;
      emit();
    },

    setFingerLocked(locked) {
      if (disposed) return;
      deps.setFingerLockedSetting(locked);
      if (locked) {
        queue.lock();
        // A lock is a kill-switch: the current holder is released
        // at once and the browser goes idle.
        queue.clearAll();
        goIdle();
        mouse = null;
      } else {
        queue.unlock();
      }
      emit();
    },

    setPoppedOutTabId(tabId) {
      if (disposed) return;
      poppedOutTabId = tabId;
      emit();
    },

    dispose() {
      disposed = true;
      clearIdleTimer();
      clearSplashTimer();
      queue.clearAll();
    },
  };

  return session;
}
