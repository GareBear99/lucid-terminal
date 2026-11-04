/**
 * AI chat store tests — timestamp continuity, ritual ticks, and the
 * triple-buffer switch.
 *
 * The store is the single place where bubble order is enforced:
 * - `addMessage` assigns the next ritual tick in the target chat and
 *   inserts in causal (tick) order, in between the bubbles.
 * - `selectSession` switches chats through the lock-free SPSC triple
 *   buffer (staging → next → one atomic swap), so the new chat's bubbles
 *   appear in tick order with no blank gap, no torn mix of the old
 *   and new chats, and no waiting.
 * - `completeStream` stamps the finished reply with its own id,
 *   timestamp, and ritual tick (the pre-fix code created it with neither).
 *
 * Timestamps vs ritual ticks: a timestamp is wall-clock time for display;
 * a ritual tick is the causal-order counter, assigned on retrieval, per
 * chat, and persisted with the session (`nextTick`) so it survives a
 * reload without restarting from zero. A late message with an early
 * timestamp takes the newest tick and lands last — causal order wins,
 * and the timestamp it carries is unchanged for display.
 *
 * Integration with LuciferAI's real architecture (Gary's correction):
 * - Generation timeout: a chat switch never touches generation state —
 *   `generatingSessionId` + `lastTokenAt` carry over the switch, the
 *   Python backend's stall timers keep running on the original
 *   subprocess, and `completeStream` routes the reply to the origin
 *   session. No TS-side wall-clock timer exists.
 * - Bypass router / task manager / FixNet: none of them are in this
 *   path (see the store's integration comment) — there is no task
 *   queue, the router is broken, and FixNet never reaches these
 *   bubbles — so the tests assert what the switch does instead:
 *   synchronous atomic swap, single-slot generation recorded here.
 *
 * The store runs in node here (vitest `environment: 'node'`), so
 * `window.lucidAPI` is stubbed — the actions under test only call it to
 * persist sessions, which the stubs swallow.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAIStore } from '../src/stores/aiStore';
import type { ChatMessage, ChatSession } from '../src/types';

const msg = (id: string, timestamp: number, content = 'x', role: ChatMessage['role'] = 'user', ritualTick?: number): ChatMessage => ({
  id,
  role,
  content,
  timestamp,
  ritualTick,
});

const session = (id: string, title: string, messages: ChatMessage[], nextTick?: number): ChatSession => ({
  id,
  title,
  messages,
  createdAt: 1000,
  updatedAt: 1000,
  nextTick,
});

const resetStore = () => {
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

beforeEach(() => {
  resetStore();
  vi.stubGlobal('window', {
    lucidAPI: {
      ai: {
        getSessions: vi.fn().mockResolvedValue([]),
        saveSession: vi.fn(),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        clearSessions: vi.fn().mockResolvedValue(undefined),
        cancelStream: vi.fn(),
      },
    },
  });
});

describe('selectSession — triple-buffer chat switch', () => {
  it('swaps in the new chat in ritual-tick order, with no old-chat bubbles mixed in', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0), msg('a2', 2000, 'a-second', 'user', 1)], 2);
    // Chat B's timestamps disagree with its ticks — the ticks are the
    // causal order, so the switch renders tick order, not timestamp order.
    const chatB = session('b', 'Chat B', [
      msg('b3', 1000, 'b-third', 'user', 2),
      msg('b1', 3000, 'b-first', 'user', 0),
      msg('b2', 2000, 'b-second', 'user', 1),
    ], 3);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().selectSession('b');

    const state = useAIStore.getState();
    expect(state.currentSessionId).toBe('b');
    expect(state.messages.map((m) => m.id)).toEqual(['b1', 'b2', 'b3']);
    expect(state.messages.map((m) => m.content)).toEqual(['b-first', 'b-second', 'b-third']);
    // The ticks ride along unchanged — the swap never re-numbers them.
    expect(state.messages.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
    // No bubble from the old chat survives the swap.
    expect(state.messages.some((m) => m.id?.startsWith('a'))).toBe(false);
  });

  it('legacy unticked messages take ticks in retrieval order on switch', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    // No ticks on disk yet — retrieval order (stored order) is the
    // causal order, so the list keeps it even though the timestamps
    // disagree with it.
    const chatB = session('b', 'Chat B', [msg('b3', 3000, 'b-third'), msg('b1', 1000, 'b-first'), msg('b2', 2000, 'b-second')]);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().selectSession('b');

    const state = useAIStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual(['b3', 'b1', 'b2']);
    expect(state.messages.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
  });

  it('discards the staging and next buffers after the atomic swap', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'b-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().selectSession('b');

    const state = useAIStore.getState();
    expect(state.stagingMessages).toBeNull();
    expect(state.nextMessages).toBeNull();
  });

  it('switching back restores the first chat in tick order, ticks intact', () => {
    const chatA = session('a', 'Chat A', [msg('a2', 2000, 'a-second', 'user', 1), msg('a1', 1000, 'a-first', 'user', 0)], 2);
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'b-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [msg('a1', 1000, 'a-first', 'user', 0), msg('a2', 2000, 'a-second', 'user', 1)],
    });

    useAIStore.getState().selectSession('b');
    expect(useAIStore.getState().messages.map((m) => m.id)).toEqual(['b1']);
    useAIStore.getState().selectSession('a');
    expect(useAIStore.getState().messages.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(useAIStore.getState().messages.map((m) => m.ritualTick)).toEqual([0, 1]);
  });

  it('ignores a switch to an unknown session id', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().selectSession('nope');

    const state = useAIStore.getState();
    expect(state.currentSessionId).toBe('a');
    expect(state.messages.map((m) => m.id)).toEqual(['a1']);
  });
});

describe('addMessage — tick-ordered insert', () => {
  it('a late message with an early timestamp takes the next tick and lands last — causal order wins', () => {
    const chat = session('a', 'Chat A', [
      msg('a1', 1000, 'a-first', 'user', 0),
      msg('a3', 3000, 'a-third', 'user', 1),
    ], 2);
    useAIStore.setState({
      sessions: [chat],
      currentSessionId: 'a',
      messages: [...chat.messages],
    });

    // Retrieved now, so it takes tick 2 — last in causal order — even
    // though its wall-clock timestamp (2000) sits between the others.
    // The timestamp is unchanged for display.
    useAIStore.getState().addMessage(msg('a2', 2000, 'late arrival'));

    const state = useAIStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual(['a1', 'a3', 'a2']);
    expect(state.messages[2].ritualTick).toBe(2);
    expect(state.messages[2].timestamp).toBe(2000);
    // The session's counter advanced past the new tick.
    expect(state.sessions.find((s) => s.id === 'a')?.nextTick).toBe(3);
  });

  it('stamps a message that arrives without an id, timestamp, or tick', () => {
    const chat = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chat],
      currentSessionId: 'a',
      messages: [...chat.messages],
    });

    useAIStore.getState().addMessage({ role: 'assistant', content: 'unstamped' });

    const added = useAIStore.getState().messages[1];
    expect(added.id).toBeTruthy();
    expect(typeof added.timestamp).toBe('number');
    expect(added.content).toBe('unstamped');
    expect(added.ritualTick).toBe(1);
  });

  it('keeps the session copy of the messages in the same tick order', () => {
    const chat = session('a', 'Chat A', [
      msg('a1', 1000, 'a-first', 'user', 0),
      msg('a3', 3000, 'a-third', 'user', 1),
    ], 2);
    useAIStore.setState({
      sessions: [chat],
      currentSessionId: 'a',
      messages: [...chat.messages],
    });

    useAIStore.getState().addMessage(msg('a2', 2000, 'late arrival'));

    const stored = useAIStore.getState().sessions.find((s) => s.id === 'a');
    expect(stored?.messages.map((m) => m.id)).toEqual(['a1', 'a3', 'a2']);
    expect(stored?.messages.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
  });
});

describe('streaming — stable start time and stamped completion', () => {
  it('captures the stream start time on the first chunk and keeps it stable', () => {
    const chat = session('a', 'Chat A', []);
    useAIStore.setState({ sessions: [chat], currentSessionId: 'a' });
    const store = useAIStore.getState();

    store.updateStreamingMessage('hello ');
    const startedAt = useAIStore.getState().streamStartedAt;
    expect(typeof startedAt).toBe('number');

    store.updateStreamingMessage('hello world');
    expect(useAIStore.getState().streamStartedAt).toBe(startedAt);
  });

  it('completeStream stamps the finished reply with its own id, timestamp, and next ritual tick', () => {
    const chat = session('a', 'Chat A', [msg('u1', 1000, 'hi', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chat],
      currentSessionId: 'a',
      messages: [...chat.messages],
      isLoading: true,
    });
    const store = useAIStore.getState();
    store.updateStreamingMessage('hello back');
    store.completeStream();

    const state = useAIStore.getState();
    expect(state.streamingMessage).toBe('');
    expect(state.streamStartedAt).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.messages).toHaveLength(2);
    const reply = state.messages[1];
    expect(reply.role).toBe('assistant');
    expect(reply.content).toBe('hello back');
    expect(reply.id).toBeTruthy();
    expect(typeof reply.timestamp).toBe('number');
    // The reply lands after the user message that prompted it — next
    // ritual tick in causal order.
    expect((reply.timestamp as number) >= 1000).toBe(true);
    expect(reply.ritualTick).toBe(1);
  });
});

describe('generation timeout — mid-generation switch carries over', () => {
  it('a switch never interrupts, resets, or moves the in-flight generation', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'ask me something', 'user', 0)], 1);
    const chatB = session('b', 'Chat B', [msg('b2', 2000, 'b-second', 'user', 1), msg('b1', 1000, 'b-first', 'user', 0)], 2);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });
    // A generation is in flight in chat A: tokens flowing.
    const store = useAIStore.getState();
    store.setLoading(true);
    store.updateStreamingMessage('partial reply ');

    const before = useAIStore.getState();
    const startedAt = before.streamStartedAt;
    const lastTokenAt = before.lastTokenAt;
    expect(before.generatingSessionId).toBe('a');

    // Switch to chat B mid-generation.
    useAIStore.getState().selectSession('b');

    const after = useAIStore.getState();
    // The new chat's bubbles, in tick order, no old-chat mix.
    expect(after.currentSessionId).toBe('b');
    expect(after.messages.map((m) => m.id)).toEqual(['b1', 'b2']);
    expect(after.stagingMessages).toBeNull();
    expect(after.nextMessages).toBeNull();
    // The generation carries over untouched — still running, still
    // tied to its origin session, its token-activity record intact.
    // Nothing here resets a timer (there is no TS-side timer to reset:
    // the Python stall timers keep running on the original subprocess).
    expect(after.isLoading).toBe(true);
    expect(after.generatingSessionId).toBe('a');
    expect(after.streamingMessage).toBe('partial reply ');
    expect(after.streamStartedAt).toBe(startedAt);
    expect(after.lastTokenAt).toBe(lastTokenAt);
  });

  it('completeStream routes the reply to the origin session, not the displayed one', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'ask me something', 'user', 0)], 1);
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'unrelated chat', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });
    const store = useAIStore.getState();
    store.setLoading(true);
    store.updateStreamingMessage('the answer ');

    // Switch to chat B while chat A's generation is still running.
    useAIStore.getState().selectSession('b');
    // The generation completes.
    useAIStore.getState().completeStream();

    const state = useAIStore.getState();
    // The reply lands in its origin chat (A), after the question that
    // prompted it, in tick order — exactly once, with its own id,
    // timestamp, and ritual tick.
    const storedA = state.sessions.find((s) => s.id === 'a');
    expect(storedA?.messages.map((m) => m.id)).toEqual(['a1', expect.any(String)]);
    expect(storedA?.messages[1].ritualTick).toBe(1);
    expect(storedA?.messages[1].role).toBe('assistant');
    expect(storedA?.messages[1].content).toBe('the answer ');
    // The displayed chat (B) is untouched — no reply leaked into it.
    expect(state.messages.map((m) => m.id)).toEqual(['b1']);
    // Generation state is released, exactly once.
    expect(state.isLoading).toBe(false);
    expect(state.generatingSessionId).toBeNull();
    expect(state.streamingMessage).toBe('');
    expect(state.lastTokenAt).toBeNull();
  });

  it('setLoading captures the generating session on start and releases it on end', () => {
    const chat = session('a', 'Chat A', []);
    useAIStore.setState({ sessions: [chat], currentSessionId: 'a' });

    useAIStore.getState().setLoading(true);
    expect(useAIStore.getState().generatingSessionId).toBe('a');

    useAIStore.getState().setLoading(false);
    const state = useAIStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.generatingSessionId).toBeNull();
    expect(state.lastTokenAt).toBeNull();
  });

  it('updateStreamingMessage records token activity per chunk, with no timer', () => {
    const chat = session('a', 'Chat A', []);
    useAIStore.setState({ sessions: [chat], currentSessionId: 'a' });
    const store = useAIStore.getState();

    store.updateStreamingMessage('one ');
    const first = useAIStore.getState();
    expect(typeof first.lastTokenAt).toBe('number');
    expect(first.streamStartedAt).toBe(first.lastTokenAt);

    store.updateStreamingMessage('one two ');
    const second = useAIStore.getState();
    // Each chunk refreshes the activity record; the start time never moves.
    expect(second.streamStartedAt).toBe(first.streamStartedAt);
    expect((second.lastTokenAt as number) >= (first.lastTokenAt as number)).toBe(true);
  });

  it('deleting the generating session cancels the in-flight generation', async () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'b-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });
    const store = useAIStore.getState();
    store.setLoading(true);
    store.updateStreamingMessage('partial ');

    await useAIStore.getState().deleteSession('a');

    expect((window as any).lucidAPI.ai.cancelStream).toHaveBeenCalled();
    const state = useAIStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.generatingSessionId).toBeNull();
    expect(state.streamingMessage).toBe('');
    // The switch to the next chat went through the same atomic swap.
    expect(state.currentSessionId).toBe('b');
    expect(state.messages.map((m) => m.id)).toEqual(['b1']);
    expect(state.stagingMessages).toBeNull();
    expect(state.nextMessages).toBeNull();
  });
});

describe('addMessage — routed insert, not a blind append', () => {
  it('an explicit target session receives the message; the displayed chat is untouched', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0), msg('a3', 3000, 'a-third', 'user', 1)], 2);
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'b-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'b',
      messages: [...chatB.messages],
    });

    // A message for chat A (e.g. its generation completing) while B shows.
    // Retrieved now, so it takes tick 2 and lands last in causal order.
    useAIStore.getState().addMessage(msg('a2', 2000, 'late reply'), 'a');

    const state = useAIStore.getState();
    expect(state.sessions.find((s) => s.id === 'a')?.messages.map((m) => m.id)).toEqual(['a1', 'a3', 'a2']);
    expect(state.messages.map((m) => m.id)).toEqual(['b1']);
  });

  it('a message for a missing session is never silently dropped', () => {
    const chatB = session('b', 'Chat B', [msg('b1', 1000, 'b-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatB],
      currentSessionId: 'b',
      messages: [...chatB.messages],
    });

    useAIStore.getState().addMessage(msg('ghost1', 1500, 'orphaned reply'), 'ghost');

    // Falls back to the displayed list, in tick position.
    expect(useAIStore.getState().messages.map((m) => m.id)).toEqual(['b1', 'ghost1']);
  });

  it('createSession goes through the atomic swap, not a direct list write', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000)]);
    useAIStore.setState({
      sessions: [chatA],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().createSession();

    const state = useAIStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.stagingMessages).toBeNull();
    expect(state.nextMessages).toBeNull();
    expect(state.currentSessionId).toBeTruthy();
    expect(state.currentSessionId).not.toBe('a');
    expect(state.sessions).toHaveLength(2);
  });
});

describe('ritual ticks — causal order, per chat, surviving reload', () => {
  it('two messages with out-of-order timestamps render in tick order, timestamps unchanged', () => {
    const chat = session('a', 'Chat A', [
      msg('late', 1000, 'early clock, retrieved first', 'user', 0),
      msg('early', 3000, 'late clock, retrieved second', 'user', 1),
    ], 2);
    useAIStore.setState({
      sessions: [chat],
      currentSessionId: 'a',
      messages: [...chat.messages],
    });

    useAIStore.getState().selectSession('a');

    const state = useAIStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual(['late', 'early']);
    expect(state.messages.map((m) => m.timestamp)).toEqual([1000, 3000]);
    expect(state.messages.map((m) => m.ritualTick)).toEqual([0, 1]);
  });

  it('a tick survives a reload: loadSessions keeps stored ticks and the counter continues past them', async () => {
    const stored = session('a', 'Chat A', [
      msg('a1', 1000, 'first', 'user', 0),
      msg('a2', 2000, 'second', 'user', 1),
      msg('a3', 3000, 'third', 'user', 2),
    ], 3);
    ((window as any).lucidAPI.ai.getSessions as any).mockResolvedValue([stored]);

    await useAIStore.getState().loadSessions();

    const loaded = useAIStore.getState().sessions.find((s) => s.id === 'a');
    expect(loaded?.messages.map((m) => m.ritualTick)).toEqual([0, 1, 2]);
    expect(loaded?.nextTick).toBe(3);

    // The next message retrieved takes tick 3 — the counter did not
    // restart from zero and does not collide with the stored ticks.
    useAIStore.setState({ currentSessionId: 'a', messages: [...(loaded?.messages ?? [])] });
    useAIStore.getState().addMessage(msg('a4', 4000, 'fourth'));

    const after = useAIStore.getState();
    expect(after.messages.map((m) => m.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(after.messages[3].ritualTick).toBe(3);
    expect(after.sessions.find((s) => s.id === 'a')?.nextTick).toBe(4);
  });

  it('loadSessions numbers legacy unticked messages from the stored counter', async () => {
    const stored = session('a', 'Chat A', [
      msg('x', 3000, 'third clock'),
      msg('y', 1000, 'first clock'),
      msg('z', 2000, 'second clock'),
    ], 10);
    ((window as any).lucidAPI.ai.getSessions as any).mockResolvedValue([stored]);

    await useAIStore.getState().loadSessions();

    const loaded = useAIStore.getState().sessions.find((s) => s.id === 'a');
    // Retrieval order (stored order) is the causal order; the counter
    // started at the stored 10, not at zero.
    expect(loaded?.messages.map((m) => m.id)).toEqual(['x', 'y', 'z']);
    expect(loaded?.messages.map((m) => m.ritualTick)).toEqual([10, 11, 12]);
    expect(loaded?.nextTick).toBe(13);
  });

  it('each chat keeps its own tick sequence — a switch never mixes them', () => {
    const chatA = session('a', 'Alpha', [
      msg('a1', 1000, 'a-first', 'user', 0),
      msg('a2', 2000, 'a-second', 'user', 1),
    ], 2);
    const chatB = session('b', 'Beta', [
      msg('b1', 5000, 'b-first', 'user', 0),
      msg('b2', 6000, 'b-second', 'user', 1),
    ], 2);
    useAIStore.setState({
      sessions: [chatA, chatB],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().selectSession('b');
    expect(useAIStore.getState().messages.map((m) => m.ritualTick)).toEqual([0, 1]);
    useAIStore.getState().selectSession('a');
    expect(useAIStore.getState().messages.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(useAIStore.getState().messages.map((m) => m.ritualTick)).toEqual([0, 1]);

    // A new message in Alpha continues Alpha's counter, not Beta's.
    useAIStore.getState().addMessage(msg('a3', 3000, 'a-third'));
    expect(useAIStore.getState().messages[2].ritualTick).toBe(2);
    expect(useAIStore.getState().sessions.find((s) => s.id === 'b')?.nextTick).toBe(2);
  });

  it('createSession starts a fresh tick counter at zero', () => {
    const chatA = session('a', 'Chat A', [msg('a1', 1000, 'a-first', 'user', 0)], 1);
    useAIStore.setState({
      sessions: [chatA],
      currentSessionId: 'a',
      messages: [...chatA.messages],
    });

    useAIStore.getState().createSession();

    const state = useAIStore.getState();
    const created = state.sessions.find((s) => s.id === state.currentSessionId);
    expect(created?.nextTick).toBe(0);

    useAIStore.getState().addMessage(msg('n1', 1000, 'first in the new chat'));
    expect(useAIStore.getState().messages[0].ritualTick).toBe(0);
  });
});
