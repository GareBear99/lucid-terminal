// @vitest-environment jsdom
/**
 * TerminalTabsView — the close-ask dialog (Gary, 2026-11-14).
 *
 * The view renders the dialog from props only: the container owns
 * the pending ask. Rendered here directly in jsdom (not SSR —
 * renderToStaticMarkup cannot render portals, and the dialog is
 * portaled to document.body because the tab bar's backdrop-blur
 * makes it a containing block for fixed descendants). The dialog
 * follows the LocalAccessPromptDialog pattern: role="dialog",
 * aria-modal, fixed inset-0 z-60 backdrop, w-96 card, buttons row
 * with the secondary + primary classes. No "do not ask again":
 * the detached ask happens every time.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

function renderView(props: {
  closeAsk?: { tabId: string; title: string; kind: 'detached' | 'used' } | null;
  onCloseAskResnap?: () => void;
  onCloseAskCloseSession?: () => void;
  onCloseAskCloseTab?: () => void;
  onCloseAskKeepTab?: () => void;
  onDismissCloseAsk?: () => void;
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
      onToggleNotifications={noop}
      onDismissNotification={noop}
      onClearAllNotifications={noop}
      closeAsk={props.closeAsk ?? null}
      onCloseAskResnap={props.onCloseAskResnap}
      onCloseAskCloseSession={props.onCloseAskCloseSession}
      onCloseAskCloseTab={props.onCloseAskCloseTab}
      onCloseAskKeepTab={props.onCloseAskKeepTab}
      onDismissCloseAsk={props.onDismissCloseAsk}
    />,
  );
}

describe('close-ask dialog', () => {
  test('no dialog without a pending ask', () => {
    renderView({});
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('detached ask: Resnap + Close session, tab named, resnap explained', () => {
    const onResnap = vi.fn();
    const onCloseSession = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'detached' },
      onCloseAskResnap: onResnap,
      onCloseAskCloseSession: onCloseSession,
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Terminal 1');
    expect(dialog.textContent).toContain('Resnap');
    expect(dialog.textContent).toContain('keeps the session and its history');
    expect(dialog.textContent).toContain('cannot be brought back');
    fireEvent.click(screen.getByTestId('tab-close-ask-resnap'));
    expect(onResnap).toHaveBeenCalledTimes(1);
    expect(onCloseSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-close-session'));
    expect(onCloseSession).toHaveBeenCalledTimes(1);
  });

  test('used ask: Close tab + Keep tab, tab named, session loss explained', () => {
    const onCloseTab = vi.fn();
    const onKeepTab = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-2', title: 'Terminal 2', kind: 'used' },
      onCloseAskCloseTab: onCloseTab,
      onCloseAskKeepTab: onKeepTab,
    });
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.textContent).toContain('Terminal 2');
    expect(dialog.textContent).toContain('has run commands');
    expect(dialog.textContent).toContain('destroys its session');
    fireEvent.click(screen.getByTestId('tab-close-ask-close-tab'));
    expect(onCloseTab).toHaveBeenCalledTimes(1);
    expect(onKeepTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-keep-tab'));
    expect(onKeepTab).toHaveBeenCalledTimes(1);
  });

  test('backdrop click dismisses — the dismiss handler, never a close', () => {
    const onDismiss = vi.fn();
    const onResnap = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'detached' },
      onCloseAskResnap: onResnap,
      onDismissCloseAsk: onDismiss,
    });
    fireEvent.click(screen.getByTestId('tab-close-ask'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onResnap).not.toHaveBeenCalled();
  });

  test('Escape dismisses — the dismiss handler, never a close', () => {
    const onDismiss = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'detached' },
      onDismissCloseAsk: onDismiss,
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('a click inside the card does not dismiss', () => {
    const onDismiss = vi.fn();
    renderView({
      closeAsk: { tabId: 'terminal-1', title: 'Terminal 1', kind: 'detached' },
      onDismissCloseAsk: onDismiss,
    });
    const heading = screen.getByRole('heading', { name: /Close "Terminal 1"\?/ });
    fireEvent.click(heading);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
