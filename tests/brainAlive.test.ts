/**
 * The brain-alive indicator —
 * the pure status rules + the check-status report.
 */
import { describe, it, expect } from 'vitest';
import {
  brainStatus,
  formatBrainStatusReport,
  BRAIN_ALIVE_WINDOW_MS,
} from '../src/lib/brainAlive';

const NOW = 1_000_000;

describe('brainStatus — the aliveness rule', () => {
  it('not-running with no success yet is "not started"', () => {
    const status = brainStatus('not-running', null, NOW);
    expect(status.kind).toBe('not-started');
    expect(status.label).toBe('Brain: not started');
    expect(status.aliveForSeconds).toBeNull();
  });

  it('ready with a recent success is alive, with the countdown', () => {
    const status = brainStatus('ready', NOW - 2000, NOW);
    expect(status.kind).toBe('ready');
    expect(status.label).toBe('Brain: ready');
    // 5s window, 2s elapsed → 3s of aliveness left.
    expect(status.aliveForSeconds).toBe(3);
    expect(status.detail).toContain('2s ago');
    expect(status.detail).toContain('3s more');
  });

  it('ready with a success exactly at the window edge is not responding', () => {
    const status = brainStatus('ready', NOW - BRAIN_ALIVE_WINDOW_MS, NOW);
    expect(status.kind).toBe('not-responding');
    expect(status.label).toBe('Brain: not responding');
  });

  it('ready but silent is not responding', () => {
    const status = brainStatus('ready', NOW - 60_000, NOW);
    expect(status.kind).toBe('not-responding');
    expect(status.detail).toContain('60s ago');
  });

  it('not-running after a success is not responding, not "not started"', () => {
    const status = brainStatus('not-running', NOW - 10_000, NOW);
    expect(status.kind).toBe('not-responding');
    expect(status.detail).toContain('10s ago');
  });

  it('uninstalled and unsupported are unavailable', () => {
    expect(brainStatus('uninstalled', null, NOW).kind).toBe('unavailable');
    expect(brainStatus('uninstalled', null, NOW).label).toBe('Brain: not installed');
    expect(brainStatus('unsupported', null, NOW).label).toBe('Brain: unsupported');
  });

  it('unreachable is not responding, with the last success when there is one', () => {
    const status = brainStatus('unreachable', NOW - 8000, NOW);
    expect(status.kind).toBe('not-responding');
    expect(status.detail).toContain('8s ago');
    expect(brainStatus('unreachable', null, NOW).detail).toContain('never completed');
  });
});

describe('formatBrainStatusReport — the check-status report', () => {
  it('reports state, version and last activity', () => {
    const report = formatBrainStatusReport({
      state: 'ready',
      transportName: 'in-process',
      version: '6.0.3',
      lastSuccessAt: NOW - 2000,
      lastError: null,
      now: NOW,
    });
    expect(report).toContain('Brain: ready');
    expect(report).toContain('state: ready (in-process)');
    expect(report).toContain('Version: 6.0.3 (TypeScript)');
    expect(report).toContain('Last success: 2s ago');
  });

  it('reports no success yet, and the last error when there is one', () => {
    const report = formatBrainStatusReport({
      state: 'unreachable',
      transportName: 'in-process',
      version: null,
      lastSuccessAt: null,
      lastError: { at: NOW - 5000, message: 'The engine is down' },
      now: NOW,
    });
    expect(report).toContain('Brain: not responding');
    expect(report).toContain('Version: unknown');
    expect(report).toContain('Last success: none yet');
    expect(report).toContain('Last error: 5s ago — The engine is down');
  });
});
