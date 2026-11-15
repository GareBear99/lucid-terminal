/**
 * Ring-stream rate math — the Memory tab's live tick-stream
 * view (Gary, 2026-11-14 ~15:11 PST: "so you can see the
 * stream ring live tick stream").
 *
 * The rings themselves have no rate — only a depth (in-flight
 * count), a capacity, and cumulative counters (accepted /
 * drained / refused). A rate is MEASURED here, from successive
 * reads of those counters: (count now − count then) / seconds
 * between reads. Nothing is hardcoded — Gary's recollection
 * ("15k/s from a 1.8M run") is unverified, so the view shows
 * whatever the counters actually measure, never a stored rate.
 *
 * Pure functions only — the sampling (reading the rings) lives
 * in the Memory tab, which owns the polling interval. That
 * keeps the math unit-testable without timers.
 */

/** One cumulative counter reading, with its wall-clock time. */
export interface RingCounterSample {
  /** Cumulative count at the sample time. */
  count: number;
  /** Wall-clock ms of the sample (Date.now()). */
  atMs: number;
}

/**
 * Per-second rate between two cumulative counter readings.
 * Returns 0 when the interval is zero/negative (no time
 * passed — nothing can be measured), when the count went
 * backwards (a reset — e.g. the log was cleared — is not a
 * negative rate), or when either reading is missing.
 * Counts only move forward between reads in normal operation;
 * a backwards count means the channel was reset, so the rate
 * restarts from zero instead of going negative.
 */
export function computeRatePerSec(
  prev: RingCounterSample | null | undefined,
  next: RingCounterSample | null | undefined,
): number {
  if (!prev || !next) return 0;
  const elapsedSec = (next.atMs - prev.atMs) / 1000;
  if (!(elapsedSec > 0)) return 0;
  const delta = next.count - prev.count;
  if (delta <= 0) return 0;
  return delta / elapsedSec;
}

/** Format a per-second rate for the view: one decimal, no
 *  fake precision — a measured rate, not a target. */
export function formatRatePerSec(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return '0.0/s';
  return `${rate.toFixed(1)}/s`;
}
