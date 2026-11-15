/**
 * Keymaps (Atom steal #13 — keymaps, 2026-11-14).
 *
 * Atom's shape, Lucid's size: a keymap is a list of bindings
 * — one command, one keystroke, an optional `when` context —
 * and the default keymap is the canonical list every surface
 * reads from: the application menu (electron/menu.ts) takes
 * its accelerators from here, the command palette shows the
 * same keys, and the renderer keydown handlers match against
 * the resolved map instead of hardcoding `e.metaKey && key`.
 *
 * Keystroke strings are Atom-shaped: modifiers joined with
 * `-`, then the key — `cmd-shift-p`, `ctrl-g`, `cmd-/`.
 * `cmd` is the platform command key (Meta on macOS, Ctrl
 * elsewhere); `ctrl` is always the Control key. A binding
 * with `when: 'inEditor'` only matches while the editor view
 * is active with a file open — that is what keeps Ctrl+G
 * (go-to-line) from stealing the terminal's readline Ctrl+G,
 * and what keeps Cmd+R (go-to-symbol) from ever firing in a
 * surface with no file.
 *
 * User overrides live in Settings (`customKeybindings`, a
 * list of the same binding shape) and are merged by
 * `resolveKeymap`: an override with the same command replaces
 * the default's keys; an override with the same keys and a
 * different command replaces the default's command (first
 * match wins, Atom's rule). A binding with `keys: ''`
 * (empty) unbinds the command. Nothing here touches the
 * terminal, the agent loop, or the driving intelligence.
 *
 * Scoped bindings (Atom steal #18): a binding may carry a
 * `scope` selector — it only fires when the cursor's scope
 * descriptor (see src/lib/scopeDescriptor.ts) matches it.
 */

import { scopeMatches, type ScopeDescriptor } from './scopeDescriptor';

export type KeymapWhen = 'inEditor' | 'inTerminal' | 'always';

export interface KeymapBinding {
  /** The command id (see src/lib/commandRegistry.ts for the
   *  `namespace:action` ids; terminal/editor ids are plain). */
  command: string;
  /** Atom-shaped keystroke: `cmd-shift-p`, `ctrl-g`, `cmd-/`.
   *  Empty string unbinds the command. */
  keys: string;
  /** Context the binding matches in. Default 'always'. */
  when?: KeymapWhen;
  /** Scope selector (Atom steal #18): when set, the binding
   *  only fires when the cursor's scope descriptor matches
   *  it — e.g. `comment` or `string.quoted`. Unset means
   *  every scope. The application menu never carries an
   *  accelerator for a scoped binding: main cannot know the
   *  cursor's scope, so the keydown path owns it. */
  scope?: string;
}

/**
 * The default keymap. These are the bindings the whole app
 * already had (palette ⌘⇧P, finder ⌘P, go-to-symbol ⌘R,
 * go-to-line Ctrl+G editor-only, split ⌘D, save ⌘S, help
 * ⌘/) plus the menu's own (new terminal tab ⌘T, find in
 * project ⌘⇧F) — written down once, in one place, so the
 * menu, the palette and the keydown handlers can never
 * disagree about them again.
 *
 * Two bindings are deliberately NOT here, even though the
 * keys do things in the editor: ⌘F is Monaco's own find
 * widget (the editor's find), and ⌘D in the editor is
 * Monaco's add-selection-to-next-find-match — the split
 * command's registry `when` (terminal view only) keeps
 * ⌘D from stealing it. The keymap only lists bindings
 * Lucid itself dispatches (see keymapDispatch.ts).
 */
export const DEFAULT_KEYMAP: KeymapBinding[] = [
  { command: 'lucid:command-palette', keys: 'cmd-shift-p' },
  { command: 'lucid:quick-open', keys: 'cmd-p' },
  { command: 'lucid:go-to-symbol', keys: 'cmd-r', when: 'inEditor' },
  { command: 'lucid:go-to-line', keys: 'ctrl-g', when: 'inEditor' },
  { command: 'terminal:new-tab', keys: 'cmd-t' },
  { command: 'terminal:split', keys: 'cmd-d' },
  { command: 'terminal:split-horizontal', keys: 'cmd-shift-d' },
  { command: 'file:save', keys: 'cmd-s', when: 'inEditor' },
  { command: 'help:open', keys: 'cmd-/' },
  { command: 'project:find-in-project', keys: 'cmd-shift-f' },
  { command: 'file:reopen-closed-tab', keys: 'cmd-shift-t' },
  { command: 'file:close', keys: 'cmd-w', when: 'inEditor' },
];

/**
 * The running platform, without assuming Node exists. The
 * keymap functions default to this — the main process has
 * `process.platform`, the renderer does not (it is a plain
 * web page; `process` is undefined there and a bare read
 * would throw on every keypress). The renderer reports
 * through `navigator.platform` ('MacIntel', 'Win32',
 * 'Linux x86_64'); when detection fails entirely the app
 * defaults to macOS, its first platform.
 *
 * Navigator wins when both exist: on one machine they agree,
 * and in a test env (jsdom) the navigator is the fake one the
 * test controls while `process` is the host's — preferring the
 * navigator keeps the renderer's keys Mac-shaped in tests.
 */
export function detectPlatform(): NodeJS.Platform {
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform ?? '';
    if (platform.startsWith('Mac')) return 'darwin';
    if (platform.startsWith('Win')) return 'win32';
    if (platform) return 'linux';
    // A navigator that reports nothing (jsdom): the app
    // defaults to macOS rather than the host's platform.
    return 'darwin';
  }
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform as NodeJS.Platform;
  }
  return 'darwin';
}

export interface KeymapContext {
  /** The active view ('terminal' | 'editor' | …). */
  view: string;
  /** Whether an editor file is active. */
  hasActiveFile: boolean;
}

interface ParsedKeystroke {
  cmd: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** Parse an Atom-shaped keystroke string into its parts.
 *  Returns null for an empty/unparseable string. */
export function parseKeystroke(keys: string): ParsedKeystroke | null {
  if (!keys) return null;
  const parts = keys.toLowerCase().split('-').filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  return {
    cmd: mods.has('cmd') || mods.has('command') || mods.has('meta'),
    ctrl: mods.has('ctrl') || mods.has('control'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
    key,
  };
}

/**
 * Does a keyboard event match a parsed keystroke? `cmd`
 * means Meta on macOS and Ctrl elsewhere; `ctrl` is always
 * the Control key. The key compares case-insensitively
 * (event.key for letters, '/' for '/', ' ' for space).
 */
export function eventMatchesKeystroke(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  parsed: ParsedKeystroke,
  platform: NodeJS.Platform = detectPlatform(),
): boolean {
  const isDarwin = platform === 'darwin';
  const cmdPressed = isDarwin ? event.metaKey : event.ctrlKey;
  if (parsed.cmd !== cmdPressed) return false;
  if (isDarwin) {
    // On macOS, Ctrl is its own physical key.
    if (parsed.ctrl !== event.ctrlKey) return false;
  }
  // Elsewhere Ctrl IS the command key, so a binding that also
  // asks for 'ctrl' names the same key 'cmd' already claimed —
  // it matches iff cmd matched (checked above).
  if (parsed.alt !== event.altKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return eventKey === parsed.key;
}

/** Does a binding's `when` hold in this context? */
export function bindingApplies(
  binding: KeymapBinding,
  context: KeymapContext,
): boolean {
  const when = binding.when ?? 'always';
  if (when === 'always') return true;
  if (when === 'inEditor') {
    return context.view === 'editor' && context.hasActiveFile;
  }
  return context.view === 'terminal';
}

/**
 * Merge user overrides onto the default keymap (Atom's rule:
 * first match wins, so an override replaces the default entry
 * it shares a command or a keystroke with). A binding with an
 * empty `keys` unbinds its command. Returns the resolved list
 * in default order, overrides first where they replaced one.
 */
export function resolveKeymap(
  overrides: KeymapBinding[],
): KeymapBinding[] {
  const resolved: KeymapBinding[] = [];
  const usedKeys = new Set<string>();
  const usedCommands = new Set<string>();
  const push = (binding: KeymapBinding) => {
    if (usedCommands.has(binding.command)) return;
    if (!binding.keys) {
      // Empty keys = an explicit unbind: the command is
      // claimed (so the default is blocked) but nothing is
      // added.
      usedCommands.add(binding.command);
      return;
    }
    const key = binding.keys.toLowerCase();
    // A keystroke already claimed by an earlier binding loses
    // outright — the default for this command still stands.
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    usedCommands.add(binding.command);
    resolved.push(binding);
  };
  for (const override of overrides) push(override);
  for (const binding of DEFAULT_KEYMAP) push(binding);
  return resolved;
}

/**
 * The resolved keymap entry for a command (default, or the
 * user's override), or undefined when the command is unbound.
 */
export function bindingForCommand(
  command: string,
  overrides: KeymapBinding[] = [],
): KeymapBinding | undefined {
  return resolveKeymap(overrides).find((b) => b.command === command);
}

/** Electron accelerator string for a command, e.g.
 *  `CmdOrCtrl+Shift+P` for `cmd-shift-p`. Undefined when the
 *  command has no binding — or when the binding is scoped
 *  (Atom steal #18): main cannot know the cursor's scope, so
 *  a scoped binding gets no menu accelerator at all and the
 *  renderer keydown path owns it. */
export function acceleratorForCommand(
  command: string,
  overrides: KeymapBinding[] = [],
): string | undefined {
  const binding = bindingForCommand(command, overrides);
  if (!binding) return undefined;
  if (binding.scope) return undefined;
  const parsed = parseKeystroke(binding.keys);
  if (!parsed) return undefined;
  const parts: string[] = [];
  if (parsed.cmd) parts.push('CmdOrCtrl');
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  const key =
    parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  parts.push(key);
  return parts.join('+');
}

/** Human display label for a command's keystroke, e.g.
 *  `⌘⇧P` on macOS, `Ctrl+Shift+P` elsewhere. Empty string
 *  when the command is unbound. */
export function keyLabelForCommand(
  command: string,
  overrides: KeymapBinding[] = [],
  platform: NodeJS.Platform = detectPlatform(),
): string {
  const binding = bindingForCommand(command, overrides);
  if (!binding) return '';
  const parsed = parseKeystroke(binding.keys);
  if (!parsed) return '';
  const isDarwin = platform === 'darwin';
  const key =
    parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  if (!isDarwin) {
    const parts: string[] = [];
    // cmd and ctrl are the same physical key off macOS.
    if (parsed.cmd || parsed.ctrl) parts.push('Ctrl');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    parts.push(key);
    return parts.join('+');
  }
  let label = '';
  if (parsed.ctrl) label += '⌃';
  if (parsed.alt) label += '⌥';
  if (parsed.shift) label += '⇧';
  if (parsed.cmd) label += '⌘';
  return label + key;
}

/**
 * Find the command a keyboard event dispatches to in this
 * context, or null. First resolved binding that matches the
 * event AND whose `when` holds AND whose `scope` selector
 * matches the cursor's scope descriptor wins. A scoped
 * binding never fires without a descriptor (no tree for the
 * file, or the engine down) — except `*`, which matches
 * anything.
 */
export function commandForKeyEvent(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  context: KeymapContext,
  overrides: KeymapBinding[] = [],
  platform: NodeJS.Platform = detectPlatform(),
  scope: ScopeDescriptor | null = null,
): string | null {
  for (const binding of resolveKeymap(overrides)) {
    if (!bindingApplies(binding, context)) continue;
    if (binding.scope && !scopeMatches(scope, binding.scope)) continue;
    const parsed = parseKeystroke(binding.keys);
    if (!parsed) continue;
    if (eventMatchesKeystroke(event, parsed, platform)) {
      return binding.command;
    }
  }
  return null;
}
