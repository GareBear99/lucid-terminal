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
      onCloseAskCloseTab={props.onCloseAskCloseTab ?? noop}
      onCloseAskKeepTab={props.onCloseAskKeepTab ?? noop}
      onDismissCloseAsk={props.onDismissCloseAsk ?? noop}
    />,
  );
}

describe('unsplit-all close ask', () => {
  it('names the pane count and the cost — no silent wipe', () => {
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Unsplit all', kind: 'unsplit-all', paneCount: 3 },
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.getAttribute('aria-label')).toBe('Unsplit all 3 panes?');
    expect(dialog.textContent).toContain('Unsplit all 3 panes?');
    expect(dialog.textContent).toContain('This closes all 3 panes.');
    expect(dialog.textContent).toContain('destroyed');
    expect(screen.getByTestId('tab-close-ask-keep-panes').textContent).toBe('Keep panes');
    expect(screen.getByTestId('tab-close-ask-close-all-panes').textContent).toBe('Close all panes');
  });

  it('"Close all panes" confirms; "Keep panes" dismisses and never confirms', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Unsplit all', kind: 'unsplit-all', paneCount: 4 },
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
      closeAsk: { tabId: 'terminal-1', title: 'Unsplit all', kind: 'unsplit-all', paneCount: 2 },
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
