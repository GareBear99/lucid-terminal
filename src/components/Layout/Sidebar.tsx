import { useEffect, useRef, useState, Fragment } from 'react';
import {
  FolderOpen,
  Terminal,
  Settings,
  FileCode,
  History,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Pencil,
  Trash2,
  X,
  Users,
} from 'lucide-react';
import { useEventLogStore } from '../../stores/eventLogStore';
import { useFileStore } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useHistoryStore, selectHistoryBlocksForTab, jumpToBlock } from '../../stores/historyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { enabledToolbarPlugins } from '../../data/toolbarPlugins';
import { isLuciferAiEnabled } from '../../lib/luciferAi';
import { resolveToolbarOrder, moveToolbarIcon } from '../../lib/toolbarOrder';
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
  /** Open the blood drop terminal (the blood-drop toolbar button's action, Gary 2026-11-07 ~09:18 PST — both blood drops go to the same creation place). */
  onOpenBloodDrop?: () => void;
  /** Whether the blood drop is disabled (silenced): while silenced the toolbar blood drop button disappears entirely (Gary, 2026-11-09 ~10:26 PST) — silently, no toast, no error, just absent. The Synth button stays (the homunculi are still active while silenced). */
  bloodDropDisabled?: boolean;
  /** Toggle the Synth view (the Synth toolbar button's action). */
  onToggleSynth?: () => void;
  /** Toggle the Forge view (the Forge toolbar button's action). */
  onToggleForge?: () => void;
  /** Open the Mouse segment (the Mouse toolbar button's action) —
      Settings at the Modules tab, where the Mouse segment lives. */
  onToggleMouse?: () => void;
  /** Toggle the Persona Plex setup page (the Persona Plex toolbar button's action). */
  onTogglePersonaPlex?: () => void;
  /** Toggle the Settings view (the Settings toolbar button's action). */
  onToggleSettings?: () => void;
}

function Sidebar({ width, onWidthChange, currentView, onViewChange, showAI, onToggleAI, onOpenBloodDrop, bloodDropDisabled, onToggleSynth, onToggleForge, onToggleMouse, onTogglePersonaPlex, onToggleSettings }: SidebarProps) {
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

  // Sidebar panel: the file Explorer or History. History used to live
  // inside the Terminal view; it is a main-sidebar panel now, on the
  // History button under the Explorer button. Default is History —
  // it was visible by default before the move. There is NO closed
  // state: a second click on the rail button MINIMIZES the panel to
  // its w-12 rail, it never deletes it off Lucid (Gary, 2026-11-13
  // ~16:24 PST: "why isnt it minimized it deletes it" / "we
  // specifically said not to do that"). The old null state (added
  // 2026-11-13, unmounting the panel on second click) was the bug.
  type SidebarPanel = 'explorer' | 'history';
  const [activePanel, setActivePanel] = useState<SidebarPanel>('history');
  // Collapsed (minimized) per panel — the w-12 rail instead of the
  // expanded panel. This lives HERE, not inside the panel content,
  // so the toolbar icon can set it AND it survives panel switches
  // (the old local useState inside ConversationHistory reset on
  // every switch, and the rail icon couldn't touch it at all).
  const [collapsedPanels, setCollapsedPanels] = useState<{ history: boolean; explorer: boolean }>({
    history: false,
    explorer: false,
  });
  // Toggle a panel from its toolbar button: pressing the open
  // panel's button minimizes it to its rail; pressing it while
  // minimized expands it back. Switching to a different panel shows
  // it in whatever collapsed state it was left in — the collapse
  // SURVIVES panel switches (it lives here, not in the panel
  // content). Never unmounts the panel.
  const togglePanel = (panel: 'history' | 'explorer') => {
    if (activePanel !== panel) {
      setActivePanel(panel);
    } else {
      setCollapsedPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
    }
  };
  // Expanded chats width in px (w-80 = 320, the History's standard
  // width). The collapsed tick rail stays w-12 regardless; the resize
  // handle adjusts this while the chats panel is active.
  const [historyWidth, setHistoryWidth] = useState(320);

  // The active tab's blocks — what the chats panel shows. Only the
  // active tab's blocks, never all tabs flattened together. During
  // a guest session the selector returns nothing: a guest has no
  // history (the guest's own live blocks stay in the terminal
  // feed, which reads blocksByTab directly).
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const historyBlocks = useHistoryStore((s) =>
    selectHistoryBlocksForTab(s, activeTabId),
  );

  // Toolbar plugins — the plugins section above Settings. One button
  // per plugin toggled on in Settings; the section grows taller per
  // plugin. The Synth button moved here from its old spot after
  // Editor: it is the LuciferAI plugin's shell, so it belongs with
  // the plugins, not the core view buttons.
  const toolbarPlugins = useSettingsStore((s) => s.settings.toolbarPlugins);
  const luciferAiEnabled = useSettingsStore((s) => isLuciferAiEnabled(s.settings));
  // Disabled: the Synth and blood drop buttons are LuciferAI surfaces,
  // so they leave the toolbar with the plugin. Forge is a different
  // plugin (LLMBuilder) and stays — and so does AI Chat, which is
  // Lucid AI, its own plugin now (Gary, 2026-11-07), not a
  // LuciferAI surface.
  // Silenced (Gary, 2026-11-09 ~10:26 PST): while the blood drop is
  // disabled (silenced), the toolbar blood drop button disappears
  // too — silently, no toast, no error, just absent (the same
  // silent-filter pattern as the plugin-off case above). The Synth
  // button STAYS while silenced: the homunculi still show and are
  // active while silenced (Gary, 2026-11-09 ~02:30 PST).
  const enabledPlugins = enabledToolbarPlugins(toolbarPlugins).filter(
    (plugin) =>
      (luciferAiEnabled || (plugin.action !== 'synth' && plugin.action !== 'help')) &&
      (plugin.action !== 'help' || !bloodDropDisabled),
  );

  // --- Toolbar icon order + drag-reorder (Gary, 2026-11-06) --------
  // The order is the resolved order of icon ids from the stored
  // `toolbarOrder` setting plus the icons available right now (core
  // icons always; a plugin icon only while its button is enabled).
  // The 'spacer' entry renders the flexible gap. The stored order is
  // the single source of truth — there is no separate local copy.
  // Persona Plex — an add-on, not a toolbar plugin: its icon shows
  // only while the add-on is installed (user-installed, no anchor).
  // Install is the ONLY condition (Gary, 2026-11-07 ~06:22 PST):
  // Persona Plex is an add-on, not a LuciferAI surface, so its icon
  // stays while LuciferAI is disabled — disabling the plugin used to
  // take it out as if it belonged to it, which was the bug. (AI Chat
  // is the same shape: its own plugin, icon stays with LuciferAI off.)
  const installedAddons = useSettingsStore((s) => s.settings.installedAddons ?? []);
  const personaPlexInstalled = installedAddons.includes('persona-plex');
  const storedToolbarOrder = useSettingsStore((s) => s.settings.toolbarOrder);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const availableToolbarIcons: string[] = [
    'terminal',
    'editor',
    'explorer',
    'history',
    ...enabledPlugins.map((p) => p.id),
    ...(personaPlexInstalled ? ['persona-plex'] : []),
    'settings',
  ];
  const toolbarOrder = resolveToolbarOrder(storedToolbarOrder, availableToolbarIcons);
  const [draggedToolbarIcon, setDraggedToolbarIcon] = useState<string | null>(null);
  const [dropToolbarTarget, setDropToolbarTarget] = useState<string | null>(null);
  // Pointer-drag state (refs, not state — the press is tracked
  // without re-rendering on every move; the state above only drives
  // the drop indicator + the dragged opacity).
  // press: the slot the pointer went down on + where. dragging: a
  // drag is in progress (movement passed the threshold).
  // justDragged: set on a drag release so the click that follows a
  // same-slot release is swallowed (a drag is not a click); cleared
  // on the next press. dropTarget: the commit form of the drop
  // target — {targetId, insertAfter} or null for no target — kept
  // in a ref so the pointerup handler reads the CURRENT target
  // instead of the stale closure from press time.
  const dragPressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggingToolbarRef = useRef(false);
  const justDraggedRef = useRef(false);
  const dropTargetRef = useRef<{ targetId: string | null; insertAfter: boolean } | null>(null);
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  // Drag-reorder (Gary, 2026-11-06; the 500ms hold gate was REMOVED
  // 2026-11-07): a completed drag onto a different slot commits on
  // drop. The old 500ms press-and-hold gate silently rejected every
  // natural quick drag (~200-400ms), so the icons "didn't move"
  // (Gary, 2026-11-07, real mouse) — the gate is gone, a completed
  // drop on a different slot always commits.
  // The reorder runs on POINTER events, not native HTML5 drag-and-
  // drop (Gary, 2026-11-13). Native DnD broke real presses: the
  // slots were draggable, so a normal press that moved a few pixels
  // fired dragstart and the click never ran — the panel didn't
  // toggle for Gary, while agent clicks (zero movement) always
  // worked. Threshold-gating the draggable attribute does NOT fix
  // it: measured in real Chromium (2026-11-13, Playwright probe),
  // the browser decides drag-or-click ONCE, when movement crosses
  // its ~4px hysteresis — arming draggable after that never starts
  // a drag, so slow drags silently did nothing. Pointer events own
  // the threshold instead: a press is a click until it has moved
  // DRAG_START_THRESHOLD_PX, then it is a drag. A 5px press still
  // toggles; a deliberate drag still reorders.
  // Whether the drop will land AFTER the hovered icon (the pointer
  // is in its lower half) rather than before it. A drag DOWN onto
  // the icon immediately below the dragged one lands after it (they
  // swap); without this, that drop was a silent no-op — inserting
  // before the next icon is the order you already have — which
  // reads as "the icons don't move". The accent line renders below
  // the target when this is true, above it otherwise.
  // A normal press moves 1-5px; a deliberate drag moves 20px+ (a
  // slot is ~40px tall). 8px sits between them with margin on both
  // sides.
  const DRAG_START_THRESHOLD_PX = 8;
  const [dropToolbarInsertAfter, setDropToolbarInsertAfter] = useState(false);

  // Where the drop lands relative to the target slot: the pointer's
  // position within the slot. Lower half -> after the target, upper
  // half -> before it. No usable geometry (e.g. jsdom, where rects
  // are all zeros) -> before it, the long-standing behaviour, so
  // existing tests keep passing unchanged.
  const dropInsertAfterFromPointerEvent = (e: React.PointerEvent): boolean => {
    const target = e.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.height <= 0) return false;
    return e.clientY > rect.top + rect.height / 2;
  };

  // Commit a completed drop: move the dragged icon to the target
  // and STORE the new order immediately — one updateSetting call
  // persists it (settings IPC) and updates the store state, so the
  // new order survives a reload (updated AND stored, not
  // updated-only). A completed drop on a different slot always
  // commits — there is no hold gate here any more: the 500ms gate
  // silently rejected every natural quick drag, so the icons
  // "didn't move".
  const commitToolbarDrop = async (
    draggedId: string | null,
    targetId: string | null,
    insertAfter: boolean,
  ) => {
    if (!draggedId || draggedId === targetId) return;
    const next = moveToolbarIcon(toolbarOrder, draggedId, targetId, insertAfter);
    if (next.join(',') === toolbarOrder.join(',')) return;
    await updateSetting('toolbarOrder', [...next]);
  };

  // Clear the drag state (indicator + dragged opacity + target).
  const clearToolbarDragState = () => {
    setDropToolbarInsertAfter(false);
    setDraggedToolbarIcon(null);
    setDropToolbarTarget(null);
    dropTargetRef.current = null;
  };

  // Set the drop target during a drag, in both forms: the display
  // target (drives the accent line; the end zone shows as 'end')
  // and the commit target (null = append at the very bottom).
  const setToolbarDropTarget = (targetId: string | null, insertAfter: boolean) => {
    setDropToolbarTarget(targetId ?? 'end');
    setDropToolbarInsertAfter(insertAfter);
    dropTargetRef.current = { targetId, insertAfter };
  };

  // Pointer-press tracking for a slot (see toolbarIconSlot). A press
  // is a click until it moves past DRAG_START_THRESHOLD_PX — then
  // it becomes a drag. Primary button only; the blood drop ('help')
  // is never draggable, so its press is never tracked.
  const startToolbarDragPress = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0 || id === 'help') return;
    justDraggedRef.current = false;
    dragPressRef.current = { id, x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const press = dragPressRef.current;
      if (!press) return;
      if (!draggingToolbarRef.current) {
        const moved = Math.max(Math.abs(ev.clientX - press.x), Math.abs(ev.clientY - press.y));
        if (moved <= DRAG_START_THRESHOLD_PX) return;
        draggingToolbarRef.current = true;
        setDraggedToolbarIcon(press.id);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragListenersRef.current = null;
      const press = dragPressRef.current;
      dragPressRef.current = null;
      if (!draggingToolbarRef.current) return; // plain press — the button's click fires normally
      draggingToolbarRef.current = false;
      const target = dropTargetRef.current;
      clearToolbarDragState();
      // A drag release is not a click: swallow the click that
      // follows a same-slot release (mousedown + mouseup on one
      // slot still produces a click). A release over another slot
      // produces no button click anyway — the flag is cleared on
      // the next press, so it can never leak into a later click.
      justDraggedRef.current = true;
      if (press && target) {
        void commitToolbarDrop(press.id, target.targetId, target.insertAfter);
      }
    };
    dragListenersRef.current = { move: onMove, up: onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // If the Sidebar unmounts mid-press, drop the window listeners.
  useEffect(() => {
    return () => {
      const listeners = dragListenersRef.current;
      if (!listeners) return;
      window.removeEventListener('pointermove', listeners.move);
      window.removeEventListener('pointerup', listeners.up);
      window.removeEventListener('pointercancel', listeners.up);
      dragListenersRef.current = null;
    };
  }, []);

  // The button for one toolbar icon id. Core icons switch views or
  // sidebar panels; plugin icons come from the enabled plugins. The
  // The Synth and blood drop buttons are SEPARATE (Gary, 2026-11-06):
  // the Synth button (Orbit) opens the Synth view, the blood drop
  // opens the blood drop terminal (Gary, 2026-11-07 ~09:18 PST —
  // both blood drops go to the same creation place). The drop was
  // the Synth button until it was repurposed, which left the Synth
  // with no icon at all. Both buttons only render while LuciferAI
  // is enabled (the filter above), so neither shows while the plugin
  // is disabled.
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
            // Second click deactivates: nowhere to go, so land on the
            // Terminal page (Gary, 2026-11-13 ~16:31 PST: "default
            // when clicked off a tab icon in toolbar and no where to
            // go like in files tabs case it should go to the
            // terminal icons page"). Terminal is the default/home
            // landing — the same fallback the Synth/Forge/Settings/
            // Persona Plex toggles already use in App.tsx.
            <button onClick={() => onViewChange(currentView === 'editor' ? 'terminal' : 'editor')} className={btnClass(currentView === 'editor')}>
              <FileCode size={20} />
            </button>
          ),
        };
      case 'explorer':
        return {
          tooltip: 'Explorer',
          button: (
            <button onClick={() => togglePanel('explorer')} className={btnClass(activePanel === 'explorer')} aria-label="Explorer">
              <FolderOpen size={20} />
            </button>
          ),
        };
      case 'history':
        return {
          tooltip: 'History',
          shortcut: 'Cmd+B',
          button: (
            <button onClick={() => togglePanel('history')} className={btnClass(activePanel === 'history')} aria-label="History">
              <History size={20} />
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
        // The blood drop is not a view toggle, so it is never the
        // "active" view button. Forge and Synth toggle views; the
        // AI Chat button is active while its panel is open. The
        // Mouse button is active while the Settings view is open
        // (it lands on the Modules tab, where the Mouse segment
        // lives); it is not a LuciferAI surface, so it stays with
        // the plugin off, like AI Chat and Forge.
        const isActive =
          plugin.action === 'synth'
            ? currentView === 'synth'
            : plugin.action === 'forge'
              ? currentView === 'forge'
              : plugin.action === 'mouse'
                ? currentView === 'settings'
                : plugin.action === 'help'
                  ? false
                  : showAI;
        const onClick =
          plugin.action === 'synth'
            ? (onToggleSynth ?? (() => onViewChange('synth')))
            : plugin.action === 'forge'
              ? (onToggleForge ?? (() => onViewChange('forge')))
              : plugin.action === 'mouse'
                ? (onToggleMouse ?? (() => onViewChange('settings')))
                : plugin.action === 'help'
                  ? (onOpenBloodDrop ?? (() => {}))
                  : onToggleAI;
        // The icon comes from the plugin entry itself: Orbit for the
        // Synth, the blood drop for the blood drop terminal.
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

  // One toolbar icon slot. The drag handle is the whole slot; the
  // accent line shows where a dropped icon will land — above the
  // hovered icon when the pointer is in its upper half (insert
  // before it), below it when the pointer is in its lower half
  // (insert after it). The line is always solid: a drop on this
  // slot always commits (no hold gate any more), so the line going
  // solid is the signal that the reorder will stick.
  // The blood drop is LOCKED to the top spot (Gary,
  // 2026-11-07): its slot is never draggable — the user can't even
  // start dragging it — but its click behaviour (opens the blood
  // drop terminal) is unchanged. It is still a drop TARGET
  // (dropping another icon onto it lands that icon right after it,
  // at index 1).
  const toolbarIconSlot = (id: string) => {
    const entry = toolbarIconButton(id);
    if (!entry) return null;
    const isDropTarget = dropToolbarTarget === id;
    const isDragging = draggedToolbarIcon === id;
    return (
      <div
        data-toolbar-icon={id}
        className={`relative ${isDragging ? 'opacity-40' : ''}`}
        // NOT draggable: native HTML5 drag-and-drop is gone — a
        // draggable slot fired dragstart on a normal press and the
        // click never ran (Gary, 2026-11-13). The slot is never
        // draggable; the drag starts on pointer movement past the
        // threshold instead (see startToolbarDragPress).
        draggable={false}
        onPointerDown={(e) => startToolbarDragPress(id, e)}
        onPointerOver={(e) => {
          if (!draggingToolbarRef.current) return;
          // Midpoint-aware drop: the pointer's half of the target
          // decides whether the icon lands before or after it.
          setToolbarDropTarget(id, dropInsertAfterFromPointerEvent(e));
        }}
        onClickCapture={(e) => {
          // Swallow the click that follows a drag release on this
          // slot — a drag is not a click (see startToolbarDragPress).
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {isDropTarget && (
          <div className={`absolute ${dropToolbarInsertAfter ? '-bottom-0.5' : '-top-0.5'} left-1 right-1 h-0.5 rounded bg-[var(--accent)]`} aria-hidden="true" />
        )}
        <Tooltip content={entry.tooltip} placement="right" shortcut={entry.shortcut}>
          {entry.button}
        </Tooltip>
      </div>
    );
  };

  // Cmd+B / Ctrl+B toggles the active panel between expanded and
  // minimized — the same as pressing its toolbar icon. This was the
  // History toggle inside the Terminal; the panel lives here now, so
  // the shortcut lives here too (one listener, not one per terminal
  // tab). It never deletes the panel: the old cycle (History ->
  // Explorer -> History, via a null closed state) unmounted the
  // panel, which Gary corrected (2026-11-13: minimize, not delete).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsedPanels((prev) => ({
          ...prev,
          [activePanel]: !prev[activePanel],
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePanel]);

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
              await toggleDir(item.path);
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
              <File size={14} className="text-[var(--text-muted)] flex-shrink-0" />
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
          bottom to put it last. A drop on a different slot STORES
          the new order immediately (updated AND stored). A plain
          click still activates the icon — it never reorders. */}
      <div
        className="w-12 h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1"
        onPointerLeave={() => {
          // Leaving the rail mid-drag clears the drop target —
          // dropping outside the rail is a no-op, not a reorder.
          if (!draggingToolbarRef.current) return;
          clearToolbarDragState();
        }}
      >
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
                onPointerOver={() => {
                  if (!draggingToolbarRef.current) return;
                  setToolbarDropTarget('spacer', true);
                }}
              >
                {isDropTarget && (
                  <div className="absolute top-0 left-1 right-1 h-0.5 rounded bg-[var(--accent)]" aria-hidden="true" />
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
            toolbarOrder.slice(0, entryIdx).some((id) => id === 'synth' || id === 'help' || id === 'ai-chat' || id === 'llmbuilder' || id === 'mouse' || id === 'persona-plex');
          return (
            <Fragment key={entry}>
              {showDivider && <div className="lucid-color-shift my-1 h-px w-8" aria-hidden="true" />}
              {slot}
            </Fragment>
          );
        })}
        {/* End zone — drop here to append at the very bottom. Only a
            drop target while a drag is in progress. The height is
            ALWAYS h-6, never h-0 when idle (Gary, 2026-11-07): the
            height is reserved so the layout never shifts when a drag
            starts. Growing it on drag start shrank the flex spacer
            and shifted every icon below the spacer up 24px mid-drag,
            so the drop targets went stale — the top icons (above the
            spacer) worked, the bottom plugin icons didn't (Gary's
            real mouse, 2026-11-07). Reserving the height keeps the
            layout still for the whole drag. */}
        <div
          data-toolbar-icon="end"
          className={`w-full shrink-0 h-6 ${
            dropToolbarTarget === 'end' ? 'bg-[var(--bg-tertiary)]' : ''
          }`}
          onPointerOver={() => {
            if (!draggingToolbarRef.current) return;
            setToolbarDropTarget(null, true);
          }}
          aria-hidden="true"
        />
      </div>

      {/* Sidebar panel — Explorer or History, docked in the flex row
          beside the icon bar (never a hover overlay). One at a time;
          the icon bar's Explorer / History buttons switch between
          them, and a second click on the open panel's button
          MINIMIZES it to its w-12 rail — the panel is never deleted
          (Gary, 2026-11-13: minimize, not delete). The collapse
          state lives in Sidebar so it survives panel switches. */}
      {activePanel === 'explorer' && collapsedPanels.explorer && (
        // Minimized Explorer: the same w-12 rail shape as History's
        // collapsed rail — a chevron to expand back. (Explorer has
        // no chat ticks; the rail just holds the panel's place.)
        <div className="h-full w-12 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-3">
          <Tooltip content="Show explorer" placement="right">
            <button
              onClick={() => setCollapsedPanels((prev) => ({ ...prev, explorer: false }))}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
              aria-label="Show explorer"
            >
              <ChevronRight size={20} className="text-[var(--text-muted)]" />
            </button>
          </Tooltip>
        </div>
      )}
      {activePanel === 'explorer' && !collapsedPanels.explorer && (
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
                <p className="px-3 py-2 text-xs leading-[1.5] text-[var(--text-muted)]">Folder is empty</p>
              ) : (
                renderFileTree(entries)
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
      </div>
      )}
      {activePanel === 'history' && (
        <ConversationHistory
          blocks={historyBlocks}
          onJumpToBlock={handleJumpToBlock}
          onClearHistory={handleClearHistory}
          width={historyWidth}
          collapsed={collapsedPanels.history}
          onToggleCollapsed={(collapsed) =>
            setCollapsedPanels((prev) => ({ ...prev, history: collapsed }))
          }
        />
      )}

      {/* Resize Handle — resizes whichever panel is active: the
          Explorer (the sidebar width, 200–400) or History (the
          history width, 240–480; default 320 = w-80). The collapsed
          rails are fixed w-12, so the handle does nothing visible
          while a panel is minimized. There is always a panel open,
          so the handle is always here. */}
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

      {/* Explorer context menu — Delete / Rename for the right-clicked
          tree item. Fixed overlay: any click outside closes it. */}
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

export default Sidebar;
