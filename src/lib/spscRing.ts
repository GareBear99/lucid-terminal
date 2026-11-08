/**
 * SPSC ring — a bounded single-producer single-consumer channel
 * (Gary, 2026-11-08 ~10:47 PST: "spsc the event log and
 * startup"). Same discipline as module 1, ARC-SeedCatalog's
 * SPSC ring (commit 8b776fa): preallocated / bounded capacity,
 * one producer writes, one consumer reads, backpressure when
 * full (never drop silently, never grow unboundedly), FIFO
 * order (causal tick order).
 *
 * WHAT THIS IS, HONESTLY, IN JAVASCRIPT:
 * - The ring is a preallocated circular buffer of exactly
 *   `capacity` usable slots (one extra slot is reserved
 *   internally so "full" and "empty" stay distinguishable —
 *   the capacity you ask for is the capacity you get).
 * - `head` is owned ONLY by the consumer (dequeue advances
 *   it); `tail` is owned ONLY by the producer (enqueue
 *   advances it). The size is DERIVED from head/tail, never
 *   a shared mutable counter — that is the SPSC structure.
 * - There is NO lock in the hot path, because there is no
 *   lock to need: the JavaScript event loop runs each
 *   enqueue/dequeue to completion (run-to-completion), so
 *   head/tail cannot be corrupted by a race. The SPSC
 *   discipline here is STRUCTURAL, not a concurrency
 *   primitive.
 * - What JavaScript does NOT give: cross-thread lock-freedom
 *   (there is only one thread — the ring is not shared across
 *   workers), and blocking backpressure (the producer cannot
 *   block the event loop waiting for space). When the ring is
 *   full, `enqueue` returns false and the caller is TOLD —
 *   the event is refused, counted, and surfaced, never
 *   dropped silently. The producer must handle the refusal
 *   (the event log counts it as `refusedCount`).
 * - THE GUARANTEE IS THE BOUND: the events in flight between
 *   producer and consumer can never exceed `capacity`. A
 *   runaway producer cannot pile events up without limit —
 *   the ring refuses past capacity instead of growing.
 *
 * Pure, no dependencies, unit-testable in Node.
 */
export class SpscRing<T> {
  /** Usable capacity — the most items the ring can hold. */
  readonly capacity: number;
  /** Preallocated once, never resized. One extra slot is
   *  reserved so full and empty stay distinguishable. */
  private readonly buffer: (T | undefined)[];
  /** Consumer-owned: the next slot to read. */
  private head = 0;
  /** Producer-owned: the next slot to write. */
  private tail = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`SpscRing capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity + 1).fill(undefined);
  }

  /** Events currently in flight (derived from head/tail). */
  get length(): number {
    return (this.tail - this.head + this.buffer.length) % this.buffer.length;
  }

  get isEmpty(): boolean {
    return this.head === this.tail;
  }

  get isFull(): boolean {
    return this.length === this.capacity;
  }

  /**
   * Producer: write one item. Returns true when accepted.
   * Returns FALSE (backpressure) when the ring is full — the
   * item is NOT stored and NOT dropped silently; the caller
   * is told and must handle the refusal.
   */
  enqueue(item: T): boolean {
    if (this.isFull) return false;
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.buffer.length;
    return true;
  }

  /**
   * Consumer: read one item, FIFO order. Returns undefined
   * when the ring is empty.
   */
  dequeue(): T | undefined {
    if (this.isEmpty) return undefined;
    const item = this.buffer[this.head];
    // Free the slot so the item can be collected and the
    // slot is reusable — the buffer never grows.
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.buffer.length;
    return item;
  }

  /** Consumer: read all available items, FIFO order. */
  drain(): T[] {
    const out: T[] = [];
    while (!this.isEmpty) {
      const item = this.dequeue();
      if (item !== undefined) out.push(item);
    }
    return out;
  }
}
