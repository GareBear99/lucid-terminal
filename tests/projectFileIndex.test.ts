import { describe, test, expect, beforeEach } from 'vitest';
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
