// @vitest-environment node
/**
 * Ring hardening tests (2026-11-14, SPSC ring update):
 * - The ring counts every accept / refusal / drain itself
 *   (counts by construction) — the channels surface the
 *   ring's counts, they don't keep their own, so no wrapper
 *   can forget to count a refusal.
 * - The event channel records WHICH producer (event type)
 *   was refused, so a flooded producer is visible in the
 *   tick-stream view instead of hiding behind the channel
 *   total.
 * - Per-channel isolation under flood: one flooded channel
 *   cannot stall the other, and a flooding producer never
 *   blocks — it is refused, counted, and the loop completes.
 * - The overflow policy is refuse + count + tell the caller,
 *   never block, never drop silently.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SpscRing } from '../src/lib/spscRing';
import { eventRing, useEventLogStore } from '../src/stores/eventLogStore';
import { EVENT_RING_CAPACITY, createEvent } from '../src/lib/eventLog';
import {
  aiChatTickRing,
  AI_CHAT_TICK_RING_CAPACITY,
  aiChatTickCounts,
  drainAiChatTicks,
  issueAiChatTick,
  resetAiChatTickChannel,
} from '../src/lib/aiChatTicks';

beforeEach(() => {
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
});

afterEach(() => {
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
});

describe('the ring counts every accept / refusal / drain itself', () => {
  it('counts() is the single source of truth, reset by resetCounts()', () => {
    const ring = new SpscRing<number>(3);
    expect(ring.counts()).toEqual({ accepted: 0, refused: 0, drained: 0 });
    expect(ring.enqueue(1)).toBe(true);
    expect(ring.enqueue(2)).toBe(true);
    expect(ring.enqueue(3)).toBe(true);
    expect(ring.enqueue(4)).toBe(false);
    expect(ring.enqueue(5)).toBe(false);
    expect(ring.counts()).toEqual({ accepted: 3, refused: 2, drained: 0 });
    expect(ring.dequeue()).toBe(1);
    expect(ring.counts()).toEqual({ accepted: 3, refused: 2, drained: 1 });
    expect(ring.drain()).toEqual([2, 3]);
    expect(ring.counts()).toEqual({ accepted: 3, refused: 2, drained: 3 });
    // Reset zeroes the counts — and only the counts: an item
    // still in flight stays in flight.
    ring.enqueue(9);
    ring.resetCounts();
    expect(ring.counts()).toEqual({ accepted: 0, refused: 0, drained: 0 });
    expect(ring.length).toBe(1);
    expect(ring.dequeue()).toBe(9);
  });

  it('the tick channel surfaces the ring’s counts, it keeps none of its own', () => {
    for (let i = 0; i < AI_CHAT_TICK_RING_CAPACITY; i++) {
      expect(issueAiChatTick('s1', `m${i}`, i)).toBe(true);
    }
    expect(issueAiChatTick('s1', 'overflow-1', 256)).toBe(false);
    expect(issueAiChatTick('s1', 'overflow-2', 257)).toBe(false);
    expect(aiChatTickCounts()).toEqual({
      accepted: AI_CHAT_TICK_RING_CAPACITY,
      drained: 0,
      refused: 2,
    });
    expect(aiChatTickRing.counts()).toEqual({
      accepted: AI_CHAT_TICK_RING_CAPACITY,
      refused: 2,
      drained: 0,
    });
    const drained = drainAiChatTicks();
    expect(drained).toHaveLength(AI_CHAT_TICK_RING_CAPACITY);
    expect(aiChatTickCounts()).toEqual({
      accepted: AI_CHAT_TICK_RING_CAPACITY,
      drained: AI_CHAT_TICK_RING_CAPACITY,
      refused: 2,
    });
    resetAiChatTickChannel();
    expect(aiChatTickCounts()).toEqual({ accepted: 0, drained: 0, refused: 0 });
    expect(aiChatTickRing.counts()).toEqual({ accepted: 0, refused: 0, drained: 0 });
  });

  it('the store’s counters mirror the ring, and clear() resets both', () => {
    const log = useEventLogStore.getState();
    expect(log.logDirectoryRead('/tmp/a', 'completed')).not.toBeNull();
    expect(log.logDirectoryRead('/tmp/b', 'completed')).not.toBeNull();
    useEventLogStore.getState().drain();
    const after = useEventLogStore.getState();
    expect(after.acceptedCount).toBe(2);
    expect(after.drainedCount).toBe(2);
    expect(after.refusedCount).toBe(0);
    expect(eventRing.counts()).toEqual({ accepted: 2, refused: 0, drained: 2 });
    useEventLogStore.getState().clear();
    const cleared = useEventLogStore.getState();
    expect(cleared.acceptedCount).toBe(0);
    expect(cleared.drainedCount).toBe(0);
    expect(cleared.refusedCount).toBe(0);
    expect(eventRing.counts()).toEqual({ accepted: 0, refused: 0, drained: 0 });
  });
});

describe('the event channel records WHICH producer was refused', () => {
  it('refusedByType counts refusals per event type, and clear() resets it', () => {
    // Fill the one shared ring to capacity WITHOUT draining
    // (enqueue directly — the store would schedule a drain,
    // so the fill goes through the ring itself).
    for (let i = 0; i < EVENT_RING_CAPACITY; i++) {
      expect(
        eventRing.enqueue(
          createEvent({
            phase: 'throughout',
            type: 'file.directory-read',
            what: `fill ${i}`,
            at: 1000 + i,
          }),
        ),
      ).toBe(true);
    }
    const log = useEventLogStore.getState();
    expect(log.logDirectoryRead('/tmp/overflow-1', 'completed')).toBeNull();
    expect(log.logDirectoryRead('/tmp/overflow-2', 'completed')).toBeNull();
    expect(log.logPermissionRequest('microphone', 'granted')).toBeNull();
    const after = useEventLogStore.getState();
    expect(after.refusedCount).toBe(3);
    expect(after.refusedByType).toEqual({
      'file.directory-read': 2,
      'permission.prompt': 1,
    });
    // The refused events never reached the visible log.
    useEventLogStore.getState().drain();
    const events = useEventLogStore.getState().events;
    expect(events.find((e) => e.what.includes('overflow'))).toBeUndefined();
    // The drain moved the fill into the log — the store's
    // drained count mirrors the ring's, including the fill
    // that bypassed the store's own enqueue.
    expect(useEventLogStore.getState().drainedCount).toBe(EVENT_RING_CAPACITY);
    useEventLogStore.getState().clear();
    expect(useEventLogStore.getState().refusedByType).toEqual({});
    expect(useEventLogStore.getState().refusedCount).toBe(0);
  });
});

describe('per-channel isolation under flood', () => {
  it('a flooded event channel cannot stall the tick channel', () => {
    // Fill the event ring through the store (the microtask
    // drain is deferred inside this synchronous block, so
    // the ring genuinely fills).
    const log = useEventLogStore.getState();
    for (let i = 0; i < EVENT_RING_CAPACITY; i++) {
      expect(log.logDirectoryRead(`/tmp/fill-${i}`, 'completed')).not.toBeNull();
    }
    expect(eventRing.isFull).toBe(true);
    // The tick channel is untouched — still accepts, still drains.
    expect(issueAiChatTick('s1', 'm1', 0)).toBe(true);
    expect(aiChatTickRing.length).toBe(1);
    expect(drainAiChatTicks()).toHaveLength(1);
    expect(aiChatTickCounts()).toEqual({ accepted: 1, drained: 1, refused: 0 });
    // And the event channel is still full — the tick did not free it.
    expect(eventRing.length).toBe(EVENT_RING_CAPACITY);
  });

  it('a flooded tick channel cannot stall the event channel', () => {
    for (let i = 0; i < AI_CHAT_TICK_RING_CAPACITY; i++) {
      expect(issueAiChatTick('s1', `m${i}`, i)).toBe(true);
    }
    expect(aiChatTickRing.isFull).toBe(true);
    // The event channel is untouched — still accepts, still drains.
    const e = useEventLogStore.getState().logUnexpectedAsk('still room in the event log');
    expect(e).not.toBeNull();
    expect(eventRing.length).toBe(1);
    useEventLogStore.getState().drain();
    expect(useEventLogStore.getState().events).toHaveLength(1);
    expect(useEventLogStore.getState().acceptedCount).toBe(1);
    // And the tick channel is still full — the event did not free it.
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);
  });
});

describe('a flooding producer never blocks — it is refused and counted', () => {
  it('10,000 event pushes into a full ring all return, all counted', () => {
    const log = useEventLogStore.getState();
    for (let i = 0; i < EVENT_RING_CAPACITY; i++) {
      expect(log.logDirectoryRead(`/tmp/fill-${i}`, 'completed')).not.toBeNull();
    }
    expect(eventRing.isFull).toBe(true);
    // The flood: 10,000 pushes, each refused. The loop
    // completing IS the proof the producer never blocked.
    let refused = 0;
    for (let i = 0; i < 10000; i++) {
      if (log.logDirectoryRead(`/tmp/flood-${i}`, 'completed') === null) refused += 1;
    }
    expect(refused).toBe(10000);
    const after = useEventLogStore.getState();
    expect(after.refusedCount).toBe(10000);
    expect(after.acceptedCount).toBe(EVENT_RING_CAPACITY);
    expect(after.refusedByType).toEqual({ 'file.directory-read': 10000 });
    expect(eventRing.length).toBe(EVENT_RING_CAPACITY);
    expect(eventRing.counts().refused).toBe(10000);
  });

  it('10,000 tick pushes into a full ring all return, all counted', () => {
    for (let i = 0; i < AI_CHAT_TICK_RING_CAPACITY; i++) {
      expect(issueAiChatTick('s1', `m${i}`, i)).toBe(true);
    }
    expect(aiChatTickRing.isFull).toBe(true);
    let refused = 0;
    for (let i = 0; i < 10000; i++) {
      if (!issueAiChatTick('s1', `flood-${i}`, 1000 + i)) refused += 1;
    }
    expect(refused).toBe(10000);
    expect(aiChatTickCounts()).toEqual({
      accepted: AI_CHAT_TICK_RING_CAPACITY,
      drained: 0,
      refused: 10000,
    });
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);
  });
});
