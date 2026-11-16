/**
 * IPC handlers for Lucid sessions (electron/ipc/tmuxSession.ts).
 *
 * The renderer (tmux client) talks to the main-process registry
 * (tmux server) over these channels. Handlers validate their
 * arguments and return { ok } result objects — domain errors
 * (unknown session, duplicate name) are values, never throws,
 * so the renderer can show them.
 *
 * These tests import the new module, so they fail at collection
 * on unmodified cea360f and pass with the slice.
 */
import { describe, test, expect, vi } from 'vitest';
import { setupTmuxSessionHandlers } from '../electron/ipc/tmuxSession';
import { TmuxSessionRegistry } from '../electron/services/tmuxSessionRegistry';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    }),
  };
  const registry = new TmuxSessionRegistry({ destroyPane: () => {} });
  setupTmuxSessionHandlers(ipcMain as never, registry);
  const call = (channel: string, ...args: unknown[]) => {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`no handler for ${channel}`);
    return fn({}, ...args) as Record<string, unknown>;
  };
  return { handlers, call, registry };
}

describe('lucid-session IPC channels', () => {
  test('registers every channel', () => {
    const { handlers } = setup();
    for (const channel of [
      'lucid-session:list',
      'lucid-session:create',
      'lucid-session:attach',
      'lucid-session:detach',
      'lucid-session:attach-or-create',
      'lucid-session:kill',
      'lucid-session:rename',
      'lucid-session:snapshot',
      'lucid-session:save',
      'lucid-session:track-pane',
      'lucid-session:mark-pane-exited',
    ]) {
      expect(handlers.has(channel)).toBe(true);
    }
  });

  test('create -> list -> attach -> detach -> kill round-trips through IPC', () => {
    const { call } = setup();
    const created = call('lucid-session:create', 'work', '/home/gary');
    expect(created.ok).toBe(true);
    const id = (created.session as { id: string }).id;
    const listed = call('lucid-session:list');
    expect((listed.sessions as { name: string }[]).map((s) => s.name)).toEqual(['work']);
    expect(call('lucid-session:detach', id).ok).toBe(true);
    expect(call('lucid-session:attach', id).ok).toBe(true);
    expect(call('lucid-session:kill', id).ok).toBe(true);
    expect((call('lucid-session:list').sessions as unknown[])).toHaveLength(0);
  });

  test('attach-or-create attaches an existing session, creates a missing one', () => {
    const { call } = setup();
    const first = call('lucid-session:attach-or-create', 'work');
    expect(first.ok).toBe(true);
    expect(first.created).toBe(true);
    const id = (first.session as { id: string }).id;
    call('lucid-session:detach', id);
    const second = call('lucid-session:attach-or-create', 'work');
    expect(second.created).toBe(false);
    expect((second.session as { id: string }).id).toBe(id);
  });

  test('rename works; duplicate create and unknown ids return ok:false, never throw', () => {
    const { call } = setup();
    const created = call('lucid-session:create', 'work');
    const id = (created.session as { id: string }).id;
    expect(call('lucid-session:create', 'work').ok).toBe(false);
    expect(call('lucid-session:rename', id, 'play').ok).toBe(true);
    expect(call('lucid-session:attach', 'nope').ok).toBe(false);
    expect(call('lucid-session:detach', 'nope').ok).toBe(false);
    expect(call('lucid-session:kill', 'nope').ok).toBe(false);
    expect(call('lucid-session:rename', 'nope', 'x').ok).toBe(false);
  });

  test('malformed arguments return ok:false', () => {
    const { call } = setup();
    expect(call('lucid-session:create', 42).ok).toBe(false);
    expect(call('lucid-session:attach', null).ok).toBe(false);
    expect(call('lucid-session:rename', 'x').ok).toBe(false);
  });

  test('snapshot returns the serialized registry; save returns ok', () => {
    const { call } = setup();
    call('lucid-session:create', 'work');
    const snap = call('lucid-session:snapshot');
    expect(snap.ok).toBe(true);
    expect(typeof snap.snapshot).toBe('string');
    expect(snap.snapshot as string).toMatch(/"work"/);
    expect(call('lucid-session:save').ok).toBe(true);
  });

  test('track-pane / mark-pane-exited drive kill-session shell destruction', () => {
    const destroyed: string[] = [];
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      handle: vi.fn((channel: string, fn: Handler) => {
        handlers.set(channel, fn);
      }),
    };
    const registry = new TmuxSessionRegistry({
      destroyPane: (id) => {
        destroyed.push(id);
      },
    });
    setupTmuxSessionHandlers(ipcMain as never, registry);
    const call = (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, ...args) as Record<string, unknown>;
    };
    const created = call('lucid-session:create', 'work');
    const id = (created.session as { id: string }).id;
    expect(call('lucid-session:track-pane', id, 'terminal-1').ok).toBe(true);
    expect(call('lucid-session:track-pane', id, 'terminal-2').ok).toBe(true);
    expect(registry.getSessionPaneIds(id)).toEqual(['terminal-1', 'terminal-2']);
    // A pane whose shell exited on its own is untracked — killing
    // the session must not try to destroy it again.
    expect(call('lucid-session:mark-pane-exited', 'terminal-2').ok).toBe(true);
    expect(registry.getSessionPaneIds(id)).toEqual(['terminal-1']);
    expect(call('lucid-session:kill', id).ok).toBe(true);
    expect(destroyed).toEqual(['terminal-1']);
  });

  test('track-pane with malformed arguments returns ok:false', () => {
    const { call } = setup();
    expect(call('lucid-session:track-pane', 'only-one-arg').ok).toBe(false);
    expect(call('lucid-session:track-pane', 42, 'terminal-1').ok).toBe(false);
    expect(call('lucid-session:mark-pane-exited', null).ok).toBe(false);
  });
});
