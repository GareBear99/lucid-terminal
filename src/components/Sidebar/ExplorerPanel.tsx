/**
 * The file Explorer panel (extracted from Sidebar.tsx,
 * 2026-11-15 — the Explorer in detached windows slice).
 *
 * The SAME component renders in the main window's Sidebar
 * and in the detached terminal window's rail (MiniTerminal)
 * — one panel, one file tree, no second copy to drift. It
 * reads the file tree from fileStore (entries, expandedDirs,
 * currentDir), so both windows show the same workspace: the
 * root is resolved once at startup (explorerStartupRoot —
 * settings.explorerRoot, then the profile's saved workspace,
 * then home), and a guest has no saved workspace by
 * construction, so a guest's Explorer roots at home — the
 * guest veil, the same as History/Docs.
 *
 * The Explorer is workspace-scoped, not per-tab: there is
 * one fileStore currentDir, and switching tabs does not
 * re-root it. "Follows the active tab" means the panel lives
 * in the window beside the active tab's terminal (History
 * and Docs are the per-tab ones); the tree itself is the
 * shared workspace.
 *
 * File open: clicking a file opens it in this window's
 * fileStore and calls onOpenFile with the path and the click
 * point. The main window switches to the editor; a detached
 * window opens the file in a detached editor window
 * (MiniFiles) — the detached window has no editor of its
 * own, so that is the detached equivalent of opening it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Folder,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Minus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useEventLogStore } from '../../stores/eventLogStore';
import { useFileStore } from '../../stores/fileStore';
import { detectPlatform } from '../../lib/keymap';
import { FileTypeIcon } from '../Editor/FileTypeIcon';
import { Tooltip } from '../Tooltip/Tooltip';
import {
  flattenVisibleFileTree,
  computeVisibleWindow,
  FILE_TREE_ROW_HEIGHT_PX,
  FILE_TREE_OVERSCAN_ROWS,
} from '../../lib/fileTreeVirtualization';
import type { FileEntry } from '../../types';

interface ExplorerPanelProps {
  /** The panel width in px (the Sidebar passes width - 48;
   *  MiniTerminal passes its panel width). */
  width: number;
  /** Minimize the panel to its rail (never a close — Gary,
   *  2026-11-13: minimize, not delete). */
  onMinimize: () => void;
  /** Called when a file opens successfully, with the path
   *  and the click point. The main window switches to the
   *  editor; a detached window opens the file in a detached
   *  editor window. Optional — when absent the file just
   *  opens in this window's fileStore. */
  onOpenFile?: (path: string, x: number, y: number) => void;
}

/** The system file-manager verb for this platform — the
 *  context-menu label for fs:openInExplorer (Finder on macOS,
 *  Explorer on Windows, Files on Linux). */
function revealInExplorerLabel(): string {
  const platform = detectPlatform();
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'win32') return 'Show in Explorer';
  return 'Show in Files';
}

export function ExplorerPanel({ width, onMinimize, onOpenFile }: ExplorerPanelProps) {
  const {
    currentDir,
    entries,
    expandedDirs,
    selectedPath,
    error,
    isLoading,
    clearError,
    setCurrentDir,
    toggleDir,
    selectPath,
    openFile,
    refreshDir,
    createFile,
    createFolder,
    deleteItem,
    renameItem,
  } = useFileStore();

  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Inline rename (Gary, 2026-11-13): window.prompt shows no dialog
  // and returns null immediately in this Electron build (the main
  // process has no custom dialog handler; window.confirm works,
  // window.prompt does not), so Rename silently did nothing. The
  // rename is an input in the tree row instead — same Enter-to-
  // confirm / Escape-to-cancel shape as the New File input above.
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  // Explorer context menu (right-click on a tree item): the item under
  // the cursor + where the menu opens. Null = closed. Delete and
  // Rename both confirm before acting — delete on a directory is a
  // recursive rm -rf in fs:delete, so it never runs without a confirm.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  // --- File-tree virtualization (files-section fix step 4) ------
  // The tree renders only the rows in the scroll window (plus
  // overscan); top/bottom spacers stand in for the rest, so the
  // scrollbar still spans the whole tree. Row height is fixed at
  // 28px (h-7 on the row div) — the windowing math is exact.
  // Scroll position is tracked via rAF: one state update per
  // frame at most, no matter how many scroll events fire.
  const treeScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const treeScrollRafRef = useRef<number | null>(null);
  const treeScrollPendingRef = useRef<{ scrollTop: number; clientHeight: number } | null>(null);

  const handleTreeScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    treeScrollPendingRef.current = { scrollTop: target.scrollTop, clientHeight: target.clientHeight };
    if (treeScrollRafRef.current !== null) return;
    treeScrollRafRef.current = requestAnimationFrame(() => {
      treeScrollRafRef.current = null;
      const pending = treeScrollPendingRef.current;
      if (!pending) return;
      setTreeScrollTop(pending.scrollTop);
      setTreeViewportHeight(pending.clientHeight);
    });
  };

  // Measure the viewport whenever the panel is (re)mounted —
  // before paint, so the first render already windows on the real
  // height instead of the 10-row fallback — and on resize. (In
  // the old Sidebar home this keyed on the panel state; here the
  // panel mounts when it is shown, so mount is the key.)
  useLayoutEffect(() => {
    const el = treeScrollContainerRef.current;
    if (!el) return;
    setTreeViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setTreeViewportHeight(el.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A pending scroll rAF must not fire after unmount.
  useEffect(() => {
    return () => {
      if (treeScrollRafRef.current !== null) {
        cancelAnimationFrame(treeScrollRafRef.current);
        treeScrollRafRef.current = null;
      }
    };
  }, []);

  const handleOpenDirectory = async () => {
    const dir = await window.lucidAPI.fs.selectDirectory();
    // Track + diagnose the folder picker: WHEN it opened
    // and WHY (the user picked a workspace folder here).
    // (Gary, 2026-11-08 — track when + why.) The read
    // itself is logged separately by setCurrentDir.
    useEventLogStore.getState().logDirectoryDialog(
      'Files screen — pick a workspace folder',
      dir ? 'completed' : 'cancelled',
    );
    if (dir) {
      await setCurrentDir(dir);
    }
  };

  const handleCreateFile = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}/${newItemName}`;
    await createFile(path);
    setNewItemName('');
    setIsCreatingFile(false);
  };

  const handleCreateFolder = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}/${newItemName}`;
    await createFolder(path);
    setNewItemName('');
    setIsCreatingFolder(false);
  };

  const handleDeleteContextItem = async () => {
    if (!contextMenu) return;
    const { path, name, isDirectory } = contextMenu;
    setContextMenu(null);
    const label = isDirectory
      ? `folder "${name}" and everything inside it`
      : `file "${name}"`;
    if (!confirm(`Delete ${label}?\n\nThis cannot be undone.`)) return;
    await deleteItem(path);
  };

  // Rename opens the inline input (no window.prompt — see the note
  // on the renamingPath state above). Enter confirms, Escape cancels.
  const handleRenameContextItem = () => {
    if (!contextMenu) return;
    const { path, name } = contextMenu;
    setContextMenu(null);
    setRenamingPath(path);
    setRenameName(name);
  };

  // Reveal in Finder / Explorer — the fs:openInExplorer IPC
  // handler (electron/ipc/fileSystem.ts, shell.showItemInFolder)
  // existed with zero callers; this is its caller.
  const handleRevealContextItem = async () => {
    if (!contextMenu) return;
    const { path } = contextMenu;
    setContextMenu(null);
    await window.lucidAPI.fs.openInExplorer(path);
  };

  const handleConfirmRename = async () => {
    if (!renamingPath) return;
    const oldName = renamingPath.split('/').pop() ?? renamingPath;
    if (!renameName || renameName === oldName) {
      setRenamingPath(null);
      setRenameName('');
      return;
    }
    if (renameName.includes('/') || renameName.includes('\\')) {
      alert('A file or folder name cannot contain / or \\.');
      return;
    }
    const slash = renamingPath.lastIndexOf('/');
    const newPath = slash >= 0 ? `${renamingPath.slice(0, slash)}/${renameName}` : renameName;
    const path = renamingPath;
    setRenamingPath(null);
    setRenameName('');
    await renameItem(path, newPath);
  };

  const handleCancelRename = () => {
    setRenamingPath(null);
    setRenameName('');
  };

  // One tree row — the markup and handlers are EXACTLY the old
  // recursive render's row (same classes, same onClick /
  // onContextMenu, same rename input, same chevrons/icons/
  // selection), with one addition: an explicit `h-7` (28px) so the
  // windowing math is a contract, not an assumption. The old
  // recursion into expanded children is gone — flattening decides
  // visibility now (see visibleFileTreeRows below).
  const renderFileTreeRow = (item: FileEntry, level = 0) => (
    <div key={item.path}>
      <div
        className={`flex h-7 items-center gap-1 py-1 px-2 cursor-pointer hover:bg-[var(--bg-tertiary)] rounded text-sm ${selectedPath === item.path ? 'bg-[var(--bg-tertiary)]' : ''
          }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={async (e) => {
          selectPath(item.path);
          if (item.isDirectory) {
            await toggleDir(item.path);
          } else {
            // Only switch to the editor when the file actually opened —
            // a failed open shows the error instead of an empty editor.
            const opened = await openFile(item.path);
            if (opened) {
              onOpenFile?.(item.path, e.clientX, e.clientY);
            }
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          selectPath(item.path);
          // Clamp so the menu never opens off-screen.
          setContextMenu({
            x: Math.min(e.clientX, window.innerWidth - 180),
            y: Math.min(e.clientY, window.innerHeight - 100),
            path: item.path,
            name: item.name,
            isDirectory: item.isDirectory,
          });
        }}
      >
        {item.isDirectory ? (
          <>
            {expandedDirs.has(item.path) ? (
              <ChevronDown size={14} className="text-[var(--text-muted)] flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
            )}
            <Folder size={14} className="text-[var(--accent)] flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileTypeIcon path={item.path} />
          </>
        )}
        {renamingPath === item.path ? (
          <input
            type="text"
            className="input text-xs h-6 flex-1 min-w-0"
            placeholder="Rename to..."
            aria-label="Rename file or folder"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleConfirmRename();
              } else if (e.key === 'Escape') {
                handleCancelRename();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="truncate text-[var(--text-primary)]">{item.name}</span>
        )}
      </div>
    </div>
  );

  // The virtualized window: flatten the visible tree once per
  // entries / expandedDirs change, then render only the rows in
  // the scroll window (plus overscan). When the list fits the
  // viewport the window is the whole list — nothing changes for
  // small trees.
  const visibleFileTreeRows = useMemo(
    () => flattenVisibleFileTree(entries, expandedDirs),
    [entries, expandedDirs],
  );
  const visibleFileTreeWindow = computeVisibleWindow(
    visibleFileTreeRows.length,
    treeScrollTop,
    treeViewportHeight,
    FILE_TREE_ROW_HEIGHT_PX,
    FILE_TREE_OVERSCAN_ROWS,
  );

  return (
    <div
      data-testid="explorer-panel"
      className="h-full bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <Tooltip content="New File">
            <button
              onClick={() => setIsCreatingFile(true)}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <FilePlus size={14} />
            </button>
          </Tooltip>
          <Tooltip content="New Folder">
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <FolderPlus size={14} />
            </button>
          </Tooltip>
          <Tooltip content="Refresh">
            <button
              onClick={refreshDir}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={14} />
            </button>
          </Tooltip>
          {/* Minimize (Gary, 2026-11-14 ~03:00 PST): the dash
              collapses the Explorer to its w-12 rail - the
              same minimize as the other panels, never a
              close or delete. The Minus glyph is the
              codebase's minimize mark (AIChat "Minimize
              chats", TitleBar window minimize). The rail's
              chevron and the toolbar Explorer icon bring
              it back (togglePanel). */}
          <Tooltip content="Minimize explorer">
            <button
              onClick={onMinimize}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Minimize explorer"
            >
              <Minus size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* New Item Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="px-2 py-1 border-b border-[var(--border)]">
          <input
            type="text"
            className="input text-xs h-7"
            placeholder={isCreatingFile ? 'New file name...' : 'New folder name...'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                isCreatingFile ? handleCreateFile() : handleCreateFolder();
              } else if (e.key === 'Escape') {
                setNewItemName('');
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
              }
            }}
            autoFocus
          />
        </div>
      )}

      {/* File Tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        ref={treeScrollContainerRef}
        onScroll={handleTreeScroll}
      >
        {/* File access error — inline, so a denied/failed folder reads
            as blocked instead of empty or stale. */}
        {error && (
          <div className="mx-2 mb-2 rounded-md border border-red-500/40 bg-red-500/15 p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-red-300 break-words">{error}</p>
              <Tooltip content="Dismiss">
                <button
                  onClick={clearError}
                  className="shrink-0 rounded p-0.5 text-red-300 hover:bg-white/10"
                >
                  <X size={12} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
        {currentDir ? (
          <>
            {/* Current Directory */}
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] truncate">
              <FolderOpen size={12} />
              <span className="truncate">{currentDir}</span>
            </div>
            {entries.length === 0 && !error && !isLoading ? (
              <p className="px-3 py-2 text-xs leading-[1.5] text-[var(--text-muted)]">Folder is empty</p>
            ) : (
              <>
                {/* Top spacer: stands in for the rows above the window. */}
                <div
                  style={{ height: visibleFileTreeWindow.start * FILE_TREE_ROW_HEIGHT_PX }}
                  aria-hidden="true"
                />
                {visibleFileTreeRows
                  .slice(visibleFileTreeWindow.start, visibleFileTreeWindow.end)
                  .map((row) => renderFileTreeRow(row.entry, row.level))}
                {/* Bottom spacer: stands in for the rows below the window. */}
                <div
                  style={{
                    height:
                      (visibleFileTreeRows.length - visibleFileTreeWindow.end) *
                      FILE_TREE_ROW_HEIGHT_PX,
                  }}
                  aria-hidden="true"
                />
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <FolderOpen size={32} className="text-[var(--text-muted)] mb-2" />
            <p className="text-sm leading-[1.5] text-[var(--text-muted)] mb-3">No folder open</p>
            <Tooltip content="Open Folder">
              <button
                onClick={handleOpenDirectory}
                className="btn btn-primary text-sm py-1.5 px-3"
              >
                Open Folder
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Explorer context menu (right-click on a tree item):
          Reveal in Finder / Rename / Delete. Fixed overlay: any click outside
          closes it. */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="fixed w-44 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleRevealContextItem}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-left"
            >
              <FolderOpen size={14} className="text-[var(--text-muted)]" />
              {revealInExplorerLabel()}
            </button>
            <button
              onClick={handleRenameContextItem}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-left"
            >
              <Pencil size={14} className="text-[var(--text-muted)]" />
              Rename
            </button>
            <button
              onClick={handleDeleteContextItem}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-[var(--bg-tertiary)] text-left"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
