// @vitest-environment jsdom
/**
 * File store batch children loading (files-section fix step 4).
 *
 * The expanded-dir restore used to fire N parallel loadChildren
 * calls — one whole-tree rebuild + one re-render per folder. It now
 * fetches all children first and applies them in ONE set via
 * loadChildrenBatch / withFileEntryChildrenBatch. These tests pin it:
 * - withFileEntryChildrenBatch applies several folders' children in
 *   one pass, leaves other branches untouched (same object), a
 *   missing path is a no-op, and it never mutates the input tree.
 * - loadChildrenBatch reads each path once, applies all children
 *   with a single store set, dedupes paths, and a failing child
 *   toasts + stays unloaded without dropping the others.
 * - setCurrentDir's expanded-dir restore now costs one batch set,
 *   not one set per folder (3 file-store sets total: loading,
 *   entries, batch).
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useFileStore,
  withFileEntryChildrenBatch,
} from '../src/stores/fileStore';
import { useToastStore } from '../src/stores/toastStore';
import type { FileEntry } from '../src/types';

const DIR = '/Users/gary';
const A = '/Users/gary/a';
const B = '/Users/gary/b';
const NESTED = '/Users/gary/a/nested';

function entry(
  path: string,
  name: string,
  isDirectory: boolean,
  children?: FileEntry[],
): FileEntry {
  return { path, name, isDirectory, isFile: !isDirectory, size: 0, modified: 0, children };
}

function childEntry(dir: string, name: string, isDirectory = false): FileEntry {
  return entry(`${dir}/${name}`, name, isDirectory);
}

const baseReadDir = async (path: string): Promise<FileEntry[]> => {
  if (path === A) return [childEntry(A, 'a1.txt'), childEntry(A, 'a2.txt')];
  if (path === B) return [childEntry(B, 'b1.txt')];
  if (path === NESTED) return [childEntry(NESTED, 'n1.txt')];
  if (path === DIR) {
    return [
      entry(A, 'a', true),
      entry(B, 'b', true),
      entry(`${DIR}/top.txt`, 'top.txt', false),
    ];
  }
  throw new Error(`Failed to read directory: Error: ENOENT: no such file or directory, scandir '${path}'`);
};

const readDirMock = vi.fn(baseReadDir);

let prevLucidAPI: unknown;
let toastErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // mockReset (not just mockClear): the failing-child test replaces
  // the implementation, and that must not leak into later tests.
  readDirMock.mockReset();
  readDirMock.mockImplementation(baseReadDir);
  const win = window as unknown as Record<string, unknown>;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = { fs: { readDir: readDirMock } };
  toastErrorSpy = vi.spyOn(useToastStore.getState(), 'error');
  useFileStore.setState({
    currentDir: DIR,
    entries: [
      entry(A, 'a', true, undefined),
      entry(B, 'b', true, undefined),
      entry(`${DIR}/top.txt`, 'top.txt', false),
    ],
    expandedDirs: new Set<string>(),
    selectedPath: null,
    openFiles: [],
    activeFilePath: null,
    error: null,
    isLoading: false,
  });
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  win.lucidAPI = prevLucidAPI;
  toastErrorSpy.mockRestore();
});

describe('withFileEntryChildrenBatch', () => {
  test('applies several folders children in one pass', () => {
    const tree = [
      entry(A, 'a', true, undefined),
      entry(B, 'b', true, undefined),
    ];
    const next = withFileEntryChildrenBatch(
      tree,
      new Map([
        [A, [childEntry(A, 'a1.txt')]],
        [B, [childEntry(B, 'b1.txt'), childEntry(B, 'b2.txt')]],
      ]),
    );
    expect(next[0].children?.map((c) => c.name)).toEqual(['a1.txt']);
    expect(next[1].children?.map((c) => c.name)).toEqual(['b1.txt', 'b2.txt']);
  });

  test('leaves other branches untouched (same object) and never mutates the input', () => {
    const untouched = entry(`${DIR}/top.txt`, 'top.txt', false);
    const tree = [entry(A, 'a', true, undefined), untouched];
    const next = withFileEntryChildrenBatch(
      tree,
      new Map([[A, [childEntry(A, 'a1.txt')]]]),
    );
    expect(next[1]).toBe(untouched);
    expect(next).not.toBe(tree);
    expect(next[0]).not.toBe(tree[0]);
    expect(tree[0].children).toBeUndefined();
  });

  test('a missing path is a no-op', () => {
    const tree = [entry(A, 'a', true, undefined)];
    const next = withFileEntryChildrenBatch(
      tree,
      new Map([['/Users/gary/nope', [childEntry('/Users/gary/nope', 'x.txt')]]]),
    );
    expect(next).toEqual(tree);
    expect(next[0].children).toBeUndefined();
  });

  test('a batch loading a folder and one of its children lands both in one pass', () => {
    const tree = [entry(A, 'a', true, undefined)];
    const next = withFileEntryChildrenBatch(
      tree,
      new Map([
        [A, [entry(NESTED, 'nested', true, undefined)]],
        [NESTED, [childEntry(NESTED, 'n1.txt')]],
      ]),
    );
    expect(next[0].children?.[0].children?.map((c) => c.name)).toEqual(['n1.txt']);
  });

  test('an empty batch returns the same tree', () => {
    const tree = [entry(A, 'a', true, undefined)];
    expect(withFileEntryChildrenBatch(tree, new Map())).toBe(tree);
  });
});

describe('loadChildrenBatch', () => {
  test('one set applies all children; each path is read once', async () => {
    let sets = 0;
    const unsub = useFileStore.subscribe(() => {
      sets += 1;
    });
    try {
      await useFileStore.getState().loadChildrenBatch([A, B]);
    } finally {
      unsub();
    }
    expect(readDirMock).toHaveBeenCalledTimes(2);
    expect(readDirMock).toHaveBeenCalledWith(A);
    expect(readDirMock).toHaveBeenCalledWith(B);
    expect(sets).toBe(1);
    const entries = useFileStore.getState().entries;
    expect(entries[0].children?.map((c) => c.name)).toEqual(['a1.txt', 'a2.txt']);
    expect(entries[1].children?.map((c) => c.name)).toEqual(['b1.txt']);
  });

  test('a failing child toasts and stays unloaded without dropping the others', async () => {
    readDirMock.mockImplementation(async (path: string): Promise<FileEntry[]> => {
      if (path === A) {
        throw new Error('Failed to read directory: Error: EACCES: permission denied');
      }
      return [childEntry(B, 'b1.txt')];
    });

    await useFileStore.getState().loadChildrenBatch([A, B]);

    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Could not open folder'));
    const entries = useFileStore.getState().entries;
    expect(entries[0].children).toBeUndefined();
    expect(entries[1].children?.map((c) => c.name)).toEqual(['b1.txt']);
  });

  test('duplicate paths are read once', async () => {
    await useFileStore.getState().loadChildrenBatch([A, A, B, A]);
    expect(readDirMock).toHaveBeenCalledTimes(2);
    expect(readDirMock).toHaveBeenCalledWith(A);
    expect(readDirMock).toHaveBeenCalledWith(B);
  });

  test('an empty batch reads nothing and sets nothing', async () => {
    let sets = 0;
    const unsub = useFileStore.subscribe(() => {
      sets += 1;
    });
    try {
      await useFileStore.getState().loadChildrenBatch([]);
    } finally {
      unsub();
    }
    expect(readDirMock).not.toHaveBeenCalled();
    expect(sets).toBe(0);
  });
});

describe('setCurrentDir expanded-dir restore (batched)', () => {
  test('restores two expanded dirs with one batch set, not one set per folder', async () => {
    useFileStore.setState({ expandedDirs: new Set<string>([A, B]) });
    let sets = 0;
    const unsub = useFileStore.subscribe(() => {
      sets += 1;
    });
    try {
      await useFileStore.getState().setCurrentDir(DIR);
    } finally {
      unsub();
    }
    // One read per path (top level + one per expanded dir).
    expect(readDirMock).toHaveBeenCalledTimes(3);
    expect(readDirMock).toHaveBeenCalledWith(DIR);
    expect(readDirMock).toHaveBeenCalledWith(A);
    expect(readDirMock).toHaveBeenCalledWith(B);
    // Exactly 3 file-store sets: loading, entries, ONE batch set.
    // (The old restore did one set per folder: 2 + N.)
    expect(sets).toBe(3);
    const entries = useFileStore.getState().entries;
    expect(entries[0].children?.map((c) => c.name)).toEqual(['a1.txt', 'a2.txt']);
    expect(entries[1].children?.map((c) => c.name)).toEqual(['b1.txt']);
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });
});
