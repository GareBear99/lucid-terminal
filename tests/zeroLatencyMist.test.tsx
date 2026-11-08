// @vitest-environment jsdom
/**
 * Zero-latency F3 — the permanent mist sleeps.
 *
 * Hand-checkable cases (defined BEFORE running):
 * 1. SplashMist renders the same 7 puffs, unpaused, while the window
 *    is visible and active.
 * 2. Hiding the window (document.hidden + visibilitychange) pauses
 *    the mist (data-paused="true"); showing it again resumes.
 * 3. 60 s with no pointer/keyboard activity pauses the mist; the
 *    next pointer move resumes it.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SplashMist, SPLASH_MIST_IDLE_MS } from '../src/components/Splash/SplashMist';

let hiddenValue = false;
Object.defineProperty(document, 'hidden', {
  configurable: true,
  get: () => hiddenValue,
});

afterEach(() => {
  hiddenValue = false;
  vi.useRealTimers();
});

describe('SplashMist variable cadence', () => {
  it('renders 7 puffs, unpaused while visible', () => {
    render(<SplashMist />);
    expect(screen.getAllByTestId('smoke-puff')).toHaveLength(7);
    expect(screen.getByTestId('splash-mist').getAttribute('data-paused')).toBeNull();
  });

  it('pauses when the window hides, resumes when it shows', () => {
    render(<SplashMist />);
    const mist = screen.getByTestId('splash-mist');
    hiddenValue = true;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mist.getAttribute('data-paused')).toBe('true');
    hiddenValue = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mist.getAttribute('data-paused')).toBeNull();
  });

  it('pauses after 60 s idle, resumes on pointer movement', () => {
    vi.useFakeTimers();
    render(<SplashMist />);
    const mist = screen.getByTestId('splash-mist');
    act(() => {
      vi.advanceTimersByTime(SPLASH_MIST_IDLE_MS - 1);
    });
    expect(mist.getAttribute('data-paused')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mist.getAttribute('data-paused')).toBe('true');
    act(() => {
      fireEvent.pointerMove(window);
    });
    expect(mist.getAttribute('data-paused')).toBeNull();
  });
});
