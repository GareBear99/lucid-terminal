import { create } from 'zustand';
import { ChatMessage, ChatSession, PingQuota } from '../types';
import { basePingQuota, nextLastRestockAt } from '../lib/pingQuota';
import { normalizeMessageList, insertMessageInOrder, nextTickFor } from '../components/AI/chatBubbles';
import { issueAiChatTick, publishNewTicks } from '../lib/aiChatTicks';
import { useHornWiggleStore } from './hornWiggleStore';

/**
 * Session order — causal ritual placement (Gary, 2026-11-07).
 *
 * The LuciferAI tabs (the chats) hide behind the one blood drop tab,
 * ordered by causal ritual placement, not by time. A session's
 * `causalOrder` is its position in the creation sequence: assigned
 * once at creation, never re-numbered, never moved by a reply — so
 * the list order never changes under the user. Timestamps
 * (createdAt/updatedAt) are display only; a session that was just
 * replied to stays exactly where it was.
 *
 * Display is newest-created first (highest causalOrder first), the
 * same look the old most-recently-active order had — only the rule
 * behind it changed: creation sequence instead of last activity.
 * A session that somehow lacks a number (defensive only — load
 * assigns one to every legacy session) sorts after the numbered ones.
 */
function byCausalOrderDesc(a: ChatSession, b: ChatSession): number {
    return (b.causalOrder ?? -1) - (a.causalOrder ?? -1);
}

/**
 * Give legacy sessions (created before causalOrder existed) their
 * causal number, in creation order: the oldest missing one takes the
 * lowest free number above the highest already assigned, so the
 * numbers keep the creation sequence and never collide with numbers
 * already handed out. In practice this runs once, on the first load
 * after the feature lands — no session is numbered yet, so they take
 * 0..n in creation order, the same sequence creation would have
 * assigned. Returns the sessions with every one numbered.
 */
function assignLegacyCausalOrder(sessions: ChatSession[]): ChatSession[] {
    const missing = sessions.filter((s) => s.causalOrder === undefined);
    if (missing.length === 0) return sessions;
    let next = Math.max(-1, ...sessions.map((s) => s.causalOrder ?? -1)) + 1;
    const assigned = new Map<string, number>();
    [...missing]
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((s) => {
            assigned.set(s.id, next);
            next += 1;
        });
    return sessions.map((s) =>
        s.causalOrder !== undefined ? s : { ...s, causalOrder: assigned.get(s.id) as number },
    );
}

interface AIState {
    sessions: ChatSession[];
    currentSessionId: string | null;
    messages: ChatMessage[];
    contextDirectory: string | null;
    isLoading: boolean;
    isSessionsLoaded: boolean;
    streamingMessage: string;
    /** When the current stream's first chunk arrived (for the streaming
     *  bubble's timestamp — stable across renders, not render time). */
    streamStartedAt: number | null;
    /** The session the in-flight generation belongs to, or null when no
     *  generation is running. A generation is tied to the chat it was
     *  sent from; a chat switch never moves it, cancels it, or resets
     *  it — its reply lands in this session, not the displayed one. */
    generatingSessionId: string | null;
    /** Last time a streamed chunk arrived (token activity). Recorded
     *  only — the TS side imposes NO timeout on it. Stall enforcement
     *  lives in the Python backend (`llm_backend.py`: 45s inactivity /
     *  90s loading / 600s absolute, per-character activity); this
     *  timestamp exists so the UI can show alive-vs-quiet, never so
     *  this side can kill a generation on a wall clock. */
    lastTokenAt: number | null;

    // --- Triple atomic buffer (see swapToChat below) ---
    /** Buffer B — the staging buffer. The producer writes the incoming
     *  chat's messages here, off the rendered path. Never rendered. */
    stagingMessages: ChatMessage[] | null;
    /** Buffer C — the next buffer. The producer's finished, timestamp-
     *  ordered list, held ready for the atomic swap. Never rendered. */
    nextMessages: ChatMessage[] | null;

    // Actions
    loadSessions: () => Promise<void>;
    createSession: () => void;
    selectSession: (id: string) => void;
    /** Set a chat's model (from the header dropdown). Persists via
     *  the existing saveSession call, so the choice round-trips
     *  through sessions.json and the chat remembers its model.
     *  model/modelSource undefined = Auto (today's cascade). */
    setSessionModel: (id: string, model?: string, modelSource?: 'local' | 'openai' | 'ping') => void;
    deleteSession: (id: string) => Promise<void>;
    clearSessions: () => Promise<void>;
    /**
     * Whether a guest session is veiled in: the visible sessions /
     * messages are the guest's own live ones; the owner's sessions
     * are stashed (see guestStash) and untouched on disk.
     */
    guestSessionActive: boolean;
    /** The owner's sessions + current chat + in-flight generation
     *  state, stashed when a guest session starts and restored
     *  when it ends. Null outside a guest session. Never
     *  persisted — it only ever lives in memory. */
    guestStash: {
        sessions: ChatSession[];
        currentSessionId: string | null;
        messages: ChatMessage[];
        isLoading: boolean;
        generatingSessionId: string | null;
        /** Whether the owner's sessions had actually been loaded
         *  off disk when the guest session started. False when the
         *  veil went on at boot, before the chat ever loaded —
         *  exitGuestSession then loads them for real instead of
         *  restoring an empty stash. */
        sessionsLoaded: boolean;
    } | null;
    /**
     * Start a guest session (Gary, 2026-11-12 ~17:59 PST): no
     * LLMBuilder memory, no driving-intelligence memory, no chat
     * memory, no history in any guest build. The owner's sessions
     * are stashed in memory — never deleted, never written over —
     * and the visible state goes empty; while the flag is on, no
     * session is ever persisted to disk (see the guards in
     * loadSessions / createSession / addMessage / setSessionModel /
     * deleteSession / clearSessions). The guest's own live chats
     * live only in the visible state and are dropped on exit.
     * The backend's per-chat memory is scoped by chat id and is
     * in-memory only, so a guest chat (fresh id) never sees the
     * owner's context — and the renderer only ever sends the
     * guest's own live messages as history.
     */
    enterGuestSession: () => void;
    /** End a guest session: drop the guest's live chats and
     *  restore the stashed owner sessions exactly. */
    exitGuestSession: () => void;
    /** Drop the current guest's live chats (a fresh guest replaces
     *  the old one — "always a new guest") without touching the
     *  stashed owner sessions. No-op outside a guest session. */
    resetGuestSession: () => void;
    addMessage: (message: ChatMessage, targetSessionId?: string) => void;
    updateStreamingMessage: (content: string) => void;
    completeStream: () => void;
    /** A prompt queued from outside the chat — e.g. the browser's
     * "ask the AI about this page" (Area 5). AIChat watches it and
     * sends it as the next user message; null when none is queued. */
    pendingAiPrompt: string | null;
    queueAiPrompt: (text: string) => void;
    clearPendingAiPrompt: () => void;
    setContextDirectory: (dir: string | null) => void;
    setLoading: (loading: boolean) => void;

    /** Last SP balance the ping server reported (null until the
     *  client has talked to it once). Shown in the AI panel header
     *  while the ping server test path is enabled. */
    pingQuota: PingQuota | null;
    setPingQuota: (quota: PingQuota | null) => void;

    /** Where the current pingQuota came from: 'server' when the ping
     *  server reported it, 'base' when Lucid cannot reach the server
     *  and the balance is the KNOWN base 100 (a non-connected user
     *  carries a temp, and through that temp their SP is base 100 —
     *  daily-sync design). Null when no balance is known yet. */
    pingQuotaSource: 'server' | 'base' | null;

    /** Unix ms of the most recent SP restock, when it is known. The
     *  header shows "restocked Xm ago" from this. Null until a
     *  restock is actually seen — never a stale timer from an older
     *  restock. Cleared when the balance goes to base (no server, no
     *  known restock). */
    lastRestockAt: number | null;

    /** Put the SP balance into the base-100 KNOWN state: the ping
     *  server is unreachable, so the balance is base 100 (the
     *  starting balance), not an error, not unknown, not stale. Also
     *  clears the restock timer (no server, no known restock). */
    setPingQuotaBase: () => void;
}

export const useAIStore = create<AIState>((set, get) => {
    // ------------------------------------------------------------------
    // Triple atomic buffer — lock-free SPSC, zero latency
    // (Gary's FreeEQ8 paper pattern: lock-free SPSC triple-buffer).
    //
    // Three buffers, single producer / single consumer:
    //   Buffer A — `messages`: the CONSUMER side. This is the only list
    //     the UI renders. The consumer reads only this buffer.
    //   Buffer B — `stagingMessages`: the PRODUCER side. When a chat is
    //     switched in, the producer copies the incoming chat's messages
    //     here, off the rendered path. It writes only this buffer.
    //   Buffer C — `nextMessages`: the PRODUCER's finished product — the
    //     staged list normalized into ritual-tick (causal) order, held ready to
    //     swap. The producer writes only this buffer.
    //
    // The swap is a single atomic pointer exchange: one `set` flips the
    // consumer's `messages` pointer from the old chat's array to the new
    // chat's array and discards the staging/next buffers in the same
    // update. No locks, no mutexes, no blocking wait — and in this
    // single-threaded JS runtime no Atomics/SharedArrayBuffer either:
    // a zustand `set` is already atomic (subscribers see the old state
    // or the new state, never a partial one), and the three steps below
    // run synchronously in one action, so no frame can render between
    // them. The lock-free SPSC shape is what carries over from the
    // paper, not the literal lock-free primitives.
    //
    // Zero latency in practice: the consumer never waits and never
    // blocks. While the producer builds the staging/next buffers, the
    // old chat's bubbles stay fully visible and interactive — `messages`
    // is written exactly once, in the final swap, so the list is never
    // blank, never torn, and never frozen waiting. The new chat appears
    // the instant the swap lands.
    //
    // INTEGRATION — where this sits in LuciferAI's real architecture
    // (see ~/workspace/lucid-tier-task-token-generation.md):
    //
    // * Generation timeout: the swap NEVER touches generation state
    //   (`isLoading`, `streamingMessage`, `streamStartedAt`,
    //   `lastTokenAt`, `generatingSessionId`). If a generation is in
    //   flight, it keeps running in its origin session: the Python
    //   backend's stall timers (per-character activity, 45s inactivity
    //   / 600s absolute) keep running on the original subprocess — the
    //   switch issues no cancel and resets no timer — and the reply is
    //   routed back to the origin session by `completeStream` (see
    //   `generatingSessionId`). The TS side has no wall-clock timeout
    //   to reset; `lastTokenAt` records token activity only.
    // * Bypass router: NOT in this path, deliberately. The AI chat
    //   (Chain 1: ai:chat → stdio_agent → Python LLMBackend) never
    //   touches the TS BypassRouter, and terminal commands never touch
    //   this store — two stacks that never meet. Routing the switch
    //   through the router would invent a third path. The router is
    //   broken as documented (its `availableModels` is snapshotted
    //   empty forever, `bypassRouter.ts:60-73`, and its success path
    //   calls the nonexistent `TokenTracker.recordUsage()`,
    //   `bypassRouter.ts:188`) — that breakage belongs to the terminal
    //   stack's FixNet/LLM fix, not to this switch.
    // * Task manager: there is NO task queue. `local_ai.ts:17-18`
    //   declares one and never uses it; `chatLocal()` is a single-slot
    //   mutex that throws "Backend is busy" on a second concurrent
    //   call. The switch needs no queue: it is a synchronous atomic
    //   action, so two switches cannot interleave and the last one
    //   wins with no torn state. The in-flight generation is the one
    //   tracked task, recorded here as `generatingSessionId`; the
    //   Python `universal_task_system.py` is not wired into Electron
    //   (only a comment cites it, `scriptExecutor.ts:4,12`).
    // * FixNet: NOT in this path. Nothing in the bubble path calls
    //   FixNet — no FixNet reference exists in AIChat, this store, or
    //   chatBubbles. A fix requested in AI chat (`fix <file>` free
    //   text) is routed by the Python agent (pattern-only fix) and its
    //   result returns as an ordinary assistant message through the
    //   normal chat path, inheriting ritual-tick order and the buffer.
    //   The terminal FixNet path is doubly dead (parser drops the
    //   error text, `intentParser.ts:489-494`; bypass router cannot
    //   run) — the switch is not wired through it.
    //
    // * Ritual ticks: the swap carries a chat's ticks, never re-assigns
    //   or resets them. `normalizeMessageList` only assigns ticks to
    //   messages that do not have one yet (legacy / unstamped data),
    //   in retrieval order from the session's `nextTick` counter, so a
    //   switch between chats never re-numbers a chat's bubbles and
    //   never mixes tick sequences — Alpha's ticks stay with Alpha,
    //   Beta's with Beta. The rendered list is ordered by ritual tick
    //   (causal order); the wall-clock timestamp is display only.
    //
    // INVARIANT: `messages` (buffer A) is written ONLY by `swapToChat`
    // (the atomic swap) and by the ordered insert in `addMessage`.
    // Every other action that changes the displayed list goes through
    // `swapToChat`, so no path can mutate the rendered list in place
    // or bypass the buffer.
    // ------------------------------------------------------------------
    const swapToChat = (incoming: ChatMessage[], extra: Partial<AIState> = {}, startTick?: number) => {
        // PRODUCER: copy the incoming chat into the staging buffer.
        // The displayed list is untouched — the old chat stays up.
        set({ stagingMessages: [...incoming] });
        // PRODUCER: build the next buffer from staging — ritual-tick
        // (causal) order, every bubble stamped with its own
        // id/timestamp, duplicates out. Ticks already on a bubble are
        // kept; only unticked messages take a new tick, in retrieval
        // order from the session's counter.
        const nextBuffer = normalizeMessageList(get().stagingMessages ?? [], startTick);
        // The swap assigned ticks to the unticked bubbles — feed
        // those ticks into the AI chat's OWN tick channel (channel
        // 2, src/lib/aiChatTicks.ts), NOT the event log channel:
        // the tick ordering is the AI chat's, the event log never
        // carries ticks.
        publishNewTicks(
            extra.currentSessionId ?? get().currentSessionId,
            get().stagingMessages ?? [],
            nextBuffer,
        );
        set({ nextMessages: nextBuffer });
        // CONSUMER swap: one atomic update flips the displayed list to
        // the next buffer and discards staging/next. This is the only
        // write to `messages` in the whole switch — and it deliberately
        // does NOT touch any generation state. A generation in flight
        // belongs to its origin session (`generatingSessionId`); it
        // carries over the switch untouched, its timeout and token
        // tracking intact, and its reply is routed home by
        // `completeStream`. When no generation is running, the
        // generation fields are already null/false.
        set({
            ...extra,
            messages: nextBuffer,
            stagingMessages: null,
            nextMessages: null,
        });
    };

    /** End an in-flight generation cleanly: cancel the backend request
     *  (the single-slot mutex's only release) and clear the
     *  generation's UI state. Used when the generation's origin chat
     *  is deleted or all chats are cleared — otherwise the reply
     *  would arrive with nowhere to go. Guarded: cancellation is
     *  best-effort and must never throw out of a delete/clear. */
    const cancelGeneration = () => {
        try {
            void window.lucidAPI.ai.cancelStream();
        } catch {
            // No backend to cancel (already down) — the state clear
            // below is what matters.
        }
        set({
            isLoading: false,
            streamingMessage: '',
            streamStartedAt: null,
            lastTokenAt: null,
            generatingSessionId: null,
        });
    };

    return {
    sessions: [],
    currentSessionId: null,
    messages: [],
    contextDirectory: null,
    isLoading: false,
    isSessionsLoaded: false,
    streamingMessage: '',
    streamStartedAt: null,
    generatingSessionId: null,
    pendingAiPrompt: null,
    lastTokenAt: null,
    pingQuota: null,
    pingQuotaSource: null,
    lastRestockAt: null,
    stagingMessages: null,
    nextMessages: null,
    guestSessionActive: false,
    guestStash: null,

    loadSessions: async () => {
        // A guest never loads the owner's sessions off disk: the
        // visible list stays empty (the guest's own live chats are
        // created fresh below). Mark loaded so the chat still opens
        // with an empty session for the guest to use.
        if (get().guestSessionActive) {
            set({ isSessionsLoaded: true });
            return;
        }
        try {
            const sessions = await window.lucidAPI.ai.getSessions();
            // Sessions come off disk unsorted — normalize each chat's
            // messages into ritual-tick (causal) order once, on load,
            // so every later switch stages an already-ordered list.
            // Unticked messages (legacy data) take ticks in retrieval
            // order from the session's persisted `nextTick` counter,
            // and the counter is carried forward past the highest tick
            // in the chat — so it survives the reload and never
            // restarts from zero and collides with ticks already on
            // the chat's bubbles.
            // The sessions themselves take their causal placement
            // here too (see assignLegacyCausalOrder): the display
            // list is causal-order desc, never last-activity time.
            const normalized = assignLegacyCausalOrder(
                sessions.map((s) => {
                    const messages = normalizeMessageList(s.messages ?? [], s.nextTick);
                    // Unticked legacy bubbles just took their ticks on
                    // load — feed them into the AI chat's OWN tick
                    // channel (channel 2), never the event log.
                    publishNewTicks(s.id, s.messages ?? [], messages);
                    return {
                        ...s,
                        messages,
                        nextTick: Math.max(s.nextTick ?? 0, nextTickFor(messages)),
                    };
                }),
            ).sort(byCausalOrderDesc);
            // Persist the numbers handed out to legacy sessions, so
            // the placement sticks and is never re-derived.
            normalized
                .filter((s) => sessions.find((d) => d.id === s.id)?.causalOrder === undefined)
                .forEach((s) => window.lucidAPI.ai.saveSession(s));
            set({
                sessions: normalized,
                isSessionsLoaded: true,
            });
        } catch (error) {
            console.error('Failed to load sessions:', error);
            set({ isSessionsLoaded: true });
        }
    },

    createSession: () => {
        // A new chat inherits the current chat's model (so starting a
        // fresh chat while talking to TinyLlama keeps TinyLlama), else
        // Auto — no explicit model, the reply takes today's cascade.
        // There is no global model default beyond the cascade: the
        // dropdown's Auto entry IS the default.
        const current = get().sessions.find((s) => s.id === get().currentSessionId);
        // Causal placement: one past the highest number in the list,
        // so the new chat is the newest-created and lands first in
        // causal-order desc. Never re-used, never re-numbered.
        const causalOrder = Math.max(-1, ...get().sessions.map((s) => s.causalOrder ?? -1)) + 1;
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            causalOrder,
            nextTick: 0,
            model: current?.model,
            modelSource: current?.modelSource,
        };

        // New empty chat, through the same atomic swap as any switch —
        // the displayed list is never written directly.
        swapToChat([], {
            sessions: [newSession, ...get().sessions],
            currentSessionId: newSession.id,
        });

        // Save the new session immediately — unless this is a
        // guest's live chat: a guest session is never persisted
        // (it is dropped when the guest session ends).
        if (!get().guestSessionActive) {
            window.lucidAPI.ai.saveSession(newSession);
        }
    },

    selectSession: (id: string) => {
        const { sessions } = get();
        const session = sessions.find((s) => s.id === id);
        if (!session) return;
        // Triple-buffer switch: stage the incoming chat, build the
        // ordered next buffer, atomically swap it in. The old chat
        // stays visible until the swap lands — zero latency, no gap.
        // A generation in flight carries over untouched (see swapToChat).
        // The chat's ritual ticks ride along unchanged — the swap
        // never re-numbers them.
        swapToChat(session.messages, { currentSessionId: id }, session.nextTick);
    },

    setSessionModel: (id, model, modelSource) => {
        const state = get();
        const session = state.sessions.find((s) => s.id === id);
        if (!session) return;
        const updated: ChatSession = { ...session, model, modelSource, updatedAt: Date.now() };
        set({ sessions: state.sessions.map((s) => (s.id === id ? updated : s)) });
        // Persist — the model round-trips through sessions.json with
        // the rest of the session, so the chat remembers it. Not
        // for a guest's live chat: it is never persisted.
        if (!get().guestSessionActive) {
            window.lucidAPI.ai.saveSession(updated);
        }
    },

    deleteSession: async (id: string) => {
        try {
            // A guest's live chat was never written to disk, so
            // there is nothing to delete on disk — only drop it
            // from the visible list.
            if (!get().guestSessionActive) {
                await window.lucidAPI.ai.deleteSession(id);
            }
            const state = get();
            const newSessions = state.sessions.filter((s) => s.id !== id);

            if (state.currentSessionId === id) {
                if (newSessions.length > 0) {
                    // The deleted chat was showing — swap to the next
                    // chat through the same triple buffer, so the list
                    // never blanks or mixes the two chats. That chat's
                    // ritual ticks ride along unchanged.
                    swapToChat(newSessions[0].messages, {
                        sessions: newSessions,
                        currentSessionId: newSessions[0].id,
                    }, newSessions[0].nextTick);
                } else {
                    swapToChat([], {
                        sessions: newSessions,
                        currentSessionId: null,
                    });
                }
            } else {
                set({ sessions: newSessions });
            }

            // The deleted chat was generating: its reply would arrive
            // with nowhere to go. Cancel the in-flight generation
            // (clean handoff) instead of letting it land orphaned.
            if (state.generatingSessionId === id) {
                cancelGeneration();
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    },

    clearSessions: async () => {
        // A guest session must NEVER clear the owner's sessions on
        // disk: sessions.json is the owner's data, and a guest
        // clear only drops the guest's own live chats from view.
        if (get().guestSessionActive) {
            // The guest's own live chats only — the owner's
            // sessions.json is never touched. A guest generation in
            // flight is cancelled like any other clear.
            if (get().generatingSessionId) {
                cancelGeneration();
            }
            swapToChat([], {
                sessions: [],
                currentSessionId: null,
            });
            return;
        }
        try {
            await window.lucidAPI.ai.clearSessions();
            // If a generation was running, its origin chat is gone —
            // cancel it rather than orphaning its reply.
            if (get().generatingSessionId) {
                cancelGeneration();
            }
            swapToChat([], {
                sessions: [],
                currentSessionId: null,
            });
        } catch (error) {
            console.error('Failed to clear sessions:', error);
        }
    },

    enterGuestSession: () => {
        const state = get();
        if (state.guestSessionActive) return;
        set({
            guestSessionActive: true,
            guestStash: {
                sessions: state.sessions,
                currentSessionId: state.currentSessionId,
                messages: state.messages,
                isLoading: state.isLoading,
                generatingSessionId: state.generatingSessionId,
                sessionsLoaded: state.isSessionsLoaded,
            },
            sessions: [],
            currentSessionId: null,
            messages: [],
            isLoading: false,
            generatingSessionId: null,
            streamingMessage: '',
            streamStartedAt: null,
            lastTokenAt: null,
            stagingMessages: null,
            nextMessages: null,
        });
    },

    exitGuestSession: () => {
        const state = get();
        if (!state.guestSessionActive) return;
        const stash = state.guestStash;
        set({
            guestSessionActive: false,
            guestStash: null,
            sessions: stash?.sessions ?? [],
            currentSessionId: stash?.currentSessionId ?? null,
            messages: stash?.messages ?? [],
            isLoading: stash?.isLoading ?? false,
            generatingSessionId: stash?.generatingSessionId ?? null,
            // The stash is only authoritative when the owner's
            // sessions had actually been loaded at guest entry.
            // A guest session entered at boot (before the chat ever
            // loaded) stashed nothing — the no-op loadSessions
            // during the guest session marked loaded without
            // fetching, so load for real now that the veil is off.
            isSessionsLoaded: stash?.sessionsLoaded ?? false,
            streamingMessage: '',
            streamStartedAt: null,
            lastTokenAt: null,
            stagingMessages: null,
            nextMessages: null,
        });
        if (!stash?.sessionsLoaded) {
            void get().loadSessions();
        }
    },

    resetGuestSession: () => {
        const state = get();
        // Outside a guest session the visible state IS the owner's —
        // never clear it. Inside one, the visible state is the
        // previous guest's live data only; drop it for the fresh
        // guest. The stash (owner sessions) is untouched.
        if (!state.guestSessionActive) return;
        set({
            sessions: [],
            currentSessionId: null,
            messages: [],
            isLoading: false,
            generatingSessionId: null,
            streamingMessage: '',
            streamStartedAt: null,
            lastTokenAt: null,
            stagingMessages: null,
            nextMessages: null,
        });
    },

    addMessage: (message: ChatMessage, targetSessionId?: string) => {
        // Route: an explicit target wins; otherwise a message belongs
        // to the in-flight generation's origin session (a reply that
        // completes after the user switched chats lands in the chat it
        // was sent from, not the chat on screen); otherwise the current
        // chat. This is the handoff that keeps a mid-generation switch
        // from putting the reply in the wrong chat.
        const targetId = targetSessionId ?? get().generatingSessionId ?? get().currentSessionId;
        const state = get();
        const targetSession = targetId ? state.sessions.find((s) => s.id === targetId) : undefined;

        if (!targetSession) {
            // A guest session shows the guest's own live chats only:
            // a message aimed at a session that is not visible — an
            // owner's stashed chat, e.g. a reply completing after
            // guest entry — is dropped here, never inserted into the
            // guest's displayed list. The owner's data is never
            // shown to a guest.
            if (get().guestSessionActive) return;
            // No such session (deleted mid-generation without the
            // cancel landing, or no session at all): never silently
            // drop the message — insert it into the displayed list so
            // it stays visible, and say so.
            console.warn('[AI] addMessage target session missing, inserting into displayed list:', targetId);
            set((s) => ({ messages: insertMessageInOrder(s.messages, message) }));
            return;
        }

        // Retrieval is now: this message takes the next ritual tick
        // in the target chat — one past the chat's persisted counter
        // and past the highest tick already on its bubbles, whichever
        // is higher, so the tick can never collide with a tick already
        // in the chat. The tick is the causal order: a late message
        // with an early wall-clock timestamp still takes the newest
        // tick and lands last in the list, while the timestamp it
        // carries is unchanged for display. A tick the message may
        // already carry is NOT honored here — ticks are assigned on
        // retrieval, in this chat, and a foreign tick could collide
        // with this chat's sequence.
        const assignedTick = Math.max(
            targetSession.nextTick ?? 0,
            nextTickFor(targetSession.messages),
        );
        const tickedMessage: ChatMessage = { ...message, ritualTick: assignedTick };
        // The bubble just took its causal tick — issue it into
        // the AI chat's OWN tick channel (channel 2,
        // src/lib/aiChatTicks.ts). NOT the event log: the tick
        // ordering belongs to the AI chat, the event log never
        // carries ticks. A backpressure refusal here does not
        // lose the tick — it is already stamped on the message.
        issueAiChatTick(targetSession.id, message.id, assignedTick);
        // Insert at its ritual-tick position — in between the bubbles
        // in causal order — not appended blindly at the end.
        const newMessages = insertMessageInOrder(targetSession.messages, tickedMessage);
        const updatedSession: ChatSession = {
            ...targetSession,
            messages: newMessages,
            nextTick: assignedTick + 1,
            // Update title based on first user message if it's "New Chat"
            title: targetSession.title === 'New Chat' && message.role === 'user'
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : targetSession.title,
            updatedAt: Date.now(),
        };
        const newSessions = state.sessions.map((s) => (s.id === targetId ? updatedSession : s));

        // Persist the update — unless this is a guest's live chat:
        // a guest session is never persisted to disk.
        if (!get().guestSessionActive) {
            window.lucidAPI.ai.saveSession(updatedSession);
        }

        // The displayed list (buffer A) changes only when the target
        // IS the displayed chat — and then only to the same ordered
        // list, never by in-place mutation. The order is causal
        // placement, not last activity: a reply updates the session
        // (and its updatedAt, for display) but never moves it.
        if (targetId === state.currentSessionId) {
            set({
                messages: newMessages,
                sessions: newSessions.sort(byCausalOrderDesc),
            });
        } else {
            set({ sessions: newSessions.sort(byCausalOrderDesc) });
        }
    },

    updateStreamingMessage: (content: string) => {
        // A guest never sees the owner's stream: while the veil is
        // on, chunks only land when the in-flight generation
        // belongs to a visible (guest) session. A generation still
        // running from before guest entry has its id in the stash,
        // not the visible list — its chunks are dropped, never
        // shown. (Profile switches happen at boot, so this is a
        // belt-and-braces case, not a live path.)
        if (get().guestSessionActive) {
            const genId = get().generatingSessionId;
            if (!genId || !get().sessions.some((s) => s.id === genId)) return;
        }
        // Every chunk is token activity: record when it arrived. This
        // is the activity record Gary's timeout rule runs on — alive
        // while tokens flow, quiet only when they stop — but it drives
        // NO timer here. Stall enforcement lives in the Python backend
        // (`llm_backend.py` 45s inactivity); this side must not impose
        // its own wall-clock kill on top of it.
        const now = Date.now();
        if (content && !get().streamingMessage) {
            // First chunk of a stream: capture when the stream started,
            // so the streaming bubble shows a stable timestamp instead
            // of the render time (which would tick on every re-render).
            set({ streamingMessage: content, streamStartedAt: now, lastTokenAt: now });
        } else {
            set({ streamingMessage: content, lastTokenAt: content ? now : get().lastTokenAt });
        }
    },

    completeStream: () => {
        const { streamingMessage, addMessage } = get();
        if (streamingMessage) {
            // The completed reply is a real message now: it gets its own
            // id and its own timestamp (completion time). addMessage
            // routes it to the generation's origin session (see
            // generatingSessionId), assigns it the next ritual tick in
            // that chat, and inserts it in causal order — so a reply
            // that finishes after a chat switch lands in the chat it
            // belongs to, in order, and is never silently dropped or
            // double-counted (exactly one add, exactly one tick,
            // exactly one timestamp).
            // (streamStartedAt belonged to the transient streaming bubble
            // only — it is cleared below, not carried onto the message.)
            const message: ChatMessage = {
                role: 'assistant',
                content: streamingMessage,
                id: Date.now().toString(),
                timestamp: Date.now(),
            };
            addMessage(message);
            // The generation completed — the Sentinel face's horns
            // wiggle inward once.
            useHornWiggleStore.getState().wiggle();
        }
        // Always release the generation state — even when the stream
        // delivered nothing (empty stream / chunks that parsed to no
        // content). This set() used to live inside the `if` above, so
        // an empty stream left isLoading true forever and the UI
        // stayed stuck generating (red stop button) with no reply and
        // no way out. Nothing is invented here: with no streamed text
        // there is no message to add, only state to release.
        set({
            streamingMessage: '',
            streamStartedAt: null,
            lastTokenAt: null,
            isLoading: false,
            generatingSessionId: null,
        });
    },

    setContextDirectory: (dir: string | null) => {
        set({ contextDirectory: dir });
    },

    // A prompt queued from outside the chat (browser "ask the AI
    // about this page"). AIChat picks it up and sends it; the
    // queue holds one prompt — a second queue replaces the first,
    // so a stale page can never be sent after a newer one.
    queueAiPrompt: (text: string) => {
        if (!text.trim()) return;
        set({ pendingAiPrompt: text });
    },

    clearPendingAiPrompt: () => {
        set({ pendingAiPrompt: null });
    },

    setLoading: (loading: boolean) => {
        // Loading is always tied to the session it started in: a send
        // captures the current chat as the generation's origin, and
        // ending the load releases it. The switch never calls this —
        // it must not steal or clear another chat's generation.
        if (loading) {
            set({ isLoading: true, generatingSessionId: get().currentSessionId });
        } else {
            // A generation ending without a reply (error / cancel)
            // still completes the task — wiggle once, unless
            // completeStream already did (the store debounces
            // double-fires for the same task into one wiggle).
            const wasLoading = get().isLoading;
            set({ isLoading: false, generatingSessionId: null, lastTokenAt: null });
            if (wasLoading) useHornWiggleStore.getState().wiggle();
        }
    },

    setPingQuota: (quota) => {
        if (!quota) {
            set({ pingQuota: null, pingQuotaSource: null });
            return;
        }
        const prev = get().pingQuota;
        set({
            pingQuota: quota,
            pingQuotaSource: 'server',
            // A restock is detected from the quota's `reset` advancing
            // (see pingQuota.ts) — the timer resets to the most
            // recent restock, never to a stale one.
            lastRestockAt: nextLastRestockAt(prev, quota, get().lastRestockAt),
        });
    },

    setPingQuotaBase: () => {
        set({
            pingQuota: basePingQuota(),
            pingQuotaSource: 'base',
            // No server, no known restock — never show a stale timer
            // from an older restock.
            lastRestockAt: null,
        });
    },
    };
});
