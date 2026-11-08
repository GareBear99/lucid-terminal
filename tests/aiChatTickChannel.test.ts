// @vitest-environment node
/**
 * AI chat causal-tick channel vs event log channel — SEPARATE
 * (Gary, 2026-11-08 ~10:53 PST: "the AI chat's causal ticks
 * are their OWN separate SPSC channel").
 *
 * Two distinct bounded SPSC channels, never merged:
 *   (1) THE EVENT LOG channel (src/stores/eventLogStore.ts,
 *       `eventRing`) — TRACKING + DIAGNOSIS events only:
 *       startup, permission prompts, other session events,
 *       each with timestamp (when) + diagnosis (why).
 *   (2) THE AI CHAT TICK channel (src/lib/aiChatTicks.ts,
 *       `aiChatTickRing`) — LuciferAI bubbles' causal tick
 *       ordering only: each time a bubble takes its ritual
 *       tick, the tick is issued here.
 *
 * These tests pin:
 * - The two rings are different instances, independently
 *   sized — filling one does not fill the other.
 * - An AI chat tick does NOT enter the event log channel
 *   (not as a tick, not as an event).
 * - An event-log event does NOT enter the tick channel.
 * - The tick channel is bounded (backpressure, counted,
 *   never grows past capacity) and FIFO (the drain order IS
 *   the causal order).
 * - The REAL tick paths (addMessage, loadSessions) feed the
 *   tick channel, not the event log.
 *
 * Same harnesses as tests/aiSessionCausalOrder.test.ts (the
 * AI store, `window.lucidAPI` stubbed) and
 * tests/eventLogStore.test.ts (the event log store, drain
 * after logging). Tests reset BOTH channels in beforeEach,
 * so a tick or event from one test never leaks into the next.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAIStore } from '../src/stores/aiStore';
import { eventRing, useEventLogStore } from '../src/stores/eventLogStore';
import {
  aiChatTickRing,
  AI_CHAT_TICK_RING_CAPACITY,
  AI_CHAT_TICK_RECENT_LIMIT,
  aiChatTickRefusedCount,
  drainAiChatTicks,
  getRecentAiChatTicks,
  issueAiChatTick,
  resetAiChatTickChannel,
} from '../src/lib/aiChatTicks';
import { EVENT_RING_CAPACITY } from '../src/lib/eventLog';
import type { ChatMessage, ChatSession } from '../src/types';

const msg = (
  id: string,
  timestamp: number,
  content = 'x',
  role: ChatMessage['role'] = 'user',
  ritualTick?: number,
): ChatMessage => ({
  id,
  role,
  content,
  timestamp,
  ritualTick,
});

const session = (
  id: string,
  title: string,
  opts: {
    createdAt?: number;
    updatedAt?: number;
    causalOrder?: number;
    messages?: ChatMessage[];
    nextTick?: number;
  } = {},
): ChatSession => ({
  id,
  title,
  messages: opts.messages ?? [],
  createdAt: opts.createdAt ?? 1000,
  updatedAt: opts.updatedAt ?? 1000,
  causalOrder: opts.causalOrder,
  nextTick: opts.nextTick,
});

const resetAIStore = () => {
  useAIStore.setState({
    sessions: [],
    currentSessionId: null,
    messages: [],
    contextDirectory: null,
    isLoading: false,
    isSessionsLoaded: false,
    streamingMessage: '',
    streamStartedAt: null,
    generatingSessionId: null,
    lastTokenAt: null,
    stagingMessages: null,
    nextMessages: null,
  });
};

/** What `window.lucidAPI.ai.getSessions` returns — set per test. */
let sessionsOnDisk: ChatSession[] = [];

/** Let the microtask drains run (both channels drain on a microtask). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sessionsOnDisk = [];
  resetAIStore();
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
  vi.stubGlobal('window', {
    lucidAPI: {
      ai: {
        getSessions: vi.fn().mockImplementation(() => Promise.resolve(sessionsOnDisk)),
        saveSession: vi.fn(),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        clearSessions: vi.fn().mockResolvedValue(undefined),
        cancelStream: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  resetAiChatTickChannel();
  useEventLogStore.getState().clear();
  vi.unstubAllGlobals();
});

describe('the two channels are separate instances', () => {
  it('the tick ring and the event ring are different rings, independently sized', () => {
    expect(aiChatTickRing as unknown).not.toBe(eventRing as unknown);
    expect(AI_CHAT_TICK_RING_CAPACITY).not.toBe(EVENT_RING_CAPACITY);
    expect(AI_CHAT_TICK_RING_CAPACITY).toBe(256);
  });

  it('filling the tick channel does not fill the event log channel', () => {
    for (let i = 0; i < AI_CHAT_TICK_RING_CAPACITY; i++) {
      expect(issueAiChatTick('s1', `m${i}`, i)).toBe(true);
    }
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);
    expect(aiChatTickRing.isFull).toBe(true);
    // The event log channel is untouched — still empty, still accepts.
    expect(eventRing.length).toBe(0);
    const e = useEventLogStore.getState().logUnexpectedAsk('still room in the event log');
    expect(e).not.toBeNull();
    expect(eventRing.length).toBe(1);
    // And the tick channel is still full — the event did not free it.
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);
  });
});

describe('a tick never enters the event log channel', () => {
  it('an issued AI chat tick lands in the tick channel only', async () => {
    expect(issueAiChatTick('s1', 'm1', 0)).toBe(true);
    expect(aiChatTickRing.length).toBe(1);
    expect(eventRing.length).toBe(0);

    await flush();

    // The tick flowed through ITS channel (drained, in the recent window)…
    expect(getRecentAiChatTicks()).toEqual([
      { sessionId: 's1', messageId: 'm1', tick: 0, at: expect.any(Number) },
    ]);
    // …and never became an event in the log.
    expect(useEventLogStore.getState().events).toHaveLength(0);
    expect(useEventLogStore.getState().refusedCount).toBe(0);
  });
});

describe('an event never enters the tick channel', () => {
  it('a logged event lands in the event log channel only', async () => {
    const e = useEventLogStore.getState().logUnexpectedAsk('something asked');
    expect(e).not.toBeNull();
    expect(eventRing.length).toBe(1);
    expect(aiChatTickRing.length).toBe(0);

    await flush();

    // The event flowed through ITS channel (drained, in the visible log)…
    expect(useEventLogStore.getState().events).toHaveLength(1);
    expect(useEventLogStore.getState().events[0]?.what).toBe('something asked');
    // …and never became a tick.
    expect(getRecentAiChatTicks()).toHaveLength(0);
    expect(aiChatTickRefusedCount()).toBe(0);
  });
});

describe('the tick channel is bounded + FIFO (module-1 discipline)', () => {
  it('the tick ring refuses past capacity — bounded, counted, never grows', () => {
    for (let i = 0; i < AI_CHAT_TICK_RING_CAPACITY; i++) {
      expect(issueAiChatTick('s1', `m${i}`, i)).toBe(true);
    }
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);
    expect(aiChatTickRing.isFull).toBe(true);

    // Past capacity: refused, counted, the ring does not grow.
    expect(issueAiChatTick('s1', 'overflow-1', 256)).toBe(false);
    expect(issueAiChatTick('s1', 'overflow-2', 257)).toBe(false);
    expect(aiChatTickRefusedCount()).toBe(2);
    expect(aiChatTickRing.length).toBe(AI_CHAT_TICK_RING_CAPACITY);

    // The drain returns them in issue order — FIFO, the causal order.
    const drained = drainAiChatTicks();
    expect(drained).toHaveLength(AI_CHAT_TICK_RING_CAPACITY);
    expect(drained.map((t) => t.tick)).toEqual(
      Array.from({ length: AI_CHAT_TICK_RING_CAPACITY }, (_, i) => i),
    );
    // The recent window is capped — the oldest ticks fall off the
    // window (they are still on their messages).
    expect(getRecentAiChatTicks()).toHaveLength(AI_CHAT_TICK_RECENT_LIMIT);
    expect(getRecentAiChatTicks()[0]?.tick).toBe(
      AI_CHAT_TICK_RING_CAPACITY - AI_CHAT_TICK_RECENT_LIMIT,
    );
    expect(getRecentAiChatTicks()[AI_CHAT_TICK_RECENT_LIMIT - 1]?.tick).toBe(
      AI_CHAT_TICK_RING_CAPACITY - 1,
    );
  });

  it('ticks drain in the order they were issued — that order is the causal order', () => {
    issueAiChatTick('s1', 'm-a', 0);
    issueAiChatTick('s2', 'm-b', 0);
    issueAiChatTick('s1', 'm-c', 1);

    const drained = drainAiChatTicks();
    expect(
      drained.map((t) => [t.sessionId, t.messageId, t.tick]),
    ).toEqual([
      ['s1', 'm-a', 0],
      ['s2', 'm-b', 0],
      ['s1', 'm-c', 1],
    ]);
    expect(getRecentAiChatTicks().map((t) => t.tick)).toEqual([0, 0, 1]);
  });
});

describe('the real tick paths feed the tick channel, not the event log', () => {
  it('addMessage issues the bubble’s tick into the tick channel', () => {
    useAIStore.setState({
      sessions: [session('s1', 'Chat', { causalOrder: 0, nextTick: 0, messages: [] })],
      currentSessionId: 's1',
      messages: [],
    });

    useAIStore.getState().addMessage(msg('m1', 1000, 'hello'), 's1');

    // The bubble took tick 0 in its chat.
    expect(
      useAIStore.getState().sessions.find((s) => s.id === 's1')?.messages[0]?.ritualTick,
    ).toBe(0);
    // …and that tick is in the tick channel, in flight.
    expect(aiChatTickRing.length).toBe(1);
    const [tick] = drainAiChatTicks();
    expect(tick).toMatchObject({ sessionId: 's1', messageId: 'm1', tick: 0 });
    // …and nowhere near the event log.
    expect(eventRing.length).toBe(0);
    expect(useEventLogStore.getState().events).toHaveLength(0);
  });

  it('loadSessions publishes legacy ticks into the tick channel', async () => {
    sessionsOnDisk = [
      session('s1', 'Chat', {
        nextTick: 0,
        messages: [msg('m1', 1000, 'legacy, unticked')],
      }),
    ];

    await useAIStore.getState().loadSessions();
    await flush();

    // The legacy bubble took tick 0 on load.
    expect(
      useAIStore.getState().sessions.find((s) => s.id === 's1')?.messages[0]?.ritualTick,
    ).toBe(0);
    // …and that tick flowed through the tick channel.
    expect(getRecentAiChatTicks()).toHaveLength(1);
    expect(getRecentAiChatTicks()[0]).toMatchObject({
      sessionId: 's1',
      messageId: 'm1',
      tick: 0,
    });
    // …and nowhere near the event log.
    expect(eventRing.length).toBe(0);
    expect(useEventLogStore.getState().events).toHaveLength(0);
  });
});
