// @vitest-environment jsdom
/**
 * The per-tab context menu (Atom steal #17 — tabs
 * punch-list): right-click a tab, pick an action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import { SplashMist } from '../src/components/Splash/SplashMist';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/home/a', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/home/b', isActive: false },
  { id: 'terminal-3', title: 'Terminal 3', cwd: '/home/c', isActive: false },
];

const noop = () => undefined;

function renderView(handlers: Record<string, unknown> = {}) {
  return render(
    <TerminalTabsView
      tabs={TABS}
      activeTabId="terminal-1"
      notifications={[] as Notification[]}
      notificationsOpen={false}
      onCreateTab={noop}
      onCloseTab={noop}
      onRenameTab={noop}
      onSelectTab={noop}
      onToggleNotifications={noop}
      onDismissNotification={noop}
      onClearAllNotifications={noop}
      {...(handlers as never)}
    />,
  );
}

describe('tab context menu', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } });
  });

  it('right-clicking a tab opens the menu; an outside click closes it', () => {
    const { getByTestId, queryByTestId } = renderView();
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    expect(getByTestId('tab-context-menu')).toBeTruthy();
    expect(queryByTestId('tab-context-menu')).not.toBeNull();
    fireEvent.click(getByTestId('tab-context-menu-overlay'));
    expect(queryByTestId('tab-context-menu')).toBeNull();
  });

  it('Close Other Tabs calls back with the right-clicked tab', () => {
    const onCloseOtherTabs = vi.fn();
    const { getByTestId, getByText } = renderView({ onCloseOtherTabs });
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    fireEvent.click(getByText('Close Other Tabs'));
    expect(onCloseOtherTabs).toHaveBeenCalledWith('terminal-2');
  });

  it('Close Tabs to the Right is disabled on the last tab, enabled elsewhere', () => {
    const { getByTestId, getByText } = renderView();
    fireEvent.contextMenu(getByTestId('tab-terminal-3'), { clientX: 100, clientY: 20 });
    expect((getByText('Close Tabs to the Right') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByTestId('tab-context-menu-overlay'));
    fireEvent.contextMenu(getByTestId('tab-terminal-1'), { clientX: 100, clientY: 20 });
    expect((getByText('Close Tabs to the Right') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Split This Tab, Reopen Closed Tab and Copy Working Directory call back', () => {
    const onSplitTabId = vi.fn();
    const onReopenClosedTab = vi.fn();
    const onCopyTabCwd = vi.fn();
    const { getByTestId, getByText } = renderView({ onSplitTabId, onReopenClosedTab, onCopyTabCwd });
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    fireEvent.click(getByText('Split This Tab'));
    expect(onSplitTabId).toHaveBeenCalledWith('terminal-2');
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    fireEvent.click(getByText('Reopen Closed Tab'));
    expect(onReopenClosedTab).toHaveBeenCalled();
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    fireEvent.click(getByText('Copy Working Directory'));
    expect(onCopyTabCwd).toHaveBeenCalledWith('terminal-2');
  });

  it('Escape closes the menu', () => {
    const { getByTestId, queryByTestId } = renderView();
    fireEvent.contextMenu(getByTestId('tab-terminal-1'), { clientX: 100, clientY: 20 });
    expect(queryByTestId('tab-context-menu')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByTestId('tab-context-menu')).toBeNull();
  });
});

describe('tab context menu — never stuck behind the mist (step 6)', () => {
  /**
   * Regression guard for the live failure (2026-11-15, Gary:
   * "that should never happen"): the menu rendered inside the
   * tab bar, whose backdrop-blur makes it a containing block
   * for fixed descendants AND a stacking context — so the
   * `fixed inset-0` overlay covered only the 36px strip
   * (outside clicks never dismissed it) and the menu painted
   * UNDER the terminal surface below the strip (the DEFCON 2
   * merge veil / devmode frosted xterm box), which blurred it
   * and swallowed its clicks. The fix portals it to the body
   * with an opaque backing. Verified by reverting the fix:
   * on the old in-bar render the portal, solid-background
   * and above-the-mist assertions below FAIL (3 failures);
   * the overlay-class, cursor-position, right-click-dismiss
   * and item-click assertions still pass there (jsdom has no
   * layout, so they lock the behaviour, not the stacking —
   * the portal assertions are the ones that bite).
   */
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } });
  });

  function openMenu(clientX = 1113, clientY = 176) {
    const utils = renderView();
    fireEvent.contextMenu(utils.getByTestId('tab-terminal-2'), { clientX, clientY });
    return utils;
  }

  it('is portaled to document.body, not rendered inside the tab bar', () => {
    const { getByTestId } = openMenu();
    const overlay = getByTestId('tab-context-menu-overlay');
    const menu = getByTestId('tab-context-menu');
    expect(overlay.parentElement).toBe(document.body);
    expect(menu.closest('[data-testid="terminal-tabs-bar"]')).toBeNull();
    expect(overlay.closest('[data-testid="terminal-tabs-bar"]')).toBeNull();
  });

  it('overlay is viewport-fixed and covers the screen', () => {
    const { getByTestId } = openMenu();
    const overlay = getByTestId('tab-context-menu-overlay');
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');
    expect(overlay.className).toContain('z-[60]');
  });

  it('menu sits at the cursor in viewport coordinates', () => {
    const { getByTestId } = openMenu(500, 176);
    const menu = getByTestId('tab-context-menu');
    // Portaled: left/top are viewport coordinates, so the menu
    // opens where the click happened — not offset by the bar.
    // (x is clamped to innerWidth - 200 by the trigger, so the
    // probe uses an unclamped coordinate.)
    expect(menu.style.left).toBe('500px');
    expect(menu.style.top).toBe('176px');
  });

  it('menu background is solid — theme colour over opaque black, never translucent or blurred', () => {
    const { getByTestId } = openMenu();
    const menu = getByTestId('tab-context-menu');
    expect(menu.className).not.toContain('bg-transparent');
    expect(menu.className).not.toContain('backdrop-blur');
    expect(menu.style.backgroundColor).toBeTruthy();
    expect(menu.style.backgroundImage).toContain('var(--bg-secondary)');
  });

  it('right-clicking the overlay dismisses the menu', () => {
    const { getByTestId, queryByTestId } = openMenu();
    fireEvent.contextMenu(getByTestId('tab-context-menu-overlay'));
    expect(queryByTestId('tab-context-menu')).toBeNull();
  });

  it('clicking an item runs it AND dismisses the menu', () => {
    const onCloseOtherTabs = vi.fn();
    const { getByTestId, getByText, queryByTestId } = renderView({ onCloseOtherTabs });
    fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
    fireEvent.click(getByText('Close Other Tabs'));
    expect(onCloseOtherTabs).toHaveBeenCalledWith('terminal-2');
    expect(queryByTestId('tab-context-menu')).toBeNull();
  });

  it('renders above the app-level mist, not inside it', () => {
    // Mist-on state: the splash mist is mounted (every view
    // except Files shows it) and the menu must still be a
    // body-level portal above it — never a descendant of the
    // mist layer or of anything under it.
    const { getByTestId, unmount } = render(
      <>
        <SplashMist />
        <TerminalTabsView
          tabs={TABS}
          activeTabId="terminal-1"
          notifications={[] as Notification[]}
          notificationsOpen={false}
          onCreateTab={noop}
          onCloseTab={noop}
          onRenameTab={noop}
          onSelectTab={noop}
          onToggleNotifications={noop}
          onDismissNotification={noop}
          onClearAllNotifications={noop}
        />
      </>,
    );
    try {
      fireEvent.contextMenu(getByTestId('tab-terminal-2'), { clientX: 100, clientY: 20 });
      const menu = getByTestId('tab-context-menu');
      expect(menu.closest('[data-testid="splash-mist"]')).toBeNull();
      expect(getByTestId('tab-context-menu-overlay').parentElement).toBe(document.body);
    } finally {
      unmount();
    }
  });
});
