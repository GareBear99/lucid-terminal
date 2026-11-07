// @vitest-environment node
/**
 * Main-screen mist — always splashscreen misty black (Gary, 2026-11-07).
 *
 * The main screen should always be the splashscreen's misty black: pure
 * black #000 with the boot splash's own smoke drifting behind the
 * dashboard. SplashMist is that mist without the splash — the exact
 * same seven puffs the boot splash shows (same classes, same positions,
 * same drift, puff 2 the cool-blue accent), no wordmark, no fade.
 *
 * Same harness as the tab-glass tests: renderToStaticMarkup, no jsdom
 * (SplashMist is pure presentational, no hooks, no window use).
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplashMist } from '../src/components/Splash/SplashMist';
import { SPLASH_SMOKE_PUFF_COUNT } from '../src/components/Splash/SplashScreen';

describe('SplashMist — the splashscreen mist, as the main-screen backdrop', () => {
  it('renders the mist wrapper, always visible (not gated on mount)', () => {
    const html = renderToStaticMarkup(React.createElement(SplashMist));
    expect(html).toContain('data-testid="splash-mist"');
    expect(html).toContain('splash-smoke');
    // Always visible on its own — the .splash-mist rule holds opacity 1,
    // unlike the boot splash's smoke (gated on .splash-mounted).
    expect(html).toContain('splash-mist');
  });

  it('renders exactly the splash puff count, same classes as the boot splash', () => {
    const html = renderToStaticMarkup(React.createElement(SplashMist));
    const puffs = html.match(/data-testid="smoke-puff"/g) ?? [];
    expect(puffs).toHaveLength(SPLASH_SMOKE_PUFF_COUNT);
    expect(SPLASH_SMOKE_PUFF_COUNT).toBe(7);
    for (let i = 0; i < SPLASH_SMOKE_PUFF_COUNT; i++) {
      expect(html).toContain(`splash-puff-${i}`);
    }
  });

  it('exactly one accent puff, on puff 2 — the cool-blue one, as in the splash', () => {
    const html = renderToStaticMarkup(React.createElement(SplashMist));
    const accents = html.match(/splash-puff-accent/g) ?? [];
    expect(accents).toHaveLength(1);
    expect(html).toContain('splash-puff-2 splash-puff-accent');
  });
});
