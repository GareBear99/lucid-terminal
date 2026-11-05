/**
 * Terminal tab bar tests.
 *
 * The "+" (New Terminal) button lives INSIDE the tab strip, directly
 * after the last tab — it is connected to the end tab and scrolls
 * with the strip. The right end of the bar holds the notifications
 * bell instead: a badge with the unread count (red when an unread
 * error exists) that toggles a panel listing the notifications from
 * the toast store, with per-item dismiss and clear-all.
 *
 * There is no @testing-library / jsdom in this repo, so these tests
 * render with react-dom/server's renderToStaticMarkup. They render
 * the presentational TerminalTabsView with explicit props: zustand's
 * useStore hook returns the store's initial state under SSR, so the
 * store-wired container cannot be rendered with set-up state. The
 * store behaviour behind the container (markAllRead, dismissToast,
 * unreadCount) is covered in tests/toastStore.test.ts; the click
 * wiring (bell toggles the panel and clears the badge) is verified
 * by the live VM check.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

function notification(
  overrides: Partial<Notification> & { id: string; type: Notification['type']; message: string },
): Notification {
  return {
    duration: 5000,
    dismissible: true,
    read: false,
    toastDismissed: false,
    ...overrides,
  };
}

const renderView = (props: {
  tabs?: typeof TABS;
  notifications?: Notification[];
  notificationsOpen?: boolean;
}) =>
  renderToStaticMarkup(
    React.createElement(TerminalTabsView, {
      tabs: props.tabs ?? TABS,
      activeTabId: 't1',
      notifications: props.notifications ?? [],
      notificationsOpen: props.notificationsOpen ?? false,
      onCreateTab: noop,
      onCloseTab: noop,
      onSelectTab: noop,
      onToggleNotifications: noop,
      onDismissNotification: noop,
      onClearAllNotifications: noop,
    }),
  );

/** The tab strip's HTML: from its opening <div> to its matching close. */
function stripHtml(html: string): { inner: string; end: number } {
  const markerIdx = html.indexOf('overflow-x-auto');
  expect(markerIdx).toBeGreaterThan(-1);
  const openIdx = html.lastIndexOf('<div', markerIdx);
  let depth = 0;
  let i = openIdx;
  while (i < html.length) {
    if (html.startsWith('<div', i)) {
      depth++;
      i += 4;
    } else if (html.startsWith('</div>', i)) {
      depth--;
      i += 6;
      if (depth === 0) return { inner: html.slice(openIdx, i), end: i };
    } else {
      i++;
    }
  }
  throw new Error('tab strip div never closed');
}

/** The bell badge span (the count bubble on the bell button), if any. */
function badgeHtml(html: string): string | null {
  const m = html.match(/<span[^>]*top-1 right-0\.5[^>]*>([^<]*)<\/span>/);
  return m ? m[0] : null;
}

describe('TerminalTabs — New Terminal button', () => {
  it('renders the + button inside the tab strip, directly after the last tab', () => {
    const html = renderView({});
    const { inner } = stripHtml(html);
    expect(inner).toContain('Terminal 1');
    expect(inner).toContain('Terminal 2');
    expect(inner).toContain('title="New Terminal"');
    // After the last tab, before the strip closes.
    expect(inner.indexOf('Terminal 2')).toBeLessThan(inner.indexOf('title="New Terminal"'));
  });

  it('renders the + button even with no tabs', () => {
    const html = renderView({ tabs: [] });
    const { inner } = stripHtml(html);
    expect(inner).toContain('title="New Terminal"');
  });
});

describe('TerminalTabs — notifications bell', () => {
  it('renders the bell in the + button’s old spot: after the tab strip', () => {
    const html = renderView({});
    const { inner, end } = stripHtml(html);
    expect(inner).not.toContain('title="Notifications"');
    expect(html.indexOf('title="Notifications"')).toBeGreaterThan(end);
  });

  it('shows no badge when there are no notifications', () => {
    const html = renderView({});
    expect(badgeHtml(html)).toBeNull();
  });

  it('shows the unread count, red when an unread error exists', () => {
    const html = renderView({
      notifications: [
        notification({ id: 'n1', type: 'error', message: 'Disk full' }),
        notification({ id: 'n2', type: 'info', message: 'Saved' }),
      ],
    });
    const badge = badgeHtml(html);
    expect(badge).not.toBeNull();
    expect(badge).toContain('>2<');
    expect(badge).toContain('bg-red-500');
  });

  it('shows a neutral badge when the unread notifications are not errors', () => {
    const html = renderView({
      notifications: [notification({ id: 'n1', type: 'info', message: 'Saved' })],
    });
    const badge = badgeHtml(html);
    expect(badge).not.toBeNull();
    expect(badge).toContain('>1<');
    expect(badge).not.toContain('bg-red-500');
  });

  it('shows no badge once everything is read', () => {
    const html = renderView({
      notifications: [
        notification({ id: 'n1', type: 'error', message: 'Disk full', read: true }),
      ],
    });
    expect(badgeHtml(html)).toBeNull();
  });

  it('caps the badge at 9+', () => {
    const html = renderView({
      notifications: Array.from({ length: 10 }, (_, i) =>
        notification({ id: `n${i}`, type: 'info', message: `Note ${i}` }),
      ),
    });
    expect(badgeHtml(html)).toContain('>9+<');
  });
});

describe('TerminalTabs — notifications panel', () => {
  it('is closed by default: notification messages are not rendered', () => {
    const html = renderView({
      notifications: [notification({ id: 'n1', type: 'error', message: 'Disk full' })],
    });
    expect(html).not.toContain('Disk full');
    expect(html).not.toContain('Clear all');
  });

  it('lists the notifications with per-item dismiss and clear-all when open', () => {
    const html = renderView({
      notifications: [
        notification({ id: 'n1', type: 'error', message: 'Disk full' }),
        notification({ id: 'n2', type: 'info', message: 'Saved' }),
      ],
      notificationsOpen: true,
    });
    expect(html).toContain('Disk full');
    expect(html).toContain('Saved');
    expect(html).toContain('Notifications');
    expect(html).toContain('Clear all');
    expect((html.match(/title="Dismiss notification"/g) || []).length).toBe(2);
  });

  it('shows the empty state when open with no notifications', () => {
    const html = renderView({ notificationsOpen: true });
    expect(html).toContain('No notifications');
    expect(html).not.toContain('Clear all');
  });

  it('still lists a notification after its toast has gone', () => {
    const html = renderView({
      notifications: [
        notification({ id: 'n1', type: 'error', message: 'Disk full', toastDismissed: true }),
      ],
      notificationsOpen: true,
    });
    expect(html).toContain('Disk full');
  });
});

describe('TerminalTabs — divider between tabs and bell', () => {
  /**
   * Mirrors the line that separates the plugin icons from Settings in
   * the icon bar (Sidebar.tsx): the same 1px var(--border) line with
   * the same 4px spacing, turned vertical because this bar is
   * horizontal. It sits between the tabs and the bell.
   */
  const DIVIDER = 'border-l border-[var(--border)]';

  it('renders the divider between the tab strip and the notifications bell', () => {
    const html = renderView({});
    const { end } = stripHtml(html);
    const dividerIdx = html.indexOf(DIVIDER);
    expect(dividerIdx).toBeGreaterThan(-1);
    // After the tab strip (which holds the tabs and the + button) ...
    expect(dividerIdx).toBeGreaterThan(end);
    // ... and before the bell.
    expect(dividerIdx).toBeLessThan(html.indexOf('title="Notifications"'));
  });

  it('renders the divider even with no tabs', () => {
    const html = renderView({ tabs: [] });
    expect(html.indexOf(DIVIDER)).toBeGreaterThan(-1);
  });
});
