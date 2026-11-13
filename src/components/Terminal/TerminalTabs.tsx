import { useEffect, useRef, useState } from 'react';
import { Plus, X, Terminal, Bell } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';
import { useToastStore, unreadCount } from '../../stores/toastStore';
import { getTypeStyles } from './ErrorNotification';
import type { Notification } from './ErrorNotification';
import type { TerminalTab } from '../../types';
import { BloodDropIcon } from '../Layout/BloodDropIcon';

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
export interface TerminalTabsViewProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  notifications: Notification[];
  notificationsOpen: boolean;
  onCreateTab: () => void;
  onCloseTab: (id: string) => void;
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
}

export function TerminalTabsView({
  tabs,
  activeTabId,
  notifications,
  notificationsOpen,
  onCreateTab,
  onCloseTab,
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

  // Inline rename: double-clicking a tab swaps its label for a text
  // field with the current name selected. Enter or clicking away
  // commits, Escape cancels.
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const cancelEditRef = useRef(false);

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
      data-testid="terminal-tabs-bar"
      className="relative h-9 flex items-center rounded-none border-b border-[var(--border)] bg-black/50 backdrop-blur-md"
    >
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

        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] cursor-pointer transition-colors ${
              tab.id === activeTabId
                ? 'bg-black/60 text-[var(--text-primary)] tab-active shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }`}
            onClick={() => onSelectTab(tab.id)}
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

        {/* New Tab Button — directly after the last tab */}
        <button
          onClick={onCreateTab}
          className="h-9 px-3 shrink-0 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          title="New Terminal"
        >
          <Plus size={18} />
        </button>
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
    </div>
  );
}

interface TerminalTabsProps {
  /** LuciferAI enabled — the blood drop tab renders only then. */
  showBloodDrop?: boolean;
  /** The blood drop tab is the selected one. */
  bloodDropActive?: boolean;
  /** Selecting the drop (true), or a terminal tab / creating one (false). */
  onBloodDropActiveChange?: (active: boolean) => void;
  /** SILENCED (Gary, 2026-11-08 ~06:41 PST): the blood drop tab is inert while silenced. */
  bloodDropDisabled?: boolean;
}

function TerminalTabs({ showBloodDrop = false, bloodDropActive = false, onBloodDropActiveChange, bloodDropDisabled = false }: TerminalTabsProps) {
  const { tabs, activeTabId, createTab, closeTab, updateTabTitle, setActiveTab } =
    useTerminalStore();
  const { notifications, removeNotification, clearAll, markAllRead } = useToastStore();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // ⌘1–⌘9 switch tabs (Warp §7): the strip is tabs only, so
  // the numbers are the tabs in strip order. Skipped when focus is in a text field
  // that is not a composer (renaming a tab, Settings, ...) —
  // the composer is the one text field the switch works from,
  // because Warp switches from the prompt too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
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
  }, [tabs, setActiveTab]);

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
        void createTab();
        onBloodDropActiveChange?.(false);
      }}
      onCloseTab={closeTab}
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
