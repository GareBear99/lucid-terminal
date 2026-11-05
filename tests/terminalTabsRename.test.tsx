// @vitest-environment jsdom
/**
 * Terminal tab double-click rename tests.
 *
 * Gary (2026-11-05): double-click a terminal tab and it becomes an
 * inline text field with the current name selected. Type the new name:
 * Enter commits it, Escape cancels (name unchanged), clicking away
 * commits it too. The renamed name is the tab's label from then on.
 * Renaming does not change the tab's number (see
 * tests/terminalStore.test.ts — the numbering works off the tab id).
 *
 * These are DOM interaction tests for the presentational
 * TerminalTabsView (rendered with @testing-library/react): the store
 * wiring (onRenameTab -> updateTabTitle) is the container's job and
 * is covered by the store tests.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

function renderView(onRenameTab: (id: string, title: string) => void) {
  return render(
    React.createElement(TerminalTabsView, {
      tabs: TABS,
      activeTabId: 't1',
      notifications: [] as Notification[],
      notificationsOpen: false,
      onCreateTab: noop,
      onCloseTab: noop,
      onRenameTab,
      onSelectTab: noop,
      onToggleNotifications: noop,
      onDismissNotification: noop,
      onClearAllNotifications: noop,
    }),
  );
}

/** Start editing tab 1 and return its text field. */
function startEditing() {
  fireEvent.doubleClick(screen.getByText('Terminal 1'));
  const input = screen.getByRole('textbox', { name: 'Rename Terminal 1' });
  return input as HTMLInputElement;
}

describe('TerminalTabs — double-click rename', () => {
  it('double-click turns the tab into a text field with the name selected', () => {
    renderView(vi.fn());
    const input = startEditing();
    expect(input.value).toBe('Terminal 1');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Terminal 1'.length);
  });

  it('Enter commits the new name', () => {
    const onRenameTab = vi.fn();
    renderView(onRenameTab);
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'My Shell' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameTab).toHaveBeenCalledTimes(1);
    expect(onRenameTab).toHaveBeenCalledWith('t1', 'My Shell');
    // Edit mode ends: the field is gone, the label is back.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Terminal 1')).toBeTruthy();
  });

  it('Escape cancels: the name is unchanged and nothing is committed', () => {
    const onRenameTab = vi.fn();
    renderView(onRenameTab);
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRenameTab).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Terminal 1')).toBeTruthy();
  });

  it('clicking away (blur) commits the new name', () => {
    const onRenameTab = vi.fn();
    renderView(onRenameTab);
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'Away' } });
    fireEvent.blur(input);
    expect(onRenameTab).toHaveBeenCalledTimes(1);
    expect(onRenameTab).toHaveBeenCalledWith('t1', 'Away');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('committing an empty name keeps the old title', () => {
    const onRenameTab = vi.fn();
    renderView(onRenameTab);
    const input = startEditing();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onRenameTab).not.toHaveBeenCalled();
    expect(screen.getByText('Terminal 1')).toBeTruthy();
  });

  it('double-clicking the field itself does not wipe what was typed', () => {
    renderView(vi.fn());
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.doubleClick(input);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Typed');
  });
});
