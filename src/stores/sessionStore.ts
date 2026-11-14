/**
 * Tab mode — the mode pill (heavy terminal work, 2026-11-13;
 * REBUILT 2026-11-13 ~08:21 PST per Gary's corrections —
 * Warp's in-tab agent flow, see
 * ~/workspace/warp-terminal-flow-2026-11-12.md).
 *
 * ONE session per tab. The pill toggles ONLY the tab's mode —
 * Terminal ↔ Agent — what the prompt does. Nothing spawns,
 * nothing switches views: the agent works IN the terminal tab,
 * in the same feed, on the same screen, through the same prompt
 * input. The pill and ⌘⏎ hand-off NEVER create a session, a
 * tab, or a row. (A separate "New agent conversation" session
 * in a sidebar stack is a DIFFERENT Warp feature — starting a
 * fresh standalone conversation — and it is not what the pill
 * or the hand-off does.)
 *
 * ONE memory per tab (Gary, 2026-11-13 ~08:20 PST: "there is
 * no difference between conversation memory in a terminal tab
 * and terminal input in a terminal"): the tab's input/history
 * IS the conversation memory. Agent prompts are ordinary blocks
 * in the tab's historyStore feed — terminal blocks and agent
 * blocks interleaved in the one BlockList, read the same way.
 * They persist, show in History, and are restored exactly like
 * terminal blocks. There is no separate agent memory, no
 * separate agent block store, no separate agent history. The
 * block KIND ('agent-prompt' / 'notice') is presentation only.
 *
 * The old Option A machinery is GONE: agent sessions in a
 * stack, PILL_SWITCHES_SESSIONS, agent rows in the tab strip,
 * stack numbers, the session title. It was a recommendation in
 * the Warp diagnosis doc, never Gary's decision (Gary,
 * 2026-11-13 ~08:19 PST: "why would it be a session switcher
 * thats mentally retarded and not what we agreed on").
 *
 * Auto-detect AUTO-FLIPS (Warp-like classifier, 2026-11-14):
 * the classifier flips the tab's mode as you type — terminal
 * ↔ agent — with the TERMINAL LOCK (Gary, 2026-11-14 ~03:30
 * PST): any flip TO terminal LOCKS terminal, and the
 * classifier stops auto-flipping to agent until the user
 * explicitly flips back (pill or /agent). Terminal is the
 * locked default; agent is opt-in each time. The lock is the
 * `terminalLocked` map below; `setTabMode` maintains it, so
 * every flip path (pill, ⌘⏎, Esc, /agent, auto-flip) locks
 * and unlocks the same way. A fresh tab starts UNLOCKED (no
 * flip has happened yet), so the classifier can auto-flip on
 * the first prompt-like draft — the lock engages on the first
 * flip to terminal. When unsure, the classifier does not flip
 * at all (the hint line shows the call).
 *
 * GUESTS: a guest never sees agent mode. Entering a guest
 * session resets every tab to terminal mode; the owner's modes
 * are stashed in memory and restored exactly on exit, like the
 * owner's blocks (historyStore's guestStash). setTabMode
 * refuses 'agent' while a guest is veiled in.
 *
 * The driving loop IS here now (steal #4 — Continue,
 * 2026-11-14): submitAgentPrompt records the prompt as a
 * block in the tab's feed, and Terminal.tsx kicks off
 * runAgentTurnForTab (src/lib/agentSession.ts) right after
 * — the loop plans the prompt into tool calls, runs them
 * through the registry + policy gate, and lands the result
 * as an `agent-response` block in the same feed. The
 * "driving intelligence isn't built yet" notice is gone
 * with the placeholder it described: the loop is built,
 * and its brain today is the local planner (a
 * deterministic rule-based planner — no model, no
 * network). The driving-intelligence brain (dissection
 * D4) plugs into the same AgentBrain seam when it lands.
 */

import { create } from 'zustand';
import type { TerminalBlock } from '../types';
import { useTerminalStore } from './terminalStore';
import { useHistoryStore, EMPTY_BLOCKS } from './historyStore';
import { newBlockId } from '../lib/terminalBlocks';

/** A tab's mode — what its prompt does. 'terminal' is the
 *  default: absent from tabMode means terminal. */
export type TabMode = 'terminal' | 'agent';

/** The base/default driving model (Gary, 2026-11-12): the
 *  driving-agent pill shows this until the driving
 *  intelligence lands (step 3) and owns the picker. */
export const DRIVING_AGENT_BASE_MODEL = 'LLMBuilder';

export interface SessionState {
  /** The mode of each tab. Absent = 'terminal'. */
  tabMode: Record<string, TabMode>;

  /** The terminal lock (Gary, 2026-11-14 ~03:30 PST): a tab
   *  is locked when any flip TO terminal happened for it.
   *  Absent = unlocked. While locked, the classifier never
   *  auto-flips the tab to agent — only an explicit flip back
   *  (pill or /agent) unlocks it. A fresh tab starts
   *  unlocked. */
  terminalLocked: Record<string, boolean>;

  /** Wall-clock ms of each tab's last mode set (manual or
   *  auto). The classifier suppresses autodetection for
   *  250 ms after a set, so it never fights a manual choice
   *  (Warp's AUTODETECTION_DISABLE_DURATION_MS). */
  lastManualModeSetAt: Record<string, number>;

  /** Is terminal locked for this tab? Absent = unlocked. */
  isTerminalLocked: (tabId: string) => boolean;

  /** Set a tab's mode. Returns the mode, or null when the flip
   *  was refused — agent mode while a guest session is veiled
   *  in (a guest never sees agent mode). A flip to terminal
   *  LOCKS terminal; a flip to agent UNLOCKS it. */
  setTabMode: (tabId: string, mode: TabMode) => TabMode | null;
  /** Flip a tab's mode. Same refusal as setTabMode. */
  toggleTabMode: (tabId: string) => TabMode | null;
  /** Submit a prompt to a tab in agent mode: the prompt
   *  block, appended to the tab's own feed (historyStore)
   *  like any other block — one memory per tab. The loop
   *  runs separately (runAgentTurnForTab, called by
   *  Terminal.tsx right after this) and lands its result
   *  as an `agent-response` block. Returns false on an
   *  empty prompt or while a guest session is veiled in. */
  submitAgentPrompt: (tabId: string, prompt: string, cwd?: string) => boolean;
  /** Submit a prompt to a tab in agent mode with an instant
   *  reply (greetings / canned questions / context answers):
   *  the prompt block plus a reply block, no model involved,
   *  no driving-intelligence notice. Returns false on an empty
   *  prompt or reply, or while a guest session is veiled in. */
  submitAgentReply: (tabId: string, prompt: string, reply: string, cwd?: string) => boolean;
  /** Test-only reset: clears tab modes (and the veil stash —
   *  see the subscriptions below). */
  resetForTests: () => void;
}

/** A tab's mode — 'terminal' when nothing is recorded. */
export function getTabMode(tabMode: Record<string, TabMode>, tabId: string): TabMode {
  return tabMode[tabId] ?? 'terminal';
}

/** A tab's terminal lock — locked when the map says so,
 *  unlocked when absent (a fresh tab starts unlocked). */
export function getTerminalLocked(terminalLocked: Record<string, boolean>, tabId: string): boolean {
  return terminalLocked[tabId] ?? false;
}

/** A tab's past agent prompts, most recent first — the
 *  composer's Up/Down history in agent mode. They are read from
 *  the tab's own feed (historyStore), not a separate history:
 *  the tab's input history IS the conversation memory. */
export function selectAgentPromptHistory(
  blocksByTab: Record<string, TerminalBlock[]>,
  tabId: string,
): string[] {
  const blocks = blocksByTab[tabId] ?? EMPTY_BLOCKS;
  const prompts: string[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === 'agent-prompt' && b.command) prompts.push(b.command);
  }
  return prompts;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  tabMode: {},
  terminalLocked: {},
  lastManualModeSetAt: {},

  isTerminalLocked: (tabId) => getTerminalLocked(get().terminalLocked, tabId),

  setTabMode: (tabId, mode) => {
    // No agent mode in a guest build — ever.
    if (mode === 'agent' && useHistoryStore.getState().guestSessionActive) return null;
    const now = Date.now();
    set((state) => {
      if (state.tabMode[tabId] === mode) return state;
      // The terminal lock (Gary, 2026-11-14 ~03:30 PST): any
      // flip TO terminal locks it; any flip to agent unlocks
      // it. The timestamp suppresses autodetection for 250 ms
      // after the set, so it never fights a manual choice —
      // and so an auto-flip never flaps straight back.
      return {
        tabMode: { ...state.tabMode, [tabId]: mode },
        terminalLocked: { ...state.terminalLocked, [tabId]: mode === 'terminal' },
        lastManualModeSetAt: { ...state.lastManualModeSetAt, [tabId]: now },
      };
    });
    return mode;
  },

  toggleTabMode: (tabId) => {
    const next = getTabMode(get().tabMode, tabId) === 'agent' ? 'terminal' : 'agent';
    return get().setTabMode(tabId, next);
  },

  submitAgentPrompt: (tabId, prompt, cwd) => {
    const trimmed = prompt.trim();
    if (!trimmed) return false;
    // No agent prompts in a guest build — ever.
    if (useHistoryStore.getState().guestSessionActive) return false;
    const now = Date.now();
    const promptBlock: TerminalBlock = {
      id: newBlockId(now),
      command: trimmed,
      output: '',
      timestamp: now,
      isComplete: true,
      cwd,
      kind: 'agent-prompt',
    };
    // One memory per tab: the prompt lands in the tab's own
    // feed (historyStore) like any other block — it persists,
    // shows in History, and the guest veil stashes it with the
    // rest of the owner's blocks. The loop's result lands as
    // a separate `agent-response` block (runAgentTurnForTab).
    useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, promptBlock]);
    return true;
  },

  submitAgentReply: (tabId, prompt, reply, cwd) => {
    const trimmedPrompt = prompt.trim();
    const trimmedReply = reply.trim();
    if (!trimmedPrompt || !trimmedReply) return false;
    // No agent prompts in a guest build — ever.
    if (useHistoryStore.getState().guestSessionActive) return false;
    const now = Date.now();
    const promptBlock: TerminalBlock = {
      id: newBlockId(now),
      command: trimmedPrompt,
      output: '',
      timestamp: now,
      isComplete: true,
      cwd,
      kind: 'agent-prompt',
    };
    const replyBlock: TerminalBlock = {
      id: newBlockId(now + 1),
      command: '',
      output: trimmedReply,
      timestamp: now + 1,
      isComplete: true,
      cwd,
      kind: 'notice',
    };
    // One memory per tab, like submitAgentPrompt — the reply
    // is an instant answer (greeting / canned question /
    // context answer), not a model call, so there is no
    // driving-intelligence notice on it.
    useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, promptBlock, replyBlock]);
    return true;
  },

  resetForTests: () => {
    stashedTabMode = null;
    stashedTerminalLocked = null;
    guestWasActive = useHistoryStore.getState().guestSessionActive;
    set({ tabMode: {}, terminalLocked: {}, lastManualModeSetAt: {} });
  },
}));

// A guest session veiling in resets every tab to terminal mode
// (see the header): a guest never sees agent mode. The owner's
// modes are stashed in memory and restored exactly on exit —
// like the owner's blocks — for tabs that still exist (a tab
// closed during the guest session does not come back). The
// terminal locks are stashed and restored with the modes, so a
// locked tab comes back locked. This fires on the guest flag's
// transitions only, not on every history change (every PTY
// chunk mutates the store).
let stashedTabMode: Record<string, TabMode> | null = null;
let stashedTerminalLocked: Record<string, boolean> | null = null;
let guestWasActive = false;
useHistoryStore.subscribe((state) => {
  const guestActive = state.guestSessionActive;
  if (guestActive === guestWasActive) return;
  guestWasActive = guestActive;
  if (guestActive) {
    stashedTabMode = useSessionStore.getState().tabMode;
    stashedTerminalLocked = useSessionStore.getState().terminalLocked;
    if (Object.keys(stashedTabMode).length > 0) {
      useSessionStore.setState({ tabMode: {}, terminalLocked: {} });
    }
  } else if (stashedTabMode !== null) {
    const liveIds = new Set(useTerminalStore.getState().tabs.map((t) => t.id));
    const restored: Record<string, TabMode> = {};
    for (const [tabId, mode] of Object.entries(stashedTabMode)) {
      if (liveIds.has(tabId)) restored[tabId] = mode;
    }
    const restoredLocked: Record<string, boolean> = {};
    for (const [tabId, locked] of Object.entries(stashedTerminalLocked ?? {})) {
      if (liveIds.has(tabId)) restoredLocked[tabId] = locked;
    }
    stashedTabMode = null;
    stashedTerminalLocked = null;
    useSessionStore.setState({ tabMode: restored, terminalLocked: restoredLocked });
  }
});

// A closed tab's mode dies with it: tab ids are `terminal-N`
// with the lowest free number reused (terminalStore), so a fresh
// tab must never inherit a dead tab's agent mode — or its lock.
// This fires on every terminal-store change and only writes
// when something actually dropped.
useTerminalStore.subscribe((state) => {
  const liveIds = new Set(state.tabs.map((t) => t.id));
  const mode = useSessionStore.getState().tabMode;
  const locked = useSessionStore.getState().terminalLocked;
  const setAt = useSessionStore.getState().lastManualModeSetAt;
  const keys = new Set([...Object.keys(mode), ...Object.keys(locked), ...Object.keys(setAt)]);
  if ([...keys].every((k) => liveIds.has(k))) return;
  const prune = <T,>(record: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const k of Object.keys(record)) if (liveIds.has(k)) out[k] = record[k];
    return out;
  };
  useSessionStore.setState({
    tabMode: prune(mode),
    terminalLocked: prune(locked),
    lastManualModeSetAt: prune(setAt),
  });
});
