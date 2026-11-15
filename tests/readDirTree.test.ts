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

describe('readDirTree skip list (step 5)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lucid-readdir-skip-'));
    // One skipped dir per name, each holding a file + a subdir
    // with a file, plus a control dir that must be walked.
    const skipped = [
      '.Trash',
      '.thumbnails',
      '.npm',
      '.cache',
      '.openclaw',
      '.matplotlib',
      '.warp',
      '.vscode',
      '.luciferai',
      'Applications',
      '.next',
      '.turbo',
    ];
    for (const name of skipped) {
      const dir = join(root, name, 'sub');
      await mkdir(dir, { recursive: true });
      await writeFile(join(root, name, `inside-${name}.txt`), 'x');
      await writeFile(join(dir, `deep-${name}.txt`), 'x');
    }
    await mkdir(join(root, 'keep', 'sub'), { recursive: true });
    await writeFile(join(root, 'keep', 'inside-keep.txt'), 'x');
    await writeFile(join(root, 'keep', 'sub', 'deep-keep.txt'), 'x');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('skipped dirs are listed at depth 1 but never descended into', async () => {
    const tree = await readDirTree(root, { depth: 6 });
    const skipped = [
      '.Trash',
      '.thumbnails',
      '.npm',
      '.cache',
      '.openclaw',
      '.matplotlib',
      '.warp',
      '.vscode',
      '.luciferai',
      'Applications',
      '.next',
      '.turbo',
    ];
    // Listed (depth-1 read shows them) …
    for (const name of skipped) {
      const entry = tree.find((e) => e.name === name);
      expect(entry, `${name} should be listed`).toBeDefined();
      // … but never walked into: children undefined, contents absent.
      expect(entry?.children).toBeUndefined();
      expect(JSON.stringify(tree)).not.toContain(`inside-${name}.txt`);
      expect(JSON.stringify(tree)).not.toContain(`deep-${name}.txt`);
    }
    // The control dir IS walked.
    const keep = tree.find((e) => e.name === 'keep');
    expect(keep?.children?.map((e) => e.name)).toContain('inside-keep.txt');
    expect(JSON.stringify(tree)).toContain('deep-keep.txt');
  });

  test('the root itself is always read even when named like a skipped dir', async () => {
    // .cache AS the root: its own entries are listed and its
    // subdirs are descended into — the skip only gates recursion
    // BELOW the root.
    const cacheRoot = join(root, '.cache');
    const tree = await readDirTree(cacheRoot, { depth: 3 });
    expect(tree.map((e) => e.name)).toContain('inside-.cache.txt');
    const sub = tree.find((e) => e.name === 'sub');
    expect(sub?.children?.map((e) => e.name)).toContain('deep-.cache.txt');
  });
});

describe('readDirTree .gitignore (step 5)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lucid-readdir-gitignore-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('root + nested .gitignore: patterns, negation, dir-only, stacking', async () => {
    await writeFile(
      join(root, '.gitignore'),
      '# comment\n\n*.log\nbuild/\n!important.log\n',
    );
    await writeFile(join(root, 'a.log'), 'x');
    await writeFile(join(root, 'important.log'), 'x');
    await writeFile(join(root, 'keep.txt'), 'x');
    await mkdir(join(root, 'build'), { recursive: true });
    await writeFile(join(root, 'build', 'out.txt'), 'x');
    await mkdir(join(root, 'sub'), { recursive: true });
    await writeFile(join(root, 'sub', '.gitignore'), '!b.log\n*.tmp\n');
    await writeFile(join(root, 'sub', 'b.log'), 'x');
    await writeFile(join(root, 'sub', 'c.log'), 'x');
    await writeFile(join(root, 'sub', 'x.tmp'), 'x');
    await writeFile(join(root, 'sub', 'keep2.txt'), 'x');

    const tree = await readDirTree(root, { depth: 6 });
    const flat = JSON.stringify(tree);
    // Root rules: *.log ignored, important.log re-included,
    // build/ pruned whole (unlike the bare skip list, it is not
    // even listed).
    expect(flat).not.toContain('a.log');
    expect(flat).toContain('important.log');
    expect(flat).toContain('keep.txt');
    expect(tree.find((e) => e.name === 'build')).toBeUndefined();
    expect(flat).not.toContain('out.txt');
    // Nested rules: sub re-includes b.log, ignores *.tmp, and the
    // root *.log still applies to c.log.
    expect(flat).toContain('b.log');
    expect(flat).not.toContain('c.log');
    expect(flat).not.toContain('x.tmp');
    expect(flat).toContain('keep2.txt');
    // The .gitignore files themselves stay listed.
    expect(tree.find((e) => e.name === '.gitignore')).toBeDefined();
  });

  test('a fake FS serving .gitignore files is honoured', async () => {
    await writeFile(join(root, 'a.log'), 'x');
    await writeFile(join(root, 'keep.txt'), 'x');
    const gitignores = new Map<string, string>([
      [join(root, '.gitignore'), '*.log\n'],
    ]);
    const io: ReadDirTreeFS = {
      readdir: (p, opts) => readdir(p, opts),
      lstat: (p) => lstat(p),
      readFile: async (p) => {
        const content = gitignores.get(p);
        if (content === undefined) throw new Error('ENOENT');
        return content;
      },
    };
    const tree = await readDirTree(root, { depth: 2 }, io);
    expect(tree.map((e) => e.name)).toEqual(['keep.txt']);
  });

  test('missing/unreadable .gitignore means no rules', async () => {
    await writeFile(join(root, 'a.log'), 'x');
    await writeFile(join(root, 'keep.txt'), 'x');
    const io: ReadDirTreeFS = {
      readdir: (p, opts) => readdir(p, opts),
      lstat: (p) => lstat(p),
      readFile: async () => {
        throw new Error('EACCES');
      },
    };
    const tree = await readDirTree(root, { depth: 2 }, io);
    expect(tree.map((e) => e.name).sort()).toEqual(['a.log', 'keep.txt']);
  });

  test('ignored entries do not consume the maxEntries budget', async () => {
    await writeFile(join(root, '.gitignore'), '*.log\n');
    for (let i = 0; i < 10; i++) {
      await writeFile(join(root, `f-${i}.log`), 'x');
    }
    for (let i = 0; i < 5; i++) {
      await writeFile(join(root, `keep-${i}.txt`), 'x');
    }
    const tree = await readDirTree(root, { depth: 1, maxEntries: 6 });
    // 6 non-ignored entries exist (.gitignore + 5 keeps) and the
    // budget collects all of them — the 10 ignored .log files
    // consume none of it.
    expect(tree).toHaveLength(6);
    expect(tree.every((e) => !e.name.endsWith('.log'))).toBe(true);
  });
});
