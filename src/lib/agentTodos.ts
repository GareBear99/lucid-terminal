/**
 * The run's todo list — TodoWrite (loop-derived).
 *
 * Shape adapted from Claude Code's TodoWrite tool
 * (`src/tools/TodoWriteTool/TodoWriteTool.ts` +
 * `src/tools/TodoWriteTool/prompt.ts` in
 * GareBear99/claude-code-source-code-full, and the same
 * tool in the official docs' tools reference at
 * code.claude.com/docs/en/tools-reference):
 * - a structured list, one item per step, each with a
 *   `content` (imperative — "edit src/app.ts") and an
 *   `activeForm` (present continuous — "editing
 *   src/app.ts"), and a status of `pending` /
 *   `in_progress` / `completed`
 * - exactly ONE item `in_progress` at a time — the loop
 *   marks the step it is on before starting it and marks
 *   it completed immediately after finishing it, never
 *   batched at the end
 * - a step is only `completed` when it FULLY succeeded —
 *   a blocked, denied, or failed step stays
 *   `in_progress` with its `outcome` recorded, so the
 *   run never claims work it did not do
 * - multi-step runs use it; a single trivial call does
 *   not need a list, so the list is empty until the run
 *   plans two or more calls (Claude's "when NOT to use"
 *   rule: skip it for a single straightforward task)
 *
 * The Lucid adaptation: the list is LOOP-derived, not
 * brain-planned. Lucid's brain is a deterministic local
 * planner, not a model that can be prompted to "use
 * TodoWrite proactively" — so the loop builds one todo
 * per planned tool call from the tool's own status
 * triple (`wouldLikeTo` → content, `isCurrently` →
 * activeForm, agentTools.ts) and drives the statuses
 * itself as calls execute. The list lives only in the
 * run — in-memory, in the `AgentTurnResult`, never
 * written to a profile, a store, or disk — so it can
 * never interfere with profile persistence.
 */

export type AgentTodoStatus = 'pending' | 'in_progress' | 'completed';

/** What happened to the step ('allowed' ran it — the
 *  result itself says whether it succeeded). */
export type AgentTodoOutcome = 'allowed' | 'blocked' | 'approval-denied';

export interface AgentTodo {
  /** Imperative — "edit src/app.ts". */
  content: string;
  /** Present continuous — "editing src/app.ts". */
  activeForm: string;
  status: AgentTodoStatus;
  /** Set once the step has been attempted. */
  outcome?: AgentTodoOutcome;
  /** The tool call this step is. */
  toolName: string;
}

/** Claude's cap: a list that grows without bound is a
 *  runaway, not a plan. Past the cap, further calls run
 *  without a todo — the run still reports them. */
export const MAX_AGENT_TODOS = 20;

/** The list for one run. One `in_progress` at most, by
 *  construction: `start()` completes nothing itself, it
 *  only moves the pointer — the caller marks the previous
 *  step done first (see `finish()`). */
export class AgentTodoList {
  private readonly items: AgentTodo[] = [];

  /** Build the list for a round's planned calls. Calls
   *  past the cap get no todo. A single call gets none
   *  at all (Claude's single-trivial-task rule) — unless
   *  the run already has a list from an earlier round.
   *  Returns the todo index per call (-1 = no todo). */
  addRound(calls: Array<{ name: string; content: string; activeForm: string }>): number[] {
    if (calls.length < 2 && this.items.length === 0) return calls.map(() => -1);
    return calls.map((call) => {
      if (this.items.length >= MAX_AGENT_TODOS) return -1;
      this.items.push({
        content: call.content,
        activeForm: call.activeForm,
        status: 'pending',
        toolName: call.name,
      });
      return this.items.length - 1;
    });
  }

  /** Mark one step in progress — the step the loop is
   *  about to run. The previously in-progress step must
   *  already have been finished; if it was not (a bug in
   *  the caller), it is left as-is rather than silently
   *  completed — the list never claims work it did not
   *  see finish. */
  start(index: number): void {
    const item = this.items[index];
    if (item) item.status = 'in_progress';
  }

  /** Finish a step: completed only when the call ran AND
   *  succeeded (`ok`). A blocked / denied / failed step
   *  stays `in_progress` with its outcome recorded. */
  finish(index: number, outcome: AgentTodoOutcome, ok: boolean): void {
    const item = this.items[index];
    if (!item) return;
    item.outcome = outcome;
    if (outcome === 'allowed' && ok) item.status = 'completed';
  }

  /** The list as the caller sees it (a copy — the run's
   *  result must not alias the live list). */
  snapshot(): AgentTodo[] {
    return this.items.map((t) => ({ ...t }));
  }

  get length(): number {
    return this.items.length;
  }
}
