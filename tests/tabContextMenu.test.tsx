// @vitest-environment jsdom
/**
 * The per-tab context menu (Atom steal #17 — tabs
 * punch-list): right-click a tab, pick an action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
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
