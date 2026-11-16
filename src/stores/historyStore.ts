import { create } from 'zustand';
import { TerminalBlock } from '../types';
import { dropPendingEscape } from '../lib/terminalBlocks';
import {
  GUEST_VEIL_STORAGE_KEY,
  isGuestVeilPersisted,
  setGuestVeilPersisted,
} from '../lib/guestVeil';

/** The implicit profile id (mirrors profileStore.DEFAULT_PROFILE_ID).
 *  Kept local — importing profileStore here would cycle
 *  (profileStore imports this store). */
export const HISTORY_FALLBACK_PROFILE_ID = 'default';

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
 * relaunch; Gary, 2026-11-14 — profile-only: "they should all be
 * session only or profile only"): the blocks persist to
 * localStorage (best-effort, capped, never throws — the same pattern
 * as eventLogStore / browserHistory) and rehydrate on launch, but
 * SCOPED TO THE PROFILE. The stored record is
 * `{ [profileId]: { [tabId]: blocks[] } }` — the same shape
 * commandHistoryStore already uses for up-arrow history. Before
 * this, the key held one flat `{ [tabId]: blocks }` shared by every
 * profile: profile B saw profile A's blocks live AND on disk, and
 * a newly created profile inherited the previous profile's history.
 * A legacy flat value migrates once, into the 'default' profile's
 * slot — the implicit profile owns the pre-scoping history, and a
 * created profile starts empty. Tab ids are `terminal-N` with the
 * lowest free number reused (see terminalStore), so a fresh
 * launch's first tab re-reads the previous session's tab-1 record
 * for THAT profile — that is the history surviving, not a leak.
 * Profile switches go through `switchProfile` (driven from
 * profileStore.selectProfile and the Terminal mount effect, the
 * same choke points as commandHistoryStore): the outgoing
 * profile's blocks flush first, then the incoming profile's load.
 * Cross-window: flush re-reads the record first, so the detached
 * window's writes for other profiles are never clobbered.
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

/** The persisted record: one blocks map per profile id. */
export type HistoryRecord = Record<string, Record<string, TerminalBlock[]>>;

/** Validate + cap one profile's blocks map (per tab). */
function parseBlocksMap(value: unknown): Record<string, TerminalBlock[]> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: Record<string, TerminalBlock[]> = {};
  for (const [tabId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(entry)) return null;
    const blocks = entry
      .filter(isPlausibleBlock)
      .map((b) => ({ ...b, restored: true, isComplete: true }));
    if (blocks.length > 0) out[tabId] = capBlocksForRecord(blocks);
  }
  return out;
}

/**
 * Read the persisted per-profile record, or {} when there is
 * none / it is corrupt / storage is unavailable. Never throws.
 * A legacy flat value (`{ [tabId]: blocks[] }`, the pre-scoping
 * shape) migrates into the 'default' profile's slot — the
 * implicit profile owns the pre-scoping history.
 */
export function readPersistedHistoryRecord(): HistoryRecord {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const record: HistoryRecord = {};
    const entries = Object.entries(parsed as Record<string, unknown>);
    // Legacy flat shape: every value is a blocks array.
    const isLegacyFlat =
      entries.length > 0 && entries.every(([, v]) => Array.isArray(v));
    if (isLegacyFlat) {
      const migrated = parseBlocksMap(parsed);
      if (migrated) record[HISTORY_FALLBACK_PROFILE_ID] = migrated;
      return record;
    }
    for (const [profileId, value] of entries) {
      // A legacy tab entry sitting beside profile slots (mixed
      // storage, e.g. a half-migrated write) belongs to 'default'.
      if (Array.isArray(value)) {
        const blocks = value
          .filter(isPlausibleBlock)
          .map((b) => ({ ...b, restored: true, isComplete: true }));
        if (blocks.length === 0) continue;
        const slot = record[HISTORY_FALLBACK_PROFILE_ID] ?? {};
        slot[profileId] = capBlocksForRecord(blocks);
        record[HISTORY_FALLBACK_PROFILE_ID] = slot;
        continue;
      }
      const map = parseBlocksMap(value);
      if (map) record[profileId] = map;
    }
    return record;
  } catch {
    // Corrupt or unreadable storage: start empty, never crash.
    return {};
  }
}

/**
 * Read the persisted blocks for one profile (the implicit
 * 'default' when none is given), or {} when there are none /
 * they are corrupt / storage is unavailable. Never throws.
 * Every block comes back marked restored + complete (see the
 * module header).
 */
export function readPersistedHistory(
  profileId: string = HISTORY_FALLBACK_PROFILE_ID,
): Record<string, TerminalBlock[]> {
  return readPersistedHistoryRecord()[profileId] ?? {};
}

/** Serialize one record snapshot for storage (capped + trimmed). */
function serializeHistoryRecord(record: HistoryRecord): string {
  const capped: HistoryRecord = {};
  for (const [profileId, blocksByTab] of Object.entries(record)) {
    const map: Record<string, TerminalBlock[]> = {};
    for (const [tabId, blocks] of Object.entries(blocksByTab)) {
      if (blocks.length > 0) map[tabId] = capBlocksForRecord(blocks);
    }
    if (Object.keys(map).length > 0) capped[profileId] = map;
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
    const state = useHistoryStore.getState();
    // Re-read the record so other profiles' blocks (possibly
    // written by the detached window since our last read) are
    // preserved; only this profile's slot is overwritten.
    const record = readPersistedHistoryRecord();
    if (state.loaded && state.profileId) {
      record[state.profileId] = state.blocksByTab;
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistoryRecord(record));
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

/** Remove the persisted copy for the current profile (tests /
 *  profile wipe — the profile's memory goes with the profile).
 *  Other profiles' slots are untouched. */
export function clearPersistedHistory(): void {
  try {
    // Never during a guest session: the key holds the OWNER's
    // persisted history, and a guest must never delete it. (The
    // only production caller is profile wipe, which refuses
    // guests — this is belt-and-braces for the hard constraint.)
    if (useHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const record = readPersistedHistoryRecord();
    delete record[useHistoryStore.getState().profileId];
    localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistoryRecord(record));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

/**
 * Remove one profile's slot from the persisted record (profile
 * wipe — the profile's memory goes with the profile). Disk-only,
 * like the old clearPersistedHistory: the in-memory blocks are
 * the caller's job (wipeProfile clears them with clearBlocks,
 * which leaves the emptied tab keys in place — `{ tab1: [] }` —
 * and this must not clobber that residue to `{}`). Never during
 * a guest session.
 */
export function clearProfileHistory(profileId: string): void {
  try {
    if (useHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const record = readPersistedHistoryRecord();
    delete record[profileId];
    localStorage.setItem(HISTORY_STORAGE_KEY, serializeHistoryRecord(record));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

interface HistoryState {
  /** Command blocks per terminal tab, keyed by tab id — for the
   *  CURRENT profile only (see profileId). */
  blocksByTab: Record<string, TerminalBlock[]>;
  /** The profile whose blocks are loaded ('default' until
   *  switchProfile runs — the implicit profile owns the
   *  pre-scoping history). */
  profileId: string;
  /** Whether a profile's blocks have been loaded yet. */
  loaded: boolean;
  /**
   * Load another profile's blocks: flush the current profile's
   * blocks into the persisted record, then load the new one
   * (empty when the profile has no history yet — a created
   * profile starts empty). No-op while a guest session is
   * veiled in (profile switches never touch blocks under the
   * veil) and no-op when the profile is already loaded. Driven
   * from profileStore.selectProfile and the Terminal mount
   * effect — the same choke points as commandHistoryStore.
   */
  switchProfile: (profileId: string) => void;

  /** Replace a tab's blocks (value or functional updater, like setState). */
  setBlocks: (tabId: string, updater: BlocksUpdater) => void;
  /** Clear one tab's blocks (the clear-history action). */
  clearBlocks: (tabId: string) => void;
  /** Flip one block's collapsed state (feed fold, sweep item
   *  3 — the chevron in the block header). Session-only
   *  visual state; persisted with the block like the rest of
   *  its fields. No-op when the tab or block is not found. */
  toggleBlockCollapsed: (tabId: string, blockId: string) => void;
  /** Flip one block's bookmark (sweep item 7 — the star in
   *  the block actions). Persisted with the block per
   *  tab/profile like isCollapsed; the History panel filters
   *  on it. No-op when the tab or block is not found. */
  toggleBlockBookmarked: (tabId: string, blockId: string) => void;
  /** The selected block ids per tab (multi-select,
   *  2026-11-15): the blocks the user picked with click /
   *  shift-click / Ctrl-click, for the bulk actions
   *  (copy-all / re-run-all in BlockList). EPHEMERAL session
   *  state — NEVER persisted (serializeHistory writes
   *  blocksByTab only, and this map is not part of it). A
   *  selection never survives a restart, and it is cleared
   *  when the tab's blocks are cleared or the tab closes. */
  selectedBlockIdsByTab: Record<string, string[]>;
  /** The shift-click anchor per tab — the last block clicked
   *  (plain or Ctrl-click). Shift-click selects the range
   *  from the anchor to the clicked block. Ephemeral, like
   *  the selection. Null when there is no anchor. */
  selectionAnchorByTab: Record<string, string | null>;
  /** Toggle one block in the selection (Ctrl/Cmd-click).
   *  Sets the anchor to the block. No-op when the block is
   *  not found. */
  toggleBlockSelected: (tabId: string, blockId: string) => void;
  /** Select exactly one block (plain click — the selection
   *  becomes just this block). Sets the anchor. No-op when
   *  the block is not found. */
  selectBlockOnly: (tabId: string, blockId: string) => void;
  /** Select the range from the anchor to the block
   *  (shift-click), in feed order. When there is no anchor,
   *  behaves like selectBlockOnly. No-op when the block is
   *  not found. */
  selectBlockRange: (tabId: string, blockId: string) => void;
  /** Clear the selection for a tab. */
  clearBlockSelection: (tabId: string) => void;
  /**
   * Drop the driving intelligence's working memory (Memory tab,
   * 2026-11-14): the agent-prompt and agent-response blocks in
   * every tab's feed. Terminal command blocks are untouched —
   * only the agent's own blocks go. The feed persists the
   * change like any other mutation (the store subscribe).
   * No-op in a guest session: the visible blocks are the
   * guest's own live feed, and the Memory tab shows the empty
   * state in guest and never offers this button — the guard
   * is belt-and-braces for the hard constraint.
   */
  clearAgentBlocks: () => void;
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
  // The implicit 'default' profile owns the pre-scoping history;
  // switchProfile loads the active profile's blocks (the Profiles
  // screen drives it via selectProfile; the Terminal mount effect
  // covers the direct-boot path). The store boots UNVEILED on
  // purpose: App's boot init runs applyPersistedGuestVeil() AFTER
  // the Terminal mount effects have loaded the active profile,
  // so the veil stashes the RIGHT profile's blocks. Booting
  // veiled here would stash 'default''s blocks and then no-op
  // the real veil (enter guards on already-veiled) — the wrong
  // stash would come back on exit. The persisted veil flag
  // (guestVeil.ts) covers the live case instead: a renderer
  // already open when the guest session starts veils via the
  // storage event below, with the correct stash.
  blocksByTab: readPersistedHistory(),
  profileId: HISTORY_FALLBACK_PROFILE_ID,
  loaded: true,

  switchProfile: (nextProfileId) => {
    const state = get();
    if (state.guestSessionActive) return;
    if (state.loaded && state.profileId === nextProfileId) return;
    // Flush the outgoing profile's blocks first (the first load
    // has nothing to flush — the store boots loaded for
    // 'default', so this always flushes the outgoing slot).
    flushHistoryPersistence();
    const blocksByTab = readPersistedHistory(nextProfileId);
    set({ blocksByTab, profileId: nextProfileId, loaded: true });
  },
  // Multi-select (2026-11-15): ephemeral, never persisted —
  // the maps start empty every session.
  selectedBlockIdsByTab: {},
  selectionAnchorByTab: {},

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
      // Multi-select: prune the selection to the blocks that
      // still exist, so a removed block never stays selected.
      const selected = state.selectedBlockIdsByTab[tabId] ?? [];
      const kept = selected.filter((id) => next.some((b) => b.id === id));
      const selection =
        kept.length === selected.length
          ? state.selectedBlockIdsByTab
          : { ...state.selectedBlockIdsByTab, [tabId]: kept };
      return {
        blocksByTab: { ...state.blocksByTab, [tabId]: next },
        selectedBlockIdsByTab: selection,
      };
    }),

  clearBlocks: (tabId) =>
    set((state) => {
      // The blocks are gone for good — their held partial
      // escapes (if any) die with them.
      for (const b of state.blocksByTab[tabId] ?? EMPTY_BLOCKS) dropPendingEscape(b.id);
      // The selection goes with them (there is nothing left
      // to select).
      return {
        blocksByTab: { ...state.blocksByTab, [tabId]: [] },
        selectedBlockIdsByTab: { ...state.selectedBlockIdsByTab, [tabId]: [] },
        selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: null },
      };
    }),

  toggleBlockCollapsed: (tabId, blockId) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      if (!prev.some((b) => b.id === blockId)) return state;
      return {
        blocksByTab: {
          ...state.blocksByTab,
          [tabId]: prev.map((b) =>
            b.id === blockId ? { ...b, isCollapsed: !b.isCollapsed } : b,
          ),
        },
      };
    }),

  toggleBlockBookmarked: (tabId, blockId) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      if (!prev.some((b) => b.id === blockId)) return state;
      return {
        blocksByTab: {
          ...state.blocksByTab,
          [tabId]: prev.map((b) =>
            b.id === blockId ? { ...b, isBookmarked: !b.isBookmarked } : b,
          ),
        },
      };
    }),

  // Multi-select (2026-11-15): the selection is ephemeral —
  // it is never written to disk (serializeHistory writes
  // blocksByTab only), and setBlocks prunes it to the blocks
  // that still exist, so a removed block never stays selected.
  toggleBlockSelected: (tabId, blockId) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      if (!prev.some((b) => b.id === blockId)) return state;
      const selected = state.selectedBlockIdsByTab[tabId] ?? [];
      const next = selected.includes(blockId)
        ? selected.filter((id) => id !== blockId)
        : [...selected, blockId];
      return {
        selectedBlockIdsByTab: { ...state.selectedBlockIdsByTab, [tabId]: next },
        selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: blockId },
      };
    }),

  selectBlockOnly: (tabId, blockId) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      if (!prev.some((b) => b.id === blockId)) return state;
      return {
        selectedBlockIdsByTab: { ...state.selectedBlockIdsByTab, [tabId]: [blockId] },
        selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: blockId },
      };
    }),

  selectBlockRange: (tabId, blockId) =>
    set((state) => {
      const prev = state.blocksByTab[tabId] ?? EMPTY_BLOCKS;
      const toIndex = prev.findIndex((b) => b.id === blockId);
      if (toIndex < 0) return state;
      const anchorId = state.selectionAnchorByTab[tabId] ?? null;
      const fromIndex = anchorId === null ? -1 : prev.findIndex((b) => b.id === anchorId);
      // No anchor (or a stale one) — the range is just this block.
      if (fromIndex < 0) {
        return {
          selectedBlockIdsByTab: { ...state.selectedBlockIdsByTab, [tabId]: [blockId] },
          selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: blockId },
        };
      }
      const [start, end] =
        fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
      return {
        selectedBlockIdsByTab: {
          ...state.selectedBlockIdsByTab,
          [tabId]: prev.slice(start, end + 1).map((b) => b.id),
        },
        // The anchor does NOT move on a shift-click — a second
        // shift-click extends from the same anchor.
        selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: anchorId },
      };
    }),

  clearBlockSelection: (tabId) =>
    set((state) => ({
      selectedBlockIdsByTab: { ...state.selectedBlockIdsByTab, [tabId]: [] },
      selectionAnchorByTab: { ...state.selectionAnchorByTab, [tabId]: null },
    })),

  clearAgentBlocks: () => {
    if (get().guestSessionActive) return;
    set((state) => {
      let changed = false;
      const blocksByTab: Record<string, TerminalBlock[]> = {};
      for (const [tabId, blocks] of Object.entries(state.blocksByTab)) {
        const kept = blocks.filter(
          (b) => b.kind !== 'agent-prompt' && b.kind !== 'agent-response',
        );
        if (kept.length !== blocks.length) {
          changed = true;
          for (const b of blocks) {
            if (b.kind === 'agent-prompt' || b.kind === 'agent-response') {
              dropPendingEscape(b.id);
            }
          }
        }
        blocksByTab[tabId] = kept;
      }
      if (!changed) return state;
      return { blocksByTab };
    });
  },

  removeTab: (tabId) =>
    set((state) => {
      if (!(tabId in state.blocksByTab)) return state;
      for (const b of state.blocksByTab[tabId]) dropPendingEscape(b.id);
      const blocksByTab = { ...state.blocksByTab };
      delete blocksByTab[tabId];
      // The tab is gone — its selection and anchor go too.
      const selectedBlockIdsByTab = { ...state.selectedBlockIdsByTab };
      delete selectedBlockIdsByTab[tabId];
      const selectionAnchorByTab = { ...state.selectionAnchorByTab };
      delete selectionAnchorByTab[tabId];
      return { blocksByTab, selectedBlockIdsByTab, selectionAnchorByTab };
    }),

  guestSessionActive: false,
  guestStash: null,

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    // Flush the owner's blocks BEFORE veiling: a debounced write
    // pending from a submit seconds ago must land on disk now —
    // the guest guard would drop it, and quitting during the
    // guest session would otherwise lose those entries. (Same
    // hole commandHistoryStore already fixed.)
    flushHistoryPersistence();
    // The veil is a persisted fact, not per-renderer memory: a
    // renderer already open when the guest session starts (a
    // detached window) veils live via the storage event below,
    // and a renderer booting into a live guest session starts
    // veiled (see the boot values above).
    setGuestVeilPersisted(true);
    set({ guestSessionActive: true, guestStash: state.blocksByTab, blocksByTab: {} });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    const stash = state.guestStash;
    set({ guestSessionActive: false, guestStash: null, blocksByTab: stash ?? {} });
    // Unveil everywhere first, then write the restored owner
    // blocks back to disk now (the debounced flush was paused
    // for the whole guest session, and the key still holds the
    // owner's pre-guest copy — this just makes the restore
    // durable immediately).
    setGuestVeilPersisted(false);
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

// Cross-window veil sync (a detached window): another renderer
// entered or exited a guest session — veil/unveil live. The
// storage event fires only in OTHER documents, so a window never
// re-enters its own veil, and enter/exit guard on already-veiled
// / already-unveiled, so a duplicate event is a no-op.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== GUEST_VEIL_STORAGE_KEY) return;
    const state = useHistoryStore.getState();
    if (isGuestVeilPersisted()) {
      if (!state.guestSessionActive) useHistoryStore.getState().enterGuestSession();
    } else if (state.guestSessionActive) {
      useHistoryStore.getState().exitGuestSession();
    }
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
