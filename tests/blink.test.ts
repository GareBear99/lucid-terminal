/**
 * Blink scheduler tests.
 *
 * The Sentinel face's eyes blink every once in a while — on a random
 * interval, usually once, sometimes twice, and rarely offset with one
 * eye leading the other. The offset can go both ways (left first or
 * right first). The scheduler is pure functions with an injectable
 * randomness source, so tests drive it deterministically.
 *
 * Run with: npm test
 */

import {
  nextBlinkDelayMs,
  isDoubleBlink,
  isOffsetBlink,
  offsetDirection,
  offsetDelayMs,
  BLINK_MIN_DELAY_MS,
  BLINK_MAX_DELAY_MS,
  DOUBLE_BLINK_CHANCE,
  OFFSET_BLINK_CHANCE,
  OFFSET_MIN_DELAY_MS,
  OFFSET_MAX_DELAY_MS,
} from '../src/components/Synth/blink';

describe('nextBlinkDelayMs', () => {
  test('rand 0 gives the minimum delay', () => {
    expect(nextBlinkDelayMs(() => 0)).toBe(BLINK_MIN_DELAY_MS);
  });

  test('rand 1 gives the maximum delay', () => {
    expect(nextBlinkDelayMs(() => 1)).toBe(BLINK_MAX_DELAY_MS);
  });

  test('rand 0.5 gives the midpoint', () => {
    expect(nextBlinkDelayMs(() => 0.5)).toBe((BLINK_MIN_DELAY_MS + BLINK_MAX_DELAY_MS) / 2);
  });

  test('blinks are every once in a while, never a fast metronome', () => {
    expect(BLINK_MIN_DELAY_MS).toBeGreaterThanOrEqual(3000);
    expect(BLINK_MAX_DELAY_MS).toBeLessThanOrEqual(8000);
  });
});

describe('isDoubleBlink', () => {
  test('a low draw gives a double blink', () => {
    expect(isDoubleBlink(() => 0.1)).toBe(true);
  });

  test('a high draw gives a single blink', () => {
    expect(isDoubleBlink(() => 0.9)).toBe(false);
  });

  test('double blinks are less common than single blinks', () => {
    expect(DOUBLE_BLINK_CHANCE).toBeLessThan(0.5);
  });
});

describe('isOffsetBlink', () => {
  test('a low draw gives an offset blink', () => {
    expect(isOffsetBlink(() => 0.05)).toBe(true);
  });

  test('a high draw gives a synchronised blink', () => {
    expect(isOffsetBlink(() => 0.9)).toBe(false);
  });

  test('offset blinks are rare', () => {
    expect(OFFSET_BLINK_CHANCE).toBeLessThanOrEqual(0.15);
  });
});

describe('offsetDirection', () => {
  test('a low draw has the left eye lead', () => {
    expect(offsetDirection(() => 0.2)).toBe('left');
  });

  test('a high draw has the right eye lead', () => {
    expect(offsetDirection(() => 0.8)).toBe('right');
  });

  test('the offset can happen both ways', () => {
    const directions = new Set([offsetDirection(() => 0.2), offsetDirection(() => 0.8)]);
    expect(directions).toEqual(new Set(['left', 'right']));
  });
});

describe('offsetDelayMs', () => {
  test('rand 0 gives the minimum lag', () => {
    expect(offsetDelayMs(() => 0)).toBe(OFFSET_MIN_DELAY_MS);
  });

  test('rand 1 gives the maximum lag', () => {
    expect(offsetDelayMs(() => 1)).toBe(OFFSET_MAX_DELAY_MS);
  });

  test('the lag is a short delay, well under a blink', () => {
    expect(OFFSET_MIN_DELAY_MS).toBeGreaterThanOrEqual(60);
    expect(OFFSET_MAX_DELAY_MS).toBeLessThanOrEqual(150);
  });
});
