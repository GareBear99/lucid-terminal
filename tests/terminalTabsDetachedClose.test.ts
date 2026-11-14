// @vitest-environment jsdom
/**
 * Tab x in a detached window (Gary, 2026-11-14 — "pressing X on
 * an external tab should always resnap it not erase its
 * history").
 *
 * Covered here: the x on a tab in a DETACHED window routes to
 * the pop-in path (same as the pop-in button — the tab comes
 * back into the main window with its PTY and history intact),
 * never to closeTab (which destroys the PTY). In the MAIN window
 * the x still closes the tab. The red window X is untouched —
 * this is only the tab's own x in the strip.
 *
 * Live verification (the tab reappears in the main strip with
 * its blocks intact) is Gary's hands — no window exists here.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

describe('TerminalTabs detached x resnaps', () => {
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
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
  });

  function closeButtonFor(tabId: string): HTMLElement {
    const tab = document.querySelector(`[data-testid="tab-${tabId}"]`) as HTMLElement;
    expect(tab).not.toBeNull();
    const button = tab.querySelector('button') as HTMLElement;
    expect(button).not.toBeNull();
    return button;
  }

  test('x on a detached tab pops it back in — PTY intact, tab stays put locally', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(mockDetach.popIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp' }),
    );
    // Never the destroy path: the PTY lives, and the tab is not
    // removed locally (main sends tab-removed when it lands).
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1', 'terminal-2']);
  });

  test('x on a non-active detached tab pops THAT tab back, not the active one', () => {
    render(React.createElement(TerminalTabs, { detachedWindow: true }));
    fireEvent.click(closeButtonFor('terminal-2'));
    expect(mockDetach.popIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-2', title: 'Terminal 2' }),
    );
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  test('x in the main window still closes the tab (destroys the PTY)', () => {
    render(React.createElement(TerminalTabs, {}));
    fireEvent.click(closeButtonFor('terminal-1'));
    expect(mockDetach.popIn).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-2']);
  });
});
