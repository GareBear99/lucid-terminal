/**
 * Main-process session registry — the tmux server analogue
 * (electron/services/tmuxSessionRegistry.ts).
 *
 * Upstream tmux: the server is a single process that owns every
 * session and pane; clients attach/detach over a socket; detach
 * never touches a session; kill-session destroys its panes;
 * kill-server destroys everything. Here the Electron main
 * process is the server, renderer windows are the clients, and
 * node-pty shells are the panes' programs. The registry takes
 * its PTY host and its file store as injections, so it runs in
 * plain node with fakes — no Electron, no node-pty in tests.
 *
 * These tests import the new module, so they fail at collection
 * on unmodified cea360f and pass with the slice.
 */
import { describe, test, expect } from 'vitest';
import { TmuxSessionRegistry } from '../electron/services/tmuxSessionRegistry';

function fakeFileStore() {
  let data: string | null = null;
  return {
    read: () => data,
    write: (next: string) => {
      data = next;
    },
    peek: () => data,
  };
}

function setup() {
  const destroyed: string[] = [];
  const store = fakeFileStore();
  const registry = new TmuxSessionRegistry(
    { destroyPane: (id) => destroyed.push(id) },
    store,
  );
  return { registry, destroyed, store };
}

describe('registry: create / attach / detach (tmux server)', () => {
  test('createSession starts attached; detachClient leaves session and panes alive', () => {
    const { registry, destroyed } = setup();
    const session = registry.createSession('work', '/home/gary');
    registry.trackPane(session.id, 'terminal-1');
    registry.attachSession(session.id, 'client-main');
    registry.detachClient('client-main');
    expect(registry.getSession(session.id)?.attached).toBe(false);
    expect(destroyed).toHaveLength(0);
    expect(registry.listSessions()).toHaveLength(1);
  });

  test('detachSession detaches every client of that session only', () => {
    const { registry, destroyed } = setup();
    const a = registry.createSession('a');
    const b = registry.createSession('b');
    registry.attachSession(a.id, 'client-1');
    registry.attachSession(b.id, 'client-2');
    registry.detachSession(a.id);
    expect(registry.getSession(a.id)?.attached).toBe(false);
    expect(registry.getSession(b.id)?.attached).toBe(true);
    expect(destroyed).toHaveLength(0);
  });

  test('attaching a client to a second session switches it (tmux switch-client)', () => {
    const { registry } = setup();
    const a = registry.createSession('a');
    const b = registry.createSession('b');
    registry.attachSession(a.id, 'client-1');
    registry.attachSession(b.id, 'client-1');
    expect(registry.getSession(a.id)?.attached).toBe(false);
    expect(registry.getSession(b.id)?.attached).toBe(true);
  });

  test('createSession with a duplicate name throws', () => {
    const { registry } = setup();
    registry.createSession('work');
    expect(() => registry.createSession('work')).toThrow(/already exists/);
  });

  test('attachSession of an unknown session throws', () => {
    const { registry } = setup();
    expect(() => registry.attachSession('nope', 'client-1')).toThrow(/no such session/);
  });
});

describe('registry: kill (tmux kill-session / kill-server)', () => {
  test('killSession destroys only that session’s live panes', () => {
    const { registry, destroyed } = setup();
    const a = registry.createSession('a');
    const b = registry.createSession('b');
    registry.trackPane(a.id, 'terminal-1');
    registry.trackPane(a.id, 'terminal-2');
    registry.trackPane(b.id, 'terminal-3');
    registry.killSession(a.id);
    expect(destroyed).toEqual(['terminal-1', 'terminal-2']);
    expect(registry.listSessions().map((s) => s.name)).toEqual(['b']);
  });

  test('markPaneExited removes a pane from the live set, so kill skips it', () => {
    const { registry, destroyed } = setup();
    const a = registry.createSession('a');
    registry.trackPane(a.id, 'terminal-1');
    registry.trackPane(a.id, 'terminal-2');
    registry.markPaneExited('terminal-1');
    registry.killSession(a.id);
    expect(destroyed).toEqual(['terminal-2']);
  });

  test('killServer destroys every live pane and empties the registry', () => {
    const { registry, destroyed } = setup();
    const a = registry.createSession('a');
    const b = registry.createSession('b');
    registry.trackPane(a.id, 'terminal-1');
    registry.trackPane(b.id, 'terminal-2');
    registry.killServer();
    expect(destroyed).toEqual(['terminal-1', 'terminal-2']);
    expect(registry.isEmpty()).toBe(true);
  });

  test('killSession of an unknown session throws', () => {
    const { registry } = setup();
    expect(() => registry.killSession('nope')).toThrow(/no such session/);
  });
});

describe('registry: save / load (app restart: resurrect-grade restore)', () => {
  test('save writes a snapshot; load restores layout with all shells dead', () => {
    const { registry, store } = setup();
    const session = registry.createSession('work', '/home/gary');
    registry.trackPane(session.id, 'terminal-1');
    registry.save();
    expect(store.peek()).toMatch(/"work"/);

    const store2 = fakeFileStore();
    store2.write(store.peek()!);
    const destroyed: string[] = [];
    const registry2 = new TmuxSessionRegistry(
      { destroyPane: (id) => destroyed.push(id) },
      store2,
    );
    registry2.load();
    const restored = registry2.getSession(session.id);
    expect(restored?.name).toBe('work');
    // The app quit, so the PTYs died with it: every pane comes
    // back marked for a fresh shell in its recorded cwd — tmux
    // itself does not survive a reboot either; tmux-resurrect
    // restores layout + cwd the same way.
    expect(restored?.windows[0].panes[0].shellAlive).toBe(false);
    expect(restored?.windows[0].panes[0].cwd).toBe('/home/gary');
    expect(registry2.getSessionPaneIds(session.id)).toHaveLength(0);
  });

  test('load with no snapshot, or a corrupt one, starts empty without throwing', () => {
    const { registry } = setup();
    expect(() => registry.load()).not.toThrow();
    expect(registry.isEmpty()).toBe(true);
    const store = fakeFileStore();
    store.write('{corrupt');
    const registry2 = new TmuxSessionRegistry({ destroyPane: () => {} }, store);
    expect(() => registry2.load()).not.toThrow();
    expect(registry2.isEmpty()).toBe(true);
  });

  test('isEmpty is true only when no sessions remain (exit-empty)', () => {
    const { registry } = setup();
    expect(registry.isEmpty()).toBe(true);
    const s = registry.createSession('work');
    expect(registry.isEmpty()).toBe(false);
    registry.killSession(s.id);
    expect(registry.isEmpty()).toBe(true);
  });
});
