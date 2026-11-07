import { useEffect, useState, useRef, Fragment, type DragEvent as ReactDragEvent } from 'react';
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
  Users,
} from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useHistoryStore, EMPTY_BLOCKS, jumpToBlock } from '../../stores/historyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { enabledToolbarPlugins } from '../../data/toolbarPlugins';
import { isLuciferAiEnabled } from '../../lib/luciferAi';
import { resolveToolbarOrder, moveToolbarIcon, TOOLBAR_HOLD_TO_DRAG_MS } from '../../lib/toolbarOrder';
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
  /** Open the Help modal (the blood-drop toolbar button's action). */
  onOpenHelp?: () => void;
  /** Toggle the Synth view (the Synth toolbar button's action). */
  onToggleSynth?: () => void;
  /** Toggle the Forge view (the Forge toolbar button's action). */
  onToggleForge?: () => void;
  /** Toggle the Persona Plex setup page (the Persona Plex toolbar button's action). */
  onTogglePersonaPlex?: () => void;
  /** Toggle the Settings view (the Settings toolbar button's action). */
  onToggleSettings?: () => void;
}

function Sidebar({ width, onWidthChange, currentView, onViewChange, showAI, onToggleAI, onOpenHelp, onToggleSynth, onToggleForge, onTogglePersonaPlex, onToggleSettings }: SidebarProps) {
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
  const luciferAiEnabled = useSettingsStore((s) => isLuciferAiEnabled(s.settings));
  // Disabled: the Synth, Help and AI Chat buttons are LuciferAI
  // surfaces, so they leave the toolbar with the plugin. Forge is a
  // different plugin (LLMBuilder) and stays.
  const enabledPlugins = enabledToolbarPlugins(toolbarPlugins).filter(
    (plugin) => luciferAiEnabled || (plugin.action !== 'synth' && plugin.action !== 'help' && plugin.action !== 'ai-chat'),
  );

  // --- Toolbar icon order + drag-reorder (Gary, 2026-11-06) --------
  // The order is the resolved order of icon ids from the stored
  // `toolbarOrder` setting plus the icons available right now (core
  // icons always; a plugin icon only while its button is enabled).
  // The 'spacer' entry renders the flexible gap. The stored order is
  // the single source of truth — there is no separate local copy.
  // Persona Plex — an add-on, not a toolbar plugin: its icon shows
  // only while the add-on is installed (user-installed, no anchor),
  // and (like AI Chat) only while LuciferAI is enabled.
  const installedAddons = useSettingsStore((s) => s.settings.installedAddons ?? []);
  const personaPlexInstalled = installedAddons.includes('persona-plex');
  const storedToolbarOrder = useSettingsStore((s) => s.settings.toolbarOrder);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const availableToolbarIcons: string[] = [
    'terminal',
    'editor',
    'explorer',
    'chats',
    ...enabledPlugins.map((p) => p.id),
    ...(personaPlexInstalled && luciferAiEnabled ? ['persona-plex'] : []),
    'settings',
  ];
  const toolbarOrder = resolveToolbarOrder(storedToolbarOrder, availableToolbarIcons);
  const [draggedToolbarIcon, setDraggedToolbarIcon] = useState<string | null>(null);
  const [dropToolbarTarget, setDropToolbarTarget] = useState<string | null>(null);
  // Click-hold to drag (Gary, 2026-11-06): when the user pressed on
  // an icon — the drop only COMMITS once the press has lasted the
  // hold threshold. The drag itself starts on movement (see
  // toolbarIconSlot): gating dragstart instead killed the drag for
  // the whole press whenever the user moved before the hold was
  // done, so a normal press-and-drag never reordered at all. A
  // plain click still activates the icon's normal action (no
  // movement, no drag, no drop).
  const mouseDownAtRef = useRef<number>(0);
  // Whether the hold has completed for the drag in progress — the
  // drop indicators render dimmed until it is, so the user can see
  // when a drop will stick. Armed from dragstart; cleared on
  // drop / drag end / unmount.
  const [dragHoldReady, setDragHoldReady] = useState(false);
  // Whether the drop will land AFTER the hovered icon (the pointer
  // is in its lower half) rather than before it. A drag DOWN onto
  // the icon immediately below the dragged one lands after it (they
  // swap); without this, that drop was a silent no-op — inserting
  // before the next icon is the order you already have — which
  // reads as "the icons don't move". The accent line renders below
  // the target when this is true, above it otherwise.
  const [dropToolbarInsertAfter, setDropToolbarInsertAfter] = useState(false);
  const dragHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDragHoldTimer = () => {
    if (dragHoldTimerRef.current !== null) {
      clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
  };

  // Never leave a hold timer running past unmount.
  useEffect(() => clearDragHoldTimer, []);

  // Where the drop lands relative to the target slot: the pointer's
  // position within the slot. Lower half -> after the target, upper
  // half -> before it. No usable geometry (e.g. jsdom, where rects
  // are all zeros) -> before it, the long-standing behaviour, so
  // existing tests keep passing unchanged.
  const dropInsertAfterFromEvent = (e: ReactDragEvent): boolean => {
    const target = e.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.height <= 0) return false;
    return e.clientY > rect.top + rect.height / 2;
  };

  // Drop: move the dragged icon to the target and STORE the new order
  // immediately — one updateSetting call persists it (settings IPC)
  // and updates the store state, so the new order survives a reload
  // (updated AND stored, not updated-only). The hold gate lives
  // HERE, not in dragstart: the drop only commits once the icon
  // has been held for TOOLBAR_HOLD_TO_DRAG_MS since the press, so
  // a quick flick (press-drag-drop inside the hold window) is
  // ignored and stores nothing, while a deliberate hold-drag
  // reorders and stores — even when the drag itself started before
  // the hold was done.
  const handleToolbarDrop = async (
    e: ReactDragEvent,
    targetId: string | null,
    insertAfter: boolean,
  ) => {
    e.preventDefault();
    const fromData = e.dataTransfer?.getData('text/plain') || undefined;
    const draggedId = fromData ?? draggedToolbarIcon;
    clearDragHoldTimer();
    setDragHoldReady(false);
    setDropToolbarInsertAfter(false);
    setDraggedToolbarIcon(null);
    setDropToolbarTarget(null);
    if (!draggedId || draggedId === targetId) return;
    // Click-HOLD to drag: the press must have lasted the hold
    // threshold by drop time, or the reorder does not commit.
    // (No press recorded — e.g. a programmatic drag — counts as
    // held: mouseDownAtRef starts at 0, so the elapsed time is
    // always past the threshold.)
    if (Date.now() - mouseDownAtRef.current < TOOLBAR_HOLD_TO_DRAG_MS) return;
    const next = moveToolbarIcon(toolbarOrder, draggedId, targetId, insertAfter);
    if (next.join(',') === toolbarOrder.join(',')) return;
    await updateSetting('toolbarOrder', [...next]);
  };

  const handleToolbarDragEnd = () => {
    clearDragHoldTimer();
    setDragHoldReady(false);
    setDropToolbarInsertAfter(false);
    setDraggedToolbarIcon(null);
    setDropToolbarTarget(null);
  };

  // The button for one toolbar icon id. Core icons switch views or
  // sidebar panels; plugin icons come from the enabled plugins. The
  // Synth and Help buttons are SEPARATE (Gary, 2026-11-06): the Synth
  // button (Orbit) opens the Synth view, the blood drop opens Help —
  // the drop was the Synth button until it was repurposed to Help,
  // which left the Synth with no icon at all. Both buttons only
  // render while LuciferAI is enabled (the filter above), so neither
  // shows while the plugin is disabled.
  const toolbarIconButton = (id: string): { button: React.ReactElement; tooltip: string; shortcut?: string } | null => {
    const btnClass = (isActive: boolean) =>
      `p-2 rounded-md transition-colors ${isActive
        ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
      }`;
    switch (id) {
      case 'terminal':
        return {
          tooltip: 'Terminal',
          button: (
            <button onClick={() => onViewChange('terminal')} className={btnClass(currentView === 'terminal')}>
              <Terminal size={20} />
            </button>
          ),
        };
      case 'editor':
        return {
          tooltip: 'Editor',
          button: (
            <button onClick={() => onViewChange('editor')} className={btnClass(currentView === 'editor')}>
              <FileCode size={20} />
            </button>
          ),
        };
      case 'explorer':
        return {
          tooltip: 'Explorer',
          button: (
            <button onClick={() => setActivePanel('explorer')} className={btnClass(activePanel === 'explorer')} aria-label="Explorer">
              <FolderOpen size={20} />
            </button>
          ),
        };
      case 'chats':
        return {
          tooltip: 'Chats',
          shortcut: 'Cmd+B',
          button: (
            <button onClick={() => setActivePanel('history')} className={btnClass(activePanel === 'history')} aria-label="Chats">
              <FileText size={20} />
            </button>
          ),
        };
      case 'settings':
        return {
          tooltip: 'Settings',
          button: (
            <button onClick={onToggleSettings ?? (() => onViewChange('settings'))} className={btnClass(currentView === 'settings')} aria-label="Settings">
              <Settings size={20} />
            </button>
          ),
        };
      case 'persona-plex':
        return {
          tooltip: 'Persona Plex — personas for the AI chat',
          button: (
            <button onClick={onTogglePersonaPlex ?? (() => onViewChange('persona-plex'))} className={btnClass(currentView === 'persona-plex')} aria-label="Persona Plex">
              <Users size={20} />
            </button>
          ),
        };
      default: {
        const plugin = enabledPlugins.find((p) => p.id === id);
        if (!plugin) return null;
        // Help opens a modal, not a view, so it is never the
        // "active" view button. Forge and Synth toggle views; the
        // AI Chat button is active while its panel is open.
        const isActive =
          plugin.action === 'synth'
            ? currentView === 'synth'
            : plugin.action === 'forge'
              ? currentView === 'forge'
              : plugin.action === 'help'
                ? false
                : showAI;
        const onClick =
          plugin.action === 'synth'
            ? (onToggleSynth ?? (() => onViewChange('synth')))
            : plugin.action === 'forge'
              ? (onToggleForge ?? (() => onViewChange('forge')))
              : plugin.action === 'help'
                ? (onOpenHelp ?? (() => {}))
                : onToggleAI;
        // The icon comes from the plugin entry itself: Orbit for the
        // Synth, the blood drop for Help.
        const Icon = plugin.icon;
        const label = plugin.name;
        const tooltip = `${plugin.name} — ${plugin.description}`;
        return {
          tooltip,
          button: (
            <button onClick={onClick} className={btnClass(isActive)} aria-label={label}>
              <Icon size={20} />
            </button>
          ),
        };
      }
    }
  };

  // One draggable icon slot. The drag handle is the whole slot; the
  // accent line shows where a dropped icon will land — above the
  // hovered icon when the pointer is in its upper half (insert
  // before it), below it when the pointer is in its lower half
  // (insert after it). The line is dimmed until the hold completes
  // (see dragHoldReady) — a drop before then does not commit, so
  // the line going solid is the signal that the reorder will stick.
  const toolbarIconSlot = (id: string) => {
    const entry = toolbarIconButton(id);
    if (!entry) return null;
    const isDropTarget = dropToolbarTarget === id;
    const isDragging = draggedToolbarIcon === id;
    return (
      <div
        data-toolbar-icon={id}
        className={`relative ${isDragging ? 'opacity-40' : ''}`}
        draggable
        onMouseDown={(e) => {
          // Record the press: dragstart below compares against it.
          if (e.button === 0) mouseDownAtRef.current = Date.now();
        }}
        onDragStart={(e) => {
          // Click-HOLD to drag (Gary, 2026-11-06): the drag starts
          // on movement — the HOLD is enforced at the drop, not
          // here. Cancelling dragstart for a short press killed the
          // drag for the whole press (the browser fires dragstart
          // once per press), so a normal press-and-drag never
          // reordered at all. The drop handler only commits once
          // the press has lasted TOOLBAR_HOLD_TO_DRAG_MS, so a
          // plain click (or an accidental nudge) still never
          // reorders — and still activates the icon on release.
          // dataTransfer is null in jsdom (no DataTransfer); the
          // dragged id also lives in state, so the drop falls back.
          if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
          }
          setDraggedToolbarIcon(id);
          // The drop indicators show the hold state: ready now if
          // the user already held the threshold before moving,
          // else ready when the threshold passes after the press.
          const remaining = TOOLBAR_HOLD_TO_DRAG_MS - (Date.now() - mouseDownAtRef.current);
          if (remaining <= 0) {
            setDragHoldReady(true);
          } else {
            dragHoldTimerRef.current = setTimeout(() => setDragHoldReady(true), remaining);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          setDropToolbarTarget(id);
          // Midpoint-aware drop: the pointer's half of the target
          // decides whether the icon lands before or after it.
          setDropToolbarInsertAfter(dropInsertAfterFromEvent(e));
        }}
        onDrop={(e) => handleToolbarDrop(e, id, dropInsertAfterFromEvent(e))}
        onDragEnd={handleToolbarDragEnd}
      >
        {isDropTarget && (
          <div className={`absolute ${dropToolbarInsertAfter ? '-bottom-0.5' : '-top-0.5'} left-1 right-1 h-0.5 rounded bg-[var(--accent)] ${dragHoldReady ? '' : 'opacity-40'}`} aria-hidden="true" />
        )}
        <Tooltip content={entry.tooltip} placement="right" shortcut={entry.shortcut}>
          {entry.button}
        </Tooltip>
      </div>
    );
  };

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
      {/* Icon Bar — drag-reorderable (Gary, 2026-11-06). The icons
          render from the resolved toolbar order (the stored
          `toolbarOrder` setting + the icons available now); drag an
          icon onto another to move it before that icon, onto the gap
          to put it just after the gap, or onto the strip at the very
          bottom to put it last. Click-HOLD to drag: hold the icon
          500ms first — the drop line is dimmed until the hold is
          done, and only a drop after the hold STORES the new order
          immediately (updated AND stored). */}
      <div className="w-12 h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1">
        {toolbarOrder.map((entry, entryIdx) => {
          if (entry === 'spacer') {
            // The flexible gap — a drop target (dropping on it puts the
            // icon just after the gap, at the start of the lower group).
            const isDropTarget = dropToolbarTarget === 'spacer';
            return (
              <div
                key="spacer"
                data-toolbar-icon="spacer"
                className="relative flex-1 w-full"
                onDragOver={(e) => {
                  if (!draggedToolbarIcon) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                  setDropToolbarTarget('spacer');
                }}
                onDrop={(e) => handleToolbarDrop(e, 'spacer', true)}
              >
                {isDropTarget && (
                  <div className={`absolute top-0 left-1 right-1 h-0.5 rounded bg-[var(--accent)] ${dragHoldReady ? '' : 'opacity-40'}`} aria-hidden="true" />
                )}
              </div>
            );
          }
          const slot = toolbarIconSlot(entry);
          if (!slot) return null;
          // The separation line sits above Settings when a plugin icon
          // precedes it (the old plugins-above-Settings divider).
          const showDivider =
            entry === 'settings' &&
            entryIdx > 0 &&
            toolbarOrder.slice(0, entryIdx).some((id) => id === 'synth' || id === 'help' || id === 'ai-chat' || id === 'llmbuilder' || id === 'persona-plex');
          return (
            <Fragment key={entry}>
              {showDivider && <div className="lucid-color-shift my-1 h-px w-8" aria-hidden="true" />}
              {slot}
            </Fragment>
          );
        })}
        {/* End zone — drop here to append at the very bottom. Only a
            drop target while a drag is in progress. */}
        <div
          data-toolbar-icon="end"
          className={`w-full shrink-0 ${draggedToolbarIcon ? 'h-6' : 'h-0'} ${
            dropToolbarTarget === 'end' ? `bg-[var(--bg-tertiary)]${dragHoldReady ? '' : ' opacity-40'}` : ''
          }`}
          onDragOver={(e) => {
            if (!draggedToolbarIcon) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            setDropToolbarTarget('end');
          }}
          onDrop={(e) => handleToolbarDrop(e, null, true)}
          aria-hidden="true"
        />
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
