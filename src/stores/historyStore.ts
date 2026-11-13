import { create } from 'zustand';
import { TerminalBlock } from '../types';
import { dropPendingEscape } from '../lib/terminalBlocks';

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
 *
 * PERSISTENCE (Gary, 2026-11-09 — command history must survive a
 * relaunch): the store used to be memory-only, so every relaunch reset
 * the History panel to 0 commands. The blocks now persist to
 * localStorage (best-effort, capped, never throws — the same pattern
 * as eventLogStore / browserHistory) and rehydrate on launch. Tab ids
 * are `terminal-N` with the lowest free number reused (see
 * terminalStore), so a fresh launch's first tab re-reads the previous
 * session's tab-1 record — that is the history surviving, not a leak.
 *
 * RESTORED BLOCKS ARE A RECORD, NOT THE FEED: rehydrated blocks are
 * marked `restored: true` (and complete — their run ended when the app
 * closed). The BlockList feed never renders them: the feed is the live
 * session's transcript, and showing last session's commands as if they
 * ran now would be false. Only the History panel shows them. Jump-to-
 * block on a restored block is a no-op (no DOM element exists for it
 * in this session) — jumpToBlock already returns early when the
 * element is missing, so nothing breaks.
 *
 * WRITE RATE: the Terminal calls setBlocks on every PTY chunk while a
 * block is open, so persistence is DEBOUNCED (1s trailing) — one
 * localStorage write per burst, not one per chunk — plus a flush on
 * beforeunload so the last burst is not lost when the app closes.
 */

/** A stable empty list so selectors never hand out a fresh array. */
export const EMPTY_BLOCKS: TerminalBlock[] = [];

export type BlocksUpdater =
  | TerminalBlock[]
  | ((prev: TerminalBlock[]) => TerminalBlock[]);

/** localStorage key for the persisted blocks. */
export const HISTORY_STORAGE_KEY = 'lucid-terminal-history-v1';

/** Most blocks kept per tab, newest first — the record, not the scrollback. */
export const HISTORY_MAX_BLOCKS_PER_TAB = 100;

/** Most output chars kept per persisted block — the History panel only
 *  shows a 60-char preview, and restored blocks never render in the
 *  feed, so the full transcript is not needed in the record. */
export const HISTORY_MAX_OUTPUT_CHARS = 2000;

/** Debounce for the persisted write (ms) — see the module header. */
const HISTORY_PERSIST_DEBOUNCE_MS = 1000;

/** Is one persisted block plausible? A block needs at least an id and
 *  a command string; anything else is repaired or dropped, never
 *  trusted blindly. */
function isPlausibleBlock(value: unknown): value is TerminalBlock {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return typeof b.id === 'string' && typeof b.command === 'string';
}

/** Trim one block for the record: cap the output, keep everything else. */
function trimBlockForRecord(block: TerminalBlock): TerminalBlock {
  if (block.output.length <= HISTORY_MAX_OUTPUT_CHARS) return block;
  return { ...block, output: block.output.slice(0, HISTORY_MAX_OUTPUT_CHARS) };
}

/** Cap one tab's blocks to the newest N, trimmed for the record. */
function capBlocksForRecord(blocks: TerminalBlock[]): TerminalBlock[] {
  return blocks.slice(-HISTORY_MAX_BLOCKS_PER_TAB).map(trimBlockForRecord);
}

/**
 * Read the persisted blocks, or {} when there are none / they are
 * corrupt / storage is unavailable. Never throws. Every block comes
 * back marked restored + complete (see the module header).
 */
export function readPersistedHistory(): Record<string, TerminalBlock[]> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, TerminalBlock[]> = {};
    for (const [tabId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const blocks = value
        .filter(isPlausibleBlock)
        .map((b) => ({ ...b, restored: true, isComplete: true }));
      if (blocks.length > 0) out[tabId] = capBlocksForRecord(blocks);
    }
    return out;
  } catch {
    // Corrupt or unreadable storage: start empty, never crash.
    return {};
  }
}

/** Serialize one state snapshot for storage (capped + trimmed). */
function serializeHistory(blocksByTab: Record<string, TerminalBlock[]>): string {
  const capped: Record<string, TerminalBlock[]> = {};
  for (const [tabId, blocks] of Object.entries(blocksByTab)) {
    if (blocks.length > 0) capped[tabId] = capBlocksForRecord(blocks);
  }
  return JSON.stringify(capped);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Write the current state to storage now. Never throws. */
export function flushHistoryPersistence(): void {
  try {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    // A guest session never writes history to disk: the guest's
    // live blocks are dropped when the guest session ends, and the
    // owner's persisted history must never be overwritten with the
    // guest's empty (or guest-live) view. This also covers the
    // beforeunload flush, which calls this function directly.
    if (useHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistory(useHistoryStore.getState().blocksByTab));
  } catch {
    // Private mode / quota: history just doesn't persist this session.
  }
}

/** Schedule a persisted write (debounced — see the module header). */
function scheduleHistoryPersistence(): void {
  // Same guard as flushHistoryPersistence: nothing is scheduled
  // while a guest session is veiled in.
  if (useHistoryStore.getState().guestSessionActive) return;
  if (typeof localStorage === 'undefined') return;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushHistoryPersistence();
  }, HISTORY_PERSIST_DEBOUNCE_MS);
}

/** Remove the persisted copy (tests / a future "forget history" action). */
export function clearPersistedHistory(): void {
  try {
    // Never during a guest session: the key holds the OWNER's
    // persisted history, and a guest must never delete it. (The
    // only production caller is profile wipe, which refuses
    // guests — this is belt-and-braces for the hard constraint.)
    if (useHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

interface HistoryState {
  /** Command blocks per terminal tab, keyed by tab id. */
  blocksByTab: Record<string, TerminalBlock[]>;

  /** Replace a tab's blocks (value or functional updater, like setState). */
  setBlocks: (tabId: string, updater: BlocksUpdater) => void;
  /** Clear one tab's blocks (the clear-history action). */
  clearBlocks: (tabId: string) => void;
  /** Drop a tab's blocks entirely (on tab close). */
  removeTab: (tabId: string) => void;
  /** Whether a guest session is veiled in: the visible blocks are
   *  the guest's own live terminal output; the owner's blocks are
   *  stashed (see guestStash) and untouched on disk. */
  guestSessionActive: boolean;
  /** The owner's blocks by tab, stashed when a guest session
   *  starts and restored when it ends. Null outside a guest
   *  session. Never persisted — it only ever lives in memory. */
  guestStash: Record<string, TerminalBlock[]> | null;
  /**
   * Start a guest session (Gary, 2026-11-12 ~17:59 PST): no chat
   * memory, no history in any guest build. The owner's blocks
   * are stashed in memory — never deleted, never written over —
   * and the visible state goes empty; while the flag is on, no
   * history is ever persisted to disk (see the guards in
   * scheduleHistoryPersistence / flushHistoryPersistence). The
   * guest's own live terminal blocks live only in the visible
   * state and are dropped on exit — they are NOT history (the
   * History panel shows nothing for a guest; see
   * selectHistoryBlocksForTab).
   */
  enterGuestSession: () => void;
  /** End a guest session: drop the guest's live blocks and restore
   *  the stashed owner blocks exactly, flushing them back to disk. */
  exitGuestSession: () => void;
  /** Drop the current guest's live blocks (a fresh guest replaces
   *  the old one — "always a new guest") without touching the
   *  stashed owner blocks. No-op outside a guest session. */
  resetGuestSession: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  // Rehydrated from the previous session when there is one ({} on a
  // fresh install / corrupt storage) — see readPersistedHistory.
  blocksByTab: readPersistedHistory(),

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
    set((state) => {
      // The blocks are gone for good — their held partial
      // escapes (if any) die with them.
      for (const b of state.blocksByTab[tabId] ?? EMPTY_BLOCKS) dropPendingEscape(b.id);
      return { blocksByTab: { ...state.blocksByTab, [tabId]: [] } };
    }),

  removeTab: (tabId) =>
    set((state) => {
      if (!(tabId in state.blocksByTab)) return state;
      for (const b of state.blocksByTab[tabId]) dropPendingEscape(b.id);
      const blocksByTab = { ...state.blocksByTab };
      delete blocksByTab[tabId];
      return { blocksByTab };
    }),

  guestSessionActive: false,
  guestStash: null,

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    set({ guestSessionActive: true, guestStash: state.blocksByTab, blocksByTab: {} });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    const stash = state.guestStash;
    set({ guestSessionActive: false, guestStash: null, blocksByTab: stash ?? {} });
    // Write the restored owner blocks back to disk now (the
    // debounced flush was paused for the whole guest session, and
    // the key still holds the owner's pre-guest copy — this just
    // makes the restore durable immediately).
    flushHistoryPersistence();
  },

  resetGuestSession: () => {
    const state = get();
    // Outside a guest session the visible state IS the owner's —
    // never clear it. Inside one, the visible state is the
    // previous guest's live blocks only; drop them for the fresh
    // guest. The stash (owner blocks) is untouched.
    if (!state.guestSessionActive) return;
    set({ blocksByTab: {} });
  },
}));

// Every mutation persists (debounced) — including direct setState,
// which tests use to reset. The write is the debounced one, so a
// burst of PTY-chunk updates costs one localStorage write, and the
// beforeunload flush below catches the last burst on quit.
useHistoryStore.subscribe(() => {
  scheduleHistoryPersistence();
});

// Flush the last burst when the app closes (renderer quit / reload).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushHistoryPersistence();
  });
}

/**
 * What the History panel shows for a tab: the tab's blocks — except
 * during a guest session, where it shows nothing at all. A guest
 * has no history (Gary, 2026-11-12 ~17:59 PST): the owner's blocks
 * are stashed, and the guest's own live blocks belong to the
 * terminal feed, not the History panel. The feed itself reads
 * blocksByTab directly and keeps showing the guest's live output.
 */
export function selectHistoryBlocksForTab(
  state: HistoryState,
  tabId: string | null,
): TerminalBlock[] {
  if (state.guestSessionActive) return EMPTY_BLOCKS;
  return tabId ? state.blocksByTab[tabId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS;
}

/**
 * Scroll the terminal to a block and flash-highlight it. DOM-only — the
 * block elements are rendered by the Terminal (`id="block-<id>"`), so this
 * is a no-op when the Terminal view is not mounted (e.g. the user is in
 * the Synth view); the Sidebar switches to the terminal view first and
 * calls this after the Terminal has rendered. It is also a no-op for a
 * restored block (no DOM element exists for it in this session).
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
