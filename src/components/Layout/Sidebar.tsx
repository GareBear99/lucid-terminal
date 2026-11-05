import { useEffect, useState } from 'react';
import {
  FolderOpen,
  Terminal,
  Settings,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  FolderPlus,
  FilePlus,
  X,
} from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useHistoryStore, EMPTY_BLOCKS, jumpToBlock } from '../../stores/historyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { enabledToolbarPlugins } from '../../data/toolbarPlugins';
import { ConversationHistory } from '../Sidebar/ConversationHistory';
import { Tooltip } from '../Tooltip/Tooltip';
import { View, FileEntry } from '../../types';

interface SidebarProps {
  width: number;
  onWidthChange: (width: number) => void;
  currentView: View;
  onViewChange: (view: View) => void;
  /** Whether the AI chat panel is open (the AI Chat button's active state). */
  showAI: boolean;
  /** Toggle the AI chat panel (the AI Chat toolbar button's action). */
  onToggleAI: () => void;
  /** Toggle the Synth view (the Synth toolbar button's action). */
  onToggleSynth?: () => void;
  /** Toggle the Forge view (the Forge toolbar button's action). */
  onToggleForge?: () => void;
}

function Sidebar({ width, onWidthChange, currentView, onViewChange, showAI, onToggleAI, onToggleSynth, onToggleForge }: SidebarProps) {
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
  } = useFileStore();

  // Sidebar panel: the file Explorer or the chats (History). The chats
  // used to live inside the Terminal view; they are a main-sidebar
  // panel now, on the paper button under the Explorer button. Default
  // is the chats — the History was visible by default before the move.
  type SidebarPanel = 'explorer' | 'history';
  const [activePanel, setActivePanel] = useState<SidebarPanel>('history');
  // Expanded chats width in px (w-80 = 320, the History's standard
  // width). The collapsed tick rail stays w-12 regardless; the resize
  // handle adjusts this while the chats panel is active.
  const [historyWidth, setHistoryWidth] = useState(320);

  // The active tab's blocks — what the chats panel shows. Only the
  // active tab's blocks, never all tabs flattened together.
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const historyBlocks = useHistoryStore((s) =>
    activeTabId ? s.blocksByTab[activeTabId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS
  );

  // Toolbar plugins — the plugins section above Settings. One button
  // per plugin toggled on in Settings; the section grows taller per
  // plugin. The Synth button moved here from its old spot after
  // Editor: it is the LuciferAI plugin's shell, so it belongs with
  // the plugins, not the core view buttons.
  const toolbarPlugins = useSettingsStore((s) => s.settings.toolbarPlugins);
  const enabledPlugins = enabledToolbarPlugins(toolbarPlugins);

  // Cmd+B / Ctrl+B toggles the chats panel. This was the History
  // toggle inside the Terminal; the panel lives here now, so the
  // shortcut lives here too (one listener, not one per terminal tab).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setActivePanel((prev) => (prev === 'history' ? 'explorer' : 'history'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Jump to a block in the terminal. The block elements only exist
  // while the Terminal view is mounted — if the user is in the Synth,
  // Settings or Editor view, switch to the terminal first and jump
  // once it has rendered.
  const handleJumpToBlock = (blockId: string) => {
    if (currentView !== 'terminal') {
      onViewChange('terminal');
      setTimeout(() => jumpToBlock(blockId), 100);
    } else {
      jumpToBlock(blockId);
    }
  };

  // Clear only the active tab's history.
  const handleClearHistory = () => {
    if (!activeTabId) return;
    if (confirm('Clear all command history? This cannot be undone.')) {
      useHistoryStore.getState().clearBlocks(activeTabId);
    }
  };

  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const handleOpenDirectory = async () => {
    const dir = await window.lucidAPI.fs.selectDirectory();
    if (dir) {
      await setCurrentDir(dir);
    }
  };

  const handleCreateFile = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}\\${newItemName}`;
    await createFile(path);
    setNewItemName('');
    setIsCreatingFile(false);
  };

  const handleCreateFolder = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}\\${newItemName}`;
    await createFolder(path);
    setNewItemName('');
    setIsCreatingFolder(false);
  };



  const renderFileTree = (items: FileEntry[], level = 0) => {
    return items.map((item) => (
      <div key={item.path}>
        <div
          className={`flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-[var(--bg-tertiary)] rounded text-sm ${selectedPath === item.path ? 'bg-[var(--bg-tertiary)]' : ''
            }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={async () => {
            selectPath(item.path);
            if (item.isDirectory) {
              toggleDir(item.path);
            } else {
              // Only switch to the editor when the file actually opened —
              // a failed open shows the error instead of an empty editor.
              const opened = await openFile(item.path);
              if (opened) {
                onViewChange('editor');
              }
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            selectPath(item.path);
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
              <File size={14} className="text-[var(--text-muted)] flex-shrink-0" />
            </>
          )}
          <span className="truncate text-[var(--text-primary)]">{item.name}</span>
        </div>
        {item.isDirectory && expandedDirs.has(item.path) && item.children && (
          <div>
            {renderFileTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="flex h-full">
      {/* Icon Bar */}
      <div className="w-12 h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1">
        <Tooltip content="Terminal" placement="right">
          <button
            onClick={() => onViewChange('terminal')}
            className={`p-2 rounded-md transition-colors ${currentView === 'terminal'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
          >
            <Terminal size={20} />
          </button>
        </Tooltip>

        <Tooltip content="Editor" placement="right">
          <button
            onClick={() => onViewChange('editor')}
            className={`p-2 rounded-md transition-colors ${currentView === 'editor'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
          >
            <FileCode size={20} />
          </button>
        </Tooltip>


        {/* Sidebar panels: Explorer (file tree) and, directly under
            it, the chats (paper). These switch the sidebar panel, not
            the main view — Terminal / Editor / Synth above switch the
            view. */}
        <Tooltip content="Explorer" placement="right">
          <button
            onClick={() => setActivePanel('explorer')}
            className={`p-2 rounded-md transition-colors ${activePanel === 'explorer'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            aria-label="Explorer"
          >
            <FolderOpen size={20} />
          </button>
        </Tooltip>

        <Tooltip content="Chats" placement="right" shortcut="Cmd+B">
          <button
            onClick={() => setActivePanel('history')}
            className={`p-2 rounded-md transition-colors ${activePanel === 'history'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            aria-label="Chats"
          >
            <FileText size={20} />
          </button>
        </Tooltip>

        <div className="flex-1" />

        {/* Toolbar plugins — one button per plugin toggled on in
            Settings. The section sits above Settings and grows taller
            per plugin (the flex-1 spacer above shrinks as it grows).
            The separation line divides it from Settings. */}
        {enabledPlugins.length > 0 && (
          <>
            <div className="flex flex-col items-center gap-1">
              {enabledPlugins.map((plugin) => {
                const Icon = plugin.icon;
                // 'forge' is not in the View union yet - see
                // FORGE-PATCH-types-index.md. The cast is temporary.
                const isActive = plugin.action === 'synth' ? currentView === 'synth' : plugin.action === 'forge' ? (currentView as string) === 'forge' : showAI;
                const onClick = plugin.action === 'synth' ? (onToggleSynth ?? (() => onViewChange('synth'))) : plugin.action === 'forge' ? (onToggleForge ?? (() => onViewChange('forge' as View))) : onToggleAI;
                return (
                  <Tooltip key={plugin.id} content={`${plugin.name} — ${plugin.description}`} placement="right">
                    <button
                      onClick={onClick}
                      className={`p-2 rounded-md transition-colors ${isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      aria-label={plugin.name}
                    >
                      <Icon size={20} />
                    </button>
                  </Tooltip>
                );
              })}
            </div>
            <div className="lucid-color-shift my-1 h-px w-8" aria-hidden="true" />
          </>
        )}

        <Tooltip content="Settings" placement="right">
          <button
            onClick={() => onViewChange('settings')}
            className={`p-2 rounded-md transition-colors ${currentView === 'settings'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
          >
            <Settings size={20} />
          </button>
        </Tooltip>
      </div>

      {/* Sidebar panel — Explorer or chats. One at a time; the icon
          bar's Explorer / paper buttons switch between them. */}
      {activePanel === 'explorer' ? (
      <div
        className="h-full bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col"
        style={{ width: width - 48 }}
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
        <div className="flex-1 overflow-y-auto py-1">
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
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Folder is empty</p>
              ) : (
                renderFileTree(entries)
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <FolderOpen size={32} className="text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)] mb-3">No folder open</p>
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
      </div>
      ) : (
        <ConversationHistory
          blocks={historyBlocks}
          onJumpToBlock={handleJumpToBlock}
          onClearHistory={handleClearHistory}
          width={historyWidth}
        />
      )}

      {/* Resize Handle — resizes whichever panel is active: the
          Explorer (the sidebar width, 200–400) or the chats (the
          history width, 240–480; default 320 = w-80). The collapsed
          tick rail is fixed w-12. */}
      <div
        className="w-1 resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const isHistory = activePanel === 'history';
          const startWidth = isHistory ? historyWidth : width;

          const onMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            if (isHistory) {
              setHistoryWidth(Math.max(240, Math.min(480, startWidth + delta)));
            } else {
              onWidthChange(Math.max(200, Math.min(400, startWidth + delta)));
            }
          };

          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      />
    </div>
  );
}

export default Sidebar;
