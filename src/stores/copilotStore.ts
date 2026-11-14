/**
 * The copilot tab's state — one thread per copilot, in memory
 * only (Gary, 2026-11-13: the copilot tab in the AI chat).
 *
 * Threads are NEVER persisted: the guest blank-slate rule is
 * not lifted (a guest's threads die with the guest session —
 * the veil below stashes the owner's threads on guest entry
 * and drops the guest's on exit, the same shape as aiStore /
 * historyStore / commandHistoryStore). A logged-in copilot's
 * threads live for the app session; nothing is written to disk
 * and nothing is fed to training candidates.
 *
 * A run's in-flight state is reactive here (runningCopilotId),
 * so the tab's Stop button works — the terminal's owed item
 * (agentSession's module-level in-flight map is not reactive).
 * The AbortController itself lives module-level, like
 * agentSession's.
 */
import { create } from 'zustand';
import { onAgentReviewResolved } from '../lib/agentReview';
import { runCopilotTurn, type CopilotRunInput } from '../lib/copilotRunner';
import type { AgentLoopEvent } from '../lib/agentLoop';
import type { AgentBrain } from '../lib/agentBrain';
import type { AgentHost } from '../lib/agentHost';
import type { AgentReviewBlockData, CopilotConfig } from '../types';
import { useFileStore } from './fileStore';
import { useHistoryStore } from './historyStore';
import { useSettingsStore } from './settingsStore';

export type CopilotMessageKind = 'user' | 'run' | 'review' | 'note';

export interface CopilotMessage {
  id: string;
  timestamp: number;
  kind: CopilotMessageKind;
  /** The prompt, the run's progress lines / final reply, or the note. */
  text?: string;
  /** The review card (kind 'review'). */
  review?: AgentReviewBlockData;
  /** The run this message belongs to. */
  runId?: string;
  /** True while this run message is the live run. */
  inFlight?: boolean;
}

interface CopilotState {
  /** The copilot the tab shows (null until one is picked — the
   * view derives the first copilot when this is stale). */
  activeCopilotId: string | null;
  /** One thread per copilot id. In-memory only, never persisted. */
  threads: Record<string, CopilotMessage[]>;
  /** The copilot with a run in flight (null when none) — the
   * reactive signal the tab's Stop button reads. */
  runningCopilotId: string | null;
  /** Whether the guest veil is on (the visible threads are the
   * guest's; the owner's are stashed). */
  guestSessionActive: boolean;
  /** The owner's threads, stashed on guest entry. Null outside
   * a guest session. Never persisted — memory only. */
  guestStash: Record<string, CopilotMessage[]> | null;

  selectCopilot: (id: string) => void;
  /** Append a message to a copilot's thread. */
  appendMessage: (copilotId: string, message: CopilotMessage) => void;
  /** Update one message in a copilot's thread (by id). */
  updateMessage: (copilotId: string, messageId: string, patch: Partial<CopilotMessage>) => void;
  /** Apply a review resolution to the thread's copy of the card. */
  applyReviewResolution: (resolution: {
    requestId: string;
    status: AgentReviewBlockData['status'];
    checkpointId?: string;
  }) => void;
  /** Send a prompt to a copilot and run the loop in the tab. */
  runPrompt: (
    copilotId: string,
    prompt: string,
    overrides?: { host?: AgentHost; brain?: AgentBrain },
  ) => Promise<void>;
  /** Stop the in-flight run for a copilot (the tab's Stop button). */
  stopRun: (copilotId: string) => void;
  enterGuestSession: () => void;
  exitGuestSession: () => void;
  /** Drop the guest's own threads (a fresh guest replacing the
   * old one) — the veil stays on, the owner's stash untouched. */
  resetGuestSession: () => void;
  resetCopilotForTests: () => void;
}

const runControllers = new Map<string, AbortController>();

function newMessageId(): string {
  return `copilot-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** One progress line per event, the same shape as the terminal
 * feed's run lines (tool-start ✓/✕, verify, blocked). */
function eventLine(event: AgentLoopEvent): string | null {
  switch (event.type) {
    case 'tool-start':
      return `→ ${event.name} — ${event.status}`;
    case 'tool-done':
      return event.ok ? `✓ ${event.name} — ${event.status}` : `✕ ${event.name} — ${event.status}`;
    case 'tool-blocked':
      return `⊘ ${event.name} — ${event.reason}`;
    case 'approval-requested':
      return `… ${event.name} — waiting for your review`;
    case 'approval-denied':
      return `✕ ${event.name} — review denied`;
    case 'verify-start':
      return `→ verifying ${event.path}`;
    case 'verify-done':
      return event.remaining > 0
        ? `✓ verified ${event.path} — ${event.fixed} fixed, ${event.remaining} remaining`
        : `✓ verified ${event.path}`;
    case 'reply':
      return null;
    default:
      return null;
  }
}

export const useCopilotStore = create<CopilotState>()((set, get) => {
  // The review card in a thread flips to kept/rejected through
  // the resolution listener — the feed re-render does not reach
  // here, and the subscription lives in the store (not the view)
  // so the tab learns the outcome even while the AI panel is
  // closed (the view unmounts with it).
  onAgentReviewResolved((resolution) => get().applyReviewResolution(resolution));
  return {
  activeCopilotId: null,
  threads: {},
  runningCopilotId: null,
  guestSessionActive: false,
  guestStash: null,

  selectCopilot: (id) => set({ activeCopilotId: id }),

  appendMessage: (copilotId, message) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [copilotId]: [...(state.threads[copilotId] ?? []), message],
      },
    })),

  updateMessage: (copilotId, messageId, patch) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [copilotId]: (state.threads[copilotId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...patch } : m,
        ),
      },
    })),

  applyReviewResolution: (resolution) =>
    set((state) => {
      let changed = false;
      const threads: Record<string, CopilotMessage[]> = {};
      for (const [copilotId, messages] of Object.entries(state.threads)) {
        threads[copilotId] = messages.map((m) => {
          if (m.kind !== 'review' || m.review?.requestId !== resolution.requestId) return m;
          changed = true;
          return {
            ...m,
            review: {
              ...m.review,
              status: resolution.status,
              ...(resolution.checkpointId !== undefined
                ? { checkpointId: resolution.checkpointId }
                : {}),
            },
          };
        });
      }
      return changed ? { threads } : state;
    }),

  runPrompt: async (copilotId, prompt, overrides) => {
    const settings = useSettingsStore.getState().settings;
    const copilot: CopilotConfig | undefined = settings.copilots.find((c) => c.id === copilotId);
    if (!copilot) return;
    const state = get();
    if (state.runningCopilotId === copilotId) return;
    const workspaceRoot = useFileStore.getState().currentDir;
    const isGuest = useHistoryStore.getState().guestSessionActive;
    const hasCopilotKey = useSettingsStore.getState().hasCopilotApiKey;

    const runId = `copilot-run-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const controller = new AbortController();
    runControllers.set(copilotId, controller);
    set({ runningCopilotId: copilotId });

    get().appendMessage(copilotId, {
      id: newMessageId(),
      timestamp: Date.now(),
      kind: 'user',
      text: prompt,
    });
    const runMessageId = newMessageId();
    get().appendMessage(copilotId, {
      id: runMessageId,
      timestamp: Date.now(),
      kind: 'run',
      text: 'Working…',
      runId,
      inFlight: true,
    });
    const setRunText = (text: string) =>
      get().updateMessage(copilotId, runMessageId, { text });
    const progressLines: string[] = [];

    if (!workspaceRoot) {
      // The copilot works on a workspace (the same rule as the
      // terminal path) — no folder open, no run, and the note
      // says so instead of failing.
      setRunText('Open a folder in the Files tab first — the copilot works on a workspace.');
      get().updateMessage(copilotId, runMessageId, { inFlight: false });
      runControllers.delete(copilotId);
      set({ runningCopilotId: null });
      return;
    }

    const input: CopilotRunInput = {
      copilot,
      prompt,
      workspaceRoot,
      isGuest,
      hasCopilotKey,
      host: overrides?.host,
      brain: overrides?.brain,
      signal: controller.signal,
      onEvent: (event) => {
        const line = eventLine(event);
        if (!line) return;
        progressLines.push(line);
        setRunText(progressLines.join('\n'));
      },
      onReview: (review) => {
        // A profile switch mid-run veils the threads — a review
        // created after the flip belongs to the old session, not
        // the new one, so it is not appended to the visible
        // thread. (The run is aborted by the veil, and the review
        // still resolves as denied through the listener.)
        if (useHistoryStore.getState().guestSessionActive !== isGuest) return;
        get().appendMessage(copilotId, {
          id: newMessageId(),
          timestamp: Date.now(),
          kind: 'review',
          review,
          runId,
        });
      },
    };
    try {
      const result = await runCopilotTurn(input);
      // The run message becomes the reply, the same as the
      // terminal feed (progress lines give way to the result).
      setRunText(result.reply);
    } catch {
      setRunText('The run failed before it could reply — try again.');
    } finally {
      get().updateMessage(copilotId, runMessageId, { inFlight: false });
      runControllers.delete(copilotId);
      set((s) => (s.runningCopilotId === copilotId ? { runningCopilotId: null } : s));
    }
  },

  stopRun: (copilotId) => {
    runControllers.get(copilotId)?.abort();
  },

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    // A run in flight belongs to the session that is ending —
    // abort it (the loop reports 'aborted'; its pending reviews
    // resolve as denied) rather than letting it append into the
    // guest's thread.
    for (const controller of runControllers.values()) controller.abort();
    runControllers.clear();
    set({
      guestSessionActive: true,
      guestStash: state.threads,
      threads: {},
      activeCopilotId: null,
      runningCopilotId: null,
    });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    for (const controller of runControllers.values()) controller.abort();
    runControllers.clear();
    set({
      guestSessionActive: false,
      guestStash: null,
      threads: state.guestStash ?? {},
      activeCopilotId: null,
      runningCopilotId: null,
    });
  },

  resetGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    for (const controller of runControllers.values()) controller.abort();
    runControllers.clear();
    set({ threads: {}, activeCopilotId: null, runningCopilotId: null });
  },

  resetCopilotForTests: () => {
    for (const controller of runControllers.values()) controller.abort();
    runControllers.clear();
    set({
      activeCopilotId: null,
      threads: {},
      runningCopilotId: null,
      guestSessionActive: false,
      guestStash: null,
    });
  },
  };
});
