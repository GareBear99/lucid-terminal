import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ensureReadDirWorkerBuilt,
  compiledReadDirWorkerPath,
} from './readDirWorkerBuild';
import {
  readDirTree,
  readDirTreeViaWorker,
  resolveReadDirWorkerPath,
  type FileEntry,
} from '../electron/ipc/readDirTree';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const compiledWorker = compiledReadDirWorkerPath(repoRoot);

function countEntries(tree: readonly FileEntry[]): number {
  let n = 0;
  const walk = (list: readonly FileEntry[]): void => {
    for (const e of list) {
      n += 1;
      if (e.children) walk(e.children);
    }
  };
  walk(tree);
  return n;
}

// The worker runs from the tsconfig.node build output, not from
// source — make sure it exists and is newer than its sources
// before the tests spawn it (shared locked helper: two test files
// build it and vitest runs them in parallel).
beforeAll(() => {
  ensureReadDirWorkerBuilt(repoRoot);
  expect(existsSync(compiledWorker)).toBe(true);
}, 300_000);

describe('readDirTreeViaWorker', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lucid-readdir-worker-'));
    // 3 dirs x (1 subdir x 40 files) = 120 files, 6 dirs, plus a
    // node_modules, a skipped .cache, a .gitignore and a symlink.
    for (let d = 0; d < 3; d++) {
      const dir = join(root, `dir-${d}`, 'sub');
      await mkdir(dir, { recursive: true });
      for (let f = 0; f < 40; f++) {
        await writeFile(join(dir, `file-${f}.txt`), 'x');
      }
    }
    const nm = join(root, 'dir-0', 'node_modules', 'pkg');
    await mkdir(nm, { recursive: true });
    await writeFile(join(nm, 'n-0.js'), 'x');
    await mkdir(join(root, '.cache', 'sub'), { recursive: true });
    await writeFile(join(root, '.cache', 'cached.txt'), 'x');
    await writeFile(join(root, '.gitignore'), '*.log\n');
    await writeFile(join(root, 'a.log'), 'x');
    await writeFile(join(root, 'keep.txt'), 'x');
    await symlink(join(root, 'dir-1'), join(root, 'dir-link'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('resolveReadDirWorkerPath finds the compiled worker', () => {
    const resolved = resolveReadDirWorkerPath();
    expect(resolved).toBeDefined();
    expect(resolved?.endsWith('readDirWorker.js')).toBe(true);
    expect(existsSync(resolved as string)).toBe(true);
  });

  test('a walk through the worker returns the identical tree to a direct walk', async () => {
    const viaWorker = await readDirTreeViaWorker(root, { depth: 6 });
    const direct = await readDirTree(root, { depth: 6 });
    expect(JSON.stringify(viaWorker)).toBe(JSON.stringify(direct));
    // Sanity: the tree itself has the expected shape (skip list +
    // .gitignore applied identically in both).
    expect(countEntries(viaWorker)).toBe(131);
    expect(JSON.stringify(viaWorker)).not.toContain('a.log');
    expect(JSON.stringify(viaWorker)).not.toContain('cached.txt');
    expect(JSON.stringify(viaWorker)).toContain('keep.txt');
  });

  test('maxEntries is honoured through the worker', async () => {
    const tree = await readDirTreeViaWorker(root, {
      depth: 6,
      maxEntries: 50,
    });
    const n = countEntries(tree);
    expect(n).toBeLessThanOrEqual(50);
    expect(n).toBeGreaterThan(0);
  });

  test('a missing directory is reported as an error, not a hang', async () => {
    await expect(
      readDirTreeViaWorker(join(root, 'nope'), { depth: 6 }),
    ).rejects.toThrow('Failed to read directory');
  });

  test('a hung worker is terminated instead of hanging the caller', async () => {
    // 1 ms is far below worker spawn + module load, so the
    // deadline fires before any tree could come back.
    const started = Date.now();
    await expect(
      readDirTreeViaWorker(root, { depth: 6 }, { timeoutMs: 1 }),
    ).rejects.toThrow('timed out');
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test('depth-1 reads bypass the worker entirely', async () => {
    // Even with a worker path that cannot exist, a depth-1 read
    // succeeds — it never spawns.
    const tree = await readDirTreeViaWorker(
      root,
      { depth: 1 },
      { workerPath: join(root, 'no-such-worker.js') },
    );
    expect(tree.every((e) => e.children === undefined)).toBe(true);
    expect(tree.map((e) => e.name)).toContain('dir-0');
  });

  test('a worker that cannot spawn falls back to the in-process walk', async () => {
    const tree = await readDirTreeViaWorker(
      root,
      { depth: 6 },
      { workerPath: join(root, 'no-such-worker.js') },
    );
    const direct = await readDirTree(root, { depth: 6 });
    expect(JSON.stringify(tree)).toBe(JSON.stringify(direct));
  });
});
