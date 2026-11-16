/**
 * The agent loop — the driving loop subsystem
 *
 * The shape: a plain `while (true)` — stream a response,
 * execute its tool calls, append the results, repeat —
 * plus the GUI loop's policy gate: preprocess → evaluate
 * policies → auto-run readonly → pause for approval →
 * continue. The loop ends when the brain returns no tool calls.
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
 *    → edit tools carry their diagnostics in the result
 *    → an edit that leaves diagnostics behind is
 *    VERIFIED (fix_diagnostics):
 *    reflect, fix, re-check, up to 3 reflections, before
 *    the next call. A result already marked verified is
 *    never re-verified.
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
 * UI (Zed #6, agentReview.ts) is the approval surface
 * this pauses for: the terminal path passes
 * autoApproveWrites: false and an `approve` callback
 * wired to the review UI, so every write is shown with
 * its diff before it lands; the permission model
 * (agentPermissions.ts) is the escape hatch — a tool set
 * to 'auto' runs without review. Direct runAgentTurn
 * callers keep the old default (logged-in auto-approves)
 * unless they pass otherwise.
 *
 * Re-planning: the loop
 *  plans AGAIN after every round, from the round's
 *  results (`BrainContext.history`) — the `while (true)`
 *  of Claude Code's `query.ts:307` — until the brain
 *  returns no calls. The LLMBuilder brain answers a re-plan
 *  by never repeating a call an earlier round already ran,
 *  and by following through on what a search found
 *  (agentBrain.ts). The max-turns guard (10) is the same
 *  shape as Aider's `max_reflections` cap — the run stops
 *  instead of looping forever — and the identical-plan
 *  guard stops a brain that has nothing new to say.
 *
 * The loop, and only the loop, owns the run's state
 * (history, todos, turn count): all of it is local to
 * one `runAgentTurn` call, in memory, and dies with the
 * run. Nothing here writes to a profile, a store, or
 * disk — the loop cannot lose, corrupt, or change how a
 * profile's data is stored or restored, and it touches
 * no tab state at all (no tab creation, switching,
 * splitting, or pair/group state).
 */

import type { AgentBrain, BrainContext, BrainRoundResult, PlannedToolCall } from './agentBrain';
import type { AgentTodo } from './agentTodos';
import { AgentTodoList } from './agentTodos';
import { LLMBuilderBrain } from './llmbuilderBrain';
import { extractFileCandidates } from './inputParse';
import { electronAgentHost, type AgentHost } from './agentHost';
import { AgentFileIndex } from './agentIndex';
import { decideToolPolicy } from './agentPolicy';
import { drivingAgentNotReadyReply, type ResolvedDrivingAgent } from './drivingAgents';
import type { AgentPermissionSet } from './agentPermissions';
import { registerBuiltInTools } from './agentToolsImpl';
import {
  renderToolStatus,
  ToolRegistry,
  type AgentToolResult,
} from './agentTools';
import type { DrivingAgentId } from '../types';

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
  /** What the verify loop did, per file it verified. */
  verifications: Array<{ path: string; reflections: number; fixed: number; remaining: number }>;
  /** Why the run stopped: 'done' | 'aborted' | 'max-rounds' | 'failed'. */
  stopped: 'done' | 'aborted' | 'max-rounds' | 'failed';
  /** The driving agent the run was under (the LLMBuilder
   *  tab's pick — the base when none was picked). The feed
   *  can show which agent allowed the pass. */
  drivingAgent: DrivingAgentId;
  /** The run's todo list (Claude Code's TodoWrite, loop-
   *  derived — agentTodos.ts): one todo per planned call,
   *  in plan order. Empty for a single-call run. */
  todos: AgentTodo[];
  /** How many planning rounds (turns) ran. */
  turns: number;
}

export type AgentLoopEvent =
  | { type: 'index-progress'; phase: 'walk' | 'index'; done: number; total: number | null }
  | { type: 'index-done'; files: number }
  | { type: 'tool-start'; name: string; status: string }
  | { type: 'tool-done'; name: string; status: string; ok: boolean }
  | { type: 'tool-blocked'; name: string; reason: string }
  | { type: 'approval-requested'; name: string; args: Record<string, unknown> }
  | { type: 'approval-denied'; name: string }
  | { type: 'verify-start'; path: string }
  | { type: 'verify-done'; path: string; fixed: number; remaining: number }
  | { type: 'todo-update'; todos: AgentTodo[] }
  | { type: 'reply'; reply: string };

/** What the loop hands the approval callback alongside
 *  the call: the rendered wouldLikeTo
 *  line is the review's summary, and the diagnostics are
 *  the reason a verify-step fix call is proposed. */
export interface AgentApprovalDetail {
  /** The rendered wouldLikeTo line ("edit src/app.ts"). */
  summary: string;
  /** Diagnostics the call is about (the verify step's fix
   *  calls only) — the review shows them as the reason. */
  diagnostics?: Array<{ path: string; line: number; message: string; code?: string | number }>;
}

export interface AgentLoopOptions {
  prompt: string;
  workspaceRoot: string;
  cwd?: string;
  isGuest?: boolean;
  /** The brain (default: the LLMBuilder brain). */
  brain?: AgentBrain;
  /** The driving agent the run is under (the LLMBuilder
   *  tab's pick — the caller resolves it from Settings).
   *  When absent, the base (LLMBuilder). A picked agent
   *  that cannot run yet answers as not-ready before the
   *  index builds — the loop never plans under it. */
  drivingAgent?: ResolvedDrivingAgent;
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
  /** The permission set the gate consults. When absent, every tool runs at its default
   *  (readonly 'auto', write 'ask'). */
  permissions?: AgentPermissionSet;
  /** Approval callback, called when the gate says a write
   *  needs approval and autoApproveWrites is false.
   *  Return true to run it, false to refuse. When absent,
   *  the answer is false (deny) — the run reports the
   *  refusal instead of writing. The second argument is
   *  the review detail: the rendered
   *  summary line, plus the diagnostics for a verify-step
   *  fix call. */
  approve?: (call: PlannedToolCall, detail?: AgentApprovalDetail) => Promise<boolean>;
  maxRounds?: number;
  /** The turn cap (Claude Code's `maxTurns` — how many
   *  planning rounds the run may take before it stops.
   *  Default 10. Distinct from `maxRounds`, which still
   *  caps TOTAL tool calls, as before. */
  maxTurns?: number;
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

/** The default turn cap (Claude Code's `maxTurns`). */
const DEFAULT_MAX_TURNS = 10;

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
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const brain: AgentBrain = options.brain ?? new LLMBuilderBrain();
  const registry = options.registry ?? getAgentRegistry();
  const host = options.host ?? electronAgentHost;
  const index = options.index ?? getAgentIndex(workspaceRoot, host);
  const onEvent = options.onEvent ?? (() => undefined);

  const records: AgentLoopToolCallRecord[] = [];
  const edits: AgentTurnResult['edits'] = [];
  const diagnostics: AgentTurnResult['diagnostics'] = [];
  const verifications: AgentTurnResult['verifications'] = [];
  /** The rounds already run this turn — fed back to the
   *  brain on every re-plan (Claude Code's loop). */
  const history: BrainRoundResult[] = [];
  /** The run's todo list (TodoWrite, loop-derived). */
  const todos = new AgentTodoList();
  /** Planning rounds completed (turns). */
  let turns = 0;
  /** Total tool calls made (the maxRounds cap). */
  let callsMade = 0;

  // The driving agent gates the pass (the picker): the
  // base when the caller picked nothing. A picked agent
  // that cannot run yet answers as not-ready below and
  // runs NO tools — the index never builds, the brain
  // never plans. Never silently as another agent.
  const drivingAgent: ResolvedDrivingAgent = options.drivingAgent ?? {
    tab: null,
    agent: 'llmbuilder',
    label: 'LLMBuilder',
    canRun: true,
    notReadyReason: null,
  };

  const fail = (reply: string): AgentTurnResult => ({
    reply,
    toolCalls: records,
    edits,
    diagnostics,
    verifications,
    stopped: 'failed',
    drivingAgent: drivingAgent.agent,
    todos: todos.snapshot(),
    turns,
  });

  if (!drivingAgent.canRun) {
    return fail(drivingAgentNotReadyReply(drivingAgent));
  }

  try {
    // 1. The index — the fast path. The old loop built the
    //    whole index BEFORE planning, over the workspace
    //    root (a home dir: depth 10, up to 50,000 files,
    //    each read up to 500 KB) with no progress event —
    //    so the UI sat at "Working…" for minutes before
    //    planning even started. Now: prepare the task's
    //    files first (the files the prompt names, the open
    //    files, the cwd listing — a handful of reads), plan
    //    from those, and build the full index in the
    //    background with progress events. The index-backed
    //    tools wait for the build (up to 60s) when they
    //    actually need it, instead of the whole run
    //    waiting for it up front.
    const taskPaths = extractFileCandidates(prompt)
      .map((c) => c.text)
      .filter((t) => t.includes('/') || /\.[A-Za-z0-9]{1,10}$/.test(t))
      // indexOne reads absolute paths — a relative
      // candidate resolves under the cwd (a bare filename
      // has no path to resolve, so it is left to the
      // background build's glob, which the brain retries
      // against when it cannot resolve it).
      .map((t) => (t.startsWith('/') ? t : `${cwd.replace(/\/$/, '')}/${t}`));
    const openFilePaths = host.getOpenFiles().map((f) => f.path);
    await index.prepareForTask(workspaceRoot, { cwd, taskPaths, openFiles: openFilePaths });
    // The full build runs in the background (not awaited)
    // — the run plans immediately, and the tools that need
    // the index wait for it (agentToolsImpl.ts). A build
    // failure is not fatal (the index-backed tools will
    // say so); the run continues with what it has.
    const buildPromise = index.isBuilt
      ? index.refresh((progress) => onEvent({ type: 'index-progress', ...progress }))
      : index.build(workspaceRoot, (progress) => onEvent({ type: 'index-progress', ...progress }));
    void buildPromise
      .then(() => {
        onEvent({ type: 'index-done', files: index.getKnownPaths().length });
      })
      .catch(() => {
        // A build failure is not fatal — the index-backed
        // tools will say so, and the run continues.
      });

    // 2. The turn loop (Claude Code's `while (true)` —
    //    query.ts:307): plan a round, run it, feed the
    //    results back as `history`, plan again — until the
    //    brain returns no calls, the turn cap hits, or the
    //    run is stopped. The brain context is rebuilt per
    //    round so the history it sees is current.
    const baseBrainContext: BrainContext = {
      workspaceRoot,
      cwd,
      openFiles: host.getOpenFiles().map((f) => ({ path: f.path, name: f.name })),
      activeFilePath: host.getActiveFilePath(),
      index,
    };
    let stopped: AgentTurnResult['stopped'] = 'done';
    /** The reply of the plan that ENDED the loop (the
     *  no-calls plan) — only that plan's words are final.
     *  An earlier round's reply is stale the moment the
     *  run plans again (it was written before the next
     *  round's work existed). */
    let finalReply: string | undefined;
    /** A stop message that replaces the composed reply
     *  (max-rounds / max-turns / stalled / aborted). */
    let stopReply: string | null = null;
    const samePlan = (a: PlannedToolCall[], b: PlannedToolCall[]): boolean =>
      a.length === b.length &&
      a.every(
        (c, i) =>
          c.name === b[i].name && JSON.stringify(c.args) === JSON.stringify(b[i].args),
      );

    // 3. Execute the plan, one call at a time, in order.
    //    The planner's calls are sequential by design
    //    (Continue's NO_PARALLEL_TOOL_CALLING rule for
    //    edits — earlier edits can mangle later ones).
    //    One call, policy first, is the shared path for
    //    the plan's calls AND the verify step's fix calls
    //    — a fix is a real tool call (audited, gated,
    //    shown), never a silent side write.
    const executeCall = async (
      call: PlannedToolCall,
      approvalDetail?: { diagnostics?: AgentApprovalDetail['diagnostics'] },
    ): Promise<AgentLoopToolCallRecord> => {
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
        permissions: options.permissions,
        drivingAgent: drivingAgent.agent,
      });
      if (decision.decision === 'blocked') {
        const result: AgentToolResult = { ok: false, output: '', error: decision.reason };
        const record: AgentLoopToolCallRecord = { name: call.name, args: call.args, result, outcome: 'blocked' };
        records.push(record);
        onEvent({ type: 'tool-blocked', name: call.name, reason: decision.reason });
        return record;
      }
      if (decision.decision === 'requires_approval') {
        onEvent({ type: 'approval-requested', name: call.name, args: call.args });
        let approved = false;
        if (options.approve) {
          try {
            // The review detail rides along:
            // the rendered summary for every call, plus the
            // diagnostics when this is a verify-step fix call.
            approved = await options.approve(call, {
              summary: status,
              diagnostics: approvalDetail?.diagnostics,
            });
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
          const record: AgentLoopToolCallRecord = { name: call.name, args: call.args, result, outcome: 'approval-denied' };
          records.push(record);
          onEvent({ type: 'approval-denied', name: call.name });
          return record;
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
      const record: AgentLoopToolCallRecord = { name: call.name, args: call.args, result, outcome: 'allowed' };
      records.push(record);
      if (result.edits) edits.push(...result.edits);
      if (result.diagnostics) diagnostics.push(...result.diagnostics);
      // A verification's numbers land here — whether the
      // fix call was planned by the brain ('fix X') or
      // triggered by the verify step after a dirty edit.
      // The step itself never pushes them again.
      if (result.verification) {
        const vPath = typeof call.args.filepath === 'string' ? call.args.filepath : '';
        if (vPath) verifications.push({ path: vPath, ...result.verification });
      }
      const doneStatus = definition
        ? renderToolStatus(definition.hasAlready, call.args)
        : `called ${call.name}`;
      onEvent({ type: 'tool-done', name: call.name, status: doneStatus, ok: result.ok });
      return record;
    };

    for (let turn = 0; ; turn++) {
      if (options.signal?.aborted) {
        stopped = 'aborted';
        stopReply = 'The run was stopped.';
        break;
      }
      if (turn >= maxTurns) {
        stopped = 'max-rounds';
        stopReply = `I stopped after ${maxTurns} turns — the run was getting long. Ask me to continue from here.`;
        break;
      }
      const plan = await brain.plan(prompt, {
        ...baseBrainContext,
        history,
        round: turn,
      });
      if (options.signal?.aborted) {
        stopped = 'aborted';
        stopReply = 'The run was stopped.';
        break;
      }
      // No calls: the brain is done — its reply (if any)
      // is the run's final word.
      if (plan.toolCalls.length === 0) {
        finalReply = plan.reply;
        break;
      }
      // The identical plan twice in a row: the brain has
      // nothing new to say (a deterministic planner that
      // did not read its history, or a brain that plans
      // one fixed set of calls, like the tab session's).
      // Everything it asked for has already run — so the
      // run is DONE, not stuck: re-running the same work
      // would edit the same text twice, or pause for the
      // same review twice. The reply says why it ended.
      if (turn > 0 && samePlan(plan.toolCalls, history[history.length - 1].toolCalls)) {
        finalReply =
          plan.reply ??
          'Nothing new to do — the next step was the same as the last one, so I stopped here.';
        break;
      }

      // The round's todos (TodoWrite): one per planned
      // call, built from the tool's own status triple.
      const todoIndices = todos.addRound(
        plan.toolCalls.map((call) => {
          const definition = registry.get(call.name);
          return {
            name: call.name,
            content: definition
              ? renderToolStatus(definition.wouldLikeTo, call.args)
              : `call ${call.name}`,
            activeForm: definition
              ? renderToolStatus(definition.isCurrently, call.args)
              : `calling ${call.name}`,
          };
        }),
      );
      if (todoIndices.some((i) => i >= 0)) onEvent({ type: 'todo-update', todos: todos.snapshot() });

      const roundStart = records.length;
      for (let i = 0; i < plan.toolCalls.length; i++) {
        const call = plan.toolCalls[i];
        if (options.signal?.aborted) {
          stopped = 'aborted';
          stopReply = 'The run was stopped.';
          break;
        }
        if (callsMade >= maxRounds) {
          stopped = 'max-rounds';
          stopReply =
            'I stopped after 10 tool calls — the run was getting long. Ask me to continue from here.';
          break;
        }
        callsMade += 1;
        const todoIndex = todoIndices[i];
        if (todoIndex >= 0) {
          todos.start(todoIndex);
          onEvent({ type: 'todo-update', todos: todos.snapshot() });
        }
        const record = await executeCall(call);
        if (todoIndex >= 0) {
          todos.finish(todoIndex, record.outcome, record.result.ok);
          onEvent({ type: 'todo-update', todos: todos.snapshot() });
        }

      // The verify step: an edit that
      // leaves diagnostics behind is reflected on, not
      // merely reported. One fix_diagnostics call per
      // edited file, through the same policy + registry
      // path as any call. A result already marked
      // verified (fix_diagnostics itself) is never
      // re-verified, or the reflection would run twice
      // on the same diagnostics.
      if (
        record.outcome === 'allowed' &&
        record.result.ok &&
        record.result.edits &&
        record.result.edits.length > 0 &&
        record.result.diagnostics &&
        record.result.diagnostics.length > 0 &&
        !record.result.verified
      ) {
        const editedPaths = [...new Set(record.result.edits.map((e) => e.path))];
        for (const editedPath of editedPaths) {
          if (options.signal?.aborted) break;
          onEvent({ type: 'verify-start', path: editedPath });
          // The fix call carries the diagnostics it is about:
          // the review shows them as the
          // reason, so the user can judge the fix before it
          // runs — the diagnostics are what the fix proposes
          // to repair.
          const fix = await executeCall(
            { name: 'fix_diagnostics', args: { filepath: editedPath } },
            {
              diagnostics: (record.result.diagnostics ?? []).filter((d) => d.path === editedPath),
            },
          );
          if (fix.outcome === 'allowed' && fix.result.ok && fix.result.verification) {
            // The fix call's diagnostics REPLACE the stale
            // ones for this file — the run reports what is
            // left, never what was already fixed.
            for (let i = diagnostics.length - 1; i >= 0; i--) {
              if (diagnostics[i].path === editedPath) diagnostics.splice(i, 1);
            }
            if (fix.result.diagnostics) diagnostics.push(...fix.result.diagnostics);
          }
          onEvent({
            type: 'verify-done',
            path: editedPath,
            fixed: fix.result.verification?.fixed ?? 0,
            remaining:
              fix.result.verification?.remaining ??
              (record.result.diagnostics ?? []).filter((d) => d.path === editedPath).length,
          });
        }
      }
    }

    // A stop inside the round (aborted / max-rounds)
    // ends the run — the partial round never feeds the
    // next plan.
    if (stopReply) break;

    // The round is done — its results feed the next
    // plan (history), including the verify step's fix
    // calls, which are real calls the planner must not
    // re-propose.
    history.push({
      toolCalls: plan.toolCalls,
      results: records.slice(roundStart).map((r) => ({
        call: { name: r.name, args: r.args },
        ok: r.result.ok,
        output: r.result.output,
        error: r.result.error,
      })),
    });
    turns += 1;
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
    if (verifications.length > 0) {
      for (const v of verifications) {
        if (v.remaining === 0) {
          lines.push(`Verified ${v.path}: fixed ${v.fixed} diagnostic(s) in ${v.reflections} reflection(s).`);
        } else if (v.fixed > 0) {
          lines.push(
            `Verified ${v.path}: fixed ${v.fixed} diagnostic(s) in ${v.reflections} reflection(s) — ${v.remaining} remain.`,
          );
        } else {
          lines.push(`Verified ${v.path}: no safe automatic repair — ${v.remaining} diagnostic(s) remain.`);
        }
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
    if (finalReply) lines.push(finalReply);
    const reply = stopReply ?? (lines.length > 0 ? lines.join('\n') : 'Done.');
    onEvent({ type: 'reply', reply });
    // A stop that lands during the last call (e.g. while the
    // run is paused on a review) never reaches the next
    // iteration's signal check — without this the run would
    // report 'done' for work it never finished. The reply
    // already says what happened (the denial line); the
    // stopped value says the run itself was cut short.
    return {
      reply,
      toolCalls: records,
      edits,
      diagnostics,
      verifications,
      stopped: options.signal?.aborted ? 'aborted' : stopped,
      drivingAgent: drivingAgent.agent,
      todos: todos.snapshot(),
      turns,
    };
  } catch (error) {
    // The run never throws — a failure anywhere becomes a
    // reply that says so (Continue's callTool contract, at
    // the loop level).
    return fail(`The agent run failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
