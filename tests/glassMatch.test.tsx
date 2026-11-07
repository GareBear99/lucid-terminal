// @vitest-environment jsdom
/**
 * Glass match — modal cards and dropdowns (Gary, 2026-11-07 ~09:26 PST):
 * "Ok and anything on the glass needs to glass match now."
 *
 * Every UI element sitting ON a glass surface must match the glass —
 * frosted translucency + backdrop blur, so it looks like part of the
 * glass, not an opaque bit stuck on it. The modal overlays are glass
 * (bg-black/50-70 + backdrop-blur-sm), so the cards sitting on them
 * are glass too: translucent fills + blur, never solid slabs.
 * Readability is preserved by the opacity floor: outer cards /80,
 * inner bars /60-70, small chips /60 — text stays on a tinted fill,
 * never on raw backdrop.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HelpModal } from '../src/components/Help/HelpModal';
import { HelpPanel } from '../src/components/Help/HelpPanel';
import { PlanningPanel } from '../src/components/Planning/PlanningPanel';
import { DaemonLogViewer } from '../src/components/Daemon/DaemonLogViewer';
import { AccountButton } from '../src/components/Account/AccountButton';

/** All class tokens in static markup. */
function tokens(html: string): string[] {
  const found = html.match(/class="([^"]*)"/g) ?? [];
  return found.flatMap((c) => c.slice(7, -1).split(/\s+/));
}

const noop = () => undefined;

describe('glass match — modal cards are glass, not solid slabs', () => {
  it('Help modal: card, footer, command cards and inputs are translucent + blurred', () => {
    const html = renderToStaticMarkup(<HelpModal isOpen onClose={noop} />);
    const t = tokens(html);
    // Outer card: translucent + strong blur.
    expect(t).toContain('bg-[var(--bg-secondary)]/80');
    expect(t).toContain('backdrop-blur-xl');
    // Footer and command cards: lighter tints + blur.
    expect(t).toContain('bg-[var(--bg-primary)]/70');
    expect(t).toContain('bg-[var(--bg-primary)]/60');
    expect(t).toContain('backdrop-blur-md');
    // Search input, code blocks, pills: translucent + blur.
    expect(t).toContain('bg-[var(--bg-tertiary)]/60');
    expect(t).toContain('backdrop-blur-sm');
    // No solid slab left anywhere in the modal.
    expect(t).not.toContain('bg-[var(--bg-secondary)]');
    expect(t).not.toContain('bg-[var(--bg-primary)]');
    expect(t).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('Help panel: card and header are translucent + blurred', () => {
    const html = renderToStaticMarkup(<HelpPanel onClose={noop} />);
    const t = tokens(html);
    expect(t).toContain('bg-[var(--bg-secondary)]/80');
    expect(t).toContain('backdrop-blur-xl');
    expect(t).toContain('bg-[var(--bg-tertiary)]/60');
    expect(t).toContain('backdrop-blur-md');
    expect(t).not.toContain('bg-[var(--bg-secondary)]');
    expect(t).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('Planning panel: card and header are translucent + blurred', () => {
    const html = renderToStaticMarkup(<PlanningPanel onClose={noop} />);
    const t = tokens(html);
    expect(t).toContain('bg-[var(--bg-secondary)]/80');
    expect(t).toContain('backdrop-blur-xl');
    expect(t).toContain('bg-[var(--bg-tertiary)]/60');
    expect(t).toContain('backdrop-blur-md');
    expect(t).not.toContain('bg-[var(--bg-secondary)]');
    expect(t).not.toContain('bg-[var(--bg-tertiary)]');
  });

  it('Daemon log viewer: card, header and filter bar are translucent + blurred', () => {
    const html = renderToStaticMarkup(<DaemonLogViewer onClose={noop} />);
    const t = tokens(html);
    expect(t).toContain('bg-[var(--bg-primary)]/80');
    expect(t).toContain('backdrop-blur-xl');
    expect(t).toContain('bg-[var(--bg-secondary)]/60');
    expect(t).toContain('bg-[var(--bg-tertiary)]/60');
    expect(t).toContain('backdrop-blur-md');
    expect(t).not.toContain('bg-[var(--bg-primary)]');
    expect(t).not.toContain('bg-[var(--bg-secondary)]');
    expect(t).not.toContain('bg-[var(--bg-tertiary)]');
  });
});

describe('glass match — account dropdown menu is glass', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      lucid: {
        getUserId: vi.fn(async () => ({
          success: true,
          userId: 'test-user-id-1234',
          isPermanent: false,
        })),
      },
    };
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  it('the menu is translucent + blurred, never the near-opaque slab', async () => {
    render(<AccountButton />);
    // The button appears once the user id loads; its accessible name
    // is the displayed id text, not "Account" (the tooltip holds that).
    const button = await waitFor(() => {
      const el = screen.getByText('test-user-id...');
      const btn = el.closest('button');
      expect(btn).not.toBeNull();
      return btn as HTMLElement;
    });
    fireEvent.click(button);
    const menu = document.querySelector('.absolute.top-full') as HTMLElement;
    expect(menu).not.toBeNull();
    const t = menu.className.split(/\s+/);
    expect(t).toContain('bg-[var(--bg-tertiary)]/80');
    expect(t).toContain('backdrop-blur-xl');
    expect(t).not.toContain('bg-[var(--bg-tertiary)]/95');
  });
});
