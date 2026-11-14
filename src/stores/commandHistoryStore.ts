import { create } from 'zustand';

/**
 * Global command history — up-arrow past commands, global and not
 * per tab (Gary, 2026-11-13 ~15:05 PST: "past commands with up
 * arrow like warp would be nice, probably needs to be global and
 * not per tab though").
 *
 * Replaces the per-tab `devHistory` state that used to live inside
 * Terminal.tsx and MiniTerminal.tsx: one list for the whole app,
 * fed at every accepted composer submit (terminal mode only —
 * agent prompts keep their own per-tab walk in sessionStore), so
 * Up in any tab recalls commands typed in any other tab.
 *
 * DECISIONS (Gary, 2026-11-14 ~01:24–01:27 PST):
 *  1. Mode-dependent — terminal mode walks terminal commands;
 *     agent mode walks agent prompts (unchanged, per-tab).
 *  2. Guest: session-only — a guest recalls only commands typed
 *     in that guest session, dropped on exit, never persisted.
 *  3. Profile-only persistence — the list survives a relaunch,
 *     scoped to the profile, never shared across profiles.
 *  4. Anything input, like Warp — slash lines included; everything
 *     typed through the composer is recallable.
 *  5. Esc cancels the walk in terminal mode (restores the draft,
 *     resets the index) — the walk-cancel lives in the Terminal /
 *     MiniTerminal components; agent mode keeps Esc = flip back
 *     to terminal.
 *  6. Below DEFCON 3: ACCEPT the limit — up-arrow below 3 stays
 *     the shell's per-tab readline history (no composer there).
 *  7. Divider below DEFCON 3: ACCEPT — no blocks below 3, so no
 *     dividers (the divider itself is in BlockList.tsx, already
 *     built — this store does not touch it).
 *
 * PERSISTENCE — one record, keyed by profile id:
 * `localStorage['lucid-command-history-v1']` holds
 * `{ [profileId]: string[] }` (oldest → newest, capped per
 * profile). The store keeps only the CURRENT profile's list in
 * memory; `switchProfile` flushes the old profile's list into
 * the record and loads the new one. Profile switches are driven
 * from profileStore.selectProfile (the same choke point that
 * drives the historyStore guest veil) and from the Terminal /
 * MiniTerminal mount effects (no-op when already loaded for
 * that profile).
 *
 * CROSS-WINDOW SYNC — the detached window runs in a separate
 * renderer with its own store instance. The sync mechanism is
 * the persisted record: `append` bases itself on the stored
 * list for the profile (so an append in one window never
 * clobbers an append the other window just made), and each
 * instance listens for `storage` events on the history key and
 * refreshes its in-memory list for the current profile.
 *
 * GUEST VEIL — copied from historyStore exactly: entering a
 * guest session stashes the owner's list in memory (never
 * deleted, never written over) and the visible list goes empty;
 * the guest's own typed commands accumulate in that visible
 * list for the session only; while the flag is on, nothing is
 * ever persisted to disk (see the guards in
 * scheduleCommandHistoryPersistence / flushCommandHistoryPersistence);
 * exiting drops the guest's session list and restores the
 * stashed owner list exactly. A fresh guest replacing the old
 * one drops the old guest's session list via resetGuestSession.
 *
 * WALK STATE — deliberately NOT in this store: the walk index
 * and the saved draft belong to the input line being typed, so
 * they live per composer (a ref + a draft ref in Terminal.tsx
 * / MiniTerminal.tsx, as devHistoryIdx did). A global walk
 * index shared across tabs would restore tab 1's draft into
 * tab 2's composer on Down-past-newest. The store holds the
 * history; the composer holds its walk through it.
 *
 * WRITE RATE: appends happen on submit only, so persistence is
 * DEBOUNCED (1s trailing) — one localStorage write per burst —
 * plus a flush on beforeunload so the last burst is not lost
 * when the app closes. Never throws.
 */

/** localStorage key for the persisted per-profile record. */
export const COMMAND_HISTORY_STORAGE_KEY = 'lucid-command-history-v1';

/** Most commands kept per profile, oldest → newest. */
export const COMMAND_HISTORY_MAX_ENTRIES = 500;

/** Debounce for the persisted write (ms) — see the module header. */
const COMMAND_HISTORY_PERSIST_DEBOUNCE_MS = 1000;

/** The implicit profile id (mirrors profileStore.DEFAULT_PROFILE_ID).
 *  Used only as the fallback when the store is used before any
 *  profile has been selected (tests, or an unusual boot path) —
 *  production always calls switchProfile first. */
const FALLBACK_PROFILE_ID = 'default';

/** A stable empty list so selectors never hand out a fresh array. */
export const EMPTY_COMMAND_HISTORY: string[] = [];

/** The persisted record: one command list per profile id. */
export type CommandHistoryRecord = Record<string, string[]>;

/** Is one persisted list plausible? Strings only; anything else
 *  is repaired or dropped, never trusted blindly. */
function isPlausibleEntries(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((e) => typeof e === 'string');
}

/** Cap one profile's list to the newest N entries. */
function capEntries(entries: string[]): string[] {
  return entries.length > COMMAND_HISTORY_MAX_ENTRIES
    ? entries.slice(-COMMAND_HISTORY_MAX_ENTRIES)
    : entries;
}

/**
 * Read the persisted record, or {} when there is none / it is
 * corrupt / storage is unavailable. Never throws.
 */
export function readPersistedCommandHistory(): CommandHistoryRecord {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: CommandHistoryRecord = {};
    for (const [profileId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isPlausibleEntries(value)) continue;
      if (value.length > 0) out[profileId] = capEntries(value);
    }
    return out;
  } catch {
    // Corrupt or unreadable storage: start empty, never crash.
    return {};
  }
}

/** Serialize one record snapshot for storage (capped per profile). */
function serializeCommandHistory(record: CommandHistoryRecord): string {
  const capped: CommandHistoryRecord = {};
  for (const [profileId, entries] of Object.entries(record)) {
    if (entries.length > 0) capped[profileId] = capEntries(entries);
  }
  return JSON.stringify(capped);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Write the current state to storage now. Never throws. */
export function flushCommandHistoryPersistence(): void {
  try {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    // A guest session never writes command history to disk: the
    // guest's session list is dropped when the guest session
    // ends, and the owner's persisted record must never be
    // overwritten with the guest's view. This also covers the
    // beforeunload flush, which calls this function directly.
    if (useCommandHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const state = useCommandHistoryStore.getState();
    // Re-read the record so other profiles' lists (possibly
    // written by the detached window since our last read) are
    // preserved; only this profile's key is overwritten.
    const record = readPersistedCommandHistory();
    if (state.loaded && state.profileId) {
      record[state.profileId] = capEntries(state.entries);
    }
    localStorage.setItem(COMMAND_HISTORY_STORAGE_KEY, serializeCommandHistory(record));
  } catch {
    // Private mode / quota: history just doesn't persist this session.
  }
}

/** Schedule a persisted write (debounced — see the module header). */
function scheduleCommandHistoryPersistence(): void {
  // Same guard as flushCommandHistoryPersistence: nothing is
  // scheduled while a guest session is veiled in.
  if (useCommandHistoryStore.getState().guestSessionActive) return;
  if (typeof localStorage === 'undefined') return;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushCommandHistoryPersistence();
  }, COMMAND_HISTORY_PERSIST_DEBOUNCE_MS);
}

/**
 * Remove one profile's list from the persisted record (profile
 * wipe — the profile's memory goes with the profile). If it is
 * the currently loaded profile, the in-memory list goes too.
 * Never during a guest session: the key holds the OWNER's
 * record, and a guest must never delete it.
 */
export function clearProfileCommandHistory(profileId: string): void {
  try {
    if (useCommandHistoryStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const record = readPersistedCommandHistory();
    delete record[profileId];
    localStorage.setItem(COMMAND_HISTORY_STORAGE_KEY, serializeCommandHistory(record));
  } catch {
    // Unavailable storage: nothing to clear.
  }
  const state = useCommandHistoryStore.getState();
  if (state.loaded && state.profileId === profileId) {
    useCommandHistoryStore.setState({ entries: [] });
  }
}

/**
 * Append one entry to a list: consecutive-duplicate suppression
 * (the HIST_IGNORE_DUPS convention — submitting the same command
 * twice in a row stores it once) + the 500 cap. Non-consecutive
 * duplicates are kept.
 */
function appendToList(prev: string[], entry: string): string[] {
  if (prev.length > 0 && prev[prev.length - 1] === entry) return prev;
  return capEntries([...prev, entry]);
}

interface CommandHistoryState {
  /** The visible command list, oldest → newest: the current
   *  profile's list, or the guest's session-only list while a
   *  guest session is veiled in. */
  entries: string[];
  /** The profile whose list is loaded ('' until switchProfile
   *  or the first append has run). */
  profileId: string;
  /** Whether a profile's list has been loaded yet. */
  loaded: boolean;

  /**
   * Append a submitted command to the visible list. Trims;
   * empty lines are ignored. In a guest session the append
   * lands in the session-only list (never persisted); otherwise
   * it lands in the current profile's list and schedules a
   * persisted write. The append bases itself on the stored
   * list for the profile, so an append in the detached window
   * never clobbers one the main window just made (and vice
   * versa) — see the module header.
   */
  append: (command: string) => void;
  /** Clear the visible list (the clear-history action). In a
   *  guest session this drops the session list only. */
  clear: () => void;
  /**
   * Load another profile's list: flush the current profile's
   * list into the persisted record, then load the new one.
   * No-op while a guest session is veiled in (profile switches
   * never touch entries under the veil) and no-op when the
   * profile is already loaded. The first call (loaded=false)
   * loads without flushing anything.
   */
  switchProfile: (profileId: string) => void;

  /** Whether a guest session is veiled in: the visible list is
   *  the guest's own session list; the owner's list is stashed
   *  (see guestStash) and untouched on disk. */
  guestSessionActive: boolean;
  /** The owner's list, stashed when a guest session starts and
   *  restored when it ends. Null outside a guest session.
   *  Never persisted — it only ever lives in memory. */
  guestStash: string[] | null;
  /** The profile the stashed list belongs to. Null outside a
   *  guest session. */
  guestStashProfileId: string | null;
  /**
   * Start a guest session (Gary, 2026-11-12 ~17:59 PST): no
   * history in any guest build. The owner's list is stashed
   * in memory — never deleted, never written over — and the
   * visible list goes empty; while the flag is on, no command
   * history is ever persisted to disk (see the guards in
   * scheduleCommandHistoryPersistence /
   * flushCommandHistoryPersistence). The guest's own typed
   * commands live only in the visible list and are dropped on
   * exit — they are NOT history.
   */
  enterGuestSession: () => void;
  /** End a guest session: drop the guest's session list and
   *  restore the stashed owner list exactly, flushing it back
   *  to disk. */
  exitGuestSession: () => void;
  /** Drop the current guest's session list (a fresh guest
   *  replaces the old one — "always a new guest") without
   *  touching the stashed owner list. No-op outside a guest
   *  session. */
  resetGuestSession: () => void;
}

export const useCommandHistoryStore = create<CommandHistoryState>((set, get) => ({
  entries: [],
  profileId: '',
  loaded: false,

  append: (command) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const state = get();
    // Before any profile has been selected (tests, or an unusual
    // boot path), the implicit profile owns the list — the
    // production path always calls switchProfile first.
    const profileId = state.loaded && state.profileId ? state.profileId : FALLBACK_PROFILE_ID;
    if (!state.loaded) {
      set({ profileId, loaded: true });
    }
    // Base the append on the stored list for the profile, not
    // just the in-memory one: the detached window may have
    // appended since our last refresh, and its entries must not
    // be lost. In a guest session there is no stored list — the
    // session list lives only in memory.
    const base = state.guestSessionActive
      ? state.entries
      : readPersistedCommandHistory()[profileId] ?? state.entries;
    const next = appendToList(base, trimmed);
    if (next === base) {
      // Consecutive duplicate — nothing to append, but the stored
      // base may be newer than our in-memory list (an append in
      // the detached window since our last refresh); sync to it.
      if (JSON.stringify(base) !== JSON.stringify(state.entries)) {
        set({ entries: base });
      }
      return;
    }
    set({ entries: next });
    scheduleCommandHistoryPersistence();
  },

  clear: () => {
    set({ entries: [] });
    scheduleCommandHistoryPersistence();
  },

  switchProfile: (nextProfileId) => {
    const state = get();
    if (state.guestSessionActive) return;
    if (state.loaded && state.profileId === nextProfileId) return;
    // Flush the outgoing profile's list first (the first load
    // has nothing to flush).
    if (state.loaded && state.profileId) {
      const record = readPersistedCommandHistory();
      record[state.profileId] = capEntries(state.entries);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(COMMAND_HISTORY_STORAGE_KEY, serializeCommandHistory(record));
        }
      } catch {
        // Private mode / quota: the switch still loads the new list.
      }
    }
    const entries = readPersistedCommandHistory()[nextProfileId] ?? [];
    set({ entries, profileId: nextProfileId, loaded: true });
  },

  guestSessionActive: false,
  guestStash: null,
  guestStashProfileId: null,

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    // Flush the owner's list BEFORE veiling: a debounced write
    // pending from a submit seconds ago must land on disk now —
    // the guest guard would drop it, and quitting during the
    // guest session would otherwise lose those entries.
    flushCommandHistoryPersistence();
    set({
      guestSessionActive: true,
      guestStash: state.entries,
      guestStashProfileId: state.loaded ? state.profileId : null,
      entries: [],
    });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    const stash = state.guestStash;
    const stashProfileId = state.guestStashProfileId;
    set({
      guestSessionActive: false,
      guestStash: null,
      guestStashProfileId: null,
      entries: stash ?? [],
      // The stash belongs to the profile that was active when
      // the guest veiled in; restoring it restores the profile
      // binding too. (A selectProfile after exit calls
      // switchProfile for the target profile when it differs.)
      profileId: stashProfileId ?? state.profileId,
      loaded: true,
    });
    // Write the restored owner list back to disk now (the
    // debounced flush was paused for the whole guest session,
    // and the key still holds the owner's pre-guest copy — this
    // just makes the restore durable immediately).
    flushCommandHistoryPersistence();
  },

  resetGuestSession: () => {
    const state = get();
    // Outside a guest session the visible list IS the owner's —
    // never clear it. Inside one, the visible list is the
    // previous guest's session list only; drop it for the fresh
    // guest. The stash (owner list) is untouched.
    if (!state.guestSessionActive) return;
    set({ entries: [] });
  },
}));

// Every mutation persists (debounced) — including direct setState,
// which tests use to reset. The write is the debounced one, so a
// burst of submits costs one localStorage write, and the
// beforeunload flush below catches the last burst on quit.
useCommandHistoryStore.subscribe(() => {
  scheduleCommandHistoryPersistence();
});

// Cross-window sync (detached window): another renderer wrote the
// record — refresh this instance's list for the current profile.
// Ignored while a guest session is veiled in (the owner's record
// must never leak into the guest's visible list) and before any
// profile has loaded.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== COMMAND_HISTORY_STORAGE_KEY) return;
    const state = useCommandHistoryStore.getState();
    if (state.guestSessionActive || !state.loaded || !state.profileId) return;
    const next = readPersistedCommandHistory()[state.profileId] ?? [];
    if (JSON.stringify(next) !== JSON.stringify(state.entries)) {
      useCommandHistoryStore.setState({ entries: next });
    }
  });
}

// Flush the last burst when the app closes (renderer quit / reload).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushCommandHistoryPersistence();
  });
}
