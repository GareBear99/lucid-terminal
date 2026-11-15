/**
 * Terminal tab bar — split panes tests (2026-11-14, sweep fix 2).
 *
 * The split button (Columns2, "Split terminal (⌘D)") sits beside
 * the + button in the main window only; tabs in the active tab's
 * split group carry a dim blue underline (the focused pane keeps
 * the full-strength one) so the strip shows which tabs are panes
 * of the active split.
 *
 * Same SSR pattern as tests/terminalTabs.test.tsx: no
 * @testing-library / jsdom in this repo, so the presentational
 * TerminalTabsView renders with renderToStaticMarkup and explicit
 * props. The click wiring (button → splitTab, ⌘D → splitTab, × on
 * a pane tab → closePane) is verified by the live VM check — SSR
 * markup cannot fire events.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
  { id: 'terminal-3', title: 'Terminal 3', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

const renderView = (props: {
  tabs?: typeof TABS;
  activeTabId?: string | null;
  showSplitButton?: boolean;
  showEqualizeButton?: boolean;
  onEqualizePanes?: () => void;
  splitGroupTabIds?: string[];
}) =>
  renderToStaticMarkup(
    <TerminalTabsView
      tabs={props.tabs ?? TABS}
      activeTabId={props.activeTabId ?? 'terminal-1'}
      notifications={[] as Notification[]}
      notificationsOpen={false}
      onCreateTab={noop}
      onCloseTab={noop}
      onRenameTab={noop}
      onSelectTab={noop}
      onSplitTab={noop}
      showSplitButton={props.showSplitButton}
      showEqualizeButton={props.showEqualizeButton}
      onEqualizePanes={props.onEqualizePanes ?? noop}
      splitGroupTabIds={props.splitGroupTabIds}
      onToggleNotifications={noop}
      onDismissNotification={noop}
      onClearAllNotifications={noop}
    />,
  );

describe('split button', () => {
  it('renders beside the + button in the main window', () => {
    const html = renderView({ showSplitButton: true });
    expect(html).toContain('data-testid="split-terminal"');
    expect(html).toContain('Split terminal (⌘D)');
    expect(html).toContain('aria-label="Split terminal"');
  });

  it('is absent when showSplitButton is false (detached windows)', () => {
    const html = renderView({ showSplitButton: false });
    expect(html).not.toContain('data-testid="split-terminal"');
  });

  it('is absent by default', () => {
    const html = renderView({});
    expect(html).not.toContain('data-testid="split-terminal"');
  });
});

describe('split group members in the strip', () => {
  it('marks every group member with data-split-group', () => {
    const html = renderView({
      showSplitButton: true,
      splitGroupTabIds: ['terminal-1', 'terminal-2'],
    });
    // Both members are marked; the third tab is not.
    expect(html.match(/data-split-group="true"/g)?.length).toBe(2);
  });

  it('gives a non-focused group member the dim blue underline, not the active one', () => {
    const html = renderView({
      showSplitButton: true,
      splitGroupTabIds: ['terminal-1', 'terminal-2'],
    });
    // The focused pane keeps the full-strength underline…
    expect(html).toContain('rgba(88,166,255,0.85)');
    // …and the other member gets the dim one.
    expect(html).toContain('rgba(88,166,255,0.4)');
  });

  it('marks nothing when no tab is split', () => {
    const html = renderView({ showSplitButton: true, splitGroupTabIds: [] });
    expect(html).not.toContain('data-split-group');
    expect(html).not.toContain('rgba(88,166,255,0.4)');
  });
});

describe('equalize button (Gary, 2026-11-15)', () => {
  it('renders beside the split button when shown (2+ panes)', () => {
    const html = renderView({ showSplitButton: true, showEqualizeButton: true });
    expect(html).toContain('data-testid="equalize-panes"');
    expect(html).toContain('Equalize pane sizes');
    expect(html).toContain('aria-label="Equalize pane sizes"');
    // Beside the split button, in the same strip.
    expect(html).toContain('data-testid="split-terminal"');
    expect(html.indexOf('data-testid="split-terminal"')).toBeLessThan(
      html.indexOf('data-testid="equalize-panes"'),
    );
  });

  it('is absent when showEqualizeButton is false (0–1 panes)', () => {
    const html = renderView({ showSplitButton: true, showEqualizeButton: false });
    expect(html).not.toContain('data-testid="equalize-panes"');
  });

  it('is absent by default', () => {
    const html = renderView({ showSplitButton: true });
    expect(html).not.toContain('data-testid="equalize-panes"');
  });

  it('a detached window gets its own button: split hidden, equalize shown', () => {
    // Detached windows render the same strip with the split
    // button off (showSplitButton false) — the equalize button
    // is driven by that window's own pane count, so it shows
    // there whenever that window has 2+ panes.
    const html = renderView({ showSplitButton: false, showEqualizeButton: true });
    expect(html).not.toContain('data-testid="split-terminal"');
    expect(html).toContain('data-testid="equalize-panes"');
  });
});
