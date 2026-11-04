/**
 * Chat bubble layout tests.
 *
 * ChatGPT-style bubbles in AIChat: user messages are a bubble hugging the
 * right edge (the "backwall"); assistant / system messages are a flat
 * full-width row on the left. The layout lives in the pure helper
 * `src/components/AI/chatBubbles.ts` so it can be tested here without a
 * React render environment (no @testing-library in this repo).
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  bubbleLayoutForRole,
  formatMessageTime,
  normalizeMessageList,
  insertMessageInOrder,
  nextTickFor,
  assignRitualTicks,
} from '../src/components/AI/chatBubbles';
import type { ChatMessage } from '../src/types';

const msg = (id: string, timestamp: number, content = 'x'): ChatMessage => ({
  id,
  role: 'user',
  content,
  timestamp,
});

describe('bubbleLayoutForRole', () => {
  it('user messages are a right-aligned bubble against the backwall', () => {
    const layout = bubbleLayoutForRole('user');
    expect(layout.isBubble).toBe(true);
    expect(layout.rowClass).toContain('justify-end');
    expect(layout.rowClass).not.toContain('gap-3');
    expect(layout.bubbleClass).toContain('rounded-2xl');
    expect(layout.bubbleClass).toContain('bg-[var(--bg-tertiary)]');
    // The bubble must not stretch full-width: it hugs the right edge.
    expect(layout.bubbleClass).toContain('max-w-[75%]');
    expect(layout.timeAlignClass).toBe('text-right');
  });

  it('assistant messages are a flat left-aligned row, not a bubble', () => {
    const layout = bubbleLayoutForRole('assistant');
    expect(layout.isBubble).toBe(false);
    expect(layout.rowClass).toContain('gap-3');
    expect(layout.rowClass).not.toContain('justify-end');
    expect(layout.bubbleClass).toBe('');
    expect(layout.timeAlignClass).toBe('text-left');
  });

  it('system messages render like assistant messages (left, flat)', () => {
    const layout = bubbleLayoutForRole('system');
    expect(layout.isBubble).toBe(false);
    expect(layout.rowClass).toContain('gap-3');
    expect(layout.rowClass).not.toContain('justify-end');
  });
});

describe('formatMessageTime', () => {
  it('returns empty string when there is no timestamp', () => {
    expect(formatMessageTime(undefined)).toBe('');
    expect(formatMessageTime(0)).toBe('');
  });

  it('formats a timestamp as a short local time', () => {
    const out = formatMessageTime(new Date('2026-11-04T13:40:00').getTime());
    expect(out).not.toBe('');
    expect(out).toContain(':');
  });
});

describe('normalizeMessageList', () => {
  it('orders unticked messages by retrieval order — ticks are assigned in input order, not by timestamp', () => {
    // Stored out of timestamp order: retrieval order is the causal
    // order, so the list keeps it — the ticks, not the wall clock,
    // decide where each bubble sits.
    const out = normalizeMessageList([msg('c', 3000), msg('a', 1000), msg('b', 2000)]);
    expect(out.map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(out.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
  });

  it('ritual ticks already on a message win over its timestamp', () => {
    // A late reply with an early timestamp, retrieved first, keeps the
    // earliest tick — causal order beats wall-clock order.
    const late: ChatMessage = { id: 'late', role: 'assistant', content: 'late', timestamp: 1000, ritualTick: 0 };
    const early: ChatMessage = { id: 'early', role: 'user', content: 'early', timestamp: 3000, ritualTick: 1 };
    const out = normalizeMessageList([early, late]);
    expect(out.map((m) => m.id)).toEqual(['late', 'early']);
    expect(out[0].timestamp).toBe(1000);
    expect(out[1].timestamp).toBe(3000);
  });

  it('keeps equal timestamps in their original insertion order (stable)', () => {
    const out = normalizeMessageList([msg('first', 1000), msg('second', 1000), msg('third', 1000)]);
    expect(out.map((m) => m.id)).toEqual(['first', 'second', 'third']);
  });

  it('stamps messages missing an id, timestamp, or ritual tick so every bubble has all three', () => {
    const bare: ChatMessage = { role: 'assistant', content: 'hello' };
    const out = normalizeMessageList([bare]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBeTruthy();
    expect(typeof out[0].timestamp).toBe('number');
    expect((out[0].timestamp as number) > 0).toBe(true);
    expect(out[0].ritualTick).toBe(0);
  });

  it('assigns ticks to unticked messages after the highest tick already in the list', () => {
    const ticked: ChatMessage = { id: 'old', role: 'user', content: 'old', timestamp: 1000, ritualTick: 5 };
    const out = normalizeMessageList([ticked, msg('new', 2000)]);
    expect(out.map((m) => m.id)).toEqual(['old', 'new']);
    expect(out[1].ritualTick).toBe(6);
  });

  it('never re-assigns a tick already on a message — normalizing twice is a no-op for ticks', () => {
    const once = normalizeMessageList([msg('b', 2000), msg('a', 1000)]);
    expect(once.map((m) => m.ritualTick)).toEqual([0, 1]);
    const twice = normalizeMessageList(once);
    expect(twice.map((m) => m.id)).toEqual(['b', 'a']);
    expect(twice.map((m) => m.ritualTick)).toEqual([0, 1]);
  });

  it('drops duplicate ids, keeping the first in tick order', () => {
    const out = normalizeMessageList([
      msg('dup', 2000, 'newer'),
      msg('dup', 1000, 'older'),
      msg('other', 1500),
    ]);
    expect(out.map((m) => m.id)).toEqual(['dup', 'other']);
    expect(out[0].content).toBe('newer');
  });

  it('does not mutate the input list', () => {
    const input = [msg('c', 3000), msg('a', 1000)];
    const snapshot = [...input];
    normalizeMessageList(input);
    expect(input).toEqual(snapshot);
  });

  it('is idempotent on an already-ordered list', () => {
    const input = [msg('a', 1000), msg('b', 2000)];
    const out = normalizeMessageList(input);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.map((m) => m.ritualTick)).toEqual([0, 1]);
    expect(out).not.toBe(input);
  });

  it('returns an empty list for an empty list', () => {
    expect(normalizeMessageList([])).toEqual([]);
  });
});

describe('insertMessageInOrder', () => {
  it('a late message with an early timestamp takes the newest tick and lands last — causal order wins', () => {
    // The list is tick-ordered (a:0, c:1). A message with an early wall
    // clock (2000) retrieved NOW takes tick 2 and lands last, even
    // though its timestamp sits between the other two. Its timestamp
    // is unchanged for display.
    const list = [
      { ...msg('a', 1000), ritualTick: 0 },
      { ...msg('c', 3000), ritualTick: 1 },
    ];
    const out = insertMessageInOrder(list, msg('b', 2000));
    expect(out.map((m) => m.id)).toEqual(['a', 'c', 'b']);
    expect(out[2].ritualTick).toBe(2);
    expect(out[2].timestamp).toBe(2000);
  });

  it('a message carrying its own ritual tick is placed at that tick', () => {
    const list = [
      { ...msg('a', 1000), ritualTick: 0 },
      { ...msg('c', 3000), ritualTick: 2 },
    ];
    const out = insertMessageInOrder(list, { ...msg('b', 2000), ritualTick: 1 });
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
  });

  it('an explicit tick argument places the message at that tick', () => {
    const list = [
      { ...msg('a', 1000), ritualTick: 0 },
      { ...msg('c', 3000), ritualTick: 2 },
    ];
    const out = insertMessageInOrder(list, msg('b', 2000), 1);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('inserts after existing messages with an equal tick (stable)', () => {
    const list = [
      { ...msg('a', 1000), ritualTick: 0 },
      { ...msg('b', 2000), ritualTick: 1 },
    ];
    const out = insertMessageInOrder(list, { ...msg('c', 2000), ritualTick: 1 });
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('stamps a message missing an id, timestamp, or ritual tick on insert', () => {
    const list = [{ ...msg('a', 1000), ritualTick: 0 }];
    const out = insertMessageInOrder(list, { role: 'assistant', content: 'late' });
    expect(out).toHaveLength(2);
    expect(out[1].id).toBeTruthy();
    expect(typeof out[1].timestamp).toBe('number');
    expect(out[1].ritualTick).toBe(1);
  });

  it('does not mutate the input list', () => {
    const list = [
      { ...msg('a', 1000), ritualTick: 0 },
      { ...msg('c', 3000), ritualTick: 1 },
    ];
    const snapshot = [...list];
    insertMessageInOrder(list, msg('b', 2000));
    expect(list).toEqual(snapshot);
  });
});

describe('nextTickFor / assignRitualTicks', () => {
  it('nextTickFor is one past the highest tick, or 0 for a tickless list', () => {
    expect(nextTickFor([])).toBe(0);
    expect(nextTickFor([msg('a', 1000)])).toBe(0);
    expect(nextTickFor([
      { ...msg('a', 1000), ritualTick: 2 },
      { ...msg('b', 2000), ritualTick: 5 },
    ])).toBe(6);
  });

  it('assignRitualTicks numbers the unticked after the highest existing tick and never touches existing ticks', () => {
    const out = assignRitualTicks([
      msg('a', 1000),
      { ...msg('b', 2000), ritualTick: 7 },
      msg('c', 3000),
    ]);
    expect(out.map((m) => m.ritualTick)).toEqual([8, 7, 9]);
  });

  it('assignRitualTicks starts from the given counter, not from zero', () => {
    const out = assignRitualTicks([msg('a', 1000), msg('b', 2000)], 10);
    expect(out.map((m) => m.ritualTick)).toEqual([10, 11]);
  });

  it('assignRitualTicks does not mutate its input', () => {
    const input = [msg('a', 1000)];
    const snapshot = [...input];
    assignRitualTicks(input);
    expect(input).toEqual(snapshot);
  });
});
