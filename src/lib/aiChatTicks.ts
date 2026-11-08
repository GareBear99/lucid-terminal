/**
 * AI chat causal-tick channel — CHANNEL (2) (Gary, 2026-11-08
 * ~10:53 PST: "the AI chat's causal ticks are their OWN separate
 * SPSC channel").
 *
 * The LuciferAI bubbles' causal tick ordering runs on its OWN
 * bounded SPSC ring — NOT the event log's ring. Two distinct
 * channels, never merged:
 *   (1) THE EVENT LOG channel (src/stores/eventLogStore.ts,
 *       `eventRing`) — TRACKING + DIAGNOSIS events only: startup
 *       (the 3 TCC prompts, the file-explorer walk,
 *       initialization), permission prompts, and other events
 *       through the session, each with timestamp (when) +
 *       diagnosis (why).
 *   (2) THIS channel (`aiChatTickRing`) — the AI chat's causal
 *       TICKS: each time a bubble takes its ritual tick (its
 *       place in the causal order), the tick is issued here.
 *       The tick ordering channel belongs to the AI chat /
 *       LuciferAI bubbles, not to the event log.
 *
 * A tick NEVER enters the event log channel, and a diagnostic
 * event NEVER enters this ring. The event log has no tick event
 * type; this module never imports the event log. The two rings
 * are different instances with different capacities, owned by
 * different modules — a producer cannot write to the wrong one
 * by accident, and the separation is pinned by a test
 * (tests/aiChatTickChannel.test.ts).
 *
 * DISCIPLINE (same as module 1, ARC-SeedCatalog commit
 * 8b776fa): preallocated / bounded capacity, one producer
 * writes (the tick issuance in src/stores/aiStore.ts), one
 * consumer reads (the microtask drain below), backpressure
 * when full (never drop silently, never grow unboundedly),
 * FIFO order — the drain order IS the causal tick order.
 *
 * WHAT THIS IS, HONESTLY, IN JAVASCRIPT — the same caveat as
 * src/lib/spscRing.ts: the ring gives structural SPSC
 * discipline (bound, FIFO, backpressure), NOT cross-thread
 * lock-freedom (one thread) or blocking backpressure (the
 * producer cannot block the event loop). When the ring is
 * full, `issueAiChatTick` returns false and the refusal is
 * COUNTED (`aiChatTickRefusedCount`) — the tick itself is
 * NOT lost: it is already stamped on the message (the
 * message is the tick's durable home; the ring is the
 * bounded transport the tick passed through on its way to
 * the ordering). The consumer drains on a microtask after
 * each issue, so ticks genuinely transit the ring (a real
 * in-flight window, bounded by capacity) instead of being
 * recorded inline.
 *
 * The consumer's output is `recentTicks`: the last
 * AI_CHAT_TICK_RECENT_LIMIT ticks in FIFO (causal) order,
 * oldest first — the observable proof that ticks flowed
 * through in the order they were issued. It is a viewing
 * window, not storage: when it is full the oldest tick
 * falls off the window (the tick is still on its message).
 * This channel has NO UI in the event log — the event log
 * shows diagnostics only; the tick channel is the AI chat's
 * own, and it stays out of the event log UI.
 */
import { SpscRing } from './spscRing';
import type { ChatMessage } from '../types';

/** One tick a bubble took: its place in its chat's causal order. */
export interface AiChatTick {
  /** The chat the tick belongs to — ticks are per-chat, never global. */
  sessionId: string;
  /** The bubble (message) that took the tick. */
  messageId: string;
  /** The ritual tick — the causal-order counter, per chat. */
  tick: number;
  /** Wall-clock time the tick was issued. Display only — the
   *  tick is the ordering key, never the timestamp (same rule
   *  as the bubbles themselves). */
  at: number;
}

/** In-flight bound for the tick channel (cf. the event log's
 *  EVENT_RING_CAPACITY = 512 — a separate channel, a separate
 *  capacity; ticks are smaller and the drain runs per issue). */
export const AI_CHAT_TICK_RING_CAPACITY = 256;

/** How many drained ticks the recent window keeps. */
export const AI_CHAT_TICK_RECENT_LIMIT = 50;

/**
 * THE channel — one bounded SPSC ring for the AI chat's causal
 * ticks. Module-level (one AI chat, one tick channel), so
 * tests can observe it directly. A DIFFERENT instance from
 * the event log's `eventRing` — that is the separation.
 * Exported for tests; production code goes through
 * `issueAiChatTick` / the drain.
 */
export const aiChatTickRing = new SpscRing<AiChatTick>(AI_CHAT_TICK_RING_CAPACITY);

/** Ticks refused by ring backpressure (ring full). Counted,
 *  never silent. */
let refusedCount = 0;

/** The consumer's output: drained ticks in FIFO (causal)
 *  order, oldest first, capped at AI_CHAT_TICK_RECENT_LIMIT. */
let recentTicks: AiChatTick[] = [];

let drainScheduled = false;

/** Schedule the consumer drain on a microtask (once per
 *  burst — many issues in one synchronous block drain
 *  together). Falls back to setTimeout where queueMicrotask
 *  is unavailable. */
function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  const run = () => {
    drainScheduled = false;
    drainAiChatTicks();
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else setTimeout(run, 0);
}

/**
 * Producer: issue one causal tick into the channel — a bubble
 * just took this tick in this chat. Returns true when the ring
 * accepted it, or FALSE on backpressure (ring full — the tick
 * was refused, `refusedCount` went up, nothing was dropped
 * silently; the tick is still stamped on its message).
 */
export function issueAiChatTick(
  sessionId: string,
  messageId: string | undefined,
  tick: number,
): boolean {
  // A tick without its bubble is not a causal tick — refuse it
  // outright (the caller is told with false), rather than
  // recording a tick that cannot be attributed.
  if (messageId === undefined) return false;
  const record: AiChatTick = { sessionId, messageId, tick, at: Date.now() };
  if (!aiChatTickRing.enqueue(record)) {
    // Backpressure: do NOT drop silently. Count it and tell
    // the caller with false.
    refusedCount += 1;
    return false;
  }
  scheduleDrain();
  return true;
}

/**
 * Consumer (single): take one tick, FIFO order. Returns
 * undefined when the channel is empty.
 */
export function takeAiChatTick(): AiChatTick | undefined {
  return aiChatTickRing.dequeue();
}

/**
 * Consumer (all): drain every tick in the channel into the
 * recent window, FIFO order. Runs on a microtask after each
 * issue; call it directly when the ticks must be visible
 * right now (tests do). Returns the drained ticks, in the
 * order they were issued — that order IS the causal order.
 */
export function drainAiChatTicks(): AiChatTick[] {
  const drained = aiChatTickRing.drain();
  if (drained.length === 0) return drained;
  // FIFO (causal) order, oldest first, capped — the oldest
  // tick falls off the window when it is full (it is still
  // on its message; the window is a view, not storage).
  recentTicks = [...recentTicks, ...drained].slice(-AI_CHAT_TICK_RECENT_LIMIT);
  return drained;
}

/** The drained ticks, FIFO (causal) order, oldest first. A
 *  copy — the window itself is not handed out. */
export function getRecentAiChatTicks(): AiChatTick[] {
  return [...recentTicks];
}

/** Ticks refused by backpressure so far. */
export function aiChatTickRefusedCount(): number {
  return refusedCount;
}

/**
 * Publish the ticks a tick-assignment pass just issued: the
 * messages that were unticked before and carry a tick now.
 * The AI store calls this after `normalizeMessageList`
 * (chat load / chat switch) — the pure tick-assignment
 * function stays pure; the store is the producer that feeds
 * this channel. A null/undefined session id means the ticks
 * cannot be attributed to a chat — nothing is published
 * (a tick without its chat is not a causal tick).
 */
export function publishNewTicks(
  sessionId: string | null | undefined,
  before: ChatMessage[],
  after: ChatMessage[],
): void {
  if (!sessionId) return;
  const wasTicked = new Map(
    before.map((m) => [m.id, typeof m.ritualTick === 'number']),
  );
  for (const m of after) {
    if (!wasTicked.get(m.id) && typeof m.ritualTick === 'number') {
      issueAiChatTick(sessionId, m.id, m.ritualTick);
    }
  }
}

/** Empty the channel and its recent window, reset the refusal
 *  count. Test/support only — production never resets the
 *  channel (ticks are history). */
export function resetAiChatTickChannel(): void {
  aiChatTickRing.drain();
  recentTicks = [];
  refusedCount = 0;
  drainScheduled = false;
}
