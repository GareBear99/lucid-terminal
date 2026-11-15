/**
 * Project symbols (Atom steal #22, 2026-11-14) — a fuzzy list of
 * every top-level symbol in the project, `name:line` on the
 * primary row and the file on the secondary, built from the
 * tree-sitter index only.
 *
 * Atom did NOT index the project itself: it read a pre-generated
 * `tags` file (ctags). Lucid has no ctags and no `tags` file —
 * the index is built here, by parsing each TS/TSX file with
 * Lucid's own tree-sitter grammars (the same definitions the
 * file-level go-to-symbol reads). Other languages have no
 * tree-sitter grammar in Lucid, so they are not in the index —
 * that is a stated limit, not a silent gap.
 *
 * The index is built on demand (when the modal opens) and cached
 * until the next build: files edited after the build stay stale
 * until it rebuilds. Open files contribute their in-memory
 * content, so unsaved edits ARE indexed; everything else is
 * read from disk through the bridge.
 */

import { fuzzyMatch } from './fuzzyMatch';
import { getLanguageForPath } from './treeSitter';
import type { FileDefinition } from './fileStructure';

/** One symbol in the project index. `line` is 1-based. */
export interface ProjectSymbol {
  name: string;
  kind: string;
  path: string;
  /** 1-based line of the declaration. */
  line: number;
}

/** Cap the build: a project with thousands of files should not
 *  freeze the modal while every file parses. */
export const MAX_INDEXED_FILES = 300;
/** Skip files bigger than this — generated bundles are not
 *  where a human jumps to a symbol. */
export const MAX_INDEXED_FILE_BYTES = 200_000;

/** True when the path is one Lucid's tree-sitter grammars parse. */
export function isIndexableSymbolPath(path: string): boolean {
  return getLanguageForPath(path) !== null;
}

/**
 * Flatten one file's parsed definitions into index entries.
 * `startRow` is 0-based in the tree; the index is 1-based.
 */
export function symbolsFromDefinitions(
  path: string,
  definitions: FileDefinition[],
): ProjectSymbol[] {
  return definitions.map((def) => ({
    name: def.name,
    kind: def.kind,
    path,
    line: def.startRow + 1,
  }));
}

/**
 * Build the flat index from per-file parsed definitions.
 * Files are kept in the order given; definitions stay in file
 * order. Duplicate names are kept — the search ranks them and
 * the file on the secondary row disambiguates.
 */
export function buildProjectSymbolIndex(
  entries: { path: string; definitions: FileDefinition[] }[],
): ProjectSymbol[] {
  return entries.flatMap((entry) =>
    symbolsFromDefinitions(entry.path, entry.definitions),
  );
}

/**
 * Fuzzy-search the index by symbol name. Rank: exact name match
 * first, then a name that starts with the query, then fuzzy
 * score (higher first), then path, then line — so the same name
 * in two files lists deterministically.
 */
export function searchProjectSymbols(
  symbols: ProjectSymbol[],
  query: string,
): ProjectSymbol[] {
  const trimmed = query.trim();
  if (!trimmed) return symbols;
  const lower = trimmed.toLowerCase();
  const scored: { symbol: ProjectSymbol; score: number; rank: number }[] = [];
  for (const symbol of symbols) {
    const nameLower = symbol.name.toLowerCase();
    if (nameLower === lower) {
      scored.push({ symbol, score: 0, rank: 0 });
      continue;
    }
    if (nameLower.startsWith(lower)) {
      scored.push({ symbol, score: 0, rank: 1 });
      continue;
    }
    const match = fuzzyMatch(trimmed, symbol.name);
    if (match) scored.push({ symbol, score: match.score, rank: 2 });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.score - a.score ||
      a.symbol.path.localeCompare(b.symbol.path) ||
      a.symbol.line - b.symbol.line,
  );
  return scored.map((entry) => entry.symbol);
}
