// @vitest-environment jsdom
/**
 * Lucid boot splash tests.
 *
 * Expected behaviour (Gary, 2026-11-05): on launch the app shows black
 * smoke/mist, then "Lucid" in clean high-tech lettering, then the whole
 * splash fades out to the dashboard. Total ~3.2s. Click or any keypress
 * skips to a fast fade. Reduced motion: no smoke, brief wordmark.
 * A splash failure must never block the dashboard (error boundary
 * renders nothing).
 *
 * These are DOM/state/timing tests — the smoke is CSS, so no canvas
 * pixels are asserted here. Real frame-rate numbers come from the
 * perf harness (perf/measure-splash.mjs), not from jsdom.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SplashScreen } from '../src/components/Splash/SplashScreen';
import {
  SPLASH_TOTAL_MS,
  SPLASH_SMOKE_IN_MS,
  SPLASH_WORDMARK_IN_MS,
  SPLASH_WORDMARK_HOLD_MS,
  SPLASH_FADE_OUT_MS,
  SPLASH_SKIP_FADE_MS,
  SPLASH_REDUCED_MOTION_MS,
  SPLASH_REDUCED_MOTION_FADE_MS,
  SPLASH_SMOKE_PUFF_COUNT,
} from '../src/components/Splash/SplashScreen';

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

describe('SplashScreen', () => {
  test('renders "Lucid" and the smoke on mount', () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    expect(screen.getByTestId('splash-wordmark').textContent).toBe('Lucid');
    expect(screen.getByTestId('splash-smoke')).toBeTruthy();
    expect(screen.getAllByTestId('smoke-puff')).toHaveLength(SPLASH_SMOKE_PUFF_COUNT);
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('smoke');
    expect(onDone).not.toHaveBeenCalled();
  });

  test('walks the phases and calls onDone after the full sequence', () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    const splash = screen.getByTestId('splash-screen');

    act(() => {
      vi.advanceTimersByTime(SPLASH_SMOKE_IN_MS);
    });
    expect(splash.getAttribute('data-phase')).toBe('wordmark');

    act(() => {
      vi.advanceTimersByTime(SPLASH_WORDMARK_IN_MS);
    });
    expect(splash.getAttribute('data-phase')).toBe('hold');

    act(() => {
      vi.advanceTimersByTime(SPLASH_WORDMARK_HOLD_MS);
    });
    expect(splash.getAttribute('data-phase')).toBe('fade');
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SPLASH_FADE_OUT_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    // Advancing far past the end never calls onDone twice.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('total duration is the ~3.2s sequence', () => {
    expect(SPLASH_TOTAL_MS).toBe(
      SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS + SPLASH_FADE_OUT_MS,
    );
    expect(SPLASH_TOTAL_MS).toBeGreaterThanOrEqual(2500);
    expect(SPLASH_TOTAL_MS).toBeLessThanOrEqual(3500);
  });

  test('click skips to a fast fade and calls onDone once', () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    fireEvent.click(screen.getByTestId('splash-screen'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('fade');

    act(() => {
      vi.advanceTimersByTime(SPLASH_SKIP_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    // A second click after skipping does not fire onDone again.
    fireEvent.click(screen.getByTestId('splash-screen'));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('any keypress skips to a fast fade', () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('fade');
    act(() => {
      vi.advanceTimersByTime(SPLASH_SKIP_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('reduced motion: no smoke, brief wordmark, faster finish', () => {
    mockMatchMedia(true);
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    expect(screen.queryByTestId('splash-smoke')).toBeNull();
    expect(screen.queryAllByTestId('smoke-puff')).toHaveLength(0);
    expect(screen.getByTestId('splash-wordmark').textContent).toBe('Lucid');
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('wordmark');

    act(() => {
      vi.advanceTimersByTime(SPLASH_REDUCED_MOTION_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('a splash render failure renders nothing instead of crashing', () => {
    // matchMedia throwing makes the splash throw during render; the
    // error boundary must swallow it so the dashboard still shows.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => {
        throw new Error('matchMedia unavailable');
      },
    });
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    expect(container.firstChild).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('SplashScreen fadeOut={false} (splash1 — hard cut into profiles)', () => {
  // The rule (2026-11-13): splash1 must NEVER fade — the fade turns
  // the whole overlay (black background included) transparent and the
  // terminal mounted underneath shows through for ~1s before profiles
  // pops in. With fadeOut={false} there is no fade phase at all:
  // onDone fires at the end of the hold and the screen cuts black
  // straight into profiles.
  test('never enters the fade phase and calls onDone at the end of the hold', () => {
    const onDone = vi.fn();
    render(<SplashScreen fadeOut={false} onDone={onDone} />);
    const splash = screen.getByTestId('splash-screen');

    act(() => {
      vi.advanceTimersByTime(SPLASH_SMOKE_IN_MS);
    });
    expect(splash.getAttribute('data-phase')).toBe('wordmark');

    act(() => {
      vi.advanceTimersByTime(SPLASH_WORDMARK_IN_MS);
    });
    expect(splash.getAttribute('data-phase')).toBe('hold');
    expect(onDone).not.toHaveBeenCalled();

    // End of the hold: hard cut — onDone fires, phase never becomes 'fade'.
    act(() => {
      vi.advanceTimersByTime(SPLASH_WORDMARK_HOLD_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(splash.getAttribute('data-phase')).toBe('hold');

    // Advancing past the old fade window changes nothing.
    act(() => {
      vi.advanceTimersByTime(SPLASH_FADE_OUT_MS + 10_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(splash.getAttribute('data-phase')).toBe('hold');
  });

  test('click skips immediately with no fade phase', () => {
    const onDone = vi.fn();
    render(<SplashScreen fadeOut={false} onDone={onDone} />);
    fireEvent.click(screen.getByTestId('splash-screen'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('smoke');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('keypress skips immediately with no fade phase', () => {
    const onDone = vi.fn();
    render(<SplashScreen fadeOut={false} onDone={onDone} />);
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('smoke');
  });

  test('reduced motion: cuts at the point the fade would have started, never fades', () => {
    mockMatchMedia(true);
    const onDone = vi.fn();
    render(<SplashScreen fadeOut={false} onDone={onDone} />);
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('wordmark');

    act(() => {
      vi.advanceTimersByTime(SPLASH_REDUCED_MOTION_MS - SPLASH_REDUCED_MOTION_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('splash-screen').getAttribute('data-phase')).toBe('wordmark');
  });
});

describe('SplashScreen fadeOut={true} (splash2 — cross-fade into the dashboard)', () => {
  test('keeps the fade phase and calls onDone only after the fade', () => {
    const onDone = vi.fn();
    render(<SplashScreen fadeOut={true} onDone={onDone} />);
    const splash = screen.getByTestId('splash-screen');

    act(() => {
      vi.advanceTimersByTime(
        SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS,
      );
    });
    expect(splash.getAttribute('data-phase')).toBe('fade');
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SPLASH_FADE_OUT_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
