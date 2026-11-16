/**
 * Line diffs from a unified diff.
 *
 * Atom's git model exposes `getLineDiffs(path, text)` returning
 * hunks `{oldStart, newStart, oldLines, newLines}` (1-based) —
 * `atom/src/git-repository.js:463-470` — and the gutter package
 * maps each hunk to added / modified / removed
 * (`atom/packages/git-diff/lib/git-diff-view.js:225-256`).
 * Lucid's main process already returns the unified diff against
 * HEAD (`git:diff` IPC, per file); this module is the renderer
 * half: parse the hunks out of that text and map them onto
 * editor lines, in Atom's exact mapping.
 *
 * Pure functions — no Electron, no shell — unit-tested on their
 * own. A diff that does not parse yields no hunks, never a guess.
 */

/** One hunk, in Atom's `getLineDiffs` shape (1-based starts). */
export interface LineDiff {
  /** First line of the hunk in the old file (1-based). */
  oldStart: number;
  /** First line of the hunk in the new file (1-based). */
  newStart: number;
  /** Lines in the old file covered by the hunk. */
  oldLines: number;
  /** Lines in the new file covered by the hunk. */
  newLines: number;
}

/** A hunk mapped onto editor lines for a decoration. */
export interface GutterRange {
  kind: 'added' | 'modified' | 'removed';
  /** First editor line (1-based). */
  startLine: number;
  /** Last editor line (1-based, inclusive). */
  endLine: number;
  /** The CSS class for the decoration (Atom's class names). */
  className: string;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse the hunks out of a unified diff. Only the hunk headers
 * are read — the `+`/`-`/context lines are not needed to place
 * the decorations, and a header that does not parse is skipped.
 * A file header (`diff --git`, `+++ b/...`) with no hunks yields
 * an empty list. Returns [] for empty / null-ish input.
 */
export function parseUnifiedDiff(diffText: string | null | undefined): LineDiff[] {
  if (!diffText) return [];
  const diffs: LineDiff[] = [];
  for (const line of diffText.split('\n')) {
    const match = HUNK_HEADER.exec(line);
    if (!match) continue;
    const oldStart = Number(match[1]);
    const oldLines = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newLines = match[4] === undefined ? 1 : Number(match[4]);
    if (
      !Number.isFinite(oldStart) ||
      !Number.isFinite(oldLines) ||
      !Number.isFinite(newStart) ||
      !Number.isFinite(newLines)
    ) {
      continue;
    }
    diffs.push({ oldStart, newStart, oldLines, newLines });
  }
  return diffs;
}

/**
 * Map hunks onto editor lines — Atom's `updateDiffs` mapping,
 * verbatim:
 * - oldLines 0, newLines > 0 → added, lines newStart..newStart+newLines-1.
 * - newLines 0, oldLines > 0 → removed, the line the deletion
 *   sits after (newStart, 1-based); at the very start of the
 *   file (newStart 0) the first line, with the
 *   `git-previous-line-removed` class.
 * - otherwise → modified, lines newStart..newStart+newLines-1.
 */
export function hunksToGutterRanges(diffs: readonly LineDiff[]): GutterRange[] {
  const ranges: GutterRange[] = [];
  for (const diff of diffs) {
    const { newStart, oldLines, newLines } = diff;
    if (oldLines === 0 && newLines > 0) {
      ranges.push({
        kind: 'added',
        startLine: newStart,
        endLine: newStart + newLines - 1,
        className: 'git-line-added',
      });
    } else if (newLines === 0 && oldLines > 0) {
      if (newStart === 0) {
        ranges.push({
          kind: 'removed',
          startLine: 1,
          endLine: 1,
          className: 'git-previous-line-removed',
        });
      } else {
        ranges.push({
          kind: 'removed',
          startLine: newStart,
          endLine: newStart,
          className: 'git-line-removed',
        });
      }
    } else if (newLines > 0) {
      ranges.push({
        kind: 'modified',
        startLine: newStart,
        endLine: newStart + newLines - 1,
        className: 'git-line-modified',
      });
    }
    // A hunk with 0 new lines and 0 old lines is not a change.
  }
  return ranges;
}

/** Parse a unified diff and map it straight onto gutter ranges. */
export function gutterRangesForDiff(
  diffText: string | null | undefined,
): GutterRange[] {
  return hunksToGutterRanges(parseUnifiedDiff(diffText));
}
