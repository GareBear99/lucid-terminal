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
import { useFindReplaceStore } from '../stores/findReplaceStore';
import { getEngineClient } from './engineClient';
import { checkBrainStatus } from './brainAlive';
import { getActiveMonacoEditor } from './editorHandle';
import { popJumpPosition } from './jumpStack';
import { requestEditorJump } from './editorJump';
import { useDockStore } from '../stores/dockStore';
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
  // Project symbols (Atom steal #22): the tree-sitter index of
  // the whole project — no ctags, no `tags` file. No keybinding
  // — the palette is the entry point, as Atom's was.
  registry.register({
    id: 'lucid:go-to-project-symbol',
    title: 'Go to Symbol in Project…',
    description: 'Jump to a definition anywhere in the project (tree-sitter index)',
    tags: ['symbol', 'function', 'project', 'jump', 'outline'],
    run: openModal('project-symbols'),
  });
  // Go back (Atom steal #22): pop the jump stack — the position
  // the last project-symbol jump left from — and jump back to
  // it. A no-op when the stack is empty.
  registry.register({
    id: 'lucid:go-back',
    title: 'Go Back',
    description: 'Return to the position before the last symbol jump',
    tags: ['back', 'jump', 'history', 'navigation'],
    when: inEditor,
    run: () => {
      const position = popJumpPosition();
      if (position) requestEditorJump(position);
    },
  });
  // Project find-and-replace (Atom steal #5 — ⌘⇧F). The
  // panel is opt-in (projectSearchEnabled); opening it when
  // disabled shows the opt-in card, not the search.
  registry.register({
    id: 'project:find-in-project',
    title: 'Find in Project…',
    description: 'Search the project with ripgrep, replace in place',
    tags: ['find', 'search', 'replace', 'project', 'ripgrep'],
    keybinding: '⇧⌘F',
    when: inEditor,
    run: () => useFindReplaceStore.getState().openPanel(),
  });
  // Tutorials (Atom steal #15, Kite half): the picker lists
  // the built-in tutorials; a tutorial opens at its first
  // step. No keybinding — the palette is the entry point.
  registry.register({
    id: 'lucid:tutorials',
    title: 'Tutorials…',
    description: 'Browse step-by-step tutorials for Lucid',
    tags: ['tutorial', 'learn', 'guide', 'help'],
    run: openModal('tutorials'),
  });
  // Brain status (Atom steal #16, Kite half — Kite's
  // `kite:check-status`): probe the engine and toast the
  // full report — state, version, last activity. The probe
  // warms a down engine (the retry).
  registry.register({
    id: 'lucid:brain-status',
    title: 'Brain Status…',
    description: 'Check the language engine: state, version, last activity',
    tags: ['brain', 'engine', 'status', 'health'],
    run: () => void checkBrainStatus(getEngineClient()),
  });
  // Scroll to cursor (Atom steal #17 — `editor:scroll-to-
  // cursor`): move the viewport to show the cursor. No
  // keybinding — the palette is the entry point. A no-op
  // with no Monaco editor mounted (the fallback textarea
  // has no viewport to move).
  registry.register({
    id: 'lucid:scroll-to-cursor',
    title: 'Scroll to Cursor',
    description: 'Scroll the editor to show the cursor',
    tags: ['scroll', 'cursor', 'reveal', 'editor'],
    when: inEditor,
    run: () => {
      const handle = getActiveMonacoEditor();
      const editor = handle?.editor;
      const position = editor?.getPosition?.();
      if (!editor || !position) return;
      editor.revealPositionInCenter(position);
    },
  });
  // Go to matching bracket (Atom steal #20 — bracket-matcher):
  // jump the cursor to the bracket matching the one at (or
  // enclosing) the cursor. Monaco owns the action; this is
  // the palette entry point for it. A no-op with no Monaco
  // editor mounted.
  registry.register({
    id: 'editor:go-to-matching-bracket',
    title: 'Go to Matching Bracket',
    description: 'Jump the cursor to the matching bracket',
    tags: ['bracket', 'matching', 'jump', 'editor'],
    when: inEditor,
    run: () => {
      const editor = getActiveMonacoEditor()?.editor;
      if (!editor) return;
      const action = editor.getAction?.('editor.action.jumpToBracket');
      if (action) action.run();
      else editor.trigger?.('keyboard', 'editor.action.jumpToBracket', null);
    },
  });
  // Git panel (Atom steal #21 — the git panel's local core):
  // show the bottom dock with the staging area. No `when`
  // gate — the panel itself reports "not a git repository"
  // when the project root is not one.
  registry.register({
    id: 'git:open-panel',
    title: 'Git: Open Git Panel',
    description: 'Show the Git panel — stage, diff, and commit',
    tags: ['git', 'panel', 'stage', 'commit', 'diff'],
    run: () => {
      useDockStore.getState().showDock('bottom');
    },
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
    id: 'file:close',
    title: 'Close File',
    description: 'Close the active file (asks first when it has unsaved changes)',
    tags: ['close', 'file', 'tab'],
    keybinding: '⌘W',
    when: inEditor,
    run: () => {
      const path = useFileStore.getState().activeFilePath;
      if (path) useFileStore.getState().closeFileWithConfirm(path);
    },
  });
  registry.register({
    id: 'file:reopen-closed-tab',
    title: 'Reopen Closed Tab',
    description: 'Reopen the most recently closed terminal tab, in its old directory',
    tags: ['reopen', 'closed', 'tab', 'terminal', 'undo'],
    keybinding: '⇧⌘T',
    run: async () => {
      await useTerminalStore.getState().reopenClosedTab();
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
    id: 'terminal:split-horizontal',
    title: 'Split Terminal Horizontally',
    description: 'Stack a new terminal pane below the active tab (the /split horizontal command)',
    tags: ['split', 'pane', 'terminal', 'horizontal', 'stack'],
    keybinding: '⇧⌘D',
    when: inTerminal,
    run: async () => {
      const tabId = useTerminalStore.getState().activeTabId;
      if (tabId) await useSplitPaneStore.getState().splitTab(tabId, 'horizontal');
    },
  });
  registry.register({
    id: 'terminal:unsplit',
    title: 'Unsplit Terminal',
    description: 'Undo the last split (the /unsplit command)',
    tags: ['unsplit', 'pane', 'terminal'],
    when: inTerminal,
    run: () => {
      const tabId = useTerminalStore.getState().activeTabId;
      if (tabId) useSplitPaneStore.getState().unsplitOneTab(tabId);
    },
  });
  registry.register({
    id: 'terminal:unsplit-all',
    title: 'Unsplit All Panes',
    description: 'Close all the panes (the /unsplit all command — asks first)',
    tags: ['unsplit', 'pane', 'terminal', 'all'],
    when: inTerminal,
    run: () => {
      const tabId = useTerminalStore.getState().activeTabId;
      if (tabId) useSplitPaneStore.getState().requestUnsplitAll(tabId);
    },
  });
}
