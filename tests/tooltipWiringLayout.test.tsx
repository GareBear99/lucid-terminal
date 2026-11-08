// @vitest-environment jsdom
/**
 * Tooltip wiring tests — layout surfaces (StatusBar).
 *
 * Proves the shared Tooltip is actually wired into the layout: hovering
 * a StatusBar control shows a role="tooltip" with the expected text,
 * after the standard 450ms delay, with no native title doubling up.
 * StatusBar is the easiest of the layout surfaces to render in jsdom —
 * its stores have safe defaults and its network probe guards a missing
 * window.lucidAPI. Sidebar/TitleBar need file-store / window-API setup
 * and are covered by the same Tooltip component tests instead.
 *
 * Run with: npx vitest run tests/tooltipWiringLayout.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import StatusBar from '../src/components/Layout/StatusBar';
import { TOOLTIP_SHOW_DELAY_MS } from '../src/components/Tooltip/Tooltip';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('StatusBar tooltip wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The Help button is a LuciferAI surface: it only renders
    // while LuciferAI is on, and LuciferAI defaults OFF now
    // (Gary, 2026-11-07).
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, luciferAiEnabled: true },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderBar(props: { showAI?: boolean } = {}) {
    return render(
      <StatusBar showAI={props.showAI ?? false} onToggleAI={() => {}} onOpenHelp={() => {}} />,
    );
  }

  function hoverAndShow(el: Element) {
    fireEvent.mouseEnter(el);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
  }

  test('AI toggle shows "Show AI Panel" on hover', () => {
    renderBar({ showAI: false });
    const button = screen.getByRole('button', { name: /AI/ });
    expect(button.getAttribute('title')).toBeNull();
    hoverAndShow(button);
    expect(screen.getByRole('tooltip').textContent).toContain('Show AI Panel');
  });

  test('AI toggle shows "Hide AI Panel" when the panel is open', () => {
    renderBar({ showAI: true });
    hoverAndShow(screen.getByRole('button', { name: /AI/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('Hide AI Panel');
  });

  test('Help button shows "Command Reference" with the Cmd+/ shortcut', () => {
    const { container } = renderBar();
    // The Help button is icon-only (no accessible name); it is the
    // first button in the StatusBar, ahead of the AI toggle.
    const helpButton = container.querySelectorAll('button')[0];
    expect(helpButton.getAttribute('title')).toBeNull();
    hoverAndShow(helpButton);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('Command Reference');
    expect(tip.querySelector('kbd')?.textContent).toBe('Cmd+/');
  });

  test('network indicator shows its status on hover', () => {
    renderBar();
    // No window.lucidAPI in jsdom, so the probe never runs and the
    // indicator stays in its unchecked state.
    const indicator = screen.getByText('…');
    hoverAndShow(indicator);
    expect(screen.getByRole('tooltip').textContent).toContain('Checking network…');
  });
});
