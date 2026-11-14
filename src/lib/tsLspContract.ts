/**
 * The TypeScript language-server contract (steal #3 — 2026-11-14).
 *
 * The CONTRACT, not the code — the method set and message shapes
 * stolen from two sources, re-implemented in TypeScript:
 *   - Kite's LSP method set (files-copilot design §2.3, from
 *     kiteco-public/kite-go/lsp/server.go): `initialize` /
 *     `initialized`, `textDocument/didOpen` / `didChange` /
 *     `didClose`, `textDocument/completion`, and the
 *     `CompletionItem` / `CompletionList` shapes. The Kite-specific
 *     methods (`kite/selection`, `kite/status`, `kite/track`,
 *     `kite/onboarding`) are NOT part of the steal — they are
 *     Kite's product telemetry and onboarding, and they stay
 *     with Kite.
 *   - typescript-language-server 6.1.0 (Apache-2.0, the thin LSP
 *     wrapper over tsserver): the capabilities block from
 *     `src/lsp-server.ts` `initialize()` (L327–440), the kind
 *     mapping from `src/completion.ts` `asCompletionItemKind`,
 *     the diagnostic translation from
 *     `src/protocol-translation.ts` `toDiagnostic`, the signature
 *     shape from `src/hover.ts` `asSignatureHelp`, and the
 *     resolve/auto-import shape from `src/completion.ts`
 *     `asResolvedCompletionItem` / `getCodeActions` (additional
 *     text edits for the current file only).
 *
 * This module is pure: it knows the LSP shapes and how to
 * translate a TypeScript service answer into one, but it never
 * touches the engine — src/lib/tsLanguageService.ts owns the
 * engine (bundled TS 6.x, pinned via the `typescript-lsp` npm
 * alias) and calls these translators. The translators take
 * structural types (not `ts.*`), so they are unit-testable
 * without loading the 8.8 MB compiler.
 *
 * Why the client speaks LSP shapes at all: the engine behind
 * them is swappable. Today the engine is the in-process TS 6
 * language service (a spawned typescript-language-server needs
 * Node ≥22.22.2 and Electron 28 embeds Node 18 — the spawn is
 * not viable in Lucid, and the Mac has no guaranteed system
 * Node); tomorrow it can be TS 7's `tsc --lsp --stdio` or a
 * real typescript-language-server, and the swap is a transport
 * change — the editor, the composer, and the agent all speak
 * these shapes already. The LSP is the driving intelligence's
 * fact-checker, not its brain: it answers what is true about
 * the code (types, signatures, diagnostics), never what to do
 * with it.
 *
 * Positions: LSP is 0-based line + 0-based UTF-16 character;
 * Monaco is 1-based line + 1-based UTF-16 column; the TS
 * service is a UTF-16 offset in the file text. The converters
 * below are the only place those three meet.
 */

/** A 0-based LSP position (line, UTF-16 character). */
export interface LspPosition {
  line: number;
  character: number;
}

/** A 0-based LSP range. */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** A 1-based Monaco position (line, UTF-16 column). */
export interface MonacoPosition {
  lineNumber: number;
  column: number;
}

/** LSP diagnostic severity (3.18): 1 Error, 2 Warning,
 *  3 Information, 4 Hint. */
export type LspDiagnosticSeverity = 1 | 2 | 3 | 4;
export const LspDiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;

export interface LspDiagnostic {
  range: LspRange;
  severity: LspDiagnosticSeverity;
  code: number;
  source: 'ts';
  message: string;
}

/** LSP CompletionItemKind (3.18) — the numbers do NOT match
 *  Monaco's CompletionItemKind (0-based, Struct/Snippet at
 *  6/28), so the editor provider translates them with
 *  lspKindToMonacoKind, never passes them through. */
export const LspCompletionItemKind = {
  Text: 1,
  Method: 2,
  Function: 3,
  Constructor: 4,
  Field: 5,
  Variable: 6,
  Class: 7,
  Interface: 8,
  Module: 9,
  Property: 10,
  Unit: 11,
  Value: 12,
  Enum: 13,
  Keyword: 14,
  Snippet: 15,
  Color: 16,
  File: 17,
  Reference: 18,
  Folder: 19,
  EnumMember: 20,
  Constant: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25,
} as const;
export type LspCompletionItemKind =
  (typeof LspCompletionItemKind)[keyof typeof LspCompletionItemKind];

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspCompletionItem {
  /** The text shown (and inserted, unless textEdit says otherwise). */
  label: string;
  kind: LspCompletionItemKind;
  /** The signature / type, e.g. `(method) Foo.bar(x: string): void`. */
  detail?: string;
  /** Markdown docs (JSDoc) — filled by completionItem/resolve. */
  documentation?: string;
  /** Sort order — the service's own order, never re-sorted. */
  sortText?: string;
  /** The module the item is auto-imported from, when it is one. */
  source?: string;
  /** The range the item replaces (the current word). */
  range?: LspRange;
  /** Edits to apply alongside the insert — the auto-import
   *  statement at the top of the file (current file only,
   *  the typescript-language-server rule). Filled by resolve. */
  additionalTextEdits?: LspTextEdit[];
  /** Opaque key for completionItem/resolve (the clone's
   *  CompletionDataCache cacheId, without the cache). */
  resolveKey?: string;
}

export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

export interface LspHover {
  /** Markdown: a code block with the quickinfo display, then
   *  the JSDoc — the lsp-server.ts hover() shape. */
  contents: string;
  range?: LspRange;
}

export interface LspSignatureParameter {
  label: string;
  documentation?: string;
}

export interface LspSignature {
  label: string;
  documentation?: string;
  parameters: LspSignatureParameter[];
}

export interface LspSignatureHelp {
  signatures: LspSignature[];
  activeSignature: number;
  activeParameter: number;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDocumentSymbol {
  name: string;
  kind: LspCompletionItemKind;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

/**
 * The method set this client speaks (Kite's server.go dispatch,
 * minus the kite/* methods). The client in tsLanguageService.ts
 * implements each as a function; the transport behind them is
 * the in-process TS 6 language service today.
 */
export const TS_LSP_METHODS = [
  'initialize',
  'initialized',
  'textDocument/didOpen',
  'textDocument/didChange',
  'textDocument/didClose',
  'textDocument/completion',
  'completionItem/resolve',
  'textDocument/hover',
  'textDocument/signatureHelp',
  'textDocument/publishDiagnostics',
  'textDocument/definition',
  'textDocument/typeDefinition',
  'textDocument/references',
  'textDocument/documentSymbol',
] as const;

/**
 * The capabilities this client declares — the subset of
 * typescript-language-server's initialize() capabilities that
 * the client actually implements. Only what is implemented is
 * declared: rename, code actions, formatting, code lens and
 * inlay hints are NOT in this slice (owed, not hidden).
 */
export const TS_LSP_CAPABILITIES = {
  textDocumentSync: 2, // Incremental — didOpen/didChange/didClose
  completionProvider: {
    // The clone's trigger characters (lsp-server.ts L327-440).
    triggerCharacters: ['.', '"', "'", '/', '@', '<'],
    resolveProvider: true,
  },
  hoverProvider: true,
  signatureHelpProvider: {
    triggerCharacters: ['(', ',', '<'],
    retriggerCharacters: [')'],
  },
  definitionProvider: true,
  typeDefinitionProvider: true,
  referencesProvider: true,
  documentSymbolProvider: true,
} as const;

/** The trigger characters that pop the suggest widget. */
export const TS_LSP_COMPLETION_TRIGGERS = [
  '.', '"', "'", '/', '@', '<',
] as const;

/** The trigger characters that pop signature help. */
export const TS_LSP_SIGNATURE_TRIGGERS = ['(', ',', '<'] as const;

/** The Monaco CompletionItemKind numbers (monaco-editor 0.57,
 *  esm/vs/editor/common/languages.js) — a DIFFERENT enum from
 *  the LSP's: 0-based, and Struct/Snippet sit at 6/28 rather
 *  than 22/15. */
export const MONACO_COMPLETION_ITEM_KIND = {
  Method: 0,
  Function: 1,
  Constructor: 2,
  Field: 3,
  Variable: 4,
  Class: 5,
  Struct: 6,
  Interface: 7,
  Module: 8,
  Property: 9,
  Event: 10,
  Operator: 11,
  Unit: 12,
  Value: 13,
  Constant: 14,
  Enum: 15,
  EnumMember: 16,
  Keyword: 17,
  Text: 18,
  Color: 19,
  File: 20,
  Reference: 21,
  Customcolor: 22,
  Folder: 23,
  TypeParameter: 24,
  User: 25,
  Issue: 26,
  Tool: 27,
  Snippet: 28,
} as const;

/** Translate a CompletionItemKind from the LSP numbering to
 *  Monaco's. Passing an LSP kind straight to Monaco would map
 *  to the wrong icon (LSP Function=3 is Monaco Field=3, LSP
 *  Variable=6 is Monaco Struct=6). Unknown kinds fall through
 *  to Property, the clone's default. */
export function lspKindToMonacoKind(
  kind: LspCompletionItemKind,
): number {
  const M = MONACO_COMPLETION_ITEM_KIND;
  switch (kind) {
    case LspCompletionItemKind.Text: return M.Text;
    case LspCompletionItemKind.Method: return M.Method;
    case LspCompletionItemKind.Function: return M.Function;
    case LspCompletionItemKind.Constructor: return M.Constructor;
    case LspCompletionItemKind.Field: return M.Field;
    case LspCompletionItemKind.Variable: return M.Variable;
    case LspCompletionItemKind.Class: return M.Class;
    case LspCompletionItemKind.Interface: return M.Interface;
    case LspCompletionItemKind.Module: return M.Module;
    case LspCompletionItemKind.Property: return M.Property;
    case LspCompletionItemKind.Unit: return M.Unit;
    case LspCompletionItemKind.Value: return M.Value;
    case LspCompletionItemKind.Enum: return M.Enum;
    case LspCompletionItemKind.Keyword: return M.Keyword;
    case LspCompletionItemKind.Snippet: return M.Snippet;
    case LspCompletionItemKind.Color: return M.Color;
    case LspCompletionItemKind.File: return M.File;
    case LspCompletionItemKind.Reference: return M.Reference;
    case LspCompletionItemKind.Folder: return M.Folder;
    case LspCompletionItemKind.EnumMember: return M.EnumMember;
    case LspCompletionItemKind.Constant: return M.Constant;
    case LspCompletionItemKind.Struct: return M.Struct;
    case LspCompletionItemKind.Event: return M.Event;
    case LspCompletionItemKind.Operator: return M.Operator;
    case LspCompletionItemKind.TypeParameter: return M.TypeParameter;
    default: return M.Property;
  }
}

/** 0-based LSP position -> 1-based Monaco position. */
export function lspToMonaco(pos: LspPosition): MonacoPosition {
  return { lineNumber: pos.line + 1, column: pos.character + 1 };
}

/** 1-based Monaco position -> 0-based LSP position. */
export function monacoToLsp(pos: MonacoPosition): LspPosition {
  return { line: Math.max(0, pos.lineNumber - 1), character: Math.max(0, pos.column - 1) };
}

/** 0-based LSP range -> Monaco range (1-based lines/columns). */
export function lspRangeToMonaco(range: LspRange): {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

/** Byte/UTF-16 offset in the file text -> 0-based LSP position. */
export function offsetToLsp(text: string, offset: number): LspPosition {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: clamped - lineStart };
}

/** 0-based LSP position -> UTF-16 offset in the file text. */
export function lspToOffset(text: string, pos: LspPosition): number {
  const lines = text.split('\n');
  const line = Math.min(Math.max(0, pos.line), lines.length - 1);
  let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i].length + 1;
  return Math.min(offset + Math.max(0, pos.character), text.length);
}

/** A TS diagnostic, structurally — the real ts.Diagnostic fits
 *  this shape, so the caller passes it straight through. */
export interface TsDiagnosticLike {
  /** 0 Warning, 1 Error, 2 Suggestion, 3 Message (ts.DiagnosticCategory). */
  category: number;
  code: number;
  messageText: string | { messageText: string | { messageText: string } };
  start?: number;
  length?: number;
}

function flattenMessageText(
  messageText: TsDiagnosticLike['messageText'],
): string {
  if (typeof messageText === 'string') return messageText;
  // A DiagnosticMessageChain nests messageText inside
  // messageText — flatten one level (the chain's head is the
  // sentence that matters; the nested detail is the cause).
  const inner = messageText.messageText;
  return typeof inner === 'string' ? inner : flattenMessageText(inner);
}

/**
 * Translate a TS diagnostic to an LSP diagnostic — the clone's
 * protocol-translation.ts `toDiagnostic` shape: severity from
 * category (Error -> 1, Warning -> 2, Message -> 3,
 * Suggestion -> 4 Hint), range from start/length, code kept,
 * source always 'ts'. A diagnostic with no span covers the
 * file's first character (the clone's behaviour for
 * file-level diagnostics).
 */
export function toLspDiagnostic(
  diagnostic: TsDiagnosticLike,
  text: string,
): LspDiagnostic {
  const severity: LspDiagnosticSeverity =
    diagnostic.category === 1
      ? 1
      : diagnostic.category === 0
        ? 2
        : diagnostic.category === 3
          ? 3
          : 4;
  const start = diagnostic.start ?? 0;
  const length = diagnostic.length ?? 0;
  return {
    range: {
      start: offsetToLsp(text, start),
      end: offsetToLsp(text, start + length),
    },
    severity,
    code: diagnostic.code,
    source: 'ts',
    message: flattenMessageText(diagnostic.messageText),
  };
}

/**
 * Map a tsserver ScriptElementKind to an LSP/Monaco
 * CompletionItemKind — the clone's completion.ts
 * `asCompletionItemKind`, re-implemented here over the kind's
 * string value (the service returns the kind as a string at
 * runtime, so no `ts` import is needed). The strings below are
 * the real values from typescript 6.0.3's ScriptElementKind
 * enum — verified, not guessed: 'method' (not 'member
 * function'), 'property' (not 'member variable'), 'getter' /
 * 'setter' (not 'member get/set accessor'), 'construct' /
 * 'call' / 'index' (not 'construct/call/index signature').
 * Two deviations from the clone, both toward more correct
 * kinds: 'constructor' -> Constructor (the clone falls through
 * to Property) and 'type parameter' -> TypeParameter (same).
 * Unknown kinds fall through to Property, the clone's default.
 */
export function scriptElementKindToCompletionKind(
  kind: string,
): LspCompletionItemKind {
  switch (kind) {
    case 'primitive type':
    case 'keyword':
      return LspCompletionItemKind.Keyword;
    case 'const':
    case 'let':
    case 'var':
    case 'local var':
    case 'using':
    case 'await using':
    case 'alias':
    case 'parameter':
      return LspCompletionItemKind.Variable;
    case 'property':
    case 'getter':
    case 'setter':
    case 'accessor':
      return LspCompletionItemKind.Field;
    case 'function':
    case 'local function':
      return LspCompletionItemKind.Function;
    case 'method':
    case 'construct':
    case 'call':
    case 'index':
      return LspCompletionItemKind.Method;
    case 'constructor':
      return LspCompletionItemKind.Constructor;
    case 'enum':
      return LspCompletionItemKind.Enum;
    case 'enum member':
      return LspCompletionItemKind.EnumMember;
    case 'module':
    case 'external module name':
      return LspCompletionItemKind.Module;
    case 'class':
    case 'local class':
    case 'type':
      return LspCompletionItemKind.Class;
    case 'interface':
      return LspCompletionItemKind.Interface;
    case 'type parameter':
      return LspCompletionItemKind.TypeParameter;
    case 'warning':
      return LspCompletionItemKind.Text;
    case 'script':
      return LspCompletionItemKind.File;
    case 'directory':
      return LspCompletionItemKind.Folder;
    case 'string':
      return LspCompletionItemKind.Constant;
    default:
      return LspCompletionItemKind.Property;
  }
}

/** A ts display part, structurally ({ text, kind }). */
export interface TsDisplayPartLike {
  text: string;
  kind: string;
}

/** Join display parts into their text (the quickinfo display). */
export function displayPartsToText(parts: readonly TsDisplayPartLike[]): string {
  return parts.map((p) => p.text).join('');
}

/**
 * Render quickinfo display parts as hover markdown — the
 * lsp-server.ts hover() shape: a fenced code block with the
 * display, then the documentation below it.
 */
export function quickInfoToHoverMarkdown(
  displayParts: readonly TsDisplayPartLike[],
  documentation: readonly TsDisplayPartLike[] | undefined,
  languageId = 'typescript',
): string {
  const display = displayPartsToText(displayParts);
  const docs = documentation ? displayPartsToText(documentation) : '';
  const code = display ? `\`\`\`${languageId}\n${display}\n\`\`\`` : '';
  return docs ? (code ? `${code}\n\n${docs}` : docs) : code;
}

/** A diagnostic as a Monaco marker (editor.setModelMarkers).
 *  Monaco's MarkerSeverity: Hint 1, Info 2, Warning 4, Error 8
 *  — a different scale from the LSP's 1..4, so translate. */
export function lspDiagnosticToMonacoMarker(diagnostic: LspDiagnostic): {
  severity: number;
  message: string;
  source?: string;
  code?: string | number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  const severity =
    diagnostic.severity === LspDiagnosticSeverity.Error
      ? 8
      : diagnostic.severity === LspDiagnosticSeverity.Warning
        ? 4
        : diagnostic.severity === LspDiagnosticSeverity.Information
          ? 2
          : 1;
  return {
    severity,
    message: diagnostic.message,
    source: diagnostic.source,
    code: diagnostic.code,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
  };
}
