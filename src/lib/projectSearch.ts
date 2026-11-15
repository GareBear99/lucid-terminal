/**
 * Project find-and-replace (Atom steal #5 — 2026-11-14).
 *
 * Atom's `find-and-replace` package: search the project with
 * ripgrep, show matches grouped by file, replace one or all.
 * Lucid's shape: the main process runs `rg --json` (or a
 * Node recursive scan when ripgrep is missing — the fallback
 * is honest about being slower) and this module owns the
 * pure parts: the match/result types, grouping, the search
 * pattern builder, and the replace computation (given a
 * file's content + the matches in it, the new content).
 * The replace itself writes through the main process, which
 * owns the root-containment check — a replace never writes
 * outside the searched root.
 *
 * Opt-in: the feature is off until `projectSearchEnabled`
 * is true in Settings (Gary's direction — find-and-replace
 * over the project is a power tool, not a default). The
 * panel shows the opt-in card until it is enabled.
 */

export interface SearchMatch {
  /** Absolute file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column of the match start (character column;
   *  ripgrep reports byte offsets, so a non-ASCII line
   *  before the match shifts the column — documented, not
   *  hidden). */
  column: number;
  /** The line's full text (without the newline). */
  text: string;
  /** The exact matched text (for a regex, the submatch). */
  matchText: string;
}

export type SearchScope = 'project' | 'file';

export interface SearchOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  scope: SearchScope;
  /** The file to search when scope is 'file' (absolute). */
  file?: string;
}

export type SearchEngine = 'ripgrep' | 'node';

export interface SearchResult {
  matches: SearchMatch[];
  /** True when the result cap stopped the search early. */
  truncated: boolean;
  engine: SearchEngine;
  root: string;
}

/** Hard cap on total matches returned (the UI never renders
 *  an unbounded list). */
export const SEARCH_MAX_RESULTS = 1000;
/** Per-file match cap (ripgrep's --max-count). */
export const SEARCH_MAX_PER_FILE = 50;

/** Group matches by file, in first-seen order. */
export function groupMatchesByFile(
  matches: SearchMatch[],
): Array<{ file: string; matches: SearchMatch[] }> {
  const groups = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const list = groups.get(match.file) ?? [];
    list.push(match);
    groups.set(match.file, list);
  }
  return [...groups.entries()].map(([file, matches]) => ({ file, matches }));
}

/**
 * Build the search pattern for a query. Literal mode escapes
 * the query; regex mode compiles it (an invalid regex throws
 * a SyntaxError with the engine's message — the caller shows
 * it, never a generic "search failed"). Whole-word wraps the
 * pattern in \b…\b. Returns the RegExp source + flags the
 * node fallback uses.
 */
export function buildSearchPattern(options: SearchOptions): {
  source: string;
  flags: string;
} {
  let source: string;
  if (options.regex) {
    // Compiles here so an invalid regex fails fast with the
    // engine's message.
    new RegExp(options.query);
    source = options.query;
  } else {
    source = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (options.wholeWord) source = `\\b(?:${source})\\b`;
  return { source, flags: options.caseSensitive ? 'g' : 'gi' };
}

/**
 * Compute a file's new content after replacing matches.
 * Matches are applied right-to-left per line, so columns
 * stay valid as earlier replacements change the line's
 * length. Only the matched span is replaced (the matchText
 * at the match's column); the rest of the line is untouched.
 * Returns the new content and how many matches were
 * replaced (a match whose span no longer matches the line
 * — the file changed under us — is skipped, not forced).
 */
export function applyReplacements(
  content: string,
  matches: SearchMatch[],
  replacement: string,
): { content: string; replacedCount: number } {
  const lines = content.split('\n');
  const byLine = new Map<number, SearchMatch[]>();
  for (const match of matches) {
    const list = byLine.get(match.line) ?? [];
    list.push(match);
    byLine.set(match.line, list);
  }
  let replacedCount = 0;
  for (const [lineNumber, lineMatches] of byLine) {
    const index = lineNumber - 1;
    if (index < 0 || index >= lines.length) continue;
    // Right-to-left: later columns first.
    const sorted = [...lineMatches].sort((a, b) => b.column - a.column);
    let line = lines[index];
    for (const match of sorted) {
      const start = match.column - 1;
      if (start < 0 || start + match.matchText.length > line.length) continue;
      if (line.slice(start, start + match.matchText.length) !== match.matchText) {
        continue; // the file changed under us — skip, don't force
      }
      line =
        line.slice(0, start) + replacement + line.slice(start + match.matchText.length);
      replacedCount += 1;
    }
    lines[index] = line;
  }
  return { content: lines.join('\n'), replacedCount };
}
