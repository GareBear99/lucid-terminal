/**
 * Session order — causal ritual placement, not time (Gary, 2026-11-07).
 *
 * The LuciferAI tabs (the chats) hide behind the one blood drop tab,
 * ordered by causal ritual placement (ticks), not by time. A session's
 * `causalOrder` is its position in the creation sequence: assigned once
 * at creation, never re-numbered — a reply never moves the session, so
 * the list order never changes under the user. Timestamps
 * (createdAt/updatedAt) are display only.
 *
 * This is the rule the old code broke: `addMessage` re-sorted the
 * sessions by `updatedAt` desc after every reply, so the chat just
 * replied to jumped to the top — wall-clock order, not causal order.
 * The display is still newest-created first (highest causalOrder
 * first); only the rule behind it changed.
 *
 * Same harness as tests/aiStore.test.ts: node env, `window.lucidAPI`
 * stubbed (the actions under test only call it to persist sessions).
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

const session = (
  id: string,
  title: string,
  opts: { createdAt?: number; updatedAt?: number; causalOrder?: number; messages?: ChatMessage[]; nextTick?: number } = {},
): ChatSession => ({
  id,
  title,
  messages: opts.messages ?? [],
  createdAt: opts.createdAt ?? 1000,
  updatedAt: opts.updatedAt ?? 1000,
  causalOrder: opts.causalOrder,
  nextTick: opts.nextTick,
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

describe('sessions — causal ritual placement, not time', () => {
  it('createSession assigns increasing causalOrder: 0, 1, 2…', () => {
    const store = useAIStore.getState();
    store.createSession();
    store.createSession();
    store.createSession();

    const orders = useAIStore.getState().sessions.map((s) => s.causalOrder);
    // Newest-created first in display order: 2, 1, 0.
    expect(orders).toEqual([2, 1, 0]);
  });

  it('a reply to the OLDEST chat does NOT move it to the top', () => {
    const oldChat = session('old', 'Old Chat', { createdAt: 1000, updatedAt: 1000, causalOrder: 0 });
    const newChat = session('new', 'New Chat', { createdAt: 2000, updatedAt: 2000, causalOrder: 1 });
    useAIStore.setState({
      sessions: [newChat, oldChat],
      currentSessionId: 'new',
      messages: [],
    });

    // Reply in the OLD chat — under the old updatedAt sort this jumped
    // it to the top; under causal placement it stays exactly where it was.
    useAIStore.getState().addMessage(msg('o1', 9000, 'old reply'), 'old');

    const state = useAIStore.getState();
    expect(state.sessions.map((s) => s.id)).toEqual(['new', 'old']);
    // The reply still landed, and the timestamp still updated — for
    // display only. Only the placement is causal.
    expect(state.sessions.find((s) => s.id === 'old')?.messages).toHaveLength(1);
    expect(state.sessions.find((s) => s.id === 'old')?.updatedAt).toBeGreaterThan(2000);
    expect(state.sessions.find((s) => s.id === 'old')?.causalOrder).toBe(0);
    expect(state.sessions.find((s) => s.id === 'new')?.causalOrder).toBe(1);
  });

  it('a reply to the CURRENT chat does not move it either', () => {
    const first = session('first', 'First', { createdAt: 1000, updatedAt: 1000, causalOrder: 0 });
    const second = session('second', 'Second', { createdAt: 2000, updatedAt: 2000, causalOrder: 1 });
    useAIStore.setState({
      sessions: [second, first],
      currentSessionId: 'first',
      messages: [],
    });

    useAIStore.getState().addMessage(msg('f1', 9000, 'reply in first'));

    expect(useAIStore.getState().sessions.map((s) => s.id)).toEqual(['second', 'first']);
  });

  it('loadSessions numbers legacy sessions in creation order, newest-created first', async () => {
    // No causalOrder on disk yet; createdAt disagrees with disk order
    // on purpose — creation order (oldest first) is the causal order.
    const stored = [
      session('c', 'Third created', { createdAt: 3000, updatedAt: 9000 }),
      session('a', 'First created', { createdAt: 1000, updatedAt: 1000 }),
      session('b', 'Second created', { createdAt: 2000, updatedAt: 5000 }),
    ];
    ((window as any).lucidAPI.ai.getSessions as any).mockResolvedValue(stored);

    await useAIStore.getState().loadSessions();

    const state = useAIStore.getState();
    expect(state.sessions.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(state.sessions.map((s) => s.causalOrder)).toEqual([2, 1, 0]);
    // The numbers were persisted, so the placement sticks and is
    // never re-derived on the next load.
    const saveSession = (window as any).lucidAPI.ai.saveSession;
    expect(saveSession).toHaveBeenCalledTimes(3);
    expect(saveSession.mock.calls.map((c: unknown[]) => (c[0] as ChatSession).causalOrder).sort()).toEqual([0, 1, 2]);
  });

  it('loadSessions keeps numbers already assigned — never re-numbers', async () => {
    const stored = [
      session('x', 'Numbered', { createdAt: 1000, updatedAt: 1000, causalOrder: 5 }),
      session('y', 'Also numbered', { createdAt: 2000, updatedAt: 2000, causalOrder: 7 }),
    ];
    ((window as any).lucidAPI.ai.getSessions as any).mockResolvedValue(stored);

    await useAIStore.getState().loadSessions();

    const state = useAIStore.getState();
    expect(state.sessions.map((s) => s.id)).toEqual(['y', 'x']);
    expect(state.sessions.map((s) => s.causalOrder)).toEqual([7, 5]);
    // Nothing was missing, so nothing was re-saved.
    expect((window as any).lucidAPI.ai.saveSession).not.toHaveBeenCalled();
  });
});
