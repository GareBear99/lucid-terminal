// @vitest-environment jsdom
/**
 * Blood drop tab in the terminal tab strip (Gary, 2026-11-07).
 *
 * The corrected design (Gary, 2026-11-07 ~07:38 PST): the blood drop IS a
 * visible terminal tab IN the tab strip. The earlier
 * empty-state-button-that-opens-the-Help-modal design was wrong — the
 * drop is a tab, not a separate door. The individual LuciferAI tabs
 * hide behind this one, ordered by causal ritual placement (ticks),
 * not by time (see tests/aiSessionCausalOrder).
 *
 * The tab:
 *   - renders FIRST in the strip (pinned to the top spot, the same lock
 *     as the toolbar drop) while LuciferAI is enabled, and is GONE when
 *     the plugin is disabled (not hidden — not rendered at all);
 *   - is JUST the blood drop icon — no visible "LuciferAI" label
 *     (Gary, 2026-11-07 ~09:16 PST: "I told you no luciferAI words
 *     in the tab"). Its title/aria-label stay "LuciferAI prompt
 *     commands" (Gary, 2026-11-07 ~09:18 PST: "luciferAI prompt
 *     commands are fine");
 *   - is NOT a terminal tab: no PTY, no close (X) button, no rename
 *     on double-click — picking it shows the blood drop panel, picking
 *     a terminal tab shows that terminal.
 *
 * Same harness as tests/helpModal.test.tsx: @testing-library/react +
 * jsdom, so clicks and double-clicks can be fired.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

const renderView = (props: {
  showBloodDrop?: boolean;
  bloodDropActive?: boolean;
  onBloodDropActiveChange?: (active: boolean) => void;
  activeTabId?: string | null;
}) =>
  render(
    <TerminalTabsView
      tabs={TABS}
      activeTabId={props.activeTabId ?? 't1'}
      notifications={[]}
      notificationsOpen={false}
      onCreateTab={noop}
      onCloseTab={noop}
      onRenameTab={noop}
      onSelectTab={noop}
      showBloodDrop={props.showBloodDrop}
      bloodDropActive={props.bloodDropActive}
      onBloodDropActiveChange={props.onBloodDropActiveChange}
      onToggleNotifications={noop}
      onDismissNotification={noop}
      onClearAllNotifications={noop}
    />,
  );

describe('Blood drop tab in the strip', () => {
  it('renders in the strip, FIRST, while LuciferAI is enabled', () => {
    const { container } = renderView({ showBloodDrop: true });
    const drop = screen.getByTestId('blood-drop-tab');
    expect(drop).toBeTruthy();
    // No visible "LuciferAI" text on the tab (Gary, 2026-11-07
    // ~09:16 PST) — just the blood drop icon.
    expect(drop.textContent).not.toContain('LuciferAI');
    // The blood drop icon itself: a droplet svg in the tab.
    expect(drop.querySelector('svg')).not.toBeNull();
    // Pinned first: ahead of Terminal 1 in the strip's DOM order.
    const bar = container.querySelector('[data-testid="terminal-tabs-bar"]');
    expect(bar).not.toBeNull();
    const html = bar ? bar.innerHTML : '';
    expect(html.indexOf('blood-drop-tab')).toBeGreaterThan(-1);
    expect(html.indexOf('blood-drop-tab')).toBeLessThan(html.indexOf('Terminal 1'));
  });

  it('shows JUST the blood drop icon — no visible label, title/aria-label stay (Gary, 2026-11-07 ~09:16 + ~09:18 PST)', () => {
    renderView({ showBloodDrop: true });
    const drop = screen.getByTestId('blood-drop-tab');
    // No visible text on the tab at all.
    expect(drop.textContent).not.toContain('LuciferAI');
    expect(drop.querySelector('span')).toBeNull();
    expect(drop.querySelector('svg')).not.toBeNull();
    // But the title/aria-label "LuciferAI prompt commands" STAY —
    // Gary, 2026-11-07 ~09:18 PST: "luciferAI prompt commands are fine."
    expect(drop.getAttribute('title')).toBe('LuciferAI prompt commands');
    expect(drop.getAttribute('aria-label')).toBe('LuciferAI prompt commands');
  });

  it('is gone when LuciferAI is disabled — not rendered at all', () => {
    renderView({ showBloodDrop: false });
    expect(screen.queryByTestId('blood-drop-tab')).toBeNull();
    // The real terminal tabs are still there.
    expect(screen.getByText('Terminal 1')).toBeTruthy();
    expect(screen.getByText('Terminal 2')).toBeTruthy();
  });

  it('clicking it selects the blood drop tab', () => {
    const onBloodDropActiveChange = vi.fn();
    renderView({ showBloodDrop: true, onBloodDropActiveChange });
    fireEvent.click(screen.getByTestId('blood-drop-tab'));
    expect(onBloodDropActiveChange).toHaveBeenCalledTimes(1);
    expect(onBloodDropActiveChange).toHaveBeenCalledWith(true);
  });

  it('active: the open portal — deeper black + splash-blue line, like an active terminal tab', () => {
    renderView({ showBloodDrop: true, bloodDropActive: true, activeTabId: null });
    const drop = screen.getByTestId('blood-drop-tab');
    expect(drop.className).toContain('tab-active');
    expect(drop.className).toContain('bg-black/60');
    expect(drop.className).toContain('shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)]');
  });

  it('inactive: glass, not solid — white sheen on hover', () => {
    renderView({ showBloodDrop: true, bloodDropActive: false });
    const drop = screen.getByTestId('blood-drop-tab');
    expect(drop.className).not.toContain('tab-active');
    expect(drop.className).toContain('hover:bg-white/5');
    expect(drop.className).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('has NO close button — it is the plugin tab, not a terminal tab', () => {
    renderView({ showBloodDrop: true });
    const drop = screen.getByTestId('blood-drop-tab');
    expect(drop.querySelector('button')).toBeNull();
  });

  it('does NOT rename on double-click — it is not a terminal tab', () => {
    renderView({ showBloodDrop: true });
    fireEvent.doubleClick(screen.getByTestId('blood-drop-tab'));
    // A terminal tab's double-click swaps its label for a Rename input;
    // the drop tab shows no input at all.
    expect(screen.queryByLabelText(/Rename/)).toBeNull();
    expect(screen.getByTestId('blood-drop-tab').textContent).not.toContain('LuciferAI');
  });
});
