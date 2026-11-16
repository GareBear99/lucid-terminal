// @vitest-environment jsdom
/**
 * Lucid session store — renderer side of the session model
 * (src/stores/lucidSessionStore.ts).
 *
 * The store owns the session list for this window (the tmux
 * client), persists it to localStorage on every mutation (same
 * best-effort pattern as historyStore), and maps Lucid's live
 * tabs + split groups onto tmux windows/panes for capture and
 * restore.
 *
 * Sessions are PER PROFILE: the stored record is
 * `{ [profileId]: registryState }` under
 * `lucid-tmux-sessions-v1`, and profileStore drives
 * `switchProfile` — profile B never sees profile A's sessions
 * (Gary's rule: data is profile-only). A guest session veils
 * the owner's sessions and never persists (same veil pattern as
 * historyStore / commandHistoryStore).
 *
 * These tests import the new module, so they fail at collection
 * on unmodified cea360f and pass with the slice.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  useLucidSessionStore,
  LUCID_SESSIONS_STORAGE_KEY,
  readPersistedLucidSessions,
  readPersistedLucidSessionRecord,
  flushLucidSessionPersistence,
  tabsToSessionWindows,
  restorePlanToTabs,
} from '../src/stores/lucidSessionStore';
import { GUEST_VEIL_STORAGE_KEY, isGuestVeilPersisted } from '../src/lib/guestVeil';
import type { TerminalTab } from '../src/types';
import type { SplitGroup } from '../src/stores/splitPaneStore';

function tab(id: string, cwd = '/home/gary', isActive = false): TerminalTab {
  return { id, title: id, cwd, isActive };
}

function reset() {
  useLucidSessionStore.getState().resetForTests();
  try {
    localStorage.removeItem(LUCID_SESSIONS_STORAGE_KEY);
    localStorage.removeItem(GUEST_VEIL_STORAGE_KEY);
  } catch {
    // No storage in this environment — the store must still work.
  }
}

beforeEach(() => reset());
afterEach(() => reset());

describe('store create / attach / detach / kill', () => {
  test('createSession makes an attached session and it becomes active', () => {
    const session = useLucidSessionStore.getState().createSession('work', '/home/gary');
    expect(session).not.toBeNull();
    expect(session?.name).toBe('work');
    expect(session?.attached).toBe(true);
    const state = useLucidSessionStore.getState();
    expect(state.activeSessionId).toBe(session?.id);
    expect(state.attachedSessionId).toBe(session?.id);
  });

  test('createSession with a duplicate name returns null and keeps the old session', () => {
    useLucidSessionStore.getState().createSession('work');
    expect(useLucidSessionStore.getState().createSession('work')).toBeNull();
    expect(useLucidSessionStore.getState().sessions).toHaveLength(1);
  });

  test('detachSession detaches but keeps the session listed', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    expect(session).not.toBeNull();
    useLucidSessionStore.getState().detachSession(session!.id);
    const state = useLucidSessionStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].attached).toBe(false);
    expect(state.attachedSessionId).toBeNull();
    // The session survives detach — re-attach brings it back.
    expect(useLucidSessionStore.getState().attachSession(session!.id)).toBe(true);
    expect(useLucidSessionStore.getState().sessions[0].attached).toBe(true);
  });

  test('attachSession of an unknown id returns false', () => {
    expect(useLucidSessionStore.getState().attachSession('nope')).toBe(false);
  });

  test('killSession removes the session and clears attachment', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    expect(useLucidSessionStore.getState().killSession(session!.id)).toBe(true);
    expect(useLucidSessionStore.getState().sessions).toHaveLength(0);
    expect(useLucidSessionStore.getState().attachedSessionId).toBeNull();
  });

  test('attachOrCreateSession attaches an existing session, creates a missing one', () => {
    const first = useLucidSessionStore.getState().attachOrCreateSession('work');
    useLucidSessionStore.getState().detachSession(first!.id);
    const again = useLucidSessionStore.getState().attachOrCreateSession('work');
    expect(again?.id).toBe(first?.id);
    expect(useLucidSessionStore.getState().sessions).toHaveLength(1);
    const other = useLucidSessionStore.getState().attachOrCreateSession('play');
    expect(other?.name).toBe('play');
    expect(useLucidSessionStore.getState().sessions).toHaveLength(2);
  });

  test('renameSession renames and rejects a duplicate name', () => {
    const a = useLucidSessionStore.getState().createSession('a');
    useLucidSessionStore.getState().createSession('b');
    expect(useLucidSessionStore.getState().renameSession(a!.id, 'c')).toBe(true);
    expect(useLucidSessionStore.getState().renameSession(a!.id, 'b')).toBe(false);
    expect(useLucidSessionStore.getState().sessions.find((s) => s.id === a!.id)?.name).toBe('c');
  });
});

describe('persistence (localStorage, historyStore pattern)', () => {
  test('mutations persist: the stored snapshot parses back to the same sessions', () => {
    const session = useLucidSessionStore.getState().createSession('work', '/home/gary');
    flushLucidSessionPersistence();
    const raw = localStorage.getItem(LUCID_SESSIONS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = readPersistedLucidSessions();
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.state.sessions.map((s) => s.name)).toEqual(['work']);
    expect(parsed.state.activeSessionId).toBe(session?.id);
  });

  test('corrupt stored JSON reads back as an empty registry, never throws', () => {
    localStorage.setItem(LUCID_SESSIONS_STORAGE_KEY, '{corrupt');
    const parsed = readPersistedLucidSessions();
    expect(parsed.ok).toBe(false);
    expect(parsed.state.sessions).toHaveLength(0);
  });
});

describe('per-profile isolation (the profile fix)', () => {
  test('switchProfile isolates sessions: profile B starts empty, profile A keeps its own', () => {
    useLucidSessionStore.getState().createSession('work');
    flushLucidSessionPersistence();
    useLucidSessionStore.getState().switchProfile('alice');
    expect(useLucidSessionStore.getState().sessions).toHaveLength(0);
    expect(useLucidSessionStore.getState().profileId).toBe('alice');
    useLucidSessionStore.getState().createSession('alice-work');
    flushLucidSessionPersistence();
    useLucidSessionStore.getState().switchProfile('default');
    expect(useLucidSessionStore.getState().sessions.map((s) => s.name)).toEqual(['work']);
    useLucidSessionStore.getState().switchProfile('alice');
    expect(useLucidSessionStore.getState().sessions.map((s) => s.name)).toEqual(['alice-work']);
  });

  test('the stored record keeps one slot per profile', () => {
    useLucidSessionStore.getState().createSession('work');
    flushLucidSessionPersistence();
    useLucidSessionStore.getState().switchProfile('alice');
    useLucidSessionStore.getState().createSession('alice-work');
    flushLucidSessionPersistence();
    const record = readPersistedLucidSessionRecord();
    expect(Object.keys(record).sort()).toEqual(['alice', 'default']);
    expect(record.default.sessions.map((s) => s.name)).toEqual(['work']);
    expect(record.alice.sessions.map((s) => s.name)).toEqual(['alice-work']);
  });

  test('a newly created profile starts with no sessions (no inheritance)', () => {
    useLucidSessionStore.getState().createSession('work');
    flushLucidSessionPersistence();
    useLucidSessionStore.getState().switchProfile('brand-new');
    expect(useLucidSessionStore.getState().sessions).toHaveLength(0);
  });

  test('switchProfile to the same profile is a no-op (no reload, no loss)', () => {
    useLucidSessionStore.getState().createSession('work');
    useLucidSessionStore.getState().switchProfile('default');
    expect(useLucidSessionStore.getState().sessions.map((s) => s.name)).toEqual(['work']);
  });
});

describe('guest veil (sessions never persist for a guest)', () => {
  test('enterGuestSession veils the owner sessions; exit restores them', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    flushLucidSessionPersistence();
    useLucidSessionStore.getState().enterGuestSession();
    const veiled = useLucidSessionStore.getState();
    expect(veiled.guestSessionActive).toBe(true);
    expect(veiled.sessions).toHaveLength(0);
    expect(veiled.attachedSessionId).toBeNull();
    expect(isGuestVeilPersisted()).toBe(true);
    useLucidSessionStore.getState().exitGuestSession();
    const restored = useLucidSessionStore.getState();
    expect(restored.guestSessionActive).toBe(false);
    expect(restored.sessions.map((s) => s.id)).toEqual([session?.id]);
    expect(isGuestVeilPersisted()).toBe(false);
  });

  test('a guest session never writes the owner sessions to disk', () => {
    useLucidSessionStore.getState().createSession('work');
    flushLucidSessionPersistence();
    const before = localStorage.getItem(LUCID_SESSIONS_STORAGE_KEY);
    expect(before).toBeTruthy();
    useLucidSessionStore.getState().enterGuestSession();
    useLucidSessionStore.getState().createSession('guest-work');
    flushLucidSessionPersistence();
    expect(localStorage.getItem(LUCID_SESSIONS_STORAGE_KEY)).toBe(before);
  });

  test('a storage event for the veil key veils/unveils a window that was already open', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    // Another window entered a guest session: the flag appears in
    // storage and the storage event fires in this window.
    localStorage.setItem(GUEST_VEIL_STORAGE_KEY, '1');
    window.dispatchEvent(new StorageEvent('storage', { key: GUEST_VEIL_STORAGE_KEY }));
    expect(useLucidSessionStore.getState().guestSessionActive).toBe(true);
    expect(useLucidSessionStore.getState().sessions).toHaveLength(0);
    // The guest ended in the other window: flag removed, event fires.
    localStorage.removeItem(GUEST_VEIL_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: GUEST_VEIL_STORAGE_KEY }));
    expect(useLucidSessionStore.getState().guestSessionActive).toBe(false);
    expect(useLucidSessionStore.getState().sessions.map((s) => s.id)).toEqual([session?.id]);
  });
});

describe('tabsToSessionWindows (Lucid tabs/groups -> tmux windows/panes)', () => {
  test('each ungrouped tab is its own window with one pane', () => {
    const windows = tabsToSessionWindows([tab('terminal-1'), tab('terminal-2')], {});
    expect(windows).toHaveLength(2);
    expect(windows[0].index).toBe(0);
    expect(windows[0].panes).toHaveLength(1);
    expect(windows[0].panes[0]).toMatchObject({ id: 'terminal-1', cwd: '/home/gary', shellAlive: true });
    expect(windows[1].index).toBe(1);
  });

  test('a split group is one window whose layout is the group tree', () => {
    const groups: Record<string, SplitGroup> = {
      'split-1': {
        id: 'split-1',
        root: {
          type: 'split',
          id: 'split-node-1',
          direction: 'vertical',
          sizes: [50, 50],
          first: { type: 'leaf', tabId: 'terminal-1' },
          second: { type: 'leaf', tabId: 'terminal-2' },
        },
      },
    };
    const windows = tabsToSessionWindows(
      [tab('terminal-1'), tab('terminal-2'), tab('terminal-3', '/tmp')],
      groups,
    );
    expect(windows).toHaveLength(2);
    expect(windows[0].panes.map((p) => p.id)).toEqual(['terminal-1', 'terminal-2']);
    expect(windows[0].layout?.type).toBe('split');
    expect(windows[1].panes.map((p) => p.id)).toEqual(['terminal-3']);
    expect(windows[1].panes[0].cwd).toBe('/tmp');
  });

  test('captureSession records windows + current window into the session', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    useLucidSessionStore.getState().captureSession(
      session!.id,
      [tab('terminal-1', '/home/gary', true), tab('terminal-2', '/tmp')],
      {},
      'terminal-1',
    );
    const saved = useLucidSessionStore.getState().sessions[0];
    expect(saved.windows).toHaveLength(2);
    expect(saved.currentWindowId).toBe(saved.windows[0].id);
    expect(saved.windows[0].activePaneId).toBe('terminal-1');
  });
});

describe('restorePlan / restorePlanToTabs (relaunch: layout + cwd, fresh shells)', () => {
  test('restorePlan marks every pane for a fresh shell when its PTY is gone', () => {
    const session = useLucidSessionStore.getState().createSession('work');
    useLucidSessionStore.getState().captureSession(
      session!.id,
      [tab('terminal-1', '/home/gary'), tab('terminal-2', '/tmp')],
      {},
      'terminal-1',
    );
    const plan = useLucidSessionStore.getState().restorePlan(session!.id, false);
    expect(plan).not.toBeNull();
    expect(plan!.windows).toHaveLength(2);
    expect(plan!.windows[0].panes[0]).toMatchObject({ cwd: '/home/gary', shellAlive: false });
    const tabs = restorePlanToTabs(plan!);
    // Titles round-trip from the captured tabs (the helper
    // titles each tab with its id).
    expect(tabs).toEqual([
      { id: 'terminal-1', title: 'terminal-1', cwd: '/home/gary' },
      { id: 'terminal-2', title: 'terminal-2', cwd: '/tmp' },
    ]);
  });

  test('restorePlan of an unknown session is null', () => {
    expect(useLucidSessionStore.getState().restorePlan('nope', true)).toBeNull();
  });
});
