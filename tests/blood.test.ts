/**
 * Blood drip tests.
 *
 * When LuciferAI is running a task (an AI-chat generation in flight),
 * tiny blood pixels drip from the Sentinel face's fang tips: faintly
 * visible, falling downward until they fall off the face, then gone.
 * The drip is irregular — an occasional drip, not a pour — and only a
 * handful of pixels are ever falling at once.
 *
 * The drip scheduler is pure functions with an injectable randomness
 * source, so tests drive it deterministically.
 *
 * Run with: npm test
 */

import {
  BLOOD_COLOR,
  BLOOD_OPACITY,
  BLOOD_RADIUS,
  BLOOD_FALL_DISTANCE,
  DRIP_MIN_DELAY_MS,
  DRIP_MAX_DELAY_MS,
  DRIP_MIN_FALL_MS,
  DRIP_MAX_FALL_MS,
  MAX_DRIPS,
  nextDripDelayMs,
  pickFang,
  dripFallMs,
  fangTip,
  FANG_TIPS,
  shouldDrip,
} from '../src/components/Synth/blood';

describe('fang tips', () => {
  test('there are exactly two fang tips — the two downward points of the maw', () => {
    expect(FANG_TIPS).toHaveLength(2);
  });

  test('the fang tips sit at the maw zigzag downward points (57,70) and (63,70)', () => {
    expect(fangTip('left')).toEqual({ x: 57, y: 70 });
    expect(fangTip('right')).toEqual({ x: 63, y: 70 });
  });
});

describe('blood pixel', () => {
  test('the blood is dark blood red — the only red in the face', () => {
    expect(BLOOD_COLOR).toBe('#a4161a');
  });

  test('the blood is faintly visible, not bright or loud', () => {
    expect(BLOOD_OPACITY).toBeLessThanOrEqual(0.5);
    expect(BLOOD_OPACITY).toBeGreaterThan(0);
  });

  test('the pixel is tiny', () => {
    expect(BLOOD_RADIUS).toBeLessThanOrEqual(1.5);
  });

  test('the fall carries the pixel past the head bottom and the SVG edge', () => {
    // Fang tip y=70, head bottom y=73, SVG bottom y=76 — a 12-unit
    // fall ends at y=82, off the face.
    expect(70 + BLOOD_FALL_DISTANCE).toBeGreaterThan(76);
  });

  test('only a handful of pixels are ever falling at once', () => {
    expect(MAX_DRIPS).toBeLessThanOrEqual(6);
  });
});

describe('nextDripDelayMs', () => {
  test('rand 0 gives the minimum delay', () => {
    expect(nextDripDelayMs(() => 0)).toBe(DRIP_MIN_DELAY_MS);
  });

  test('rand 1 gives the maximum delay', () => {
    expect(nextDripDelayMs(() => 1)).toBe(DRIP_MAX_DELAY_MS);
  });

  test('drips are irregular and occasional, never a fast pour', () => {
    expect(DRIP_MIN_DELAY_MS).toBeGreaterThanOrEqual(350);
    expect(DRIP_MAX_DELAY_MS).toBeLessThanOrEqual(900);
  });
});

describe('pickFang', () => {
  test('a low draw drips from the left fang', () => {
    expect(pickFang(() => 0.2)).toBe('left');
  });

  test('a high draw drips from the right fang', () => {
    expect(pickFang(() => 0.8)).toBe('right');
  });

  test('a drip can fall from either fang', () => {
    const sides = new Set([pickFang(() => 0.2), pickFang(() => 0.8)]);
    expect(sides).toEqual(new Set(['left', 'right']));
  });
});

describe('dripFallMs', () => {
  test('rand 0 gives the fastest fall', () => {
    expect(dripFallMs(() => 0)).toBe(DRIP_MIN_FALL_MS);
  });

  test('rand 1 gives the slowest fall', () => {
    expect(dripFallMs(() => 1)).toBe(DRIP_MAX_FALL_MS);
  });

  test('the fall takes about a second, so the drip is visible', () => {
    expect(DRIP_MIN_FALL_MS).toBeGreaterThanOrEqual(900);
    expect(DRIP_MAX_FALL_MS).toBeLessThanOrEqual(1400);
  });
});

describe('shouldDrip — the plugin-task trigger', () => {
  test('an AI-chat generation starts the drip', () => {
    expect(shouldDrip(true, false)).toBe(true);
  });

  test('a LuciferAI plugin task starts the drip', () => {
    expect(shouldDrip(false, true)).toBe(true);
  });

  test('both at once still drips', () => {
    expect(shouldDrip(true, true)).toBe(true);
  });

  test('nothing running means no drip', () => {
    expect(shouldDrip(false, false)).toBe(false);
  });

  test('a plain shell command does not start the drip — it sets neither input', () => {
    // Shell work only touches the terminal's shared 'command' loading
    // key, which is deliberately not an input to shouldDrip. The
    // plugin-task key is only set by runPluginCommand around
    // `lucid.command`, so a shell command can never produce a true
    // here.
    expect(shouldDrip(false, false)).toBe(false);
  });
});
