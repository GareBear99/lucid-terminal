/**
 * tmux session model — pure core (src/lib/tmuxSession.ts).
 *
 * Grounded in upstream tmux (tmux.github.io → tmux/tmux wiki
 * "Getting Started", the tmux.1 man page, and the tmux/tmux repo
 * at master): one server owns every session, window and pane; a
 * client only attaches to / detaches from a session; detaching
 * never touches the session or its programs; the server exits
 * when no sessions remain (exit-empty, on by default).
 *
 * These tests import the new module, so they fail at collection
 * on unmodified cea360f (module does not exist) and pass with
 * the slice.
 */
import { describe, test, expect } from 'vitest';
import {
  validateSessionName,
  defaultSessionName,
  createSession,
  attachSession,
  detachSession,
  attachOrCreateSession,
  killSession,
  killAllSessions,
  renameSession,
  addWindow,
  removeWindow,
  addPane,
  listSessions,
  formatSessionList,
  serializeSessions,
  parseSessionsSnapshot,
  buildRestorePlan,
  setPaneAlive,
  emptyRegistryState,
  type LucidSessionRegistryState,
  type LucidSessionWindow,
} from '../src/lib/tmuxSession';

const NOW = 1794000000000;

function oneSession(name = 'work'): { state: LucidSessionRegistryState; id: string } {
  const r = createSession(emptyRegistryState(), { name, cwd: '/home/gary', now: NOW });
  if (!r.ok) throw new Error(r.error);
  return { state: r.state, id: r.session.id };
}

function windowWithPane(index: number, paneId: string, cwd = '/home/gary'): LucidSessionWindow {
  return {
    id: `window-${index}`,
    index,
    name: `window-${index}`,
    layout: { type: 'leaf', paneId },
    panes: [{ id: paneId, tabId: `terminal-${index + 1}`, cwd, shellAlive: true }],
    activePaneId: paneId,
  };
}

describe('validateSessionName (tmux: names must be unique; ":" is the target separator)', () => {
  test('accepts ordinary names and numeric defaults', () => {
    expect(validateSessionName('work')).toBeNull();
    expect(validateSessionName('my-project_1')).toBeNull();
    expect(validateSessionName('0')).toBeNull();
  });

  test('rejects empty / whitespace-only names', () => {
    expect(validateSessionName('')).toMatch(/empty/);
    expect(validateSessionName('   ')).toMatch(/empty/);
  });

  test('rejects ":" (tmux target separator) and "/"', () => {
    expect(validateSessionName('a:b')).toMatch(/:/);
    expect(validateSessionName('a/b')).toMatch(/\//);
  });

  test('rejects "." / ".." and names over 64 chars', () => {
    expect(validateSessionName('.')).toBeTruthy();
    expect(validateSessionName('..')).toBeTruthy();
    expect(validateSessionName('x'.repeat(65))).toMatch(/64/);
  });
});

describe('defaultSessionName (tmux: first session "0", second "1", gaps filled)', () => {
  test('"0" when empty, lowest free number otherwise', () => {
    expect(defaultSessionName(emptyRegistryState())).toBe('0');
    const { state } = oneSession('0');
    expect(defaultSessionName(state)).toBe('1');
    const r = createSession(state, { name: '2', now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(defaultSessionName(r.state)).toBe('1');
  });
});

describe('createSession (tmux new-session: one window, one pane, attached)', () => {
  test('creates one window with one live pane, attached, named', () => {
    const r = createSession(emptyRegistryState(), { name: 'work', cwd: '/home/gary', now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.session.name).toBe('work');
    expect(r.session.attached).toBe(true);
    expect(r.session.clientCount).toBe(1);
    expect(r.session.createdAt).toBe(NOW);
    expect(r.session.windows).toHaveLength(1);
    expect(r.session.windows[0].index).toBe(0);
    expect(r.session.windows[0].panes).toHaveLength(1);
    expect(r.session.windows[0].panes[0].cwd).toBe('/home/gary');
    expect(r.session.windows[0].panes[0].shellAlive).toBe(true);
    expect(r.state.activeSessionId).toBe(r.session.id);
  });

  test('unnamed session gets the numeric default name', () => {
    const r = createSession(emptyRegistryState(), { now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(r.session.name).toBe('0');
  });

  test('duplicate name is an error, state unchanged', () => {
    const { state } = oneSession('work');
    const r = createSession(state, { name: 'work', now: NOW });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/already exists/);
    expect(r.state.sessions).toHaveLength(1);
  });

  test('invalid name is an error', () => {
    const r = createSession(emptyRegistryState(), { name: 'a:b', now: NOW });
    expect(r.ok).toBe(false);
  });
});

describe('attach / detach (tmux: detach ends the client only)', () => {
  test('attach to an unknown session errors', () => {
    const r = attachSession(emptyRegistryState(), 'nope', { now: NOW });
    expect(r.ok).toBe(false);
  });

  test('detach leaves the session and its panes intact', () => {
    const { state, id } = oneSession('work');
    const detached = detachSession(state, id, { now: NOW + 1000 });
    expect(detached.ok).toBe(true);
    if (!detached.ok) throw new Error('unreachable');
    const s = detached.state.sessions[0];
    expect(s.attached).toBe(false);
    expect(s.clientCount).toBe(0);
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0].panes[0].shellAlive).toBe(true);
    expect(detached.state.activeSessionId).toBeNull();
  });

  test('detach is idempotent — detaching a detached session still succeeds', () => {
    const { state, id } = oneSession('work');
    const d1 = detachSession(state, id, { now: NOW });
    if (!d1.ok) throw new Error('unreachable');
    expect(detachSession(d1.state, id, { now: NOW }).ok).toBe(true);
  });

  test('re-attach restores attached + lastAttachedAt', () => {
    const { state, id } = oneSession('work');
    const d = detachSession(state, id, { now: NOW });
    if (!d.ok) throw new Error('unreachable');
    const a = attachSession(d.state, id, { now: NOW + 5000 });
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error('unreachable');
    expect(a.state.sessions[0].attached).toBe(true);
    expect(a.state.sessions[0].clientCount).toBe(1);
    expect(a.state.sessions[0].lastAttachedAt).toBe(NOW + 5000);
    expect(a.state.activeSessionId).toBe(id);
  });

  test('attach -d (detachOthers) steals the session: client count stays 1', () => {
    const { state, id } = oneSession('work');
    const a = attachSession(state, id, { detachOthers: true, now: NOW });
    if (!a.ok) throw new Error('unreachable');
    expect(a.state.sessions[0].clientCount).toBe(1);
  });

  test('plain attach from a second client adds a client (tmux allows many)', () => {
    const { state, id } = oneSession('work');
    const a = attachSession(state, id, { now: NOW });
    if (!a.ok) throw new Error('unreachable');
    expect(a.state.sessions[0].clientCount).toBe(2);
  });
});

describe('attachOrCreateSession (tmux new -A)', () => {
  test('attaches when the session exists, creates it when it does not', () => {
    const { state, id } = oneSession('work');
    const d = detachSession(state, id, { now: NOW });
    if (!d.ok) throw new Error('unreachable');
    const existing = attachOrCreateSession(d.state, 'work', { now: NOW });
    expect(existing.ok).toBe(true);
    if (!existing.ok) throw new Error('unreachable');
    expect(existing.created).toBe(false);
    expect(existing.session.id).toBe(id);
    const fresh = attachOrCreateSession(existing.state, 'other', { now: NOW });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) throw new Error('unreachable');
    expect(fresh.created).toBe(true);
    expect(fresh.session.name).toBe('other');
  });
});

describe('killSession / killAllSessions (tmux kill-session / kill-server)', () => {
  test('kill removes only that session; active moves to the most recently attached remainder', () => {
    const a = oneSession('a');
    const b = createSession(a.state, { name: 'b', now: NOW + 1 });
    if (!b.ok) throw new Error(b.error);
    expect(b.state.activeSessionId).toBe(b.session.id);
    const killed = killSession(b.state, b.session.id);
    expect(killed.ok).toBe(true);
    if (!killed.ok) throw new Error('unreachable');
    expect(killed.state.sessions.map((s) => s.name)).toEqual(['a']);
    expect(killed.state.activeSessionId).toBe(a.id);
  });

  test('killing the last session leaves an empty registry (server exits, exit-empty)', () => {
    const { state, id } = oneSession('work');
    const killed = killSession(state, id);
    if (!killed.ok) throw new Error('unreachable');
    expect(killed.state.sessions).toHaveLength(0);
    expect(killed.state.activeSessionId).toBeNull();
  });

  test('kill of an unknown session errors', () => {
    expect(killSession(emptyRegistryState(), 'nope').ok).toBe(false);
  });

  test('killAllSessions empties everything', () => {
    const { state } = oneSession('work');
    expect(killAllSessions(state).sessions).toHaveLength(0);
  });
});

describe('renameSession (tmux rename-session, C-b $)', () => {
  test('renames, rejects duplicates and invalid names', () => {
    const { state, id } = oneSession('work');
    const renamed = renameSession(state, id, 'play');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error('unreachable');
    expect(renamed.state.sessions[0].name).toBe('play');
    const dup = createSession(renamed.state, { name: 'other', now: NOW });
    if (!dup.ok) throw new Error(dup.error);
    expect(renameSession(dup.state, id, 'other').ok).toBe(false);
    expect(renameSession(dup.state, id, 'a:b').ok).toBe(false);
    expect(renameSession(dup.state, 'nope', 'x').ok).toBe(false);
  });
});

describe('windows and panes (tmux: window index fills gaps; last window closes the session)', () => {
  test('addWindow takes the lowest free index', () => {
    const { state, id } = oneSession('work');
    const w1 = addWindow(state, id, windowWithPane(2, 'pane-2'));
    if (!w1.ok) throw new Error(w1.error);
    // Session was created with window 0; adding a window at
    // index 2 lands at 1 (lowest free) — the caller's index is
    // a hint, the registry owns numbering like tmux.
    expect(w1.window.index).toBe(1);
    expect(w1.state.sessions[0].windows.map((w) => w.index)).toEqual([0, 1]);
  });

  test('addPane appends a pane to the window layout as a split', () => {
    const { state, id } = oneSession('work');
    const added = addPane(state, id, 0, { id: 'pane-2', tabId: 'terminal-2', cwd: '/tmp', shellAlive: true });
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error('unreachable');
    const win = added.state.sessions[0].windows[0];
    expect(win.panes).toHaveLength(2);
    expect(win.layout?.type).toBe('split');
    expect(win.activePaneId).toBe('pane-2');
  });

  test('removing the last window destroys the session (tmux: no windows, no session)', () => {
    const { state, id } = oneSession('work');
    const removed = removeWindow(state, id, 0);
    expect(removed.ok).toBe(true);
    if (!removed.ok) throw new Error('unreachable');
    expect(removed.sessionDestroyed).toBe(true);
    expect(removed.state.sessions).toHaveLength(0);
  });

  test('removing a non-last window keeps the session and re-resolves current window', () => {
    const { state, id } = oneSession('work');
    const w = addWindow(state, id, windowWithPane(1, 'pane-9'));
    if (!w.ok) throw new Error(w.error);
    const removed = removeWindow(w.state, id, 0);
    if (!removed.ok) throw new Error('unreachable');
    expect(removed.sessionDestroyed).toBe(false);
    expect(removed.state.sessions[0].windows).toHaveLength(1);
    expect(removed.state.sessions[0].currentWindowId).toBe('window-1');
  });
});

describe('setPaneAlive (PTY exit / restore marking)', () => {
  test('marks a pane dead and back alive; unknown pane/session errors', () => {
    const { state, id } = oneSession('work');
    const paneId = state.sessions[0].windows[0].panes[0].id;
    const dead = setPaneAlive(state, id, paneId, false);
    expect(dead.ok).toBe(true);
    if (!dead.ok) throw new Error('unreachable');
    expect(dead.state.sessions[0].windows[0].panes[0].shellAlive).toBe(false);
    expect(setPaneAlive(dead.state, id, 'nope', false).ok).toBe(false);
    expect(setPaneAlive(dead.state, 'nope', paneId, false).ok).toBe(false);
  });
});

describe('listSessions / formatSessionList (tmux ls)', () => {
  test('summaries carry window/pane counts and attached state', () => {
    const { state } = oneSession('work');
    const list = listSessions(state);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'work', windows: 1, panes: 1, attached: true });
  });

  test('format matches tmux ls: "name: N windows (created ...)"', () => {
    const { state } = oneSession('work');
    const text = formatSessionList(state);
    expect(text).toMatch(/^work: 1 windows \(created /);
  });

  test('empty registry formats as empty string', () => {
    expect(formatSessionList(emptyRegistryState())).toBe('');
  });
});

describe('serialize / parse (disk snapshot: resurrect-grade restore)', () => {
  test('round-trip preserves sessions, windows, panes and active session', () => {
    const { state, id } = oneSession('work');
    const parsed = parseSessionsSnapshot(serializeSessions(state));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.state.sessions).toHaveLength(1);
    expect(parsed.state.sessions[0].name).toBe('work');
    expect(parsed.state.activeSessionId).toBe(id);
    expect(parsed.dropped).toBe(0);
  });

  test('corrupt JSON errors instead of crashing', () => {
    expect(parseSessionsSnapshot('{not json').ok).toBe(false);
    expect(parseSessionsSnapshot(null).ok).toBe(false);
    expect(parseSessionsSnapshot('[]').ok).toBe(false);
  });

  test('unknown version errors', () => {
    expect(parseSessionsSnapshot(JSON.stringify({ version: 99, sessions: [] })).ok).toBe(false);
  });

  test('invalid entries are dropped, valid ones kept, duplicates dropped', () => {
    const raw = JSON.stringify({
      version: 1,
      activeSessionId: null,
      sessions: [
        { id: 's1', name: 'good', createdAt: 1, lastAttachedAt: 1, attached: false, clientCount: 0, cwd: '/tmp', currentWindowId: null, windows: [] },
        { id: 's2', name: 'good', createdAt: 1, lastAttachedAt: 1, attached: false, clientCount: 0, cwd: '/tmp', currentWindowId: null, windows: [] },
        { id: 42, name: 'bad' },
        'nonsense',
        { id: 's3', name: 'alsogood', createdAt: 1, lastAttachedAt: 1, attached: false, clientCount: 0, cwd: '/tmp', currentWindowId: null, windows: [{ id: 'w', index: 0, name: 'w', layout: null, panes: [{ id: 'p', tabId: 'terminal-1', cwd: '/tmp', shellAlive: false }], activePaneId: 'p' }] },
      ],
    });
    const parsed = parseSessionsSnapshot(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.state.sessions.map((s) => s.name)).toEqual(['good', 'alsogood']);
    expect(parsed.dropped).toBe(3);
  });
});

describe('buildRestorePlan (what relaunch re-creates: layout + cwd, fresh shells)', () => {
  test('plan keeps layout and cwd; shellAlive=false panes are marked for fresh shells', () => {
    const { state, id } = oneSession('work');
    const added = addPane(state, id, 0, { id: 'pane-2', tabId: 'terminal-2', cwd: '/tmp', shellAlive: false });
    if (!added.ok) throw new Error(added.error);
    const session = added.state.sessions[0];
    const plan = buildRestorePlan(session);
    expect(plan.sessionName).toBe('work');
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0].panes).toHaveLength(2);
    expect(plan.windows[0].panes[0]).toMatchObject({ cwd: '/home/gary', shellAlive: true });
    expect(plan.windows[0].panes[1]).toMatchObject({ cwd: '/tmp', shellAlive: false });
    expect(plan.windows[0].layout?.type).toBe('split');
  });
});
