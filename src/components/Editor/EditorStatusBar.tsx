/**
 * Editor status bar (Atom steal #11 — 2026-11-14).
 *
 * A permanent bottom strip under the editor — "always telling
 * you where you are": the file path, the cursor position, the
 * selection, the grammar, the line endings, the git branch.
 * Lucid already has an app-level status bar (Layout/StatusBar);
 * this is the EDITOR bar, a different strip that lives inside
 * the editor view, directly under the editor.
 *
 * The bar is an extension point, not a fixed row: tiles register
 * through the tile store (see editorStatusBarStore.ts) and render
 * in priority order. The core tiles register themselves here on
 * mount; future tiles (the Kite brain-alive tile, steal #16)
 * register from wherever they live.
 *
 * Core tiles, left to right (Atom's order): path (click copies
 * the absolute path, Shift-click copies the path relative to
 * the project dir), cursor `Ln, Col` (click opens go-to-line),
 * selection count (only when there is a selection), grammar
 * (click opens the language list; choosing re-highlights via
 * `setModelLanguage`, Atom's `assignGrammar`), line endings
 * (click opens LF/CRLF; choosing converts the whole buffer).
 * Right side: git branch + ahead/behind + change count.
 *
 * NOT in this bar: an encoding tile — Atom's status bar has NO
 * encoding tile, and Lucid's files are UTF-8 throughout. And
 * no launch-mode tile — Lucid has no safe/dev launch mode.
 * The tiles hide themselves when they have nothing to say
 * (no file open, not a repo), never a faked value.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorStatusBarStore, sortedTiles } from '../../stores/editorStatusBarStore';
import { useEditorStatusStore } from '../../stores/editorStatusStore';
import { useFileStore } from '../../stores/fileStore';
import { useModalStore } from '../../stores/modalStore';
import { useToastStore } from '../../stores/toastStore';
import { useGitStatus } from '../../lib/useGitStatus';
import { dirnameOf } from '../../lib/projectFileIndex';
import {
  EDITOR_LANGUAGE_CHOICES,
  convertLineEndings,
  languageLabel,
} from '../../lib/editorStatus';
import { getActiveMonacoEditor } from '../../lib/editorHandle';

/** A dropdown panel anchored above its tile, with a transparent
 *  overlay that closes it on any outside click. Fixed-positioned
 *  from the tile button's rect, so no ancestor's overflow clips
 *  it — the editor column clips overflow. */
function StatusBarDropdown({
  anchor,
  onClose,
  children,
}: {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        data-testid="status-bar-dropdown-overlay"
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        data-testid="status-bar-dropdown"
        className="fixed z-50 min-w-40 max-h-64 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
        style={{
          left: Math.max(4, anchor.left),
          bottom: Math.max(4, window.innerHeight - anchor.top + 4),
        }}
      >
        {children}
      </div>
    </>
  );
}

function DropdownItem({
  label,
  active,
  onSelect,
}: {
  label: string;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`block w-full px-3 py-1 text-left text-xs hover:bg-[var(--bg-tertiary)] ${
        active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
      }`}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

function TileButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="truncate rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

/** The file path — click copies the absolute path, Shift-click
 *  copies the path relative to the project dir. */
function PathTile() {
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const currentDir = useFileStore((s) => s.currentDir);
  if (!activeFilePath) {
    return <span className="px-1">No file open</span>;
  }
  const relative =
    currentDir && activeFilePath.startsWith(currentDir + '/')
      ? activeFilePath.slice(currentDir.length + 1)
      : activeFilePath.split('/').pop() ?? activeFilePath;
  return (
    <TileButton
      title={`${activeFilePath} — click copies the absolute path, Shift-click copies the relative path`}
      onClick={(e) => {
        const text = e.shiftKey ? relative : activeFilePath;
        void navigator.clipboard.writeText(text);
      }}
    >
      {activeFilePath}
    </TileButton>
  );
}

/** Cursor position — click opens go-to-line (Atom's
 *  cursor-position-view click). Hidden with no file open. */
function CursorTile() {
  const filePath = useEditorStatusStore((s) => s.filePath);
  const lineNumber = useEditorStatusStore((s) => s.lineNumber);
  const column = useEditorStatusStore((s) => s.column);
  if (!filePath) return null;
  return (
    <TileButton
      title="Go to line… (Ctrl+G)"
      onClick={() => useModalStore.getState().open('goto-line')}
    >
      Ln {lineNumber}, Col {column}
    </TileButton>
  );
}

/** Selection count — only when there is a selection (Atom's
 *  rule: the tile appears with a selection, not before). */
function SelectionTile() {
  const selectionCount = useEditorStatusStore((s) => s.selectionCount);
  if (selectionCount <= 0) return null;
  return (
    <span className="px-1" title={`${selectionCount} characters selected`}>
      {selectionCount} selected
    </span>
  );
}

/** The grammar tile — the current file's language; click opens
 *  the language list, choosing re-highlights the buffer via
 *  `setModelLanguage` (Atom's `assignGrammar`). */
function LanguageTile() {
  const languageId = useEditorStatusStore((s) => s.languageId);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  if (!languageId) return null;
  return (
    <span className="relative">
      <button
        ref={anchorRef}
        title="Change language (grammar)"
        onClick={() => {
          const rect = anchorRef.current?.getBoundingClientRect();
          if (rect) setAnchor(rect);
          setOpen((v) => !v);
        }}
        className="truncate rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      >
        {languageLabel(languageId)}
      </button>
      {open && anchor && (
        <StatusBarDropdown
          anchor={anchor}
          onClose={() => setOpen(false)}
        >
          {EDITOR_LANGUAGE_CHOICES.map((choice) => (
            <DropdownItem
              key={choice.id}
              label={choice.label}
              active={choice.id === languageId}
              onSelect={() => {
                const handle = getActiveMonacoEditor();
                const model = handle?.editor?.getModel?.();
                if (handle?.monaco?.editor?.setModelLanguage && model) {
                  handle.monaco.editor.setModelLanguage(model, choice.id);
                  useEditorStatusStore.getState().publish({ languageId: choice.id });
                }
                setOpen(false);
              }}
            />
          ))}
        </StatusBarDropdown>
      )}
    </span>
  );
}

/** The line-ending tile — LF / CRLF / Mixed; click opens the
 *  two-item list, choosing converts the whole buffer (one undo
 *  step). Hidden when the endings are unknown. */
function EolTile() {
  const eol = useEditorStatusStore((s) => s.eol);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  if (!eol) return null;
  return (
    <span className="relative">
      <button
        ref={anchorRef}
        title="Line endings — click to convert the whole buffer"
        onClick={() => {
          const rect = anchorRef.current?.getBoundingClientRect();
          if (rect) setAnchor(rect);
          setOpen((v) => !v);
        }}
        className="truncate rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      >
        {eol}
      </button>
      {open && anchor && (
        <StatusBarDropdown anchor={anchor} onClose={() => setOpen(false)}>
          {(['LF', 'CRLF'] as const).map((target) => (
            <DropdownItem
              key={target}
              label={target}
              active={target === eol}
              onSelect={() => {
                const handle = getActiveMonacoEditor();
                const model = handle?.editor?.getModel?.();
                if (model) {
                  const ok = convertLineEndings(model, target);
                  if (ok) {
                    useEditorStatusStore.getState().publish({ eol: target });
                  } else {
                    useToastStore
                      .getState()
                      .warning('File too large to convert line endings in one edit.');
                  }
                }
                setOpen(false);
              }}
            />
          ))}
        </StatusBarDropdown>
      )}
    </span>
  );
}

/** The git tile — branch + ahead/behind + change count for the
 *  active file's repo. Hidden outside a repo (never a faked
 *  branch). The file's unsaved state rides on the file tab
 *  already, so this tile is the repo state only. */
function GitTile() {
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const dir = activeFilePath ? dirnameOf(activeFilePath) : undefined;
  const status = useGitStatus(dir);
  if (!status) return null;
  const aheadBehind =
    status.ahead > 0 || status.behind > 0
      ? ` ↑${status.ahead} ↓${status.behind}`
      : '';
  return (
    <span
      className="px-1"
      title={`Branch ${status.branch} — ${status.changedFiles} changed file(s)${aheadBehind}`}
    >
      {status.branch}
      {aheadBehind}
      {status.changedFiles > 0 ? ` · ${status.changedFiles} changed` : ''}
    </span>
  );
}

export function EditorStatusBar() {
  const tiles = useEditorStatusBarStore((s) => s.tiles);

  useEffect(() => {
    const store = useEditorStatusBarStore.getState();
    const unregister = [
      store.registerTile({ id: 'path', side: 'left', priority: 10, render: () => <PathTile /> }),
      store.registerTile({ id: 'cursor', side: 'left', priority: 20, render: () => <CursorTile /> }),
      store.registerTile({ id: 'selection', side: 'left', priority: 30, render: () => <SelectionTile /> }),
      store.registerTile({ id: 'language', side: 'left', priority: 40, render: () => <LanguageTile /> }),
      store.registerTile({ id: 'eol', side: 'left', priority: 50, render: () => <EolTile /> }),
      store.registerTile({ id: 'git', side: 'right', priority: 10, render: () => <GitTile /> }),
    ];
    return () => unregister.forEach((u) => u());
  }, []);

  const left = sortedTiles(tiles, 'left');
  const right = sortedTiles(tiles, 'right');

  return (
    <div
      data-testid="editor-status-bar"
      className="flex h-6 shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs text-[var(--text-muted)] select-none"
    >
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        {left.map((tile) => (
          <span key={tile.id} className="flex min-w-0 items-center">
            {tile.render()}
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {right.map((tile) => (
          <span key={tile.id} className="flex items-center">
            {tile.render()}
          </span>
        ))}
      </div>
    </div>
  );
}
