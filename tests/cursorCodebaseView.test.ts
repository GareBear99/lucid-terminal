// @vitest-environment jsdom
/**
 * Whole-codebase view + multi-file edit pass
 * (sourced from Cursor's own docs: cursor.com/help/ai-features/agent,
 * cursor.com/help/ai-features/plan-mode, and Cursor staff on
 * forum.cursor.com — semantic/embeddings indexing retired in favour
 * of Instant Grep; agents search several candidate terms in parallel,
 * list directories and read files to refine; .cursorignore + .gitignore
 * respected; Agent edits multiple files and fixes errors on its own;
 * edits are reviewed in the diff view and checkpoints roll back).
 *
 * Local, deterministic analogue (no cloud, no embeddings, no model):
 * - the workspace index honours .gitignore / .cursorignore /
 *   .cursorindexingignore and searches several terms at once
 * - @-references (@file / @folder / @symbol / @codebase) resolve
 *   against the index, never guessed; @docs / @web / @git are
 *   honestly unsupported locally
 * - one multi_file_edit plan touches several files, validates ALL
 *   of them before ANYTHING is written, and is reviewed + kept with
 *   a single Keep (one checkpoint per touched file, reverted together)
 * - the loop's verify step re-checks every touched file
 *
 * These tests FAIL on unmodified cea360f (the modules, the tool, and
 * the planner branches do not exist there) and pass with the slice.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { IgnoreSet, parseIgnoreText } from '../src/lib/agentIgnore';
import {
  parseAtReferences,
  resolveAtReferences,
  stripAtReferences,
} from '../src/lib/agentAtRefs';
import { AgentFileIndex } from '../src/lib/agentIndex';
import {
  executeMultiFileEdit,
  parseMultiFilePlan,
} from '../src/lib/agentMultiFileEdit';
import type { BrainContext } from '../src/lib/agentBrain';
import { LLMBuilderBrain } from '../src/lib/llmbuilderBrain';
import type { AgentFileIndex as AgentFileIndexType } from '../src/lib/agentIndex';
import { ToolRegistry } from '../src/lib/agentTools';
import { registerBuiltInTools } from '../src/lib/agentToolsImpl';
import { runAgentTurn } from '../src/lib/agentLoop';
import type { AgentBrain, BrainPlan, PlannedToolCall } from '../src/lib/agentBrain';
import {
  computeReviewPreview,
  createReviewRequest,
  getAgentCheckpoints,
  resetAgentReviewForTests,
  resolveAgentReview,
  revertAgentCheckpoint,
} from '../src/lib/agentReview';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';

const ROOT = '/ws';

function ctxFor(index: AgentFileIndexType, openFiles: BrainContext['openFiles'] = []): BrainContext {
  return {
    workspaceRoot: ROOT,
    cwd: ROOT,
    openFiles,
    activeFilePath: openFiles[0]?.path ?? null,
    index,
  };
}

async function builtIndex(files: Record<string, string>): Promise<{ host: MemoryAgentHost; index: AgentFileIndex }> {
  const host = new MemoryAgentHost(files);
  const index = new AgentFileIndex(host);
  await index.build(ROOT);
  return { host, index };
}

describe('agentIgnore — .gitignore syntax (Cursor: .cursorignore + .gitignore respected)', () => {
  it('matches basenames, directories, anchored paths and **', () => {
    const rules = parseIgnoreText(
      '# comment\n\n*.log\ndist/\n/anchored.txt\n**/gen/**\n',
    );
    const set = new IgnoreSet(rules);
    expect(set.isIgnored('a.log')).toBe(true);
    expect(set.isIgnored('src/deep/b.log')).toBe(true);
    expect(set.isIgnored('dist/bundle.js', false)).toBe(true);
    expect(set.isIgnored('src/dist/x.js', false)).toBe(true);
    expect(set.isIgnored('anchored.txt')).toBe(true);
    expect(set.isIgnored('sub/anchored.txt')).toBe(false);
    expect(set.isIgnored('src/gen/out.js')).toBe(true);
    expect(set.isIgnored('src/app.ts')).toBe(false);
  });

  it('a later ! negation re-includes', () => {
    const set = IgnoreSet.fromTexts(['*.log\n!important.log\n']);
    expect(set.isIgnored('a.log')).toBe(true);
    expect(set.isIgnored('important.log')).toBe(false);
  });

  it('a directory rule ignores everything under it', () => {
    const set = IgnoreSet.fromTexts(['secrets/\n']);
    expect(set.isIgnored('secrets/key.pem')).toBe(true);
    expect(set.isIgnored('secrets', true)).toBe(true);
    expect(set.isIgnored('src/secrets.txt')).toBe(false);
  });
});

describe('agentAtRefs — @-references (Cursor: @file / @folder / @code / @codebase)', () => {
  it('parses file, folder, symbol and codebase mentions', () => {
    const refs = parseAtReferences(
      'fix @src/app.ts using @src/lib/ and @greet across @codebase',
    );
    expect(refs.map((r) => [r.kind, r.target])).toEqual([
      ['file', 'src/app.ts'],
      ['folder', 'src/lib/'],
      ['symbol', 'greet'],
      ['codebase', 'codebase'],
    ]);
  });

  it('parses @docs / @web / @git as their own kinds', () => {
    expect(parseAtReferences('check @docs and @web').map((r) => r.kind)).toEqual([
      'docs',
      'web',
    ]);
  });

  it('stripAtReferences removes the mentions and leaves the instruction', () => {
    expect(stripAtReferences('fix @src/app.ts now', parseAtReferences('fix @src/app.ts now'))).toBe(
      'fix now',
    );
  });

  it('resolves a file against the index, never guesses an unresolved one', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const resolved = resolveAtReferences(parseAtReferences('read @app.ts and @nope.ts'), {
      index,
      workspaceRoot: ROOT,
      cwd: ROOT,
    });
    expect(resolved[0].status).toBe('resolved');
    expect(resolved[0].paths).toEqual(['/ws/src/app.ts']);
    expect(resolved[1].status).toBe('unresolved');
    expect(resolved[1].paths).toBeUndefined();
  });

  it('resolves a folder to the files under it and a symbol to its definitions', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const resolved = resolveAtReferences(parseAtReferences('look at @src/ and @greet'), {
      index,
      workspaceRoot: ROOT,
      cwd: ROOT,
    });
    expect(resolved[0].status).toBe('resolved');
    expect(resolved[0].paths).toContain('/ws/src/app.ts');
    expect(resolved[1].status).toBe('resolved');
    expect(resolved[1].paths).toEqual(['/ws/src/app.ts']);
  });

  it('@docs / @web / @git are honestly unsupported locally — never fetched', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const resolved = resolveAtReferences(parseAtReferences('check @docs'), {
      index,
      workspaceRoot: ROOT,
      cwd: ROOT,
    });
    expect(resolved[0].status).toBe('unsupported');
    expect(resolved[0].reason).toMatch(/local/i);
  });
});

describe('agentIndex — ignore files + multi-term search (Cursor: Instant Grep, local, ignore-aware)', () => {
  it('.gitignore and .cursorignore keep files out of the index', async () => {
    const { index } = await builtIndex({
      ...makeTestWorkspace(),
      '/ws/.gitignore': 'ignored/\n*.log\n',
      '/ws/.cursorignore': 'secret-dir/\n',
      '/ws/ignored/skip.ts': 'export const skip = 1;\n',
      '/ws/noisy.log': 'noise\n',
      '/ws/secret-dir/hidden.ts': 'export const hidden = 1;\n',
      '/ws/kept.ts': 'export const kept = 1;\n',
    });
    expect(index.getFilePaths()).not.toContain('/ws/ignored/skip.ts');
    expect(index.getFilePaths()).not.toContain('/ws/noisy.log');
    expect(index.getFilePaths()).not.toContain('/ws/secret-dir/hidden.ts');
    expect(index.getFilePaths()).toContain('/ws/kept.ts');
    expect(index.getFilePaths()).toContain('/ws/src/app.ts');
    expect(index.search('skip')).toHaveLength(0);
    expect(index.isIgnoredByRules('/ws/ignored/skip.ts')).toBe(true);
    expect(index.isIgnoredByRules('/ws/kept.ts')).toBe(false);
  });

  it('refresh picks up a newly added ignore file', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const index = new AgentFileIndex(host);
    await index.build(ROOT);
    expect(index.getFilePaths()).toContain('/ws/src/app.ts');
    await host.writeFile('/ws/.gitignore', 'src/\n');
    const result = await index.refresh();
    expect(result.files).toBeLessThan(7);
    expect(index.getFilePaths()).not.toContain('/ws/src/app.ts');
  });

  it('searchMultiTerm does not bet on one seed: a file matching both terms ranks first', async () => {
    const { index } = await builtIndex({
      '/ws/a.ts': 'export function loginUser() { return authToken; }\n',
      '/ws/b.ts': 'export function loginPage() { return 1; }\n',
      '/ws/c.ts': 'export const authToken = "x";\n',
    });
    const results = index.searchMultiTerm(['login', 'authToken']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('/ws/a.ts');
    expect(results.map((r) => r.path)).toContain('/ws/b.ts');
    expect(results.map((r) => r.path)).toContain('/ws/c.ts');
  });

  it('searchMultiTerm finds a file matching any one term', async () => {
    const { index } = await builtIndex({
      '/ws/a.ts': 'export const zebra = 1;\n',
      '/ws/b.ts': 'export const mongoose = 1;\n',
    });
    const results = index.searchMultiTerm(['zebra', 'mongoose']);
    expect(results.map((r) => r.path).sort()).toEqual(['/ws/a.ts', '/ws/b.ts']);
  });
});

describe('agentMultiFileEdit — the pure cross-file core', () => {
  const contents = new Map<string, string | null>([
    ['/ws/a.ts', "const x = 'old';\n"],
    ['/ws/b.ts', "const y = 'old';\n"],
  ]);

  it('applies edits to several files in one pass', () => {
    const plan = parseMultiFilePlan({
      files: [
        { filepath: '/ws/a.ts', edits: [{ old_string: "'old'", new_string: "'new'" }] },
        { filepath: '/ws/b.ts', edits: [{ old_string: "'old'", new_string: "'new'" }] },
      ],
    });
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    const { contents: next } = executeMultiFileEdit(contents, plan.plan);
    expect(next.get('/ws/a.ts')).toContain("'new'");
    expect(next.get('/ws/b.ts')).toContain("'new'");
    // The input map is untouched (atomic by construction).
    expect(contents.get('/ws/a.ts')).toContain("'old'");
  });

  it('creates a file when the entry carries content instead of edits', () => {
    const plan = parseMultiFilePlan({
      files: [{ filepath: '/ws/c.ts', content: 'export const c = 1;\n' }],
    });
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    const { contents: next } = executeMultiFileEdit(new Map([['/ws/c.ts', null]]), plan.plan);
    expect(next.get('/ws/c.ts')).toBe('export const c = 1;\n');
  });

  it('one bad edit anywhere fails the whole pass — no file changes', () => {
    const plan = parseMultiFilePlan({
      files: [
        { filepath: '/ws/a.ts', edits: [{ old_string: "'old'", new_string: "'new'" }] },
        { filepath: '/ws/b.ts', edits: [{ old_string: "'missing'", new_string: "'new'" }] },
      ],
    });
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(() => executeMultiFileEdit(contents, plan.plan)).toThrow();
  });

  it('rejects a plan that touches the same file twice and an empty plan', () => {
    expect(
      parseMultiFilePlan({
        files: [
          { filepath: '/ws/a.ts', edits: [{ old_string: 'a', new_string: 'b' }] },
          { filepath: '/ws/a.ts', edits: [{ old_string: 'a', new_string: 'b' }] },
        ],
      }),
    ).toMatchObject({ error: expect.stringMatching(/twice|duplicate/i) });
    expect(parseMultiFilePlan({ files: [] })).toMatchObject({
      error: expect.stringMatching(/non-empty/i),
    });
    expect(parseMultiFilePlan({})).toMatchObject({ error: expect.any(String) });
  });

  it('an edit to a file that does not exist fails (create with content instead)', () => {
    const plan = parseMultiFilePlan({
      files: [{ filepath: '/ws/gone.ts', edits: [{ old_string: 'a', new_string: 'b' }] }],
    });
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(() => executeMultiFileEdit(new Map([['/ws/gone.ts', null]]), plan.plan)).toThrow();
  });
});

describe('multi_file_edit tool — one call, several files, atomic', () => {
  function registryWith(host: MemoryAgentHost, index: AgentFileIndex) {
    const registry = new ToolRegistry();
    registerBuiltInTools(registry);
    return { registry, ctx: { workspaceRoot: ROOT, cwd: ROOT, isGuest: false, host, index } };
  }

  it('edits two files and the index sees the new content', async () => {
    // Plain-text files on purpose: the point here is the
    // atomic pass + the index update, not the TS-LSP
    // pre-flight (the loop test below covers that on .ts
    // files) — and a .txt edit never spins up the language
    // engine, so this test stays fast under parallel load.
    const { host, index } = await builtIndex({
      '/ws/a.txt': 'hello old\n',
      '/ws/b.txt': 'world old\n',
    });
    const { registry, ctx } = registryWith(host, index);
    const result = await registry.call(
      'multi_file_edit',
      {
        files: [
          {
            filepath: 'a.txt',
            edits: [{ old_string: 'old', new_string: 'new' }],
          },
          {
            filepath: 'b.txt',
            edits: [{ old_string: 'old', new_string: 'new' }],
          },
        ],
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.edits).toHaveLength(2);
    expect(await host.readFile('/ws/a.txt')).toContain('new');
    expect(await host.readFile('/ws/b.txt')).toContain('new');
    expect(index.search('new').map((r) => r.path).sort()).toEqual(['/ws/a.txt', '/ws/b.txt']);
  });

  it('a failure in the second file leaves the first file untouched', async () => {
    const { host, index } = await builtIndex({
      '/ws/a.txt': 'hello old\n',
      '/ws/b.txt': 'world old\n',
    });
    const { registry, ctx } = registryWith(host, index);
    const before = await host.readFile('/ws/a.txt');
    const result = await registry.call(
      'multi_file_edit',
      {
        files: [
          { filepath: 'a.txt', edits: [{ old_string: 'old', new_string: 'new' }] },
          { filepath: 'b.txt', edits: [{ old_string: 'no-such-text', new_string: 'x' }] },
        ],
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(await host.readFile('/ws/a.txt')).toBe(before);
    expect(await host.readFile('/ws/b.txt')).toContain('old');
  });

  it('refuses a denied (secrets) path anywhere in the plan', async () => {
    const { host, index } = await builtIndex(makeTestWorkspace());
    const { registry, ctx } = registryWith(host, index);
    const result = await registry.call(
      'multi_file_edit',
      {
        files: [
          { filepath: 'src/app.ts', edits: [{ old_string: 'greet', new_string: 'welcome' }] },
          { filepath: '.env', edits: [{ old_string: 'SECRET', new_string: 'OPEN' }] },
        ],
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(await host.readFile('/ws/src/app.ts')).toContain('greet');
    expect(await host.readFile('/ws/.env')).toContain('SECRET');
  });
});

describe('LLMBuilderBrain — @-references and multi-file renames', () => {
  it("@file scopes the edit to that file (the mention is not the edit text)", async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan(
      "replace 'greet' with 'welcome' in @src/app.ts",
      ctxFor(index),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('multi_edit');
    expect(plan.toolCalls[0].args.filepath).toBe('/ws/src/app.ts');
  });

  it('@codebase turns the rest of the prompt into a codebase search', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan('@codebase where is greet defined', ctxFor(index));
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('codebase_search');
    expect(String(plan.toolCalls[0].args.query)).not.toContain('@codebase');
  });

  it('@folder alone lists that folder', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan('list @src/', ctxFor(index));
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('ls');
  });

  it('an unresolved @file is named, never guessed', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan('read @nope.ts', ctxFor(index));
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toContain('nope.ts');
  });

  it('@docs is answered honestly instead of planned as a file op', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan('@docs how do I use this library', ctxFor(index));
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toMatch(/local|not available|can.t/i);
  });

  it('rename across two named files plans ONE multi_file_edit call', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan(
      "rename greet to welcome in src/app.ts and src/util.ts",
      ctxFor(index),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('multi_file_edit');
    const files = plan.toolCalls[0].args.files as Array<{ filepath: string; edits: unknown[] }>;
    expect(files.map((f) => f.filepath).sort()).toEqual(['/ws/src/app.ts', '/ws/src/util.ts']);
    expect(files.every((f) => f.edits.length === 1)).toBe(true);
  });

  it('rename across the codebase searches first instead of guessing files', async () => {
    const { index } = await builtIndex(makeTestWorkspace());
    const plan = await new LLMBuilderBrain().plan(
      'rename greet to welcome across the codebase',
      ctxFor(index),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('codebase_search');
    expect(plan.reply).toMatch(/rename/i);
  });
});

describe('agentLoop — one multi-file pass, one re-check across all touched files', () => {
  it('a planned multi_file_edit lands in both files in one run', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const index = new AgentFileIndex(host);
    const brain: AgentBrain = {
      async plan(): Promise<BrainPlan> {
        return {
          toolCalls: [
            {
              name: 'multi_file_edit',
              args: {
                files: [
                  { filepath: 'src/app.ts', edits: [{ old_string: 'greet', new_string: 'welcome' }] },
                  { filepath: 'src/util.ts', edits: [{ old_string: 'helper', new_string: 'assistant' }] },
                ],
              },
            },
          ],
        };
      },
    };
    const result = await runAgentTurn({
      prompt: 'rename greet',
      workspaceRoot: ROOT,
      host,
      index,
      brain,
      autoApproveWrites: true,
    });
    expect(result.stopped).toBe('done');
    expect(result.edits.map((e) => e.path).sort()).toEqual(['/ws/src/app.ts', '/ws/src/util.ts']);
    expect(await host.readFile('/ws/src/app.ts')).toContain('welcome');
    expect(await host.readFile('/ws/src/util.ts')).toContain('assistant');
    // The first TS-LSP spin-up in a worker is slow (the
    // suite's other engine tests take ~9s alone) — the
    // 10s default flakes under parallel load, so this one
    // test carries a longer timeout for the engine only.
  }, 30000);

  it('the verify step re-checks EVERY touched file, not just the first', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const index = new AgentFileIndex(host);
    await index.build(ROOT);
    const fixed: string[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        type: 'function',
        function: {
          name: 'multi_file_edit',
          description: 'fake multi-file edit',
          parameters: { type: 'object', required: ['files'], properties: {} },
        },
        displayTitle: 'Multi Edit',
        wouldLikeTo: 'edit multiple files',
        isCurrently: 'editing multiple files',
        hasAlready: 'edited multiple files',
        readonly: false,
        isInstant: false,
        group: 'built-in',
        defaultPolicy: 'allowedWithoutPermission',
      },
      async () => ({
        ok: true,
        output: 'Edited 2 files.',
        edits: [
          { path: '/ws/src/app.ts', kind: 'edited' as const, replacements: 1 },
          { path: '/ws/src/util.ts', kind: 'edited' as const, replacements: 1 },
        ],
        diagnosticsChecked: true,
        diagnostics: [
          { path: '/ws/src/app.ts', line: 1, message: 'boom' },
          { path: '/ws/src/util.ts', line: 1, message: 'boom' },
        ],
      }),
    );
    registry.register(
      {
        type: 'function',
        function: {
          name: 'fix_diagnostics',
          description: 'fake fix',
          parameters: { type: 'object', required: ['filepath'], properties: {} },
        },
        displayTitle: 'Fix',
        wouldLikeTo: 'verify {{{ filepath }}}',
        isCurrently: 'verifying {{{ filepath }}}',
        hasAlready: 'verified {{{ filepath }}}',
        readonly: false,
        isInstant: false,
        group: 'built-in',
        defaultPolicy: 'allowedWithoutPermission',
      },
      async (args) => {
        fixed.push(String(args.filepath));
        return {
          ok: true,
          output: 'clean.',
          diagnosticsChecked: true,
          diagnostics: [],
          verified: true,
          verification: { reflections: 1, fixed: 1, remaining: 0 },
        };
      },
    );
    const brain: AgentBrain = {
      async plan(): Promise<BrainPlan> {
        return { toolCalls: [{ name: 'multi_file_edit', args: { files: [] } }] };
      },
    };
    const result = await runAgentTurn({
      prompt: 'edit both',
      workspaceRoot: ROOT,
      host,
      index,
      brain,
      registry,
      autoApproveWrites: true,
    });
    expect(result.stopped).toBe('done');
    expect(fixed.sort()).toEqual(['/ws/src/app.ts', '/ws/src/util.ts']);
    expect(result.verifications.map((v) => v.path).sort()).toEqual([
      '/ws/src/app.ts',
      '/ws/src/util.ts',
    ]);
  });
});

describe('agentReview — one Keep covers the whole multi-file pass', () => {
  beforeEach(() => {
    resetAgentReviewForTests();
  });

  const multiCall: PlannedToolCall = {
    name: 'multi_file_edit',
    args: {
      files: [
        { filepath: '/ws/src/app.ts', edits: [{ old_string: 'greet', new_string: 'welcome' }] },
        { filepath: '/ws/src/util.ts', edits: [{ old_string: 'helper', new_string: 'assistant' }] },
      ],
    },
  };

  it('computeReviewPreview shows hunks for every touched file', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const contents = new Map<string, string | null>([
      ['/ws/src/app.ts', await host.readFile('/ws/src/app.ts')],
      ['/ws/src/util.ts', await host.readFile('/ws/src/util.ts')],
    ]);
    const preview = computeReviewPreview(multiCall, null, undefined, contents);
    expect(preview.previewError).toBeUndefined();
    expect(preview.hunks.length).toBe(2);
    expect(preview.hunks.flatMap((h) => h.removed).join('\n')).toContain('greet');
    expect(preview.hunks.flatMap((h) => h.added).join('\n')).toContain('welcome');
  });

  it('Keep records a checkpoint per touched file; revert restores all of them', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const created = await createReviewRequest({
      runId: 'run-1',
      tabId: 'terminal-1',
      call: multiCall,
      host,
      workspaceRoot: ROOT,
      cwd: ROOT,
    });
    expect(created.kind).toBe('pending');
    if (created.kind !== 'pending') return;
    expect(created.blockData.hunks.length).toBe(2);
    const kept = await resolveAgentReview(created.requestId, 'keep');
    expect(kept).toBe(true);
    const checkpoints = getAgentCheckpoints('run-1');
    expect(checkpoints.map((c) => c.path).sort()).toEqual(['/ws/src/app.ts', '/ws/src/util.ts']);
    // Simulate the edit landing, then revert the group.
    await host.writeFile('/ws/src/app.ts', 'CHANGED app\n');
    await host.writeFile('/ws/src/util.ts', 'CHANGED util\n');
    const reverted = await revertAgentCheckpoint(checkpoints[0].id);
    expect(reverted).toBe(true);
    expect(await host.readFile('/ws/src/app.ts')).toContain('greet');
    expect(await host.readFile('/ws/src/util.ts')).toContain('helper');
    expect(getAgentCheckpoints('run-1').every((c) => c.reverted)).toBe(true);
  });
});
