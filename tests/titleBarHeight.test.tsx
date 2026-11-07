// @vitest-environment node
/**
 * Top-bar height — traffic lights vs the spin-wheel loader (Gary, 2026-11-07).
 *
 * The macOS traffic lights (red/yellow/green) are drawn by the OS at the
 * top-left of the window, pinned near the top — three 12px buttons
 * spanning roughly y 8–20px — while the status dot (the spin-wheel
 * loader: the swirl ring + charge arc around it while background work
 * runs) sits at the far left, vertically centred in the top bar. At
 * the old h-9 (36px) the dot's centre was y 18 and its 22px swirl ring
 * (dot 16px + 3px inset each side) spanned y 7–29, so the close button
 * sat directly on top of the spinner — verified on the live window
 * (screenshot: the greyed traffic light overlaps the dot's left half).
 *
 * The fix is a taller bar: at h-16 (64px) the dot's centre is y 32 and
 * the ring spans y 21–43 — just below the lights. h-16 is the smallest
 * standard step that clears them; h-12 (ring top y 13) still tucks
 * under the lights. The tab strip below is untouched (still h-9).
 *
 * Same harness as the tab-glass tests: renderToStaticMarkup, no jsdom
 * (TitleBar's only window.lucidAPI use is inside useEffect, which
 * static rendering never runs).
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TitleBar from '../src/components/Layout/TitleBar';

describe('TitleBar — tall enough to clear the traffic lights', () => {
  it('the top bar is h-16, not h-9', () => {
    const html = renderToStaticMarkup(React.createElement(TitleBar));
    // The root div is the outermost element and carries select-none.
    const m = html.match(/<div[^>]*select-none[^>]*>/);
    expect(m).not.toBeNull();
    const tag = m ? m[0] : '';
    expect(tag).toContain('h-16');
    expect(tag).not.toContain('h-9');
    // Vertically centred content: the dot drops with the taller bar.
    expect(tag).toContain('items-center');
  });

  it('the spinner dot is still 16px with its swirl ring (the geometry the height clears)', () => {
    const html = renderToStaticMarkup(React.createElement(TitleBar));
    // The dot: 16px, the ring's anchor.
    expect(html).toContain('data-glow-anchor="titlebar-dot"');
    expect(html).toContain('w-4 h-4');
  });

  it('the bar still holds the title and the window controls', () => {
    const html = renderToStaticMarkup(React.createElement(TitleBar));
    expect(html).toContain('Lucid Terminal');
    // The window controls are Tooltip-wrapped buttons (no title
    // attribute in the markup) — the minus and X icons mark them.
    expect(html).toContain('lucide-minus');
    expect(html).toContain('lucide-x');
  });
});
