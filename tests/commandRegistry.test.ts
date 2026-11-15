import { describe, test, expect, beforeEach } from 'vitest';
import {
  CommandRegistry,
  type CommandContext,
} from '../src/lib/commandRegistry';

const ctx: CommandContext = {
  view: 'editor',
  hasActiveFile: true,
  hasOpenFiles: true,
  luciferAiEnabled: true,
  luciferAiSilenced: false,
};

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  test('register + dispatch runs the handler', async () => {
    let ran = false;
    registry.register({ id: 'test:run', title: 'Run', run: () => { ran = true; } });
    expect(await registry.dispatch('test:run', ctx)).toBe(true);
    expect(ran).toBe(true);
  });

  test('dispatch returns false for an unknown command', async () => {
    expect(await registry.dispatch('nope:nope', ctx)).toBe(false);
  });

  test('findCommands filters by the when predicate', () => {
    registry.register({ id: 'a:always', title: 'Always', run: () => {} });
    registry.register({
      id: 'a:editor-only',
      title: 'Editor only',
      when: (c) => c.hasActiveFile,
      run: () => {},
    });
    registry.register({
      id: 'a:terminal-only',
      title: 'Terminal only',
      when: (c) => c.view === 'terminal',
      run: () => {},
    });
    const ids = registry.findCommands(ctx).map((d) => d.id);
    expect(ids).toContain('a:always');
    expect(ids).toContain('a:editor-only');
    expect(ids).not.toContain('a:terminal-only');
  });

  test('dispatch refuses a command that is not valid in this context', async () => {
    let ran = false;
    registry.register({
      id: 'a:gated',
      title: 'Gated',
      when: (c) => c.view === 'terminal',
      run: () => { ran = true; },
    });
    expect(await registry.dispatch('a:gated', ctx)).toBe(false);
    expect(ran).toBe(false);
  });

  test('hidden commands do not list, but still dispatch', async () => {
    let ran = false;
    registry.register({
      id: 'a:hidden',
      title: 'Hidden',
      hiddenInCommandPalette: true,
      run: () => { ran = true; },
    });
    expect(registry.findCommands(ctx).map((d) => d.id)).not.toContain('a:hidden');
    expect(
      registry.findCommands(ctx, true).map((d) => d.id),
    ).toContain('a:hidden');
    expect(await registry.dispatch('a:hidden', ctx)).toBe(true);
    expect(ran).toBe(true);
  });

  test('unregister removes a command', () => {
    registry.register({ id: 'a:gone', title: 'Gone', run: () => {} });
    expect(registry.unregister('a:gone')).toBe(true);
    expect(registry.get('a:gone')).toBeUndefined();
    expect(registry.unregister('a:gone')).toBe(false);
  });

  test('re-registering replaces the definition', async () => {
    let ran = '';
    registry.register({ id: 'a:x', title: 'One', run: () => { ran = 'one'; } });
    registry.register({ id: 'a:x', title: 'Two', run: () => { ran = 'two'; } });
    await registry.dispatch('a:x', ctx);
    expect(ran).toBe('two');
    expect(registry.all()).toHaveLength(1);
  });
});
