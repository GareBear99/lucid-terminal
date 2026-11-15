import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readdir, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirTree, type FileEntry, type ReadDirTreeFS } from '../electron/ipc/fileSystem';

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

  test('a hung branch is dropped and the rest of the tree returns', async () => {
    const slowDir = join(root, 'dir-0');
    const io: ReadDirTreeFS = {
      readdir: async (p, opts) => {
        if (p === slowDir) return new Promise(() => {});
        return readdir(p, opts);
      },
      lstat: (p) => lstat(p),
    };
    const tree = await readDirTree(root, { depth: 6, branchTimeoutMs: 50 }, io);
    // dir-0's entry stays (children undefined, lazy-loadable);
    // dir-1 and dir-2 complete normally.
    expect(tree.map((e) => e.name)).toContain('dir-1');
    expect(tree.map((e) => e.name)).toContain('dir-2');
    expect(tree.find((e) => e.name === 'dir-0')?.children).toBeUndefined();
    const dir1 = tree.find((e) => e.name === 'dir-1');
    expect(dir1?.children?.length).toBeGreaterThan(0);
  });

  test('a branch whose readdir throws is dropped, not fatal', async () => {
    const badDir = join(root, 'dir-1');
    const io: ReadDirTreeFS = {
      readdir: async (p, opts) => {
        if (p === badDir) throw new Error('boom');
        return readdir(p, opts);
      },
      lstat: (p) => lstat(p),
    };
    const tree = await readDirTree(root, { depth: 6 }, io);
    expect(tree.map((e) => e.name)).toContain('dir-0');
    expect(tree.map((e) => e.name)).toContain('dir-2');
    expect(tree.find((e) => e.name === 'dir-1')?.children).toBeUndefined();
  });

  test('symlinks are never followed (lstat, not stat)', async () => {
    // A dangling link (stat would throw ENOENT) and a link to a
    // real directory (stat would follow it and duplicate the
    // subtree). Neither may block or duplicate the walk.
    await symlink(join(root, 'no-such-target'), join(root, 'dead-link'));
    await symlink(join(root, 'dir-1'), join(root, 'dir-link'));
    const tree = await readDirTree(root, { depth: 6 });
    // Base 127 + the two link entries; the linked directory's
    // files are not walked twice.
    expect(countEntries(tree)).toBe(129);
    const dead = tree.find((e) => e.name === 'dead-link');
    expect(dead).toBeDefined();
    expect(dead?.isFile).toBe(false);
    expect(dead?.isDirectory).toBe(false);
    expect(dead?.children).toBeUndefined();
    const link = tree.find((e) => e.name === 'dir-link');
    expect(link).toBeDefined();
    expect(link?.children).toBeUndefined();
    expect(JSON.stringify(tree)).not.toContain('no-such-target');
  });
});
