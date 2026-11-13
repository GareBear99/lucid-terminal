import { create } from 'zustand';
import { TerminalTab } from '../types';
import { useToastStore } from './toastStore';
import { useHistoryStore } from './historyStore';

/**
 * Clean a spawn error for display. IPC errors wrap the underlying error
 * ("Error invoking remote method 'terminal:create': Error: spawn ENOTDIR");
 * drop the boilerplate so the UI reads cleanly.
 */
function cleanSpawnError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Error:\s*/g, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .trim();
}

export interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  // Synchronous spawn failures (bad cwd): spawn() throws before any
  // terminal exists, so there is no onData/onExit event to surface. The
  // message is recorded here so the Terminal can show it.
  createErrors: Record<string, string>;
  // Shells that have died (tab id -> exit code), fed by the main
  // process's real `terminal:exit` event via App's onExit listener
  // (Gary, 2026-11-09: the online indicator reads this). A tab stays
  // in `tabs` after its shell exits — the Terminal shows a "Shell
  // exited" banner with a restart — so this record is what tells a
  // live-looking dead terminal apart from a live one. It is NOT a
  // timer and NOT a guess: the PTY really exited.
  exitedTabs: Record<string, number>;
  // Whether any PTY state is known yet (Gary, 2026-11-09): false
  // from startup until the first tab is created or the first shell
  // exit is recorded. While false the online indicator shows the
  // grey unknown state instead of guessing online/offline. It is
  // set by real tab-lifecycle events only - never by a timer - and
  // once true it stays true: closing the last tab leaves the
  // terminal offline, not unknown again.
  ptyStateKnown: boolean;

  // Actions
  createTab: (cwd?: string) => Promise<string>;
  closeTab: (id: string) => void;
  clearCreateError: (id: string) => void;
  markTabExited: (id: string, code: number) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabCwd: (id: string, cwd: string) => void;
  /**
   * First prompt sent to a tab (Gary, 2026-11-13 ~02:02 PST —
   * Warp reference): after the first prompt to a tab, the
   * ghost words are gone for that tab. Per tab, never global —
   * marking one tab never affects another. Called by the
   * composer's submit path; a dropped submit (empty line, or
   * one already in flight) does not mark.
   */
  markTabPrompted: (id: string) => void;
  /**
   * Test-only reset (same precedent as forgeStore.resetForTests):
   * clears the cached home dir (see cachedHomeDir). The cache is
   * module-level, so without this a test file that stubs a fresh
   * `window.lucidAPI` per test would still read the home dir cached
   * from an earlier test's stub — e.g. a test that makes getHomeDir
   * reject would never see the rejection. Never called in production.
   */
  resetForTests: () => void;
}

/**
 * Numbers currently held by a live tab or an in-flight createTab call.
 * New tabs reuse the lowest free number, so deleting a tab frees its
 * number instead of the count climbing forever (Gary, 2026-11-05).
 * The number is keyed off the tab id (`terminal-N`), not the title —
 * a tab keeps its number when it is renamed.
 */
const usedTabNumbers = new Set<number>();

function tabNumberFromId(id: string): number | null {
  const match = /^terminal-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

function lowestFreeTabNumber(): number {
  let n = 1;
  while (usedTabNumbers.has(n)) n++;
  return n;
}

/**
 * Home directory, cached after the first read (zero-latency F5):
 * it never changes within a session, so tab creation used to pay
 * two sequential IPC round-trips (getHomeDir, then terminal.create)
 * per tab. Now the first tab pays both and every later tab pays
 * one — the cached value is reused. A failed read is never cached.
 */
let cachedHomeDir: string | null = null;

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,
  createErrors: {},
  exitedTabs: {},
  ptyStateKnown: false,

  createTab: async (cwd?: string) => {
    // Reserve the lowest free number synchronously, before any await:
    // two creates fired back-to-back must still get distinct numbers.
    const tabNumber = lowestFreeTabNumber();
    usedTabNumbers.add(tabNumber);
    const id = `terminal-${tabNumber}`;
    let workingDir: string;
    try {
      workingDir = cwd || cachedHomeDir || await window.lucidAPI.fs.getHomeDir();
      if (!cwd) cachedHomeDir = workingDir;
    } catch (error) {
      // No tab was created, so the number is free again.
      usedTabNumbers.delete(tabNumber);
      throw error;
    }

    const newTab: TerminalTab = {
      id,
      title: `Terminal ${tabNumber}`,
      cwd: workingDir,
      isActive: true,
      hasPrompted: false,
    };

    // Create the PTY process (fail gracefully if terminal can't be created).
    // A synchronous spawn throw (bad cwd) rejects here with no onData /
    // onExit event, so record it for the Terminal to display.
    try {
      await window.lucidAPI.terminal.create(id, workingDir);
    } catch (error) {
      console.error(`Failed to create terminal ${id}:`, error);
      const message = cleanSpawnError(error);
      set((state) => ({ createErrors: { ...state.createErrors, [id]: message } }));
      useToastStore.getState().error(`Terminal failed to start: ${message}`);
    }

    set((state) => {
      // Tab numbers are reused (lowest free number), so a fresh tab
      // can inherit the id of a tab whose shell died — drop any stale
      // exited entry for this id, or the new live shell would read
      // as dead.
      const exitedTabs = { ...state.exitedTabs };
      delete exitedTabs[id];
      return {
        tabs: [...state.tabs.map(t => ({ ...t, isActive: false })), newTab],
        activeTabId: id,
        exitedTabs,
        // A tab exists now, so the PTY state is known (live, or
        // dead on a spawn failure - createErrors says which).
        ptyStateKnown: true,
      };
    });

    return id;
  },

  clearCreateError: (id) => {
    set((state) => {
      const createErrors = { ...state.createErrors };
      delete createErrors[id];
      return { createErrors };
    });
  },

  closeTab: (id) => {
    // Free the tab's number so a later tab reuses it.
    const tabNumber = tabNumberFromId(id);
    if (tabNumber !== null) usedTabNumbers.delete(tabNumber);
    // Destroy the PTY process
    window.lucidAPI.terminal.destroy(id);
    // Drop the tab's chats too — its blocks must not linger in the
    // Sidebar's History after the tab is gone.
    useHistoryStore.getState().removeTab(id);

    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        // Activate the previous tab or the next one
        const closedIndex = state.tabs.findIndex((t) => t.id === id);
        if (newTabs.length > 0) {
          const newIndex = Math.max(0, closedIndex - 1);
          newActiveId = newTabs[newIndex].id;
          newTabs[newIndex].isActive = true;
        } else {
          newActiveId = null;
        }
      }

      const createErrors = { ...state.createErrors };
      delete createErrors[id];
      const exitedTabs = { ...state.exitedTabs };
      delete exitedTabs[id];
      return { tabs: newTabs, activeTabId: newActiveId, createErrors, exitedTabs };
    });
  },

  markTabExited: (id, code) => {
    set((state) => ({ exitedTabs: { ...state.exitedTabs, [id]: code }, ptyStateKnown: true }));
  },

  setActiveTab: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === id })),
      activeTabId: id,
    }));
  },

  updateTabTitle: (id, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  updateTabCwd: (id, cwd) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, cwd } : t)),
    }));
  },

  markTabPrompted: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, hasPrompted: true } : t)),
    }));
  },

  resetForTests: () => {
    cachedHomeDir = null;
  },
}));

/**
 * Is the terminal active within the system to the computer? (Gary,
 * 2026-11-09: the online indicator reads this.) The ACTIVE tab's
 * shell must be alive: a tab exists and is active, its PTY never
 * exited (see exitedTabs, fed by the real `terminal:exit` event),
 * and its spawn never failed (see createErrors). No tabs at all —
 * the empty state — is offline, and so is an active tab whose
 * shell died while another tab is still alive: the indicator shows
 * the terminal in front of you, not some other tab.
 *
 * A zustand selector as well as a plain function: use it as
 * `useTerminalStore(isActiveTerminalOnline)` so the indicator only
 * re-renders when the boolean itself flips.
 */
export function isActiveTerminalOnline(
  state: Pick<TerminalState, 'tabs' | 'activeTabId' | 'exitedTabs' | 'createErrors'>,
): boolean {
  const { tabs, activeTabId, exitedTabs, createErrors } = state;
  if (!activeTabId) return false;
  if (!tabs.some((t) => t.id === activeTabId)) return false;
  if (exitedTabs[activeTabId] !== undefined) return false;
  if (createErrors[activeTabId]) return false;
  return true;
}

/**
 * The terminal's status in three states (Gary, 2026-11-09): the
 * online indicator's dot is green / blackened / grey.
 *
 * - 'unknown' while no PTY state is known yet (ptyStateKnown is
 *   false: startup, before the first tab is created or the first
 *   shell exit is recorded). The indicator shows grey and its
 *   hover overlay types 'N/A' - it never guesses.
 * - 'online' / 'offline' once PTY state is known, from the same
 *   real PTY state isActiveTerminalOnline reads (live active tab
 *   vs exited / failed-to-spawn / no tab at all).
 *
 * A zustand selector as well as a plain function: use it as
 * `useTerminalStore(activeTerminalStatus)` so the indicator only
 * re-renders when the status itself flips.
 */
export type TerminalStatus = 'online' | 'offline' | 'unknown';

export function activeTerminalStatus(
  state: Pick<TerminalState, 'tabs' | 'activeTabId' | 'exitedTabs' | 'createErrors' | 'ptyStateKnown'>,
): TerminalStatus {
  if (!state.ptyStateKnown) return 'unknown';
  return isActiveTerminalOnline(state) ? 'online' : 'offline';
}
