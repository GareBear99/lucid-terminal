// @vitest-environment jsdom
/**
 * Tab x in the MAIN window asks before closing a USED tab
 * (Gary, 2026-11-14 — "ask when closing a used tab too").
 *
 * Covered here: "used" is a tab that has run at least one
 * command — it has blocks in its feed, or its hasPrompted flag
 * is set (covers a tab whose history was cleared after running
 * commands; a block is created with isComplete: false at submit,
 * so a command still running already counts). An unused tab
 * closes silently, exactly as today. A used PANE tab asks too,
 * then closePane runs on confirm (the group dissolves at one
 * pane left). Guest behaves the same way — a used guest tab's
 * session is worth protecting inside the session, even though
 * everything is dropped on exit. The blank-slate rule is
 * untouched: the ask reads session state only.
 *
 * Honest limit (documented in TerminalTabs.tsx): raw xterm
 * input in devmode creates no block and sets no flag, so a
 * devmode tab used only through the raw xterm reads as unused.
 *
 * Live verification (the dialog's live feel) is Gary's hands.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSplitPaneStore } from '../src/stores/splitPaneStore';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

describe('TerminalTabs main-window x asks for used tabs', () => {
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
    useSplitPaneStore.getState().resetForTests();
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
  });

  function closeButtonFor(tabId: string): HTMLElement {
    const tab = document.querySelector(`[data-testid="tab-${tabId}"]`) as HTMLElement;
    expect(tab).not.toBeNull();
    const button = tab.querySelector('button') as HTMLElement;
    expect(button).not.toBeNull();
    return button;
  }

  function markUsedByBlocks(tabId = 'terminal-1') {
    useHistoryStore.getState().setBlocks(tabId, [block('b1', 'ls')]);
  }

  test('a tab with blocks asks first — Close tab destroys the PTY and removes it', () => {
    markUsedByBlocks();
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    const dialog = screen.getByTestId('tab-close-ask');
    expect(dialog.textContent).toContain('Terminal 1');
    expect(dialog.textContent).toContain('has run commands');
    expect(screen.getByTestId('tab-close-ask-close-tab')).not.toBeNull();
    expect(screen.getByTestId('tab-close-ask-keep-tab')).not.toBeNull();
    expect(mockDestroy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-close-tab'));
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('a tab with hasPrompted set (history cleared) still counts as used', () => {
    useTerminalStore.setState({
      tabs: [
        { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true, hasPrompted: true },
        { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
      ],
    });
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.getByTestId('tab-close-ask')).not.toBeNull();
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  test('Keep tab leaves it open — nothing destroyed', () => {
    markUsedByBlocks();
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    fireEvent.click(screen.getByTestId('tab-close-ask-keep-tab'));
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('dismissing the ask (backdrop click) keeps the used tab', () => {
    markUsedByBlocks();
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    fireEvent.click(screen.getByTestId('tab-close-ask'));
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
  });

  test('a used pane tab asks, then closePane runs on confirm — the group dissolves', () => {
    markUsedByBlocks();
    useSplitPaneStore.setState({
      // Tree shape (slice E): a split node holding the two pane leaves.
      groups: {
        'split-1': {
          id: 'split-1',
          root: {
            type: 'split',
            id: 'split-node-1',
            direction: 'vertical',
            sizes: [50, 50],
            first: { type: 'leaf', tabId: 'terminal-1' },
            second: { type: 'leaf', tabId: 'terminal-2' },
          },
        },
      },
    });
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.getByTestId('tab-close-ask')).not.toBeNull();
    expect(mockDestroy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-close-ask-close-tab'));
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
    expect(useSplitPaneStore.getState().groups).toEqual({});
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
  });

  test('an unused pane tab closes silently — no ask, group dissolves', () => {
    useSplitPaneStore.setState({
      // Tree shape (slice E): a split node holding the two pane leaves.
      groups: {
        'split-1': {
          id: 'split-1',
          root: {
            type: 'split',
            id: 'split-node-1',
            direction: 'vertical',
            sizes: [50, 50],
            first: { type: 'leaf', tabId: 'terminal-1' },
            second: { type: 'leaf', tabId: 'terminal-2' },
          },
        },
      },
    });
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
    expect(useSplitPaneStore.getState().groups).toEqual({});
  });

  test('guest: a used guest tab asks the same way', () => {
    useHistoryStore.getState().enterGuestSession();
    try {
      markUsedByBlocks();
      render(React.createElement(TerminalTabs, {}));
      fireEvent.click(closeButtonFor('terminal-1'));
      expect(screen.getByTestId('tab-close-ask')).not.toBeNull();
      expect(screen.getByTestId('tab-close-ask-close-tab')).not.toBeNull();
      fireEvent.click(screen.getByTestId('tab-close-ask-keep-tab'));
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
    } finally {
      useHistoryStore.getState().exitGuestSession();
    }
  });
});
