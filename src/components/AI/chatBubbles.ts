/**
 * ChatGPT-style message bubble layout for the AI chat.
 *
 * User messages render as a bubble hugging the right edge of the chat area
 * (the "backwall"); assistant / system messages render as a flat full-width
 * row on the left with the Lucid avatar, ChatGPT-style. The input stays at
 * the bottom and the list scrolls with the newest message at the bottom.
 *
 * Timestamp continuity and ritual ticks live here too (pure functions,
 * unit-tested in tests/chatBubbles.test.ts without a React render
 * environment): every bubble carries its own wall-clock timestamp for
 * display, and a ritual tick for causal order. The rendered list is
 * always in ritual-tick order — a message retrieved late takes the next
 * tick and lands last, in between the bubbles in the order things
 * actually happened, never re-stamped with the render time. Timestamps
 * and ticks are different things and are kept distinct: the timestamp
 * says when, the tick says where in the causal order.
 *
 * Colours reuse the app's existing CSS variables — no new palette.
 */
import type { ChatMessage } from '../../types';

export type BubbleRole = ChatMessage['role'];

export interface BubbleLayout {
  /** Classes for the message row wrapper. */
  rowClass: string;
  /** True when the message renders as a filled bubble (user); false for the
   * flat left-aligned row (assistant / system). */
  isBubble: boolean;
  /** Classes for the bubble element. Only meaningful when isBubble is true. */
  bubbleClass: string;
  /** Alignment class for the timestamp line under the message. */
  timeAlignClass: string;
}

export function bubbleLayoutForRole(
  role: BubbleRole,
  opts?: { flatBubbles?: boolean },
): BubbleLayout {
  // SILENCED (Gary, 2026-11-08 ~06:41 PST): when the blood drop
  // is grey, the visual causal bubbles are removed from LuciferAI
  // inputs — a user message renders FLAT (no filled bubble, no
  // backwall), like the assistant's flat row, and the bubble
  // returns on un-silence. This is VISUAL only: the message
  // content, its timestamp and its ritual tick are unchanged, and
  // the tick counter is never reset or re-numbered — the bubble
  // chrome hides, the causal order does not move. Assistant and
  // system messages are already flat, so the option changes
  // nothing for them.
  if (opts?.flatBubbles && role === 'user') {
    return {
      rowClass: 'flex px-4 py-3',
      isBubble: false,
      bubbleClass: '',
      timeAlignClass: 'text-left',
    };
  }
  if (role === 'user') {
    return {
      rowClass: 'flex justify-end px-4 py-2',
      isBubble: true,
      bubbleClass:
        'max-w-[75%] rounded-2xl rounded-br-md bg-[var(--bg-tertiary)] px-4 py-2.5',
      timeAlignClass: 'text-right',
    };
  }
  // Assistant and system messages: flat full-width row on the left,
  // ChatGPT-style — the avatar marks the speaker, not a bubble.
  return {
    rowClass: 'flex gap-3 px-4 py-3',
    isBubble: false,
    bubbleClass: '',
    timeAlignClass: 'text-left',
  };
}

/** Short local time for a message timestamp, or '' when there is none. */
export function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Timestamps vs ritual ticks
// ---------------------------------------------------------------------------
//
// A timestamp and a ritual tick are two different things, kept distinct:
//
// * A TIMESTAMP is wall-clock time — when a message came into being
//   (send time for a user message, completion time for a streamed
//   reply). It is shown on the bubble (`formatMessageTime`) and it is
//   never the ordering key: clocks skew, messages arrive late, and two
//   messages can carry the same wall-clock time, so timestamps can
//   disagree with the order things actually happened.
// * A RITUAL TICK is the causal-order counter. It is a monotonically
//   increasing integer, per chat, assigned when a message is RETRIEVED
//   — loaded from the store, read for display, inserted into the
//   rendered list. Each retrieval advances the chat's counter and the
//   bubble takes the next tick, so ticks are assigned in retrieval
//   order and the tick sequence IS the causal order: a bubble's tick
//   says where it sits relative to the other bubbles, regardless of
//   what any wall clock said. A message that arrives late (an early
//   timestamp, retrieved now) takes the newest tick and lands last —
//   the causal order wins over the wall-clock order for the list,
//   while the timestamp it carries still shows its real time.
//
// The rendered list is always ordered by ritual tick (oldest tick at
// top, newest at bottom). The timestamp is display only. Sorting is
// stable: equal ticks fall back to timestamp, then insertion order.

/** The tick a message carries, or undefined when it has none yet. */
function messageTick(message: ChatMessage): number | undefined {
  return typeof message.ritualTick === 'number' ? message.ritualTick : undefined;
}

/**
 * The next ritual tick to assign in a list: one past the highest tick
 * already on it, or 0 when no message carries a tick yet. A tick is
 * never reused while its message is still in the list, so the counter
 * can never collide with a tick already on a bubble.
 */
export function nextTickFor(messages: ChatMessage[]): number {
  let max = -1;
  for (const m of messages) {
    const t = messageTick(m);
    if (t !== undefined && t > max) max = t;
  }
  return max + 1;
}

/**
 * Assign ritual ticks to the messages in a list that do not have one
 * yet, in the order they are presented — that order IS the retrieval
 * order. Ticks already on a message are never changed or re-assigned.
 * Returns a new array; the input is not mutated. `startTick` is the
 * tick the first unticked message takes; it defaults to one past the
 * highest tick already in the list.
 */
export function assignRitualTicks(
  messages: ChatMessage[],
  startTick?: number,
): ChatMessage[] {
  let next = startTick ?? nextTickFor(messages);
  return messages.map((m) => {
    if (messageTick(m) !== undefined) return m;
    const ticked = { ...m, ritualTick: next };
    next += 1;
    return ticked;
  });
}

/** Compare two messages in causal order: ritual tick first, then wall-clock timestamp, then position. */
function compareCausal(
  a: ChatMessage,
  b: ChatMessage,
  aIndex: number,
  bIndex: number,
): number {
  return (
    (a.ritualTick as number) - (b.ritualTick as number) ||
    messageTime(a) - messageTime(b) ||
    aIndex - bIndex
  );
}

/** The timestamp a message carries; missing timestamps mean "now". */
function messageTime(message: ChatMessage): number {
  return typeof message.timestamp === 'number' ? message.timestamp : Date.now();
}

/**
 * Stamp a message that is missing an id or a timestamp, without mutating
 * it. The id is derived from its timestamp and position so it is stable
 * for a given list; the timestamp falls back to now (the message arrived
 * now, so the end of the list is its honest position).
 */
function stampMessage(message: ChatMessage, index: number): ChatMessage {
  if (message.id && typeof message.timestamp === 'number') return message;
  const timestamp = messageTime(message);
  return {
    ...message,
    id: message.id ?? `msg-${timestamp}-${index}`,
    timestamp,
  };
}

/**
 * Normalize a message list into causal (ritual-tick) order: copy (never
 * mutate the input), stamp any message missing an id or timestamp, assign
 * ritual ticks to messages that do not have one yet — in the order they
 * are presented, which is the retrieval order, starting from
 * `startTick` (one past the highest tick already in the list when
 * omitted) — drop duplicates by id (first in tick order wins), and
 * stable-sort ascending by ritual tick. Idempotent — normalizing an
 * already-ordered list is a no-op apart from the copy, and ticks already
 * on a message are never re-assigned, so a switch between chats never
 * re-numbers a chat's bubbles.
 */
export function normalizeMessageList(
  messages: ChatMessage[],
  startTick?: number,
): ChatMessage[] {
  const stamped = messages.map((m, i) => ({ message: stampMessage(m, i), index: i }));
  // Assign ticks to the unticked in retrieval (input) order.
  const ticked = assignRitualTicks(
    stamped.map(({ message }) => message),
    startTick,
  );
  // Stable sort by (ritual tick, timestamp, original index).
  const indexed = ticked.map((message, i) => ({ message, index: stamped[i].index }));
  indexed.sort((a, b) => compareCausal(a.message, b.message, a.index, b.index));
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const { message } of indexed) {
    const id = message.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(message);
  }
  return out;
}

/**
 * Insert one message into an already-ordered list at its ritual-tick
 * position — in between the bubbles in causal order — instead of
 * appending it blindly at the end. A message retrieved now takes the
 * next tick (one past the highest tick in the list, or the explicit
 * `tick` when given), so a late arrival with an early wall-clock
 * timestamp still lands last: the causal order wins, and the timestamp
 * it carries is unchanged for display. A message that already carries
 * a ritual tick keeps it and is placed at that tick. Equal ticks go
 * after the existing messages with that tick (stable). Returns a new
 * array; the input is not mutated. The inserted message is stamped if
 * it lacks an id or timestamp.
 */
export function insertMessageInOrder(
  messages: ChatMessage[],
  message: ChatMessage,
  tick?: number,
): ChatMessage[] {
  const stamped = stampMessage(message, messages.length);
  const ritualTick = messageTick(stamped) ?? tick ?? nextTickFor(messages);
  const placed = { ...stamped, ritualTick };
  // Binary search for the first message strictly after the new one in
  // causal order (higher tick, or equal tick with a later timestamp).
  let lo = 0;
  let hi = messages.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midMsg = messages[mid];
    const midTick = messageTick(midMsg);
    if (
      midTick === undefined ||
      midTick < ritualTick ||
      (midTick === ritualTick && messageTime(midMsg) <= messageTime(placed))
    ) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const out = [...messages];
  out.splice(lo, 0, placed);
  return out;
}
