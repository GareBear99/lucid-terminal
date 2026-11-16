/**
 * Lucid sessions — renderer side of the tmux steal.
 *
 * tmux's split, applied to Lucid: the Electron main process is
 * the server (electron/services/tmuxSessionRegistry — it owns
 * the PTYs); each renderer window is a client that ATTACHES to
 * one session. This store is the client's session list: it owns
 * which sessions exist, which one this window shows, and the
 * disk snapshot (localStorage) that survives an app restart.
 *
 * NOTE the name collision, on purpose: src/stores/sessionStore
 * is NOT this. That store is tab MODE (terminal ↔ agent pill)
 * and stays untouched. This store is tmux sessions — named
 * workspaces of tabs + split panes that survive a restart and
 * detach/reattach.
 *
 * PROFILES (Gary, 2026-11-14 — "they should all be session only
 * or profile only"): sessions are PER PROFILE, like command
 * history and (now) block history. The stored record is
 * `{ [profileId]: registryState }` — the same shape
 * commandHistoryStore uses. Switching profiles flushes the
 * outgoing profile's sessions and loads the incoming profile's
 * (empty for a created profile — a new profile starts with no
 * sessions, it never inherits another profile's). The tmux
 * server in main holds the live PTYs; the renderer holds the
 * per-profile list. No tmux itself is involved anywhere: this
 * is Lucid's own implementation of the session pattern.
 *
 * GUEST VEIL (Gary, 2026-11-12 ~17:59 PST): a guest sees no
 * saved data. Entering a guest session stashes the owner's
 * sessions in memory and shows none; the guest's own sessions
 * live only for the session and are never persisted; exiting
 * restores the owner's exactly. The veil is a persisted fact
 * (guestVeil.ts) so a renderer already open when the guest
 * session starts (a detached window) veils live too.
 *
 * Persistence follows historyStore's pattern exactly:
 * best-effort localStorage, never throws, corrupt storage reads
 * back empty, and a guest session never writes the owner's
 * sessions to disk.
 *
 * Capture mapping (Lucid tabs/groups -> tmux windows/panes):
 *  - an ungrouped tab is one window with one pane;
 *  - a split group is one window whose panes are the group's
 *    leaves and whose layout is the group's tree;
 *  - a pane's id IS its tab id (one PTY per tab), so a restore
 *    plan round-trips to tabs with no translation table.
 * Window order is first-appearance order in the tab strip.
 */
import { create } from 'zustand';
import type { TerminalTab } from '../types';
import type { SplitGroup, SplitNode } from './splitPaneStore';
// Merge fix: unused import removed (TS6133) — this store never
// reads historyStore; the tmux steal's import was dead on arrival.
import {
  GUEST_VEIL_STORAGE_KEY,
  isGuestVeilPersisted,
  setGuestVeilPersisted,
} from '../lib/guestVeil';
import {
  attachOrCreateSession,
  attachSession as attachSessionPure,
  buildRestorePlan,
  createSession as createSessionPure,
  detachSession as detachSessionPure,
  emptyRegistryState,
  killSession as killSessionPure,
  parseSessionsSnapshot,
  renameSession as renameSessionPure,
  type LucidPaneLayout,
  type LucidRestorePlan,
  type LucidSession,
  type LucidSessionRegistryState,
  type LucidSessionWindow,
} from '../lib/tmuxSession';

/** localStorage key for the persisted sessions (versioned). */
export const LUCID_SESSIONS_STORAGE_KEY = 'lucid-tmux-sessions-v1';

/** The implicit profile id (mirrors profileStore.DEFAULT_PROFILE_ID).
 *  Kept local — importing profileStore here would cycle
 *  (profileStore drives this store's switchProfile). */
export const LUCID_SESSIONS_FALLBACK_PROFILE_ID = 'default';

/** The persisted record: one registry state per profile id. */
export type LucidSessionRecord = Record<string, LucidSessionRegistryState>;

/**
 * Read the persisted per-profile record, or {} when there is
 * none / it is corrupt / storage is unavailable. Never throws.
 * Invalid profile slots are dropped (counted in `dropped` only
 * for the slot read by readPersistedLucidSessions).
 */
export function readPersistedLucidSessionRecord(): LucidSessionRecord {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LUCID_SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const record: LucidSessionRecord = {};
    for (const [profileId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = parseSessionsSnapshot(value);
      if (slot.ok) record[profileId] = slot.state;
    }
    return record;
  } catch {
    return {};
  }
}

/** Read the persisted sessions for one profile (the implicit
 *  'default' when none is given). Never throws. */
export function readPersistedLucidSessions(
  profileId: string = LUCID_SESSIONS_FALLBACK_PROFILE_ID,
): { ok: boolean; state: LucidSessionRegistryState; dropped: number } {
  try {
    if (typeof localStorage === 'undefined') {
      return { ok: true, state: emptyRegistryState(), dropped: 0 };
    }
    const raw = localStorage.getItem(LUCID_SESSIONS_STORAGE_KEY);
    if (!raw) return { ok: true, state: emptyRegistryState(), dropped: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, state: emptyRegistryState(), dropped: 0 };
    }
    const slot = (parsed as Record<string, unknown>)[profileId];
    if (slot === undefined) return { ok: true, state: emptyRegistryState(), dropped: 0 };
    // Merge fix: parseSessionsSnapshot's failure variant carries no
    // `dropped`, but this function's return type requires it — a
    // failed parse dropped nothing countable, so it reads as 0.
    // (No caller reads `.error`; all callers use `.ok`/`.state`.)
    const snapshot = parseSessionsSnapshot(slot);
    return snapshot.ok ? snapshot : { ok: false, state: snapshot.state, dropped: 0 };
  } catch {
    return { ok: false, state: emptyRegistryState(), dropped: 0 };
  }
}

/** Write the current sessions to storage now. Never throws. */
export function flushLucidSessionPersistence(): void {
  try {
    // A guest session never writes the owner's sessions to disk.
    if (useLucidSessionStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const state = useLucidSessionStore.getState();
    // Re-read the record so other profiles' sessions (possibly
    // written by the detached window since our last read) are
    // preserved; only this profile's slot is overwritten.
    const record = readPersistedLucidSessionRecord();
    if (state.loaded && state.profileId) {
      record[state.profileId] = {
        version: 1,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      };
    }
    localStorage.setItem(LUCID_SESSIONS_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode / quota: sessions just don't persist.
  }
}

/** Convert a split-pane tree (SplitNode) to a snapshot layout. */
export function splitNodeToLayout(node: SplitNode): LucidPaneLayout {
  if (node.type === 'leaf') return { type: 'leaf', paneId: node.tabId };
  return {
    type: 'split',
    id: node.id,
    direction: node.direction,
    sizes: node.sizes,
    first: splitNodeToLayout(node.first),
    second: splitNodeToLayout(node.second),
  };
}

/** All leaf tab ids in a layout, in visible order. */
export function layoutPaneIds(layout: LucidPaneLayout | null): string[] {
  if (!layout) return [];
  if (layout.type === 'leaf') return [layout.paneId];
  return [...layoutPaneIds(layout.first), ...layoutPaneIds(layout.second)];
}

function windowIdFor(index: number): string {
  return `lucid-window-${index}`;
}

/**
 * Map live tabs + split groups onto tmux windows. Ungrouped tabs
 * are windows of one pane; each split group is one window whose
 * layout is the group tree. Windows come out in first-appearance
 * order in the tab strip, indexed from 0.
 */
export function tabsToSessionWindows(
  tabs: TerminalTab[],
  groups: Record<string, SplitGroup>,
): LucidSessionWindow[] {
  const tabById = new Map(tabs.map((t) => [t.id, t]));
  const grouped = new Set<string>();
  for (const group of Object.values(groups)) {
    for (const id of layoutPaneIds(splitNodeToLayout(group.root))) grouped.add(id);
  }
  const windows: LucidSessionWindow[] = [];
  const seenGroups = new Set<string>();
  for (const tab of tabs) {
    const group = Object.values(groups).find((g) =>
      layoutPaneIds(splitNodeToLayout(g.root)).includes(tab.id),
    );
    if (group) {
      if (seenGroups.has(group.id)) continue;
      seenGroups.add(group.id);
      const layout = splitNodeToLayout(group.root);
      const paneIds = layoutPaneIds(layout);
      const panes = paneIds
        .map((id) => tabById.get(id))
        .filter((t): t is TerminalTab => !!t)
        .map((t) => ({
          id: t.id,
          tabId: t.id,
          cwd: t.cwd,
          ...(t.title ? { title: t.title } : {}),
          shellAlive: true,
        }));
      windows.push({
        id: windowIdFor(windows.length),
        index: windows.length,
        name: tabById.get(paneIds[0])?.title ?? `Window ${windows.length + 1}`,
        layout,
        panes,
        activePaneId: tab.isActive ? tab.id : (paneIds[0] ?? null),
      });
    } else if (!grouped.has(tab.id)) {
      windows.push({
        id: windowIdFor(windows.length),
        index: windows.length,
        name: tab.title,
        layout: { type: 'leaf', paneId: tab.id },
        panes: [
          {
            id: tab.id,
            tabId: tab.id,
            cwd: tab.cwd,
            ...(tab.title ? { title: tab.title } : {}),
            shellAlive: true,
          },
        ],
        activePaneId: tab.id,
      });
    }
  }
  return windows;
}

/** A restore plan back to tabs: one tab per pane, window order. */
export function restorePlanToTabs(
  plan: LucidRestorePlan,
): { id: string; title: string; cwd: string }[] {
  const tabs: { id: string; title: string; cwd: string }[] = [];
  for (const win of [...plan.windows].sort((a, b) => a.index - b.index)) {
    for (const pane of win.panes) {
      tabs.push({
        id: pane.tabId,
        title: pane.title ?? `Terminal ${tabs.length + 1}`,
        cwd: pane.cwd,
      });
    }
  }
  return tabs;
}

export interface LucidSessionState {
  /** Sessions for the CURRENT profile only (see profileId). */
  sessions: LucidSession[];
  /** The session this window shows (tmux: the attached session). */
  activeSessionId: string | null;
  /** The session this window is attached to — same as active
   *  while attached, null while detached. Kept separate so a
   *  detached window still knows which session it left. */
  attachedSessionId: string | null;
  /** The profile whose sessions are loaded. */
  profileId: string;
  /** Whether a profile's sessions have been loaded yet. */
  loaded: boolean;

  /** tmux new-session: create + attach. Null on duplicate/invalid name. */
  createSession: (name?: string, cwd?: string) => LucidSession | null;
  /** tmux attach-session. False when the session does not exist. */
  attachSession: (id: string, opts?: { detachOthers?: boolean }) => boolean;
  /** tmux detach-client: leave the session running. */
  detachSession: (id: string) => boolean;
  /** tmux new-session -A: attach if it exists, create if not. */
  attachOrCreateSession: (name: string, cwd?: string) => LucidSession | null;
  /** tmux kill-session: destroy the session and its shells. */
  killSession: (id: string) => boolean;
  /** tmux rename-session. False on duplicate/invalid name. */
  renameSession: (id: string, name: string) => boolean;
  /**
   * Record the window's live tabs + split groups into a session
   * (the capture step before a detach or a quit). The session's
   * windows are replaced wholesale with the capture.
   */
  captureSession: (
    sessionId: string,
    tabs: TerminalTab[],
    groups: Record<string, SplitGroup>,
    activeTabId: string | null,
  ) => boolean;
  /**
   * The restore plan for a session, or null when it does not
   * exist. `shellsAlive` is false after an app restart (every
   * pane gets a fresh shell in its cwd) and true while the app
   * is alive (attach rebinds the live PTYs).
   */
  restorePlan: (sessionId: string, shellsAlive: boolean) => LucidRestorePlan | null;
  /**
   * Load another profile's sessions: flush the current
   * profile's, then load the new one (empty for a created
   * profile). No-op while a guest session is veiled in and
   * no-op when the profile is already loaded. Driven from
   * profileStore.selectProfile and the Terminal mount effect.
   */
  switchProfile: (profileId: string) => void;

  /** Whether a guest session is veiled in (no saved data shown). */
  guestSessionActive: boolean;
  /** The owner's sessions, stashed on guest entry. Null outside. */
  guestStash: LucidSession[] | null;
  /** The profile the stashed sessions belong to. */
  guestStashProfileId: string | null;
  /** Start a guest session: stash the owner's sessions, show none. */
  enterGuestSession: () => void;
  /** End a guest session: drop the guest's sessions, restore the owner's. */
  exitGuestSession: () => void;
  /** Drop the current guest's sessions (fresh guest replaces the old). */
  resetGuestSession: () => void;
  /** Test-only reset: clears sessions, attachment and the veil. */
  resetForTests: () => void;
}

function persist(): void {
  flushLucidSessionPersistence();
}

function registryFrom(sessions: LucidSession[], activeSessionId: string | null): LucidSessionRegistryState {
  return { version: 1, sessions, activeSessionId };
}

const persistedAtStartup = readPersistedLucidSessions();

export const useLucidSessionStore = create<LucidSessionState>((set, get) => ({
  sessions: persistedAtStartup.state.sessions,
  activeSessionId: persistedAtStartup.state.activeSessionId,
  attachedSessionId:
    persistedAtStartup.state.sessions.find((s) => s.id === persistedAtStartup.state.activeSessionId)
      ?.attached === true
      ? persistedAtStartup.state.activeSessionId
      : null,
  profileId: LUCID_SESSIONS_FALLBACK_PROFILE_ID,
  loaded: true,
  guestSessionActive: false,
  guestStash: null,
  guestStashProfileId: null,

  createSession: (name, cwd) => {
    const result = createSessionPure(
      registryFrom(get().sessions, get().activeSessionId),
      { name, cwd, now: Date.now() },
    );
    if (!result.ok) return null;
    set({ sessions: result.state.sessions, activeSessionId: result.state.activeSessionId, attachedSessionId: result.session.id });
    persist();
    return result.session;
  },

  attachSession: (id, opts) => {
    const result = attachSessionPure(
      registryFrom(get().sessions, get().activeSessionId),
      id,
      { detachOthers: opts?.detachOthers, now: Date.now() },
    );
    if (!result.ok) return false;
    set({ sessions: result.state.sessions, activeSessionId: id, attachedSessionId: id });
    persist();
    return true;
  },

  detachSession: (id) => {
    const result = detachSessionPure(
      registryFrom(get().sessions, get().activeSessionId),
      id,
    );
    if (!result.ok) return false;
    set({
      sessions: result.state.sessions,
      activeSessionId: result.state.activeSessionId,
      attachedSessionId: get().attachedSessionId === id ? null : get().attachedSessionId,
    });
    persist();
    return true;
  },

  attachOrCreateSession: (name, cwd) => {
    const result = attachOrCreateSession(
      registryFrom(get().sessions, get().activeSessionId),
      name,
      { cwd, now: Date.now() },
    );
    if (!result.ok) return null;
    set({ sessions: result.state.sessions, activeSessionId: result.state.activeSessionId, attachedSessionId: result.session.id });
    persist();
    return result.session;
  },

  killSession: (id) => {
    const result = killSessionPure(
      registryFrom(get().sessions, get().activeSessionId),
      id,
    );
    if (!result.ok) return false;
    set({
      sessions: result.state.sessions,
      activeSessionId: result.state.activeSessionId,
      attachedSessionId: get().attachedSessionId === id ? null : get().attachedSessionId,
    });
    persist();
    return true;
  },

  renameSession: (id, name) => {
    const result = renameSessionPure(
      registryFrom(get().sessions, get().activeSessionId),
      id,
      name,
    );
    if (!result.ok) return false;
    set({ sessions: result.state.sessions });
    persist();
    return true;
  },

  captureSession: (sessionId, tabs, groups, activeTabId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const windows = tabsToSessionWindows(tabs, groups);
    const activeWindow =
      windows.find((w) => w.panes.some((p) => p.id === activeTabId)) ?? windows[0] ?? null;
    const next: LucidSession = {
      ...session,
      windows,
      currentWindowId: activeWindow ? activeWindow.id : null,
    };
    set({ sessions: get().sessions.map((s) => (s.id === sessionId ? next : s)) });
    persist();
    return true;
  },

  restorePlan: (sessionId, shellsAlive) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const plan = buildRestorePlan(session);
    if (!shellsAlive) {
      for (const win of plan.windows) {
        for (const pane of win.panes) pane.shellAlive = false;
      }
    }
    return plan;
  },

  switchProfile: (nextProfileId) => {
    const state = get();
    if (state.guestSessionActive) return;
    if (state.loaded && state.profileId === nextProfileId) return;
    flushLucidSessionPersistence();
    const loaded = readPersistedLucidSessions(nextProfileId);
    set({
      sessions: loaded.state.sessions,
      activeSessionId: loaded.state.activeSessionId,
      attachedSessionId:
        loaded.state.sessions.find((s) => s.id === loaded.state.activeSessionId)?.attached === true
          ? loaded.state.activeSessionId
          : null,
      profileId: nextProfileId,
      loaded: true,
    });
  },

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    flushLucidSessionPersistence();
    setGuestVeilPersisted(true);
    set({
      guestSessionActive: true,
      guestStash: state.sessions,
      guestStashProfileId: state.loaded ? state.profileId : null,
      sessions: [],
      activeSessionId: null,
      attachedSessionId: null,
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
      sessions: stash ?? [],
      activeSessionId: (stash ?? []).find((s) => s.attached)?.id ?? null,
      attachedSessionId: (stash ?? []).find((s) => s.attached)?.id ?? null,
      profileId: stashProfileId ?? state.profileId,
      loaded: true,
    });
    setGuestVeilPersisted(false);
    flushLucidSessionPersistence();
  },

  resetGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    set({ sessions: [], activeSessionId: null, attachedSessionId: null });
  },

  resetForTests: () => {
    setGuestVeilPersisted(false);
    set({
      sessions: [],
      activeSessionId: null,
      attachedSessionId: null,
      profileId: LUCID_SESSIONS_FALLBACK_PROFILE_ID,
      loaded: true,
      guestSessionActive: false,
      guestStash: null,
      guestStashProfileId: null,
    });
  },
}));

// Cross-window veil sync (a detached window): another renderer
// entered or exited a guest session — veil/unveil live. See
// historyStore for the same listener and guestVeil.ts for why
// the veil is a persisted fact.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== GUEST_VEIL_STORAGE_KEY) return;
    const state = useLucidSessionStore.getState();
    if (isGuestVeilPersisted()) {
      if (!state.guestSessionActive) useLucidSessionStore.getState().enterGuestSession();
    } else if (state.guestSessionActive) {
      useLucidSessionStore.getState().exitGuestSession();
    }
  });
}
