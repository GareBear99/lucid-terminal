// @vitest-environment node
/**
 * Ring throughput — MEASURED, not asserted from a stored
 * number (2026-11-14, SPSC ring update).
 *
 * The rings have no rate — only a depth and cumulative
 * counters. A throughput is measured here, in a tight loop,
 * from the counters: how many enqueue+dequeue pairs (raw
 * ring), tick issues (tick channel), or log calls (event
 * channel) the code gets through per second on this machine.
 * The numbers are printed (vitest shows console output) and
 * the assertions are conservative floors with large headroom
 * over the measured values — a floor failing means the ring
 * genuinely got slower, not that the machine was busy.
 *
 * For reference, the VERIFIED numbers elsewhere (not asserted
 * here, not this ring): the Python Module 1 ring does
 * 1.49M/s tracked / 2.01M/s untracked on the VM, the full
 * bundle pipeline 12,388 entries/s, the C deca bench 28.7M
 * swaps/s aggregate / 130.8M/s single pair (VM). Gary's
 * recollection ("15k/s from a 1.8M run") is UNVERIFIED — it
 * appears nowhere in this file.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SpscRing } from '../src/lib/spscRing';
import { eventRing, useEventLogStore } from '../src/stores/eventLogStore';
import { EVENT_RING_CAPACITY } from '../src/lib/eventLog';
import {
  aiChatTickRing,
  AI_CHAT_TICK_RING_CAPACITY,
  aiChatTickCounts,
  drainAiChatTicks,
  issueAiChatTick,
  resetAiChatTickChannel,
} from '../src/lib/aiChatTicks';

/** Wall-clock seconds for a synchronous block. */
function timeIt(fn: () => void): number {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e9;
}

beforeEach(() => {
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
});

afterEach(() => {
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
});

describe('measured ring throughput (this machine, this run)', () => {
  it('raw ring: enqueue+dequeue pairs per second', () => {
    const ring = new SpscRing<number>(1024);
    const PAIRS = 1_000_000;
    const seconds = timeIt(() => {
      for (let i = 0; i < PAIRS; i++) {
        ring.enqueue(i);
        ring.dequeue();
      }
    });
    const perSec = PAIRS / seconds;
    console.log(
      `raw ring: ${(perSec / 1e6).toFixed(1)}M enqueue+dequeue pairs/s ` +
        `(${PAIRS.toLocaleString()} pairs in ${(seconds * 1000).toFixed(0)} ms)`,
    );
    // Exact counts under load — the measurement is only
    // meaningful if nothing was lost or refused.
    expect(ring.counts()).toEqual({ accepted: PAIRS, refused: 0, drained: PAIRS });
    expect(ring.length).toBe(0);
    expect(perSec).toBeGreaterThan(5_000_000);
  });

  it('tick channel: issues per second, issue → drain', () => {
    const TOTAL = 100_000;
    const CHUNK = 200;
    const seconds = timeIt(() => {
      let issued = 0;
      while (issued < TOTAL) {
        const n = Math.min(CHUNK, TOTAL - issued);
        for (let i = 0; i < n; i++) {
          if (!issueAiChatTick('s1', `m${issued + i}`, issued + i)) {
            throw new Error(`tick ${issued + i} refused — the channel filled mid-chunk`);
          }
        }
        issued += n;
        drainAiChatTicks();
      }
    });
    const perSec = TOTAL / seconds;
    console.log(
      `tick channel: ${(perSec / 1e3).toFixed(0)}K issues/s ` +
        `(${TOTAL.toLocaleString()} ticks in ${(seconds * 1000).toFixed(0)} ms)`,
    );
    expect(aiChatTickCounts()).toEqual({
      accepted: TOTAL,
      drained: TOTAL,
      refused: 0,
    });
    expect(aiChatTickRing.length).toBe(0);
    expect(perSec).toBeGreaterThan(400_000);
  });

  it('event channel: log calls per second, log → drain', () => {
    const TOTAL = 10_000;
    const CHUNK = 400;
    const log = useEventLogStore.getState();
    const seconds = timeIt(() => {
      let logged = 0;
      while (logged < TOTAL) {
        const n = Math.min(CHUNK, TOTAL - logged);
        for (let i = 0; i < n; i++) {
          if (log.logDirectoryRead(`/tmp/bench-${logged + i}`, 'completed') === null) {
            throw new Error(`event ${logged + i} refused — the channel filled mid-chunk`);
          }
        }
        logged += n;
        useEventLogStore.getState().drain();
      }
    });
    const perSec = TOTAL / seconds;
    console.log(
      `event channel: ${(perSec / 1e3).toFixed(1)}K log calls/s ` +
        `(${TOTAL.toLocaleString()} events in ${(seconds * 1000).toFixed(0)} ms)`,
    );
    const after = useEventLogStore.getState();
    expect(after.acceptedCount).toBe(TOTAL);
    expect(after.drainedCount).toBe(TOTAL);
    expect(after.refusedCount).toBe(0);
    expect(eventRing.length).toBe(0);
    expect(perSec).toBeGreaterThan(25_000);
  });

  it('refusal path: refused pushes per second into a full ring', () => {
    const ring = new SpscRing<number>(64);
    for (let i = 0; i < 64; i++) ring.enqueue(i);
    expect(ring.isFull).toBe(true);
    // 1,000,000 pushes, not 100,000: the loop itself is ~3 ms of CPU,
    // so one scheduler preemption (tens of ms on this 1.5-shared-CPU
    // cell) on a 100K window measured 1.9M/s against a 4M/s floor —
    // a flaky failure, not a slow ring. A 1M window dilutes that noise.
    const PUSHES = 1_000_000;
    // Count inside the loop — an expect() per push would
    // measure the assertion harness, not the ring.
    let refused = 0;
    const seconds = timeIt(() => {
      for (let i = 0; i < PUSHES; i++) {
        if (!ring.enqueue(i)) refused += 1;
      }
    });
    expect(refused).toBe(PUSHES);
    const perSec = PUSHES / seconds;
    console.log(
      `refusal path: ${(perSec / 1e6).toFixed(1)}M refused pushes/s ` +
        `(${PUSHES.toLocaleString()} refusals in ${(seconds * 1000).toFixed(0)} ms)`,
    );
    expect(ring.counts()).toEqual({ accepted: 64, refused: PUSHES, drained: 0 });
    expect(ring.length).toBe(64);
    expect(perSec).toBeGreaterThan(4_000_000);
  });

  it('the two channels’ capacities still bound their in-flight windows', () => {
    expect(aiChatTickRing.capacity).toBe(AI_CHAT_TICK_RING_CAPACITY);
    expect(eventRing.capacity).toBe(EVENT_RING_CAPACITY);
    expect(AI_CHAT_TICK_RING_CAPACITY).toBe(256);
    expect(EVENT_RING_CAPACITY).toBe(512);
  });
});
