/**
 * The Atom modals host (steal #1/#2/#8 — 2026-11-14).
 *
 * One host, four modals, one shared FuzzyModal — Atom's
 * `atom-select-list` shape. The host is rendered by App and
 * reads the modal store; the global shortcuts live here too.
 *
 * Shortcuts (Atom's keys, Lucid-scoped so they never hijack
 * the terminal):
 * - ⌘⇧P command palette — anywhere (metaKey only; the
 *   terminal's Ctrl-P history is untouched because that is
 *   Ctrl, not Cmd).
 * - ⌘P quick open — anywhere (metaKey only, same reason).
 * - ⌘R go to symbol — anywhere (metaKey only).
 * - Ctrl-G go to line — editor view only (in the terminal
 *   Ctrl-G keeps its readline meaning).
 * - Ctrl-R is the shell's reverse-search below DEFCON 3 — the
 *   command-history palette (sweep item 5, Terminal.tsx)
 *   owns it only while the composer owns typing (level 3+),
 *   where there is no shell to hijack.
 * A modal that is already open swallows its own keys; the
 * global handler ignores shortcuts while any modal is open.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FuzzyModal, type FuzzyModalItem } from '../FuzzyModal/FuzzyModal';
import { commandRegistry, type CommandContext } from '../../lib/commandRegistry';
import { useModalStore } from '../../stores/modalStore';
import { subscribeMenuModals } from '../../lib/menuModals';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { dispatchKeyEvent } from '../../lib/keymapDispatch';
import {
  getProjectFileIndex,
  refreshProjectFileIndex,
  markProjectFileOpened,
  dirnameOf,
  subscribeProjectFileIndex,
} from '../../lib/projectFileIndex';
import { getFileStructure } from '../../lib/treeSitter';
import { keyLabelForCommand } from '../../lib/keymap';
import { openFileInWorkspace } from '../../lib/workspace';
import {
  requestEditorJump,
} from '../../lib/editorJump';
import { getDocsCursor } from '../../lib/docsCursor';
import { TutorialPanel } from '../Tutorials/TutorialPanel';
import { searchProjectSymbols } from '../../lib/projectSymbols';
import { useProjectSymbolsStore } from '../../stores/projectSymbolsStore';
import { pushJumpPosition } from '../../lib/jumpStack';
import { useScopeStore } from '../../stores/scopeStore';
import {
  parseGoToLine,
  splitLineJumpSuffix,
} from '../../lib/goToLine';
import type { View } from '../../types';

export interface AtomModalsProps {
  /** The palette's focus point (from App). */
  context: CommandContext;
  /** Switch the main-panel view (from App). */
  switchView: (view: View) => void;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function relativeToRoot(path: string, root: string): string {
  if (root && path.startsWith(root)) {
    const rel = path.slice(root.length).replace(/^\//, '');
    return rel || basename(path);
  }
  return path;
}

/** The command palette — the registry, filtered live. */
function PaletteModal({ context }: { context: CommandContext }) {
  const close = useModalStore((s) => s.close);
  // The keystroke shown on each row comes from the keymap
  // (Atom steal #13): a user rebind changes the label here,
  // in the menu and in the keydown handler together. Commands
  // the keymap does not list (view switches, AI toggle) keep
  // the keybinding the registry declares, if any.
  const customKeybindings = useSettingsStore((s) => s.settings.customKeybindings ?? []);
  const commands = useMemo(
    () => commandRegistry.findCommands(context),
    [context],
  );
  const items: FuzzyModalItem[] = commands.map((def) => ({
    id: def.id,
    label: def.title,
    detail: def.description,
    filterText: [def.title, def.description ?? '', ...(def.tags ?? [])].join(' '),
    right: keyLabelForCommand(def.id, customKeybindings) || def.keybinding,
  }));
  return (
    <FuzzyModal
      open
      placeholder="Type a command"
      items={items}
      emptyText="No matching commands"
      onSelect={(item) => {
        close();
        void commandRegistry.dispatch(item.id, context);
      }}
      onClose={close}
    />
  );
}

/** The fuzzy file finder — the warm project index, last-opened first. */
function FinderModal({ switchView }: { switchView: (view: View) => void }) {
  const close = useModalStore((s) => s.close);
  const [index, setIndex] = useState(() => getProjectFileIndex());
  const root = useFileStore((s) => s.currentDir);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const [query, setQuery] = useState('');

  useEffect(() => subscribeProjectFileIndex(setIndex), []);
  // Re-root the index when the finder opens (and when the
  // active file or the current directory changes under it):
  // the seed is the active file's directory, so the index
  // roots at the project (package.json / .git) instead of the
  // home dir — files 5 levels deep from home (Settings) were
  // invisible to ⌘P. A refresh for the already-indexed
  // project is a no-op inside refreshProjectFileIndex.
  useEffect(() => {
    const seed = activeFilePath ? dirnameOf(activeFilePath) : root;
    if (seed) void refreshProjectFileIndex(seed);
  }, [root, activeFilePath]);

  const lineJump = splitLineJumpSuffix(query, 1);
  const items: FuzzyModalItem[] = useMemo(() => {
    const files = index.files;
    return files.map((path) => ({
      id: path,
      label: basename(path),
      detail: relativeToRoot(path, index.root),
      filterText: relativeToRoot(path, index.root),
    }));
  }, [index.files, index.root]);

  return (
    <FuzzyModal
      open
      placeholder="Open a file…  (type :12 to jump to a line)"
      items={items}
      emptyText={
        index.indexing
          ? 'Indexing files…'
          : index.timedOut
            ? 'Indexing timed out — open a file in the project first, then try again'
            : 'No files in this project'
      }
      indexing={index.indexing}
      onQueryChange={setQuery}
      onSelect={async (item) => {
        close();
        markProjectFileOpened(item.id);
        // The open funnel (Atom steal #14): reveal if open,
        // open in-project, or add the file's directory as a
        // project first.
        await openFileInWorkspace(item.id);
        switchView('editor');
        if (lineJump) {
          requestEditorJump({
            path: item.id,
            lineNumber: lineJump.target.lineNumber,
            column: lineJump.target.column,
          });
        }
      }}
      onClose={close}
    />
  );
}

/** Go-to-symbol — the tree-sitter outline of the active file. */
function SymbolsModal({ switchView }: { switchView: (view: View) => void }) {
  const close = useModalStore((s) => s.close);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  // Quick-jump preview (Atom's `file-view.js:61-63`): arrowing
  // through results moves the cursor live; cancelling restores
  // the cursor the modal opened with (from the docs-cursor bus,
  // which tracks the editor's cursor).
  const openedAtRef = useRef<{ path: string; lineNumber: number; column: number } | null>(null);
  const selectedRef = useRef(false);
  useEffect(() => {
    const cursor = getDocsCursor();
    openedAtRef.current = cursor
      ? { path: cursor.path, lineNumber: cursor.lineNumber, column: cursor.column }
      : null;
    selectedRef.current = false;
  }, []);

  const structure = activeFilePath ? getFileStructure(activeFilePath) : null;
  const items: FuzzyModalItem[] = useMemo(() => {
    if (!structure) return [];
    return structure.definitions.map((def) => ({
      id: `${def.name}:${def.startRow}`,
      label: def.name,
      detail: `Line ${def.startRow + 1}`,
      filterText: def.name,
      right: def.kind,
    }));
  }, [structure]);

  const jumpTo = (item: FuzzyModalItem) => {
    if (!activeFilePath) return;
    const line = Number(item.detail?.replace('Line ', '') ?? '1');
    requestEditorJump({ path: activeFilePath, lineNumber: line, column: 1 });
  };

  return (
    <FuzzyModal
      open
      placeholder="Go to symbol in file…"
      items={items}
      emptyText={
        activeFilePath
          ? 'No symbols in this file'
          : 'Open a file first'
      }
      onHighlightChange={(item) => {
        if (item) jumpTo(item);
      }}
      onSelect={(item) => {
        selectedRef.current = true;
        close();
        jumpTo(item);
        switchView('editor');
      }}
      onClose={() => {
        close();
        // Cancelled, not confirmed: restore the cursor the
        // modal opened with (the quick-jump preview moved it).
        if (!selectedRef.current && openedAtRef.current) {
          requestEditorJump(openedAtRef.current);
        }
      }}
    />
  );
}

/** Go-to-line — input-only, navigates live as you type. */
function GoToLineModal({ switchView }: { switchView: (view: View) => void }) {
  const close = useModalStore((s) => s.close);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const openedAtRef = useRef<{ path: string; lineNumber: number; column: number } | null>(null);
  useEffect(() => {
    const cursor = getDocsCursor();
    openedAtRef.current = cursor
      ? { path: cursor.path, lineNumber: cursor.lineNumber, column: cursor.column }
      : null;
  }, []);

  const lineCount = useMemo(() => {
    if (!activeFilePath) return 0;
    const file = useFileStore.getState().openFiles.find((f) => f.path === activeFilePath);
    return file?.content ? file.content.split('\n').length : 0;
  }, [activeFilePath]);

  const navigate = (input: string) => {
    if (!activeFilePath) return;
    const cursor = getDocsCursor();
    const target = parseGoToLine(input, cursor?.lineNumber ?? 1);
    if (!target) return;
    const lineNumber = lineCount > 0 ? Math.min(target.lineNumber, lineCount) : target.lineNumber;
    requestEditorJump({ path: activeFilePath, lineNumber, column: target.column });
  };

  return (
    <FuzzyModal
      open
      placeholder="Go to line (e.g. 42 or 42:10)"
      items={[]}
      hideList
      allowedInput={/^[0-9:]*$/}
      footer="Type a line number, or line:column — the editor follows as you type. Esc restores the cursor."
      onQueryChange={navigate}
      onSelect={() => {
        close();
        switchView('editor');
      }}
      onClose={() => {
        close();
        // Cancelled: restore the cursor (the live navigation
        // moved it while typing).
        if (openedAtRef.current) requestEditorJump(openedAtRef.current);
      }}
    />
  );
}

/** Project symbols — the tree-sitter index of the whole project.
 *  Rows are `name` / `file:line`, with the definition kind on the
 *  right. Selecting one pushes the current cursor onto the jump
 *  stack (so `lucid:go-back` returns here), opens the file and
 *  jumps to the symbol. The index builds on first open and is
 *  cached — files edited after the build stay stale until the
 *  next build; the footer says when it was built. */
function ProjectSymbolsModal({ switchView }: { switchView: (view: View) => void }) {
  const close = useModalStore((s) => s.close);
  const symbols = useProjectSymbolsStore((s) => s.symbols);
  const indexedAt = useProjectSymbolsStore((s) => s.indexedAt);
  const indexing = useProjectSymbolsStore((s) => s.indexing);
  const indexedFiles = useProjectSymbolsStore((s) => s.indexedFiles);
  const buildIndex = useProjectSymbolsStore((s) => s.buildIndex);
  const root = useFileStore((s) => s.currentDir);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (indexedAt === null) void buildIndex();
    // Build once per open when nothing is cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items: FuzzyModalItem[] = useMemo(() => {
    return searchProjectSymbols(symbols, query).map((symbol) => ({
      id: `${symbol.path}:${symbol.line}:${symbol.name}`,
      label: symbol.name,
      detail: `${relativeToRoot(symbol.path, root)}:${symbol.line}`,
      filterText: symbol.name,
      right: symbol.kind,
    }));
  }, [symbols, query, root]);

  return (
    <FuzzyModal
      open
      placeholder="Go to symbol in project…"
      items={items}
      emptyText={indexing ? 'Indexing symbols…' : 'No symbols in this project'}
      indexing={indexing}
      footer={
        indexedAt
          ? `Indexed ${symbols.length} symbols from ${indexedFiles} files · built ${new Date(indexedAt).toLocaleTimeString()}`
          : undefined
      }
      onQueryChange={setQuery}
      onSelect={async (item) => {
        const symbol = searchProjectSymbols(symbols, query).find(
          (candidate) => `${candidate.path}:${candidate.line}:${candidate.name}` === item.id,
        );
        if (!symbol) return;
        // Push where the jump leaves from, so go-back returns here.
        const cursor = getDocsCursor();
        if (cursor) {
          pushJumpPosition({
            path: cursor.path,
            lineNumber: cursor.lineNumber,
            column: cursor.column,
          });
        }
        close();
        await openFileInWorkspace(symbol.path);
        switchView('editor');
        requestEditorJump({ path: symbol.path, lineNumber: symbol.line, column: 1 });
      }}
      onClose={close}
    />
  );
}

export function AtomModals({ context, switchView }: AtomModalsProps) {
  const openModal = useModalStore((s) => s.openModal);
  const open = useModalStore((s) => s.open);

  // Global shortcuts (Atom steal #13 — keymaps): ONE dispatcher
  // for every keymap binding. The keydown used to be four
  // hardcoded branches (⌘⇧P/⌘P/⌘R/Ctrl+G) that could disagree
  // with the keymap, the menu and the palette; now the event
  // goes through commandForKeyEvent + the registry (see
  // keymapDispatch.ts), so a user rebind in settings changes
  // this handler, the menu labels and the palette together.
  // The guards are the dispatcher's: a modal already open
  // swallows every shortcut (the modal owns the keys), and a
  // command the registry's `when` refuses (⌘D in the editor)
  // falls through to the focused control untouched — Monaco
  // keeps its own ⌘D. The menu accelerators are the other
  // dispatch path in the packaged app: the menu intercepts its
  // keys before this handler ever sees them, so a menu key
  // never double-fires here.
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useModalStore.getState().openModal !== null) return;
      const ctx = contextRef.current;
      const overrides = useSettingsStore.getState().settings.customKeybindings ?? [];
      // Scope system (Atom steal #18): the cursor's descriptor
      // rides into the dispatcher, so scoped bindings only
      // fire when it matches their selector.
      const scope = useScopeStore.getState().currentScope;
      const ran = dispatchKeyEvent(e, ctx.view, ctx.hasActiveFile, { overrides, scope });
      if (ran) e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Application menu actions (Atom steal #13 — menus). The
  // menu's accelerators (Cmd+Shift+P / Cmd+P / Cmd+R) pre-empt
  // this keydown handler in the packaged app — the menu owns
  // Cmd+R because the default menu's Reload used to shadow
  // it and reload the app to Profiles — so the same modal
  // opens exactly once either way. The guards match the
  // keydown path: symbols needs an active file; 'help' and
  // 'new-terminal-tab' are App's. 'close-file' (⌘W) is handled
  // here because it needs the focus point: in the editor with
  // a file open it closes the file (dirty → the confirm);
  // anywhere else it closes the window, the old `close`
  // role's behaviour.
  useEffect(() => {
    return subscribeMenuModals((kind) => {
      const ctx = contextRef.current;
      if (kind === 'palette') open('palette');
      else if (kind === 'finder') open('finder');
      else if (kind === 'symbols' && ctx.hasActiveFile) open('symbols');
      else if (kind === 'close-file') {
        if (ctx.view === 'editor' && ctx.hasActiveFile) {
          const path = useFileStore.getState().activeFilePath;
          if (path) useFileStore.getState().closeFileWithConfirm(path);
        } else {
          window.close();
        }
      }
    });
  }, [open]);

  switch (openModal) {
    case 'palette':
      return <PaletteModal context={context} />;
    case 'finder':
      return <FinderModal switchView={switchView} />;
    case 'symbols':
      return <SymbolsModal switchView={switchView} />;
    case 'goto-line':
      return <GoToLineModal switchView={switchView} />;
    case 'tutorials':
      return <TutorialPanel />;
    case 'project-symbols':
      return <ProjectSymbolsModal switchView={switchView} />;
    default:
      return null;
  }
}
