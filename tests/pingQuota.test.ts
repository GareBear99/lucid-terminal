/**
 * Ping-quota helpers (Gary, 2026-11-06).
 *
 * The restock timer resets when a restock happens — detected from the
 * quota's `reset` advancing (the worker never sends its `lastRefill`,
 * so the client derives the most recent restock as `reset - period`).
 * And when Lucid cannot reach the ping server, the SP balance is the
 * KNOWN base 100, not an error, not unknown, not a stale balance.
 */

import { describe, it, expect } from 'vitest';
import {
  SP_BASE_BALANCE,
  SP_STAGE1_LIMIT,
  SP_STAGE1_PERIOD_SECONDS,
  SP_STAGE2_LIMIT,
  SP_STAGE2_PERIOD_SECONDS,
  basePingQuota,
  restockPeriodSeconds,
  nextLastRestockAt,
  formatTimeSinceRestock,
  isPingUnreachableError,
} from '../src/lib/pingQuota';
import type { PingQuota } from '../src/types';

const quota = (limit: number, remaining: number, reset: number): PingQuota => ({
  limit,
  remaining,
  reset,
  reset_in_seconds: 0,
});

describe('basePingQuota — server not connected is base 100 and KNOWN', () => {
  it('is base 100, stage-1 limit, no reset', () => {
    expect(basePingQuota()).toEqual({
      limit: 200,
      remaining: 100,
      reset: 0,
      reset_in_seconds: 0,
    });
    expect(SP_BASE_BALANCE).toBe(100);
    expect(SP_STAGE1_LIMIT).toBe(200);
  });
});

describe('restockPeriodSeconds', () => {
  it('stage 1 (limit 200) refills every 4h; stage 2 (limit 250) every 12h', () => {
    expect(restockPeriodSeconds(200)).toBe(4 * 3600);
    expect(restockPeriodSeconds(250)).toBe(12 * 3600);
    expect(restockPeriodSeconds(100)).toBe(4 * 3600);
  });

  it('the constants match the worker bucket (4h / 12h)', () => {
    expect(SP_STAGE1_PERIOD_SECONDS).toBe(4 * 3600);
    expect(SP_STAGE2_PERIOD_SECONDS).toBe(12 * 3600);
    expect(SP_STAGE2_LIMIT).toBe(250);
  });
});

describe('nextLastRestockAt — the restock timer resets on a restock, never to a stale value', () => {
  it('a reset advance means a restock: the most recent restock is reset - period', () => {
    // Stage 1: prev reset 1000, next reset 1000 + 4h — a refill
    // happened, and the last refill boundary consumed is 1000.
    const prev = quota(200, 100, 1000);
    const next = quota(200, 125, 1000 + 4 * 3600);
    expect(nextLastRestockAt(prev, next, null)).toBe(1000 * 1000);
  });

  it('a stage-2 reset advance uses the 12h period', () => {
    const prev = quota(250, 200, 2000);
    const next = quota(250, 220, 2000 + 12 * 3600);
    expect(nextLastRestockAt(prev, next, null)).toBe(2000 * 1000);
  });

  it('no reset advance means no restock: the previous timer is kept (never reset to stale)', () => {
    const prev = quota(200, 100, 1000);
    const next = quota(200, 99, 1000);
    expect(nextLastRestockAt(prev, next, 500_000)).toBe(500_000);
    expect(nextLastRestockAt(prev, next, null)).toBeNull();
  });

  it('a first quota tells us nothing about the last restock', () => {
    expect(nextLastRestockAt(null, quota(200, 100, 1000), null)).toBeNull();
  });

  it('a server lastRefill wins when provided (the future worker path)', () => {
    const prev = quota(200, 100, 1000);
    const next = quota(200, 125, 1000 + 4 * 3600);
    expect(nextLastRestockAt(prev, next, 500_000, 1234)).toBe(1234 * 1000);
  });
});

describe('formatTimeSinceRestock', () => {
  const NOW = 1_000_000_000;

  it('unknown stays unknown — no stale timer is shown', () => {
    expect(formatTimeSinceRestock(null, NOW)).toBeNull();
  });

  it('formats just now / minutes / hours / days', () => {
    expect(formatTimeSinceRestock(NOW, NOW)).toBe('just now');
    expect(formatTimeSinceRestock(NOW - 30_000, NOW)).toBe('just now');
    expect(formatTimeSinceRestock(NOW - 90_000, NOW)).toBe('1m ago');
    expect(formatTimeSinceRestock(NOW - 45 * 60_000, NOW)).toBe('45m ago');
    expect(formatTimeSinceRestock(NOW - 90 * 60_000, NOW)).toBe('1h 30m ago');
    expect(formatTimeSinceRestock(NOW - 2 * 3_600_000, NOW)).toBe('2h ago');
    expect(formatTimeSinceRestock(NOW - 26 * 3_600_000, NOW)).toBe('1d ago');
  });
});

describe('isPingUnreachableError', () => {
  it('matches network failures (the server was never reached)', () => {
    expect(isPingUnreachableError('fetch failed')).toBe(true);
    expect(isPingUnreachableError('Failed to fetch')).toBe(true);
    expect(isPingUnreachableError('NetworkError when attempting to fetch resource.')).toBe(true);
    expect(isPingUnreachableError('connect ECONNREFUSED 127.0.0.1:443')).toBe(true);
    expect(isPingUnreachableError('getaddrinfo ENOTFOUND lucid-ping-server.admension.workers.dev')).toBe(true);
    expect(isPingUnreachableError('socket hang up')).toBe(true);
  });

  it('does NOT match a server that answered with an error, or other backends', () => {
    expect(isPingUnreachableError('Ping server error: 429')).toBe(false);
    expect(isPingUnreachableError('Ping server error: 500')).toBe(false);
    expect(isPingUnreachableError('OpenAI error: 401')).toBe(false);
    expect(isPingUnreachableError('')).toBe(false);
    expect(isPingUnreachableError(null)).toBe(false);
  });
});
