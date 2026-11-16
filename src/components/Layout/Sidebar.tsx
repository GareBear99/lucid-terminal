import { useEffect, useRef, useState, Fragment } from 'react';
import {
  FolderOpen,
  BookOpen,
  Terminal,
  Settings,
  FileCode,
  History,
  ChevronRight,
  Minus,
  Users,
  Globe,
} from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';
import { useHistoryStore, selectHistoryBlocksForTab, jumpToBlock } from '../../stores/historyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { enabledToolbarPlugins } from '../../data/toolbarPlugins';
import { PLUGIN_ADDONS, isAddonInstalled } from '../../data/pluginAddons';
import { CUSTOM_PLUGINS, isCustomPluginEnabled } from '../../data/customPlugins';
import { isLuciferAiEnabled } from '../../lib/luciferAi';
import { resolveToolbarOrder, moveToolbarIcon } from '../../lib/toolbarOrder';
import { ConversationHistory } from '../Sidebar/ConversationHistory';
import { ExplorerPanel } from '../Sidebar/ExplorerPanel';
import { DocsPanel } from '../Sidebar/DocsPanel';
import { subscribeDocsPanelRequest } from '../../lib/docsPanelRequest';
import { Tooltip } from '../Tooltip/Tooltip';
import { View } from '../../types';

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
  /** Toggle the full-screen worldmap view (the Worldmap toolbar button's action). */
  onToggleWorldmap?: () => void;
  /** Toggle the Settings view (the Settings toolbar button's action). */
  onToggleSettings?: () => void;
}

function Sidebar({ width, onWidthChange, currentView, onViewChange, showAI, onToggleAI, onOpenBloodDrop, bloodDropDisabled, onToggleSynth, onToggleForge, onToggleMouse, onTogglePersonaPlex, onToggleWorldmap, onToggleSettings }: SidebarProps) {

  // Sidebar panel: the file Explorer, History, or Docs (the docs
  // panel — Kite mapping #4, the sidebar pattern — shows the
  // documentation for the symbol under the editor's cursor).
  // History used to live
  // inside the Terminal view; it is a main-sidebar panel now, on the
  // History button under the Explorer button. Default is History —
  // it was visible by default before the move. There is NO closed
  // state: a second click on the rail button MINIMIZES the panel to
  // its w-12 rail, it never deletes it off Lucid (Gary, 2026-11-13
  // ~16:24 PST: "why isnt it minimized it deletes it" / "we
  // specifically said not to do that"). The old null state (added
  // 2026-11-13, unmounting the panel on second click) was the bug.
  type SidebarPanel = 'explorer' | 'history' | 'docs';
  const [activePanel, setActivePanel] = useState<SidebarPanel>('history');
  // Collapsed (minimized) per panel — the w-12 rail instead of the
  // expanded panel. This lives HERE, not inside the panel content,
  // so the toolbar icon can set it AND it survives panel switches
  // (the old local useState inside ConversationHistory reset on
  // every switch, and the rail icon couldn't touch it at all).
  const [collapsedPanels, setCollapsedPanels] = useState<{ history: boolean; explorer: boolean; docs: boolean }>({
    history: false,
    explorer: false,
    docs: false,
  });
  // Toggle a panel from its toolbar button: pressing the open
  // panel's button minimizes it to its rail; pressing it while
  // minimized expands it back. Switching to a different panel shows
  // it in whatever collapsed state it was left in — the collapse
  // SURVIVES panel switches (it lives here, not in the panel
  // content). Never unmounts the panel.
  const togglePanel = (panel: 'history' | 'explorer' | 'docs') => {
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
  // Offline Worldmap — an add-on + plugin, not a toolbar plugin:
  // its icon shows only while the add-on is installed AND its
  // custom-plugin toggle is on (the same gate as the view
  // itself). It is an add-on, not a LuciferAI surface, so its
  // icon stays while LuciferAI is disabled (Gary, 2026-11-15).
  const worldmapAddon = PLUGIN_ADDONS.find((addon) => addon.id === 'offline-worldmap');
  const worldmapPlugin = CUSTOM_PLUGINS.find((plugin) => plugin.id === 'offline-worldmap');
  // Rules of Hooks (React #311, 2026-11-16): this subscription MUST
  // be called unconditionally, above the install gate below. It used
  // to live inside the `&&` chain (as the argument to
  // isCustomPluginEnabled), so it only ran while the worldmap was
  // installed — installing the add-on ADDED a hook to this
  // component's hook list mid-life, removing it REMOVED one, and
  // every hook below shifted a slot: the `useState` hooks landed on
  // slots held by non-state hooks and React threw minified error
  // #311 ("Should have a queue") on both Install and Remove. The
  // value is read here, the gate stays a pure boolean below.
  const customPlugins = useSettingsStore((s) => s.settings.customPlugins);
  const worldmapVisible =
    (worldmapAddon ? isAddonInstalled(worldmapAddon, installedAddons) : false) &&
    (worldmapPlugin ? isCustomPluginEnabled(worldmapPlugin, customPlugins) : false);
  const storedToolbarOrder = useSettingsStore((s) => s.settings.toolbarOrder);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  // Kite's docs-panel toggle (Atom steal #15): when the docs
  // panel is off, its toolbar icon leaves silently — the same
  // silent-filter pattern as the blood drop while silenced.
  // The stored order keeps the 'docs' entry, so re-enabling
  // puts the icon back where it was.
  const docsPanelEnabled = useSettingsStore((s) => s.settings.docsPanelEnabled !== false);
  const availableToolbarIcons: string[] = [
    'terminal',
    'editor',
    'explorer',
    'history',
    ...(docsPanelEnabled ? ['docs'] : []),
    ...enabledPlugins.map((p) => p.id),
    ...(personaPlexInstalled ? ['persona-plex'] : []),
    ...(worldmapVisible ? ['worldmap'] : []),
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
      case 'docs':
        return {
          tooltip: 'Docs',
          button: (
            <button onClick={() => togglePanel('docs')} className={btnClass(activePanel === 'docs')} aria-label="Docs">
              <BookOpen size={20} />
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
      case 'worldmap':
        return {
          tooltip: 'Offline Worldmap — maps with no server',
          button: (
            <button onClick={onToggleWorldmap ?? (() => onViewChange('worldmap'))} className={btnClass(currentView === 'worldmap')} aria-label="Offline Worldmap">
              <Globe size={20} />
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

  // The hover Docs link (Atom steal #7): the editor's link
  // opener asks for the docs panel — show it, un-collapsed,
  // with the hovered symbol (the cursor comes from the
  // docs-cursor bus, which the opener publishes first).
  // Kite's docs-panel toggle (steal #15): a request while
  // the panel is off is ignored, so a hover Docs link does
  // nothing while the panel is disabled.
  useEffect(() => {
    return subscribeDocsPanelRequest(() => {
      if (useSettingsStore.getState().settings.docsPanelEnabled === false) return;
      setActivePanel('docs');
      setCollapsedPanels((prev) => ({ ...prev, docs: false }));
    });
  }, []);

  // Turning the docs panel off while it is the active panel
  // falls back to the Explorer — the icon is gone, so the
  // panel must not be stranded open with no way back to it.
  useEffect(() => {
    if (!docsPanelEnabled) setActivePanel((prev) => (prev === 'docs' ? 'explorer' : prev));
  }, [docsPanelEnabled]);

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
            toolbarOrder.slice(0, entryIdx).some((id) => id === 'synth' || id === 'help' || id === 'ai-chat' || id === 'llmbuilder' || id === 'mouse' || id === 'persona-plex' || id === 'worldmap');
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
      {activePanel === 'docs' && collapsedPanels.docs && (
        // Minimized Docs: the same w-12 rail shape as Explorer's
        // collapsed rail — a chevron to expand back. (Docs has
        // no chat ticks; the rail just holds the panel's place.)
        <div className="h-full w-12 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-3">
          <Tooltip content="Show docs" placement="right">
            <button
              onClick={() => setCollapsedPanels((prev) => ({ ...prev, docs: false }))}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
              aria-label="Show docs"
            >
              <ChevronRight size={20} className="text-[var(--text-muted)]" />
            </button>
          </Tooltip>
        </div>
      )}
      {activePanel === 'explorer' && !collapsedPanels.explorer && (
        <ExplorerPanel
          width={width - 48}
          onMinimize={() => setCollapsedPanels((prev) => ({ ...prev, explorer: true }))}
          onOpenFile={() => onViewChange('editor')}
        />
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
      {activePanel === 'docs' && !collapsedPanels.docs && (
      <div
        className="h-full bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col"
        style={{ width: width - 48 }}
      >
        {/* Header — the same shape as the Explorer's. */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Docs
          </span>
          <div className="flex items-center gap-1">
            {/* Minimize — the dash collapses Docs to its w-12
                rail, the same minimize as the other panels,
                never a close or delete. The rail's chevron
                and the toolbar Docs icon bring it back. */}
            <Tooltip content="Minimize docs">
              <button
                onClick={() => setCollapsedPanels((prev) => ({ ...prev, docs: true }))}
                className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Minimize docs"
              >
                <Minus size={14} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* The docs for the symbol under the editor's cursor —
            a reader of the engine, never a writer. Clicking a
            location jumps to it in the editor (open-file
            funnel + editor-jump bus), like the Explorer's
            file click: switch to the editor only once the
            file is open. */}
        <div className="flex-1 overflow-y-auto">
          <DocsPanel onJumpToEditor={() => onViewChange('editor')} />
        </div>
      </div>
      )}

      {/* Resize Handle — resizes whichever panel is active: the
          Explorer or Docs (the sidebar width, 200–400) or
          History (the history width, 240–480; default 320 =
          w-80). The collapsed
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

    </div>
  );
}

export default Sidebar;
