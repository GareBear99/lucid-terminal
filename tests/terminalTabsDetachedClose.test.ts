// @vitest-environment jsdom
/**
 * Tab x in a detached window (Gary, 2026-11-14 — "a popup asks,
 * every time — resnap it, or close its session?").
 *
 * Covered here: the x on a tab in a DETACHED window no longer
 * resnaps directly — it shows the ask dialog first, every time,
 * and only the answer moves the tab. "Resnap" is the old pop-in
 * path (same as the pop-in button — the tab comes back into the
 * main window with its PTY and history intact), never closeTab.
 * "Close session" is the closeTab path (destroys the PTY, tells
 * main via notifyTabClosed, removes the tab locally). In the MAIN
 * window the x on an UNUSED tab still closes it silently. The red
 * window X is untouched — this is only the tab's own x in the
 * strip.
 *
 * Live verification (the tab reappears in the main strip with
 * its blocks intact, the dialog's live feel) is Gary's hands —
 * no window exists here.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

describe('TerminalTabs detached x asks first', () => {
  const mockDetach = {
    dragStart: vi.fn(),
    dragMove: vi.fn(),
    dragEnd: vi.fn(),
    dragCancel: vi.fn(),
    dragDiag: vi.fn(),
    reportBarRect: vi.fn(),
    onDragDetect: vi.fn(() => () => {}),
    onDragDetectClear: vi.fn(() => () => {}),
    popIn: vi.fn().mockResolvedValue({ ok: true }),
    notifyTabClosed: vi.fn(),
  };
  const mockDestroy = vi.fn();
  let prevLucidAPI: unknown;
  let prevResizeObserver: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      terminal: {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: mockDestroy,
        detach: mockDetach,
      },
    };
    prevResizeObserver = win.ResizeObserver;
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.clearAllMocks();
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-1' });
    useHistoryStore.setState({ blocksByTab: {} });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ blocksByTab: {} });
  });

  function closeButtonFor(tabId: string): HTMLElement {
    const tab = document.querySelector(`[data-testid="tab-${tabId}"]`) as HTMLElement;
    expect(tab).not.toBeNull();
    const button = tab.querySelector('button') as HTMLElement;
    expect(button).not.toBeNull();
    return button;
  }

  function askDialog(): HTMLElement {
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog).not.toBeNull();
    return dialog;
  }

  test('x on a detached tab asks first — nothing moves until an answer', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    // The dialog is up, naming the tab and the two choices.
    expect(askDialog().textContent).toContain('Terminal 1');
    expect(screen.getByTestId('tab-close-ask-resnap')).not.toBeNull();
    expect(screen.getByTestId('tab-close-ask-close-session')).not.toBeNull();
    // Neither path ran yet.
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
  });

  test('Resnap pops it back in — PTY intact, tab stays put locally', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    fireEvent.click(screen.getByTestId('tab-close-ask-resnap'));
    expect(mockDetach.popIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp' }),
    );
    // Never the destroy path: the PTY lives, and the tab is not
    // removed locally (main sends tab-removed when it lands).
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('x on a non-active detached tab asks about THAT tab, not the active one', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-2'));
    expect(askDialog().textContent).toContain('Terminal 2');
    fireEvent.click(screen.getByTestId('tab-close-ask-resnap'));
    expect(mockDetach.popIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-2', title: 'Terminal 2' }),
    );
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  test('Close session destroys the PTY, tells main, and removes the tab', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    fireEvent.click(screen.getByTestId('tab-close-ask-close-session'));
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(mockDetach.notifyTabClosed).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('dismissing the ask (backdrop click) keeps the tab where it is', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.getByTestId('tab-close-ask')).not.toBeNull();
    fireEvent.click(screen.getByTestId('tab-close-ask'));
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
  });

  test('dismissing the ask (Escape) keeps the tab where it is', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.getByTestId('tab-close-ask')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  test('x in the main window still closes an unused tab silently (destroys the PTY)', () => {
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
  });
});
