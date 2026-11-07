/**
 * Ping-server SP quota helpers (Gary, 2026-11-06).
 *
 * Two pieces of the SP story live here:
 *
 * 1. The RESTOCK TIMER. The worker refills SP on a schedule (the
 *    bucket: +25 SP every 4h while the balance is under 200, cap 200;
 *    +20 SP every 12h once it is 200 or more, cap 250). The /ping
 *    response carries `reset` — the next refill boundary — but NOT the
 *    server's `lastRefill` (the worker keeps it and never sends it).
 *    So the client derives a restock from the reset ADVANCING: a
 *    refill always moves `reset` forward (a stage change only happens
 *    through spending, never with a refill), so when a new quota's
 *    reset is later than the previous quota's reset, a restock
 *    happened, and the most recent restock is at
 *    `reset - period` (period from the stage the quota is in).
 *    `nextLastRestockAt` takes an optional `lastRefill` anyway and
 *    prefers it when provided — for a future worker change that
 *    exposes it. When no restock is detected the previous timer is
 *    kept (never reset to a stale value, never cleared to unknown).
 *
 * 2. The BASE-100 KNOWN STATE. A user who cannot reach the ping
 *    server carries a temp (daily-sync design), and through that
 *    temp their SP is KNOWN to be base 100 — the starting balance.
 *    So when Lucid learns the server is unreachable, the balance is
 *    base 100, not an error, not unknown, not a stale balance.
 *    `basePingQuota()` is that known state, and the restock timer is
 *    cleared with it (no server, no known restock — never show a
 *    stale timer from an older restock).
 *
 * The worker is NOT changed here. These are client-side only.
 */

import type { PingQuota } from '../types';

/** The starting SP balance — what a user has before any refill. */
export const SP_BASE_BALANCE = 100;

/** Stage 1: balance under 200 — +25 SP every 4h, cap 200. */
export const SP_STAGE1_LIMIT = 200;
export const SP_STAGE1_PERIOD_SECONDS = 4 * 3600;

/** Stage 2: balance 200 or more — +20 SP every 12h, cap 250. */
export const SP_STAGE2_LIMIT = 250;
export const SP_STAGE2_PERIOD_SECONDS = 12 * 3600;

/**
 * The SP balance when Lucid cannot reach the ping server. Base 100,
 * the starting balance — and that is the KNOWN state, not unknown.
 */
export function basePingQuota(): PingQuota {
  return {
    limit: SP_STAGE1_LIMIT,
    remaining: SP_BASE_BALANCE,
    reset: 0,
    reset_in_seconds: 0,
  };
}

/** The refill period for the stage a quota's limit sits in. */
export function restockPeriodSeconds(limit: number): number {
  return limit >= SP_STAGE2_LIMIT
    ? SP_STAGE2_PERIOD_SECONDS
    : SP_STAGE1_PERIOD_SECONDS;
}

/**
 * Work out the new "last restock" time (unix ms) from an old quota and
 * a new one. `prevLastRestockAt` is the timer's current value (null
 * when it is not known yet) and is kept whenever no restock is
 * detected, so the timer is never reset to a stale value.
 *
 * - `lastRefill` (unix seconds, the server's own record) is
 *   authoritative when provided — the worker does not send it today,
 *   so this is the path for a future worker change.
 * - Otherwise, when the new quota's `reset` is LATER than the old
 *   quota's `reset`, a restock happened: the most recent restock is
 *   at `reset - period` (the last refill boundary consumed).
 * - A first quota (no previous) tells us nothing about the last
 *   restock, so the timer stays unknown until a restock is seen.
 */
export function nextLastRestockAt(
  prev: PingQuota | null,
  next: PingQuota,
  prevLastRestockAt: number | null,
  lastRefill?: number | null,
): number | null {
  if (typeof lastRefill === 'number' && Number.isFinite(lastRefill)) {
    return lastRefill * 1000;
  }
  if (prev && next.reset > prev.reset) {
    return (next.reset - restockPeriodSeconds(next.limit)) * 1000;
  }
  return prevLastRestockAt;
}

/**
 * "Xm ago" for the restock timer. Null when the last restock is
 * unknown (no timer is shown then, rather than a stale one).
 */
export function formatTimeSinceRestock(
  lastRestockAt: number | null,
  nowMs: number = Date.now(),
): string | null {
  if (lastRestockAt == null) return null;
  const seconds = Math.max(0, Math.floor((nowMs - lastRestockAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h ago` : `${hours}h ${rest}m ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Does this error string look like the ping server being unreachable
 * (a network failure), rather than the server answering with an
 * error? Used so a chat failure that never reached the server puts
 * the SP balance into the base-100 KNOWN state instead of leaving a
 * stale one on screen.
 */
export function isPingUnreachableError(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  return /fetch failed|failed to fetch|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|offline|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|socket hang up/i.test(
    message,
  );
}
