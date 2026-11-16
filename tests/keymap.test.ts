/**
 * Keymap tests (keymaps).
 *
 * The keymap is the one canonical list of bindings: the
 * application menu takes its accelerators from here, the
 * palette shows the same keys, and the renderer matches
 * keydown events against the resolved map. These tests pin
 * the parse/match/resolve rules — including the platform
 * split (`cmd` is Meta on macOS, Ctrl elsewhere) and the
 * `when` contexts that keep Ctrl+G out of the terminal.
 *
 * Run with: npx vitest run tests/keymap.test.ts
 */
import { describe, test, expect } from 'vitest';
import {
  parseKeystroke,
  eventMatchesKeystroke,
  bindingApplies,
  resolveKeymap,
  bindingForCommand,
  acceleratorForCommand,
  keyLabelForCommand,
  commandForKeyEvent,
  DEFAULT_KEYMAP,
} from '../src/lib/keymap';

const darwinEvent = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key,
  metaKey: mods.metaKey ?? false,
  ctrlKey: mods.ctrlKey ?? false,
  altKey: mods.altKey ?? false,
  shiftKey: mods.shiftKey ?? false,
});

describe('parseKeystroke', () => {
  test('parses modifiers and the key', () => {
    expect(parseKeystroke('cmd-shift-p')).toEqual({
      cmd: true,
      ctrl: false,
      alt: false,
      shift: true,
      key: 'p',
    });
    expect(parseKeystroke('ctrl-g')).toEqual({
      cmd: false,
      ctrl: true,
      alt: false,
      shift: false,
      key: 'g',
    });
    expect(parseKeystroke('cmd-/')).toEqual({
      cmd: true,
      ctrl: false,
      alt: false,
      shift: false,
      key: '/',
    });
  });

  test('empty string does not parse', () => {
    expect(parseKeystroke('')).toBeNull();
  });
});

describe('eventMatchesKeystroke', () => {
  test('cmd is Meta on macOS', () => {
    const parsed = parseKeystroke('cmd-p')!;
    expect(
      eventMatchesKeystroke(darwinEvent('p', { metaKey: true }), parsed, 'darwin'),
    ).toBe(true);
    expect(
      eventMatchesKeystroke(darwinEvent('p', { ctrlKey: true }), parsed, 'darwin'),
    ).toBe(false);
  });

  test('cmd is Ctrl off macOS', () => {
    const parsed = parseKeystroke('cmd-p')!;
    expect(
      eventMatchesKeystroke(darwinEvent('p', { ctrlKey: true }), parsed, 'linux'),
    ).toBe(true);
    expect(
      eventMatchesKeystroke(darwinEvent('p', { metaKey: true }), parsed, 'linux'),
    ).toBe(false);
  });

  test('extra modifiers do not match', () => {
    const parsed = parseKeystroke('cmd-p')!;
    expect(
      eventMatchesKeystroke(
        darwinEvent('p', { metaKey: true, shiftKey: true }),
        parsed,
        'darwin',
      ),
    ).toBe(false);
  });

  test('key compares case-insensitively', () => {
    const parsed = parseKeystroke('cmd-r')!;
    expect(
      eventMatchesKeystroke(darwinEvent('R', { metaKey: true }), parsed, 'darwin'),
    ).toBe(true);
  });
});

describe('bindingApplies', () => {
  test('inEditor needs the editor view and an active file', () => {
    const binding = { command: 'lucid:go-to-symbol', keys: 'cmd-r', when: 'inEditor' as const };
    expect(bindingApplies(binding, { view: 'editor', hasActiveFile: true })).toBe(true);
    expect(bindingApplies(binding, { view: 'terminal', hasActiveFile: true })).toBe(false);
    expect(bindingApplies(binding, { view: 'editor', hasActiveFile: false })).toBe(false);
  });
});

describe('resolveKeymap', () => {
  test('defaults are all present, in order', () => {
    const resolved = resolveKeymap([]);
    expect(resolved).toEqual(DEFAULT_KEYMAP);
    expect(bindingForCommand('lucid:go-to-symbol')?.keys).toBe('cmd-r');
    // PaneAxis: the horizontal split rides on
    // ⌘⇧D, beside the vertical split on ⌘D.
    expect(bindingForCommand('terminal:split')?.keys).toBe('cmd-d');
    expect(bindingForCommand('terminal:split-horizontal')?.keys).toBe('cmd-shift-d');
    // Keymaps wiring: save is the registry's
    // `file:save`, not a separate `editor:save` — the keymap
    // and the registry must name the same command, or the
    // dispatcher finds a key with no command behind it.
    expect(bindingForCommand('file:save')?.keys).toBe('cmd-s');
    expect(bindingForCommand('editor:save')).toBeUndefined();
    // ⌘F is Monaco's own find widget, not a Lucid command —
    // it has no keymap entry.
    expect(bindingForCommand('file:find-in-file')).toBeUndefined();
    expect(bindingForCommand('file:close')?.keys).toBe('cmd-w');
    expect(bindingForCommand('file:reopen-closed-tab')?.keys).toBe('cmd-shift-t');
  });

  test('an override replaces the default keys for its command', () => {
    const resolved = resolveKeymap([
      { command: 'lucid:go-to-symbol', keys: 'cmd-shift-r' },
    ]);
    expect(bindingForCommand('lucid:go-to-symbol', [
      { command: 'lucid:go-to-symbol', keys: 'cmd-shift-r' },
    ])?.keys).toBe('cmd-shift-r');
    expect(resolved.filter((b) => b.command === 'lucid:go-to-symbol')).toHaveLength(1);
  });

  test('an override reusing a keystroke replaces the default command on it', () => {
    const resolved = resolveKeymap([
      { command: 'lucid:quick-open', keys: 'cmd-r' },
    ]);
    expect(resolved.filter((b) => b.keys === 'cmd-r')).toHaveLength(1);
    expect(resolved.find((b) => b.keys === 'cmd-r')?.command).toBe(
      'lucid:quick-open',
    );
    expect(resolved.some((b) => b.command === 'lucid:go-to-symbol')).toBe(false);
  });

  test('empty keys unbinds the command', () => {
    expect(
      bindingForCommand('lucid:go-to-symbol', [
        { command: 'lucid:go-to-symbol', keys: '' },
      ]),
    ).toBeUndefined();
  });
});

describe('acceleratorForCommand / keyLabelForCommand', () => {
  test('accelerators are Electron-shaped', () => {
    expect(acceleratorForCommand('lucid:command-palette')).toBe('CmdOrCtrl+Shift+P');
    expect(acceleratorForCommand('lucid:quick-open')).toBe('CmdOrCtrl+P');
    expect(acceleratorForCommand('lucid:go-to-symbol')).toBe('CmdOrCtrl+R');
    expect(acceleratorForCommand('lucid:go-to-line')).toBe('Ctrl+G');
    expect(acceleratorForCommand('help:open')).toBe('CmdOrCtrl+/');
    expect(acceleratorForCommand('terminal:new-tab')).toBe('CmdOrCtrl+T');
    expect(acceleratorForCommand('no:such-command')).toBeUndefined();
  });

  test('labels are macOS glyphs on darwin, words elsewhere', () => {
    expect(keyLabelForCommand('lucid:command-palette', [], 'darwin')).toBe('⇧⌘P');
    expect(keyLabelForCommand('lucid:go-to-symbol', [], 'darwin')).toBe('⌘R');
    expect(keyLabelForCommand('lucid:go-to-line', [], 'darwin')).toBe('⌃G');
    expect(keyLabelForCommand('lucid:command-palette', [], 'linux')).toBe('Ctrl+Shift+P');
    expect(keyLabelForCommand('lucid:go-to-line', [], 'linux')).toBe('Ctrl+G');
    expect(keyLabelForCommand('no:such-command', [], 'darwin')).toBe('');
  });
});

describe('commandForKeyEvent', () => {
  test('dispatches the palette on ⌘⇧P', () => {
    expect(
      commandForKeyEvent(
        darwinEvent('P', { metaKey: true, shiftKey: true }),
        { view: 'terminal', hasActiveFile: false },
        [],
        'darwin',
      ),
    ).toBe('lucid:command-palette');
  });

  test('go-to-symbol does not dispatch outside the editor', () => {
    expect(
      commandForKeyEvent(
        darwinEvent('r', { metaKey: true }),
        { view: 'terminal', hasActiveFile: true },
        [],
        'darwin',
      ),
    ).toBeNull();
    expect(
      commandForKeyEvent(
        darwinEvent('r', { metaKey: true }),
        { view: 'editor', hasActiveFile: true },
        [],
        'darwin',
      ),
    ).toBe('lucid:go-to-symbol');
  });

  test('go-to-line dispatches on Ctrl+G in the editor only', () => {
    expect(
      commandForKeyEvent(
        darwinEvent('g', { ctrlKey: true }),
        { view: 'editor', hasActiveFile: true },
        [],
        'darwin',
      ),
    ).toBe('lucid:go-to-line');
    expect(
      commandForKeyEvent(
        darwinEvent('g', { ctrlKey: true }),
        { view: 'terminal', hasActiveFile: true },
        [],
        'darwin',
      ),
    ).toBeNull();
  });

  test('an override rebinds the key', () => {
    expect(
      commandForKeyEvent(
        darwinEvent('r', { metaKey: true, shiftKey: true }),
        { view: 'editor', hasActiveFile: true },
        [{ command: 'lucid:go-to-symbol', keys: 'cmd-shift-r' }],
        'darwin',
      ),
    ).toBe('lucid:go-to-symbol');
  });

  test('a scoped binding gets no menu accelerator', () => {
    // Main cannot know the cursor's scope, so the menu must
    // not carry an accelerator that would fire regardless of
    // scope — the renderer keydown path owns scoped bindings.
    expect(
      acceleratorForCommand('lucid:go-to-line', [
        { command: 'lucid:go-to-line', keys: 'ctrl-g', scope: 'string.quoted' },
      ]),
    ).toBeUndefined();
    // Unscoped: the accelerator is there as before.
    expect(acceleratorForCommand('lucid:go-to-line')).toBe('Ctrl+G');
  });

  test('commandForKeyEvent honours a scope selector', () => {
    const ctx = { view: 'editor', hasActiveFile: true };
    const overrides = [
      { command: 'lucid:go-to-line', keys: 'ctrl-g', scope: 'comment' },
    ];
    expect(
      commandForKeyEvent(
        darwinEvent('g', { ctrlKey: true }),
        ctx,
        overrides,
        'darwin',
        ['source.ts', 'comment'],
      ),
    ).toBe('lucid:go-to-line');
    expect(
      commandForKeyEvent(
        darwinEvent('g', { ctrlKey: true }),
        ctx,
        overrides,
        'darwin',
        ['source.ts', 'meta.function'],
      ),
    ).toBeNull();
  });
});
