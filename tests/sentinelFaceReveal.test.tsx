// @vitest-environment jsdom
/**
 * SentinelFace wake-up reveal tests.
 *
 * Expected behaviour (Gary, 2026-11-05): before a Homunculus colour
 * is chosen the face is unformed — black, with no eyes (and no fanged
 * maw). Once a colour is chosen the eyes fade in and the head line
 * draws itself — the Homunculus waking up. The reveal fires only on
 * the null -> colour transition: not on mount with a colour already
 * stored, and not when switching between pink and purple. With
 * reduced motion the final face shows at once, with no animation.
 *
 * These are DOM/state tests — the reveal is asserted through the
 * elements and their animation styles, not pixels.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { SentinelFace } from '../src/components/Synth/SentinelFace';
import { useSettingsStore } from '../src/stores/settingsStore';
import { HOMUNCULUS_REVEAL_MS } from '../src/lib/homunculusColor';

function seedHomunculusColor(value: unknown) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, homunculusColor: value as never },
  }));
}

function headCircle(container: HTMLElement) {
  return container.querySelector('[data-head="true"]');
}

function eyeGroup(container: HTMLElement) {
  return container.querySelector('[data-eye="left"]')?.parentElement ?? null;
}

function styleOf(el: Element | null): string {
  return el?.getAttribute('style') ?? '';
}

describe('SentinelFace unformed state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedHomunculusColor(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    seedHomunculusColor(null);
  });

  test('before a choice the face is black with no eyes and no maw', () => {
    const { container } = render(<SentinelFace />);
    // No eyes at all — not hidden, not rendered.
    expect(container.querySelector('[data-eye="left"]')).toBeNull();
    expect(container.querySelector('[data-eye="right"]')).toBeNull();
    // No fanged maw either.
    expect(container.querySelector('[data-maw="true"]')).toBeNull();
    // The head outline is the unformed dark grey — black, not pink/purple.
    const head = headCircle(container);
    expect(head).not.toBeNull();
    expect(head?.getAttribute('stroke')).toBe('#262626');
    // The horns are there (the face shape is intact) but black.
    expect(container.querySelector('[data-horn="left"]')).not.toBeNull();
    expect(container.querySelector('[data-horn="right"]')).not.toBeNull();
  });

  test('choosing pink wakes the face: eyes fade in, line draws, maw appears', () => {
    const { container } = render(<SentinelFace />);
    act(() => {
      seedHomunculusColor('pink');
    });
    expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
    expect(container.querySelector('[data-eye="right"]')).not.toBeNull();
    expect(container.querySelector('[data-maw="true"]')).not.toBeNull();
    // The eyes fade in…
    expect(styleOf(eyeGroup(container))).toContain('homunculus-eye-fade');
    expect(styleOf(eyeGroup(container))).toContain('700ms');
    // …and the head line draws itself.
    expect(styleOf(headCircle(container))).toContain('homunculus-line-draw');
    expect(styleOf(headCircle(container))).toContain('900ms');
    // The face is now pink.
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#ff2d95');
  });

  test('the reveal clears after the reveal duration', () => {
    const { container } = render(<SentinelFace />);
    act(() => {
      seedHomunculusColor('pink');
    });
    expect(styleOf(eyeGroup(container))).toContain('homunculus-eye-fade');
    act(() => {
      vi.advanceTimersByTime(HOMUNCULUS_REVEAL_MS);
    });
    // The animations are gone — the final face stands on its own.
    expect(styleOf(eyeGroup(container))).not.toContain('homunculus-eye-fade');
    expect(styleOf(headCircle(container))).not.toContain(
      'homunculus-line-draw',
    );
    // The face itself is still there, pink, eyes open.
    expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#ff2d95');
  });

  test('reduced motion shows the final face at once, with no animation', () => {
    const prevMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const { container } = render(<SentinelFace />);
      act(() => {
        seedHomunculusColor('purple');
      });
      expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
      expect(headCircle(container)?.getAttribute('stroke')).toBe('#a855f7');
      expect(styleOf(eyeGroup(container))).not.toContain(
        'homunculus-eye-fade',
      );
      expect(styleOf(headCircle(container))).not.toContain(
        'homunculus-line-draw',
      );
    } finally {
      window.matchMedia = prevMatchMedia;
    }
  });

  test('a stored colour on mount shows the formed face with no reveal', () => {
    seedHomunculusColor('purple');
    const { container } = render(<SentinelFace />);
    expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
    expect(container.querySelector('[data-maw="true"]')).not.toBeNull();
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#a855f7');
    expect(styleOf(eyeGroup(container))).not.toContain('homunculus-eye-fade');
    expect(styleOf(headCircle(container))).not.toContain(
      'homunculus-line-draw',
    );
  });

  test('switching pink to purple does not re-reveal', () => {
    seedHomunculusColor('pink');
    const { container } = render(<SentinelFace />);
    act(() => {
      seedHomunculusColor('purple');
    });
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#a855f7');
    expect(styleOf(eyeGroup(container))).not.toContain('homunculus-eye-fade');
    expect(styleOf(headCircle(container))).not.toContain(
      'homunculus-line-draw',
    );
  });
});

describe('SentinelFace color prop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedHomunculusColor(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    seedHomunculusColor(null);
  });

  test('a color prop wears that color even when Settings has no choice', () => {
    // Settings: no choice yet (unformed). The prop still forms the face.
    const { container } = render(<SentinelFace color="pink" />);
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#ff2d95');
    expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
    expect(container.querySelector('[data-maw="true"]')).not.toBeNull();
  });

  test('a color prop overrides the color stored in Settings', () => {
    // Settings says pink; the prop says purple — the face is purple.
    // This is how the Forge roster card shows each Homunculus's own
    // face when two Homunculi have different colors.
    seedHomunculusColor('pink');
    const { container } = render(<SentinelFace color="purple" />);
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#a855f7');
    expect(container.querySelector('[data-eye="left"]')).not.toBeNull();
  });

  test('without a color prop the face reads Settings as before', () => {
    seedHomunculusColor('purple');
    const { container } = render(<SentinelFace />);
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#a855f7');
  });

  test('an explicit null color prop renders the unformed face', () => {
    seedHomunculusColor('pink');
    const { container } = render(<SentinelFace color={null} />);
    expect(headCircle(container)?.getAttribute('stroke')).toBe('#262626');
    expect(container.querySelector('[data-eye="left"]')).toBeNull();
    expect(container.querySelector('[data-maw="true"]')).toBeNull();
  });
});
