import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
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
      timedOut: false,
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

  test('detailed detection reports whether a marker was found', async () => {
    const { detectProjectRootDetailed } = await import('../src/lib/projectFileIndex');
    const listNames = async (dir: string) =>
      dir === '/Users/gary/lucid-terminal' ? ['package.json', 'src'] : [];
    expect(
      await detectProjectRootDetailed(
        '/Users/gary/lucid-terminal/src',
        listNames,
      ),
    ).toEqual({ root: '/Users/gary/lucid-terminal', foundMarker: true });
    expect(await detectProjectRootDetailed('/Users/gary', listNames)).toEqual({
      root: '/Users/gary',
      foundMarker: false,
    });
  });
});

describe('refreshProjectFileIndex with a project root', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  function installReadDir(
    readDir: (
      dir: string,
      opts?: { depth?: number; maxEntries?: number },
    ) => Promise<FileEntry[]>,
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

  test('a home-rooted index walks at depth 2 (capped), a project-rooted one at depth 6', async () => {
    const {
      refreshProjectFileIndex,
      PROJECT_INDEX_MAX_WALK_ENTRIES,
      HOME_INDEX_MAX_WALK_ENTRIES,
    } = await import('../src/lib/projectFileIndex');
    const calls: Array<{ dir: string; depth?: number; maxEntries?: number }> = [];
    installReadDir(
      async (dir: string, opts?: { depth?: number; maxEntries?: number }) => {
        calls.push({ dir, depth: opts?.depth, maxEntries: opts?.maxEntries });
        return [entry(`${dir}/a.ts`, false)];
      },
    );
    const listNames = async (dir: string) =>
      dir === '/Users/gary/lucid-terminal' ? ['package.json', 'src'] : [];
    // Home seed, no marker anywhere up the tree: the shallow,
    // capped walk (2026-11-15 fix — depth 4 never settled).
    await refreshProjectFileIndex('/Users/gary', listNames);
    expect(calls).toEqual([
      {
        dir: '/Users/gary',
        depth: 2,
        maxEntries: HOME_INDEX_MAX_WALK_ENTRIES,
      },
    ]);
    // Project seed — re-roots and walks at full depth.
    await refreshProjectFileIndex('/Users/gary/lucid-terminal/src', listNames);
    expect(calls[1]).toEqual({
      dir: '/Users/gary/lucid-terminal',
      depth: 6,
      maxEntries: PROJECT_INDEX_MAX_WALK_ENTRIES,
    });
  });

  test('a hung read clears indexing after the timeout and the next refresh retries', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
      PROJECT_INDEX_TIMEOUT_MS,
    } = await import('../src/lib/projectFileIndex');
    vi.useFakeTimers();
    try {
      installReadDir(() => new Promise<FileEntry[]>(() => {}));
      const listNames = async (dir: string) =>
        dir === '/Users/gary/project' ? ['package.json'] : [];
      // Do not await: this build never settles by design.
      void refreshProjectFileIndex('/Users/gary/project/src', listNames);
      await vi.advanceTimersByTimeAsync(0);
      expect(getProjectFileIndex().indexing).toBe(true);
      // The live failure (Atom rest, 2026-11-14): ⌘P sat on
      // "Indexing files…" for 3+ minutes because the flag never
      // cleared and the guard blocked every later refresh.
      await vi.advanceTimersByTimeAsync(PROJECT_INDEX_TIMEOUT_MS);
      expect(getProjectFileIndex().indexing).toBe(false);
      // The timeout is surfaced, not swallowed: the Finder
      // says the index timed out instead of "No files in
      // this project" (2026-11-15 fix).
      expect(getProjectFileIndex().timedOut).toBe(true);
      // The flag is not stuck: a retry starts and populates.
      installReadDir(async () => [entry('/Users/gary/project/a.ts', false)]);
      await refreshProjectFileIndex('/Users/gary/project/src', listNames);
      expect(getProjectFileIndex().files).toEqual(['/Users/gary/project/a.ts']);
      expect(getProjectFileIndex().indexing).toBe(false);
      // A build that lands clears the timeout flag.
      expect(getProjectFileIndex().timedOut).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a timeout keeps the previous list and marks timedOut', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
      PROJECT_INDEX_TIMEOUT_MS,
    } = await import('../src/lib/projectFileIndex');
    vi.useFakeTimers();
    try {
      installReadDir(async (dir: string) => {
        if (dir === '/Users/gary/project-b') {
          return new Promise<FileEntry[]>(() => {});
        }
        return [entry('/Users/gary/project-a/a.ts', false)];
      });
      const listNames = async (dir: string) =>
        dir === '/Users/gary/project-a' || dir === '/Users/gary/project-b'
          ? ['package.json']
          : [];
      await refreshProjectFileIndex('/Users/gary/project-a', listNames);
      expect(getProjectFileIndex().files).toEqual(['/Users/gary/project-a/a.ts']);
      // The next build hangs — the timeout must not wipe the
      // list the Finder is already showing.
      void refreshProjectFileIndex('/Users/gary/project-b', listNames);
      await vi.advanceTimersByTimeAsync(0);
      expect(getProjectFileIndex().indexing).toBe(true);
      await vi.advanceTimersByTimeAsync(PROJECT_INDEX_TIMEOUT_MS);
      expect(getProjectFileIndex().indexing).toBe(false);
      expect(getProjectFileIndex().timedOut).toBe(true);
      expect(getProjectFileIndex().files).toEqual(['/Users/gary/project-a/a.ts']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a home-rooted refresh settles with a fake FS instead of timing out empty', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
      HOME_INDEX_DEPTH,
      HOME_INDEX_MAX_WALK_ENTRIES,
    } = await import('../src/lib/projectFileIndex');
    expect(HOME_INDEX_DEPTH).toBe(2);
    expect(HOME_INDEX_MAX_WALK_ENTRIES).toBe(2000);
    const calls: Array<{ dir: string; depth?: number; maxEntries?: number }> = [];
    installReadDir(
      async (dir: string, opts?: { depth?: number; maxEntries?: number }) => {
        calls.push({ dir, depth: opts?.depth, maxEntries: opts?.maxEntries });
        return [
          entry(`${dir}/notes.txt`, false),
          entry(`${dir}/Projects`, true, [
            entry(`${dir}/Projects/app.ts`, false),
          ]),
        ];
      },
    );
    // No marker anywhere up the tree: home-rooted.
    const listNames = async () => ['notes.txt'];
    await refreshProjectFileIndex('/Users/gary', listNames);
    expect(calls).toEqual([
      { dir: '/Users/gary', depth: 2, maxEntries: 2000 },
    ]);
    expect(getProjectFileIndex().root).toBe('/Users/gary');
    expect(getProjectFileIndex().files).toEqual([
      '/Users/gary/notes.txt',
      '/Users/gary/Projects/app.ts',
    ]);
    expect(getProjectFileIndex().indexing).toBe(false);
    expect(getProjectFileIndex().timedOut).toBe(false);
  });

  test('a late build that settles after its timeout is discarded', async () => {
    const {
      refreshProjectFileIndex,
      getProjectFileIndex,
      PROJECT_INDEX_TIMEOUT_MS,
    } = await import('../src/lib/projectFileIndex');
    vi.useFakeTimers();
    try {
      let resolveFirst: ((entries: FileEntry[]) => void) | null = null;
      installReadDir(
        () =>
          new Promise<FileEntry[]>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      const listNames = async (dir: string) =>
        dir === '/Users/gary/project' ? ['package.json'] : [];
      void refreshProjectFileIndex('/Users/gary/project/src', listNames);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(PROJECT_INDEX_TIMEOUT_MS);
      expect(getProjectFileIndex().indexing).toBe(false);
      expect(getProjectFileIndex().timedOut).toBe(true);
      // A newer build starts and lands first.
      installReadDir(async () => [entry('/Users/gary/project/b.ts', false)]);
      await refreshProjectFileIndex('/Users/gary/project/src', listNames);
      expect(getProjectFileIndex().files).toEqual(['/Users/gary/project/b.ts']);
      expect(getProjectFileIndex().timedOut).toBe(false);
      // Now the stale build settles — it must not clobber the newer list.
      resolveFirst?.([entry('/Users/gary/project/a.ts', false)]);
      await vi.advanceTimersByTimeAsync(0);
      expect(getProjectFileIndex().files).toEqual(['/Users/gary/project/b.ts']);
      expect(getProjectFileIndex().indexing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
