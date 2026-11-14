// @vitest-environment jsdom
/**
 * Tab detach drag ghost (Gary, 2026-11-14 — the drag-out
 * glitch: a tab pulled out must unsnap from the strip and
 * follow the cursor, not jump straight to an external window).
 *
 * Covered here: the ghost's position math (pure) and the strip
 * behaviour — pointerdown dims the tab (it lifts out), the
 * first move shows the ghost at the grabbed spot, pointerup
 * clears it, and dragStart carries the grab offset main anchors
 * the detached window on. The window follow itself (main moves
 * the detached window with the pointer) is verified live on the
 * Mac — no window exists in jsdom.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import { dragGhostTopLeft } from '../src/lib/tabDrag';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

describe('dragGhostTopLeft', () => {
  test('the pointer stays at its grabbed spot within the ghost', () => {
    expect(dragGhostTopLeft(120, 40, { x: 50, y: 10 })).toEqual({ x: 70, y: 30 });
  });

  test('a grab at the tab corner puts the ghost corner under the pointer', () => {
    expect(dragGhostTopLeft(120, 40, { x: 0, y: 0 })).toEqual({ x: 120, y: 40 });
  });
});

describe('TerminalTabsView drag ghost', () => {
  const mockDetach = {
    dragStart: vi.fn(),
    dragMove: vi.fn(),
    dragEnd: vi.fn(),
    dragCancel: vi.fn(),
    dragDiag: vi.fn(),
    reportBarRect: vi.fn(),
    onDragDetect: vi.fn(() => () => {}),
    onDragDetectClear: vi.fn(() => () => {}),
  };
  let prevLucidAPI: unknown;
  let prevResizeObserver: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = { terminal: { detach: mockDetach } };
    // jsdom has no ResizeObserver — the hook's bar-rect effect
    // constructs one on mount.
    prevResizeObserver = win.ResizeObserver;
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
  });

  function renderStrip() {
    return render(
      React.createElement(TerminalTabsView, {
        tabs: TABS,
        activeTabId: 't1',
        notifications: [],
        notificationsOpen: false,
        onCreateTab: noop,
        onCloseTab: noop,
        onRenameTab: noop,
        onSelectTab: noop,
        onToggleNotifications: noop,
        onDismissNotification: noop,
        onClearAllNotifications: noop,
      }),
    );
  }

  function tabEl(id: string): HTMLElement {
    const el = document.querySelector(`[data-testid="tab-${id}"]`) as HTMLElement;
    expect(el).not.toBeNull();
    return el;
  }

  function ghostEl(): HTMLElement | null {
    return document.querySelector('[data-testid="tab-drag-ghost"]');
  }

  test('pointerdown dims the tab and reports the grab offset, with no ghost yet (a click never flashes one)', () => {
    renderStrip();
    const tab = tabEl('t1');
    // jsdom rects are zeros, so the grab offset is the pointer
    // position itself — the ghost math still holds (see below).
    fireEvent.pointerDown(tab, { clientX: 50, clientY: 10, button: 0, pointerId: 1 });
    expect(tab.className).toContain('opacity-40');
    expect(ghostEl()).toBeNull();
    expect(mockDetach.dragStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      0,
      { x: 50, y: 10 },
    );
  });

  test('the first move lifts the ghost at the grabbed spot and it follows the pointer', () => {
    renderStrip();
    const tab = tabEl('t1');
    fireEvent.pointerDown(tab, { clientX: 50, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(tab, { clientX: 120, clientY: 40, pointerId: 1 });
    const ghost = ghostEl();
    expect(ghost).not.toBeNull();
    expect(ghost?.textContent).toContain('Terminal 1');
    // Grabbed at (50,10), moved to (120,40): the ghost's
    // top-left is (70,30) — the pointer keeps its spot within it.
    expect(ghost?.style.left).toBe('70px');
    expect(ghost?.style.top).toBe('30px');
    fireEvent.pointerMove(tab, { clientX: 200, clientY: 90, pointerId: 1 });
    expect(ghostEl()?.style.left).toBe('150px');
    expect(ghostEl()?.style.top).toBe('80px');
    expect(mockDetach.dragMove).toHaveBeenCalledWith(200, 90);
  });

  test('pointerup drops the ghost and undims the tab', () => {
    renderStrip();
    const tab = tabEl('t1');
    fireEvent.pointerDown(tab, { clientX: 50, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(tab, { clientX: 120, clientY: 40, pointerId: 1 });
    expect(ghostEl()).not.toBeNull();
    fireEvent.pointerUp(tab, { clientX: 120, clientY: 40, pointerId: 1 });
    expect(ghostEl()).toBeNull();
    expect(tab.className).not.toContain('opacity-40');
    expect(mockDetach.dragEnd).toHaveBeenCalledWith(120, 40);
  });

  test('the ghost is portaled to the body, not trapped inside the bar (round 2)', () => {
    // The bar carries backdrop-blur, which makes it a containing
    // block for fixed descendants AND a stacking context — inside
    // the bar the ghost sat offset by the bar's viewport position
    // and hid under the terminal content below the strip. In the
    // body it is truly viewport-fixed, so it tracks the pointer
    // exactly. Regression: the ghost rendered but was never seen
    // live in round 1.
    renderStrip();
    const tab = tabEl('t1');
    fireEvent.pointerDown(tab, { clientX: 50, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(tab, { clientX: 120, clientY: 40, pointerId: 1 });
    const ghost = ghostEl();
    expect(ghost).not.toBeNull();
    expect(ghost?.parentElement).toBe(document.body);
    expect(ghost?.style.left).toBe('70px');
    expect(ghost?.style.top).toBe('30px');
  });

  test('the ghost unmounts when the tab leaves the strip (detach)', () => {
    // The drag state still holds the ghost, but the tab is no
    // longer in this strip — main detached it, and the real
    // window takes over following the pointer. The ghost must
    // not linger over the strip.
    const { rerender } = renderStrip();
    const tab = tabEl('t1');
    fireEvent.pointerDown(tab, { clientX: 50, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(tab, { clientX: 120, clientY: 40, pointerId: 1 });
    expect(ghostEl()).not.toBeNull();
    rerender(
      React.createElement(TerminalTabsView, {
        tabs: [TABS[1]],
        activeTabId: 't2',
        notifications: [],
        notificationsOpen: false,
        onCreateTab: noop,
        onCloseTab: noop,
        onRenameTab: noop,
        onSelectTab: noop,
        onToggleNotifications: noop,
        onDismissNotification: noop,
        onClearAllNotifications: noop,
      }),
    );
    expect(ghostEl()).toBeNull();
  });
});
