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
 * Auto-detect stays SUGGEST-ONLY (the hint line only): Warp
 * routes natural language to the agent automatically, Lucid
 * does not — the pill / ⌘⏎ are the explicit switches. That is
 * a deliberate difference from Warp, per the settled design,
 * not an oversight.
 *
 * GUESTS: a guest never sees agent mode. Entering a guest
 * session resets every tab to terminal mode; the owner's modes
 * are stashed in memory and restored exactly on exit, like the
 * owner's blocks (historyStore's guestStash). setTabMode
 * refuses 'agent' while a guest is veiled in.
 *
 * The driving intelligence itself is NOT here (step 3 of the
 * endgame order). submitAgentPrompt records the prompt as a
 * block in the tab's feed and appends a notice block saying so,
 * honestly — the prompt is kept, nothing is run, nothing is
 * faked.
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

/** The notice a tab's agent mode carries until the driving
 *  intelligence lands (step 3): the prompt is recorded, nothing
 *  is run, nothing is faked. */
export const AGENT_NOT_BUILT_NOTICE =
  'The driving intelligence isn\u2019t built yet — this conversation is a placeholder for it (step 3). Your prompt is recorded here; nothing was run.';

export interface SessionState {
  /** The mode of each tab. Absent = 'terminal'. */
  tabMode: Record<string, TabMode>;

  /** Set a tab's mode. Returns the mode, or null when the flip
   *  was refused — agent mode while a guest session is veiled
   *  in (a guest never sees agent mode). */
  setTabMode: (tabId: string, mode: TabMode) => TabMode | null;
  /** Flip a tab's mode. Same refusal as setTabMode. */
  toggleTabMode: (tabId: string) => TabMode | null;
  /** Submit a prompt to a tab in agent mode: the prompt block
   *  plus the driving-intelligence notice, appended to the
   *  tab's own feed (historyStore) like any other block — one
   *  memory per tab. Returns false on an empty prompt or while
   *  a guest session is veiled in. */
  submitAgentPrompt: (tabId: string, prompt: string, cwd?: string) => boolean;
  /** Test-only reset: clears tab modes (and the veil stash —
   *  see the subscriptions below). */
  resetForTests: () => void;
}

/** A tab's mode — 'terminal' when nothing is recorded. */
export function getTabMode(tabMode: Record<string, TabMode>, tabId: string): TabMode {
  return tabMode[tabId] ?? 'terminal';
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

  setTabMode: (tabId, mode) => {
    // No agent mode in a guest build — ever.
    if (mode === 'agent' && useHistoryStore.getState().guestSessionActive) return null;
    set((state) => {
      if (state.tabMode[tabId] === mode) return state;
      return { tabMode: { ...state.tabMode, [tabId]: mode } };
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
    const noticeBlock: TerminalBlock = {
      id: newBlockId(now + 1),
      command: '',
      output: AGENT_NOT_BUILT_NOTICE,
      timestamp: now + 1,
      isComplete: true,
      cwd,
      kind: 'notice',
    };
    // One memory per tab: the prompt lands in the tab's own
    // feed (historyStore) like any other block — it persists,
    // shows in History, and the guest veil stashes it with the
    // rest of the owner's blocks.
    useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, promptBlock, noticeBlock]);
    return true;
  },

  resetForTests: () => {
    stashedTabMode = null;
    guestWasActive = useHistoryStore.getState().guestSessionActive;
    set({ tabMode: {} });
  },
}));

// A guest session veiling in resets every tab to terminal mode
// (see the header): a guest never sees agent mode. The owner's
// modes are stashed in memory and restored exactly on exit —
// like the owner's blocks — for tabs that still exist (a tab
// closed during the guest session does not come back). This
// fires on the guest flag's transitions only, not on every
// history change (every PTY chunk mutates the store).
let stashedTabMode: Record<string, TabMode> | null = null;
let guestWasActive = false;
useHistoryStore.subscribe((state) => {
  const guestActive = state.guestSessionActive;
  if (guestActive === guestWasActive) return;
  guestWasActive = guestActive;
  if (guestActive) {
    stashedTabMode = useSessionStore.getState().tabMode;
    if (Object.keys(stashedTabMode).length > 0) {
      useSessionStore.setState({ tabMode: {} });
    }
  } else if (stashedTabMode !== null) {
    const liveIds = new Set(useTerminalStore.getState().tabs.map((t) => t.id));
    const restored: Record<string, TabMode> = {};
    for (const [tabId, mode] of Object.entries(stashedTabMode)) {
      if (liveIds.has(tabId)) restored[tabId] = mode;
    }
    stashedTabMode = null;
    useSessionStore.setState({ tabMode: restored });
  }
});

// A closed tab's mode dies with it: tab ids are `terminal-N`
// with the lowest free number reused (terminalStore), so a fresh
// tab must never inherit a dead tab's agent mode. This fires on
// every terminal-store change and only writes when something
// actually dropped.
useTerminalStore.subscribe((state) => {
  const liveIds = new Set(state.tabs.map((t) => t.id));
  const mode = useSessionStore.getState().tabMode;
  const keys = Object.keys(mode);
  if (keys.every((k) => liveIds.has(k))) return;
  const pruned: Record<string, TabMode> = {};
  for (const k of keys) if (liveIds.has(k)) pruned[k] = mode[k];
  useSessionStore.setState({ tabMode: pruned });
});
