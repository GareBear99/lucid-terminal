/**
 * Merged completions.
 *
 * Atom's `autocomplete-plus` shape: one completion list, fed
 * by many providers. Each provider declares a
 * `suggestionPriority` (higher sorts first) and an
 * `inclusionPriority`; a provider with
 * `excludeLowerPriority` set stops the fan-out below it.
 * Lucid had the opposite: the LSP provider appended pattern
 * suggestions after its own items, and every source ranked
 * itself — the sources competed instead of merging. This
 * registry is the one fan-out: the editor's completion
 * provider builds one request, the registry asks every
 * matching provider, and the merge dedups, badges, and sorts.
 *
 * The merge is synchronous — every built-in provider is
 * synchronous (the LSP, the structure fallback, patterns,
 * snippets, words), and Monaco's provider stays synchronous
 * too. A future async provider prefetches into a sync
 * snapshot; the merge never awaits.
 *
 * Sources (Atom's names, Lucid's meanings):
 * - lsp: the TypeScript service's verified symbols (the
 *   fact-checker — a real symbol, a real kind, real docs).
 * - snippet: snippet bodies (Atom's autocomplete-snippets,
 *   inclusionPriority 1, suggestionPriority 2 — here 3, so a
 *   snippet the user named beats a repeated pattern).
 * - pattern: repeated lines/chains from the user's own open
 *   files.
 * - structure: tree-sitter identifiers in scope — the
 *   fallback when the engine is dead (Kite's failure mode).
 * - word: subsequence matches over the current file's words
 *   (Atom's autocomplete-word provider, priority 0 — the
 *   bottom of the list, never above a real symbol).
 *
 * Every item carries its source, and the merge writes the
 * source into the item's `detail` — the suggest widget shows
 * it on the right of every row, so the user can see where
 * each suggestion came from. A verified LSP symbol always
 * wins over a repeated idiom (dedup keeps the higher-
 * priority item when two sources offer the same label).
 */

import { fuzzyScore } from './fuzzyMatch';

/** Where a completion item came from. */
export type CompletionSource =
  | 'lsp'
  | 'snippet'
  | 'pattern'
  | 'structure'
  | 'word';

/** The source badge the suggest widget shows. */
export const COMPLETION_SOURCE_LABELS: Record<CompletionSource, string> = {
  lsp: 'LSP',
  snippet: 'Snippet',
  pattern: 'Pattern',
  structure: 'Structure',
  word: 'Word',
};

/** Monaco's InsertAsSnippet flag (CompletionItemInsertTextRule).
 *  Kept as a literal so this module stays Monaco-free. */
export const INSERT_TEXT_RULE_SNIPPET = 4;

/** A Monaco Range, plain data. */
export interface CompletionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** One merged completion item. `kind` is a Monaco
 *  CompletionItemKind number (the registration site resolves
 *  it from the live monaco enum, falling back to the contract
 *  table in src/lib/tsLspContract.ts). `__lspItem` is the
 *  opaque LSP item for the lazy resolve — only the lsp
 *  source sets it. */
export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: { value: string } | string;
  sortText?: string;
  insertText: string;
  /** Set to INSERT_TEXT_RULE_SNIPPET when insertText is
   *  snippet syntax (${1:placeholder}) for Monaco to expand. */
  insertTextRules?: number;
  range: CompletionRange;
  additionalTextEdits?: Array<{ range: CompletionRange; text: string }>;
  source: CompletionSource;
  __lspItem?: unknown;
}

/** What the merge asks each provider. `identifiers` are the
 *  tree-sitter names in scope at the cursor (the structure
 *  fallback's input); `modelText` is the current file's text
 *  (the word provider's input); `prefixRange` covers the
 *  line prefix typed so far (the pattern provider replaces
 *  exactly that). */
export interface CompletionRequest {
  word: string;
  linePrefix: string;
  lineNumber: number;
  column: number;
  languageId: string;
  modelText: string;
  identifiers: string[];
  wordRange: CompletionRange;
  prefixRange: CompletionRange;
}

export interface CompletionProvider {
  /** The source id (one provider per source). */
  id: CompletionSource;
  /** Higher sorts first (lsp 5, snippet 3, pattern 2,
   *  structure 1, word 0). */
  suggestionPriority: number;
  /** When true and this provider returned items, lower-
   *  priority providers contribute nothing. */
  excludeLowerPriority?: boolean;
  /** Language ids this provider serves, or ['*'] for all. */
  selector: string[];
  getSuggestions: (request: CompletionRequest) => CompletionItem[];
}

const providers = new Map<CompletionSource, CompletionProvider>();

/** Register (or replace) a provider by its source id. */
export function registerCompletionProvider(
  provider: CompletionProvider,
): void {
  providers.set(provider.id, provider);
}

/** Remove a provider by its source id. */
export function unregisterCompletionProvider(id: CompletionSource): void {
  providers.delete(id);
}

/** The registered providers, highest priority first. */
export function getCompletionProviders(): CompletionProvider[] {
  return [...providers.values()].sort(
    (a, b) => b.suggestionPriority - a.suggestionPriority,
  );
}

/** Test seam: clear the registry. */
export function resetCompletionProvidersForTests(): void {
  providers.clear();
}

function selectorMatches(
  provider: CompletionProvider,
  languageId: string,
): boolean {
  return (
    provider.selector.includes('*') ||
    provider.selector.includes(languageId)
  );
}

/**
 * Fan out one request to every matching provider and merge
 * the results: providers run in priority order; an
 * `excludeLowerPriority` provider that returned items stops
 * the fan-out below it; items are deduped by
 * (label, insertText) keeping the higher-priority one; every
 * item's detail is badged with its source label; the final
 * list is in provider-priority order, each provider's items
 * in the provider's own order. Never throws — a failing
 * provider contributes nothing.
 */
export function mergeCompletions(
  request: CompletionRequest,
  all: CompletionProvider[] = getCompletionProviders(),
): CompletionItem[] {
  const ordered = [...all]
    .filter((p) => selectorMatches(p, request.languageId))
    .sort((a, b) => b.suggestionPriority - a.suggestionPriority);
  const seen = new Set<string>();
  const out: CompletionItem[] = [];
  for (const provider of ordered) {
    let items: CompletionItem[] = [];
    try {
      items = provider.getSuggestions(request) ?? [];
    } catch {
      items = [];
    }
    for (const item of items) {
      const key = `${item.label}\n${item.insertText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sourceLabel = COMPLETION_SOURCE_LABELS[item.source];
      out.push({
        ...item,
        detail: item.detail
          ? `${sourceLabel} · ${item.detail}`
          : sourceLabel,
        sortText: item.sortText ?? item.label,
      });
    }
    if (provider.excludeLowerPriority && items.length > 0) break;
  }
  // The list is already in the right order: the fan-out ran
  // in provider-priority order and each provider owns its
  // items' order (the LSP service's sortText order is never
  // re-sorted — the contract's rule). Monaco filters and
  // ranks the widget from each item's sortText.
  return out;
}

/**
 * The word provider (Atom's autocomplete-word, priority 0):
 * subsequence matches over the current file's words — the
 * bottom of the list, never above a real symbol. Words come
 * from the current file's text only (the pattern provider
 * already covers the other open files); identifiers of 2+
 * characters, deduped, ranked by the fuzzy score, capped at
 * 10. Selector ['*'] — words exist in every language.
 */
export function createWordCompletionProvider(): CompletionProvider {
  return {
    id: 'word',
    suggestionPriority: 0,
    selector: ['*'],
    getSuggestions: (request) => {
      if (request.word.length < 2) return [];
      const seen = new Set<string>();
      const words: Array<{ word: string; score: number }> = [];
      for (const match of request.modelText.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        const candidate = match[0];
        if (candidate === request.word || candidate.length < 2) continue;
        if (seen.has(candidate)) continue;
        const score = fuzzyScore(request.word, candidate);
        if (score <= 0) continue;
        seen.add(candidate);
        words.push({ word: candidate, score });
      }
      words.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
      return words.slice(0, 10).map(({ word }) => ({
        label: word,
        kind: 18, // Monaco CompletionItemKind.Text
        insertText: word,
        range: request.wordRange,
        source: 'word' as const,
      }));
    },
  };
}

/** The languages the editor's providers serve (the
 *  TypeScript/JavaScript family Lucid's editor opens). */
export const EDITOR_LANGUAGE_IDS = [
  'typescript',
  'tsx',
  'javascript',
  'javascriptreact',
];
