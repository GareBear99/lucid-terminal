import type { FileEntry } from '../types';

/**
 * File-tree virtualization (files-section fix step 4).
 *
 * The Explorer used to render EVERY expanded node as a real DOM row
 * (recursive renderFileTree in Sidebar). Expanding a few big home
 * folders rendered thousands of rows. The tree is now flattened to
 * the visible rows only (same visibility rules as the old recursive
 * render) and the Sidebar renders just the scroll window, with top /
 * bottom spacers standing in for the off-screen rows.
 *
 * Row height is a CONTRACT, not an assumption: every tree row div
 * carries `h-7` (28 px), so the windowing math below is exact.
 * The scroll container's own `py-1` padding and the current-dir
 * header above the rows shift the rows by a constant few px; the
 * overscan absorbs that, so the window is conservative (a few extra
 * rows), never short.
 */

/** One visible row of the flattened tree: the entry + its indent level. */
export interface VisibleFileTreeRow {
  entry: FileEntry;
  level: number;
}

/** Fixed tree-row height in px — matches the `h-7` class on the row div. */
export const FILE_TREE_ROW_HEIGHT_PX = 28;
/** Rows rendered above/below the visible window, so fast scrolling never shows a gap. */
export const FILE_TREE_OVERSCAN_ROWS = 10;

/**
 * Flatten the tree to the rows a user can actually see: every
 * top-level entry, plus the children of a directory only when it is
 * expanded AND its children have been loaded (children === undefined
 * means not loaded yet — same rule as the old recursive render, which
 * rendered `{item.children && renderFileTree(...)}` under an expanded
 * dir). Order and levels match the old render exactly.
 */
export function flattenVisibleFileTree(
  entries: FileEntry[],
  expandedDirs: Set<string>,
): VisibleFileTreeRow[] {
  const rows: VisibleFileTreeRow[] = [];
  const walk = (items: FileEntry[], level: number): void => {
    for (const item of items) {
      rows.push({ entry: item, level });
      if (item.isDirectory && expandedDirs.has(item.path) && item.children) {
        walk(item.children, level + 1);
      }
    }
  };
  walk(entries, 0);
  return rows;
}

/**
 * Which slice [start, end) of a `totalRows`-row list to render for a
 * scroll position: the rows intersecting the viewport, plus
 * `overscan` rows above and below. Clamped to [0, totalRows]. When
 * the list fits the viewport, the window is the whole list.
 */
export function computeVisibleWindow(
  totalRows: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = FILE_TREE_ROW_HEIGHT_PX,
  overscan: number = FILE_TREE_OVERSCAN_ROWS,
): { start: number; end: number } {
  if (totalRows <= 0) return { start: 0, end: 0 };
  const start = Math.min(
    totalRows,
    Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
  );
  const end = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );
  return { start, end };
}
