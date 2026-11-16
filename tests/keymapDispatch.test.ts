/**
 * Keymap dispatch tests (keymaps).
 *
 * The dispatcher is the one place a keyboard event becomes a
 * command: keymap `when` (coarse) → registry lookup → registry
 * `when` (fine) → run. Both gates matter: Ctrl+G in the
 * terminal falls through to readline (the keymap never names
 * go-to-line there), and ⌘D in the editor falls through to
 * Monaco (the keymap names the split, but the registry's
 * `inTerminal` gate refuses it — so Monaco keeps its ⌘D and
 * the editor never splits by accident). A refused command
 * returns null WITHOUT preventDefault — the caller only
 * prevents the default when a command actually ran.
 *
 * The tests pass their own registry and 'darwin' explicitly:
 * the node test env has no navigator, so the platform default
 * would resolve to the host (linux) and cmd- keys would read
 * as ctrl- keys.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from '../src/lib/commandRegistry';
import { dispatchKeyEvent } from '../src/lib/keymapDispatch';
import { useFileStore } from '../src/stores/fileStore';
import { useSettingsStore } from '../src/stores/settingsStore';

function keyEvent(key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  return {
    key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  };
}

function testRegistry() {
  const registry = new CommandRegistry();
  const runs: string[] = [];
  const run = (id: string) => () => {
    runs.push(id);
  };
  registry.register({
    id: 'lucid:command-palette',
    title: 'Command Palette',
    run: run('lucid:command-palette'),
  });
  registry.register({
    id: 'lucid:go-to-line',
    title: 'Go to Line…',
    when: (ctx) => ctx.view === 'editor' && ctx.hasActiveFile,
    run: run('lucid:go-to-line'),
  });
  registry.register({
    id: 'terminal:split',
    title: 'Split Terminal',
    when: (ctx) => ctx.view === 'terminal',
    run: run('terminal:split'),
  });
  registry.register({
    id: 'file:save',
    title: 'Save File',
    when: (ctx) => ctx.hasActiveFile,
    run: run('file:save'),
  });
  return { registry, runs };
}

beforeEach(() => {
  useFileStore.setState({ openFiles: [], activeFilePath: null });
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, luciferAiEnabled: true, luciferAiSilenced: false },
  }));
});

describe('dispatchKeyEvent', () => {
  test('⌘⇧P runs the palette from any view', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('P', { meta: true, shift: true }), 'terminal', false, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBe('lucid:command-palette');
    expect(runs).toEqual(['lucid:command-palette']);
  });

  test('Ctrl+G in the terminal falls through to readline — the keymap never names go-to-line there', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('g', { ctrl: true }), 'terminal', true, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBeNull();
    expect(runs).toEqual([]);
  });

  test('Ctrl+G in the editor with a file runs go-to-line', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('g', { ctrl: true }), 'editor', true, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBe('lucid:go-to-line');
    expect(runs).toEqual(['lucid:go-to-line']);
  });

  test('⌘D in the editor is refused by the registry gate — Monaco keeps the key', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('d', { meta: true }), 'editor', true, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBeNull();
    expect(runs).toEqual([]);
  });

  test('⌘D in the terminal splits', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('d', { meta: true }), 'terminal', false, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBe('terminal:split');
    expect(runs).toEqual(['terminal:split']);
  });

  test('⌘S without an active file is refused — nothing saves', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('s', { meta: true }), 'editor', false, {
      registry,
      platform: 'darwin',
    });
    expect(ran).toBeNull();
    expect(runs).toEqual([]);
  });

  test('a user override rebinds the key: ⌘⇧P now runs the split', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('P', { meta: true, shift: true }), 'terminal', false, {
      registry,
      platform: 'darwin',
      overrides: [{ command: 'terminal:split', keys: 'cmd-shift-p' }],
    });
    expect(ran).toBe('terminal:split');
    expect(runs).toEqual(['terminal:split']);
  });

  test('an override that unbinds a key leaves it dead — the palette no longer opens on ⌘⇧P', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('P', { meta: true, shift: true }), 'terminal', false, {
      registry,
      platform: 'darwin',
      overrides: [{ command: 'lucid:command-palette', keys: '' }],
    });
    expect(ran).toBeNull();
    expect(runs).toEqual([]);
  });

  test('a keymap entry with no registry command dispatches nothing', () => {
    const { registry, runs } = testRegistry();
    const ran = dispatchKeyEvent(keyEvent('T', { meta: true, shift: true }), 'terminal', false, {
      registry,
      platform: 'darwin',
      overrides: [{ command: 'nope:not-a-command', keys: 'cmd-shift-t' }],
    });
    expect(ran).toBeNull();
    expect(runs).toEqual([]);
  });

  test('an unmatched key falls through', () => {
    const { registry, runs } = testRegistry();
    expect(
      dispatchKeyEvent(keyEvent('z', { meta: true }), 'terminal', false, {
        registry,
        platform: 'darwin',
      }),
    ).toBeNull();
    expect(runs).toEqual([]);
  });
});

describe('detectPlatform (via dispatch)', () => {
  test('on darwin cmd is Meta; on linux cmd is Ctrl', () => {
    const { registry, runs } = testRegistry();
    // Meta+P on a linux platform does NOT match cmd-shift-p.
    expect(
      dispatchKeyEvent(keyEvent('P', { meta: true, shift: true }), 'terminal', false, {
        registry,
        platform: 'linux',
      }),
    ).toBeNull();
    // Ctrl+Shift+P on linux DOES match.
    expect(
      dispatchKeyEvent(keyEvent('P', { ctrl: true, shift: true }), 'terminal', false, {
        registry,
        platform: 'linux',
      }),
    ).toBe('lucid:command-palette');
    expect(runs).toEqual(['lucid:command-palette']);
  });
});

describe('dispatchKeyEvent — scroll to cursor', () => {
  const editorCtx = {
    view: 'editor',
    hasActiveFile: true,
    hasOpenFiles: true,
    luciferAiEnabled: false,
    luciferAiSilenced: false,
  } as const;

  it('lucid:scroll-to-cursor reveals the cursor position and no-ops without an editor', async () => {
    const { registerBuiltinCommands } = await import('../src/lib/builtinCommands');
    const { commandRegistry } = await import('../src/lib/commandRegistry');
    const { setActiveMonacoEditor, resetActiveMonacoEditorForTests } = await import(
      '../src/lib/editorHandle'
    );
    registerBuiltinCommands({
      switchView: vi.fn(),
      toggleAI: vi.fn(),
      openHelp: vi.fn(),
    });
    const def = commandRegistry.get('lucid:scroll-to-cursor');
    expect(def).toBeDefined();
    // No editor mounted: the command runs without throwing.
    await expect(commandRegistry.dispatch('lucid:scroll-to-cursor', editorCtx)).resolves.toBe(true);
    // A mounted editor: the viewport moves to the cursor.
    const revealPositionInCenter = vi.fn();
    const getPosition = vi.fn(() => ({ lineNumber: 12, column: 5 }));
    setActiveMonacoEditor({ editor: { getPosition, revealPositionInCenter }, monaco: {} });
    await commandRegistry.dispatch('lucid:scroll-to-cursor', editorCtx);
    expect(getPosition).toHaveBeenCalled();
    expect(revealPositionInCenter).toHaveBeenCalledWith({ lineNumber: 12, column: 5 });
    resetActiveMonacoEditorForTests();
  });

  it('editor:go-to-matching-bracket runs Monaco jumpToBracket and no-ops without an editor', async () => {
    const { registerBuiltinCommands } = await import('../src/lib/builtinCommands');
    const { commandRegistry } = await import('../src/lib/commandRegistry');
    const { setActiveMonacoEditor, resetActiveMonacoEditorForTests } = await import(
      '../src/lib/editorHandle'
    );
    registerBuiltinCommands({
      switchView: vi.fn(),
      toggleAI: vi.fn(),
      openHelp: vi.fn(),
    });
    const def = commandRegistry.get('editor:go-to-matching-bracket');
    expect(def).toBeDefined();
    // No editor mounted: the command runs without throwing.
    await expect(
      commandRegistry.dispatch('editor:go-to-matching-bracket', editorCtx),
    ).resolves.toBe(true);
    // A mounted editor: the built-in action runs.
    const run = vi.fn();
    setActiveMonacoEditor({
      editor: { getAction: vi.fn(() => ({ run })), trigger: vi.fn() },
      monaco: {},
    });
    await commandRegistry.dispatch('editor:go-to-matching-bracket', editorCtx);
    expect(run).toHaveBeenCalled();
    // Without getAction the trigger fallback fires instead.
    const trigger = vi.fn();
    setActiveMonacoEditor({ editor: { trigger }, monaco: {} });
    await commandRegistry.dispatch('editor:go-to-matching-bracket', editorCtx);
    expect(trigger).toHaveBeenCalledWith('keyboard', 'editor.action.jumpToBracket', null);
    resetActiveMonacoEditorForTests();
  });
});

describe('scoped bindings', () => {
  it('a scoped binding fires only when the cursor scope matches', () => {
    const { registry, runs } = testRegistry();
    // Rebind go-to-line to a scope: only inside a string.
    const overrides = [
      { command: 'lucid:go-to-line', keys: 'ctrl-g', scope: 'string.quoted' },
    ];
    const event = keyEvent('g', { ctrl: true });
    const stringScope = ['source.ts', 'meta.function', 'string.quoted.double'];
    expect(
      dispatchKeyEvent(event, 'editor', true, {
        registry,
        overrides,
        platform: 'darwin',
        scope: stringScope,
      }),
    ).toBe('lucid:go-to-line');
    expect(runs).toContain('lucid:go-to-line');

    // Same key, cursor in a comment: the binding does not fire.
    runs.length = 0;
    const commentScope = ['source.ts', 'meta.function', 'comment'];
    expect(
      dispatchKeyEvent(event, 'editor', true, {
        registry,
        overrides,
        platform: 'darwin',
        scope: commentScope,
      }),
    ).toBeNull();
    expect(runs).toEqual([]);
  });

  it('a scoped binding never fires without a descriptor (no tree)', () => {
    const { registry, runs } = testRegistry();
    const overrides = [
      { command: 'lucid:go-to-line', keys: 'ctrl-g', scope: 'string.quoted' },
    ];
    expect(
      dispatchKeyEvent(keyEvent('g', { ctrl: true }), 'editor', true, {
        registry,
        overrides,
        platform: 'darwin',
        scope: null,
      }),
    ).toBeNull();
    expect(runs).toEqual([]);
  });

  it('an unscoped binding is unaffected by the descriptor', () => {
    const { registry, runs } = testRegistry();
    expect(
      dispatchKeyEvent(keyEvent('g', { ctrl: true }), 'editor', true, {
        registry,
        platform: 'darwin',
        scope: ['source.ts', 'comment'],
      }),
    ).toBe('lucid:go-to-line');
    expect(runs).toContain('lucid:go-to-line');
  });

  it('a `*` scope fires even without a descriptor', () => {
    const { registry, runs } = testRegistry();
    const overrides = [
      { command: 'lucid:go-to-line', keys: 'ctrl-g', scope: '*' },
    ];
    expect(
      dispatchKeyEvent(keyEvent('g', { ctrl: true }), 'editor', true, {
        registry,
        overrides,
        platform: 'darwin',
        scope: null,
      }),
    ).toBe('lucid:go-to-line');
    expect(runs).toContain('lucid:go-to-line');
  });
});
