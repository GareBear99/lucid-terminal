/**
 * Homunculus colour tests.
 *
 * Expected behaviour (Gary, 2026-11-05): on first entry to the Synth
 * view the user chooses purple or pink for the Homunculus (the
 * Sentinel face). The choice is stored as the `homunculusColor`
 * setting; null (or an invalid value) means no choice yet and the
 * picker shows again. Pink is the face's current variation — the
 * palette it already wears; purple is the new alternative. There is
 * no fallback colour: before a choice the face is unformed — black,
 * with no eyes — and once a colour is chosen the eyes fade in and
 * the head line draws itself (the wake-up reveal).
 */

import { describe, test, expect } from 'vitest';
import {
  HOMUNCULUS_COLORS,
  HOMUNCULUS_EYE_FADE_MS,
  HOMUNCULUS_LINE_DRAW_MS,
  HOMUNCULUS_REVEAL_MS,
  HOMUNCULUS_THEMES,
  HOMUNCULUS_UNFORMED_THEME,
  parseHomunculusColor,
  shouldShowHomunculusPicker,
} from '../src/lib/homunculusColor';

describe('parseHomunculusColor', () => {
  test('accepts exactly purple and pink', () => {
    expect(parseHomunculusColor('purple')).toBe('purple');
    expect(parseHomunculusColor('pink')).toBe('pink');
  });

  test('rejects everything else as no choice yet', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'magenta',
      'Purple',
      'PINK',
      ' purple',
      0,
      1,
      true,
      {},
      [],
    ]) {
      expect(parseHomunculusColor(bad)).toBeNull();
    }
  });
});

describe('shouldShowHomunculusPicker', () => {
  test('shows the picker when no valid choice is stored', () => {
    expect(shouldShowHomunculusPicker(null)).toBe(true);
    expect(shouldShowHomunculusPicker(undefined)).toBe(true);
    expect(shouldShowHomunculusPicker('magenta')).toBe(true);
  });

  test('hides the picker once a valid choice is stored', () => {
    expect(shouldShowHomunculusPicker('purple')).toBe(false);
    expect(shouldShowHomunculusPicker('pink')).toBe(false);
  });
});

describe('HOMUNCULUS_THEMES', () => {
  test('only purple and pink exist', () => {
    expect([...HOMUNCULUS_COLORS].sort()).toEqual(['pink', 'purple']);
    expect(Object.keys(HOMUNCULUS_THEMES).sort()).toEqual([
      'pink',
      'purple',
    ]);
  });

  test('pink is the face’s current variation — its original palette', () => {
    const pink = HOMUNCULUS_THEMES.pink;
    expect(pink.primary).toBe('#ff2d95');
    expect(pink.light).toBe('#d7a0ff');
    expect(pink.bright).toBe('#ff5db1');
  });

  test('purple is a distinct deep violet', () => {
    const purple = HOMUNCULUS_THEMES.purple;
    expect(purple.primary).toBe('#a855f7');
    expect(purple.light).toBe('#d8b4fe');
    expect(purple.bright).toBe('#c084fc');
    expect(purple.primary).not.toBe(HOMUNCULUS_THEMES.pink.primary);
  });

  test('every theme has all four values', () => {
    for (const theme of Object.values(HOMUNCULUS_THEMES)) {
      expect(theme.primary).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.bright).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.glow).toMatch(/^rgba\(/);
    }
  });
});

describe('HOMUNCULUS_UNFORMED_THEME', () => {
  test('the unformed face is black, not a colour', () => {
    // Dark grey — visible as a faint edge against black, clearly black.
    expect(HOMUNCULUS_UNFORMED_THEME.primary).toBe('#262626');
    expect(HOMUNCULUS_UNFORMED_THEME.light).toBe('#262626');
    // Face-related text accents go neutral grey, not pink or purple.
    expect(HOMUNCULUS_UNFORMED_THEME.bright).toBe('#8a8a8a');
    expect(HOMUNCULUS_UNFORMED_THEME.bright).not.toBe(
      HOMUNCULUS_THEMES.pink.bright,
    );
    expect(HOMUNCULUS_UNFORMED_THEME.bright).not.toBe(
      HOMUNCULUS_THEMES.purple.bright,
    );
    // No glow on a face that has not woken up yet.
    expect(HOMUNCULUS_UNFORMED_THEME.glow).toBe('rgba(0, 0, 0, 0)');
  });

  test('it is not one of the two colour themes', () => {
    expect(HOMUNCULUS_UNFORMED_THEME).not.toEqual(HOMUNCULUS_THEMES.pink);
    expect(HOMUNCULUS_UNFORMED_THEME).not.toEqual(
      HOMUNCULUS_THEMES.purple,
    );
  });
});

describe('wake-up reveal timings', () => {
  test('the fade and draw durations are named, positive constants', () => {
    expect(HOMUNCULUS_EYE_FADE_MS).toBe(700);
    expect(HOMUNCULUS_LINE_DRAW_MS).toBe(900);
    expect(HOMUNCULUS_REVEAL_MS).toBe(950);
  });

  test('the reveal outlasts both the fade and the draw', () => {
    expect(HOMUNCULUS_REVEAL_MS).toBeGreaterThanOrEqual(
      HOMUNCULUS_EYE_FADE_MS,
    );
    expect(HOMUNCULUS_REVEAL_MS).toBeGreaterThanOrEqual(
      HOMUNCULUS_LINE_DRAW_MS,
    );
  });
});
