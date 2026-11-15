/**
 * The built-in palette commands (Atom steal #1 — 2026-11-14).
 *
 * Atom's palette lists every command valid at the focus point —
 * and in Atom, *everything* is a command, so the palette is
 * the discoverability cheat-sheet. Lucid's built-ins are the
 * same shape: view switches, editor actions, terminal actions,
 * and the four Atom modals themselves. The handlers come from
 * App (which owns the view state); the registry stays DOM-free
 * and the store calls below are the same actions the slash
 * commands and buttons call — the palette adds no new powers,
 * it only lists them.
 *
 * Registration is idempotent per handler set: App calls this
 * once at startup. Tests pass their own registry.
 */

import {
  commandRegistry,
  type CommandRegistry,
  type CommandContext,
} from '../lib/commandRegistry';
import { useFileStore } from '../stores/fileStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useSplitPaneStore } from '../stores/splitPaneStore';
import { useModalStore, type AtomModalKind } from '../stores/modalStore';
import type { View } from '../types';

export interface BuiltinCommandHandlers {
  switchView: (view: View) => void;
  toggleAI: () => void;
  openHelp: () => void;
}

const inEditor = (ctx: CommandContext) => ctx.hasActiveFile;
const inTerminal = (ctx: CommandContext) => ctx.view === 'terminal';
const notView = (view: View) => (ctx: CommandContext) => ctx.view !== view;
const luciferOn = (ctx: CommandContext) => ctx.luciferAiEnabled;

export function registerBuiltinCommands(
  handlers: BuiltinCommandHandlers,
  registry: CommandRegistry = commandRegistry,
): void {
  const openModal = (kind: AtomModalKind) => () => {
    useModalStore.getState().open(kind);
  };

  // The four Atom modals themselves.
  registry.register({
    id: 'lucid:command-palette',
    title: 'Command Palette',
    description: 'Show all commands',
    keybinding: '⌘⇧P',
    hiddenInCommandPalette: true,
    run: openModal('palette'),
  });
  registry.register({
    id: 'lucid:quick-open',
    title: 'Quick Open…',
    description: 'Fuzzy-open a file in the project',
    tags: ['file', 'open', 'find', 'fuzzy'],
    keybinding: '⌘P',
    run: openModal('finder'),
  });
  registry.register({
    id: 'lucid:go-to-symbol',
    title: 'Go to Symbol in File…',
    description: 'Jump to a definition in the active file',
    tags: ['symbol', 'function', 'outline', 'jump'],
    keybinding: '⌘R',
    when: inEditor,
    run: openModal('symbols'),
  });
  registry.register({
    id: 'lucid:go-to-line',
    title: 'Go to Line…',
    description: 'Jump to a line (or line:column) in the active file',
    tags: ['line', 'jump', 'goto'],
    keybinding: 'Ctrl-G',
    when: inEditor,
    run: openModal('goto-line'),
  });

  // View switches — one command per view, like Atom's
  // `pane:*` / `window:*` commands. The current view is not
  // listed (switching to where you already are is not a
  // command worth showing).
  const views: { view: View; title: string; description: string }[] = [
    { view: 'terminal', title: 'Switch to Terminal', description: 'Show the terminal' },
    { view: 'editor', title: 'Switch to Editor', description: 'Show the code editor' },
    { view: 'settings', title: 'Switch to Settings', description: 'Show Settings' },
    { view: 'synth', title: 'Switch to Synth', description: 'Show the Synth' },
    { view: 'forge', title: 'Switch to Forge', description: 'Show the Forge' },
    { view: 'persona-plex', title: 'Switch to Persona Plex', description: 'Show the Persona Plex' },
  ];
  for (const { view, title, description } of views) {
    registry.register({
      id: `view:${view}`,
      title,
      description,
      tags: ['switch', 'view', 'go'],
      when: notView(view),
      run: () => handlers.switchView(view),
    });
  }

  registry.register({
    id: 'ai:toggle-panel',
    title: 'Toggle AI Panel',
    description: 'Show or hide the AI Chat panel',
    tags: ['ai', 'chat', 'copilot', 'panel'],
    run: () => handlers.toggleAI(),
  });
  registry.register({
    id: 'help:open',
    title: 'Open Help',
    description: 'Show the Help modal',
    tags: ['help', 'docs', 'commands'],
    when: luciferOn,
    run: () => handlers.openHelp(),
  });

  // Editor actions.
  registry.register({
    id: 'file:save',
    title: 'Save File',
    description: 'Save the active file',
    tags: ['save', 'write', 'file'],
    keybinding: '⌘S',
    when: inEditor,
    run: async () => {
      const path = useFileStore.getState().activeFilePath;
      if (path) await useFileStore.getState().saveFile(path);
    },
  });
  registry.register({
    id: 'files:open',
    title: 'Open Files View',
    description: 'Show the Files view (the /file command)',
    tags: ['files', 'explorer', 'editor', 'open'],
    run: () => handlers.switchView('editor'),
  });

  // Terminal actions — the same store calls the /split,
  // /unsplit and new-tab paths use, so the palette, the pill
  // and the slash commands all do the same thing.
  registry.register({
    id: 'terminal:new-tab',
    title: 'New Terminal Tab',
    description: 'Open a new terminal tab',
    tags: ['terminal', 'tab', 'new', 'shell'],
    run: async () => {
      await useTerminalStore.getState().createTab();
      handlers.switchView('terminal');
    },
  });
  registry.register({
    id: 'terminal:split',
    title: 'Split Terminal',
    description: 'Split the active terminal tab (the /split command)',
    tags: ['split', 'pane', 'terminal'],
    keybinding: '⌘D',
    when: inTerminal,
    run: async () => {
      const tabId = useTerminalStore.getState().activeTabId;
      if (tabId) await useSplitPaneStore.getState().splitTab(tabId);
    },
  });
  registry.register({
    id: 'terminal:unsplit',
    title: 'Unsplit Terminal',
    description: 'Close the other panes (the /unsplit command)',
    tags: ['unsplit', 'pane', 'terminal'],
    when: inTerminal,
    run: () => {
      const tabId = useTerminalStore.getState().activeTabId;
      if (tabId) useSplitPaneStore.getState().unsplitTab(tabId);
    },
  });
}
