/**
 * File-tree virtualization helpers (files-section fix step 4).
 *
 * The Explorer used to render EVERY expanded node as a real DOM row.
 * It now flattens the visible tree and renders only the scroll
 * window (plus overscan), with spacers standing in for the rest.
 * These tests pin the pure helpers:
 * - flattenVisibleFileTree: only expanded dirs contribute children,
 *   levels and order match the old recursive render, empty / deep
 *   trees behave.
 * - computeVisibleWindow: the [start, end) slice for a scroll
 *   position, clamped, whole-list when it fits.
 *
 * Run with: npm test
 */
import { describe, test, expect } from 'vitest';
import {
  flattenVisibleFileTree,
  computeVisibleWindow,
  FILE_TREE_ROW_HEIGHT_PX,
  FILE_TREE_OVERSCAN_ROWS,
  type VisibleFileTreeRow,
} from '../src/lib/fileTreeVirtualization';
import type { FileEntry } from '../src/types';

function entry(
  path: string,
  name: string,
  isDirectory: boolean,
  children?: FileEntry[],
): FileEntry {
  return { path, name, isDirectory, isFile: !isDirectory, size: 0, modified: 0, children };
}

function rowsToPaths(rows: VisibleFileTreeRow[]): string[] {
  return rows.map((r) => r.entry.path);
}

describe('flattenVisibleFileTree', () => {
  test('empty tree flattens to no rows', () => {
    expect(flattenVisibleFileTree([], new Set())).toEqual([]);
  });

  test('top-level entries only when nothing is expanded', () => {
    const tree = [
      entry('/root/a', 'a', true, [entry('/root/a/x.txt', 'x.txt', false)]),
      entry('/root/b.txt', 'b.txt', false),
    ];
    const rows = flattenVisibleFileTree(tree, new Set());
    expect(rowsToPaths(rows)).toEqual(['/root/a', '/root/b.txt']);
    expect(rows.map((r) => r.level)).toEqual([0, 0]);
  });

  test('an expanded dir contributes its children; a collapsed one does not', () => {
    const tree = [
      entry('/root/a', 'a', true, [
        entry('/root/a/x.txt', 'x.txt', false),
        entry('/root/a/y.txt', 'y.txt', false),
      ]),
      entry('/root/b', 'b', true, [entry('/root/b/z.txt', 'z.txt', false)]),
      entry('/root/c.txt', 'c.txt', false),
    ];
    const rows = flattenVisibleFileTree(tree, new Set(['/root/a']));
    expect(rowsToPaths(rows)).toEqual([
      '/root/a',
      '/root/a/x.txt',
      '/root/a/y.txt',
      '/root/b',
      '/root/c.txt',
    ]);
    expect(rows.map((r) => r.level)).toEqual([0, 1, 1, 0, 0]);
  });

  test('an expanded dir whose children were never loaded contributes nothing extra', () => {
    const tree = [entry('/root/a', 'a', true, undefined)];
    const rows = flattenVisibleFileTree(tree, new Set(['/root/a']));
    expect(rowsToPaths(rows)).toEqual(['/root/a']);
  });

  test('an expanded dir with loaded-but-empty children contributes nothing extra', () => {
    const tree = [entry('/root/a', 'a', true, [])];
    const rows = flattenVisibleFileTree(tree, new Set(['/root/a']));
    expect(rowsToPaths(rows)).toEqual(['/root/a']);
  });

  test('deeply nested expansion: levels and order follow the tree', () => {
    const tree = [
      entry('/root/a', 'a', true, [
        entry('/root/a/b', 'b', true, [
          entry('/root/a/b/c', 'c', true, [entry('/root/a/b/c/deep.txt', 'deep.txt', false)]),
          entry('/root/a/b/mid.txt', 'mid.txt', false),
        ]),
      ]),
    ];
    const rows = flattenVisibleFileTree(
      tree,
      new Set(['/root/a', '/root/a/b', '/root/a/b/c']),
    );
    expect(rowsToPaths(rows)).toEqual([
      '/root/a',
      '/root/a/b',
      '/root/a/b/c',
      '/root/a/b/c/deep.txt',
      '/root/a/b/mid.txt',
    ]);
    expect(rows.map((r) => r.level)).toEqual([0, 1, 2, 3, 2]);
  });

  test('a nested expansion under a collapsed parent stays hidden', () => {
    const tree = [
      entry('/root/a', 'a', true, [
        entry('/root/a/b', 'b', true, [entry('/root/a/b/x.txt', 'x.txt', false)]),
      ]),
    ];
    // /root/a/b is in expandedDirs, but its parent is collapsed.
    const rows = flattenVisibleFileTree(tree, new Set(['/root/a/b']));
    expect(rowsToPaths(rows)).toEqual(['/root/a']);
  });

  test('rows carry the entry objects in tree order', () => {
    const file = entry('/root/f.txt', 'f.txt', false);
    const rows = flattenVisibleFileTree([file], new Set());
    expect(rows).toEqual([{ entry: file, level: 0 }]);
    expect(rows[0].entry).toBe(file);
  });
});

describe('computeVisibleWindow', () => {
  test('row height is 28px and overscan is 10 rows', () => {
    expect(FILE_TREE_ROW_HEIGHT_PX).toBe(28);
    expect(FILE_TREE_OVERSCAN_ROWS).toBe(10);
  });

  test('empty list windows to nothing', () => {
    expect(computeVisibleWindow(0, 0, 500)).toEqual({ start: 0, end: 0 });
  });

  test('a list that fits the viewport renders whole', () => {
    expect(computeVisibleWindow(5, 0, 500)).toEqual({ start: 0, end: 5 });
    expect(computeVisibleWindow(10, 0, 280)).toEqual({ start: 0, end: 10 });
  });

  test('an unmeasured viewport (height 0) renders the overscan rows only', () => {
    expect(computeVisibleWindow(100, 0, 0)).toEqual({ start: 0, end: 10 });
  });

  test('a scrolled window starts overscan rows above the first visible row', () => {
    // 100 rows, viewport 280px (10 rows), scrolled 28 * 20 = 560px:
    // visible rows 20..30, overscan 10 -> [10, 40).
    expect(computeVisibleWindow(100, 560, 280)).toEqual({ start: 10, end: 40 });
  });

  test('the window clamps at the start and the end of the list', () => {
    // Near the top: start cannot go below 0.
    expect(computeVisibleWindow(100, 28, 280)).toEqual({ start: 0, end: 21 });
    // Near the bottom: end cannot pass the list length.
    expect(computeVisibleWindow(30, 28 * 25, 280)).toEqual({ start: 15, end: 30 });
    // Scrolled past the end entirely: empty window at the tail.
    expect(computeVisibleWindow(30, 28 * 100, 280)).toEqual({ start: 30, end: 30 });
  });

  test('partial rows at the viewport edges are included', () => {
    // scrollTop 10px into row 0, viewport 285px: rows 0..10 visible
    // (ceil((10 + 285) / 28) = 11 rows incl. the partial one at the
    // bottom) + 10 overscan -> [0, 21).
    expect(computeVisibleWindow(100, 10, 285)).toEqual({ start: 0, end: 21 });
  });
});
