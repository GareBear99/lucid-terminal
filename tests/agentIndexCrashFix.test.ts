// The renderer-crash fix (2026-11-16): the agent file
// index build over the home directory needed far more V8
// heap than the renderer has (2,712 MiB retained at 20,000
// files vs a 2,096 MiB limit — V8 aborts the renderer,
// exit code 6, both 2026-11-16 crashes). The prevention:
//   1. the full build is refused over the home dir (the
//      loop's home-dir guard),
//   2. the bulk build caps retained content (~200 MB) and
//      reports the index partial,
//   3. a heap guard aborts the bulk build before V8 does.
// Task files and files just created/edited bypass the cap
// (they are the run's own files).
import { describe, expect, it } from 'vitest';
import { runAgentTurn, HOME_ROOT_INDEX_REFUSAL, type AgentLoopEvent } from '../src/lib/agentLoop';
import {
  AgentFileIndex,
  isHeapOverGuard,
  readHeapUsage,
} from '../src/lib/agentIndex';
import {
  type AgentBrain,
  type BrainContext,
  type BrainPlan,
} from '../src/lib/agentBrain';
import { ToolRegistry } from '../src/lib/agentTools';
import { registerBuiltInTools } from '../src/lib/agentToolsImpl';
import { MemoryAgentHost } from './agentTestHost';

/** A brain that returns a scripted plan per round. */
class ScriptedBrain implements AgentBrain {
  constructor(private readonly rounds: BrainPlan[]) {}
  async plan(_prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    const round = ctx.round ?? 0;
    return this.rounds[Math.min(round, this.rounds.length - 1)] ?? { toolCalls: [] };
  }
}

function makeSetup(files: Record<string, string>, indexOptions?: ConstructorParameters<typeof AgentFileIndex>[1]) {
  const host = new MemoryAgentHost(files);
  const index = new AgentFileIndex(host, indexOptions);
  const registry = new ToolRegistry();
  registerBuiltInTools(registry);
  return { host, index, registry };
}

describe('the retained-content cap', () => {
  it('stops the bulk build at the cap, finishes partial, and keeps search working on what is indexed', async () => {
    const a = 'const alpha = 1;\n'.repeat(40); // 760 bytes
    const b = 'const beta = 2;\n'.repeat(40);
    const c = 'const gamma = 3;\n'.repeat(40);
    const { index } = makeSetup(
      { '/ws/a.ts': a, '/ws/b.ts': b, '/ws/c.ts': c },
      { maxTotalBytes: a.length + 10 },
    );
    await index.build('/ws');
    expect(index.isBuilt).toBe(true);
    expect(index.capped).toBe(true);
    expect(index.isContentCapped).toBe(true);
    // Only the first file fits under the cap.
    expect(index.fileCount).toBe(1);
    expect(index.indexedContentBytes).toBe(a.length);
    // The skipped files are still known (listed, not read).
    expect(index.knownPathCount).toBe(3);
    expect(index.getFilePaths()).toEqual(['/ws/a.ts']);
    // Search still works on what is indexed.
    expect(index.search('alpha').map((r) => r.path)).toEqual(['/ws/a.ts']);
    expect(index.search('gamma')).toEqual([]);
  });

  it('a task file bypasses the cap (prepareForTask forces it)', async () => {
    const big = 'const big = 1;\n'.repeat(40); // 680 bytes
    const { index } = makeSetup(
      { '/ws/big.ts': big, '/ws/small.ts': 'const s = 1;\n' },
      { maxTotalBytes: 10 },
    );
    await index.prepareForTask('/ws', { cwd: '/ws', taskPaths: ['/ws/big.ts'], openFiles: [] });
    expect(index.getFilePaths()).toContain('/ws/big.ts');
    // The bulk build after it still respects the cap for
    // everything else (the task file stays indexed).
    await index.build('/ws');
    expect(index.getFilePaths()).toContain('/ws/big.ts');
    expect(index.capped).toBe(true);
  });

  it('a file indexed directly bypasses the cap only when forced', async () => {
    const { index } = makeSetup(
      {
        '/ws/forced.ts': 'const forced = true;\n',
        '/ws/plain.ts': 'const plain = true;\n',
      },
      { maxTotalBytes: 10 },
    );
    // Set the root without a bulk build (the fast path).
    await index.prepareForTask('/ws', { cwd: '/ws', taskPaths: [], openFiles: [] });
    // Forced (a task file / a file just created or edited):
    // indexed despite the cap.
    await index.indexOne('/ws/forced.ts', true);
    expect(index.getFilePaths()).toContain('/ws/forced.ts');
    // Unforced, over the cap: listed, not indexed.
    await index.indexOne('/ws/plain.ts');
    expect(index.getFilePaths()).not.toContain('/ws/plain.ts');
    expect(index.getKnownPaths()).toContain('/ws/plain.ts');
  });
});

describe('the heap guard', () => {
  it('isHeapOverGuard trips past 80% of the limit, not at it', () => {
    expect(isHeapOverGuard(1600, 2000)).toBe(false); // exactly 80% — not over
    expect(isHeapOverGuard(1601, 2000)).toBe(true);
    expect(isHeapOverGuard(1900, 2000)).toBe(true);
    expect(isHeapOverGuard(0, 0)).toBe(false);
    expect(isHeapOverGuard(100, 0)).toBe(false);
  });

  it('readHeapUsage returns null where performance.memory is absent (Node)', () => {
    expect(readHeapUsage()).toBeNull();
  });

  it('a hot heap skips the content pass — the build finishes partial, not crashed', async () => {
    const { index } = makeSetup(
      {
        '/ws/a.ts': 'const a = 1;\n',
        '/ws/b.ts': 'const b = 2;\n',
      },
      { heapUsage: () => ({ used: 1900, limit: 2000 }) },
    );
    await index.build('/ws');
    expect(index.isBuilt).toBe(true);
    expect(index.capped).toBe(true);
    expect(index.isContentCapped).toBe(true);
    expect(index.fileCount).toBe(0);
    expect(index.search('a')).toEqual([]);
  });

  it('a cool heap builds fully', async () => {
    const { index } = makeSetup(
      { '/ws/a.ts': 'const alpha = 1;\n' },
      { heapUsage: () => ({ used: 100, limit: 2000 }) },
    );
    await index.build('/ws');
    expect(index.isBuilt).toBe(true);
    expect(index.capped).toBe(false);
    expect(index.search('alpha').map((r) => r.path)).toEqual(['/ws/a.ts']);
  });
});

describe('the home-dir guard (the loop)', () => {
  it('refuses the full build over the home dir, still runs named-file tools, and reports the refusal', async () => {
    const { host, index, registry } = makeSetup({
      '/home/user/notes.txt': 'remember the word wrod\n',
      '/home/user/other.txt': 'something else\n',
    });
    const events: AgentLoopEvent[] = [];
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'read_file', args: { filepath: '/home/user/notes.txt' } }] },
      { toolCalls: [{ name: 'codebase_search', args: { query: 'something' } }] },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'read /home/user/notes.txt and search the codebase for something',
      workspaceRoot: '/home/user',
      homeDir: '/home/user',
      brain,
      registry,
      index,
      host,
      onEvent: (e) => events.push(e),
    });
    expect(result.stopped).toBe('done');
    // The full build never ran.
    expect(index.isBuilt).toBe(false);
    expect(index.refusedReason).toBe(HOME_ROOT_INDEX_REFUSAL);
    expect(events.some((e) => e.type === 'index-skipped')).toBe(true);
    expect(events.some((e) => e.type === 'index-done')).toBe(false);
    // The named-file read still worked (fast path).
    const read = result.toolCalls.find((c) => c.name === 'read_file');
    expect(read?.outcome).toBe('allowed');
    expect(read?.result.ok).toBe(true);
    // The index-backed search failed honestly with the refusal.
    const search = result.toolCalls.find((c) => c.name === 'codebase_search');
    expect(search?.result.ok).toBe(false);
    expect(search?.result.error).toContain('home directory');
  });

  it('the symbol tools report the refusal too, not a false "no symbol"', async () => {
    const { host, index, registry } = makeSetup({
      '/home/user/notes.txt': 'remember the word wrod\n',
    });
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'find_symbol', args: { name: 'alpha' } }] },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'find the symbol alpha',
      workspaceRoot: '/home/user',
      homeDir: '/home/user',
      brain,
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    const find = result.toolCalls.find((c) => c.name === 'find_symbol');
    expect(find?.result.ok).toBe(false);
    expect(find?.result.error).toContain('home directory');
  });

  it('a non-home root builds normally', async () => {
    const { host, index, registry } = makeSetup({
      '/ws/src/app.ts': 'export const alpha = 1;\n',
    });
    const events: AgentLoopEvent[] = [];
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'codebase_search', args: { query: 'alpha' } }] },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'search the codebase for alpha',
      workspaceRoot: '/ws',
      homeDir: '/home/user',
      brain,
      registry,
      index,
      host,
      onEvent: (e) => events.push(e),
    });
    expect(result.stopped).toBe('done');
    expect(index.isBuilt).toBe(true);
    expect(index.refusedReason).toBeNull();
    expect(events.some((e) => e.type === 'index-skipped')).toBe(false);
    const search = result.toolCalls.find((c) => c.name === 'codebase_search');
    expect(search?.result.ok).toBe(true);
  });

  it('a refused index never builds, even when build() is called directly', async () => {
    const { index } = makeSetup({ '/ws/a.ts': 'const a = 1;\n' });
    index.refuseFullBuild('refused in test');
    await index.build('/ws');
    expect(index.isBuilt).toBe(false);
    expect(index.fileCount).toBe(0);
  });

  it('without a homeDir the guard is inert (tests that never set it)', async () => {
    const { host, index, registry } = makeSetup({
      '/ws/src/app.ts': 'export const alpha = 1;\n',
    });
    const brain = new ScriptedBrain([
      { toolCalls: [{ name: 'codebase_search', args: { query: 'alpha' } }] },
      { toolCalls: [] },
    ]);
    const result = await runAgentTurn({
      prompt: 'search the codebase for alpha',
      workspaceRoot: '/ws',
      brain,
      registry,
      index,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(index.isBuilt).toBe(true);
  });
});
