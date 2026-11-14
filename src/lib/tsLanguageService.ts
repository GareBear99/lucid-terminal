/**
 * The TypeScript language service, behind the LSP contract
 * (steal #3 — 2026-11-14).
 *
 * The engine: the in-process TS 6 language service
 * (`ts.createLanguageService`), bundled via the `typescript-lsp`
 * npm alias (`typescript@6.0.3`, pinned — Lucid's own build
 * compiler stays on TS 5.3.3). The client speaks the LSP-shaped
 * contract (src/lib/tsLspContract.ts): `initialize`,
 * `textDocument/didOpen` / `didChange` / `didClose`,
 * `textDocument/completion`, `completionItem/resolve`,
 * `textDocument/hover`, `textDocument/signatureHelp`,
 * `textDocument/publishDiagnostics`, `textDocument/definition`,
 * `textDocument/typeDefinition`, `textDocument/references`,
 * `textDocument/documentSymbol`. Each is a function here; the
 * transport behind them is the in-process service today, and a
 * real LSP server tomorrow is a transport change, not a rewrite.
 *
 * Why in-process, not a spawned typescript-language-server:
 * that server requires Node ≥22.22.2 and Electron 28 embeds
 * Node 18.18.2 — the spawn is not viable in Lucid, and the Mac
 * has no guaranteed system Node. The language service gives
 * the same facts (it IS what tsserver wraps) with no process,
 * no stdio JSON-RPC, no Node floor. TS 7 ships its own native
 * LSP and no tsserver.js — the pin to 6.x keeps this service
 * valid, and the LSP-shaped client is what survives the swap.
 *
 * The host is in-memory only: open documents come from the
 * file store (the editor opens/changes/closes them here), the
 * default lib comes from the vendored bundle
 * (src/lib/tsLibBundle.ts, ES2020 full), and bare imports
 * ('react', 'zustand', …) resolve through a synthetic
 * `declare module '*'` ambient file — node_modules is not on
 * disk at runtime, so without it every third-party import
 * would read as TS2307 noise. The cost, stated honestly:
 * cross-file resolution works for OPEN files only (a relative
 * import of a file that is not open does not resolve), and
 * auto-imports work for open files' exports, not for
 * node_modules packages (the wildcard module has no named
 * exports to offer). Guest: documents in memory, dropped on
 * close, nothing persisted — the LSP server holds documents
 * in memory, per the guest rule.
 *
 * Loading: lazy — the 8.8 MB compiler + the 2.8 MB lib bundle
 * are dynamic-imported on first use (first TS/JS file open),
 * never on the startup path. The service is synchronous once
 * loaded (the TS language service API is sync), so the editor
 * provider never awaits it and never blocks typing.
 *
 * Failure mode (Kite's contract): a dead engine returns no
 * facts, never an error. Every public function degrades to
 * null / [] / false when the engine is unavailable or a call
 * throws, and `ensureTsLsp` retries a failed init on the next
 * call (the init promise is cleared on failure, like
 * ensureTreeSitter).
 */

import {
  lspToOffset,
  offsetToLsp,
  quickInfoToHoverMarkdown,
  scriptElementKindToCompletionKind,
  toLspDiagnostic,
  type LspCompletionItem,
  type LspCompletionList,
  type LspDiagnostic,
  type LspDocumentSymbol,
  type LspHover,
  type LspLocation,
  type LspPosition,
  type LspSignatureHelp,
} from './tsLspContract';

/** The pinned TypeScript version this service runs. */
export const TS_LSP_PINNED_VERSION = '6.0.3';

/** The synthetic ambient file that silences bare-import
 *  resolution (node_modules is not on disk at runtime). */
const AMBIENT_FILE = 'ambient.d.ts';
const AMBIENT_TEXT = "declare module '*';\n";

/** The lib file the program loads (the vendored bundle). */
const LIB_FILE = 'lib.es2020.full.d.ts';

/** Compiler options for the service — the program is
 *  diagnostics-only (noEmit), lenient (strict off, checkJs
 *  off), and skips lib checking (the bundled lib is trusted). */
const COMPILER_OPTIONS = {
  target: 7, // ScriptTarget.ES2020 — keep as a number so this
  // module never imports the compiler's enums statically.
  module: 99, // ModuleKind.ESNext
  moduleResolution: 100, // ModuleResolutionKind.Bundler
  jsx: 4, // JsxEmit.ReactJSX
  strict: false,
  allowJs: true,
  checkJs: false,
  noEmit: true,
  lib: [LIB_FILE],
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
} as const;

interface OpenDocument {
  content: string;
  version: number;
}

interface ResolveEntry {
  file: string;
  position: number;
  name: string;
  source?: string;
}

// The `ts` namespace, loaded lazily (dynamic import). Typed as
// `any` at the boundary — the compiler API is the tsserver
// surface, and the contract translators take structural types,
// so no `ts.*` type ever leaks out of this module.
let tsModule: any | null = null;
let languageService: any | null = null;
let libBundle: string | null = null;
let initPromise: Promise<boolean> | null = null;
let engineReady = false;

const documents = new Map<string, OpenDocument>();
const resolveCache = new Map<string, ResolveEntry>();
let resolveCounter = 0;

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Initialise the engine once (lazy — first TS/JS file open or
 * first completion request). Returns true when the compiler +
 * lib bundle loaded and the service was created. Safe to call
 * repeatedly; a failed init is retried on the next call.
 */
export async function ensureTsLsp(): Promise<boolean> {
  if (engineReady) return true;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const mod = await import('typescript-lsp');
        const ts = (mod as any).default ?? mod;
        if (typeof ts?.createLanguageService !== 'function') return false;
        const bundle = await import('./tsLibBundle');
        const bytes = decodeBase64(bundle.TS_LIB_BUNDLE_BASE64);
        libBundle = new TextDecoder().decode(bytes);
        tsModule = ts;
        languageService = ts.createLanguageService(createHost(ts));
        engineReady = true;
        return true;
      } catch {
        initPromise = null;
        tsModule = null;
        languageService = null;
        libBundle = null;
        return false;
      }
    })();
  }
  return initPromise;
}

/** True once the engine has initialised successfully. */
export function isTsLspReady(): boolean {
  return engineReady;
}

/** The pinned compiler version, or null before init. */
export function getTsVersion(): string | null {
  return engineReady && tsModule ? String(tsModule.version ?? '') : null;
}

function createHost(ts: any): any {
  return {
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptFileNames: () => [...documents.keys(), AMBIENT_FILE],
    getScriptVersion: (fileName: string) => {
      const doc = documents.get(fileName);
      return doc ? String(doc.version) : '1';
    },
    getScriptSnapshot: (fileName: string) => {
      const base = fileName.split('/').pop() ?? fileName;
      if (base === LIB_FILE) {
        return libBundle !== null
          ? ts.ScriptSnapshot.fromString(libBundle)
          : undefined;
      }
      if (base === AMBIENT_FILE || fileName === AMBIENT_FILE) {
        return ts.ScriptSnapshot.fromString(AMBIENT_TEXT);
      }
      const doc = documents.get(fileName);
      return doc ? ts.ScriptSnapshot.fromString(doc.content) : undefined;
    },
    getCurrentDirectory: () => '/',
    // NOT '' — TS's auto-import module-specifier computation
    // calls getNormalizedAbsolutePath(baseUrl, currentDirectory)
    // with baseUrl undefined (no baseUrl in the options); with
    // an empty current directory that lands in
    // normalizeSlashes(undefined) and getCompletionsAtPosition
    // throws for any file that has an auto-import candidate.
    // '/' is the real root of every document path (absolute
    // paths on the Mac and in tests), so relative resolution
    // from it is correct.
    getDefaultLibFileName: () => LIB_FILE,
    fileExists: (fileName: string) => {
      const base = fileName.split('/').pop() ?? fileName;
      return (
        documents.has(fileName) ||
        base === LIB_FILE ||
        base === AMBIENT_FILE ||
        base.startsWith('lib.')
      );
    },
    readFile: (fileName: string) => {
      const base = fileName.split('/').pop() ?? fileName;
      if (base === LIB_FILE) return libBundle ?? undefined;
      if (base === AMBIENT_FILE) return AMBIENT_TEXT;
      return documents.get(fileName)?.content;
    },
    readDirectory: () => [],
    getDirectories: () => [],
    directoryExists: () => true,
    getNewLine: () => '\n',
    useCaseSensitiveFileNames: () => true,
  };
}

/** The document's text, or null when it is not open. */
function getText(path: string): string | null {
  return documents.get(path)?.content ?? null;
}

/** The service, or null when the engine is not ready. */
function service(): any | null {
  return engineReady ? languageService : null;
}

/** `textDocument/didOpen` — register a document's content. */
export function openDocument(path: string, content: string): void {
  const existing = documents.get(path);
  documents.set(path, {
    content,
    version: (existing?.version ?? 0) + 1,
  });
}

/** `textDocument/didChange` — replace a document's content. */
export function changeDocument(path: string, content: string): void {
  const existing = documents.get(path);
  if (!existing || existing.content === content) return;
  documents.set(path, { content, version: existing.version + 1 });
  // Completion resolve entries go stale when the file changes
  // (the clone's CompletionDataCache is per-request; ours is
  // cleared on any change — cheap and always correct).
  resolveCache.clear();
}

/** `textDocument/didClose` — drop a document (guest: nothing persists). */
export function closeDocument(path: string): void {
  documents.delete(path);
  resolveCache.clear();
}

/** Drop every open document except the given paths. */
export function dropDocumentsExcept(openPaths: Iterable<string>): void {
  const keep = new Set(openPaths);
  for (const path of [...documents.keys()]) {
    if (!keep.has(path)) documents.delete(path);
  }
  resolveCache.clear();
}

/** `textDocument/completion` — the LSP completion list at a
 *  position, or null when the engine is unavailable. Entries
 *  carry the service's own sort order (never re-sorted) and a
 *  resolveKey for completionItem/resolve. Auto-import
 *  candidates (includeCompletionsForModuleExports) carry their
 *  module in `source`. */
export function getCompletions(
  path: string,
  position: LspPosition,
): LspCompletionList | null {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return null;
  try {
    const offset = lspToOffset(text, position);
    const completions = ls.getCompletionsAtPosition(path, offset, {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    });
    if (!completions?.entries) return { isIncomplete: false, items: [] };
    const items: LspCompletionItem[] = [];
    for (const entry of completions.entries) {
      const resolveKey = `lsp:${++resolveCounter}`;
      resolveCache.set(resolveKey, {
        file: path,
        position: offset,
        name: entry.name,
        source: entry.source,
      });
      items.push({
        label: entry.name,
        kind: scriptElementKindToCompletionKind(entry.kind),
        detail: entry.labelDetails?.description,
        sortText: entry.sortText,
        source: entry.source,
        resolveKey,
      });
    }
    return { isIncomplete: !!completions.isIncomplete, items };
  } catch {
    return null;
  }
}

/**
 * `completionItem/resolve` — fill in the docs, the detail, and
 * the auto-import edits for an item from getCompletions. The
 * detail is the full signature display; the documentation is
 * the JSDoc; the additionalTextEdits are the import statement
 * for the current file only (the clone's rule — edits to other
 * files are returned as a command, never applied silently).
 * Returns the item unchanged when the entry is gone (stale
 * resolveKey) or the engine is unavailable.
 */
export function resolveCompletion(
  path: string,
  item: LspCompletionItem,
): LspCompletionItem | null {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null || !item.resolveKey) return null;
  const entry = resolveCache.get(item.resolveKey);
  if (!entry || entry.file !== path) return null;
  try {
    const details = ls.getCompletionEntryDetails(
      path,
      entry.position,
      entry.name,
      { newLineCharacter: '\n', convertTabsToSpaces: true, tabSize: 2, indentSize: 2 },
      entry.source,
      undefined,
    );
    if (!details) return item;
    const resolved: LspCompletionItem = { ...item };
    if (details.displayParts?.length) {
      const display = details.displayParts.map((p: any) => p.text).join('');
      if (display) resolved.detail = display;
    }
    if (details.documentation?.length) {
      resolved.documentation = details.documentation
        .map((p: any) => p.text)
        .join('');
    }
    // Auto-import: codeActions carry the import edit for the
    // current file (changes[].textChanges[] with TS spans).
    const edits: LspCompletionItem['additionalTextEdits'] = [];
    for (const action of details.codeActions ?? []) {
      for (const change of action.changes ?? []) {
        if (change.fileName !== path) continue;
        for (const textChange of change.textChanges ?? []) {
          const span = textChange.span;
          edits.push({
            range: {
              start: offsetToLsp(text, span.start),
              end: offsetToLsp(text, span.start + span.length),
            },
            newText: textChange.newText,
          });
        }
      }
    }
    if (edits.length > 0) resolved.additionalTextEdits = edits;
    return resolved;
  } catch {
    return item;
  }
}

/** `textDocument/hover` — quickinfo as markdown (a fenced code
 *  block with the display, then the JSDoc), or null. */
export function getHover(
  path: string,
  position: LspPosition,
): LspHover | null {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return null;
  try {
    const offset = lspToOffset(text, position);
    const info = ls.getQuickInfoAtPosition(path, offset);
    if (!info?.displayParts?.length) return null;
    const contents = quickInfoToHoverMarkdown(
      info.displayParts,
      info.documentation,
    );
    if (!contents) return null;
    const range = info.textSpan
      ? {
          start: offsetToLsp(text, info.textSpan.start),
          end: offsetToLsp(text, info.textSpan.start + info.textSpan.length),
        }
      : undefined;
    return { contents, range };
  } catch {
    return null;
  }
}

/** `textDocument/signatureHelp` — the active signature and
 *  parameter at a call site, or null. */
export function getSignatureHelp(
  path: string,
  position: LspPosition,
): LspSignatureHelp | null {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return null;
  try {
    const offset = lspToOffset(text, position);
    const help = ls.getSignatureHelpItems(path, offset, {
      triggerReason: { kind: 'invoked' },
    });
    if (!help?.items?.length) return null;
    return {
      signatures: help.items.map((item: any) => ({
        // The label is the full call text: prefix + parameters
        // joined by the separator + suffix. (An earlier draft
        // joined prefix + separator + suffix and dropped the
        // parameters — 'greet(, )' — the parameters are the
        // label's middle, not an afterthought.)
        label:
          (item.prefixDisplayParts ?? [])
            .map((p: any) => p.text)
            .join('') +
          (item.parameters ?? [])
            .map((param: any) =>
              (param.displayParts ?? []).map((p: any) => p.text).join(''),
            )
            .join(
              (item.separatorDisplayParts ?? [])
                .map((p: any) => p.text)
                .join(''),
            ) +
          (item.suffixDisplayParts ?? []).map((p: any) => p.text).join(''),
        documentation: item.documentation
          ?.map((p: any) => p.text)
          .join(''),
        parameters: (item.parameters ?? []).map((param: any) => ({
          label: param.name,
          documentation: param.documentation
            ?.map((p: any) => p.text)
            .join(''),
        })),
      })),
      activeSignature: help.selectedItemIndex ?? 0,
      activeParameter: help.argumentIndex ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * `textDocument/publishDiagnostics` (pull form — the clone's
 * diagnosticsManager.getDiagnosticsForFile): syntactic +
 * semantic + suggestion diagnostics for a file, merged and
 * deduped, sorted by position. A file with no diagnostics
 * returns [] (clean), never null — clean is a fact, not an
 * absence.
 */
export function getDiagnostics(path: string): LspDiagnostic[] {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return [];
  try {
    const seen = new Set<string>();
    const out: LspDiagnostic[] = [];
    const push = (diagnostics: any[]) => {
      for (const diagnostic of diagnostics ?? []) {
        const translated = toLspDiagnostic(diagnostic, text);
        const key = `${translated.code}:${translated.range.start.line}:${translated.range.start.character}:${translated.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(translated);
      }
    };
    push(ls.getSyntacticDiagnostics(path));
    push(ls.getSemanticDiagnostics(path));
    push(ls.getSuggestionDiagnostics(path));
    out.sort(
      (a, b) =>
        a.range.start.line - b.range.start.line ||
        a.range.start.character - b.range.start.character,
    );
    return out;
  } catch {
    return [];
  }
}

/**
 * Check an edit before it lands: swap in the new content,
 * read the diagnostics, restore the original. Returns whether
 * the edit keeps diagnostics clean — the fact the Aider
 * verify loop (steal #5) and the agent loop (steal #4) will
 * ask after every edit. The swap bumps the version twice; the
 * service re-parses lazily, so the check costs one program
 * update, not a rebuild.
 */
export function checkEdit(
  path: string,
  newContent: string,
): { clean: boolean; diagnostics: LspDiagnostic[] } {
  const ls = service();
  const original = getText(path);
  if (!ls || original === null) return { clean: true, diagnostics: [] };
  try {
    changeDocument(path, newContent);
    const diagnostics = getDiagnostics(path);
    changeDocument(path, original);
    return { clean: diagnostics.length === 0, diagnostics };
  } catch {
    // Restore on any failure — the document must never be left
    // holding the unchecked content.
    try {
      changeDocument(path, original);
    } catch {
      // Already restored or gone — the next open re-syncs it.
    }
    return { clean: true, diagnostics: [] };
  }
}

function toLocations(entries: any[] | undefined, text: string): LspLocation[] {
  if (!entries) return [];
  const out: LspLocation[] = [];
  for (const entry of entries) {
    const span = entry.textSpan;
    if (!span) continue;
    out.push({
      uri: entry.fileName,
      range: {
        start: offsetToLsp(text, span.start),
        end: offsetToLsp(text, span.start + span.length),
      },
    });
  }
  return out;
}

/** `textDocument/definition` — where a symbol is defined. */
export function getDefinition(
  path: string,
  position: LspPosition,
): LspLocation[] {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return [];
  try {
    return toLocations(
      ls.getDefinitionAtPosition(path, lspToOffset(text, position)),
      text,
    );
  } catch {
    return [];
  }
}

/** `textDocument/typeDefinition` — where a symbol's type is defined. */
export function getTypeDefinition(
  path: string,
  position: LspPosition,
): LspLocation[] {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return [];
  try {
    return toLocations(
      ls.getTypeDefinitionAtPosition(path, lspToOffset(text, position)),
      text,
    );
  } catch {
    return [];
  }
}

/** `textDocument/references` — every use of a symbol. */
export function getReferences(
  path: string,
  position: LspPosition,
): LspLocation[] {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return [];
  try {
    return toLocations(
      ls.getReferencesAtPosition(path, lspToOffset(text, position)),
      text,
    );
  } catch {
    return [];
  }
}

function toDocumentSymbol(node: any, text: string): LspDocumentSymbol | null {
  if (!node?.spans?.length) return null;
  const span = node.spans[0];
  const nameSpan = node.nameSpan ?? span;
  const children: LspDocumentSymbol[] = [];
  for (const child of node.childItems ?? []) {
    const translated = toDocumentSymbol(child, text);
    if (translated) children.push(translated);
  }
  return {
    name: node.text ?? '',
    kind: scriptElementKindToCompletionKind(node.kind ?? ''),
    range: {
      start: offsetToLsp(text, span.start),
      end: offsetToLsp(text, span.start + span.length),
    },
    selectionRange: {
      start: offsetToLsp(text, nameSpan.start),
      end: offsetToLsp(text, nameSpan.start + nameSpan.length),
    },
    children: children.length > 0 ? children : undefined,
  };
}

/** `textDocument/documentSymbol` — the file outline (the
 *  navtree), or [] when there is nothing to outline. */
export function getDocumentSymbols(path: string): LspDocumentSymbol[] {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null) return [];
  try {
    const tree = ls.getNavigationTree(path);
    if (!tree) return [];
    const out: LspDocumentSymbol[] = [];
    for (const child of tree.childItems ?? []) {
      const translated = toDocumentSymbol(child, text);
      if (translated) out.push(translated);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Verify one identifier: is it a real, resolvable symbol in
 * this file? The check is the language service's own
 * completions at the end of the file (top-level scope): an
 * identifier that appears there with a non-keyword kind is
 * defined or imported in the file — a made-up name is not.
 * Returns the kind + the service's own detail (the type text)
 * when it resolves, null when it does not. Top-level scope
 * only: the composer's structure identifiers are top-level
 * definitions + imports, and a function-local name is not
 * what the composer completes.
 */
export function verifyIdentifier(
  path: string,
  name: string,
): { kind: string; detail?: string } | null {
  const ls = service();
  const text = getText(path);
  if (!ls || text === null || !name) return null;
  try {
    const end: LspPosition = offsetToLsp(text, text.length);
    const completions = ls.getCompletionsAtPosition(
      path,
      lspToOffset(text, end),
      { includeCompletionsForModuleExports: true },
    );
    for (const entry of completions?.entries ?? []) {
      if (entry.name !== name) continue;
      if (entry.kind === 'keyword' || entry.kind === 'primitive type') {
        return null;
      }
      return {
        kind: entry.kind,
        detail: entry.labelDetails?.description,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify a list of candidate identifiers (the composer's
 * tree-sitter structure source): keep the ones the language
 * service can resolve, drop the ones it cannot. When the
 * engine is not ready, the candidates pass through unchanged
 * — the ghost degrades to tree-sitter structure, it never
 * goes silent because the fact-checker is not up yet.
 */
export function verifyIdentifiers(path: string, names: string[]): string[] {
  if (!engineReady) return names;
  return names.filter((name) => verifyIdentifier(path, name) !== null);
}
