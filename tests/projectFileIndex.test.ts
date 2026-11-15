import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  flattenFileEntries,
  hoistLastOpened,
  resetProjectFileIndexForTests,
} from '../src/lib/projectFileIndex';
import type { FileEntry } from '../src/types';

function entry(
  path: string,
  isDirectory: boolean,
  children?: FileEntry[],
): FileEntry {
  return {
    name: path.split('/').pop() ?? path,
    path,
    isDirectory,
    isFile: !isDirectory,
    size: 0,
    modified: 0,
    children,
  };
}

describe('flattenFileEntries', () => {
  test('flattens a tree depth-first, files only', () => {
    const tree = [
      entry('/root/src', true, [
        entry('/root/src/App.tsx', false),
        entry('/root/src/lib', true, [entry('/root/src/lib/a.ts', false)]),
      ]),
      entry('/root/README.md', false),
    ];
    expect(flattenFileEntries(tree)).toEqual([
      '/root/src/App.tsx',
      '/root/src/lib/a.ts',
      '/root/README.md',
    ]);
  });

  test('stops at the cap', () => {
    const tree = Array.from({ length: 10 }, (_, i) =>
      entry(`/root/f${i}.ts`, false),
    );
    expect(flattenFileEntries(tree, 3)).toHaveLength(3);
  });

  test('an empty tree flattens to nothing', () => {
    expect(flattenFileEntries([])).toEqual([]);
  });
});

describe('hoistLastOpened', () => {
  const files = ['/a.ts', '/b.ts', '/c.ts'];

  test('the last-opened file goes first', () => {
    expect(hoistLastOpened(files, '/c.ts')).toEqual(['/c.ts', '/a.ts', '/b.ts']);
  });

  test('no last-opened path leaves the order alone', () => {
    expect(hoistLastOpened(files, null)).toEqual(files);
  });

  test('an unindexed path leaves the order alone', () => {
    expect(hoistLastOpened(files, '/z.ts')).toEqual(files);
  });

  test('an already-first path is a no-op', () => {
    expect(hoistLastOpened(files, '/a.ts')).toEqual(files);
  });
});

describe('projectFileIndex state', () => {
  beforeEach(() => {
    resetProjectFileIndexForTests();
  });

  test('reset clears the index', async () => {
    const { getProjectFileIndex } = await import('../src/lib/projectFileIndex');
    expect(getProjectFileIndex()).toEqual({
      root: '',
      files: [],
      indexing: false,
      lastOpenedPath: null,
    });
  });
});

describe('dirnameOf', () => {
  test('returns the parent directory', async () => {
    const { dirnameOf } = await import('../src/lib/projectFileIndex');
    expect(dirnameOf('/Users/gary/lucid-terminal/src/App.tsx')).toBe(
      '/Users/gary/lucid-terminal/src',
    );
    expect(dirnameOf('/file.ts')).toBe('/');
    expect(dirnameOf('/')).toBe('/');
  });
});

describe('detectProjectRoot (Atom rest — finder coverage gap)', () => {
  test('returns the seed when it holds a marker', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    const listNames = async (dir: string) =>
      dir === '/Users/gary/lucid-terminal' ? ['package.json', 'src'] : [];
    expect(
      await detectProjectRoot('/Users/gary/lucid-terminal', listNames),
    ).toBe('/Users/gary/lucid-terminal');
  });

  test('walks up to the nearest marker — the Settings case', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    // The wave-1 bug: src/components/Settings/ sits 5 levels
    // deep from /Users/gary and was invisible to ⌘P. Seeded
    // from a Settings file's directory, detection must climb
    // to the project root (package.json).
    const namesByDir: Record<string, string[]> = {
      '/Users/gary/lucid-terminal/src/components/Settings': [
        'PermissionsTab.tsx',
        'SecurityTab.tsx',
      ],
      '/Users/gary/lucid-terminal/src/components': ['Settings', 'Editor'],
      '/Users/gary/lucid-terminal/src': ['components', 'lib'],
      '/Users/gary/lucid-terminal': ['package.json', 'src'],
    };
    const listNames = async (dir: string) => namesByDir[dir] ?? [];
    expect(
      await detectProjectRoot(
        '/Users/gary/lucid-terminal/src/components/Settings',
        listNames,
      ),
    ).toBe('/Users/gary/lucid-terminal');
  });

  test('returns the seed when no marker is found', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    const listNames = async () => ['file.txt'];
    expect(await detectProjectRoot('/Users/gary', listNames)).toBe('/Users/gary');
  });

  test('stops at the filesystem root', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    const listNames = async () => ['file.txt'];
    expect(await detectProjectRoot('/', listNames)).toBe('/');
  });

  test('respects the max-up bound', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    const listNames = async (dir: string) =>
      dir === '/Users/gary' ? ['package.json'] : [];
    // Marker is 4 levels up from the seed; maxUp 2 must not reach it.
    expect(
      await detectProjectRoot(
        '/Users/gary/a/b/c/d',
        listNames,
        2,
      ),
    ).toBe('/Users/gary/a/b/c/d');
    expect(
      await detectProjectRoot('/Users/gary/a/b/c/d', listNames, 8),
    ).toBe('/Users/gary');
  });

  test('a failing lister is an empty directory, not a crash', async () => {
    const { detectProjectRoot } = await import('../src/lib/projectFileIndex');
    const listNames = async () => {
      throw new Error('EACCES');
    };
    expect(await detectProjectRoot('/Users/gary/project', listNames)).toBe(
      '/Users/gary/project',
    );
  });
});

describe('refreshProjectFileIndex with a project root', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  function installReadDir(
    readDir: (dir: string, opts?: { depth?: number }) => Promise<FileEntry[]>,
  ) {
    (globalThis as unknown as { window?: unknown }).window = {
      lucidAPI: { fs: { readDir } },
    };
  }

  beforeEach(() => {
    resetProjectFileIndexForTests();
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  test('indexes the detected project root, not the seed', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
    } = await import('../src/lib/projectFileIndex');
    const readDirCalls: Array<{ dir: string; depth?: number }> = [];
    installReadDir(async (dir: string, opts?: { depth?: number }) => {
      readDirCalls.push({ dir, depth: opts?.depth });
      return [
        entry('/Users/gary/lucid-terminal/src/components/Settings/PermissionsTab.tsx', false),
        entry('/Users/gary/lucid-terminal/src/components/Settings/SecurityTab.tsx', false),
      ];
    });
    const listNames = async (dir: string) =>
      dir === '/Users/gary/lucid-terminal' ? ['package.json', 'src'] : [];
    // Seed: a Settings file's directory, 5 levels deep from home.
    await refreshProjectFileIndex(
      '/Users/gary/lucid-terminal/src/components/Settings',
      listNames,
    );
    expect(getProjectFileIndex().root).toBe('/Users/gary/lucid-terminal');
    expect(readDirCalls).toEqual([
      { dir: '/Users/gary/lucid-terminal', depth: 6 },
    ]);
    expect(getProjectFileIndex().files).toEqual([
      '/Users/gary/lucid-terminal/src/components/Settings/PermissionsTab.tsx',
      '/Users/gary/lucid-terminal/src/components/Settings/SecurityTab.tsx',
    ]);
    expect(getProjectFileIndex().indexing).toBe(false);
  });

  test('a second refresh for the same project is a no-op', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
    } = await import('../src/lib/projectFileIndex');
    let calls = 0;
    installReadDir(async () => {
      calls += 1;
      return [entry('/Users/gary/project/a.ts', false)];
    });
    const listNames = async (dir: string) =>
      dir === '/Users/gary/project' ? ['package.json'] : [];
    await refreshProjectFileIndex('/Users/gary/project/src', listNames);
    await refreshProjectFileIndex('/Users/gary/project/src', listNames);
    expect(calls).toBe(1);
    expect(getProjectFileIndex().files).toEqual(['/Users/gary/project/a.ts']);
  });

  test('moving to a different project re-indexes', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
    } = await import('../src/lib/projectFileIndex');
    const roots: string[] = [];
    installReadDir(async (dir: string) => {
      roots.push(dir);
      return [entry(`${dir}/a.ts`, false)];
    });
    const listNames = async (dir: string) =>
      dir === '/Users/gary/project-a' || dir === '/Users/gary/project-b'
        ? ['package.json']
        : [];
    await refreshProjectFileIndex('/Users/gary/project-a/src', listNames);
    await refreshProjectFileIndex('/Users/gary/project-b/src', listNames);
    expect(roots).toEqual(['/Users/gary/project-a', '/Users/gary/project-b']);
    expect(getProjectFileIndex().root).toBe('/Users/gary/project-b');
  });

  test('a failed read keeps the previous list and clears indexing', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
    } = await import('../src/lib/projectFileIndex');
    installReadDir(async (dir: string) => {
      if (dir === '/Users/gary/project-b') throw new Error('EACCES');
      return [entry('/Users/gary/project-a/a.ts', false)];
    });
    const listNames = async (dir: string) =>
      dir === '/Users/gary/project-a' || dir === '/Users/gary/project-b'
        ? ['package.json']
        : [];
    await refreshProjectFileIndex('/Users/gary/project-a', listNames);
    await refreshProjectFileIndex('/Users/gary/project-b', listNames);
    expect(getProjectFileIndex().files).toEqual(['/Users/gary/project-a/a.ts']);
    expect(getProjectFileIndex().indexing).toBe(false);
  });
});
