/**
 * Blink scheduling for the Sentinel face's eyes.
 *
 * The face blinks every once in a while — on a random interval, not a
 * metronome — usually once, sometimes twice in quick succession. Rarely
 * a blink is offset: one eye leads and the other follows a short delay
 * later, and the offset can go either way (left first or right first).
 *
 * Pure functions with an injectable randomness source so tests can drive
 * them deterministically; the component passes Math.random in production.
 */

/** Delay between blink events: 3–8s, irregular so it feels alive. */
export const BLINK_MIN_DELAY_MS = 3000;
export const BLINK_MAX_DELAY_MS = 8000;

/** How long the eyes stay closed during one blink. */
export const BLINK_CLOSED_MS = 120;

/** Gap between the two blinks of a double blink. */
export const DOUBLE_BLINK_GAP_MS = 180;

/** Chance a blink event is a double blink (two quick blinks). */
export const DOUBLE_BLINK_CHANCE = 0.25;

/** Chance a blink event is offset (one eye lags the other). */
export const OFFSET_BLINK_CHANCE = 0.12;

/** Offset lag between the two eyes: 60–150ms. */
export const OFFSET_MIN_DELAY_MS = 60;
export const OFFSET_MAX_DELAY_MS = 150;

export type BlinkOffsetSide = 'left' | 'right';

/** Random delay until the next blink event, in [3000, 8000] ms. */
export function nextBlinkDelayMs(rand: () => number = Math.random): number {
  return BLINK_MIN_DELAY_MS + rand() * (BLINK_MAX_DELAY_MS - BLINK_MIN_DELAY_MS);
}

/** True when this blink event should be a double blink (~25%). */
export function isDoubleBlink(rand: () => number = Math.random): boolean {
  return rand() < DOUBLE_BLINK_CHANCE;
}

/** True when this blink event should be offset (~12%). */
export function isOffsetBlink(rand: () => number = Math.random): boolean {
  return rand() < OFFSET_BLINK_CHANCE;
}

/** Which eye leads an offset blink — either way, 50/50. */
export function offsetDirection(rand: () => number = Math.random): BlinkOffsetSide {
  return rand() < 0.5 ? 'left' : 'right';
}

/** Lag of the trailing eye in an offset blink, in [60, 150] ms. */
export function offsetDelayMs(rand: () => number = Math.random): number {
  return OFFSET_MIN_DELAY_MS + rand() * (OFFSET_MAX_DELAY_MS - OFFSET_MIN_DELAY_MS);
}
