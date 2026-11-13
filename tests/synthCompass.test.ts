/**
 * Compass math tests — the demo compass, ported from the vendored v67
 * shell (WORLD_AXES + updatePoleState). The expected values below are
 * computed from the shell's own formulas, not from the implementation
 * under test: pole by best dot, angle = acos(best dot), LOCK < 6°,
 * NEAR < 18°, latitude = asin(y), pole offset = 1 - |y|, cardinal
 * quadrants N [315,45) / E [45,135) / S [135,225) / W [225,315),
 * and the compass line `hdg=…° X  lat=…°  poleOff=…`.
 */

import { describe, test, expect } from 'vitest';
import {
  cardinalForHeading,
  compassForDirection,
  formatCompassLine,
} from '../src/lib/synthCompass';
import {
  DEFAULT_SHELL_BLUEPRINT,
  eyeDirection,
} from '../src/lib/synthBlueprint';
import type { Vec3 } from '../src/types/synth';

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

describe('compassForDirection — the demo compass, any direction', () => {
  test('the default octagon eye reads pole +Z, LOCK, heading ~78.7° E', () => {
    // eye = norm({x:0.1, y:0.02, z:0.994}) ≈ (0.1001, 0.0200, 0.9948).
    const state = compassForDirection(
      eyeDirection(DEFAULT_SHELL_BLUEPRINT),
    );
    expect(state).not.toBeNull();
    expect(state!.label).toBe('+Z');
    // acos(0.9948) ≈ 5.86° — just inside LOCK.
    expect(state!.angleDeg).toBeCloseTo(5.86, 1);
    expect(state!.alignment).toBe('LOCK');
    // atan2(0.1001, 0.0200) ≈ 78.7° — E quadrant.
    expect(state!.headingDeg).toBeCloseTo(78.7, 1);
    expect(state!.dominantCardinal).toBe('E');
    // asin(0.0200) ≈ 1.15°; pole offset 1 - 0.02 ≈ 0.98.
    expect(state!.latitudeDeg).toBeCloseTo(1.15, 1);
    expect(state!.poleOffset).toBeCloseTo(0.98, 2);
    expect(formatCompassLine(state!)).toBe(
      'hdg=78.7° E  lat=1.1°  poleOff=0.980',
    );
  });

  test('axis directions read their own pole, LOCK, at 0°', () => {
    for (const [dir, label, heading, cardinal, lat] of [
      [{ x: 0, y: 1, z: 0 }, 'N', 0, 'N', 90],
      [{ x: 0, y: -1, z: 0 }, 'S', 180, 'S', -90],
      [{ x: 1, y: 0, z: 0 }, 'E', 90, 'E', 0],
      [{ x: -1, y: 0, z: 0 }, 'W', 270, 'W', 0],
      // +Z and -Z point straight up/down the azimuth plane (x=y=0),
      // so the azimuth is degenerate and atan2(0, 0) reads 0° N —
      // the pole label (+Z / -Z) is what carries the direction there.
      // (The shell's heading for these is camera-frame, not 0° —
      // see the frame note in src/lib/synthCompass.ts.)
      [{ x: 0, y: 0, z: 1 }, '+Z', 0, 'N', 0],
      [{ x: 0, y: 0, z: -1 }, '-Z', 0, 'N', 0],
    ] as const) {
      const state = compassForDirection(dir);
      expect(state).not.toBeNull();
      expect(state!.label).toBe(label);
      expect(state!.angleDeg).toBeCloseTo(0, 9);
      expect(state!.alignment).toBe('LOCK');
      expect(state!.headingDeg).toBeCloseTo(heading, 9);
      expect(state!.dominantCardinal).toBe(cardinal);
      expect(state!.latitudeDeg).toBeCloseTo(lat, 9);
    }
  });

  test('a direction between N and E keeps the first pole on ties, cardinal from heading', () => {
    // (1,1,0)/√2: dot with N and E both 0.707 — N wins (first in
    // WORLD_AXES order, strict `>`), angle 45°, heading exactly 45°.
    const state = compassForDirection(norm({ x: 1, y: 1, z: 0 }));
    expect(state).not.toBeNull();
    expect(state!.label).toBe('N');
    expect(state!.angleDeg).toBeCloseTo(45, 9);
    expect(state!.alignment).toBe('OFFSET');
    expect(state!.headingDeg).toBeCloseTo(45, 9);
    // 45° is E by the shell's quadrants (<45 is N).
    expect(state!.dominantCardinal).toBe('E');
  });

  test('alignment thresholds match the shell: 6° LOCK, 18° NEAR', () => {
    // 10° off +Z: NEAR. 30° off +Z: OFFSET.
    const ten = compassForDirection(
      norm({ x: Math.sin((10 * Math.PI) / 180), y: 0, z: Math.cos((10 * Math.PI) / 180) }),
    );
    expect(ten).not.toBeNull();
    expect(ten!.label).toBe('+Z');
    expect(ten!.angleDeg).toBeCloseTo(10, 9);
    expect(ten!.alignment).toBe('NEAR');
    const thirty = compassForDirection(
      norm({ x: Math.sin((30 * Math.PI) / 180), y: 0, z: Math.cos((30 * Math.PI) / 180) }),
    );
    expect(thirty).not.toBeNull();
    expect(thirty!.alignment).toBe('OFFSET');
  });

  test('pole offset is 0 on a pole and 1 on the equator', () => {
    expect(compassForDirection({ x: 0, y: 1, z: 0 })!.poleOffset).toBeCloseTo(0, 9);
    expect(compassForDirection({ x: 1, y: 0, z: 0 })!.poleOffset).toBeCloseTo(1, 9);
  });

  test('no usable direction means no compass state — never a made-up heading', () => {
    expect(compassForDirection({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(compassForDirection({ x: NaN, y: 0, z: 1 })).toBeNull();
    expect(compassForDirection({ x: 0, y: Infinity, z: 0 })).toBeNull();
  });
});

describe('cardinalForHeading — the shell quadrants', () => {
  test('boundaries: 45 is E, 135 is S, 225 is W, 315 is N', () => {
    expect(cardinalForHeading(0)).toBe('N');
    expect(cardinalForHeading(44.9)).toBe('N');
    expect(cardinalForHeading(45)).toBe('E');
    expect(cardinalForHeading(134.9)).toBe('E');
    expect(cardinalForHeading(135)).toBe('S');
    expect(cardinalForHeading(224.9)).toBe('S');
    expect(cardinalForHeading(225)).toBe('W');
    expect(cardinalForHeading(314.9)).toBe('W');
    expect(cardinalForHeading(315)).toBe('N');
    expect(cardinalForHeading(359.9)).toBe('N');
    expect(cardinalForHeading(360)).toBe('N');
    expect(cardinalForHeading(-90)).toBe('W');
  });
});
