// @vitest-environment jsdom
/**
 * Forge full-page scroll tests (Gary, 2026-11-07 ~05:37 PST).
 *
 * "forge should be full page scrollable not bunched like that".
 * Root cause: ForgeView's root was `flex h-full flex-col
 * overflow-hidden` — a fixed viewport-height column that never
 * scrolled — and the three middle columns each scrolled on their
 * own inside a squeezed `flex-1 min-h-0` row. The page was bunched
 * into the viewport instead of flowing as one page.
 *
 * The fix: ForgeView's root is a plain flow container; the page
 * scrolls as one page in its parent — the App main panel (which
 * wraps the Forge view in a scroll container) or the Settings
 * content area (which already scrolls). The three columns and the
 * Dual Unison / Tail Generator panels flow with the page instead
 * of scrolling on their own. The only inner scroll left is the
 * bounded run log (<pre max-h-64>) inside PipelinePanel, which is
 * a log, not page structure.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR), like the Permissions-tab and
 * Settings-Forge-tab tests.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForgeView } from '../src/components/Forge/ForgeView';
import { DualUnisonPanel } from '../src/components/Forge/DualUnisonPanel';
import { TailGeneratorPanel } from '../src/components/Forge/TailGeneratorPanel';
import SettingsPanel from '../src/components/Settings/SettingsPanel';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Walk up from `el` to the first ancestor whose class contains `token`. */
function closestAncestorWithClass(
  el: Element | null,
  token: string,
): Element | null {
  let node: Element | null = el;
  while (node) {
    const cls = node.className;
    if (typeof cls === 'string' && cls.includes(token)) return node;
    node = node.parentElement;
  }
  return null;
}

/** True when any ancestor of `el` carries `overflow-y-auto`. */
function hasScrollAncestor(el: Element | null): boolean {
  return closestAncestorWithClass(el, 'overflow-y-auto') !== null;
}

describe('Forge full-page scroll (Gary, 2026-11-07)', () => {
  it('Settings Forge tab renders INSIDE the scrollable Settings content area', () => {
    // The Settings content div (`flex-1 overflow-y-auto p-6`) is
    // the page scroll for the Forge tab there — the Forge must sit
    // inside it, not clip itself to the visible height.
    const html = renderToStaticMarkup(
      React.createElement(SettingsPanel, {
        onClose: () => undefined,
        initialTab: 'forge',
      }),
    );
    const doc = parse(html);
    const heading = Array.from(doc.querySelectorAll('h1')).find(
      (h) => h.textContent === 'Forge',
    );
    expect(heading).toBeTruthy();
    expect(hasScrollAncestor(heading ?? null)).toBe(true);
  });

  it('ForgeView root is a flow page, not a clipped fixed-height column', () => {
    // Old root: `flex h-full flex-col overflow-hidden` — fixed to
    // the viewport height, never scrolling, squeezing everything
    // into it. The root must carry neither `overflow-hidden` nor
    // `h-full`: it flows, and its parent provides the page scroll.
    const html = renderToStaticMarkup(React.createElement(ForgeView));
    const doc = parse(html);
    const root = doc.body.firstElementChild;
    expect(root).toBeTruthy();
    const cls = root!.className;
    expect(typeof cls === 'string' ? cls : '').not.toContain(
      'overflow-hidden',
    );
    expect(typeof cls === 'string' ? cls : '').not.toContain('h-full');
  });

  it('the three Forge columns flow with the page instead of scrolling on their own', () => {
    // Old middle row was `flex min-h-0 flex-1` with each column
    // `overflow-y-auto` — three little scrollboxes inside a
    // squeezed row. Each column root must have no own vertical
    // scroll; the page scroll carries them.
    const html = renderToStaticMarkup(React.createElement(ForgeView));
    const doc = parse(html);
    const findText = (needle: string) => {
      // querySelectorAll returns document order (parents before
      // children), so the LAST element whose text contains the
      // needle is the deepest one — the leaf, not the page root.
      const matches = Array.from(doc.querySelectorAll('*')).filter((el) =>
        el.textContent?.includes(needle),
      );
      return matches.length > 0 ? matches[matches.length - 1] : null;
    };

    const rosterRoot = closestAncestorWithClass(
      findText('No Homunculi yet.'),
      'w-72',
    );
    expect(rosterRoot).toBeTruthy();
    expect(rosterRoot!.className).not.toContain('overflow-y-auto');

    const pipelineRoot = closestAncestorWithClass(
      findText('Training run'),
      'min-w-0',
    );
    expect(pipelineRoot).toBeTruthy();
    expect(pipelineRoot!.className).not.toContain('overflow-y-auto');

    const scoreboardRoot = closestAncestorWithClass(
      findText('Model registry'),
      'w-80',
    );
    expect(scoreboardRoot).toBeTruthy();
    expect(scoreboardRoot!.className).not.toContain('overflow-y-auto');
  });

  it('Dual Unison and Tail Generator panels flow with the page too', () => {
    // Both panels render in place of the Forge tab content and had
    // the same `flex min-h-0 flex-1 ... overflow-y-auto` squeeze
    // as their root. Their roots must carry no own vertical scroll
    // and no flex-1 squeeze.
    for (const Panel of [DualUnisonPanel, TailGeneratorPanel]) {
      const html = renderToStaticMarkup(React.createElement(Panel));
      const doc = parse(html);
      const root = doc.body.firstElementChild;
      expect(root).toBeTruthy();
      const cls = typeof root!.className === 'string' ? root!.className : '';
      expect(cls).not.toContain('overflow-y-auto');
      expect(cls).not.toContain('min-h-0');
      expect(cls).not.toContain('flex-1');
    }
  });
});
