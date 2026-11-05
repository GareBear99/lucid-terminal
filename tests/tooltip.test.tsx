// @vitest-environment jsdom
/**
 * Lucid tooltip tests.
 *
 * Expected behaviour (Gary, 2026-11-05): one shared tooltip for the
 * whole app — sleek, clean, Lucid's look. Appears after a short hover
 * delay, flips when there is no room, disappears on leave/blur/click/
 * Escape, shows on keyboard focus too, role="tooltip" + aria-describedby,
 * and never doubles up with the browser's native title tooltip.
 *
 * These are DOM/state/timing tests — positioning is asserted through the
 * pure resolveTooltipPosition() (no browser geometry in jsdom), not
 * through pixel positions of the rendered tip.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  Tooltip,
  resolveTooltipPosition,
  TOOLTIP_SHOW_DELAY_MS,
  type TooltipRect,
  type TooltipSize,
  type TooltipViewport,
} from '../src/components/Tooltip/Tooltip';

const VIEWPORT: TooltipViewport = { width: 1000, height: 800 };
const TIP: TooltipSize = { width: 120, height: 30 };

function rect(top: number, left: number, width = 40, height = 32): TooltipRect {
  return { top, left, right: left + width, bottom: top + height, width, height };
}

describe('resolveTooltipPosition', () => {
  test('top: centres above the trigger when there is room', () => {
    const pos = resolveTooltipPosition(rect(400, 400), TIP, VIEWPORT, 'top');
    expect(pos.placement).toBe('top');
    expect(pos.top).toBe(400 - 8 - 30);
    expect(pos.left).toBe(400 + 20 - 60);
  });

  test('top flips to bottom when the trigger is near the top edge', () => {
    const pos = resolveTooltipPosition(rect(10, 400), TIP, VIEWPORT, 'top');
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(10 + 32 + 8);
  });

  test('bottom flips to top when the trigger is near the bottom edge', () => {
    const pos = resolveTooltipPosition(rect(760, 400), TIP, VIEWPORT, 'bottom');
    expect(pos.placement).toBe('top');
  });

  test('left flips to right when the trigger is near the left edge', () => {
    const pos = resolveTooltipPosition(rect(400, 10), TIP, VIEWPORT, 'left');
    expect(pos.placement).toBe('right');
  });

  test('right flips to left when the trigger is near the right edge', () => {
    const pos = resolveTooltipPosition(rect(400, 960), TIP, VIEWPORT, 'right');
    expect(pos.placement).toBe('left');
  });

  test('clamps inside the viewport when centred would overflow', () => {
    const pos = resolveTooltipPosition(rect(400, 990), TIP, VIEWPORT, 'top');
    expect(pos.left).toBeLessThanOrEqual(VIEWPORT.width - TIP.width - 4);
    expect(pos.left).toBeGreaterThanOrEqual(4);
    const pos2 = resolveTooltipPosition(rect(400, 0), TIP, VIEWPORT, 'top');
    expect(pos2.left).toBeGreaterThanOrEqual(4);
  });

  test('falls back to the preferred side when neither side fits', () => {
    // A tip taller than the viewport fits nowhere — placement stays preferred.
    const huge: TooltipSize = { width: 120, height: 2000 };
    const pos = resolveTooltipPosition(rect(400, 400), huge, VIEWPORT, 'top');
    expect(pos.placement).toBe('top');
  });
});

describe('Tooltip component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // No manual document.body clearing here: the tooltip renders into
    // a portal on document.body, and clearing the body before
    // testing-library's auto-cleanup unmounts React makes React try to
    // remove an already-gone portal node (NotFoundError).
  });

  function renderTip(props: { content?: string; shortcut?: string; delay?: number } = {}) {
    return render(
      <Tooltip content={props.content ?? 'Open the synth view'} shortcut={props.shortcut} delay={props.delay}>
        <button>Synth</button>
      </Tooltip>,
    );
  }

  test('does not show immediately on hover — waits for the delay', () => {
    renderTip();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Synth' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS - 1);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Open the synth view');
  });

  test('hides on mouse leave', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('hides on click and on Escape', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('shows on keyboard focus too', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.focus(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Open the synth view');
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('trigger gets aria-describedby while the tip is visible', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    const tip = screen.getByRole('tooltip');
    expect(button.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.id).toBeTruthy();
  });

  test('renders the shortcut in the accent kbd', () => {
    renderTip({ shortcut: 'Ctrl+T' });
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    const tip = screen.getByRole('tooltip');
    expect(tip.querySelector('kbd')?.textContent).toBe('Ctrl+T');
  });

  test('strips the native title so the browser tooltip never doubles up', () => {
    render(
      <Tooltip content="Open the synth view">
        <button title="Synth">Synth</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Synth' }).getAttribute('title')).toBeNull();
  });

  test('falls back to the child title as the tip text when no content is given', () => {
    render(
      <Tooltip>
        <button title="Open the synth view">Synth</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Synth' });
    expect(button.getAttribute('title')).toBeNull();
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Open the synth view');
  });

  test('renders the child untouched when there is nothing to say', () => {
    const { container } = render(
      <Tooltip>
        <button>Plain</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toBeTruthy();
    // No tooltip wrapper span when there is no content and no title.
    expect(container.querySelector('.lucid-tooltip-trigger')).toBeNull();
  });

  test('leaving before the delay cancels the show', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Synth' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS / 2);
    });
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
