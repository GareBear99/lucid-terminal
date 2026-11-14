/**
 * The agent loop — the driving loop subsystem
 * (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue's CLI loop
 * (`extensions/cli/src/stream/streamChatResponse.ts:443`):
 * a plain `while (true)` — stream a response, execute
 * its tool calls, append the results, repeat — plus the
 * GUI loop's policy gate
 * (`gui/src/redux/thunks/streamNormalInput.ts`):
 * preprocess → evaluate policies → auto-run readonly →
 * pause for approval → continue. The loop ends when the
 * brain returns no tool calls.
 *
 * This closes gap G1 from the driving-intelligence
 * dissection (the pipeline, the tool pass, and the intent
 * gate each exist in LLMBuilder but nothing calls them
 * together): this is the JOIN on Lucid's side — the loop
 * that actually calls the tool pass. The brain behind it
 * is the `AgentBrain` seam (agentBrain.ts): the local
 * planner today, the driving intelligence when D4 lands.
 * The loop never knows which brain answered, and it never
 * calls a model, a network, or a server itself.
 *
 * The run, step by step:
 * 1. Build (or refresh) the workspace index — the loop's
 *    `@codebase`. The index is per-workspace, in-memory,
 *    and cached across turns in this process (guest-safe:
 *    it dies with the app, nothing persists).
 * 2. Plan: the brain turns the prompt into tool calls
 *    (or a text reply when there is nothing to run).
 * 3. Per call, in order: render the status line from the
 *    tool's `wouldLikeTo` → decide the policy → blocked
 *    is a result, not a throw → requires_approval pauses
 *    on the run's approve callback → execute through the
 *    registry (errors come back as context, never thrown)
 *    → edit tools carry their diagnostics in the result.
 * 4. Compose the final reply: one line per tool call
 *    (what it did, or why it did not) + the diagnostics
 *    + the brain's own reply. The run never throws — a
 *    failure anywhere becomes a reply that says so.
 *
 * Approval, stated plainly (a defaulted decision for
 * Gary): a logged-in Agent-mode run auto-approves writes
 * — flipping the pill and asking IS the opt-in, and the
 * terminal-lock rule makes agent opt-in every time. A
 * guest run never auto-approves: the gate says
 * "requires_approval", the loop asks, and with no
 * approval UI yet the answer is denied — the run reports
 * it honestly instead of writing. The Keep/Reject review
 * UI (Zed #6) is the approval surface this pauses for;
 * the pause machinery is already here, the button is not.
 *
 * Re-planning: this slice plans ONCE per prompt. After
 * the tool results come back, the loop does not ask the
 * brain for a second plan — a deterministic planner has
 * nothing new to say about its own results, and a
 * re-planning brain is the driving intelligence (D4).
 * The `while` structure supports a second round when a
 * planning brain lands; the planner just returns one
 * plan today. The max-rounds guard (10) is the same
 * shape as Aider's `max_reflections` cap — the run stops
 * instead of looping forever.
 */

import type { AgentBrain, BrainContext, PlannedToolCall } from './agentBrain';
import { LocalPlanner } from './agentBrain';
import { electronAgentHost, type AgentHost } from './agentHost';
import { AgentFileIndex } from './agentIndex';
import { decideToolPolicy } from './agentPolicy';
import { registerBuiltInTools } from './agentToolsImpl';
import {
  renderToolStatus,
  ToolRegistry,
  type AgentToolResult,
} from './agentTools';

export interface AgentLoopToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: AgentToolResult;
  /** 'allowed' | 'blocked' | 'approval-denied' */
  outcome: 'allowed' | 'blocked' | 'approval-denied';
}

export interface AgentTurnResult {
  /** The final reply text (shown in the tab's feed). */
  reply: string;
  /** Every tool call the run made, in order. */
  toolCalls: AgentLoopToolCallRecord[];
  /** Edits the run made (paths + counts). */
  edits: Array<{ path: string; kind: 'created' | 'edited'; replacements: number }>;
  /** Diagnostics the run's edits left behind. */
  diagnostics: Array<{ path: string; line: number; message: string; code?: string | number }>;
  /** Why the run stopped: 'done' | 'aborted' | 'max-rounds' | 'failed'. */
  stopped: 'done' | 'aborted' | 'max-rounds' | 'failed';
}

export type AgentLoopEvent =
  | { type: 'tool-start'; name: string; status: string }
  | { type: 'tool-done'; name: string; status: string; ok: boolean }
  | { type: 'tool-blocked'; name: string; reason: string }
  | { type: 'approval-requested'; name: string; args: Record<string, unknown> }
  | { type: 'approval-denied'; name: string }
  | { type: 'reply'; reply: string };

export interface AgentLoopOptions {
  prompt: string;
  workspaceRoot: string;
  cwd?: string;
  isGuest?: boolean;
  /** The brain (default: the local planner). */
  brain?: AgentBrain;
  /** The registry (default: the process singleton with
   *  the built-in tools). */
  registry?: ToolRegistry;
  /** The index (default: the per-workspace cache). */
  index?: AgentFileIndex;
  /** The host (default: the Electron host). */
  host?: AgentHost;
  /** Write tools run without pausing (default: true for
   *  logged-in runs, false for guest — see the header). */
  autoApproveWrites?: boolean;
  /** Approval callback, called when the gate says a write
   *  needs approval and autoApproveWrites is false.
   *  Return true to run it, false to refuse. When absent,
   *  the answer is false (deny) — the run reports the
   *  refusal instead of writing. */
  approve?: (call: PlannedToolCall) => Promise<boolean>;
  maxRounds?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentLoopEvent) => void;
}

/** The process registry: built once, with the built-in
 *  tools registered — actual register() calls, never an
 *  empty router (G2, closed). */
let sharedRegistry: ToolRegistry | null = null;
export function getAgentRegistry(): ToolRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new ToolRegistry();
    registerBuiltInTools(sharedRegistry);
  }
  return sharedRegistry;
}

/** The per-workspace index cache (in-memory, per
 *  process — guest-safe by construction). */
const indexCache = new Map<string, AgentFileIndex>();
export function getAgentIndex(root: string, host: AgentHost): AgentFileIndex {
  const cached = indexCache.get(root);
  if (cached) return cached;
  const index = new AgentFileIndex(host);
  indexCache.set(root, index);
  return index;
}

/** Drop a cached index (tests / workspace switch). */
export function dropAgentIndex(root?: string): void {
  if (root === undefined) {
    indexCache.clear();
    return;
  }
  indexCache.delete(root);
}

const DEFAULT_MAX_ROUNDS = 10;

/** How much of one tool's output the final reply
 *  carries (a read the user cannot see is useless —
 *  the cap keeps a huge file from flooding the feed). */
const REPLY_OUTPUT_CAP = 2000;

export async function runAgentTurn(options: AgentLoopOptions): Promise<AgentTurnResult> {
  const prompt = options.prompt.trim();
  const workspaceRoot = options.workspaceRoot;
  const cwd = options.cwd ?? workspaceRoot;
  const isGuest = options.isGuest ?? false;
  const autoApproveWrites = options.autoApproveWrites ?? !isGuest;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const brain: AgentBrain = options.brain ?? new LocalPlanner();
  const registry = options.registry ?? getAgentRegistry();
  const host = options.host ?? electronAgentHost;
  const index = options.index ?? getAgentIndex(workspaceRoot, host);
  const onEvent = options.onEvent ?? (() => undefined);

  const records: AgentLoopToolCallRecord[] = [];
  const edits: AgentTurnResult['edits'] = [];
  const diagnostics: AgentTurnResult['diagnostics'] = [];

  const fail = (reply: string): AgentTurnResult => ({
    reply,
    toolCalls: records,
    edits,
    diagnostics,
    stopped: 'failed',
  });

  try {
    // 1. The index: build once, refresh after — the loop's
    //    @codebase. A build failure is not fatal (the
    //    index-backed tools will say so); the run continues
    //    with what it has.
    if (!index.isBuilt) {
      await index.build(workspaceRoot);
    } else {
      await index.refresh();
    }

    // 2. Plan.
    const brainContext: BrainContext = {
      workspaceRoot,
      cwd,
      openFiles: host.getOpenFiles().map((f) => ({ path: f.path, name: f.name })),
      activeFilePath: host.getActiveFilePath(),
      index,
    };
    const plan = await brain.plan(prompt, brainContext);
    if (options.signal?.aborted) {
      return { reply: 'The run was stopped.', toolCalls: records, edits, diagnostics, stopped: 'aborted' };
    }

    // 3. Execute the plan, one call at a time, in order.
    //    The planner's calls are sequential by design
    //    (Continue's NO_PARALLEL_TOOL_CALLING rule for
    //    edits — earlier edits can mangle later ones).
    let rounds = 0;
    for (const call of plan.toolCalls) {
      if (options.signal?.aborted) {
        return { reply: 'The run was stopped.', toolCalls: records, edits, diagnostics, stopped: 'aborted' };
      }
      if (rounds >= maxRounds) {
        return {
          reply: 'I stopped after 10 tool calls — the run was getting long. Ask me to continue from here.',
          toolCalls: records,
          edits,
          diagnostics,
          stopped: 'max-rounds',
        };
      }
      rounds += 1;
      const definition = registry.get(call.name);
      const status = definition
        ? renderToolStatus(definition.wouldLikeTo, call.args)
        : `call ${call.name}`;
      onEvent({ type: 'tool-start', name: call.name, status });

      // Policy first: blocked is a result, never a throw.
      const decision = decideToolPolicy(definition, call.args, {
        workspaceRoot,
        cwd,
        isGuest,
        autoApproveWrites,
      });
      if (decision.decision === 'blocked') {
        const result: AgentToolResult = { ok: false, output: '', error: decision.reason };
        records.push({ name: call.name, args: call.args, result, outcome: 'blocked' });
        onEvent({ type: 'tool-blocked', name: call.name, reason: decision.reason });
        continue;
      }
      if (decision.decision === 'requires_approval') {
        onEvent({ type: 'approval-requested', name: call.name, args: call.args });
        let approved = false;
        if (options.approve) {
          try {
            approved = await options.approve(call);
          } catch {
            approved = false;
          }
        }
        if (!approved) {
          const result: AgentToolResult = {
            ok: false,
            output: '',
            error: `Approval denied for ${call.name} — the edit was not made.`,
          };
          records.push({ name: call.name, args: call.args, result, outcome: 'approval-denied' });
          onEvent({ type: 'approval-denied', name: call.name });
          continue;
        }
      }

      const result = await registry.call(call.name, call.args, {
        workspaceRoot,
        cwd,
        isGuest,
        host,
        index,
        signal: options.signal,
      });
      records.push({ name: call.name, args: call.args, result, outcome: 'allowed' });
      if (result.edits) edits.push(...result.edits);
      if (result.diagnostics) diagnostics.push(...result.diagnostics);
      const doneStatus = definition
        ? renderToolStatus(definition.hasAlready, call.args)
        : `called ${call.name}`;
      onEvent({ type: 'tool-done', name: call.name, status: doneStatus, ok: result.ok });
    }

    // 4. Compose the reply: one line per call + the
    //    diagnostics + the brain's own words.
    const lines: string[] = [];
    for (const record of records) {
      const definition = registry.get(record.name);
      const label = definition
        ? renderToolStatus(definition.hasAlready, record.args)
        : record.name;
      if (record.outcome === 'blocked') {
        lines.push(`✕ ${label} — blocked: ${record.result.error ?? 'not allowed'}`);
      } else if (record.outcome === 'approval-denied') {
        lines.push(`✕ ${label} — approval denied, not made.`);
      } else if (!record.result.ok) {
        lines.push(`✕ ${label} — failed: ${record.result.error ?? 'unknown error'}`);
      } else {
        // The tool's own output IS the line when it is
        // short; a long output is capped, never dumped
        // whole — but a read the user cannot see is
        // useless, so the reply carries the output itself
        // (up to the cap), not just its first line. The
        // cap keeps a huge file from flooding the feed.
        const output = record.result.output;
        const shown =
          output.length <= REPLY_OUTPUT_CAP
            ? output
            : `${output.slice(0, REPLY_OUTPUT_CAP)}\n… (output truncated)`;
        lines.push(`✓ ${label}${shown ? `\n${shown}` : ''}`);
      }
    }
    if (diagnostics.length > 0) {
      lines.push(
        `Diagnostics (${diagnostics.length}):\n${diagnostics
          .slice(0, 5)
          .map((d) => `  ${d.path}:${d.line}: ${d.message}`)
          .join('\n')}`,
      );
    }
    if (plan.reply) lines.push(plan.reply);
    const reply = lines.length > 0 ? lines.join('\n') : 'Done.';
    onEvent({ type: 'reply', reply });
    return { reply, toolCalls: records, edits, diagnostics, stopped: 'done' };
  } catch (error) {
    // The run never throws — a failure anywhere becomes a
    // reply that says so (Continue's callTool contract, at
    // the loop level).
    return fail(`The agent run failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
