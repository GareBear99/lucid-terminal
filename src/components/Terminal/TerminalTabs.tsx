import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, X, Terminal, Bell, Columns2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSplitPaneStore, findGroupForTab, groupTabIds, orderTabsForRender } from '../../stores/splitPaneStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useToastStore, unreadCount } from '../../stores/toastStore';
import { getTypeStyles } from './ErrorNotification';
import type { Notification } from './ErrorNotification';
import type { TerminalTab } from '../../types';
import { toDetachedTab } from '../../types/detach';
import { BloodDropIcon } from '../Layout/BloodDropIcon';
import { useTerminalTabDrag } from '../../lib/tabDrag';

/**
 * Terminal tab bar.
 *
 * The "+" (New Terminal) button lives INSIDE the tab strip, directly
 * after the last tab, so it is connected to the end tab and scrolls
 * with the strip. The right end of the bar holds the notifications
 * bell instead: it shows a badge with the unread count (red when an
 * unread error exists) and toggles a panel listing the notifications
 * from the toast store — the persistent home where a notification can
 * still be found after its toast has gone. Opening the panel marks
 * the listed notifications read (the badge clears).
 *
 * The toast overlay stack in App.tsx keeps working as before: a toast
 * auto-fades after its duration, which only hides it from the stack —
 * it stays in the store until dismissed or cleared from this panel.
 *
 * Split into a thin store-wired container (TerminalTabs) and a pure
 * presentational view (TerminalTabsView): the view takes its data as
 * props, so it is renderable in tests — zustand's useStore hook
 * returns the store's initial state under SSR, so a container that
 * reads the store cannot be rendered with set-up state.
 *
 * The strip shows terminal tabs ONLY (REBUILT 2026-11-13 ~08:21
 * PST per Gary — Warp's in-tab agent flow): the agent works IN a
 * tab, so there are no agent rows, no stack numbers for agent
 * sessions, nothing to select but tabs. ⌘1–⌘9 switch tabs.
 */
/**
 * A close the strip is asking about before it happens
 * (Gary, 2026-11-14): the detached tab x asks resnap-vs-close
 * every time, and the main-window x asks before closing a
 * USED tab. `kind` picks the question and the buttons.
 */
export type TabCloseAskKind = 'detached' | 'used';
export interface TabCloseAsk {
  tabId: string;
  title: string;
  kind: TabCloseAskKind;
}

export interface TerminalTabsViewProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  notifications: Notification[];
  notificationsOpen: boolean;
  onCreateTab: () => void;
  onCloseTab: (id: string) => void;
  /**
   * A pending close ask (Gary, 2026-11-14): the dialog the
   * strip shows before a close it was told to ask about.
   * Detached tabs ask resnap-vs-close-session every time;
   * used tabs in the main window ask close-vs-keep. Null
   * means no ask is showing. The container owns the state;
   * the view only renders it.
   */
  closeAsk?: TabCloseAsk | null;
  /** Detached ask: resnap the tab back to the main window. */
  onCloseAskResnap?: () => void;
  /** Detached ask: close the tab's session (destroy the PTY). */
  onCloseAskCloseSession?: () => void;
  /** Used-tab ask: close the tab (destroy the PTY / close the pane). */
  onCloseAskCloseTab?: () => void;
  /** Used-tab ask: keep the tab open. */
  onCloseAskKeepTab?: () => void;
  /** Backdrop / Escape: dismiss the ask — keep the tab, do nothing. */
  onDismissCloseAsk?: () => void;
  /**
   * Split panes (2026-11-14, sweep fix 2): split the active tab
   * vertically — a fresh tab (its own PTY) beside it. Shown only
   * in the main window; detached windows render one tab and show
   * no split control.
   */
  onSplitTab?: () => void;
  /**
   * Per-tab context menu (Atom steal #17 — tabs
   * punch-list): right-click a tab for Close Tab, Close
   * Other Tabs, Close Tabs to the Right, Reopen Closed Tab,
   * Split This Tab, and Copy Working Directory. All optional
   * so existing callers render the plain strip unchanged.
   */
  onSplitTabId?: (id: string) => void;
  onCloseOtherTabs?: (id: string) => void;
  onCloseTabsToTheRight?: (id: string) => void;
  onReopenClosedTab?: () => void;
  onCopyTabCwd?: (id: string) => void;
  showSplitButton?: boolean;
  /**
   * Tabs in the active tab's split group (empty when unsplit):
   * members other than the focused pane get a dim blue underline
   * so the strip shows which tabs are panes of the active split.
   */
  splitGroupTabIds?: string[];
  onRenameTab: (id: string, title: string) => void;
  onSelectTab: (id: string) => void;
  /**
   * Blood drop tab (Gary, 2026-11-07) — pinned first in the strip
   * while LuciferAI is enabled. Optional so existing callers render
   * the plain strip unchanged.
   */
  showBloodDrop?: boolean;
  bloodDropActive?: boolean;
  onBloodDropActiveChange?: (active: boolean) => void;
  /**
   * SILENCED (Gary, 2026-11-08 ~06:41 PST — potential daemon
   * only): the terminal link is disabled while silenced, so the
   * blood drop tab is INERT — clicking it does nothing, it does
   * not open the LuciferAI panel. The tab itself stays visible
   * (silenced is not off — the drop tab shows while LuciferAI is
   * enabled); only the click is dead. Defaults to false (live).
   */
  bloodDropDisabled?: boolean;
  onToggleNotifications: () => void;
  onDismissNotification: (id: string) => void;
  onClearAllNotifications: () => void;
  /**
   * The + button is shown in EVERY window, detached included
   * (Gary, 2026-11-13 — "ok i want it in the detached").
   * It used to be hidden in detached windows because a new tab
   * created there could take a number whose PTY already lives
   * in the main window, and createTerminal DESTROYS the
   * existing PTY first. That hazard is gone: every tab creation
   * is broadcast through main (terminal:reserve-number) and
   * every window seeds its numbers on mount
   * (terminal:get-reserved-numbers), so a fresh tab can never
   * take a number that already lives elsewhere.
   */
}

export function TerminalTabsView({
  tabs,
  activeTabId,
  notifications,
  notificationsOpen,
  onCreateTab,
  onCloseTab,
  closeAsk = null,
  onCloseAskResnap,
  onCloseAskCloseSession,
  onCloseAskCloseTab,
  onCloseAskKeepTab,
  onDismissCloseAsk,
  onSplitTab,
  onSplitTabId,
  onCloseOtherTabs,
  onCloseTabsToTheRight,
  onReopenClosedTab,
  onCopyTabCwd,
  showSplitButton = false,
  splitGroupTabIds = [],
  onRenameTab,
  onSelectTab,
  showBloodDrop = false,
  bloodDropActive = false,
  onBloodDropActiveChange,
  bloodDropDisabled = false,
  onToggleNotifications,
  onDismissNotification,
  onClearAllNotifications,
}: TerminalTabsViewProps) {
  const unread = unreadCount(notifications);
  const hasUnreadError = notifications.some((n) => !n.read && n.type === 'error');

  // Close ask: Escape dismisses — keep the tab, do nothing
  // (never a destructive default).
  useEffect(() => {
    if (!closeAsk) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissCloseAsk?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAsk, onDismissCloseAsk]);

  // Per-tab context menu (Atom steal #17): right-click a tab.
  // Clamped so the menu never opens off-screen; Escape or an
  // outside click dismisses it (never a destructive default).
  const [contextMenu, setContextMenu] = useState<{
    tab: TerminalTab;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextMenu]);

  // Inline rename: double-clicking a tab swaps its label for a text
  // field with the current name selected. Enter or clicking away
  // commits, Escape cancels.
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const cancelEditRef = useRef(false);

  // Tab detach + remount (Gary, 2026-11-09): pointer capture
  // lives on the BAR (it stays mounted for the whole drag —
  // the tab unmounts at detach), moves go to main, and main's
  // volley feedback lights this bar and shows the landing spot.
  const barRef = useRef<HTMLDivElement | null>(null);
  const drag = useTerminalTabDrag({ tabs, barRef });

  // The landing marker's x, measured from the live tab elements
  // (the strip scrolls, so the slots are read from the DOM, not
  // from the store order).
  const [markerLeft, setMarkerLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!drag.dropIndicator || !barRef.current) {
      setMarkerLeft(null);
      return;
    }
    const bar = barRef.current;
    const barRect = bar.getBoundingClientRect();
    const nodes = Array.from(bar.querySelectorAll('[data-tab-id]'));
    const index = drag.dropIndicator.index;
    let x: number;
    if (nodes.length === 0) {
      x = barRect.width / 2;
    } else if (index <= 0) {
      x = (nodes[0] as HTMLElement).getBoundingClientRect().left - barRect.left;
    } else if (index >= nodes.length) {
      const last = (nodes[nodes.length - 1] as HTMLElement).getBoundingClientRect();
      x = last.right - barRect.left;
    } else {
      x = (nodes[index] as HTMLElement).getBoundingClientRect().left - barRect.left;
    }
    setMarkerLeft(x);
  }, [drag.dropIndicator, tabs]);

  // Black portal splashscreen glass (Gary, 2026-11-07): the tab strip
  // carries the splashscreen's own look — pure black, frosted
  // translucent, squared (no rounded bubble chrome) — so the terminal
  // feels like Warp. The splash is #000 with a cool-blue accent line
  // (rgba(88,166,255,0.85), the wordmark line); the active tab is the
  // open portal, a deeper black with that blue line along its bottom
  // edge. Inactive tabs are glass, not solid — hover is a white sheen,
  // never a solid tertiary fill. The bar renders in both LuciferAI-on
  // and flat states (App renders the same <TerminalTabs/> either way),
  // so this glass is identical in both.
  return (
    <div
      ref={barRef}
      data-testid="terminal-tabs-bar"
      data-drop-target={drag.dropIndicator ? 'true' : undefined}
      className={`relative h-9 flex items-center rounded-none border-b border-[var(--border)] bg-black/50 backdrop-blur-md ${
        drag.dropIndicator ? 'shadow-[inset_0_0_24px_rgba(88,166,255,0.35)] ring-1 ring-inset ring-[rgba(88,166,255,0.85)]' : ''
      }`}
      {...drag.barHandlers}
    >
      {/* Volley landing marker: the single lit bar shows where
          the dragged tab lands (Gary, 2026-11-09). */}
      {drag.dropIndicator && markerLeft !== null && (
        <div
          data-testid="tab-drop-marker"
          className="absolute top-0 bottom-0 w-0.5 bg-[rgba(88,166,255,0.9)] pointer-events-none z-10"
          style={{ left: markerLeft }}
        />
      )}
      {/* Drag ghost (Gary, 2026-11-14): the tab unsnaps from
          the strip and follows the pointer at its grabbed spot
          until the drop. Rendered only while the tab is still
          in this strip — once main detaches it, the tab leaves
          the strip and the real window takes over following the
          pointer. Portaled to the body (see below) so the
          fixed position is truly viewport-relative;
          pointer-events none, so it never steals the drag. */}
      {drag.dragGhost &&
        tabs.some((t) => t.id === drag.dragGhost!.tab.id) &&
        // Portaled to the body (Gary, 2026-11-14 — round 2):
        // the bar carries backdrop-blur, which makes it a
        // containing block for fixed descendants AND a stacking
        // context — inside the bar the ghost sat offset by the
        // bar's viewport position and hid under the terminal
        // content below the strip. In the body it is truly
        // viewport-fixed and above everything, so it tracks the
        // pointer exactly.
        createPortal(
          <div
            data-testid="tab-drag-ghost"
            className="fixed z-50 flex items-center gap-2 px-3 h-9 border border-[var(--border)] bg-black/60 text-[var(--text-primary)] shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)] pointer-events-none"
            style={{ left: drag.dragGhost.x, top: drag.dragGhost.y }}
          >
            <Terminal size={14} />
            <span className="text-sm whitespace-nowrap">{drag.dragGhost.tab.title}</span>
          </div>,
          document.body,
        )}
      {/* Tabs */}
      <div className="flex-1 flex items-center overflow-x-auto">
        {/* Blood drop tab (Gary, 2026-11-07). Pinned first in the
            strip, always the top spot (the same lock as the toolbar
            drop), rendered ONLY while LuciferAI is enabled; when the
            plugin is off it is gone, not hidden. The individual
            LuciferAI tabs hide behind this one, ordered by causal
            ritual placement (ticks), never by time. It is not a
            terminal tab — no PTY, no close button, no rename —
            picking it shows the blood drop panel; picking a terminal
            tab shows that terminal. Same portal glass as the terminal
            tabs. The tab shows just the blood drop icon — no visible
            text label (Gary, 2026-11-07 ~09:16 PST); its
            title/aria-label stay "LuciferAI prompt commands" (Gary,
            2026-11-07 ~09:18 PST: "luciferAI prompt commands are
            fine"). */}
        {showBloodDrop && (
          <div
            data-testid="blood-drop-tab"
            title={bloodDropDisabled ? "LuciferAI silenced \u2014 the terminal link is disabled" : "LuciferAI prompt commands"}
            aria-label="LuciferAI prompt commands"
            aria-disabled={bloodDropDisabled || undefined}
            className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] transition-colors ${
              bloodDropDisabled
                ? 'text-[var(--text-muted)] opacity-50 cursor-default'
                : bloodDropActive
                  ? 'bg-black/60 text-[var(--text-primary)] tab-active shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)] cursor-pointer'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 cursor-pointer'
            }`}
            onClick={() => { if (!bloodDropDisabled) onBloodDropActiveChange?.(true); }}
          >
            <BloodDropIcon size={14} />
          </div>
        )}

        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            data-tab-id={tab.id}
            data-split-group={splitGroupTabIds.includes(tab.id) ? 'true' : undefined}
            className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] cursor-pointer transition-colors ${
              tab.id === activeTabId
                ? 'bg-black/60 text-[var(--text-primary)] tab-active shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)]'
                : splitGroupTabIds.includes(tab.id)
                  ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.4)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }${tab.id === drag.draggingTabId ? ' opacity-40' : ''}`}
            onClick={() => onSelectTab(tab.id)}
            onPointerDown={(e) => drag.onTabPointerDown(tab, index, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              // Clamp so the menu never opens off-screen.
              setContextMenu({
                tab,
                x: Math.min(e.clientX, window.innerWidth - 200),
                y: Math.min(e.clientY, window.innerHeight - 230),
              });
            }}
            onDoubleClick={() => {
              setEditingTabId(tab.id);
              setEditValue(tab.title);
            }}
          >
            <Terminal size={14} />
            {editingTabId === tab.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Blur commits (single commit path, see onBlur).
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    cancelEditRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (cancelEditRef.current) {
                    cancelEditRef.current = false;
                  } else {
                    const next = editValue.trim();
                    if (next) onRenameTab(tab.id, next);
                  }
                  setEditingTabId(null);
                }}
                className="text-sm w-24 min-w-0 bg-transparent outline-none border-b border-[var(--border)]"
                aria-label={`Rename ${tab.title}`}
              />
            ) : (
              <span className="text-sm whitespace-nowrap">{tab.title}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="p-0.5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* New Tab Button — directly after the last tab, in
            every window including detached ones (Gary,
            2026-11-13). */}
        <button
          onClick={onCreateTab}
          className="h-9 px-3 shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          title="New Terminal"
        >
          <Plus size={18} />
        </button>

        {/* Split Button — split panes (2026-11-14, sweep fix 2):
            splits the ACTIVE tab vertically, a fresh tab (its own
            PTY) beside it. Main window only: detached windows
            render one tab and show no split control. Same key as
            the button: ⌘D (iTerm2's vertical-split key). */}
        {showSplitButton && (
          <button
            onClick={onSplitTab}
            data-testid="split-terminal"
            className="h-9 px-3 shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
            title="Split terminal (⌘D)"
            aria-label="Split terminal"
          >
            <Columns2 size={18} />
          </button>
        )}
      </div>

      {/* Divider - mirrors the line that separates the plugin icons
          from Settings in the icon bar (Sidebar.tsx): the same 1px
          var(--border) line with the same 4px spacing, turned
          vertical because this bar is horizontal. The icon-bar line
          is 32px long in a 48px rail (2/3, 8px inset each side);
          this one is 24px (h-6) in the 36px bar - the same 2/3.
          It sits between the tabs and the bell. */}
      <div className="h-6 border-l border-[var(--border)] mx-1 shrink-0" aria-hidden="true" />

      {/* Notifications Button */}
      <button
        onClick={onToggleNotifications}
        className="relative h-9 px-3 shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className={`absolute top-1 right-0.5 min-w-4 h-4 px-0.5 rounded-full text-[10px] leading-4 text-center font-medium ${
              hasUnreadError
                ? 'bg-red-500/80 backdrop-blur-sm text-white'
                : 'bg-[var(--bg-tertiary)]/70 backdrop-blur-sm text-[var(--text-primary)] border border-[var(--border)]'
            }`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Notifications panel */}
      {notificationsOpen && (
        <div className="absolute right-0 top-9 z-50 w-80 max-w-[90vw] rounded-none border border-[var(--border)] bg-black/70 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--border)]">
            <span className="text-sm font-medium text-[var(--text-primary)]">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={onClearAllNotifications}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Clear all notifications"
              >
                Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)] text-center">No notifications</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => {
                const styles = getTypeStyles(notification.type);
                const Icon = styles.icon;
                return (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--border)] last:border-b-0 ${styles.bg}`}
                  >
                    <Icon size={16} className={`flex-shrink-0 mt-0.5 ${styles.text}`} />
                    <p className={`text-sm flex-1 ${styles.text}`}>{notification.message}</p>
                    <button
                      onClick={() => onDismissNotification(notification.id)}
                      className={`p-0.5 rounded hover:bg-white/10 transition-colors ${styles.text}`}
                      title="Dismiss notification"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Per-tab context menu (Atom steal #17): fixed at the
          cursor, a transparent overlay closes it on an
          outside click, Escape closes it too. "Close Tabs to
          the Right" is disabled on the last tab; Reopen
          Closed Tab is a silent no-op when nothing was closed
          (the closed-item stack is session-only). */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[60]"
          data-testid="tab-context-menu-overlay"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            role="menu"
            aria-label={`Tab actions for ${contextMenu.tab.title}`}
            data-testid="tab-context-menu"
            className="absolute w-56 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              {
                label: 'Split This Tab',
                onClick: () => onSplitTabId?.(contextMenu.tab.id),
                disabled: false,
              },
              {
                label: 'Copy Working Directory',
                onClick: () => onCopyTabCwd?.(contextMenu.tab.id),
                disabled: false,
              },
              {
                label: 'Reopen Closed Tab',
                onClick: () => onReopenClosedTab?.(),
                disabled: false,
              },
              {
                label: 'Close Tab',
                onClick: () => onCloseTab(contextMenu.tab.id),
                disabled: false,
              },
              {
                label: 'Close Other Tabs',
                onClick: () => onCloseOtherTabs?.(contextMenu.tab.id),
                disabled: tabs.length <= 1,
              },
              {
                label: 'Close Tabs to the Right',
                onClick: () => onCloseTabsToTheRight?.(contextMenu.tab.id),
                disabled:
                  tabs.findIndex((t) => t.id === contextMenu.tab.id) >= tabs.length - 1,
              },
            ].map((item) => (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setContextMenu(null);
                  item.onClick();
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Close ask (Gary, 2026-11-14) — the dialog pattern
          from LocalAccessPromptDialog: role="dialog",
          aria-modal, fixed inset-0 z-60 backdrop, w-96 card,
          buttons row with the secondary + primary classes.
          No "do not ask again": Gary said the detached ask
          happens EVERY time. Backdrop click dismisses — keep
          the tab, do nothing. */}
      {closeAsk &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Close "${closeAsk.title}"?`}
            data-testid="tab-close-ask"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
            onClick={() => onDismissCloseAsk?.()}
          >
            <div
              className="w-96 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {`Close "${closeAsk.title}"?`}
              </h3>
              <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
                {closeAsk.kind === 'detached'
                  ? `Resnap "${closeAsk.title}" back to the main window, or close its session? Resnapping keeps the session and its history. Closing the session destroys it — it cannot be brought back.`
                  : `"${closeAsk.title}" has run commands — closing it destroys its session and its history. Close the tab, or keep it?`}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                {closeAsk.kind === 'detached' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onCloseAskCloseSession?.()}
                      data-testid="tab-close-ask-close-session"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-white/10"
                    >
                      Close session
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseAskResnap?.()}
                      data-testid="tab-close-ask-resnap"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Resnap
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onCloseAskKeepTab?.()}
                      data-testid="tab-close-ask-keep-tab"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-white/10"
                    >
                      Keep tab
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseAskCloseTab?.()}
                      data-testid="tab-close-ask-close-tab"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Close tab
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface TerminalTabsProps {
  /** Detached window — a tab created here is registered with main
   * (createTab opts.detached) so closing the window pops it back. */
  detachedWindow?: boolean;
  /** LuciferAI enabled — the blood drop tab renders only then. */
  showBloodDrop?: boolean;
  /** The blood drop tab is the selected one. */
  bloodDropActive?: boolean;
  /** Selecting the drop (true), or a terminal tab / creating one (false). */
  onBloodDropActiveChange?: (active: boolean) => void;
  /** SILENCED (Gary, 2026-11-08 ~06:41 PST): the blood drop tab is inert while silenced. */
  bloodDropDisabled?: boolean;
}

function TerminalTabs({ detachedWindow = false, showBloodDrop = false, bloodDropActive = false, onBloodDropActiveChange, bloodDropDisabled = false }: TerminalTabsProps) {
  const { tabs: storeTabs, activeTabId, createTab, updateTabTitle, setActiveTab } =
    useTerminalStore();
  const splitGroups = useSplitPaneStore((s) => s.groups);
  // The strip follows the pane order (Atom steal #17 — pane
  // item ordering): the split group's leaf order first, then
  // the rest in store order. The drag hook, the keyboard
  // switching and the view all read this same ordered list,
  // so a drag's index is the rendered index.
  const tabs = orderTabsForRender(storeTabs, splitGroups, activeTabId);
  const { notifications, removeNotification, clearAll, markAllRead } = useToastStore();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Close asks (Gary, 2026-11-14): the strip asks before two
  // closes it used to do silently. The container owns the
  // pending ask; the view only renders it.
  const [closeAsk, setCloseAsk] = useState<TabCloseAsk | null>(null);

  // A tab is USED when it has run at least one command: it has
  // blocks in its feed (historyStore.blocksByTab — a block is
  // created with isComplete: false at submit, so a command
  // still running already has its block), or its hasPrompted
  // flag is set (the first composer prompt — covers a tab
  // whose history was cleared after running commands). Read
  // at click time from the stores, no subscription. Honest
  // limit: raw xterm input in devmode creates no block and
  // sets no flag, so a devmode tab used only through the raw
  // xterm reads as unused — the code tracks no per-tab xterm
  // activity to read.
  const isTabUsed = (tab: TerminalTab): boolean =>
    (useHistoryStore.getState().blocksByTab[tab.id]?.length ?? 0) > 0 ||
    tab.hasPrompted === true;

  const handleCloseTab = (id: string) => {
    if (!detachedWindow) {
      // Main window: a USED tab asks first (Gary, 2026-11-14 —
      // close it and lose its session, or keep it?). An unused
      // tab closes silently, exactly as today — and a used PANE
      // tab asks too, then closePane runs on confirm (the group
      // dissolves at one pane left, as the split slice defines).
      // Split panes: closing a pane's tab closes just that
      // pane; a tab in no group closes exactly like closeTab.
      const tab = tabs.find((t) => t.id === id);
      if (tab && isTabUsed(tab)) {
        setCloseAsk({ tabId: id, title: tab.title, kind: 'used' });
        return;
      }
      useSplitPaneStore.getState().closePane(id);
      return;
    }
    // Detached window: the tab x asks EVERY time (Gary,
    // 2026-11-14 — "a popup asks, every time — resnap it, or
    // close its session?"). The old always-resnap rule is gone:
    // resnap is now one of the two choices, not the behaviour.
    // The red window X is untouched — it still pops every tab
    // it still owned back to main.
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    setCloseAsk({ tabId: id, title: tab.title, kind: 'detached' });
  };

  // Close-ask answers. Dismiss (backdrop / Escape) keeps the
  // tab in both cases — never a destructive default.
  const handleCloseAskResnap = () => {
    const ask = closeAsk;
    setCloseAsk(null);
    if (!ask) return;
    const tab = tabs.find((t) => t.id === ask.tabId);
    if (!tab) return;
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) return;
    void detach.popIn(toDetachedTab(tab));
  };
  const handleCloseAskCloseSession = () => {
    const ask = closeAsk;
    setCloseAsk(null);
    if (!ask) return;
    // closeTab destroys the PTY and tells main
    // (notifyTabClosed) so the number is freed there — the
    // path the detached branch deliberately never called
    // before. The tab leaves this window; the last tab out
    // closes the window (MiniTerminal's empty-tabs effect),
    // exactly like pop-in today.
    useTerminalStore.getState().closeTab(ask.tabId);
  };
  const handleCloseAskCloseTab = () => {
    const ask = closeAsk;
    setCloseAsk(null);
    if (!ask) return;
    useSplitPaneStore.getState().closePane(ask.tabId);
  };
  const handleCloseAskKeepTab = () => {
    setCloseAsk(null);
  };

  // ⌘1–⌘9 switch tabs (Warp §7): the strip is tabs only, so
  // the numbers are the tabs in strip order. Skipped when focus is in a text field
  // that is not a composer (renaming a tab, Settings, ...) —
  // the composer is the one text field the switch works from,
  // because Warp switches from the prompt too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      // ⌘D — split the active tab (2026-11-14, sweep fix 2):
      // iTerm2's vertical-split key. Plain Cmd+D only (no shift
      // — Cmd+Shift+D is the future horizontal split's key).
      // Skipped in EVERY text field including the composer:
      // Monaco owns Cmd+D there (add selection to next find
      // match), and the strip's split button always works.
      // Skipped in detached windows — split is main-window only.
      if ((e.key === 'd' || e.key === 'D') && !e.shiftKey && !e.altKey) {
        if (detachedWindow) return;
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          const tag = active.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return;
        }
        if (!activeTabId) return;
        e.preventDefault();
        void useSplitPaneStore.getState().splitTab(activeTabId);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        const inComposer = active.closest?.('[data-testid="prompter-composer-wrap"], [data-testid="dev-command-bar"]');
        if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) && !inComposer) return;
      }
      const target = tabs[n - 1];
      if (!target) return;
      e.preventDefault();
      setActiveTab(target.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tabs, setActiveTab, detachedWindow, activeTabId]);

  const toggleNotifications = () => {
    if (!notificationsOpen) markAllRead();
    setNotificationsOpen(!notificationsOpen);
  };

  return (
    <TerminalTabsView
      tabs={tabs}
      activeTabId={activeTabId}
      notifications={notifications}
      notificationsOpen={notificationsOpen}
      showBloodDrop={showBloodDrop}
      bloodDropActive={bloodDropActive}
      onBloodDropActiveChange={onBloodDropActiveChange}
      bloodDropDisabled={bloodDropDisabled}
      onCreateTab={() => {
        void createTab(undefined, { detached: detachedWindow });
        onBloodDropActiveChange?.(false);
      }}
      showSplitButton={!detachedWindow}
      onSplitTab={() => {
        if (activeTabId) void useSplitPaneStore.getState().splitTab(activeTabId);
      }}
      splitGroupTabIds={activeTabId ? (() => { const g = findGroupForTab(splitGroups, activeTabId); return g ? groupTabIds(g) : []; })() : []}
      onCloseTab={handleCloseTab}
      // Per-tab context menu (Atom steal #17): "to the right"
      // is computed in the RENDERED (pane-ordered) list, not
      // the store order — what the user sees is what closes.
      onSplitTabId={(id) => {
        void useSplitPaneStore.getState().splitTab(id);
      }}
      onCloseOtherTabs={(id) => {
        useTerminalStore
          .getState()
          .closeTabs(tabs.filter((t) => t.id !== id).map((t) => t.id));
      }}
      onCloseTabsToTheRight={(id) => {
        const index = tabs.findIndex((t) => t.id === id);
        if (index < 0) return;
        useTerminalStore
          .getState()
          .closeTabs(tabs.slice(index + 1).map((t) => t.id));
      }}
      onReopenClosedTab={() => {
        void useTerminalStore.getState().reopenClosedTab();
      }}
      onCopyTabCwd={(id) => {
        const tab = tabs.find((t) => t.id === id);
        if (tab) void navigator.clipboard?.writeText?.(tab.cwd);
      }}
      closeAsk={closeAsk}
      onCloseAskResnap={handleCloseAskResnap}
      onCloseAskCloseSession={handleCloseAskCloseSession}
      onCloseAskCloseTab={handleCloseAskCloseTab}
      onCloseAskKeepTab={handleCloseAskKeepTab}
      onDismissCloseAsk={() => setCloseAsk(null)}
      onRenameTab={updateTabTitle}
      onSelectTab={(id) => {
        // Plain setActiveTab: the mode is per-tab, so
        // selecting a tab needs nothing else. (The old
        // switchToTerminalSession wrapper existed to clear
        // the agent session — there is no agent session
        // anymore, so the 2026-11-13 ~05:00 tab-click
        // defect cannot recur.)
        setActiveTab(id);
        onBloodDropActiveChange?.(false);
      }}
      onToggleNotifications={toggleNotifications}
      onDismissNotification={removeNotification}
      onClearAllNotifications={clearAll}
    />
  );
}

export default TerminalTabs;
