// @vitest-environment jsdom
/**
 * Tab clicks + terminal-chrome keyboard shortcuts, LIVE (Gary,
 * 2026-11-16 — "now when split you cant go to any other tabs").
 *
 * ROOT CAUSE (2026-11-16, build 1d50e76): `useTerminalTabDrag`
 * set pointer capture on the tab strip on EVERY pointerdown —
 * and per the UI Events spec the click then fires on the
 * nearest common ancestor of the pointerdown target (the tab)
 * and the pointerup target (the bar) — the bar. The tab's
 * `onClick` (`setActiveTab`) never ran, so EVERY tab click was
 * dead (masked before, because `createTab` always activated
 * the new tab — Gary never needed to click one; the pairs fix
 * is what exposed it). The same capture broke file-tab clicks
 * in the editor. And the window keydown guard blocked Meta+D /
 * Meta+U / Meta+1–9 whenever the xterm was focused — which is
 * always, because the xterm surface is a textarea.
 *
 * FIX: a press is a CLICK until the pointer moves past 5px —
 * only then does the drag engage (capture + `dragStart`); a
 * plain click never touches the drag machinery, so the click
 * fires on the tab. The xterm surface is exempt from the
 * text-field guard (Meta-only for D/U — Ctrl+D is the shell's
 * EOF and Ctrl+U its kill-line; both modifiers for 1–9, which
 * have no shell meaning).
 *
 * jsdom cannot reproduce the capture retargeting (it does not
 * implement pointer capture), so these tests prove the fix's
 * guarantee directly: a click never engages the drag (no
 * `dragStart`, no dragging state), a drag past the threshold
 * still does, and the keyboard shortcuts fire from the xterm.
 * Each test FAILS on the pre-fix code (dragStart on
 * pointerdown; the guard returning early) and PASSES with it.
 *
 * Run with: npx vitest run tests/tabClickAndKeyboard.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSplitPaneStore } from '../src/stores/splitPaneStore';
import type { TerminalTab } from '../src/types';
import type { SplitGroup } from '../src/stores/splitPaneStore';

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

describe('tab clicks and terminal-chrome keyboard shortcuts, live (TerminalTabs)', () => {
  let dragStart: ReturnType<typeof vi.fn>;
  let dragMove: ReturnType<typeof vi.fn>;
  let dragEnd: ReturnType<typeof vi.fn>;
  let dragCancel: ReturnType<typeof vi.fn>;
  let restoreLucidAPI: () => void;

  function installDetachMock() {
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    dragStart = vi.fn();
    dragMove = vi.fn();
    dragEnd = vi.fn();
    dragCancel = vi.fn();
    const mock = {
      terminal: {
        create: vi.fn(async () => undefined),
        destroy: vi.fn(async () => undefined),
        write: vi.fn(async () => undefined),
        detach: {
          dragStart,
          dragMove,
          dragEnd,
          dragCancel,
          dragDiag: vi.fn(),
          popIn: vi.fn(async () => undefined),
          onDragDetect: vi.fn(() => () => {}),
          onDragDetectClear: vi.fn(() => () => {}),
          reportBarRect: vi.fn(),
        },
      },
      fs: { getHomeDir: vi.fn(async () => '/tmp/test-home') },
    };
    win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
    return () => {
      if (prevLucidAPI === undefined) delete win.lucidAPI;
      else win.lucidAPI = prevLucidAPI;
    };
  }

  function seedTwoTabsSplit() {
    const tabs: TerminalTab[] = [
      { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp/a', isActive: true },
      { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp/b', isActive: false },
    ];
    const group: SplitGroup = {
      id: 'split-1',
      root: {
        type: 'split',
        id: 'node-1',
        direction: 'horizontal',
        sizes: [50, 50],
        first: { type: 'leaf', tabId: 'terminal-1' },
        second: { type: 'leaf', tabId: 'terminal-2' },
      },
    };
    useTerminalStore.setState({ tabs, activeTabId: 'terminal-1', createErrors: {}, exitedTabs: {} });
    useSplitPaneStore.setState({ groups: { 'split-1': group } });
  }

  function resetStores() {
    useTerminalStore.setState({ tabs: [], activeTabId: null, createErrors: {}, exitedTabs: {} });
    useSplitPaneStore.getState().resetForTests();
  }

  beforeEach(() => {
    restoreLucidAPI = installDetachMock();
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockImplementation((q: string) => ({
          matches: false,
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        })),
        configurable: true,
      });
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!(window as unknown as Record<string, unknown>).ResizeObserver) {
      (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      (globalThis as unknown as Record<string, unknown>).ResizeObserver = (
        window as unknown as Record<string, unknown>
      ).ResizeObserver;
    }
    resetStores();
  });

  afterEach(() => {
    restoreLucidAPI();
    vi.restoreAllMocks();
  });

  /** A real press: pointerdown on the tab, pointerup on the tab,
   *  then the click the browser fires on the tab. */
  function clickTab(tabEl: HTMLElement) {
    fireEvent.pointerDown(tabEl, { pointerId: 1, button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(tabEl, { pointerId: 1, button: 0, clientX: 100, clientY: 10 });
    fireEvent.click(tabEl);
  }

  test('clicking a tab while split never engages the drag and switches to it', () => {
    seedTwoTabsSplit();
    render(<TerminalTabs />);
    const tab2 = screen.getByTestId('tab-terminal-2');

    clickTab(tab2);

    // The drag machinery never engaged for a click: no session
    // started in main, no dragging state on the tab.
    expect(dragStart).not.toHaveBeenCalled();
    expect(dragMove).not.toHaveBeenCalled();
    expect(dragEnd).not.toHaveBeenCalled();
    expect(tab2.className).not.toContain('opacity-40');
    // And the click switched to the tab.
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
  });

  test('a press that moves past the threshold still starts a drag', () => {
    seedTwoTabsSplit();
    render(<TerminalTabs />);
    const tab2 = screen.getByTestId('tab-terminal-2');

    fireEvent.pointerDown(tab2, { pointerId: 1, button: 0, clientX: 100, clientY: 10 });
    // A 20px move — past the 5px engage threshold.
    fireEvent.pointerMove(window, { pointerId: 1, button: 0, clientX: 120, clientY: 10 });
    expect(dragStart).toHaveBeenCalledTimes(1);
    expect(dragStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-2' }),
      1,
      expect.anything(),
    );
    // The tab is marked dragging (opacity-40).
    expect(tab2.className).toContain('opacity-40');
    fireEvent.pointerUp(window, { pointerId: 1, button: 0, clientX: 120, clientY: 10 });
    expect(dragEnd).toHaveBeenCalledTimes(1);
    // The drag did not switch the tab (the pointerup is part of
    // the drag, not a click — no click event is dispatched).
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-1');
  });

  test('a press that moves only a few pixels stays a click (no drag)', () => {
    seedTwoTabsSplit();
    render(<TerminalTabs />);
    const tab2 = screen.getByTestId('tab-terminal-2');

    fireEvent.pointerDown(tab2, { pointerId: 1, button: 0, clientX: 100, clientY: 10 });
    // 3px of jitter — inside the 5px engage threshold.
    fireEvent.pointerMove(window, { pointerId: 1, button: 0, clientX: 103, clientY: 10 });
    fireEvent.pointerUp(tab2, { pointerId: 1, button: 0, clientX: 103, clientY: 10 });
    expect(dragStart).not.toHaveBeenCalled();
    expect(tab2.className).not.toContain('opacity-40');
    fireEvent.click(tab2);
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
  });

  /** Focus the xterm surface (the hidden helper textarea) the
   *  way the terminal does after every activation. */
  function focusXterm(container: HTMLElement) {
    const xterm = document.createElement('textarea');
    xterm.className = 'xterm-helper-textarea';
    container.appendChild(xterm);
    xterm.focus();
    expect(document.activeElement).toBe(xterm);
    return xterm;
  }

  test('Meta+D splits from the xterm (the guard used to block it)', async () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    focusXterm(container);
    const splitSpy = vi.spyOn(useSplitPaneStore.getState(), 'splitTab');

    fireEvent.keyDown(window, { key: 'd', metaKey: true });

    expect(splitSpy).toHaveBeenCalledWith('terminal-1');
  });

  test('Meta+U unsplits from the xterm', () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    focusXterm(container);

    fireEvent.keyDown(window, { key: 'u', metaKey: true });

    // The pair is gone: the unsplit ran.
    expect(Object.keys(useSplitPaneStore.getState().groups)).toHaveLength(0);
  });

  test('Meta+1 switches tabs from the xterm', () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    focusXterm(container);

    fireEvent.keyDown(window, { key: '2', metaKey: true });

    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
  });

  test('Ctrl+1 also switches from the xterm (numbers have no shell meaning)', () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    focusXterm(container);

    fireEvent.keyDown(window, { key: '2', ctrlKey: true });

    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
  });

  test('Ctrl+D from the xterm does NOT split (it is the shell\u2019s EOF)', () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    focusXterm(container);
    const splitSpy = vi.spyOn(useSplitPaneStore.getState(), 'splitTab');

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });

    expect(splitSpy).not.toHaveBeenCalled();
  });

  test('Meta+D from a real text input still does NOT split (the guard holds)', () => {
    seedTwoTabsSplit();
    const { container } = render(<TerminalTabs />);
    const input = document.createElement('input');
    container.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    const splitSpy = vi.spyOn(useSplitPaneStore.getState(), 'splitTab');

    fireEvent.keyDown(window, { key: 'd', metaKey: true });

    expect(splitSpy).not.toHaveBeenCalled();
  });
});
