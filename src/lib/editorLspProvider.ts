/**
 * Monaco providers for the Files editor, fed by the TypeScript
 * language service (steal #3 — 2026-11-14). The adapter between
 * the LSP client (src/lib/tsLanguageService.ts) and Monaco's
 * provider APIs — completion, hover, signature help.
 *
 * The LSP is the fact-checker, not the brain: every item here
 * is a real symbol the service resolved, with a real kind, a
 * real signature, and real docs — it cannot invent an API.
 * That is the point: the tree-sitter structure provider
 * (steal #2) offered names only (kind Variable, no docs, no
 * auto-imports); this provider replaces it for TS/JS, and the
 * structure stays as the fallback when the engine is dead
 * (Kite's failure mode — a dead engine returns no completions,
 * never an error — so the fallback offers structure names
 * instead of failing).
 *
 * Contract, from the steal research (the LSP completion shape
 * in typescript-language-server's completion.ts, re-implemented
 * over Monaco's API):
 *   - provideCompletionItems returns items for the word at the
 *     cursor, or an empty list — never an error, never a throw.
 *     Items carry kind (the contract's ScriptElementKind map),
 *     detail (the signature), sortText (the service's own
 *     order, never re-sorted), and a resolveKey for the lazy
 *     resolve. When there is a word, items are filtered by
 *     prefix (the structure provider's rule); after a trigger
 *     character ('.', '"', "'", '/', '@', '<' — the clone's
 *     trigger set) the word is empty and the service's list is
 *     returned unfiltered (member completions after a dot).
 *   - resolveCompletionItem fills in the docs (JSDoc) and the
 *     auto-import edits (the import statement for the current
 *     file only — the clone's rule) from completionEntryDetails.
 *   - hover returns the quickinfo display as a fenced code
 *     block with the JSDoc below it (the lsp-server.ts hover()
 *     shape); signature help triggers on '(', ',', '<' and
 *     retriggers on ')' (the clone's capabilities block).
 *   - LSP positions are 0-based; Monaco is 1-based — the
 *     contract's converters are the only place those meet.
 *
 * At most one provider set per Monaco instance per language:
 * the editor remounts when the file changes (and React
 * StrictMode double-mounts in dev), and a stale provider would
 * offer for a dead editor. A new registration disposes the
 * previous one for the same monaco + language. Guarded: a
 * monaco without `languages` (the test stubs) registers
 * nothing and the returned dispose is a no-op, so the mount
 * never fails on it.
 */

import {
  lspRangeToMonaco,
  lspKindToMonacoKind,
  LspCompletionItemKind,
  type LspCompletionItem,
  type LspHover,
  type LspSignatureHelp,
} from './tsLspContract';

export interface EditorLspProviderOptions {
  /** LSP completions at a Monaco position, or null when the
   *  engine is unavailable (the provider falls back to
   *  structure identifiers). Read at request time. */
  getCompletions: (
    lineNumber: number,
    column: number,
  ) => LspCompletionItem[] | null;
  /** Resolve an item (docs + auto-import edits), or null
   *  when the entry is gone. */
  resolveCompletion: (item: LspCompletionItem) => LspCompletionItem | null;
  /** Tree-sitter identifiers in scope at a Monaco position —
   *  the fallback when the engine is unavailable. */
  getStructureIdentifiers: (lineNumber: number, column: number) => string[];
  /** LSP hover at a Monaco position, or null. */
  getHover: (lineNumber: number, column: number) => LspHover | null;
  /** LSP signature help at a Monaco position, or null. */
  getSignatureHelp: (
    lineNumber: number,
    column: number,
    triggerCharacter?: string,
  ) => LspSignatureHelp | null;
}

type MonacoLike = {
  languages?: {
    CompletionItemKind?: { Variable: number; Function: number; Class: number };
    registerCompletionItemProvider: (
      languageSelector: string,
      provider: Record<string, unknown>,
    ) => { dispose: () => void };
    registerHoverProvider?: (
      languageSelector: string,
      provider: Record<string, unknown>,
    ) => { dispose: () => void };
    registerSignatureHelpProvider?: (
      languageSelector: string,
      provider: Record<string, unknown>,
    ) => { dispose: () => void };
  };
};

type WordInfo = {
  word: string;
  startColumn: number;
  endColumn: number;
} | null;

type ModelLike = {
  getWordAtPosition: (position: {
    lineNumber: number;
    column: number;
  }) => WordInfo;
};

const registrations = new WeakMap<object, Map<string, () => void>>();

/** The LSP trigger characters (the clone's completionProvider). */
const COMPLETION_TRIGGERS = new Set(['.', '"', "'", '/', '@', '<']);

/** A Monaco suggestion carrying its LSP item for resolve. */
interface MonacoSuggestion {
  label: string;
  kind: number;
  detail?: string;
  documentation?: { value: string } | string;
  sortText?: string;
  insertText: string;
  range?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  additionalTextEdits?: Array<{
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    text: string;
  }>;
  __lspItem?: LspCompletionItem;
}

export function registerEditorLspProviders(
  monaco: MonacoLike,
  languageId: string,
  opts: EditorLspProviderOptions,
): () => void {
  const languages = monaco?.languages;
  if (!languages?.registerCompletionItemProvider) return () => {};
  const byLanguage = registrations.get(monaco) ?? new Map();
  registrations.set(monaco, byLanguage);
  const previous = byLanguage.get(languageId);
  if (previous) previous();

  const kinds = languages.CompletionItemKind;
  // The structure fallback offers names only — Variable kind.
  // Prefer the live monaco's enum; the contract's table is
  // the fallback (the test stubs have no languages).
  const variableKind =
    kinds?.Variable ?? lspKindToMonacoKind(LspCompletionItemKind.Variable);

  const wordRange = (
    position: { lineNumber: number; column: number },
    wordInfo: WordInfo,
  ) => ({
    startLineNumber: position.lineNumber,
    startColumn: wordInfo?.startColumn ?? position.column,
    endLineNumber: position.lineNumber,
    endColumn: wordInfo?.endColumn ?? position.column,
  });

  const completionProvider = {
    triggerCharacters: [...COMPLETION_TRIGGERS],
    provideCompletionItems(
      model: ModelLike | null,
      position: { lineNumber: number; column: number } | null,
      context: { triggerCharacter?: string } | null,
    ) {
      try {
        if (!model || !position) return { suggestions: [] };
        const wordInfo = model.getWordAtPosition(position);
        const word = wordInfo?.word ?? '';
        // A single character would offer everywhere — require a
        // stem of at least two, like the composer's ghost. The
        // exception is a trigger character ('.' for member
        // access, '"' for a path): there the word is empty and
        // the service's list is the answer.
        const triggered = !!context?.triggerCharacter && COMPLETION_TRIGGERS.has(context.triggerCharacter);
        if (word.length < 2 && !triggered) return { suggestions: [] };
        const range = wordRange(position, wordInfo);
        const lspItems = opts.getCompletions(position.lineNumber, position.column);
        if (lspItems === null) {
          // Engine dead — fall back to tree-sitter structure
          // names (the steal #2 provider's shape: Variable
          // kind, no docs, prefix-filtered).
          const seen = new Set<string>();
          const suggestions: MonacoSuggestion[] = [];
          for (const identifier of opts.getStructureIdentifiers(
            position.lineNumber,
            position.column,
          )) {
            if (
              identifier.length > word.length &&
              identifier.startsWith(word) &&
              !seen.has(identifier)
            ) {
              seen.add(identifier);
              suggestions.push({
                label: identifier,
                kind: variableKind,
                insertText: identifier,
                range,
              });
            }
          }
          return { suggestions };
        }
        const suggestions: MonacoSuggestion[] = [];
        for (const item of lspItems) {
          // The service returns everything in scope; the
          // provider filters by the typed prefix (the
          // structure provider's rule). After a trigger
          // character there is no prefix to filter by.
          if (word.length >= 2 && !item.label.startsWith(word)) continue;
          suggestions.push({
            label: item.label,
            // The LSP kind and Monaco's kind are different
            // enums — translate, never pass through.
            kind: lspKindToMonacoKind(item.kind),
            detail: item.detail,
            sortText: item.sortText,
            insertText: item.label,
            range,
            __lspItem: item,
          });
        }
        return { suggestions };
      } catch {
        // Kite's failure mode — a dead engine returns no
        // completions, never an error in the user's face.
        return { suggestions: [] };
      }
    },
    resolveCompletionItem(item: MonacoSuggestion) {
      try {
        const lspItem = item.__lspItem;
        if (!lspItem?.resolveKey) return item;
        const resolved = opts.resolveCompletion(lspItem);
        if (!resolved) return item;
        const out: MonacoSuggestion = { ...item };
        if (resolved.detail) out.detail = resolved.detail;
        if (resolved.documentation) {
          out.documentation = { value: resolved.documentation };
        }
        if (resolved.additionalTextEdits?.length) {
          out.additionalTextEdits = resolved.additionalTextEdits.map((edit) => ({
            range: lspRangeToMonaco(edit.range),
            text: edit.newText,
          }));
        }
        return out;
      } catch {
        return item;
      }
    },
  };

  const hoverProvider = {
    provideHover(
      _model: unknown,
      position: { lineNumber: number; column: number } | null,
    ) {
      try {
        if (!position) return null;
        const hover = opts.getHover(position.lineNumber, position.column);
        if (!hover) return null;
        return {
          contents: [{ value: hover.contents }],
          range: hover.range ? lspRangeToMonaco(hover.range) : undefined,
        };
      } catch {
        return null;
      }
    },
  };

  const signatureHelpProvider = {
    signatureHelpTriggerCharacters: ['(', ',', '<'],
    signatureHelpRetriggerCharacters: [')'],
    provideSignatureHelp(
      _model: unknown,
      position: { lineNumber: number; column: number } | null,
      context: { triggerCharacter?: string } | null,
    ) {
      try {
        if (!position) return null;
        const help = opts.getSignatureHelp(
          position.lineNumber,
          position.column,
          context?.triggerCharacter,
        );
        if (!help || help.signatures.length === 0) return null;
        return {
          value: {
            signatures: help.signatures.map((sig) => ({
              label: sig.label,
              documentation: sig.documentation,
              parameters: sig.parameters.map((param) => ({
                label: param.label,
                documentation: param.documentation,
              })),
            })),
            activeSignature: help.activeSignature,
            activeParameter: help.activeParameter,
          },
          dispose: () => {},
        };
      } catch {
        return null;
      }
    },
  };

  const disposables: Array<{ dispose: () => void }> = [];
  disposables.push(
    languages.registerCompletionItemProvider(languageId, completionProvider),
  );
  if (languages.registerHoverProvider) {
    disposables.push(languages.registerHoverProvider(languageId, hoverProvider));
  }
  if (languages.registerSignatureHelpProvider) {
    disposables.push(
      languages.registerSignatureHelpProvider(languageId, signatureHelpProvider),
    );
  }
  const dispose = () => {
    for (const disposable of disposables) {
      try {
        disposable?.dispose();
      } catch {
        // Already disposed (StrictMode double-mount in dev, or a
        // newer registration replaced this one) — not an error.
      }
    }
    if (byLanguage.get(languageId) === dispose) {
      byLanguage.delete(languageId);
    }
  };
  byLanguage.set(languageId, dispose);
  return dispose;
}
