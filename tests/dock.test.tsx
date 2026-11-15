// @vitest-environment jsdom
/**
 * Dock component (Atom steal #12) — the edge toggle, the
 * open/close mask, the resize handle, and the empty auto-hide.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { Dock } from '../src/components/Layout/Dock';
import { useDockStore } from '../src/stores/dockStore';

describe('Dock', () => {
  beforeEach(() => {
    useDockStore.getState().resetForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hidden: renders only the edge toggle, no children', () => {
    const { getByTestId, queryByText } = render(
      <Dock edge="right" label="AI Panel">
        <div>panel content</div>
      </Dock>,
    );
    expect(getByTestId('dock-toggle-right')).toBeTruthy();
    expect(queryByText('panel content')).toBeNull();
  });

  it('the toggle shows the dock', () => {
    const { getByTestId, getByText } = render(
      <Dock edge="right" label="AI Panel">
        <div>panel content</div>
      </Dock>,
    );
    act(() => {
      fireEvent.click(getByTestId('dock-toggle-right'));
    });
    expect(useDockStore.getState().docks.right.visible).toBe(true);
    expect(getByText('panel content')).toBeTruthy();
  });

  it('visible: renders the children and the resize handle, no toggle', () => {
    useDockStore.getState().showDock('right');
    const { getByTestId, queryByTestId, getByText } = render(
      <Dock edge="right" label="AI Panel">
        <div>panel content</div>
      </Dock>,
    );
    expect(getByText('panel content')).toBeTruthy();
    expect(getByTestId('dock-resize-right')).toBeTruthy();
    expect(queryByTestId('dock-toggle-right')).toBeNull();
  });

  it('hiding unmounts the children after the close animation', () => {
    useDockStore.getState().showDock('right');
    const { getByText, queryByText } = render(
      <Dock edge="right" label="AI Panel">
        <div>panel content</div>
      </Dock>,
    );
    expect(getByText('panel content')).toBeTruthy();
    act(() => {
      useDockStore.getState().hideDock('right');
    });
    // Still mounted mid-animation (the mask is shrinking).
    expect(getByText('panel content')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(queryByText('panel content')).toBeNull();
  });

  it('the resize handle drags the dock size, clamped to a 100px floor', () => {
    useDockStore.getState().showDock('right');
    const { getByTestId } = render(
      <div style={{ width: 1200 }}>
        <Dock edge="right" label="AI Panel">
          <div>panel content</div>
        </Dock>
      </div>,
    );
    const handle = getByTestId('dock-resize-right');
    // Drag left by 100px: a right dock grows by the negative delta.
    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 900 });
    fireEvent.mouseUp(document);
    expect(useDockStore.getState().docks.right.size).toBe(600);
    // Drag far right: the size clamps at the 100px floor.
    fireEvent.mouseDown(handle, { clientX: 900 });
    fireEvent.mouseMove(document, { clientX: 1900 });
    fireEvent.mouseUp(document);
    expect(useDockStore.getState().docks.right.size).toBe(100);
  });

  it('no children: only the edge toggle, never an empty dock', () => {
    const { getByTestId, queryByTestId } = render(
      <Dock edge="bottom" label="Nothing">
        {null}
      </Dock>,
    );
    expect(getByTestId('dock-toggle-bottom')).toBeTruthy();
    expect(queryByTestId('dock-resize-bottom')).toBeNull();
  });

  it('the bottom dock renders a horizontal resize handle', () => {
    useDockStore.getState().showDock('bottom');
    const { getByTestId } = render(
      <Dock edge="bottom" label="Output">
        <div>bottom content</div>
      </Dock>,
    );
    const handle = getByTestId('dock-resize-bottom');
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('hidden: the bottom toggle strip carries the theme background', () => {
    const { getByTestId } = render(
      <Dock edge="bottom" label="Git">
        <div>panel content</div>
      </Dock>,
    );
    // The collapsed strip + the status bar read as ONE
    // theme-coloured bar (global presentation fix): the strip
    // was transparent over the app root's black. The fill is
    // on the toggle strip itself (the button's parent), not
    // the dock's outer container.
    const strip = getByTestId('dock-toggle-bottom').parentElement;
    expect(strip?.className).toContain('bg-[var(--bg-secondary)]');
  });

  it('hidden: the side dock strips keep no fill (bottom only, by design)', () => {
    const { getByTestId } = render(
      <Dock edge="right" label="AI Panel">
        <div>panel content</div>
      </Dock>,
    );
    // Side strips sit over the view's own background, not
    // over the root black — only the bottom strip needs the
    // theme fill.
    const strip = getByTestId('dock-toggle-right').parentElement;
    expect(strip?.className ?? '').not.toContain('bg-[var(--bg-secondary)]');
  });

  it('hidden with no children: the toggle strip carries the theme background too', () => {
    const { getByTestId } = render(
      <Dock edge="bottom" label="Nothing">
        {null}
      </Dock>,
    );
    expect(getByTestId('dock-bottom').className).toContain('bg-[var(--bg-secondary)]');
    expect(getByTestId('dock-toggle-bottom')).toBeTruthy();
  });
});
