/**
 * The copilot runner — one copilot turn in the AI chat's copilot
 * tab (Gary, 2026-11-13: "an AI chat agent that can control the
 * lucid platform within AI chat to build and use files like co
 * pilot would on vs code").
 *
 * This wires the copilot tab onto the loop that is already
 * deployed (Continue agent loop + Aider verify loop + Zed
 * Keep/Reject review); it does NOT rebuild the loop. The
 * copilot asks for a tool, the driving intelligence allows the
 * pass (Gary's definition): the gate is the same
 * decideToolPolicy the terminal path runs through, and the
 * tools are the SAME registry — the copilot gets no set of
 * its own.
 *
 * The difference from the terminal path is the brain: the
 * copilot's model is whichever the copilot picked; the
 * driving intelligence is always the local base underneath,
 * gating the pass. In this slice the only brain that runs a
 * turn is the local planner — a GitHub Copilot copilot with
 * a saved key shows as not-connected-yet (the Copilot
 * connection itself lands in a later build; D9 is still
 * open), and never silently falls back to the local planner
 * pretending to be Copilot.
 *
 * Guest: the runner is called DIRECTLY with isGuest — never
 * through submitAgentPrompt / setTabMode, whose terminal
 * guards stay. The gate's guest rule stands (writes always
 * ask); the review card is the answer. This is the deliberate
 * carve-out Gary ordered for the Files-tab copilot agent; the
 * blank-slate rule is NOT lifted (threads live in the copilot
 * store's memory only, and the guest veil drops them on exit).
 *
 * Every write is reviewed: autoApproveWrites is always false
 * here, the same as the terminal path — the review card is
 * what answers, whether logged-in or guest.
 */
import { electronAgentHost, type AgentHost } from './agentHost';
import { LocalPlanner, type AgentBrain } from './agentBrain';
import {
  runAgentTurn,
  type AgentLoopEvent,
  type AgentTurnResult,
} from './agentLoop';
import {
  cancelAgentReviewsForRun,
  createReviewRequest,
} from './agentReview';
import { useAgentPermissionStore } from '../stores/agentPermissionStore';
import type { AgentReviewBlockData } from '../types';
import type { CopilotConfig } from '../types';

/** The synthetic tab id a copilot review carries. It is NOT a
 * terminal tab — requestAgentReview's tab-exists check would
 * refuse it, which is why the runner goes through
 * createReviewRequest directly. The review machinery treats
 * it as a non-feed surface (updateReviewBlock no-ops for it;
 * the resolution listener carries the outcome to the tab). */
export const COPILOT_REVIEW_TAB_ID = 'copilot';

export interface CopilotRunInput {
  copilot: CopilotConfig;
  prompt: string;
  workspaceRoot: string;
  cwd?: string;
  /** Guest runs go through the same loop with the guest gate. */
  isGuest: boolean;
  /** Whether the Copilot key is saved (Secure Vault). */
  hasCopilotKey: boolean;
  /** The host (default: the Electron host). Tests pass a memory host. */
  host?: AgentHost;
  /** The brain (default: resolved from the copilot's model). */
  brain?: AgentBrain;
  signal?: AbortSignal;
  onEvent?: (event: AgentLoopEvent) => void;
  /** A review card the tab should show (the run pauses on it). */
  onReview?: (review: AgentReviewBlockData) => void;
}

/** The reply a copilot that cannot run yet answers with — a
 * state, never an error in the user's face. Without the key it
 * is the unconfigured state (the tab shows the same words);
 * with the key it is the not-connected-yet state. */
export function copilotNotReadyReply(copilot: CopilotConfig, hasCopilotKey: boolean): string {
  if (copilot.model === 'github-copilot' && !hasCopilotKey) {
    return 'This copilot is not configured yet — add your GitHub Copilot key in Settings > AI.';
  }
  if (copilot.model === 'github-copilot') {
    return 'This copilot is not connected yet — the GitHub Copilot connection lands in a later build. The local planner is the brain that runs today.';
  }
  return `The model "${copilot.model}" is not available.`;
}

/**
 * Run one copilot turn. Returns the loop's result; the caller
 * owns the thread (user prompt, progress, review cards, reply).
 * Never throws — like runAgentTurn, a failed turn reports in
 * its reply.
 */
export async function runCopilotTurn(input: CopilotRunInput): Promise<AgentTurnResult> {
  const runId = `copilot-run-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const host = input.host ?? electronAgentHost;

  // The model decides the brain. Only the local planner has a
  // brain in this slice — a GitHub Copilot copilot with a saved
  // key is still not connected (no Copilot client — D9), so it
  // answers as not-ready and runs NO tools, rather than the
  // local planner wearing Copilot's name. An explicit brain
  // override (tests, and the future Copilot brain) runs as given.
  let brain: AgentBrain | null = input.brain ?? null;
  if (!brain && input.copilot.model === 'local-planner') {
    brain = new LocalPlanner();
  }
  if (!brain) {
    return {
      reply: copilotNotReadyReply(input.copilot, input.hasCopilotKey),
      toolCalls: [],
      edits: [],
      diagnostics: [],
      verifications: [],
      stopped: 'failed',
    };
  }

  try {
    return await runAgentTurn({
      prompt: input.prompt,
      workspaceRoot: input.workspaceRoot,
      cwd: input.cwd,
      isGuest: input.isGuest,
      brain,
      host,
      // Every write is reviewed, logged-in or guest — the
      // review card is the answer.
      autoApproveWrites: false,
      permissions: useAgentPermissionStore.getState().getPermissionSet(),
      approve: async (call, detail) => {
        const created = await createReviewRequest({
          runId,
          tabId: COPILOT_REVIEW_TAB_ID,
          call,
          detail,
          host,
          workspaceRoot: input.workspaceRoot,
          cwd: input.cwd ?? input.workspaceRoot,
          signal: input.signal,
        });
        if (created.kind === 'answered') return created.allowed;
        input.onReview?.(created.blockData);
        return created.promise;
      },
      signal: input.signal,
      onEvent: input.onEvent,
    });
  } finally {
    // A run that ended (or was stopped) must not leave its
    // reviews pending — they resolve as denied, and the
    // resolution listener flips the tab's cards to rejected.
    cancelAgentReviewsForRun(runId);
  }
}
