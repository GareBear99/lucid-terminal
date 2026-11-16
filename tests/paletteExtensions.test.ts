/**
 * Palette extension / quick-action model tests.
 *
 * Raycast's model, from the official docs (developers.raycast.com,
 * fetched 2026-11-16 — Manifest, Arguments, Action Panel, Actions,
 * Terminology; manual.raycast.com — Root Search, Quicklinks):
 * - an Extension is a manifest (name/title/description/author) with
 *   commands; a Command has title/subtitle/description/mode
 *   (view | no-view | menu-bar)/keywords/arguments/disabledByDefault.
 * - arguments: max 3, types text/password/dropdown, required first.
 * - the Action Panel (⌘K) lists the actions for the selected item;
 *   first = primary (Enter), second = secondary (⌘Enter); actions
 *   group into sections; destructive actions are marked.
 * - Root Search ranks: exact alias > alias prefix > title fuzzy >
 *   subtitle/keyword > frecency; favorites pin to the top.
 * - Quicklinks are named URL/file/deeplink shortcuts with
 *   {argument name="..."} / {clipboard} / {date} placeholders.
 * - Deeplinks are lucid://extensions/<extension>/<command> here
 *   (Raycast's raycast://extensions/<author>/<extension>/<command>).
 *
 * This is Lucid's OWN implementation of that pattern — no Raycast
 * code, no @raycast/api, nothing here requires Raycast to work.
 *
 * These tests fail on unmodified cea360f (the module does not exist)
 * and pass with the module.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  PaletteExtensionRegistry,
  QuicklinkRegistry,
  PalettePersonalization,
  validateAlias,
  splitArgumentInput,
  resolveArguments,
  buildDeeplink,
  parseDeeplink,
  resolveQuicklink,
  evaluateCalculator,
  buildRootSearchEntries,
  getQuickActions,
  registerQuickAction,
  unregisterQuickAction,
  type PaletteCommandDef,
  type RootSearchEntry,
  type CommandContext,
} from '../src/lib/paletteExtensions';

const CTX: CommandContext = {
  view: 'terminal',
  hasActiveFile: false,
  hasOpenFiles: false,
  luciferAiEnabled: true,
  luciferAiSilenced: false,
};

function entry(over: Partial<RootSearchEntry> & { id: string; title: string }): RootSearchEntry {
  return {
    kind: 'command',
    run: () => {},
    ...over,
  };
}

describe('PaletteExtensionRegistry (Raycast manifest model)', () => {
  let registry: PaletteExtensionRegistry;

  beforeEach(() => {
    registry = new PaletteExtensionRegistry();
  });

  test('registers an extension and lists its commands with the extension id', () => {
    registry.registerExtension({
      id: 'notes',
      title: 'Notes',
      description: 'Take notes',
      author: 'lucid',
      commands: [
        { id: 'notes:new', title: 'New Note', mode: 'no-view', run: () => {} },
        { id: 'notes:search', title: 'Search Notes', mode: 'view', run: () => {} },
      ],
    });
    expect(registry.extensions().map((e) => e.id)).toEqual(['notes']);
    const cmds = registry.commands();
    expect(cmds.map((c) => c.id)).toEqual(['notes:new', 'notes:search']);
    expect(cmds[0].extensionId).toBe('notes');
  });

  test('duplicate command ids across extensions are rejected', () => {
    registry.registerExtension({
      id: 'a', title: 'A', commands: [{ id: 'x:run', title: 'Run', mode: 'no-view', run: () => {} }],
    });
    expect(() =>
      registry.registerExtension({
        id: 'b', title: 'B', commands: [{ id: 'x:run', title: 'Run again', mode: 'no-view', run: () => {} }],
      }),
    ).toThrow(/already registered/);
  });

  test('a command id must be namespace:action', () => {
    expect(() =>
      registry.registerExtension({
        id: 'a', title: 'A', commands: [{ id: 'not-namespaced', title: 'Bad', mode: 'no-view', run: () => {} }],
      }),
    ).toThrow(/namespace:action/);
  });

  test('more than 3 arguments is rejected (Raycast max is 3)', () => {
    const args = [1, 2, 3, 4].map((n) => ({ name: `a${n}`, type: 'text' as const }));
    expect(() =>
      registry.registerExtension({
        id: 'a', title: 'A',
        commands: [{ id: 'a:run', title: 'Run', mode: 'no-view', arguments: args, run: () => {} }],
      }),
    ).toThrow(/at most 3/);
  });

  test('a dropdown argument without data is rejected', () => {
    expect(() =>
      registry.registerExtension({
        id: 'a', title: 'A',
        commands: [{
          id: 'a:run', title: 'Run', mode: 'no-view',
          arguments: [{ name: 'color', type: 'dropdown' }],
          run: () => {},
        }],
      }),
    ).toThrow(/dropdown.*data/);
  });

  test('duplicate argument names are rejected', () => {
    expect(() =>
      registry.registerExtension({
        id: 'a', title: 'A',
        commands: [{
          id: 'a:run', title: 'Run', mode: 'no-view',
          arguments: [
            { name: 'q', type: 'text' },
            { name: 'q', type: 'text' },
          ],
          run: () => {},
        }],
      }),
    ).toThrow(/duplicate argument/);
  });

  test('disabledByDefault commands are hidden until enabled; Disable Command hides them', () => {
    registry.registerExtension({
      id: 'a', title: 'A',
      commands: [
        { id: 'a:opt', title: 'Opt-in', mode: 'no-view', disabledByDefault: true, run: () => {} },
        { id: 'a:on', title: 'On', mode: 'no-view', run: () => {} },
      ],
    });
    expect(registry.commands().map((c) => c.id)).toEqual(['a:on']);
    expect(registry.setCommandEnabled('a:opt', true)).toBe(true);
    expect(registry.commands().map((c) => c.id)).toContain('a:opt');
    expect(registry.setCommandEnabled('a:on', false)).toBe(true);
    expect(registry.commands().map((c) => c.id)).not.toContain('a:on');
    // Disabling hides from root search but the command still exists.
    expect(registry.getCommand('a:on')).toBeDefined();
  });

  test('disabling an extension hides all its commands; unregister removes them', () => {
    registry.registerExtension({
      id: 'a', title: 'A',
      commands: [{ id: 'a:run', title: 'Run', mode: 'no-view', run: () => {} }],
    });
    expect(registry.setExtensionEnabled('a', false)).toBe(true);
    expect(registry.commands()).toHaveLength(0);
    expect(registry.setExtensionEnabled('a', true)).toBe(true);
    expect(registry.commands()).toHaveLength(1);
    expect(registry.unregisterExtension('a')).toBe(true);
    expect(registry.commands()).toHaveLength(0);
    expect(registry.unregisterExtension('a')).toBe(false);
  });
});

describe('arguments', () => {
  const def: PaletteCommandDef = {
    id: 'a:run',
    title: 'Run',
    mode: 'view',
    arguments: [
      { name: 'title', placeholder: 'Title', type: 'text', required: true },
      { name: 'secret', placeholder: 'Secret', type: 'password' },
      {
        name: 'color', placeholder: 'Color', type: 'dropdown', required: true,
        data: [
          { title: 'Red', value: 'red' },
          { title: 'Green', value: 'green' },
        ],
      },
    ],
    run: () => {},
  };

  test('splitArgumentInput splits on spaces and keeps quoted groups', () => {
    expect(splitArgumentInput('hello "two words" third')).toEqual(['hello', 'two words', 'third']);
    expect(splitArgumentInput('  a  b ')).toEqual(['a', 'b']);
    expect(splitArgumentInput('')).toEqual([]);
  });

  test('resolveArguments accepts valid values', () => {
    const out = resolveArguments(def, { title: 'Hi', secret: 's', color: 'red' });
    expect(out.errors).toEqual([]);
    expect(out.values).toEqual({ title: 'Hi', secret: 's', color: 'red' });
  });

  test('resolveArguments reports a missing required argument', () => {
    const out = resolveArguments(def, { color: 'red' });
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toMatch(/Title.*required/);
  });

  test('resolveArguments rejects a dropdown value outside its data', () => {
    const out = resolveArguments(def, { title: 'Hi', color: 'blue' });
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toMatch(/blue.*not a valid/);
  });

  test('resolveArguments ignores unknown values and trims text', () => {
    const out = resolveArguments(def, { title: '  Hi  ', color: 'green', nope: 'x' });
    expect(out.errors).toEqual([]);
    expect(out.values.title).toBe('Hi');
    expect(out.values).not.toHaveProperty('nope');
  });
});

describe('deeplinks (lucid://extensions/<extension>/<command>)', () => {
  test('build/parse round-trip with arguments', () => {
    const url = buildDeeplink('notes', 'notes:new', { title: 'Hello world' });
    expect(url.startsWith('lucid://extensions/notes/new')).toBe(true);
    const parsed = parseDeeplink(url);
    expect(parsed).toEqual({
      extensionId: 'notes',
      commandId: 'notes:new',
      args: { title: 'Hello world' },
      fallbackText: undefined,
    });
  });

  test('parse returns null for anything that is not a lucid extension deeplink', () => {
    expect(parseDeeplink('raycast://extensions/raycast/calendar/my-schedule')).toBeNull();
    expect(parseDeeplink('https://example.com/x')).toBeNull();
    expect(parseDeeplink('lucid://extensions/notes')).toBeNull();
    expect(parseDeeplink('lucid://extensions/notes/new/extra')).toBeNull();
    expect(parseDeeplink('lucid://extensions/notes/new?arguments=not-json{')).toBeNull();
  });

  test('fallbackText survives the round-trip', () => {
    const url = buildDeeplink('notes', 'notes:search', undefined, 'hello');
    expect(parseDeeplink(url)?.fallbackText).toBe('hello');
  });
});

describe('quicklinks', () => {
  test('resolveQuicklink substitutes {argument name="..."} and encodes the value', () => {
    const out = resolveQuicklink('https://google.com/search?q={argument name="query"}', { query: 'hello world' });
    expect(out.url).toBe('https://google.com/search?q=hello%20world');
    expect(out.missing).toEqual([]);
  });

  test('resolveQuicklink substitutes a bare {argument} from the first value', () => {
    const out = resolveQuicklink('https://duckduckgo.com/?q={argument}', { argument: 'cats' });
    expect(out.url).toBe('https://duckduckgo.com/?q=cats');
  });

  test('resolveQuicklink substitutes {clipboard} and {date}', () => {
    const date = new Date(2026, 10, 16);
    const out = resolveQuicklink('https://example.com/{date}?c={clipboard}', {}, { clipboard: 'copied text', date });
    expect(out.url).toBe('https://example.com/2026-11-16?c=copied%20text');
  });

  test('resolveQuicklink reports a missing named argument instead of guessing', () => {
    const out = resolveQuicklink('https://github.com/{argument name="org"}/{argument name="repo"}', { org: 'acme' });
    expect(out.missing).toEqual(['repo']);
    expect(out.url).toContain('{argument name="repo"}');
  });

  test('QuicklinkRegistry hides hidden quicklinks from root search but keeps them', () => {
    const qls = new QuicklinkRegistry();
    qls.register({ id: 'q1', name: 'Docs', link: 'https://example.com' });
    qls.register({ id: 'q2', name: 'Secret', link: 'https://example.com/s', hiddenInRootSearch: true });
    expect(qls.all()).toHaveLength(2);
    expect(qls.visible().map((q) => q.id)).toEqual(['q1']);
    expect(() => qls.register({ id: 'q1', name: 'Dup', link: 'https://x.com' })).toThrow(/already registered/);
    expect(qls.setHidden('q1', true)).toBe(true);
    expect(qls.visible()).toHaveLength(0);
  });
});

describe('aliases (Raycast: lowercase a-z 0-9 spaces, strict prefix, not fuzzy)', () => {
  test('validateAlias accepts lowercase words and rejects the rest', () => {
    expect(validateAlias('gc')).toBeNull();
    expect(validateAlias('go compose')).toBeNull();
    expect(validateAlias('GC')).toMatch(/lowercase/);
    expect(validateAlias('go!')).toMatch(/lowercase/);
    expect(validateAlias('')).toMatch(/empty/);
  });

  test('PalettePersonalization stores aliases lowercased and finds by alias', () => {
    const p = new PalettePersonalization();
    expect(p.setAlias('cmd:open', 'GO')).toBeNull();
    expect(p.getAlias('cmd:open')).toBe('go');
    expect(p.findByAlias('go')).toBe('cmd:open');
    expect(p.findByAlias('g')).toBeUndefined();
    expect(p.setAlias('cmd:open', 'bad!')).toMatch(/lowercase/);
    expect(p.getAlias('cmd:open')).toBe('go');
    p.deleteAlias('cmd:open');
    expect(p.getAlias('cmd:open')).toBeUndefined();
  });
});

describe('calculator (inline in root search, no eval)', () => {
  test('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateCalculator('2+3*4')?.result).toBe(14);
    expect(evaluateCalculator('(2+3)*4')?.result).toBe(20);
    expect(evaluateCalculator('10 / 4')?.result).toBe(2.5);
    expect(evaluateCalculator('50%')?.result).toBe(0.5);
    expect(evaluateCalculator('2.5 * 2')?.result).toBe(5);
  });

  test('rejects anything that is not a plain expression — never evaluates code', () => {
    expect(evaluateCalculator('hello')).toBeNull();
    expect(evaluateCalculator('1+1; process.exit()')).toBeNull();
    expect(evaluateCalculator('constructor')).toBeNull();
    expect(evaluateCalculator('1/0')).toBeNull();
    expect(evaluateCalculator('42')).toBeNull();
    expect(evaluateCalculator('')).toBeNull();
    expect(evaluateCalculator('2+')).toBeNull();
  });
});

describe('root search ranking (Raycast order: alias exact > alias prefix > title fuzzy > subtitle/keyword > frecency)', () => {
  test('an exact alias match outranks a better title fuzzy match', () => {
    const p = new PalettePersonalization();
    p.setAlias('cmd:chrome', 'gc');
    const entries = [
      entry({ id: 'cmd:calculator', title: 'Calculator' }),
      entry({ id: 'cmd:chrome', title: 'Google Chrome' }),
    ];
    const ranked = buildRootSearchEntries(
      { commands: entries, quicklinks: [], files: [], tabs: [], settings: [] },
      'gc', p,
    );
    expect(ranked[0].id).toBe('cmd:chrome');
  });

  test('an alias prefix match outranks a title fuzzy match', () => {
    const p = new PalettePersonalization();
    p.setAlias('cmd:chrome', 'gc');
    const entries = [
      entry({ id: 'cmd:git-commit', title: 'Git Commit' }),
      entry({ id: 'cmd:chrome', title: 'Google Chrome' }),
    ];
    const ranked = buildRootSearchEntries(
      { commands: entries, quicklinks: [], files: [], tabs: [], settings: [] },
      'g', p,
    );
    expect(ranked[0].id).toBe('cmd:chrome');
  });

  test('a title fuzzy match outranks a keyword-only match', () => {
    const p = new PalettePersonalization();
    const entries = [
      entry({ id: 'cmd:kw', title: 'Unrelated', keywords: ['terminal'] }),
      entry({ id: 'cmd:title', title: 'Terminal Tab' }),
    ];
    const ranked = buildRootSearchEntries(
      { commands: entries, quicklinks: [], files: [], tabs: [], settings: [] },
      'term', p,
    );
    expect(ranked[0].id).toBe('cmd:title');
  });

  test('frecency breaks ties between equal fuzzy matches', () => {
    const p = new PalettePersonalization();
    const entries = [
      entry({ id: 'cmd:a', title: 'Open File' }),
      entry({ id: 'cmd:b', title: 'Open File' }),
    ];
    p.recordUse('cmd:b');
    p.recordUse('cmd:b');
    const ranked = buildRootSearchEntries(
      { commands: entries, quicklinks: [], files: [], tabs: [], settings: [] },
      'open', p,
    );
    expect(ranked[0].id).toBe('cmd:b');
  });

  test('an empty query puts favorites first, in favorite order', () => {
    const p = new PalettePersonalization();
    p.addFavorite('cmd:b');
    p.addFavorite('cmd:a');
    const entries = [
      entry({ id: 'cmd:a', title: 'Alpha' }),
      entry({ id: 'cmd:b', title: 'Beta' }),
      entry({ id: 'cmd:c', title: 'Gamma' }),
    ];
    const ranked = buildRootSearchEntries(
      { commands: entries, quicklinks: [], files: [], tabs: [], settings: [] },
      '', p,
    );
    expect(ranked.slice(0, 2).map((e) => e.id)).toEqual(['cmd:b', 'cmd:a']);
    expect(ranked[0].section).toBe('Favorites');
    expect(ranked[2].section).toBe('Commands');
  });

  test('a calculator expression becomes the first entry', () => {
    const p = new PalettePersonalization();
    const copied: string[] = [];
    const ranked = buildRootSearchEntries(
      { commands: [entry({ id: 'cmd:a', title: 'Alpha' })], quicklinks: [], files: [], tabs: [], settings: [] },
      '2+3*4', p, { copyText: (t) => { copied.push(t); } },
    );
    expect(ranked[0].kind).toBe('calculator');
    expect(ranked[0].title).toContain('14');
  });

  test('entries carry their kind section; ranking stays one list across kinds', () => {
    const p = new PalettePersonalization();
    const ranked = buildRootSearchEntries({
      commands: [entry({ id: 'c1', title: 'Settings Search' })],
      quicklinks: [entry({ id: 'q1', kind: 'quicklink', title: 'Settings Docs' })],
      files: [entry({ id: 'f1', kind: 'file', title: 'settings.ts' })],
      tabs: [entry({ id: 't1', kind: 'tab', title: 'Settings Tab' })],
      settings: [entry({ id: 's1', kind: 'setting', title: 'Settings: Appearance' })],
    }, 'settings', p);
    expect(ranked).toHaveLength(5);
    expect(ranked.map((e) => e.section).sort()).toEqual([
      'Commands', 'Files', 'Quicklinks', 'Settings', 'Tabs',
    ]);
    // And an exact alias on a file outranks a fuzzy command match:
    // ranking is one list, not grouped by kind.
    p.setAlias('f1', 'set');
    const ranked2 = buildRootSearchEntries({
      commands: [entry({ id: 'c1', title: 'Settings Search' })],
      quicklinks: [],
      files: [entry({ id: 'f1', kind: 'file', title: 'settings.ts' })],
      tabs: [],
      settings: [],
    }, 'set', p);
    expect(ranked2[0].id).toBe('f1');
  });
});

describe('quick actions (the ⌘K Action Panel)', () => {
  const deps = {
    copyText: vi.fn(),
    toggleFavorite: vi.fn(),
    setAlias: vi.fn(),
    disableCommand: vi.fn(),
    runCommand: vi.fn(),
    openFile: vi.fn(),
    revealFile: vi.fn(),
    switchTab: vi.fn(),
    closeTab: vi.fn(),
    searchProject: vi.fn(),
    openQuicklink: vi.fn(),
    deleteQuicklink: vi.fn(),
    toggleQuicklinkHidden: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('a command gets Run (primary), Copy Deeplink, Favorite, Set Alias, Disable', () => {
    const actions = getQuickActions(
      { kind: 'command', id: 'lucid:quick-open', title: 'Quick Open…', commandId: 'lucid:quick-open', extensionId: 'lucid', canDisable: true },
      CTX, deps,
    );
    const titles = actions.map((a) => a.title);
    expect(titles[0]).toBe('Run Command');
    expect(titles).toContain('Copy Deeplink');
    expect(titles).toContain('Add to Favorites');
    expect(titles).toContain('Set Alias…');
    expect(titles).toContain('Disable Command');
    expect(actions[0].section).toBe('Actions');
  });

  test('a favorited command offers Remove from Favorites instead', () => {
    const actions = getQuickActions(
      { kind: 'command', id: 'x:y', title: 'X', commandId: 'x:y', favorite: true },
      CTX, deps,
    );
    expect(actions.map((a) => a.title)).toContain('Remove from Favorites');
    expect(actions.map((a) => a.title)).not.toContain('Add to Favorites');
  });

  test('a file gets Open, Copy Path, Copy Name, Reveal in Finder — no destructive action by default', () => {
    const actions = getQuickActions(
      { kind: 'file', id: '/a/b.ts', title: 'b.ts', filePath: '/a/b.ts' },
      CTX, deps,
    );
    const titles = actions.map((a) => a.title);
    expect(titles[0]).toBe('Open File');
    expect(titles).toContain('Copy Path');
    expect(titles).toContain('Copy Name');
    expect(titles).toContain('Reveal in Finder');
    expect(actions.some((a) => a.destructive)).toBe(false);
  });

  test('a tab gets Switch (primary) and Close (destructive)', () => {
    const actions = getQuickActions(
      { kind: 'tab', id: 'tab-1', title: 'Tab 1', tabId: 'tab-1' },
      CTX, deps,
    );
    expect(actions[0].title).toBe('Switch to Tab');
    const close = actions.find((a) => a.title === 'Close Tab');
    expect(close?.destructive).toBe(true);
  });

  test('a text selection gets Copy and Search in Project', () => {
    const actions = getQuickActions(
      { kind: 'text', id: 'sel', title: 'selected text', text: 'hello' },
      CTX, deps,
    );
    expect(actions.map((a) => a.title)).toEqual(['Copy Text', 'Search in Project']);
  });

  test('a quicklink gets Open, Copy Link, Hide, Delete (destructive)', () => {
    const actions = getQuickActions(
      { kind: 'quicklink', id: 'q1', title: 'Docs', link: 'https://example.com' },
      CTX, deps,
    );
    const titles = actions.map((a) => a.title);
    expect(titles[0]).toBe('Open Quicklink');
    expect(titles).toContain('Copy Link');
    expect(titles).toContain('Delete Quicklink');
    expect(actions.find((a) => a.title === 'Delete Quicklink')?.destructive).toBe(true);
  });

  test('actions whose dependency is missing are omitted, not broken', () => {
    const actions = getQuickActions(
      { kind: 'file', id: '/a/b.ts', title: 'b.ts', filePath: '/a/b.ts' },
      CTX, {},
    );
    // No copy/open/reveal hooks → no file actions at all.
    expect(actions).toHaveLength(0);
  });

  test('extensions can register their own quick actions for a kind', () => {
    registerQuickAction('file', {
      id: 'test:count-lines',
      title: 'Count Lines',
      run: () => {},
    });
    const actions = getQuickActions(
      { kind: 'file', id: '/a/b.ts', title: 'b.ts', filePath: '/a/b.ts' },
      CTX, deps,
    );
    expect(actions.map((a) => a.title)).toContain('Count Lines');
    unregisterQuickAction('file', 'test:count-lines');
  });

  test('running a quick action calls the dependency with the selection', async () => {
    const actions = getQuickActions(
      { kind: 'tab', id: 'tab-1', title: 'Tab 1', tabId: 'tab-1' },
      CTX, deps,
    );
    await actions[0].run({ kind: 'tab', id: 'tab-1', title: 'Tab 1', tabId: 'tab-1' }, CTX);
    expect(deps.switchTab).toHaveBeenCalledWith('tab-1');
  });
});
