/**
 * Monaco providers for the Files editor, fed by the TypeScript
 * language service. The adapter between
 * the LSP client (src/lib/tsLanguageService.ts) and Monaco's
 * provider APIs — completion, hover, signature help.
 *
 * The LSP is the fact-checker, not the brain: every item here
 * is a real symbol the service resolved, with a real kind, a
 * real signature, and real docs — it cannot invent an API.
 * That is the point: the tree-sitter structure provider
 * offered names only (kind Variable, no docs, no
 * auto-imports); this provider replaces it for TS/JS, and the
 * structure stays as the fallback when the engine is dead
 * (Kite's failure mode — a dead engine returns no completions,
 * never an error — so the fallback offers structure names
 * instead of failing).
 *
 * Contract, from the design research (the LSP completion shape
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
 *   - after the LSP items, pattern suggestions (Tabnine, patterns only) are appended for the line
 *     prefix typed so far: repeated lines and identifier
 *     chains from the user's own open files, Snippet kind,
 *     sortText `zz-pattern-…` (they sort last), deduped
 *     against the LSP labels. The text is verbatim from the
 *     user's files — a pattern cannot invent a name — and a
 *     verified LSP symbol always wins over a repeated idiom.
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
  MONACO_COMPLETION_ITEM_KIND,
  LspCompletionItemKind,
  type LspCompletionItem,
  type LspHover,
  type LspSignatureHelp,
} from './tsLspContract';
import {
  mergeCompletions,
  registerCompletionProvider,
  createWordCompletionProvider,
  EDITOR_LANGUAGE_IDS,
  type CompletionItem,
  type CompletionProvider,
  type CompletionRequest,
} from './completionProviders';
import {
  createSnippetCompletionProvider,
  type Snippet,
} from './snippets';
import { extractCalleeName, buildSignatureDocumentation } from './signatureAssist';

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
  /** Repeated shapes from the user's own open files (Tabnine patterns): the full pattern texts whose
   *  start matches the line prefix the user has typed, or an
   *  empty list. Optional: the provider works without it, and
   *  the patterns are suggestions only — they sort after the
   *  LSP items and are deduped against them, so a verified
   *  symbol always wins over a repeated idiom. */
  getPatternCompletions?: (linePrefix: string) => string[];
  /** User snippets (snippets):
   *  read at request time from the settings store's
   *  customSnippets, merged over the built-in library by the
   *  snippet provider. Optional: without it the provider
   *  offers the built-ins only. */
  getUserSnippets?: () => Snippet[];
  /**
   * Kite's settings toggles:
   * each is a live callback (read at request time, like
   * getUserSnippets, so flipping the switch in Settings
   * takes effect without re-registering the providers).
   * Absent = on. Completions off returns an empty list;
   * hover / signature help off return null.
   */
  isCompletionsEnabled?: () => boolean;
  isHoverEnabled?: () => boolean;
  isSignatureHelpEnabled?: () => boolean;
  /** LSP hover at a Monaco position, or null. */
  getHover: (lineNumber: number, column: number) => LspHover | null;
  /**
   * Hover action links (the hover Docs link). When present, the provider appends a `Docs`
   * link (and a `Def` link when the engine knows a definition)
   * to the hover, as markdown links in the `lucid-docs://` /
   * `lucid-def://` schemes — the editor's link opener handles
   * them (CodeEditor registers it). The word comes from the
   * model at the hover position; returning null/undefined
   * skips the link. Optional: without it the hover is
   * LSP-only, as before.
   */
  hoverLinks?: (
    word: string,
    position: { lineNumber: number; column: number },
  ) => { docs?: string; def?: string } | null;
  /**
   * Common invocations (signature assist): the lines in the user's own open files that call
   * the given callee — the "How others used this" block, drawn
   * from Lucid's pattern index, never from Kite's cloud data.
   * Optional: without it the signature shows the Docs link only.
   */
  getCommonInvocations?: (callee: string) => string[];
  /** LSP signature help at a Monaco position, or null. */
  getSignatureHelp: (
    lineNumber: number,
    column: number,
    triggerCharacter?: string,
  ) => LspSignatureHelp | null;
}

type MonacoLike = {
  languages?: {
    CompletionItemKind?: { Variable: number; Function: number; Class: number; Snippet?: number };
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
  /** The line's text (Monaco's getLineContent) — optional:
   *  the test stubs have no model lines, and the provider
   *  falls back to the word at the cursor without it. */
  getLineContent?: (lineNumber: number) => string;
  /** The file's text (Monaco's getValue) — optional: the
   *  word provider reads the current file's words from it;
   *  without it the word provider sees an empty file. */
  getValue?: () => string;
};

const registrations = new WeakMap<object, Map<string, () => void>>();

/** The LSP trigger characters (the clone's completionProvider). */
const COMPLETION_TRIGGERS = new Set(['.', '"', "'", '/', '@', '<']);

/** A Monaco suggestion is a merged completion item (the
 *  registry's shape is Monaco's shape, plus `source` and the
 *  opaque `__lspItem` for the lazy resolve). */
type MonacoSuggestion = CompletionItem;

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
  // Pattern suggestions are snippet-shaped (a whole line or
  // chain to insert) — Snippet kind, same preference rule.
  const snippetKind =
    kinds?.Snippet ?? MONACO_COMPLETION_ITEM_KIND.Snippet;

  const wordRange = (
    position: { lineNumber: number; column: number },
    wordInfo: WordInfo,
  ) => ({
    startLineNumber: position.lineNumber,
    startColumn: wordInfo?.startColumn ?? position.column,
    endLineNumber: position.lineNumber,
    endColumn: wordInfo?.endColumn ?? position.column,
  });

  // The merged completion list:
  // one fan-out over the registered providers, in priority
  // order — lsp (5), snippet (3), pattern (2), structure
  // (1), word (0) — deduped and source-badged by the merge
  // (src/lib/completionProviders.ts). The providers below are
  // (re)registered on every editor registration (upsert by
  // source id), so the registry always reflects the current
  // engine state; the word provider is global and registered
  // once. The structure provider is the fallback when the
  // engine is dead (Kite's failure mode): it only offers
  // when the lsp provider saw a null list on this very
  // request (the shared engineAlive flag, set by the lsp
  // provider first — priority order guarantees it runs
  // first), so a live engine never gets structure noise.
  const engineAlive = { current: true };
  const lspProvider: CompletionProvider = {
    id: 'lsp',
    suggestionPriority: 5,
    selector: EDITOR_LANGUAGE_IDS,
    getSuggestions: (request: CompletionRequest) => {
      const lspItems = opts.getCompletions(
        request.lineNumber,
        request.column,
      );
      engineAlive.current = lspItems !== null;
      if (lspItems === null) return [];
      const out: CompletionItem[] = [];
      for (const item of lspItems) {
        // The service returns everything in scope; the
        // provider filters by the typed prefix (the
        // structure provider's rule). After a trigger
        // character there is no prefix to filter by.
        if (request.word.length >= 2 && !item.label.startsWith(request.word)) {
          continue;
        }
        out.push({
          label: item.label,
          // The LSP kind and Monaco's kind are different
          // enums — translate, never pass through.
          kind: lspKindToMonacoKind(item.kind),
          detail: item.detail,
          sortText: item.sortText,
          insertText: item.label,
          range: request.wordRange,
          source: 'lsp',
          __lspItem: item,
        });
      }
      return out;
    },
  };
  const structureProvider: CompletionProvider = {
    id: 'structure',
    suggestionPriority: 1,
    selector: EDITOR_LANGUAGE_IDS,
    getSuggestions: (request: CompletionRequest) => {
      // Live engine — the LSP items are the answer; the
      // structure names stay as the dead-engine fallback.
      if (engineAlive.current) return [];
      const seen = new Set<string>();
      const out: CompletionItem[] = [];
      for (const identifier of request.identifiers) {
        if (
          identifier.length > request.word.length &&
          identifier.startsWith(request.word) &&
          !seen.has(identifier)
        ) {
          seen.add(identifier);
          out.push({
            label: identifier,
            kind: variableKind,
            insertText: identifier,
            range: request.wordRange,
            source: 'structure',
          });
        }
      }
      return out;
    },
  };
  const patternProvider: CompletionProvider = {
    id: 'pattern',
    suggestionPriority: 2,
    selector: EDITOR_LANGUAGE_IDS,
    getSuggestions: (request: CompletionRequest) => {
      if (!opts.getPatternCompletions) return [];
      const prefix = request.linePrefix;
      if (prefix.length < 2) return [];
      const seen = new Set<string>();
      const out: CompletionItem[] = [];
      for (const [i, text] of opts
        .getPatternCompletions(prefix)
        .entries()) {
        if (text.length <= prefix.length || seen.has(text)) continue;
        seen.add(text);
        out.push({
          label: text.length > 100 ? `${text.slice(0, 97)}…` : text,
          kind: snippetKind,
          sortText: `zz-pattern-${i}`,
          insertText: text,
          range: request.prefixRange,
          source: 'pattern',
        });
      }
      return out;
    },
  };
  registerCompletionProvider(lspProvider);
  registerCompletionProvider(structureProvider);
  registerCompletionProvider(patternProvider);
  registerCompletionProvider(
    createSnippetCompletionProvider(
      () => opts.getUserSnippets?.() ?? [],
      snippetKind,
    ),
  );
  registerCompletionProvider(createWordCompletionProvider());

  const completionProvider = {
    triggerCharacters: [...COMPLETION_TRIGGERS],
    provideCompletionItems(
      model: ModelLike | null,
      position: { lineNumber: number; column: number } | null,
      context: { triggerCharacter?: string } | null,
    ) {
      try {
        if (!model || !position) return { suggestions: [] };
        // Kite's completions toggle: off means an
        // empty list — the suggest widget never opens.
        if (opts.isCompletionsEnabled && !opts.isCompletionsEnabled()) {
          return { suggestions: [] };
        }
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
        // Tabnine patterns: the repeated shapes
        // from the user's own open files, offered for the
        // line prefix typed so far. The prefix is the line
        // from its first non-whitespace character to the
        // cursor, and the pattern range replaces exactly that
        // prefix, so accepting a pattern swaps what was typed
        // for the whole shape. Without getLineContent (the
        // test stubs) the word is the prefix and the range is
        // the word range.
        const hasLine = typeof model.getLineContent === 'function';
        const upToCursor = hasLine
          ? (model.getLineContent!(position.lineNumber) ?? '').slice(
              0,
              position.column - 1,
            )
          : word;
        const firstNonWs = upToCursor.search(/\S/);
        const linePrefix = firstNonWs === -1 ? '' : upToCursor.slice(firstNonWs);
        const prefixRange = {
          startLineNumber: position.lineNumber,
          startColumn: hasLine
            ? firstNonWs + 1
            : (wordInfo?.startColumn ?? position.column),
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        const request: CompletionRequest = {
          word,
          linePrefix,
          lineNumber: position.lineNumber,
          column: position.column,
          languageId,
          modelText:
            typeof model.getValue === 'function' ? model.getValue() : '',
          identifiers: opts.getStructureIdentifiers(
            position.lineNumber,
            position.column,
          ),
          wordRange: range,
          prefixRange,
        };
        return { suggestions: mergeCompletions(request) };
      } catch {
        // Kite's failure mode — a dead engine returns no
        // completions, never an error in the user's face.
        return { suggestions: [] };
      }
    },
    resolveCompletionItem(item: MonacoSuggestion) {
      try {
        const lspItem = item.__lspItem as LspCompletionItem | undefined;
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
        // Kite's hover toggle: off means no hover.
        if (opts.isHoverEnabled && !opts.isHoverEnabled()) return null;
        const hover = opts.getHover(position.lineNumber, position.column);
        if (!hover) return null;
        // The hover Docs link: append `Docs`
        // (and `Def` when the engine knows a definition) to
        // the hover markdown. The word comes from the model;
        // without a word there is nothing to link.
        let contents = hover.contents;
        const model = _model as ModelLike | null;
        const word = model?.getWordAtPosition?.(position)?.word;
        if (word && opts.hoverLinks) {
          const links = opts.hoverLinks(word, position);
          const actions: string[] = [];
          if (links?.docs) actions.push(`[Docs](${links.docs})`);
          if (links?.def) actions.push(`[Def](${links.def})`);
          if (actions.length > 0) {
            contents = `${contents}\n\n${actions.join(' · ')}`;
          }
        }
        return {
          contents: [{ value: contents }],
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
      model: unknown,
      position: { lineNumber: number; column: number } | null,
      context: { triggerCharacter?: string } | null,
    ) {
      try {
        if (!position) return null;
        // Kite's signature-help toggle: off means
        // no signature popup.
        if (opts.isSignatureHelpEnabled && !opts.isSignatureHelpEnabled()) return null;
        const help = opts.getSignatureHelp(
          position.lineNumber,
          position.column,
          context?.triggerCharacter,
        );
        if (!help || help.signatures.length === 0) return null;
        // Kite signature assist: the active
        // signature gains a Docs link and a "How others used
        // this" block — the callee comes from the line text
        // at the cursor, the Docs link from the hover wiring,
        // the invocations from the user's own open files. A
        // model without getLineContent (or no callee, no
        // link, no invocations) leaves the signature exactly
        // as the LSP gave it.
        const lineText = (() => {
          try {
            const m = model as { getLineContent?: (n: number) => string } | null;
            return typeof m?.getLineContent === 'function'
              ? m.getLineContent(position.lineNumber)
              : null;
          } catch {
            return null;
          }
        })();
        const callee = lineText ? extractCalleeName(lineText, position.column) : null;
        const docsUrl =
          callee && opts.hoverLinks ? opts.hoverLinks(callee.word, position)?.docs : undefined;
        const invocations =
          callee && opts.getCommonInvocations
            ? opts.getCommonInvocations(callee.chain)
            : [];
        return {
          value: {
            signatures: help.signatures.map((sig, index) => {
              const base = {
                label: sig.label,
                documentation: sig.documentation,
                parameters: sig.parameters.map((param) => ({
                  label: param.label,
                  documentation: param.documentation,
                })),
              };
              if (index !== help.activeSignature) return base;
              const documentation = buildSignatureDocumentation(
                sig.documentation,
                docsUrl,
                invocations,
              );
              return documentation === null ? base : { ...base, documentation };
            }),
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
