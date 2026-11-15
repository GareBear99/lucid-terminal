/**
 * Go-to-line parsing (Atom steal #8 — 2026-11-14).
 *
 * Atom's go-to-line (`atom/packages/go-to-line/lib/
 * go-to-line-view.js:64-79`): the input accepts only digits
 * and `:`, navigates live as you type, parses `row` or
 * `row:column`, unfolds the row and centres. A missing row
 * means "the current row"; a missing column means "first
 * character of the line". The same `row:column` syntax is
 * embedded in the fuzzy finder (`fuzzy-finder-view.js:306-313`
 * `isQueryALineJump`).
 *
 * Pure functions — no Electron, no editor — unit-tested.
 */

/** A parsed go-to-line request (1-based, column 1 = line start). */
export interface GoToLineTarget {
  lineNumber: number;
  column: number;
}

/**
 * Parse a go-to-line input (`42`, `42:10`, `:10`, ``).
 * `currentLineNumber` is the cursor's line (1-based) for the
 * missing-row case. Returns null when the input has no digits
 * at all. Out-of-range lines are clamped by the caller (it
 * knows the file's line count).
 */
export function parseGoToLine(
  input: string,
  currentLineNumber: number,
): GoToLineTarget | null {
  // No digits at all (empty input, a lone ':') navigates
  // nowhere — Atom's view returns early in that case.
  if (!/\d/.test(input)) return null;
  const parts = input.split(':');
  const rowPart = parts[0] ?? '';
  const colPart = parts[1] ?? '';
  const row = rowPart.length > 0 ? parseInt(rowPart, 10) : currentLineNumber;
  const column = colPart.length > 0 ? parseInt(colPart, 10) : 1;
  if (!Number.isFinite(row) || !Number.isFinite(column)) return null;
  return {
    lineNumber: Math.max(1, row),
    column: Math.max(1, column),
  };
}

/** True when the query ends in a `:line` (or `:line:col`) suffix. */
export function isLineJumpQuery(query: string): boolean {
  return /:\d+(:\d+)?$/.test(query);
}

/**
 * Split a fuzzy-finder query's line-jump suffix off:
 * `src/foo.ts:12` → `{ pathQuery: 'src/foo.ts', lineNumber: 12,
 * column: 1 }`. Returns null when there is no suffix.
 */
export function splitLineJumpSuffix(
  query: string,
  currentLineNumber: number,
): { pathQuery: string; target: GoToLineTarget } | null {
  // Non-greedy path: for `src/foo.ts:12:3` the path is
  // `src/foo.ts`, not `src/foo.ts:12`.
  const match = /^(.*?):(\d+)(?::(\d+))?$/.exec(query);
  if (!match) return null;
  const pathQuery = match[1] ?? '';
  if (pathQuery.length === 0) return null;
  const target = parseGoToLine(
    `${match[2] ?? ''}:${match[3] ?? ''}`,
    currentLineNumber,
  );
  if (!target) return null;
  return { pathQuery, target };
}
