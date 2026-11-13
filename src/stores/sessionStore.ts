/**
 * Terminal sessions — segregation + stacking (heavy terminal work,
 * 2026-11-13 — Warp's agent and terminal are separate sessions in
 * a visible stack; Lucid had terminal tabs only, no Agent mode,
 * no agent sessions, no pill, no stack).
 *
 * THE MODEL: one stack, two kinds.
 * - Terminal sessions are a VIEW over terminalStore.tabs — they
 *   are not duplicated here. A terminal session's id IS its tab
 *   id; its feed is historyStore.blocksByTab[tabId] (the live
 *   session's transcript, restored blocks excluded, exactly as
 *   BlockList reads it today).
 * - Agent sessions are OWNED here: id `agent-N`, title, created
 *   time, the cwd they were started in, blocks attached as
 *   context by the hand-off, and their own block list
 *   (agentBlocksBySession — agent prompts, responses, notices;
 *   never mixed into historyStore, never shown in the History
 *   panel, never persisted to disk).
 * - The active session is `activeSessionId` (an agent id) or
 *   null, which means "the active tab's terminal session".
 *   Switching to a terminal tab clears it (TerminalTabs does
 *   that on select); creating/closing tabs never touches it.
 *
 * PILL FIT — OPEN QUESTION (Gary's call). Option A (recommended
 * in the Warp diagnosis, built here): the mode pill SWITCHES
 * SESSIONS — Terminal ↔ Agent moves between the most recent
 * session of each kind. Option B (not built): the pill picks
 * the mode WITHIN a session. PILL_SWITCHES_SESSIONS below is
 * the single decision point: the pill's click handler reads
 * it. Do not flip it until B is designed — flipping it alone
 * leaves the pill with no behaviour.
 *
 * GUESTS: agent sessions are memory-only and never exist in a
 * guest build (Gary, 2026-11-12 ~17:59 PST — no chat memory,
 * no history in any guest build). createAgentSession refuses
 * while a guest session is veiled in, and any agent sessions
 * alive when a guest session starts are dropped. The owner's
 * agent sessions do not survive a guest session — they are
 * ephemeral by design (Warp persists conversations; Lucid's
 * agent sessions are conversation drafts for the driving
 * intelligence, step 3).
 *
 * The driving intelligence itself is NOT here (step 3 of the
 * endgame order). submitAgentPrompt records the prompt as a
 * block and appends a notice block saying so, honestly — the
 * prompt is kept, nothing is run, nothing is faked.
 */

import { create } from 'zustand';
import type { TerminalBlock } from '../types';
import { useTerminalStore } from './terminalStore';
import { useHistoryStore, EMPTY_BLOCKS } from './historyStore';
import { newBlockId } from '../lib/terminalBlocks';

export type SessionKind = 'terminal' | 'agent';

/**
 * One session in the stack. Terminal sessions are a view over a
 * tab (tabId set, kind 'terminal'); agent sessions are owned
 * here (tabId unset, kind 'agent').
 */
export interface TerminalSession {
  id: string;
  kind: SessionKind;
  title: string;
  createdAt: number;
  /** Terminal sessions: the tab this session is the view over. */
  tabId?: string;
  /** The cwd the session is attached to: the tab's live cwd for
   *  terminal sessions, the cwd the conversation was started in
   *  for agent sessions (the hand-off's attached directory). */
  cwd?: string;
  /** Agent sessions: terminal block ids attached as context by
   *  the hand-off (the failed build, etc.) — the record step 3
   *  reads. Terminal sessions never carry these. */
  attachedBlockIds?: string[];
}

/** PILL FIT (see the header): true = Option A, the pill switches
 *  sessions. The one decision point — Gary's call flips it. */
export const PILL_SWITCHES_SESSIONS = true;

/** The base/default driving model (Gary, 2026-11-12): the
 *  driving-agent pill shows this until the driving
 *  intelligence lands (step 3) and owns the picker. */
export const DRIVING_AGENT_BASE_MODEL = 'LLMBuilder';

/** Agent session ids: `agent-N`, lowest free number reused on
 *  close (same pattern as terminalStore's tab numbers). */
const usedAgentNumbers = new Set<number>();

function lowestFreeAgentNumber(): number {
  let n = 1;
  while (usedAgentNumbers.has(n)) n++;
  return n;
}

function agentNumberFromId(id: string): number | null {
  const match = /^agent-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** The notice an agent session carries until the driving
 *  intelligence lands (step 3): the prompt is recorded, nothing
 *  is run, nothing is faked. */
export const AGENT_NOT_BUILT_NOTICE =
  'The driving intelligence isn\u2019t built yet — this conversation is a placeholder for it (step 3). Your prompt is recorded here; nothing was run.';

/** Title for a fresh agent session, until its first prompt. */
export const NEW_AGENT_SESSION_TITLE = 'New agent conversation';

/** The first prompt becomes the session title (truncated). */
export const AGENT_SESSION_TITLE_MAX = 40;

export function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= AGENT_SESSION_TITLE_MAX) return trimmed;
  return `${trimmed.slice(0, AGENT_SESSION_TITLE_MAX - 1).trimEnd()}…`;
}

export interface SessionState {
  /** Agent sessions owned here, oldest first. Terminal sessions
   *  are a view over terminalStore.tabs (see selectSessions). */
  agentSessions: TerminalSession[];
  /** Agent session blocks, keyed by agent session id. */
  agentBlocksBySession: Record<string, TerminalBlock[]>;
  /** The active agent session id, or null for the active tab's
   *  terminal session. */
  activeSessionId: string | null;

  /** Create an agent session (and switch to it). Returns the id,
   *  or null when a guest session is veiled in (agent sessions
   *  never exist in a guest build). `context` is the hand-off:
   *  the cwd the conversation starts in, terminal block ids
   *  attached as context, and an optional first prompt to submit
   *  immediately (⌘⏎ with a draft sends it). */
  createAgentSession: (context?: {
    cwd?: string;
    attachedBlockIds?: string[];
    firstPrompt?: string;
  }) => string | null;
  /** Close an agent session (and its blocks). If it was active,
   *  the active tab's terminal session becomes active. No-op
   *  for a terminal session id (tabs close through
   *  terminalStore.closeTab). */
  closeAgentSession: (id: string) => void;
  /** Switch to an agent session. */
  switchToAgentSession: (id: string) => void;
  /** Switch to a terminal tab's session: sets the tab active in
   *  terminalStore and clears the agent session. */
  switchToTerminalSession: (tabId: string) => void;
  /** Append a block to an agent session. */
  appendAgentBlock: (sessionId: string, block: TerminalBlock) => void;
  /** Replace an agent session's blocks (value or updater). */
  setAgentBlocks: (
    sessionId: string,
    updater: TerminalBlock[] | ((prev: TerminalBlock[]) => TerminalBlock[]),
  ) => void;
  /** Submit a prompt to an agent session: the prompt block
   *  (which becomes the title when the session is still new)
   *  plus the driving-intelligence notice. Returns false when
   *  the session does not exist. */
  submitAgentPrompt: (sessionId: string, prompt: string) => boolean;
  /** Drop every agent session + its blocks (guest veil). */
  clearAllAgentSessions: () => void;
  /** Test-only reset: clears agent numbers + state (same
   *  precedent as terminalStore.resetForTests). */
  resetForTests: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  agentSessions: [],
  agentBlocksBySession: {},
  activeSessionId: null,

  createAgentSession: (context) => {
    // No agent sessions in a guest build — ever.
    if (useHistoryStore.getState().guestSessionActive) return null;
    const n = lowestFreeAgentNumber();
    usedAgentNumbers.add(n);
    const id = `agent-${n}`;
    const now = Date.now();
    const session: TerminalSession = {
      id,
      kind: 'agent',
      title: NEW_AGENT_SESSION_TITLE,
      createdAt: now,
      cwd: context?.cwd,
      attachedBlockIds: context?.attachedBlockIds,
    };
    set((state) => ({
      agentSessions: [...state.agentSessions, session],
      agentBlocksBySession: { ...state.agentBlocksBySession, [id]: [] },
      activeSessionId: id,
    }));
    const firstPrompt = context?.firstPrompt?.trim();
    if (firstPrompt) get().submitAgentPrompt(id, firstPrompt);
    return id;
  },

  closeAgentSession: (id) => {
    const n = agentNumberFromId(id);
    if (n !== null) usedAgentNumbers.delete(n);
    set((state) => {
      if (!state.agentSessions.some((s) => s.id === id)) return state;
      const agentBlocksBySession = { ...state.agentBlocksBySession };
      delete agentBlocksBySession[id];
      return {
        agentSessions: state.agentSessions.filter((s) => s.id !== id),
        agentBlocksBySession,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    });
  },

  switchToAgentSession: (id) => {
    if (!get().agentSessions.some((s) => s.id === id)) return;
    set({ activeSessionId: id });
  },

  switchToTerminalSession: (tabId) => {
    useTerminalStore.getState().setActiveTab(tabId);
    set({ activeSessionId: null });
  },

  appendAgentBlock: (sessionId, block) => {
    set((state) => {
      if (!state.agentSessions.some((s) => s.id === sessionId)) return state;
      const prev = state.agentBlocksBySession[sessionId] ?? EMPTY_BLOCKS;
      return {
        agentBlocksBySession: {
          ...state.agentBlocksBySession,
          [sessionId]: [...prev, block],
        },
      };
    });
  },

  setAgentBlocks: (sessionId, updater) => {
    set((state) => {
      if (!state.agentSessions.some((s) => s.id === sessionId)) return state;
      const prev = state.agentBlocksBySession[sessionId] ?? EMPTY_BLOCKS;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return state;
      return {
        agentBlocksBySession: { ...state.agentBlocksBySession, [sessionId]: next },
      };
    });
  },

  submitAgentPrompt: (sessionId, prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed) return false;
    const state = get();
    const session = state.agentSessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const now = Date.now();
    const promptBlock: TerminalBlock = {
      id: newBlockId(now),
      command: trimmed,
      output: '',
      timestamp: now,
      isComplete: true,
      cwd: session.cwd,
      kind: 'agent-prompt',
    };
    const noticeBlock: TerminalBlock = {
      id: newBlockId(now + 1),
      command: '',
      output: AGENT_NOT_BUILT_NOTICE,
      timestamp: now + 1,
      isComplete: true,
      cwd: session.cwd,
      kind: 'notice',
    };
    set((s) => {
      const prev = s.agentBlocksBySession[sessionId] ?? EMPTY_BLOCKS;
      const agentSessions =
        session.title === NEW_AGENT_SESSION_TITLE
          ? s.agentSessions.map((x) =>
              x.id === sessionId ? { ...x, title: titleFromPrompt(trimmed) } : x,
            )
          : s.agentSessions;
      return {
        agentSessions,
        agentBlocksBySession: {
          ...s.agentBlocksBySession,
          [sessionId]: [...prev, promptBlock, noticeBlock],
        },
      };
    });
    return true;
  },

  clearAllAgentSessions: () => {
    usedAgentNumbers.clear();
    set({ agentSessions: [], agentBlocksBySession: {}, activeSessionId: null });
  },

  resetForTests: () => {
    usedAgentNumbers.clear();
    set({ agentSessions: [], agentBlocksBySession: {}, activeSessionId: null });
  },
}));

// A guest session veiling in drops every agent session (see the
// header): agent sessions never exist in a guest build. This
// fires on any history-store change while a guest is veiled in —
// including a fresh guest replacing the old one — so a guest's
// agent sessions never linger into the owner's session.
useHistoryStore.subscribe((state) => {
  if (!state.guestSessionActive) return;
  const sessionState = useSessionStore.getState();
  if (sessionState.agentSessions.length > 0 || sessionState.activeSessionId !== null) {
    sessionState.clearAllAgentSessions();
  }
});

/** The terminal session for a tab: the stack's view over
 *  terminalStore.tabs (see the header — never duplicated). */
export function terminalSessionForTab(tab: {
  id: string;
  title: string;
  cwd: string;
}): TerminalSession {
  return {
    id: tab.id,
    kind: 'terminal',
    title: tab.title,
    createdAt: 0,
    tabId: tab.id,
    cwd: tab.cwd,
  };
}

/** The whole stack, in order: terminal tabs in strip order,
 *  then agent sessions oldest first (newest last, Warp-style).
 *  Tabs carry no creation time, so they cannot interleave by
 *  age — terminal sessions first is the settled order. */
export function selectSessions(
  tabs: { id: string; title: string; cwd: string }[],
  agentSessions: TerminalSession[],
): TerminalSession[] {
  return [...tabs.map(terminalSessionForTab), ...agentSessions];
}

/** The active session: the active agent session, or the active
 *  tab's terminal session when no agent session is active. */
export function selectActiveSession(
  tabs: { id: string; title: string; cwd: string }[],
  activeTabId: string | null,
  agentSessions: TerminalSession[],
  activeSessionId: string | null,
): TerminalSession | null {
  if (activeSessionId !== null) {
    return agentSessions.find((s) => s.id === activeSessionId) ?? null;
  }
  const tab = tabs.find((t) => t.id === activeTabId);
  return tab ? terminalSessionForTab(tab) : null;
}

/** The feed blocks for a session — the ONE list the unified feed
 *  renders (see UnifiedFeed). Terminal sessions read the live
 *  transcript from historyStore (restored blocks excluded — the
 *  feed is the live session's transcript, never last session's
 *  record); agent sessions read their own block list. */
export function getFeedBlocksForSession(
  session: TerminalSession | null,
  blocksByTab: Record<string, TerminalBlock[]>,
  agentBlocksBySession: Record<string, TerminalBlock[]>,
): TerminalBlock[] {
  if (!session) return EMPTY_BLOCKS;
  if (session.kind === 'agent') {
    return agentBlocksBySession[session.id] ?? EMPTY_BLOCKS;
  }
  const tabId = session.tabId ?? session.id;
  return (blocksByTab[tabId] ?? EMPTY_BLOCKS).filter((b) => !b.restored);
}

/** An agent session's past prompts, most recent first — the
 *  composer's Up/Down history in agent sessions (the blocks
 *  are the record; no separate history state). */
export function selectAgentPromptHistory(
  agentBlocksBySession: Record<string, TerminalBlock[]>,
  sessionId: string,
): string[] {
  const blocks = agentBlocksBySession[sessionId] ?? EMPTY_BLOCKS;
  const prompts: string[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === 'agent-prompt' && b.command) prompts.push(b.command);
  }
  return prompts;
}
