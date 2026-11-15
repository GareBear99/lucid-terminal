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
 *   terminal's Ctrl-R reverse-search and Ctrl-P history are
 *   untouched because those are Ctrl, not Cmd).
 * - ⌘P quick open — anywhere (metaKey only, same reason).
 * - ⌘R go to symbol — anywhere (metaKey only).
 * - Ctrl-G go to line — editor view only (in the terminal
 *   Ctrl-G keeps its readline meaning).
 * A modal that is already open swallows its own keys; the
 * global handler ignores shortcuts while any modal is open.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FuzzyModal, type FuzzyModalItem } from '../FuzzyModal/FuzzyModal';
import { commandRegistry, type CommandContext } from '../../lib/commandRegistry';
import { useModalStore } from '../../stores/modalStore';
import { useFileStore } from '../../stores/fileStore';
import {
  getProjectFileIndex,
  refreshProjectFileIndex,
  markProjectFileOpened,
  subscribeProjectFileIndex,
} from '../../lib/projectFileIndex';
import { getFileStructure } from '../../lib/treeSitter';
import {
  requestEditorJump,
} from '../../lib/editorJump';
import { getDocsCursor } from '../../lib/docsCursor';
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
  const commands = useMemo(
    () => commandRegistry.findCommands(context),
    [context],
  );
  const items: FuzzyModalItem[] = commands.map((def) => ({
    id: def.id,
    label: def.title,
    detail: def.description,
    filterText: [def.title, def.description ?? '', ...(def.tags ?? [])].join(' '),
    right: def.keybinding,
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
  const [query, setQuery] = useState('');

  useEffect(() => subscribeProjectFileIndex(setIndex), []);
  // Warm the index when the finder first opens (and when the
  // root changes under it); a refresh in flight is a no-op.
  useEffect(() => {
    if (root && index.files.length === 0 && !index.indexing) {
      void refreshProjectFileIndex(root);
    }
  }, [root, index.files.length, index.indexing]);

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
      emptyText={index.indexing ? 'Indexing files…' : 'No files in this project'}
      indexing={index.indexing}
      onQueryChange={setQuery}
      onSelect={async (item) => {
        close();
        markProjectFileOpened(item.id);
        await useFileStore.getState().openFile(item.id);
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

export function AtomModals({ context, switchView }: AtomModalsProps) {
  const openModal = useModalStore((s) => s.openModal);
  const open = useModalStore((s) => s.open);

  // Global shortcuts (see the header comment for the scoping).
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useModalStore.getState().openModal !== null) return;
      const ctx = contextRef.current;
      if (e.metaKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        open('palette');
        return;
      }
      if (e.metaKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        open('finder');
        return;
      }
      if (e.metaKey && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (ctx.hasActiveFile) open('symbols');
        return;
      }
      if (e.ctrlKey && !e.metaKey && (e.key === 'g' || e.key === 'G')) {
        if (ctx.view !== 'editor' || !ctx.hasActiveFile) return;
        e.preventDefault();
        open('goto-line');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    default:
      return null;
  }
}
