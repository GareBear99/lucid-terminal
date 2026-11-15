// @vitest-environment jsdom
/**
 * The unsplit-all close ask (Gary, 2026-11-15 — chained
 * unsplit): `/unsplit all` / "Unsplit All Panes" asks first,
 * in the tab strip's close-ask dialog. The dialog names the
 * pane count and the cost; "Close all panes" confirms,
 * "Keep panes" (and the backdrop / Escape) keeps everything.
 *
 * Rendered with @testing-library/react — the dialog is a
 * portal into document.body, so renderToStaticMarkup cannot
 * see it. The store side (request / confirm / dismiss) is
 * covered in tests/splitPaneStore.test.ts.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalTabsView, type TabCloseAsk } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
  { id: 'terminal-3', title: 'Terminal 3', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

function renderView(props: {
  closeAsk?: TabCloseAsk | null;
  onCloseAskCloseAllPanes?: () => void;
  onCloseAskCloseTabs?: () => void;
  onCloseAskKeepTabs?: () => void;
  onDismissCloseAsk?: () => void;
  onCloseAskCloseTab?: () => void;
  onCloseAskKeepTab?: () => void;
}) {
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
      onSplitTab={noop}
      showSplitButton
      onToggleNotifications={noop}
      onDismissNotification={noop}
      onClearAllNotifications={noop}
      closeAsk={props.closeAsk ?? null}
      onCloseAskCloseAllPanes={props.onCloseAskCloseAllPanes ?? noop}
      onCloseAskCloseTabs={props.onCloseAskCloseTabs ?? noop}
      onCloseAskKeepTabs={props.onCloseAskKeepTabs ?? noop}
      onCloseAskCloseTab={props.onCloseAskCloseTab ?? noop}
      onCloseAskKeepTab={props.onCloseAskKeepTab ?? noop}
      onDismissCloseAsk={props.onDismissCloseAsk ?? noop}
    />,
  );
}

describe('unsplit-all close ask', () => {
  it('names the pane count, the tab, and the true cost — no silent wipe, no off-by-one', () => {
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'unsplit-all', paneCount: 3 },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    // P8: the dialog names the tab, like the tab × ask does.
    expect(dialog.getAttribute('aria-label')).toBe('Unsplit all 3 panes in "Terminal 1"?');
    expect(dialog.textContent).toContain('Unsplit all 3 panes in "Terminal 1"?');
    // P5: the cost is the OTHER panes — the asked tab stays open.
    expect(dialog.textContent).toContain('This closes the other 2 panes.');
    expect(dialog.textContent).toContain('"Terminal 1" stays open.');
    expect(dialog.textContent).toContain('destroyed');
    expect(screen.getByTestId('tab-close-ask-keep-panes').textContent).toBe('Keep panes');
    expect(screen.getByTestId('tab-close-ask-close-all-panes').textContent).toBe('Close all panes');
  });

  it('two panes: the cost is the other 1 pane (singular)', () => {
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'unsplit-all', paneCount: 2 },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.textContent).toContain('This closes the other 1 pane.');
    expect(dialog.textContent).toContain('"Terminal 1" stays open.');
  });

  it('"Close all panes" confirms; "Keep panes" dismisses and never confirms', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'unsplit-all', paneCount: 4 },
      onCloseAskCloseAllPanes: onConfirm,
      onDismissCloseAsk: onDismiss,
    });
    fireEvent.click(screen.getByTestId('tab-close-ask-keep-panes'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-close-all-panes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backdrop click dismisses — keep everything, never a destructive default', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'unsplit-all', paneCount: 2 },
      onCloseAskCloseAllPanes: onConfirm,
      onDismissCloseAsk: onDismiss,
    });
    fireEvent.click(screen.getByTestId('tab-close-ask'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the used-tab ask is unchanged — close-vs-keep, same copy', () => {
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'used' },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.textContent).toContain('Close "Terminal 1"?');
    expect(dialog.textContent).toContain('has run commands');
    expect(screen.getByTestId('tab-close-ask-keep-tab').textContent).toBe('Keep tab');
    expect(screen.getByTestId('tab-close-ask-close-tab').textContent).toBe('Close tab');
    expect(screen.queryByTestId('tab-close-ask-close-all-panes')).toBeNull();
  });

  it('no ask renders no dialog', () => {
    renderView({});
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });
});

describe('close-multiple ask (P2 — the context-menu bulk close)', () => {
  it('names the count and how many are panes; the confirm button names the count', () => {
    renderView({
      closeAsk: {
        tabIds: ['terminal-2', 'terminal-3'],
        title: 'Close 2 other tabs?',
        kind: 'close-multiple',
        paneCount: 1,
      },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.getAttribute('aria-label')).toBe('Close 2 other tabs?');
    expect(dialog.textContent).toContain('Close 2 other tabs?');
    expect(dialog.textContent).toContain('This closes 2 tabs, including 1 pane of a split group.');
    expect(dialog.textContent).toContain('destroyed');
    expect(screen.getByTestId('tab-close-ask-keep-tabs').textContent).toBe('Keep tabs');
    expect(screen.getByTestId('tab-close-ask-close-tabs').textContent).toBe('Close 2 tabs');
  });

  it('no panes: the body says just the count; one tab is singular', () => {
    renderView({
      closeAsk: {
        tabIds: ['terminal-2'],
        title: 'Close 1 tab to the right?',
        kind: 'close-multiple',
        paneCount: 0,
      },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.textContent).toContain('This closes 1 tab.');
    expect(dialog.textContent).not.toContain('split group');
    expect(screen.getByTestId('tab-close-ask-close-tabs').textContent).toBe('Close 1 tab');
  });

  it('"Close N tabs" confirms; "Keep tabs" dismisses and never confirms', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    renderView({
      closeAsk: {
        tabIds: ['terminal-2', 'terminal-3'],
        title: 'Close 2 other tabs?',
        kind: 'close-multiple',
        paneCount: 0,
      },
      onCloseAskCloseTabs: onConfirm,
      onCloseAskKeepTabs: onDismiss,
    });
    fireEvent.click(screen.getByTestId('tab-close-ask-keep-tabs'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-close-tabs'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backdrop click dismisses — keep everything, never a destructive default', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    renderView({
      closeAsk: {
        tabIds: ['terminal-2', 'terminal-3'],
        title: 'Close 2 other tabs?',
        kind: 'close-multiple',
        paneCount: 1,
      },
      onCloseAskCloseTabs: onConfirm,
      onDismissCloseAsk: onDismiss,
    });
    fireEvent.click(screen.getByTestId('tab-close-ask'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
