/**
 * Agent-browser UI state (Phase B): what the panel and the mini
 * window render from the `browser:agent-state` snapshots main
 * pushes — who holds the browser finger, whether the browser is
 * in use (mini fullscreen), whether the glass splash is showing,
 * where the live agent mouse is, and whether Gary has taken
 * control.
 *
 * Main is the source of truth; this store only mirrors the last
 * snapshot. In node (vitest) there is no window.lucidAPI — the
 * state still updates through `applyAgentState`, so the mirror
 * logic is testable without Electron.
 */

import { create } from 'zustand';
import type {
  BrowserAgentMousePosition,
  BrowserAgentStateSnapshot,
} from '../lib/browserAgent';

export type { BrowserAgentStateSnapshot };

export const initialBrowserAgentState: BrowserAgentStateSnapshot = {
  holder: null,
  queuedHolders: [],
  inUse: false,
  splash: false,
  fullscreen: false,
  mouse: null,
  garyHasControl: false,
  fingerLocked: false,
  luciferAiEnabled: true,
  poppedOutTabId: null,
};

interface BrowserAgentState extends BrowserAgentStateSnapshot {
  /** A snapshot has arrived from main at least once. Before that
   * the mirror is a placeholder — surfaces gated on the snapshot
   * (e.g. the LuciferAI-off control bar) wait for it instead of
   * flashing on a default. */
  hydrated: boolean;
  /** Merge a snapshot pushed by main. */
  applyAgentState: (state: BrowserAgentStateSnapshot) => void;
  /** Hide the agent mouse locally (it left the browser area). */
  clearMouse: () => void;
}

export const useBrowserAgentStore = create<BrowserAgentState>()((set) => ({
  ...initialBrowserAgentState,
  hydrated: false,

  applyAgentState: (state) => {
    set({
      hydrated: true,
      holder: state.holder,
      queuedHolders: [...state.queuedHolders],
      inUse: state.inUse,
      splash: state.splash,
      fullscreen: state.fullscreen,
      mouse: state.mouse ? { ...state.mouse } : null,
      garyHasControl: state.garyHasControl,
      fingerLocked: state.fingerLocked,
      luciferAiEnabled: state.luciferAiEnabled,
      poppedOutTabId: state.poppedOutTabId,
    });
  },

  clearMouse: () => {
    set({ mouse: null });
  },
}));

/** Read the current agent-browser state outside React. */
export function getBrowserAgentState(): BrowserAgentStateSnapshot {
  const s = useBrowserAgentStore.getState();
  return {
    holder: s.holder,
    queuedHolders: [...s.queuedHolders],
    inUse: s.inUse,
    splash: s.splash,
    fullscreen: s.fullscreen,
    mouse: s.mouse ? { ...s.mouse } : null,
    garyHasControl: s.garyHasControl,
    fingerLocked: s.fingerLocked,
    luciferAiEnabled: s.luciferAiEnabled,
    poppedOutTabId: s.poppedOutTabId,
  };
}

export type { BrowserAgentMousePosition };
