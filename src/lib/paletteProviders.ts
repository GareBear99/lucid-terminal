/**
 * Root Search providers.
 *
 * Turns Lucid's live sources into Root Search entries: the
 * command registry (adapted — every registry command is a
 * command of the `lucid` extension), the extension registry,
 * quicklinks, the warm project file index, open terminal tabs,
 * and the Settings sections. The entry builders are pure over
 * their inputs; only `collectLiveFileEntries` / the tab reader
 * touch stores, so tests inject fake files/tabs instead.
 *
 * Tab actions go through the existing tab APIs only
 * (useTerminalStore.setActiveTab / closeTab, splitPaneStore) —
 * never around them.
 */

import {
  commandRegistry,
  type CommandContext,
  type CommandRegistry,
} from './commandRegistry';
import {
  paletteExtensions,
  paletteQuicklinks,
  resolveQuicklink,
  type PaletteArgumentDef,
  type PaletteExtensionRegistry,
  type QuicklinkRegistry,
  type RootSearchEntry,
} from './paletteExtensions';
import { getProjectFileIndex } from './projectFileIndex';
import { fuzzyFilter } from './fuzzyMatch';
import type { TerminalTab } from '../types';

/**
 * Registry commands that open a view/modal (mode `view`); the
 * rest run with no UI pushed (mode `no-view`). The registry
 * itself does not say which is which — this is the list, kept
 * next to the commands it describes in builtinCommands.ts.
 */
export const VIEW_COMMAND_IDS = new Set([
  'lucid:quick-open',
  'lucid:go-to-symbol',
  'lucid:go-to-line',
  'lucid:go-to-project-symbol',
  'lucid:tutorials',
  'project:find-in-project',
  'git:open-panel',
]);

/**
 * The registry's commands as Root Search entries — the `lucid`
 * extension's commands. Hidden commands never list (the
 * registry's findCommands already excludes them); a command
 * whose `when` refuses this context is not valid here.
 */
export function registryCommandEntries(
  registry: CommandRegistry,
  ctx: CommandContext,
): RootSearchEntry[] {
  return registry.findCommands(ctx).map((def) => ({
    id: def.id,
    kind: 'command',
    title: def.title,
    subtitle: def.description,
    keywords: def.tags,
    commandId: def.id,
    extensionId: 'lucid',
    mode: VIEW_COMMAND_IDS.has(def.id) ? 'view' : 'no-view',
    right: def.keybinding,
    // Merge fix: dispatch returns Promise<boolean>; the entry's run
    // is void | Promise<void>, so await it and return nothing.
    run: async (runCtx) => {
      await registry.dispatch(def.id, runCtx);
    },
  }));
}

/** Extension-registered commands as Root Search entries. */
export function extensionCommandEntries(
  extensions: PaletteExtensionRegistry,
): RootSearchEntry[] {
  return extensions.commands().map((def) => ({
    id: def.id,
    kind: 'command',
    title: def.title,
    subtitle: def.subtitle ?? def.description,
    keywords: def.keywords,
    commandId: def.id,
    extensionId: def.extensionId,
    arguments: def.arguments,
    mode: def.mode,
    fromExtension: true,
    run: (ctx) => def.run(ctx, {}),
    runWithArgs: (ctx, args) => def.run(ctx, args),
  }));
}

/** The Settings sections, as Root Search entries (from SettingsPanel's tabs). */
export const PALETTE_SETTINGS_SECTIONS: { id: string; label: string; keywords: string[] }[] = [
  { id: 'appearance', label: 'Appearance', keywords: ['theme', 'color', 'font'] },
  { id: 'security', label: 'Security', keywords: ['password', 'lock', 'privacy'] },
  { id: 'permissions', label: 'Permissions', keywords: ['access', 'allow'] },
  { id: 'agent-permissions', label: 'Agent Permissions', keywords: ['agent', 'access', 'allow'] },
  { id: 'profile', label: 'Profile', keywords: ['account', 'user'] },
  { id: 'customization', label: 'Customization', keywords: ['keybindings', 'shortcuts'] },
  { id: 'plugins', label: 'Plugins', keywords: ['extensions', 'addons'] },
  { id: 'devices', label: 'Devices', keywords: ['hardware', 'usb'] },
  { id: 'forge', label: 'Forge', keywords: ['build'] },
  { id: 'modules', label: 'Modules', keywords: ['segments'] },
  { id: 'models', label: 'Models', keywords: ['llm', 'engine'] },
  { id: 'terminal', label: 'Terminal', keywords: ['shell', 'pty'] },
  { id: 'ai', label: 'AI', keywords: ['chat', 'copilot'] },
  { id: 'memory', label: 'Memory', keywords: ['history', 'recall'] },
  { id: 'daemon', label: 'Daemon', keywords: ['background'] },
  { id: 'general', label: 'General', keywords: ['logout', 'startup'] },
];

export function settingsEntries(
  switchView: (view: 'settings') => void,
): RootSearchEntry[] {
  return PALETTE_SETTINGS_SECTIONS.map((section) => ({
    id: `settings:${section.id}`,
    kind: 'setting',
    title: `Settings: ${section.label}`,
    subtitle: 'Settings',
    keywords: ['settings', section.label.toLowerCase(), ...section.keywords],
    run: () => switchView('settings'),
  }));
}

/**
 * A quicklink as a Root Search entry. Its `{argument name=…}`
 * placeholders become the entry's arguments, so the palette
 * prompts for them (Raycast: a quicklink with arguments asks
 * for the values when it runs).
 */
export function quicklinkEntries(
  quicklinks: QuicklinkRegistry,
  openQuicklink: (link: string) => void,
): RootSearchEntry[] {
  return quicklinks.visible().map((ql) => {
    const args: PaletteArgumentDef[] = [];
    const named = [...ql.link.matchAll(/\{argument\s+name="([^"]+)"\}/g)].map((m) => m[1]);
    for (const name of named) {
      if (!args.some((a) => a.name === name)) {
        args.push({ name, placeholder: name, type: 'text', required: true });
      }
    }
    if (/\{argument\}/.test(ql.link) && !args.some((a) => a.name === 'argument')) {
      args.push({ name: 'argument', placeholder: 'Query', type: 'text', required: true });
    }
    const runWith = (values: Record<string, string>): void => {
      const resolved = resolveQuicklink(ql.link, values);
      if (resolved.missing.length === 0) openQuicklink(resolved.url);
    };
    return {
      id: ql.id,
      kind: 'quicklink',
      title: ql.name,
      subtitle: ql.link,
      keywords: [...(ql.tags ?? []), 'quicklink', 'link'],
      link: ql.link,
      arguments: args.length > 0 ? args : undefined,
      run: () => runWith({}),
      runWithArgs: (_ctx, values) => runWith(values),
    };
  });
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** File paths as Root Search entries (the warm project index). */
export function fileEntries(
  files: string[],
  root: string,
  openFile: (path: string) => void,
): RootSearchEntry[] {
  return files.map((path) => {
    const rel = root && path.startsWith(root) ? path.slice(root.length).replace(/^\//, '') : path;
    return {
      id: path,
      kind: 'file',
      title: basename(path),
      subtitle: rel,
      keywords: [rel],
      filePath: path,
      run: () => openFile(path),
    };
  });
}

/**
 * The live file list for a query: the warm index, fuzzy-matched
 * and capped (the index can hold 5000 files — the palette never
 * ranks all of them per keystroke). Empty query: the active file
 * first, then the first 25.
 */
export function collectLiveFileEntries(
  query: string,
  activeFilePath: string | null,
  openFile: (path: string) => void,
): RootSearchEntry[] {
  const index = getProjectFileIndex();
  let files = index.files;
  if (query.trim() !== '') {
    files = fuzzyFilter(files, query.trim(), (p) => p).slice(0, 50);
  } else {
    files = files.slice(0, 25);
    if (activeFilePath && files.includes(activeFilePath)) {
      files = [activeFilePath, ...files.filter((f) => f !== activeFilePath)];
    }
  }
  return fileEntries(files, index.root, openFile);
}

/** Open terminal tabs as Root Search entries. */
export function tabEntries(
  tabs: TerminalTab[],
  switchTab: (tabId: string) => void,
): RootSearchEntry[] {
  return tabs.map((tab) => ({
    id: tab.id,
    kind: 'tab',
    title: tab.title,
    subtitle: tab.cwd,
    keywords: [tab.title, tab.cwd, 'terminal', 'tab'],
    tabId: tab.id,
    run: () => switchTab(tab.id),
  }));
}

/**
 * Open a quicklink target: a URL goes to the system browser
 * (the established openExternal path), a file path opens in
 * the workspace, anything else is handed to window.open.
 */
export function openQuicklinkTarget(
  link: string,
  openFile: (path: string) => void,
): void {
  if (/^https?:\/\//i.test(link)) {
    const openExternal = (window as unknown as { lucidAPI?: { browser?: { openExternal?: (url: string) => Promise<void> } } })
      .lucidAPI?.browser?.openExternal;
    if (openExternal) {
      void openExternal(link);
      return;
    }
    window.open(link, '_blank', 'noopener');
    return;
  }
  if (link.startsWith('/') || link.startsWith('~/')) {
    openFile(link);
    return;
  }
  window.open(link, '_blank', 'noopener');
}

/** The live registries, for the component's defaults. */
export function liveRegistries(): {
  registry: CommandRegistry;
  extensions: PaletteExtensionRegistry;
  quicklinks: QuicklinkRegistry;
} {
  return { registry: commandRegistry, extensions: paletteExtensions, quicklinks: paletteQuicklinks };
}
