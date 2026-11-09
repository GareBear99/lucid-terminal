// @vitest-environment jsdom
/**
 * Top-bar Summons entry tests (Gary, 2026-11-09).
 *
 * The Summons entry goes FIRST in the very top bar, between the
 * "Lucid Terminal" writing and the other end: right after the title
 * text, before the account button and the window controls. Clicking
 * it opens the Forge view at the Summons section (the handler is
 * wired in App — here the entry must call the prop it is given).
 *
 * Position is checked on static markup (same harness as
 * tests/titleBarHeight.test.tsx); the click is checked in jsdom
 * with window.lucidAPI.window mocked, since TitleBar's effect reads
 * it on mount.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent } from '@testing-library/react';
import TitleBar from '../src/components/Layout/TitleBar';

describe('TitleBar Summons entry — position (Gary, 2026-11-09)', () => {
  test('Summons sits first: after the title text, before the window controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(TitleBar, { onOpenSummons: () => undefined }),
    );
    const titleAt = html.indexOf('Lucid Terminal');
    const summonsAt = html.indexOf('Summons');
    // The window controls are Tooltip-wrapped buttons — the minus
    // icon marks the start of the controls block (the account button
    // renders nothing without an ID, so the controls are the next
    // marker after it).
    const controlsAt = html.indexOf('lucide-minus');
    expect(titleAt).toBeGreaterThan(-1);
    expect(summonsAt).toBeGreaterThan(titleAt);
    expect(controlsAt).toBeGreaterThan(summonsAt);
  });

  test('the entry is a button that names what it opens', () => {
    const html = renderToStaticMarkup(
      React.createElement(TitleBar, { onOpenSummons: () => undefined }),
    );
    expect(html).toContain(
      'aria-label="Summons — open the Forge Summons section"',
    );
    expect(html).toContain('>Summons<');
  });

  test('the entry opts out of the bar drag region so it stays clickable', () => {
    const html = renderToStaticMarkup(
      React.createElement(TitleBar, { onOpenSummons: () => undefined }),
    );
    // The button carries no-drag (as -webkit-app-region:no-drag in
    // the style attribute, which follows the aria-label); the bar
    // itself is the drag region.
    const buttonAt = html.indexOf('Summons — open the Forge Summons section');
    const slice = html.slice(buttonAt, buttonAt + 600);
    expect(slice).toContain('no-drag');
  });
});

describe('TitleBar Summons entry — click', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      ...((prevLucidAPI as object) ?? {}),
      window: {
        isMaximized: vi.fn(async () => false),
        onMaximizedChange: vi.fn(() => () => undefined),
      },
    };
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  });

  test('clicking Summons calls onOpenSummons', () => {
    const onOpenSummons = vi.fn();
    render(<TitleBar onOpenSummons={onOpenSummons} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Summons — open the Forge Summons section',
      }),
    );
    expect(onOpenSummons).toHaveBeenCalledTimes(1);
  });
});
