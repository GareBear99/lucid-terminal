/**
 * The agent loop, wired into a terminal tab
 * (steal #4 — Continue, 2026-11-14).
 *
 * The JOIN point: Terminal.tsx calls this after
 * `submitAgentPrompt` records the prompt block — the
 * prompt lands in the tab's own feed (one memory per
 * tab), and the loop's run lands there too, as one
 * `agent-response` block that updates in place as the
 * tools run and carries the final reply when the run
 * ends. The feed stays the conversation: prompt, work,
 * result — in order, in the one feed.
 *
 * Guest — the carve-out, stated deliberately (design
 * §4): the terminal guard STAYS. `submitAgentPrompt`
 * still refuses in guest, and this runner refuses too —
 * terminal Agent mode is closed in guest, full stop.
 * What is carved out is the LOOP itself: the loop core
 * (agentLoop.ts) is guest-safe by construction — the
 * index is in-memory, the run persists nothing, no
 * prompt is recorded to training candidates, no session
 * JSON is written — and it takes an explicit `isGuest`
 * flag for the future Files-copilot surface, which Gary
 * allowed on guest ("and that one will be allowed on
 * guest"). That surface will call `runAgentTurn` directly
 * with `isGuest: true`; the terminal path never does.
 * The blank-slate rule is NOT lifted by any of this: a
 * guest run leaves nothing behind.
 *
 * One run per tab at a time (a second submit while a run
 * is in flight is dropped — the composer's own submit
 * guard already prevents it, this is belt and braces).
 * A run whose tab closed mid-flight finishes harmlessly:
 * every block append checks the tab still exists first.
 */

import type { AgentBrain } from './agentBrain';
import type { AgentHost } from './agentHost';
import { electronAgentHost } from './agentHost';
import type { AgentFileIndex } from './agentIndex';
import { dropAgentIndex, runAgentTurn, type AgentTurnResult } from './agentLoop';
import { cancelAgentReviewsForRun, requestAgentReview } from './agentReview';
import type { ToolRegistry } from './agentTools';
import { useAgentPermissionStore } from '../stores/agentPermissionStore';
import { useFileStore } from '../stores/fileStore';
import { useHistoryStore } from '../stores/historyStore';
import { useTerminalStore } from '../stores/terminalStore';
import { newBlockId } from './terminalBlocks';
import type { TerminalBlock } from '../types';

const inFlight = new Map<string, AbortController>();

/** True while a run is in flight for the tab. */
export function isAgentRunInFlight(tabId: string): boolean {
  return inFlight.has(tabId);
}

/** Test reset: forget in-flight runs (no abort — the
 *  runs finish on their own). */
export function resetAgentSessionForTests(): void {
  inFlight.clear();
}

/** Stop the in-flight run for a tab, if any — aborts the
 *  loop's signal, so a review the run is paused on resolves
 *  as denied (the run's finally cancels any review still
 *  pending). False when no run is in flight for the tab.
 *  The Terminal's Stop button is owed on top of this — the
 *  run's in-flight state is module-level, not reactive, so
 *  the button needs a reactive signal first. */
export function stopAgentRun(tabId: string): boolean {
  const controller = inFlight.get(tabId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export interface AgentTabRunOverrides {
  host?: AgentHost;
  brain?: AgentBrain;
  registry?: ToolRegistry;
  index?: AgentFileIndex;
  autoApproveWrites?: boolean;
}

function tabExists(tabId: string): boolean {
  return useTerminalStore.getState().tabs.some((t) => t.id === tabId);
}

function appendBlock(tabId: string, block: TerminalBlock): void {
  if (!tabExists(tabId)) return;
  useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, block]);
}

function updateBlock(tabId: string, blockId: string, output: string): void {
  if (!tabExists(tabId)) return;
  useHistoryStore.getState().setBlocks(tabId, (prev) =>
    prev.map((b) => (b.id === blockId ? { ...b, output } : b)),
  );
}

/**
 * Run the agent loop for a tab's prompt. Returns the
 * turn result, or null when the run did not start (guest
 * veiled in, a run already in flight, or no workspace to
 * work on). Never throws.
 */
export async function runAgentTurnForTab(
  tabId: string,
  prompt: string,
  cwd?: string,
  overrides: AgentTabRunOverrides = {},
): Promise<AgentTurnResult | null> {
  // The terminal guard stays: no agent runs in guest.
  if (useHistoryStore.getState().guestSessionActive) return null;
  if (inFlight.has(tabId)) return null;

  const workspaceRoot = useFileStore.getState().currentDir || cwd;
  if (!workspaceRoot) {
    const now = Date.now();
    appendBlock(tabId, {
      id: newBlockId(now),
      command: '',
      output: 'Open a folder in the Files tab first — the agent works on a workspace.',
      timestamp: now,
      isComplete: true,
      cwd,
      kind: 'agent-response',
    });
    return null;
  }

  const tabCwd = cwd ?? useTerminalStore.getState().tabs.find((t) => t.id === tabId)?.cwd;
  const controller = new AbortController();
  inFlight.set(tabId, controller);

  // The run id ties the run's reviews + checkpoints
  // together (Keep All / Reject All + revert are per-run).
  const runId = `agent-run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionHost = overrides.host ?? electronAgentHost;

  const now = Date.now();
  const responseBlockId = newBlockId(now);
  appendBlock(tabId, {
    id: responseBlockId,
    command: '',
    output: 'Working…',
    timestamp: now,
    isComplete: true,
    cwd: tabCwd,
    kind: 'agent-response',
  });

  const progress: string[] = [];
  const renderProgress = () => {
    updateBlock(tabId, responseBlockId, [...progress, 'Working…'].join('\n'));
  };

  try {
    const result = await runAgentTurn({
      prompt,
      workspaceRoot,
      cwd: tabCwd ?? workspaceRoot,
      isGuest: false,
      host: sessionHost,
      brain: overrides.brain,
      registry: overrides.registry,
      index: overrides.index,
      // The review UI (steal #6 — Zed) is the approval
      // surface: every write pauses for Keep/Reject, with
      // its diff, before it lands. The old default
      // (logged-in auto-approves) is deliberately NOT
      // taken here — the permission model is the escape
      // hatch (a tool set to 'auto' skips the review).
      // An explicit override still wins (tests / a future
      // auto-run mode pass autoApproveWrites: true).
      autoApproveWrites: overrides.autoApproveWrites ?? false,
      permissions: useAgentPermissionStore.getState().getPermissionSet(),
      approve: (call, detail) =>
        requestAgentReview({
          runId,
          tabId,
          call,
          detail,
          host: sessionHost,
          workspaceRoot,
          cwd: tabCwd ?? workspaceRoot,
          signal: controller.signal,
        }),
      signal: controller.signal,
      onEvent: (event) => {
        switch (event.type) {
          case 'tool-start':
            progress.push(`… ${event.status}`);
            renderProgress();
            break;
          case 'tool-done':
            progress[progress.length - 1] = `${event.ok ? '✓' : '✕'} ${event.status}`;
            renderProgress();
            break;
          case 'tool-blocked':
            progress.push(`✕ ${event.name} — blocked: ${event.reason}`);
            renderProgress();
            break;
          case 'approval-requested':
            progress.push(`… ${event.name} — waiting for approval`);
            renderProgress();
            break;
          case 'approval-denied':
            progress.push(`✕ ${event.name} — approval denied, not made.`);
            renderProgress();
            break;
          case 'verify-start':
            progress.push(`… verifying ${event.path}`);
            renderProgress();
            break;
          case 'verify-done':
            progress[progress.length - 1] =
              event.remaining === 0
                ? `✓ verified ${event.path} (fixed ${event.fixed})`
                : `✓ verified ${event.path} (fixed ${event.fixed}, ${event.remaining} remain)`;
            renderProgress();
            break;
          case 'reply':
            break;
        }
      },
    });
    updateBlock(tabId, responseBlockId, result.reply);
    return result;
  } catch (error) {
    const message = `The agent run failed: ${error instanceof Error ? error.message : String(error)}`;
    updateBlock(tabId, responseBlockId, message);
    return {
      reply: message,
      toolCalls: [],
      edits: [],
      diagnostics: [],
      verifications: [],
      stopped: 'failed',
    };
  } finally {
    inFlight.delete(tabId);
    // A review still pending when the run ends (the tab
    // closed, the run aborted) must not linger as pending
    // in the feed — it is resolved as denied.
    cancelAgentReviewsForRun(runId);
  }
}

/** Drop the cached index for a workspace (workspace
 *  switch — the next run rebuilds it). */
export function dropAgentWorkspaceIndex(workspaceRoot: string): void {
  dropAgentIndex(workspaceRoot);
}
