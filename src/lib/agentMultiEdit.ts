/**
 * The atomic multi-edit engine — the agent loop's edit
 * primitive (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue's `multi_edit` tool
 * (`core/tools/definitions/multiEdit.ts`) + its application
 * path (`core/edit/searchAndReplace/performReplace.ts`):
 * a list of `{old_string, new_string, replace_all?}`
 * operations on one file, applied in sequence, ALL valid
 * or NONE applied. The description text in Continue's
 * definition is itself the spec — a fresh read first, no
 * parallel edit calls, earlier edits can mangle later ones,
 * old_string must match exactly including whitespace.
 *
 * What is re-implemented here, in TS, not copied: the
 * matching ladder (exact → line-trimmed → whitespace-
 * collapsed) and the indent repair. When a fuzzy match is
 * found, the replacement is re-indented to the file's
 * actual indentation — the real robustness win in
 * performReplace.ts. What is NOT carried over: the
 * diff-match-patch fallback (heavyweight; the three
 * matchers cover the realistic cases) and the temp-git-
 * repo cherry-pick matcher (Aider's, heavier still).
 *
 * Pure functions — no React, no stores, no IPC — unit-
 * testable. The tool that calls this
 * (src/lib/agentToolsImpl.ts) owns the read, the
 * checkEdit pre-flight, and the write; this module only
 * ever transforms strings, and it never touches disk.
 */

export interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface AppliedEdit {
  /** The operation, as applied. */
  operation: EditOperation;
  /** How many replacements this operation made. */
  replacements: number;
  /** How the match was found — 'exact' is the only one
   *  that needs no repair; the fuzzy kinds re-indent. */
  matchKind: 'exact' | 'trimmed' | 'whitespace';
}

/** Why an edit failed — the loop returns this as context
 *  to the brain, never as a thrown error (Continue's
 *  callTool contract: errors are context, not exceptions). */
export type EditFailureReason =
  | 'not-found'
  | 'ambiguous'
  | 'no-change'
  | 'empty-old';

export class EditError extends Error {
  readonly reason: EditFailureReason;
  readonly operation: EditOperation;
  constructor(reason: EditFailureReason, operation: EditOperation) {
    super(`multi_edit failed (${reason}): ${JSON.stringify(operation.old_string.slice(0, 80))}`);
    this.name = 'EditError';
    this.reason = reason;
    this.operation = operation;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

function replaceAllOccurrences(haystack: string, needle: string, replacement: string): string {
  return haystack.split(needle).join(replacement);
}

/** The leading whitespace of a line (spaces/tabs, as-is). */
function lineIndent(line: string): string {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : '';
}

/**
 * Re-indent a replacement to the matched region's actual
 * indentation (Continue's performReplace repair): the
 * first line takes the matched line's indent, every later
 * line is shifted by the same delta relative to the
 * old string's own first-line indent. A replacement whose
 * first line is already indented keeps its relative shape.
 */
export function repairIndent(oldString: string, newString: string, matchedFirstLine: string): string {
  const oldFirstLine = oldString.split('\n')[0] ?? '';
  const oldIndent = lineIndent(oldFirstLine);
  const matchedIndent = lineIndent(matchedFirstLine);
  if (oldIndent === matchedIndent) return newString;
  const lines = newString.split('\n');
  return lines
    .map((line) => {
      if (line === '') return line;
      // The first line takes the matched indent — but only
      // strip the old indent when the line actually has
      // it. An unindented replacement line must not lose
      // its first characters (the old code sliced
      // oldIndent.length off unconditionally — "return 2;"
      // with a 4-space old indent came out as "rn 2;").
      const stripped = line.startsWith(oldIndent) ? line.slice(oldIndent.length) : line;
      return matchedIndent + stripped;
    })
    .join('\n');
}

/**
 * Find one occurrence of oldString in content.
 * Ladder (Continue's, in order):
 * 1. exact — the string as given, including whitespace.
 * 2. line-trimmed — every line compared after trimming
 *    both ends; the match must be unique in the file.
 * 3. whitespace-collapsed — every run of whitespace
 *    collapsed to one space on both sides; unique only.
 * Returns the matched text + its start offset + the kind,
 * or null when nothing matches (or when a fuzzy match is
 * ambiguous — an ambiguous fuzzy match is a failure, not a
 * guess: the loop reports it and the brain re-plans).
 */
export function findEditMatch(
  content: string,
  oldString: string,
): { matched: string; start: number; kind: 'exact' | 'trimmed' | 'whitespace' } | null {
  if (!oldString) return null;
  const exactAt = content.indexOf(oldString);
  if (exactAt !== -1) {
    // Exact but ambiguous without replace_all is still an
    // exact match — the caller decides ambiguity (a second
    // exact occurrence makes a single replace ambiguous).
    return { matched: oldString, start: exactAt, kind: 'exact' };
  }

  const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const oldLines = oldString.split('\n').map((l) => l.trim());
  const contentLines = content.split('\n');

  // Line-trimmed: slide a window of oldLines.length over the
  // file's lines and compare trimmed lines.
  const trimmedMatches: number[] = [];
  for (let i = 0; i + oldLines.length <= contentLines.length; i++) {
    let ok = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (contentLines[i + j].trim() !== oldLines[j]) {
        ok = false;
        break;
      }
    }
    if (ok) trimmedMatches.push(i);
  }
  if (trimmedMatches.length === 1) {
    const startLine = trimmedMatches[0];
    const matched = contentLines.slice(startLine, startLine + oldLines.length).join('\n');
    const start = contentLines.slice(0, startLine).join('\n').length + (startLine > 0 ? 1 : 0);
    return { matched, start, kind: 'trimmed' };
  }
  if (trimmedMatches.length > 1) return null; // ambiguous

  // Whitespace-collapsed: one comparison over the whole text.
  const collapsedOld = collapse(oldString);
  const collapsedContent = collapse(content);
  const at = collapsedContent.indexOf(collapsedOld);
  if (at === -1) return null;
  // Unique in the collapsed text only — a second collapsed
  // hit means ambiguous.
  if (collapsedContent.indexOf(collapsedOld, at + collapsedOld.length) !== -1) return null;
  // Map the collapsed offset back to real offsets: walk the
  // content counting collapsed characters (one per whitespace
  // run, one per non-space char) until the match starts, then
  // keep walking until the match's collapsed length is
  // consumed — that is the real end of the matched region.
  // The walk mirrors collapse(): leading whitespace is
  // trimmed away, so it counts for nothing.
  let i = 0;
  while (i < content.length && /\s/.test(content[i])) i++;
  let collapsedSeen = 0;
  let realStart = -1;
  let inWhitespace = false;
  for (; i < content.length; i++) {
    const ch = content[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        collapsedSeen += 1;
        inWhitespace = true;
      }
    } else {
      collapsedSeen += 1;
      inWhitespace = false;
    }
    // After consuming the char at collapsed index `at`,
    // collapsedSeen is at+1 — that char is the match start.
    if (realStart === -1 && collapsedSeen > at) {
      realStart = i;
    }
    if (realStart !== -1 && collapsedSeen >= at + collapsedOld.length) {
      return { matched: content.slice(realStart, i + 1), start: realStart, kind: 'whitespace' };
    }
  }
  return null;
}

/**
 * Apply ONE edit operation to content. Throws EditError on
 * not-found / ambiguous / no-change / empty-old. A single
 * replace with more than one exact occurrence is ambiguous
 * (Continue's rule — use replace_all for renames).
 */
export function applyEditOperation(
  content: string,
  operation: EditOperation,
): { content: string; applied: AppliedEdit } {
  const { old_string, new_string } = operation;
  if (!old_string) {
    throw new EditError('empty-old', operation);
  }
  if (old_string === new_string) {
    throw new EditError('no-change', operation);
  }
  const match = findEditMatch(content, old_string);
  if (!match) {
    throw new EditError('not-found', operation);
  }
  if (operation.replace_all) {
    // replace_all is exact-only: a fuzzy match cannot be
    // trusted to repeat across the file (the indent repair
    // is per-occurrence). If the exact string occurs, replace
    // every occurrence; if it only matches fuzzily, replace
    // the one fuzzy match.
    if (match.kind === 'exact') {
      const count = countOccurrences(content, old_string);
      return {
        content: replaceAllOccurrences(content, old_string, new_string),
        applied: { operation, replacements: count, matchKind: 'exact' },
      };
    }
    const repaired = repairIndent(
      old_string,
      new_string,
      content.slice(match.start).split('\n')[0] ?? '',
    );
    return {
      content:
        content.slice(0, match.start) + repaired + content.slice(match.start + match.matched.length),
      applied: { operation, replacements: 1, matchKind: match.kind },
    };
  }
  // Single replace: an exact match is ambiguous when the
  // string occurs more than once.
  if (match.kind === 'exact' && countOccurrences(content, old_string) > 1) {
    throw new EditError('ambiguous', operation);
  }
  const replacement =
    match.kind === 'exact'
      ? new_string
      : repairIndent(old_string, new_string, content.slice(match.start).split('\n')[0] ?? '');  return {
    content:
      content.slice(0, match.start) + replacement + content.slice(match.start + match.matched.length),
    applied: { operation, replacements: 1, matchKind: match.kind },
  };
}

/**
 * Apply a list of edits to one file's content, in order.
 * ATOMIC: all edits must be valid or none apply — the
 * result is the original content plus the failure, never a
 * half-edited file (Continue's multi_edit contract).
 */
export function executeMultiEdit(
  content: string,
  edits: EditOperation[],
): { content: string; applied: AppliedEdit[] } {
  let next = content;
  const applied: AppliedEdit[] = [];
  for (const edit of edits) {
    // A failure throws before anything is returned — the
    // caller keeps the original content, so the operation
    // is atomic by construction.
    const result = applyEditOperation(next, edit);
    next = result.content;
    applied.push(result.applied);
  }
  return { content: next, applied };
}
