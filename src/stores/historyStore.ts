import { create } from 'zustand';
import { TerminalBlock } from '../types';

/**
 * Command blocks per terminal tab — the single source of truth for the
 * chats (the Conversation History sidebar).
 *
 * The blocks used to live as local state inside each Terminal component,
 * which is why the History could only render inside the Terminal view.
 * Moving the chats into the main Sidebar means the Sidebar (which sits
 * outside every Terminal) has to read them — so they live here, keyed by
 * tab id. The Terminal still owns *writing* them: it replaces its local
 * `setBlocks` with a thin wrapper around `setBlocks(tabId, updater)` and
 * every existing call site works unchanged.
 *
 * Per-tab, never flattened: the Sidebar shows only the ACTIVE tab's
 * blocks, and clearing history clears only that tab. A closed tab's
 * blocks are dropped by terminalStore.closeTab.
 */

/** A stable empty list so selectors never hand out a fresh array. */
export const EMPTY_BLOCKS: TerminalBlock[] = [];

export type BlocksUpdater =
  | TerminalBlock[]
  | ((prev: TerminalBlock[]) => TerminalBlock[]);

interface HistoryState {
  /** Command blocks per terminal tab, keyed by tab id. */
  blocksByTab: Record<string, TerminalBlock[]>;

  /** Replace a tab's blocks (value or functional updater, like setState). */
  setBlocks: (tabId: string, updater: BlocksUpdater) => void;
  /** Clear one tab's blocks (the clear-history action). */
  clearBlocks: (tabId: string) => void;
  /** Drop a tab's blocks entirely (on tab close). */
  removeTab: (tabId: string) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  blocksByTab: {},

  setBlocks: (tabId, updater) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      const next =
        typeof updater === 'function'
          ? (updater as (p: TerminalBlock[]) => TerminalBlock[])(prev)
          : updater;
      // No-op when the updater returns the same array (e.g. a PTY chunk
      // arriving after the last block completed) — avoids a pointless
      // re-render of every blocks subscriber.
      if (next === prev) return state;
      return { blocksByTab: { ...state.blocksByTab, [tabId]: next } };
    }),

  clearBlocks: (tabId) =>
    set((state) => ({
      blocksByTab: { ...state.blocksByTab, [tabId]: [] },
    })),

  removeTab: (tabId) =>
    set((state) => {
      if (!(tabId in state.blocksByTab)) return state;
      const blocksByTab = { ...state.blocksByTab };
      delete blocksByTab[tabId];
      return { blocksByTab };
    }),
}));

/**
 * Scroll the terminal to a block and flash-highlight it. DOM-only — the
 * block elements are rendered by the Terminal (`id="block-<id>"`), so this
 * is a no-op when the Terminal view is not mounted (e.g. the user is in
 * the Synth view); the Sidebar switches to the terminal view first and
 * calls this after the Terminal has rendered.
 */
export function jumpToBlock(blockId: string): void {
  const blockElement = document.getElementById(`block-${blockId}`);
  if (!blockElement) return;
  blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  blockElement.style.transition = 'background-color 0.3s';
  blockElement.style.backgroundColor = 'rgba(88, 166, 255, 0.1)';
  setTimeout(() => {
    blockElement.style.backgroundColor = '';
  }, 1000);
}
