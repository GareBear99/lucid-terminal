/**
 * Ring rate math tests (Memory tab tick stream, 2026-11-14).
 *
 * The tick stream shows MEASURED live rates, never a hardcoded
 * number — so the rate math and the counters it reads from are
 * tested here. Gary's recollected "15k/s from a 1.8M run" is
 * unverified and appears nowhere in this file.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  computeRatePerSec,
  formatRatePerSec,
  type RingCounterSample,
} from '../src/lib/ringStats';
import {
  aiChatTickCounts,
  issueAiChatTick,
  resetAiChatTickChannel,
} from '../src/lib/aiChatTicks';

const sample = (count: number, atMs: number): RingCounterSample => ({ count, atMs });

describe('computeRatePerSec', () => {
  test('counts over elapsed time', () => {
    expect(computeRatePerSec(sample(100, 0), sample(150, 1000))).toBe(50);
    expect(computeRatePerSec(sample(100, 0), sample(101, 1000))).toBe(1);
    expect(computeRatePerSec(sample(0, 0), sample(0, 1000))).toBe(0);
  });

  test('zero or negative intervals, backwards counts and missing samples are 0', () => {
    expect(computeRatePerSec(sample(100, 1000), sample(150, 1000))).toBe(0);
    expect(computeRatePerSec(sample(100, 1000), sample(150, 0))).toBe(0);
    expect(computeRatePerSec(sample(100, 0), sample(90, 1000))).toBe(0);
    expect(computeRatePerSec(null, sample(150, 1000))).toBe(0);
    expect(computeRatePerSec(sample(100, 0), null)).toBe(0);
    expect(computeRatePerSec(undefined, undefined)).toBe(0);
  });
});

describe('formatRatePerSec', () => {
  test('one decimal, /s suffix; garbage reads as 0.0/s', () => {
    expect(formatRatePerSec(12.34)).toBe('12.3/s');
    expect(formatRatePerSec(0)).toBe('0.0/s');
    expect(formatRatePerSec(15000)).toBe('15000.0/s');
    expect(formatRatePerSec(NaN)).toBe('0.0/s');
    expect(formatRatePerSec(-5)).toBe('0.0/s');
  });
});

describe('aiChatTickCounts — the counters the tick stream reads', () => {
  beforeEach(() => {
    resetAiChatTickChannel();
  });

  test('a few ticks: accepted and drained match, nothing refused', async () => {
    issueAiChatTick('chat-1', 'm1', 1);
    issueAiChatTick('chat-1', 'm2', 2);
    await Promise.resolve();
    // The drain is scheduled on a microtask; after it flushes,
    // the counts line up.
    expect(aiChatTickCounts().accepted).toBe(2);
    expect(aiChatTickCounts().refused).toBe(0);
    expect(aiChatTickCounts().drained).toBe(2);
  });

  test('a burst past the 256-slot ring is refused, not silently dropped', () => {
    // No microtask runs inside this synchronous loop, so the
    // drain cannot free slots — the ring overflows and the
    // refusals are counted.
    for (let i = 0; i < 300; i += 1) {
      issueAiChatTick('chat-1', `m${i}`, i);
    }
    const counts = aiChatTickCounts();
    expect(counts.accepted).toBe(256);
    expect(counts.refused).toBe(44);
    expect(counts.drained).toBe(0);
  });
});

describe('event log ring counters', () => {
  // eventLogStore is an electron-renderer store; the tick stream
  // reads its acceptedCount/drainedCount through useEventLogStore.
  // The store module is imported lazily so this node test only
  // asserts the counters exist and move — the component-level
  // test (memoryTab) asserts they render.
  test('the store exposes the counters the tick stream needs', async () => {
    const { useEventLogStore } = await import('../src/stores/eventLogStore');
    const { createEvent } = await import('../src/lib/eventLog');
    useEventLogStore.getState().clear();
    const state = useEventLogStore.getState();
    expect(state.acceptedCount).toBe(0);
    expect(state.drainedCount).toBe(0);
    state.log(createEvent({ phase: 'throughout', type: 'file.directory-read', what: 'one' }));
    state.log(createEvent({ phase: 'throughout', type: 'file.directory-read', what: 'two' }));
    expect(useEventLogStore.getState().acceptedCount).toBe(2);
    useEventLogStore.getState().drain();
    expect(useEventLogStore.getState().drainedCount).toBe(2);
    useEventLogStore.getState().clear();
    expect(useEventLogStore.getState().acceptedCount).toBe(0);
    expect(useEventLogStore.getState().drainedCount).toBe(0);
  });
});
