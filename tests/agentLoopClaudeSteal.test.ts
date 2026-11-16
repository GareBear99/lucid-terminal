// Claude Code steal — the autonomous turn loop
// (query.ts `while (true)` + TodoWriteTool), rebuilt as
// Lucid's own local loop. Every test here FAILS on
// unmodified cea360f (one-shot plan, no history, no
// todos, no turns) and PASSES with the steal.
//
// Claude Code itself is a closed, paid product — there
// is no public source, and nothing here embeds it or
// depends on it. The pattern comes from the leaked
// source snapshot in Gary's repos
// (GareBear99/claude-code-source-code-full,
// GareBear99/full-claude-code-source-archive):
//   src/query.ts:307 — `while (true)`: prompt → model →
//   tool calls → results feed back → repeat until a
//   response with no tool calls; `maxTurns` caps turns.
//   src/tools/TodoWriteTool/ — structured todo list:
//   content / activeForm / pending-in_progress-completed,
//   exactly one in_progress.
// Lucid's version is local and deterministic throughout,
// and nothing applies until Keep (the policy + approve
// path is unchanged).
import { describe, expect, it } from 'vitest';
import { runAgentTurn, type AgentLoopEvent } from '../src/lib/agentLoop';
import {
  LocalPlanner,
  type AgentBrain,
  type BrainContext,
  type BrainPlan,
  type PlannedToolCall,
} from '../src/lib/agentBrain';
import { ToolRegistry } from '../src/lib/agentTools';
import { registerBuiltInTools } from '../src/lib/agentToolsImpl';
import { AgentFileIndex } from '../src/lib/agentIndex';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';

/** A brain that returns a scripted plan per round
 *  (ctx.round), so the loop's re-planning — not the
 *  planner's rules — is what's under test. */
class ScriptedBrain implements AgentBrain {
  constructor(private readonly rounds: BrainPlan[]) {}
  async plan(_prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    const round = ctx.round ?? 0;
    return this.rounds[Math.min(round, this.rounds.length - 1)] ?? { toolCalls: [] };
  }
}

function makeSetup() {
  const host = new MemoryAgentHost(makeTestWorkspace());
  const index = new AgentFileIndex(host);
  const registry = new ToolRegistry();
  registerBuiltInTools(registry);
  return { host, index, registry };
}

describe('claude-code steal — the turn loop re-plans from tool results', () => {
  it('round 2 plans from round 1 results: read, then edit on the next turn', async () => {
    const { host, index, registry } = makeSetup();
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'read_file', args: { filepath: '/ws/src/app.ts' } }] },
      {
        toolCalls: [
          {
            name: 'multi_edit',
            args: {
              filepath: '/ws/src/app.ts',
              edits: [{ old_string: 'const answer = 42;', new_string: 'const answer = 43;' }],
            },
          },
        ],
      },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.turns).toBe(2);
    const names = result.toolCalls.map((c) => c.name);
    expect(names).toContain('read_file');
    expect(names).toContain('multi_edit');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
  });

  it('stops when the brain returns no calls, with the brain’s final reply', async () => {
    const { host, index, registry } = makeSetup();
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'ls', args: { dirPath: '/ws/src' } }] },
      { toolCalls: [], reply: 'all done — two files in src.' },
    ]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.turns).toBe(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.reply).toContain('all done');
  });

  it('maxTurns caps the rounds (Claude Code’s maxTurns)', async () => {
    const { host, index, registry } = makeSetup();
    // A brain with something new to say every round —
    // distinct plans, so the stall guard never fires and
    // only the turn cap stops it.
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'ls', args: { dirPath: '/ws' } }] },
      { toolCalls: [{ name: 'ls', args: { dirPath: '/ws/src' } }] },
      { toolCalls: [{ name: 'ls', args: { dirPath: '/ws/src/nested' } }] },
    ]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
      maxTurns: 2,
    });
    expect(result.stopped).toBe('max-rounds');
    expect(result.turns).toBe(2);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.reply).toContain('2 turns');
  });

  it('an identical plan twice in a row ends the run instead of looping forever', async () => {
    const { host, index, registry } = makeSetup();
    const brain = new ScriptedBrain([{ toolCalls: [{ name: 'ls', args: { dirPath: '/ws' } }] }]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
      maxTurns: 5,
    });
    // Everything the brain asked for already ran — the
    // run is done, not stuck, and the same work is never
    // re-run (no second edit, no second review pause).
    expect(result.stopped).toBe('done');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.reply).toContain('same as the last one');
  });

  it('a failed call is never retried verbatim', async () => {
    const { host, index, registry } = makeSetup();
    const brain = new ScriptedBrain([{ toolCalls: [{ name: 'no_such_tool', args: {} }] }]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
      maxTurns: 3,
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].outcome).toBe('blocked');
    expect(result.stopped).toBe('done');
  });

  it('maxRounds still caps TOTAL tool calls, as before', async () => {
    const { host, index, registry } = makeSetup();
    const calls: PlannedToolCall[] = Array.from({ length: 5 }, () => ({
      name: 'ls',
      args: { dirPath: '/ws' },
    }));
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain: new ScriptedBrain([{ toolCalls: calls }]),
      registry,
      index,
      host,
      maxRounds: 2,
    });
    expect(result.stopped).toBe('max-rounds');
    expect(result.toolCalls).toHaveLength(2);
  });
});

describe('claude-code steal — the todo list (TodoWrite, loop-derived)', () => {
  it('a multi-step run tracks one todo per call, completed in order', async () => {
    const { host, index, registry } = makeSetup();
    const result = await runAgentTurn({
      prompt: "read src/app.ts and replace 'const answer = 42;' with 'const answer = 43;' in src/app.ts",
      workspaceRoot: '/ws',
      brain: new LocalPlanner(),
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0].toolName).toBe('read_file');
    expect(result.todos[1].toolName).toBe('multi_edit');
    // content is the imperative form, activeForm the
    // present continuous — both from the tool's own
    // status triple.
    expect(result.todos[0].content).toContain('/ws/src/app.ts');
    expect(result.todos[0].activeForm).toMatch(/reading/i);
    expect(result.todos[1].activeForm).toMatch(/editing/i);
    expect(result.todos.every((t) => t.status === 'completed')).toBe(true);
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
  });

  it('todo-update events never show two steps in progress at once', async () => {
    const { host, index, registry } = makeSetup();
    const events: AgentLoopEvent[] = [];
    await runAgentTurn({
      prompt: "read src/app.ts and replace 'const answer = 42;' with 'const answer = 43;' in src/app.ts",
      workspaceRoot: '/ws',
      brain: new LocalPlanner(),
      registry,
      index,
      host,
      onEvent: (e) => events.push(e),
    });
    const todoEvents = events.filter((e) => e.type === 'todo-update');
    expect(todoEvents.length).toBeGreaterThan(0);
    let sawInProgress = false;
    for (const e of todoEvents) {
      if (e.type !== 'todo-update') continue;
      // Claude's rule, enforced by the loop: exactly ONE
      // step in_progress at a time — never two, and the
      // in_progress state is visible between start and
      // finish (not just pending → completed).
      const inProgress = e.todos.filter((t) => t.status === 'in_progress');
      expect(inProgress.length).toBeLessThanOrEqual(1);
      if (inProgress.length === 1) sawInProgress = true;
    }
    expect(sawInProgress).toBe(true);
    const last = todoEvents[todoEvents.length - 1];
    if (last.type === 'todo-update') {
      expect(last.todos.every((t) => t.status === 'completed')).toBe(true);
    }
  });

  it('a single-call run has no todo list (Claude’s single-trivial-task rule)', async () => {
    const { host, index, registry } = makeSetup();
    const result = await runAgentTurn({
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      brain: new LocalPlanner(),
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.todos).toHaveLength(0);
  });

  it('a blocked step is never marked completed', async () => {
    const { host, index, registry } = makeSetup();
    const brain = new ScriptedBrain([
      {
        toolCalls: [
          { name: 'ls', args: { dirPath: '/ws/src' } },
          { name: 'no_such_tool', args: {} },
        ],
      },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'anything',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
    });
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0].status).toBe('completed');
    expect(result.todos[1].status).toBe('in_progress');
    expect(result.todos[1].outcome).toBe('blocked');
  });
});

describe('claude-code steal — the planner follows through on what a search found', () => {
  it('search, then fix the file the search named', async () => {
    const { host, index, registry } = makeSetup();
    const result = await runAgentTurn({
      prompt: 'search for greet and fix it',
      workspaceRoot: '/ws',
      brain: new LocalPlanner(),
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.turns).toBeGreaterThanOrEqual(2);
    const names = result.toolCalls.map((c) => c.name);
    expect(names[0]).toBe('codebase_search');
    // Round 2 acts on the file round 1 found — the read
    // carries /ws/src/app.ts, the file `greet` lives in.
    expect(names).toContain('read_file');
    expect(result.toolCalls.find((c) => c.name === 'read_file')?.args.filepath).toBe(
      '/ws/src/app.ts',
    );
  });

  it('a one-shot plan is never re-run on the next turn', async () => {
    const { host, index, registry } = makeSetup();
    const result = await runAgentTurn({
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      brain: new LocalPlanner(),
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.turns).toBe(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('read_file');
  });
});
