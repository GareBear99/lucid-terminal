// @vitest-environment node
/**
 * SPSC ring tests (Gary, 2026-11-08 ~10:47 PST: "spsc the
 * event log and startup"). The ring is the bounded channel
 * carrying events from their sources to the log store: one
 * producer writes, one consumer reads, capacity is fixed and
 * preallocated, FIFO order is preserved (causal tick order),
 * and a full ring refuses the producer (backpressure) instead
 * of growing or dropping silently.
 *
 * These tests pin the bound: a producer CANNOT pile events up
 * past capacity.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { SpscRing } from '../src/lib/spscRing';

describe('SpscRing — the bound', () => {
  it('refuses the producer past capacity — events cannot pile up', () => {
    const ring = new SpscRing<number>(3);
    expect(ring.capacity).toBe(3);
    expect(ring.enqueue(1)).toBe(true);
    expect(ring.enqueue(2)).toBe(true);
    expect(ring.enqueue(3)).toBe(true);
    expect(ring.length).toBe(3);
    expect(ring.isFull).toBe(true);
    // The fourth event is REFUSED (backpressure) — not stored,
    // not dropped silently (the caller is told: false).
    expect(ring.enqueue(4)).toBe(false);
    expect(ring.length).toBe(3);
    // Still refused — the bound holds no matter how many times
    // the producer tries.
    expect(ring.enqueue(5)).toBe(false);
    expect(ring.enqueue(6)).toBe(false);
    expect(ring.length).toBe(3);
  });

  it('frees a slot on dequeue, so the producer can write again', () => {
    const ring = new SpscRing<number>(2);
    expect(ring.enqueue(1)).toBe(true);
    expect(ring.enqueue(2)).toBe(true);
    expect(ring.enqueue(3)).toBe(false);
    expect(ring.dequeue()).toBe(1);
    expect(ring.isFull).toBe(false);
    expect(ring.enqueue(3)).toBe(true);
    expect(ring.length).toBe(2);
  });

  it('preserves FIFO order — causal tick order', () => {
    const ring = new SpscRing<string>(4);
    ring.enqueue('first');
    ring.enqueue('second');
    ring.enqueue('third');
    expect(ring.dequeue()).toBe('first');
    expect(ring.dequeue()).toBe('second');
    ring.enqueue('fourth');
    ring.enqueue('fifth');
    expect(ring.drain()).toEqual(['third', 'fourth', 'fifth']);
    expect(ring.isEmpty).toBe(true);
  });

  it('wraps around the ring without growing it', () => {
    const ring = new SpscRing<number>(2);
    for (let i = 0; i < 10; i++) {
      expect(ring.enqueue(i)).toBe(true);
      expect(ring.dequeue()).toBe(i);
    }
    expect(ring.length).toBe(0);
    expect(ring.isEmpty).toBe(true);
    // Still exactly capacity after many laps — never resized.
    expect(ring.capacity).toBe(2);
  });

  it('drain returns everything in FIFO order and empties the ring', () => {
    const ring = new SpscRing<number>(5);
    ring.enqueue(10);
    ring.enqueue(20);
    ring.enqueue(30);
    expect(ring.drain()).toEqual([10, 20, 30]);
    expect(ring.length).toBe(0);
    expect(ring.dequeue()).toBeUndefined();
  });

  it('dequeue on an empty ring returns undefined', () => {
    const ring = new SpscRing<number>(2);
    expect(ring.isEmpty).toBe(true);
    expect(ring.dequeue()).toBeUndefined();
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new SpscRing<number>(0)).toThrow();
    expect(() => new SpscRing<number>(-1)).toThrow();
    expect(() => new SpscRing<number>(1.5)).toThrow();
  });
});
