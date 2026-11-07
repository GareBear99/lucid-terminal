/**
 * Browser Phase B — agent mouse + glass splash pure tests: the
 * live separate mouse is LOCKED to the browser area (clamped to
 * the view bounds), and the glass splash runs the boot splash's
 * ~3.2s rhythm (smoke → wordmark → hold → fade).
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  BROWSER_GLASS_SPLASH_FADE_MS,
  BROWSER_GLASS_SPLASH_HOLD_MS,
  BROWSER_GLASS_SPLASH_SMOKE_MS,
  BROWSER_GLASS_SPLASH_TOTAL_MS,
  BROWSER_GLASS_SPLASH_WORDMARK_MS,
  clampAgentMousePosition,
  getBrowserGlassSplashPhase,
  isAgentMouseInBounds,
} from '../src/lib/browserAgent';

describe('clampAgentMousePosition', () => {
  const bounds = { width: 640, height: 420 };

  it('passes a point inside the browser area through unchanged', () => {
    expect(clampAgentMousePosition(100, 50, bounds)).toEqual({
      x: 100,
      y: 50,
    });
  });

  it('clamps a point outside the browser area to its edges', () => {
    // The mouse can never leave the browser area.
    expect(clampAgentMousePosition(700, 500, bounds)).toEqual({
      x: 640,
      y: 420,
    });
    expect(clampAgentMousePosition(-20, -5, bounds)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampAgentMousePosition(640, 420, bounds)).toEqual({
      x: 640,
      y: 420,
    });
  });

  it('clamps non-finite input to the origin', () => {
    expect(clampAgentMousePosition(NaN, Infinity, bounds)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampAgentMousePosition(NaN, NaN, bounds)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('clamps to (0, 0) when there is no view to lock inside', () => {
    expect(clampAgentMousePosition(100, 50, null)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampAgentMousePosition(100, 50, undefined)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampAgentMousePosition(100, 50, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('isAgentMouseInBounds', () => {
  it('is inclusive of the edges and false without bounds', () => {
    const bounds = { width: 640, height: 420 };
    expect(isAgentMouseInBounds({ x: 0, y: 0 }, bounds)).toBe(true);
    expect(isAgentMouseInBounds({ x: 640, y: 420 }, bounds)).toBe(true);
    expect(isAgentMouseInBounds({ x: 641, y: 420 }, bounds)).toBe(false);
    expect(isAgentMouseInBounds({ x: 0, y: 0 }, null)).toBe(false);
  });
});

describe('glass splash timing', () => {
  it('totals ~3.2s, the boot splash rhythm', () => {
    expect(BROWSER_GLASS_SPLASH_TOTAL_MS).toBe(3200);
    expect(
      BROWSER_GLASS_SPLASH_SMOKE_MS +
        BROWSER_GLASS_SPLASH_WORDMARK_MS +
        BROWSER_GLASS_SPLASH_HOLD_MS +
        BROWSER_GLASS_SPLASH_FADE_MS,
    ).toBe(3200);
  });

  it('walks smoke → wordmark → hold → fade → done', () => {
    expect(getBrowserGlassSplashPhase(0)).toBe('smoke');
    expect(getBrowserGlassSplashPhase(599)).toBe('smoke');
    expect(getBrowserGlassSplashPhase(600)).toBe('wordmark');
    expect(getBrowserGlassSplashPhase(1299)).toBe('wordmark');
    expect(getBrowserGlassSplashPhase(1300)).toBe('hold');
    expect(getBrowserGlassSplashPhase(2199)).toBe('hold');
    expect(getBrowserGlassSplashPhase(2200)).toBe('fade');
    expect(getBrowserGlassSplashPhase(3199)).toBe('fade');
    expect(getBrowserGlassSplashPhase(3200)).toBe('done');
    expect(getBrowserGlassSplashPhase(99999)).toBe('done');
  });

  it('treats negative / non-finite elapsed as smoke', () => {
    expect(getBrowserGlassSplashPhase(-1)).toBe('smoke');
    expect(getBrowserGlassSplashPhase(NaN)).toBe('smoke');
  });
});
