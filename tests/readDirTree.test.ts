import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirTree, type FileEntry } from '../electron/ipc/fileSystem';

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

describe('readDirTree', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lucid-readdir-'));
    // 3 dirs x (1 subdir x 40 files) = 120 files, 6 dirs.
    for (let d = 0; d < 3; d++) {
      const dir = join(root, `dir-${d}`, 'sub');
      await mkdir(dir, { recursive: true });
      for (let f = 0; f < 40; f++) {
        await writeFile(join(dir, `file-${f}.txt`), 'x');
      }
    }
    // A node_modules that must never be walked into.
    const nm = join(root, 'dir-0', 'node_modules', 'pkg');
    await mkdir(nm, { recursive: true });
    for (let f = 0; f < 50; f++) {
      await writeFile(join(nm, `n-${f}.js`), 'x');
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('without a cap it returns the whole tree, minus node_modules', async () => {
    const tree = await readDirTree(root, { depth: 6 });
    // 3 top dirs + 3 subdirs + 1 node_modules entry + 120 files.
    expect(countEntries(tree)).toBe(127);
    expect(JSON.stringify(tree)).not.toContain('n-0.js');
  });

  test('maxEntries stops the walk early (the finder budget)', async () => {
    const tree = await readDirTree(root, { depth: 6, maxEntries: 50 });
    const n = countEntries(tree);
    expect(n).toBeLessThanOrEqual(50);
    expect(n).toBeGreaterThan(0);
  });

  test('depth is still respected', async () => {
    const tree = await readDirTree(root, { depth: 1 });
    expect(tree).toHaveLength(3);
    expect(tree.every((e) => e.children === undefined)).toBe(true);
  });

  test('a missing directory throws', async () => {
    await expect(readDirTree(join(root, 'nope'), { depth: 1 })).rejects.toThrow(
      'Failed to read directory',
    );
  });
});
