// @vitest-environment node
/**
 * Terminal tab bar — black portal splashscreen glass.
 *
 * Gary (2026-11-07): the terminal tabs should carry the black portal
 * splashscreen's glass so the terminal feels like Warp. The splash is
 * pure black (#000) with a cool-blue accent line (rgba(88,166,255,0.85),
 * the wordmark line in SplashScreen.css); the prompt already got the
 * squared glass backwall (tests/terminalPromptGlass.test.tsx) and the
 * tabs now get the same treatment, in black.
 *
 * The glass, per element:
 *   - Bar: black translucent + backdrop blur, squared, keeps its bottom
 *     border (the segregation edge between the strip and the terminal
 *     content below, mirroring the prompt's divider).
 *   - Active tab: the open portal — a deeper black with the splash-blue
 *     line along its bottom edge (inset shadow, no layout shift).
 *   - Inactive tabs: glass, not solid — hover is a white sheen, never a
 *     solid tertiary fill.
 *   - New-tab (+) button, bell, close (X): the same glass sheen on hover.
 *   - Notifications panel: the same portal glass, squared.
 *
 * The bar renders in both LuciferAI-on and flat states — App renders the
 * same <TerminalTabs/> either way — so this glass is identical in both;
 * there is no LuciferAI branch to test. Behaviour (labels, active state,
 * close buttons, new-tab button, bell, divider) is covered in
 * tests/terminalTabs.test.ts and tests/terminalTabsRename.test.tsx and is
 * unchanged here.
 *
 * Same harness as tests/terminalTabs.test.ts: no @testing-library /
 * jsdom in this repo, so renderToStaticMarkup on the presentational
 * TerminalTabsView with explicit props.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import type { Notification } from '../src/components/Terminal/ErrorNotification';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const noop = () => undefined;

const renderView = (props: {
  tabs?: typeof TABS;
  notifications?: Notification[];
  notificationsOpen?: boolean;
}) =>
  renderToStaticMarkup(
    React.createElement(TerminalTabsView, {
      tabs: props.tabs ?? TABS,
      activeTabId: 't1',
      notifications: props.notifications ?? [],
      notificationsOpen: props.notificationsOpen ?? false,
      onCreateTab: noop,
      onCloseTab: noop,
      onRenameTab: noop,
      onSelectTab: noop,
      onToggleNotifications: noop,
      onDismissNotification: noop,
      onClearAllNotifications: noop,
    }),
  );

/** The bar's opening <div> (the element carrying data-testid). */
function barTag(html: string): string {
  const m = html.match(/<div[^>]*data-testid="terminal-tabs-bar"[^>]*>/);
  expect(m).not.toBeNull();
  return m ? m[0] : '';
}

/** The tab <div> (class="group flex items-center gap-2 ...") holding a title. */
function tabDiv(html: string, title: string): string {
  const titleIdx = html.indexOf(`>${title}<`);
  expect(titleIdx).toBeGreaterThan(-1);
  const openIdx = html.lastIndexOf('<div', titleIdx);
  const closeIdx = html.indexOf('</div>', titleIdx);
  expect(openIdx).toBeGreaterThan(-1);
  expect(closeIdx).toBeGreaterThan(openIdx);
  return html.slice(openIdx, closeIdx + 6);
}

/** The notifications panel div, when open. */
function panelTag(html: string): string | null {
  const m = html.match(/<div[^>]*top-9 z-50[^>]*>/);
  return m ? m[0] : null;
}

describe('TerminalTabs — black portal splashscreen glass', () => {
  it('the bar is black frosted glass, squared, with its bottom border', () => {
    const bar = barTag(renderView({}));
    // Glass: black translucent + backdrop blur.
    expect(bar).toContain('bg-black/50');
    expect(bar).toContain('backdrop-blur-md');
    // Squared: no rounding anywhere on the bar.
    expect(bar).toContain('rounded-none');
    expect(bar).not.toContain('rounded-lg');
    expect(bar).not.toContain('rounded-md');
    // Segregation edge: the bottom border stays, separating the strip
    // from the terminal content below.
    expect(bar).toContain('border-b');
    expect(bar).toContain('border-[var(--border)]');
    // No longer the solid theme-secondary slab.
    expect(bar).not.toContain('bg-[var(--bg-secondary)]');
  });

  it('the active tab is the open portal: deeper black + splash-blue line', () => {
    const tab = tabDiv(renderView({}), 'Terminal 1');
    expect(tab).toContain('tab-active');
    expect(tab).toContain('bg-black/60');
    // The splash wordmark-line blue along the bottom edge.
    expect(tab).toContain('shadow-[inset_0_-2px_0_0_rgba(88,166,255,0.85)]');
    // No longer the solid theme-primary fill.
    expect(tab).not.toContain('bg-[var(--bg-primary)]');
  });

  it('an inactive tab is glass, not solid: white sheen on hover', () => {
    const tab = tabDiv(renderView({}), 'Terminal 2');
    expect(tab).not.toContain('tab-active');
    expect(tab).toContain('hover:bg-white/5');
    // No solid tertiary hover anywhere on the tab.
    expect(tab).not.toContain('hover:bg-[var(--bg-tertiary)]');
    expect(tab).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('the new-tab (+) button and the bell hover with the same glass sheen', () => {
    const html = renderView({});
    const plusIdx = html.indexOf('title="New Terminal"');
    expect(plusIdx).toBeGreaterThan(-1);
    const plusOpen = html.lastIndexOf('<button', plusIdx);
    const plusTag = html.slice(plusOpen, html.indexOf('>', plusIdx) + 1);
    expect(plusTag).toContain('hover:bg-white/5');
    expect(plusTag).not.toContain('hover:bg-[var(--bg-tertiary)]');

    const bellIdx = html.indexOf('title="Notifications"');
    expect(bellIdx).toBeGreaterThan(-1);
    const bellOpen = html.lastIndexOf('<button', bellIdx);
    const bellTag = html.slice(bellOpen, html.indexOf('>', bellIdx) + 1);
    expect(bellTag).toContain('hover:bg-white/5');
    expect(bellTag).not.toContain('hover:bg-[var(--bg-tertiary)]');
  });

  it('the tab close (X) button hovers with a glass sheen, squared', () => {
    const html = renderView({});
    // The close button sits inside the first tab div, before its title span closes.
    const tab = tabDiv(html, 'Terminal 1');
    const btnIdx = tab.indexOf('<button');
    expect(btnIdx).toBeGreaterThan(-1);
    const btnTag = tab.slice(btnIdx, tab.indexOf('>', btnIdx) + 1);
    expect(btnTag).toContain('hover:bg-white/10');
    expect(btnTag).not.toContain('hover:bg-[var(--bg-tertiary)]');
    expect(btnTag).not.toContain('rounded');
  });

  it('the notifications panel is the same portal glass, squared', () => {
    const html = renderView({ notificationsOpen: true });
    const panel = panelTag(html);
    expect(panel).not.toBeNull();
    expect(panel).toContain('bg-black/70');
    expect(panel).toContain('backdrop-blur-md');
    expect(panel).toContain('rounded-none');
    expect(panel).not.toContain('rounded-b-lg');
    expect(panel).not.toContain('bg-[var(--bg-secondary)]');
  });

  it('the bell badge is glass, not a solid pill (Gary, 2026-11-07 ~09:26 PST)', () => {
    // Glass match: the unread-count pill sits ON the glass bar, so it
    // is a translucent tint + blur, never a solid pill.
    const badgeTokens = (html: string): string[] => {
      const badgeIdx = html.indexOf('min-w-4');
      expect(badgeIdx).toBeGreaterThan(-1);
      const openIdx = html.lastIndexOf('<span', badgeIdx);
      const tag = html.slice(openIdx, html.indexOf('>', badgeIdx) + 1);
      return tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    };
    // Unread error: translucent red + blur.
    const errorTokens = badgeTokens(
      renderView({ notifications: [{ id: 'n1', type: 'error', message: 'boom', read: false }] }),
    );
    expect(errorTokens).toContain('bg-red-500/80');
    expect(errorTokens).toContain('backdrop-blur-sm');
    expect(errorTokens).not.toContain('bg-red-500');
    // Unread non-error: translucent tertiary + blur.
    const infoTokens = badgeTokens(
      renderView({ notifications: [{ id: 'n2', type: 'info', message: 'note', read: false }] }),
    );
    expect(infoTokens).toContain('bg-[var(--bg-tertiary)]/70');
    expect(infoTokens).toContain('backdrop-blur-sm');
    expect(infoTokens).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('the bar still renders the tabs and the new-tab button', () => {
    const html = renderView({});
    expect(html).toContain('data-testid="terminal-tabs-bar"');
    expect(html).toContain('Terminal 1');
    expect(html).toContain('Terminal 2');
    expect(html).toContain('title="New Terminal"');
    expect(html).toContain('title="Notifications"');
  });
});
