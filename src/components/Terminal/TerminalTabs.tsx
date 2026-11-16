import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, X, Terminal, Bell, Columns2, Equal } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTerminalStore } from '../../stores/terminalStore';
import {
  useSplitPaneStore,
  findGroupForTab,
  getVisibleTabIds,
  groupTabIds,
  orderTabsForRender,
} from '../../stores/splitPaneStore';
import { unsplitTabWithFeedLine } from '../../lib/terminalFeedLine';
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
 * `unsplit-all` (Gary, 2026-11-15) is the collapse-all ask:
 * `/unsplit all` / "Unsplit All Panes" asks first, and the
 * dialog names the pane count — the cost is explicit.
 * `close-multiple` (2026-11-15) is the context-menu bulk
 * close ask: "Close Other Tabs" / "Close to the Right"
 * stage it when any target is used or in a split group,
 * naming the count and how many are panes.
 */
export type TabCloseAskKind =
  'detached' | 'used' | 'unsplit-all' | 'close-multiple';
export type TabCloseAsk =
  | { tabId: string; title: string; kind: 'detached' | 'used' }
  | { tabId: string; title: string; kind: 'unsplit-all'; paneCount: number }
  | {
      tabIds: string[];
      title: string;
      kind: 'close-multiple';
      paneCount: number;
    };

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
  /** Unsplit-all ask: confirm — close every pane in the asked group. */
  onCloseAskCloseAllPanes?: () => void;
  /** Close-multiple ask: confirm — close every listed tab (pane-aware). */
  onCloseAskCloseTabs?: () => void;
  /** Close-multiple ask: keep the tabs. */
  onCloseAskKeepTabs?: () => void;
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
   * Equal size button (Gary, 2026-11-15 — "when in terminal
   * split there needs to be an equal size button that appears
   * in tab bar when you have 2+"): make all panes of the
   * active split equal sized. The container shows it only
   * when the active tab's group has 2+ panes; every window
   * gets its own — the button equalizes this window's panes
   * only, never another window's (each window owns its own
   * split store). Detached windows render the same strip, so
   * a detached window with 2+ panes shows its own button.
   */
  showEqualizeButton?: boolean;
  onEqualizePanes?: () => void;
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
   * Tabs in ANY split group (empty when nothing is split):
   * members other than the focused pane get a dim blue underline
   * so the strip shows which tabs are panes of a pair. Per-pair,
   * never active-tab-only (2026-11-16): the old rule passed only
   * the ACTIVE tab's group, so adding a new tab — which becomes
   * active — unmarked every existing pair in the strip and the
   * links read as broken, although the groups were intact.
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
  onCloseAskCloseAllPanes,
  onCloseAskCloseTabs,
  onCloseAskKeepTabs,
  onDismissCloseAsk,
  onSplitTab,
  showEqualizeButton = false,
  onEqualizePanes,
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
  const hasUnreadError = notifications.some(
    (n) => !n.read && n.type === 'error',
  );

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
      const last = (
        nodes[nodes.length - 1] as HTMLElement
      ).getBoundingClientRect();
      x = last.right - barRect.left;
    } else {
      x =
        (nodes[index] as HTMLElement).getBoundingClientRect().left -
        barRect.left;
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
        drag.dropIndicator
          ? 'shadow-[inset_0_0_24px_rgba(88,166,255,0.35)] ring-1 ring-inset ring-[rgba(88,166,255,0.85)]'
          : ''
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
            <span className="text-sm whitespace-nowrap">
              {drag.dragGhost.tab.title}
            </span>
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
            title={
              bloodDropDisabled
                ? 'LuciferAI silenced \u2014 the terminal link is disabled'
                : 'LuciferAI prompt commands'
            }
            aria-label="LuciferAI prompt commands"
            aria-disabled={bloodDropDisabled || undefined}
            className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] transition-colors ${
              bloodDropDisabled
                ? 'text-[var(--text-muted)] opacity-50 cursor-default'
                : bloodDropActive
                  ? 'bg-black/60 text-[var(--text-primary)] tab-active shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)] cursor-pointer'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 cursor-pointer'
            }`}
            onClick={() => {
              if (!bloodDropDisabled) onBloodDropActiveChange?.(true);
            }}
          >
            <BloodDropIcon size={14} />
          </div>
        )}

        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            data-tab-id={tab.id}
            data-split-group={
              splitGroupTabIds.includes(tab.id) ? 'true' : undefined
            }
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

        {/* Equalize Button — split panes (Gary, 2026-11-15):
            make all panes of the active split equal sized.
            Shown only at 2+ panes (the container owns that
            count); every window gets its own, equalizing
            this window's panes only. */}
        {showEqualizeButton && (
          <button
            onClick={onEqualizePanes}
            data-testid="equalize-panes"
            className="h-9 px-3 shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
            title="Equalize pane sizes"
            aria-label="Equalize pane sizes"
          >
            <Equal size={18} />
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
      <div
        className="h-6 border-l border-[var(--border)] mx-1 shrink-0"
        aria-hidden="true"
      />

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
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Notifications
            </span>
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
            <p className="px-3 py-4 text-sm text-[var(--text-muted)] text-center">
              No notifications
            </p>
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
                    <Icon
                      size={16}
                      className={`flex-shrink-0 mt-0.5 ${styles.text}`}
                    />
                    <p className={`text-sm flex-1 ${styles.text}`}>
                      {notification.message}
                    </p>
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
          (the closed-item stack is session-only).
          PORTALED TO THE BODY (step 6, 2026-11-15 — Gary:
          "that should never happen"): the tab context menu was
          stuck open, blurred and unclickable live. Same trap
          the drag ghost (above) and the close ask (below) were
          already portaled out of: the bar carries
          backdrop-blur, which makes it a containing block for
          fixed descendants AND a stacking context — inside
          the bar the `fixed inset-0` overlay covered only the
          36px strip (so outside clicks never reached it) and
          the menu itself painted UNDER the terminal surface
          below the strip (the DEFCON 2 merge veil
          `bg-black/25 backdrop-blur-sm`, or the devmode
          frosted xterm box), which blurred it and swallowed
          its clicks. In the body it is truly viewport-fixed
          and above everything, so the overlay covers the
          screen and the items are clickable. The menu keeps
          the theme secondary, painted over solid black, so
          it is opaque in every theme (Full Glass secondary
          is translucent rgba) — no mist shows through it. */}
      {contextMenu &&
        createPortal(
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
              className="absolute w-56 rounded-md border border-[var(--border)] py-1 shadow-xl"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                // Opaque backing: paint the theme secondary over
                // solid black, so the menu is solid in every
                // theme (opaque themes render exactly their own
                // colour; Full Glass's translucent secondary
                // composites over black instead of over the mist).
                backgroundImage:
                  'linear-gradient(var(--bg-secondary), var(--bg-secondary))',
                backgroundColor: '#000',
              }}
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
                    tabs.findIndex((t) => t.id === contextMenu.tab.id) >=
                    tabs.length - 1,
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
          </div>,
          document.body,
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
            aria-label={
              closeAsk.kind === 'unsplit-all'
                ? `Unsplit all ${closeAsk.paneCount} panes in "${closeAsk.title}"?`
                : closeAsk.kind === 'close-multiple'
                  ? closeAsk.title
                  : `Close "${closeAsk.title}"?`
            }
            data-testid="tab-close-ask"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
            onClick={() => onDismissCloseAsk?.()}
          >
            <div
              className="w-96 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {closeAsk.kind === 'unsplit-all'
                  ? `Unsplit all ${closeAsk.paneCount} panes in "${closeAsk.title}"?`
                  : closeAsk.kind === 'close-multiple'
                    ? closeAsk.title
                    : `Close "${closeAsk.title}"?`}
              </h3>
              <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
                {closeAsk.kind === 'detached'
                  ? `Resnap "${closeAsk.title}" back to the main window, or close its session? Resnapping keeps the session and its history. Closing the session destroys it — it cannot be brought back.`
                  : closeAsk.kind === 'unsplit-all'
                    ? `This closes the other ${closeAsk.paneCount - 1} ${closeAsk.paneCount - 1 === 1 ? 'pane' : 'panes'}. Their sessions and history will be destroyed — they cannot be brought back. "${closeAsk.title}" stays open.`
                    : closeAsk.kind === 'close-multiple'
                      ? `This closes ${closeAsk.tabIds.length} ${closeAsk.tabIds.length === 1 ? 'tab' : 'tabs'}${closeAsk.paneCount > 0 ? `, including ${closeAsk.paneCount} pane${closeAsk.paneCount === 1 ? '' : 's'} of a split group` : ''}. Any session or history in them will be destroyed — it cannot be brought back.`
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
                ) : closeAsk.kind === 'unsplit-all' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onDismissCloseAsk?.()}
                      data-testid="tab-close-ask-keep-panes"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-white/10"
                    >
                      Keep panes
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseAskCloseAllPanes?.()}
                      data-testid="tab-close-ask-close-all-panes"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Close all panes
                    </button>
                  </>
                ) : closeAsk.kind === 'close-multiple' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onCloseAskKeepTabs?.()}
                      data-testid="tab-close-ask-keep-tabs"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-white/10"
                    >
                      Keep tabs
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseAskCloseTabs?.()}
                      data-testid="tab-close-ask-close-tabs"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Close {closeAsk.tabIds.length}{' '}
                      {closeAsk.tabIds.length === 1 ? 'tab' : 'tabs'}
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

function TerminalTabs({
  detachedWindow = false,
  showBloodDrop = false,
  bloodDropActive = false,
  onBloodDropActiveChange,
  bloodDropDisabled = false,
}: TerminalTabsProps) {
  const {
    tabs: storeTabs,
    activeTabId,
    createTab,
    updateTabTitle,
    setActiveTab,
  } = useTerminalStore();
  const splitGroups = useSplitPaneStore((s) => s.groups);
  // The strip follows the pane order (Atom steal #17 — pane
  // item ordering): every split group's leaves first, then
  // the rest in store order — stable across active-tab
  // changes (P11), so clicking off a split group never
  // reshuffles the strip or retargets ⌘1–⌘9. The drag hook,
  // the keyboard switching and the view all read this same
  // ordered list, so a drag's index is the rendered index.
  const tabs = orderTabsForRender(storeTabs, splitGroups);
  // The active tab's split group (this window's own store —
  // a detached window reads its own groups, never main's).
  const activeGroup = activeTabId
    ? findGroupForTab(splitGroups, activeTabId)
    : null;
  const activeGroupPaneCount = activeGroup
    ? groupTabIds(activeGroup).length
    : 0;
  const { notifications, removeNotification, clearAll, markAllRead } =
    useToastStore();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Close asks (Gary, 2026-11-14): the strip asks before two
  // closes it used to do silently. The container owns the
  // pending ask; the view only renders it.
  const [closeAsk, setCloseAsk] = useState<TabCloseAsk | null>(null);

  // The pending collapse-all ask (Gary, 2026-11-15): `/unsplit
  // all` / "Unsplit All Panes" asked first — the strip renders
  // it from the split store (the slash command and the palette
  // request it without prop drilling). A tab x ask showing
  // wins — the two dialogs never stack; the store ask stays
  // pending underneath until the tab ask is dismissed.
  // The pane count is derived LIVE from the group at render
  // time (P4) — the store ask holds only the tab id, so the
  // dialog can never show a stale count — and the dialog
  // names the tab (P8), like the tab x ask does. A group
  // that dissolved or shrank below two panes while the ask
  // sat open hides the ask, and the effect below clears it.
  const unsplitAllAsk = useSplitPaneStore((s) => s.unsplitAllAsk);
  const unsplitAllGroup = unsplitAllAsk
    ? findGroupForTab(splitGroups, unsplitAllAsk.tabId)
    : null;
  const unsplitAllPaneCount = unsplitAllGroup
    ? groupTabIds(unsplitAllGroup).length
    : 0;
  const unsplitAllTabTitle = unsplitAllAsk
    ? (tabs.find((t) => t.id === unsplitAllAsk.tabId)?.title ??
      unsplitAllAsk.tabId)
    : '';
  const closeAskToShow: TabCloseAsk | null =
    closeAsk ??
    (unsplitAllAsk && unsplitAllGroup && unsplitAllPaneCount >= 2
      ? {
          tabId: unsplitAllAsk.tabId,
          title: unsplitAllTabTitle,
          kind: 'unsplit-all',
          paneCount: unsplitAllPaneCount,
        }
      : null);

  // Dismiss a stale collapse-all ask (P4): the group
  // dissolved, or shrank below two panes, while the dialog
  // sat open — the ask is gone, not shown with a dead count.
  useEffect(() => {
    if (unsplitAllAsk && (!unsplitAllGroup || unsplitAllPaneCount < 2)) {
      useSplitPaneStore.getState().dismissUnsplitAllAsk();
    }
  }, [unsplitAllAsk, unsplitAllGroup, unsplitAllPaneCount]);

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
    if (!ask || ask.kind !== 'detached') return;
    const tab = tabs.find((t) => t.id === ask.tabId);
    if (!tab) return;
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) return;
    void detach.popIn(toDetachedTab(tab));
  };
  const handleCloseAskCloseSession = () => {
    const ask = closeAsk;
    setCloseAsk(null);
    if (!ask || ask.kind !== 'detached') return;
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
    if (!ask || ask.kind !== 'used') return;
    useSplitPaneStore.getState().closePane(ask.tabId);
  };
  const handleCloseAskKeepTab = () => {
    setCloseAsk(null);
  };

  // Bulk closes from the tab context menu (P2, 2026-11-15):
  // "Close Other Tabs" / "Close to the Right" used to call
  // terminalStore.closeTabs directly — a silent multi-pane
  // wipe with no ask, the same class of bug the chained fix
  // killed on the pill. They now go through the used-tab ask
  // + closePane, like a tab x: when any target is used, or
  // in a split group, the bulk ask stages first; otherwise
  // the closes run silently, pane-aware (closePane dissolves
  // a group at one pane left, and is closeTab on a plain
  // tab — never the bulk closeTabs, which bypasses the group
  // tree entirely).
  const handleCloseMultipleTabs = (ids: string[], title: string) => {
    if (ids.length === 0) return;
    const targets = tabs.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    const paneCount = targets.filter((t) =>
      findGroupForTab(splitGroups, t.id),
    ).length;
    if (targets.some((t) => isTabUsed(t)) || paneCount > 0) {
      setCloseAsk({
        tabIds: targets.map((t) => t.id),
        title,
        kind: 'close-multiple',
        paneCount,
      });
      return;
    }
    for (const target of targets) {
      useSplitPaneStore.getState().closePane(target.id);
    }
  };
  const handleCloseAskCloseTabs = () => {
    const ask = closeAsk;
    setCloseAsk(null);
    if (!ask || ask.kind !== 'close-multiple') return;
    for (const id of ask.tabIds) {
      useSplitPaneStore.getState().closePane(id);
    }
  };
  const handleCloseAskKeepTabs = () => {
    setCloseAsk(null);
  };
  // Dismiss (backdrop / Escape) keeps everything in both
  // cases — never a destructive default. A tab x ask showing
  // dismisses itself; otherwise the pending collapse-all ask
  // is dismissed and every pane stays.
  const handleDismissCloseAsk = () => {
    if (closeAsk) {
      setCloseAsk(null);
      return;
    }
    useSplitPaneStore.getState().dismissUnsplitAllAsk();
  };

  // ⌘1–⌘9 switch tabs (Warp §7): the strip is tabs only, so
  // the numbers are the tabs in strip order. Skipped when focus is in a text field
  // that is not a composer (renaming a tab, Settings, ...) —
  // the composer is the one text field the switch works from,
  // because Warp switches from the prompt too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      // The xterm surface is a text field (xterm.js's hidden
      // helper textarea) and it is focused essentially always —
      // but it is the terminal itself, not a prose input, so
      // the terminal's own shortcuts must work while it is
      // focused (2026-11-16 — Meta+D / Meta+U / Meta+1 were
      // dead whenever the terminal was focused, which is
      // always). The rename input, Settings, and the Monaco
      // editor keep their own keys; the composer stays guarded
      // for D/U (it is a text field, not the xterm).
      const isXtermSurface = (el: HTMLElement | null) =>
        !!el && el.classList.contains('xterm-helper-textarea');
      const isTextField = (el: HTMLElement | null) =>
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
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
        // Meta-only xterm exemption: Ctrl+D is the shell's EOF
        // and belongs to the shell; Meta is Gary's modifier and
        // the shell never sees it.
        if (isTextField(active) && !(e.metaKey && isXtermSurface(active))) return;
        if (!activeTabId) return;
        e.preventDefault();
        void useSplitPaneStore.getState().splitTab(activeTabId);
        return;
      }
      // ⌘U — unsplit the active tab (P13, 2026-11-15): undo
      // the last split — the keyboard twin of the split pill
      // and `/unsplit`. Same guards as ⌘D: plain Cmd+U only,
      // skipped in every text field, skipped in detached
      // windows (no splits there).
      if ((e.key === 'u' || e.key === 'U') && !e.shiftKey && !e.altKey) {
        if (detachedWindow) return;
        const active = document.activeElement as HTMLElement | null;
        // Meta-only xterm exemption (same as Cmd+D: Ctrl+U is
        // the shell's kill-line and stays the shell's).
        if (isTextField(active) && !(e.metaKey && isXtermSurface(active))) return;
        if (!activeTabId) return;
        e.preventDefault();
        // The unsplit writes the same feed line as /unsplit
        // and the pill (sweep fold-in, 2026-11-16): ⌘U used
        // to call unsplitOneTab bare, so a keyboard unsplit
        // left no "Closed …" line in the feed.
        unsplitTabWithFeedLine(activeTabId);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const active = document.activeElement as HTMLElement | null;
      const inComposer = active?.closest?.(
        '[data-testid="prompter-composer-wrap"], [data-testid="dev-command-bar"]',
      );
      // The 1-9 have no shell meaning, so both modifiers are
      // exempt from the xterm surface. Monaco / the rename
      // input keep their own keys (the xterm and the composer
      // do not).
      if (isTextField(active) && !inComposer && !isXtermSurface(active)) return;
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
        // Adding a tab while a split is visible must not steal
        // the split view (Gary, 2026-11-16 - "as soon as i add
        // a tab it breaks the pairs"): the pair stays on screen
        // and the new tab waits in the strip - it shows on click.
        // With no split showing the new tab activates exactly as
        // before. Detached windows never split, so their + always
        // activates (activeGroupPaneCount is 0 there).
        void createTab(undefined, {
          detached: detachedWindow,
          activate: activeGroupPaneCount < 2,
        });
        onBloodDropActiveChange?.(false);
      }}
      showSplitButton={!detachedWindow}
      onSplitTab={() => {
        if (activeTabId)
          void useSplitPaneStore.getState().splitTab(activeTabId);
      }}
      showEqualizeButton={activeGroupPaneCount >= 2}
      onEqualizePanes={() => {
        if (activeGroup)
          useSplitPaneStore.getState().equalizeGroup(activeGroup.id);
      }}
      // Per-pair (2026-11-16): EVERY group's leaves, not just the
      // active tab's group — adding a tab must not unmark the pairs.
      splitGroupTabIds={Object.values(splitGroups).flatMap((group) => groupTabIds(group))}
      onCloseTab={handleCloseTab}
      // Per-tab context menu (Atom steal #17): "to the right"
      // is computed in the RENDERED (pane-ordered) list, not
      // the store order — what the user sees is what closes.
      onSplitTabId={(id) => {
        void useSplitPaneStore.getState().splitTab(id);
      }}
      onCloseOtherTabs={(id) => {
        const others = tabs.filter((t) => t.id !== id);
        handleCloseMultipleTabs(
          others.map((t) => t.id),
          `Close ${others.length} other ${others.length === 1 ? 'tab' : 'tabs'}?`,
        );
      }}
      onCloseTabsToTheRight={(id) => {
        const index = tabs.findIndex((t) => t.id === id);
        if (index < 0) return;
        const ids = tabs.slice(index + 1).map((t) => t.id);
        handleCloseMultipleTabs(
          ids,
          `Close ${ids.length} ${ids.length === 1 ? 'tab' : 'tabs'} to the right?`,
        );
      }}
      onReopenClosedTab={() => {
        // Reopening while a split is visible must not steal
        // the split view (same rule as + — 2026-11-16).
        const groups = useSplitPaneStore.getState().groups;
        const active = useTerminalStore.getState().activeTabId;
        const splitVisible =
          active !== null && getVisibleTabIds(groups, active).length > 1;
        void useTerminalStore
          .getState()
          .reopenClosedTab({ activate: !splitVisible });
      }}
      onCopyTabCwd={(id) => {
        const tab = tabs.find((t) => t.id === id);
        if (tab) void navigator.clipboard?.writeText?.(tab.cwd);
      }}
      closeAsk={closeAskToShow}
      onCloseAskResnap={handleCloseAskResnap}
      onCloseAskCloseSession={handleCloseAskCloseSession}
      onCloseAskCloseTab={handleCloseAskCloseTab}
      onCloseAskKeepTab={handleCloseAskKeepTab}
      onCloseAskCloseAllPanes={() =>
        useSplitPaneStore.getState().confirmUnsplitAll()
      }
      onCloseAskCloseTabs={handleCloseAskCloseTabs}
      onCloseAskKeepTabs={handleCloseAskKeepTabs}
      onDismissCloseAsk={handleDismissCloseAsk}
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
