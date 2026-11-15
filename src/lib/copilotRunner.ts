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
 * gating the pass. Two brains run a turn in this slice: the
 * local planner, and GitHub Copilot (D9, 2026-11-15) — the
 * Copilot API client, cloud and metered by the Copilot
 * subscription. A GitHub Copilot copilot with a saved key
 * but no model listed yet answers as not-ready (the tab
 * lists models), and never silently falls back to the local
 * planner pretending to be Copilot.
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
import { CopilotBrain } from './copilotBrain';
import { getBuiltInToolDefinitions } from './agentToolsImpl';
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
import { useSettingsStore } from '../stores/settingsStore';
import {
  liveDrivingAgentDetection,
  resolveActiveDrivingAgent,
  type ResolvedDrivingAgent,
} from './drivingAgents';
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
  /** The driving agent the run is under (default: the
   *  LLMBuilder tab's pick — resolved from Settings).
   *  Tests pass it explicitly. */
  drivingAgent?: ResolvedDrivingAgent;
  signal?: AbortSignal;
  onEvent?: (event: AgentLoopEvent) => void;
  /** The Copilot brain's streamed words, as they arrive (the
   *  tab shows them while the model plans). */
  onBrainProgress?: (text: string) => void;
  /** A review card the tab should show (the run pauses on it). */
  onReview?: (review: AgentReviewBlockData) => void;
}

/** The reply a copilot that cannot run yet answers with — a
 * state, never an error in the user's face. Without the key it
 * is the unconfigured state (the tab shows the same words);
 * with the key but no model listed yet it is the models state. */
export function copilotNotReadyReply(
  copilot: CopilotConfig,
  hasCopilotKey: boolean,
  hasCopilotModel = true,
): string {
  if (copilot.model === 'github-copilot' && !hasCopilotKey) {
    return 'This copilot is not configured yet — add your GitHub Copilot key in Settings > AI.';
  }
  if (copilot.model === 'github-copilot' && !hasCopilotModel) {
    return 'Copilot models not listed yet — open the copilot tab and refresh the model list.';
  }
  if (copilot.model === 'github-copilot') {
    // A keyed Copilot with a model listed can run — this reply
    // is only reached by a caller that already knows it cannot
    // (a stale settings snapshot); say so plainly instead of
    // claiming a state that is not true.
    return 'This copilot cannot run right now — check the key and the model list in Settings > AI.';
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

  // The driving agent underneath is the LLMBuilder tab's
  // pick (the picker) — the same one the terminal runs
  // under. The copilot's dropdown picks the brain (the
  // copilot); the picker picks the base underneath that
  // allows the pass. An explicit override (tests) runs
  // as given.
  const settings = useSettingsStore.getState().settings;
  const drivingAgent: ResolvedDrivingAgent =
    input.drivingAgent ??
    resolveActiveDrivingAgent(
      settings.drivingAgentTabs,
      settings.activeDrivingAgentTabId,
      liveDrivingAgentDetection(useSettingsStore.getState().hasApiKey, settings.aiModel),
    );

  // The model decides the brain. The local planner plans its
  // own turns; a GitHub Copilot copilot plans through the
  // Copilot API client (D9) — the API model is the tab's pick
  // from the API's own list (settings.copilotApiModel), else
  // the first listed model. A keyed Copilot with no model
  // listed yet answers as not-ready and runs NO tools, rather
  // than the local planner wearing Copilot's name. An explicit
  // brain override (tests, and a future brain) runs as given.
  let brain: AgentBrain | null = input.brain ?? null;
  if (!brain && input.copilot.model === 'local-planner') {
    brain = new LocalPlanner();
  }
  if (!brain && input.copilot.model === 'github-copilot' && input.hasCopilotKey) {
    const apiModel =
      settings.copilotApiModel ?? settings.copilotApiModels[0] ?? null;
    if (apiModel) {
      brain = new CopilotBrain({
        model: apiModel,
        tools: getBuiltInToolDefinitions(),
        onProgress: input.onBrainProgress,
        signal: input.signal,
      });
    }
  }
  if (!brain) {
    const hasCopilotModel =
      input.copilot.model !== 'github-copilot' ||
      settings.copilotApiModel !== null ||
      settings.copilotApiModels.length > 0;
    return {
      reply: copilotNotReadyReply(input.copilot, input.hasCopilotKey, hasCopilotModel),
      toolCalls: [],
      edits: [],
      diagnostics: [],
      verifications: [],
      stopped: 'failed',
      drivingAgent: drivingAgent.agent,
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
      drivingAgent,
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
