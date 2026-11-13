/**
 * The demo's compass — ported, not redesigned (Gary, 2026-11-12 ~16:49
 * PST: the compass widget "will be the exact compass from the demo but
 * as a widget for any blueprint").
 *
 * Source: the vendored MATRIX SYNTH v67 shell
 * (public/synth/matrix-synth-v67.html) — WORLD_AXES (line ~2794) and
 * updatePoleState (line ~3110). The computation below is the shell's
 * own, verbatim in structure: best pole by dot product, angle from the
 * best dot, alignment thresholds, latitude from the direction's y, pole
 * offset, cardinal quadrants, and the compass-line format
 * (`hdg=…° X  lat=…°  poleOff=…`).
 *
 * TWO honest deviations, both forced by what the TS layer knows:
 *
 * 1. INPUT — the shell's compass reads the RETICLE
 *    (updatePoleState uses reticleWorldDir(); the camera follows the
 *    reticle, so the heading moves with it). The TS layer has no
 *    reticle — reticleDir lives in the shell iframe and nothing posts
 *    it. The widget reads the EYE direction instead
 *    (machine.shell.eyeDir = norm(blueprint.origin)) — the only
 *    direction the TS layer knows for any blueprint. The function
 *    itself takes any direction, so when the shell bridge later posts
 *    its live reticle/POLE state, the widget becomes live-exact with
 *    no change to this math — only the input changes.
 *
 * 2. HEADING FRAME — the shell's headingDeg is camera-frame:
 *    northCam = qrot(qCam, N), heading = atan2(northCam.x, northCam.y).
 *    The TS layer has no camera quaternion, so the widget's heading is
 *    the direction's own world azimuth from north — atan2(d.x, d.y),
 *    normalized to [0, 360). The cardinal quadrants are the shell's
 *    exact ones, so axis-aligned directions read identically (N = 0°,
 *    E = 90°, S = 180°, W = 270°); off-axis headings differ from the
 *    shell's camera-frame heading by the camera's roll, which the TS
 *    layer cannot see.
 *
 * The widget is blueprint-agnostic: it reads whatever direction the
 * active shell's blueprint gives (any blueprint's origin), so the same
 * compass works for the demo, a creation build, or any shell that
 * reports a direction. A shell that reports none (Iteration 8 — its
 * iframe state carries no direction) shows no heading, never a
 * made-up one.
 */

import type { Vec3 } from '../types/synth';

/** The shell's world axes (v67 WORLD_AXES, in iteration order — order
 * matters: ties keep the FIRST best, via the strict `>` below). */
export const COMPASS_WORLD_AXES: readonly {
  label: string;
  vec: Vec3;
}[] = [
  { label: 'N', vec: { x: 0, y: 1, z: 0 } },
  { label: 'S', vec: { x: 0, y: -1, z: 0 } },
  { label: 'E', vec: { x: 1, y: 0, z: 0 } },
  { label: 'W', vec: { x: -1, y: 0, z: 0 } },
  { label: '+Z', vec: { x: 0, y: 0, z: 1 } },
  { label: '-Z', vec: { x: 0, y: 0, z: -1 } },
];

/** How close the direction sits to its pole (v67: <6° LOCK, <18° NEAR). */
export type CompassAlignment = 'LOCK' | 'NEAR' | 'OFFSET';

export const COMPASS_LOCK_DEG = 6;
export const COMPASS_NEAR_DEG = 18;

/** The demo compass's state for one direction. */
export interface CompassState {
  /** Nearest world axis ('N' | 'S' | 'E' | 'W' | '+Z' | '-Z'). */
  label: string;
  /** Dot product with that axis (1 = exactly on the pole). */
  dot: number;
  /** Angle off the pole, degrees. */
  angleDeg: number;
  alignment: CompassAlignment;
  /** Heading, degrees [0, 360) — the direction's world azimuth from north. */
  headingDeg: number;
  /** Latitude, degrees — asin of the direction's y. */
  latitudeDeg: number;
  /** 1 - |y| — 0 on a pole, 1 on the equator. */
  poleOffset: number;
  /** Dominant cardinal (N | E | S | W), from the heading quadrants. */
  dominantCardinal: 'N' | 'E' | 'S' | 'W';
}

/**
 * The shell's cardinal quadrants (v67 updatePoleState, verbatim):
 * N is [315, 360) + [0, 45), E is [45, 135), S is [135, 225),
 * W is [225, 315).
 */
export function cardinalForHeading(
  headingDeg: number,
): 'N' | 'E' | 'S' | 'W' {
  const h = ((headingDeg % 360) + 360) % 360;
  if (h < 45 || h >= 315) return 'N';
  if (h < 135) return 'E';
  if (h < 225) return 'S';
  return 'W';
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The demo compass for a direction — the shell's updatePoleState,
 * minus the camera. Returns null for a direction with no usable
 * heading (zero-length, non-finite) — the widget shows "no heading"
 * instead of inventing one.
 */
export function compassForDirection(dir: Vec3): CompassState | null {
  if (
    !dir ||
    !Number.isFinite(dir.x) ||
    !Number.isFinite(dir.y) ||
    !Number.isFinite(dir.z)
  ) {
    return null;
  }
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (!(len > 1e-9)) return null;
  const d: Vec3 = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

  // Nearest pole by dot product (strict `>` — ties keep the first
  // axis in WORLD_AXES order, exactly like the shell).
  let bestLabel = 'N';
  let bestDot = -2;
  for (const a of COMPASS_WORLD_AXES) {
    const s = d.x * a.vec.x + d.y * a.vec.y + d.z * a.vec.z;
    if (s > bestDot) {
      bestDot = s;
      bestLabel = a.label;
    }
  }
  const angleDeg =
    (Math.acos(clamp(bestDot, -1, 1)) * 180) / Math.PI;
  const alignment: CompassAlignment =
    angleDeg < COMPASS_LOCK_DEG
      ? 'LOCK'
      : angleDeg < COMPASS_NEAR_DEG
        ? 'NEAR'
        : 'OFFSET';
  // World azimuth from north (see the header: the shell's heading is
  // camera-frame; the TS layer has no camera).
  const headingDeg =
    ((Math.atan2(d.x, d.y) * 180) / Math.PI + 360) % 360;
  const latitudeDeg = (Math.asin(clamp(d.y, -1, 1)) * 180) / Math.PI;
  const poleOffset = 1 - Math.abs(clamp(d.y, -1, 1));
  return {
    label: bestLabel,
    dot: bestDot,
    angleDeg,
    alignment,
    headingDeg,
    latitudeDeg,
    poleOffset,
    dominantCardinal: cardinalForHeading(headingDeg),
  };
}

/**
 * The shell's compass-line format (v67 updatePoleState, verbatim):
 * `hdg=78.7° E  lat=1.1°  poleOff=0.980`.
 */
export function formatCompassLine(state: CompassState): string {
  return (
    `hdg=${state.headingDeg.toFixed(1)}° ${state.dominantCardinal}` +
    `  lat=${state.latitudeDeg.toFixed(1)}°` +
    `  poleOff=${state.poleOffset.toFixed(3)}`
  );
}
