/**
 * The engine client (Kite mapping #2 — the client split —
 * 2026-11-14).
 *
 * Kite split its client into two layers, both small JS, and
 * the split is the steal — not the transport details:
 *
 *   - `kite-connect-js` — the transport + state machine.
 *     `lib/index.js:29` creates `new NodeClient('localhost',
 *     '46624')`; `request()` (`:46-82`) wraps every call: on
 *     failure it walks the health checks and throws a typed
 *     `KiteStateError` (`UNREACHABLE`), on HTTP >= 400 it
 *     throws a typed `KiteRequestError` (`bad_status`), and
 *     every failure emits `did-fail-request`. `checkHealth()`
 *     (`:84-99`) walks supported → installed → running →
 *     reachable and returns a state from `lib/constants.js`.
 *   - `kite-api-js` — the typed API over the connector.
 *     `requestJSON()` (`:34-38`) is request + parse.
 *     `getCompletions(payload)` (`:216-230`) POSTs
 *     `'/clientapi/editor/complete'` and returns
 *     `data.completions || []`, swallowing failure to `[]`.
 *     `getHoverDataAtPosition` (`:129-133`) and
 *     `getSymbolReportDataForId` (`:150-155`) are the
 *     hover/docs calls the provider and the sidebar share.
 *
 * Lucid's version, in this one module:
 *
 *   - The connector: `EngineTransport` — one method,
 *     `request(method, params)`, over the LSP method set
 *     (`TS_LSP_METHODS`, steal #3), plus `checkHealth()`
 *     walking Kite's states. The in-process transport
 *     (`createInProcessTransport`) dispatches each method to
 *     the TS language service (`tsLanguageService.ts`); a
 *     later swap — TS 7's native LSP over a real transport —
 *     is a new transport, not a rewrite of the callers.
 *   - The API: `EngineClient` — one typed method per engine
 *     call (completions, hover, signature help, diagnostics,
 *     checkEdit, verify, symbol report, structure, patterns),
 *     each returning an empty result on failure, never
 *     throwing into the editor (Kite's `getCompletions`
 *     swallowing to `[]`). The client is the ONLY thing the
 *     completion provider, the composer ghost, the docs panel
 *     and the agent loop talk to.
 *
 * What is NOT carried over: the `localhost:46624` port, the
 * cookie handling, the install/run detection that assumes a
 * Kite desktop app. The state machine and the typed-error
 * shape are the steal, not the transport details.
 *
 * The boundary, stated honestly:
 *   - `request()` speaks the LSP method set. The document
 *     sync methods (`didOpen` / `didChange` / `didClose`)
 *     are notifications in LSP — they never get a response
 *     and never fail — so the transport accepts them even
 *     before the engine is up (the editor opens documents
 *     before the warm-up finishes; the service holds them
 *     until it is created). The query methods throw
 *     `EngineStateError` while the engine is not ready, and
 *     the API layer turns that into the empty result.
 *   - `checkEdit` and `verifyIdentifier(s)` are client-side
 *     compositions, not LSP methods: the service module
 *     already implements them over the same primitives, and
 *     the client delegates to it rather than duplicating
 *     the swap-in/read/restore logic. A future real-LSP
 *     transport would compose them from didChange +
 *     publishDiagnostics / completion instead — that is the
 *     future slice's work, stated here, not hidden.
 *   - Structure (tree-sitter) and patterns (Tabnine) are not
 *     LSP at all: the API serves them from their lazy
 *     in-memory engines directly, through the same never-
 *     throw surface. The client is the single surface for
 *     all three engine-side sources.
 *   - The API is synchronous, like the engine it wraps
 *     today. A future async transport (a real LSP server)
 *     would make the API async at that point; the method
 *     set is what survives the swap.
 *   - `checkHealth()` loads the engine on first call, like
 *     any first engine use — it is on-demand only (the docs
 *     panel's engine state, explicit diagnostics), never on
 *     the startup path and never on the hot path.
 *
 * Failure mode (Kite's contract): a dead engine returns no
 * facts, never an error. Every API method degrades to null /
 * [] / false, and every failed operation emits
 * `did-fail-request` for observability (Kite's emitter shape:
 * `onDidFailRequest(listener)` returns `{ dispose }`). The
 * `isReady()` probe is the one exception: it swallows
 * without emitting, because the docs panel calls it on
 * every render and a down engine is "not ready", not a
 * failure to observe.
 */

import * as tsLsp from './tsLanguageService';
import { getIdentifiersAtPosition } from './treeSitter';
import {
  getPatternIndex,
  type CodePattern,
  type PatternSourceFile,
} from './codePatterns';
import {
  TS_LSP_METHODS,
  type LspCompletionItem,
  type LspCompletionList,
  type LspDiagnostic,
  type LspDocumentSymbol,
  type LspHover,
  type LspLocation,
  type LspPosition,
  type LspSignatureHelp,
} from './tsLspContract';

/** The engine states (Kite's `STATES`, `kite-connect-js`
 *  `lib/constants.js` — `UNLOGGED` is dropped: there is no
 *  login in a local engine, and Kite itself gave it the same
 *  value as `READY`). */
export type EngineState =
  | 'unsupported'
  | 'uninstalled'
  | 'not-running'
  | 'unreachable'
  | 'ready';

/** The engine could not be reached (Kite's `KiteStateError`
 *  — the state is the fact, the message is the context). */
export class EngineStateError extends Error {
  readonly state: EngineState;
  readonly request?: unknown;
  constructor(
    message: string,
    opts: { state: EngineState; request?: unknown },
  ) {
    super(message);
    this.name = 'EngineStateError';
    this.state = opts.state;
    this.request = opts.request;
  }
}

/** The engine answered badly (Kite's `KiteRequestError` —
 *  `bad_status` is the HTTP >= 400 shape; `unknown_method`
 *  is a caller bug — a method outside the set — and
 *  `engine_error` is an unexpected throw from the engine
 *  itself). */
export class EngineRequestError extends Error {
  readonly code: 'bad_status' | 'unknown_method' | 'engine_error';
  readonly request?: unknown;
  constructor(
    code: EngineRequestError['code'],
    message: string,
    opts?: { request?: unknown },
  ) {
    super(message);
    this.name = 'EngineRequestError';
    this.code = code;
    this.request = opts?.request;
  }
}

/** One LSP method the transport speaks (steal #3's method
 *  set — `TS_LSP_METHODS`, minus nothing: the transport
 *  speaks the whole set, including `initialize` /
 *  `initialized`). */
export type EngineMethod = (typeof TS_LSP_METHODS)[number];

/** The params each method takes. */
export interface EngineMethodParams {
  initialize: Record<string, never>;
  initialized: Record<string, never>;
  'textDocument/didOpen': { path: string; content: string };
  'textDocument/didChange': { path: string; content: string };
  'textDocument/didClose': { path: string };
  'textDocument/completion': { path: string; position: LspPosition };
  'completionItem/resolve': { path: string; item: LspCompletionItem };
  'textDocument/hover': { path: string; position: LspPosition };
  'textDocument/signatureHelp': { path: string; position: LspPosition };
  'textDocument/publishDiagnostics': { path: string };
  'textDocument/definition': { path: string; position: LspPosition };
  'textDocument/typeDefinition': { path: string; position: LspPosition };
  'textDocument/references': { path: string; position: LspPosition };
  'textDocument/documentSymbol': { path: string };
}

/** The result each method returns. */
export interface EngineMethodResult {
  initialize: boolean;
  initialized: undefined;
  'textDocument/didOpen': undefined;
  'textDocument/didChange': undefined;
  'textDocument/didClose': undefined;
  'textDocument/completion': LspCompletionList | null;
  'completionItem/resolve': LspCompletionItem | null;
  'textDocument/hover': LspHover | null;
  'textDocument/signatureHelp': LspSignatureHelp | null;
  'textDocument/publishDiagnostics': LspDiagnostic[];
  'textDocument/definition': LspLocation[];
  'textDocument/typeDefinition': LspLocation[];
  'textDocument/references': LspLocation[];
  'textDocument/documentSymbol': LspDocumentSymbol[];
}

/**
 * The connector layer (Kite's `kite-connect-js`): how one
 * LSP-shaped request reaches the engine. A transport throws
 * `EngineStateError` when the engine is not ready and
 * `EngineRequestError` for a bad method or a bad answer —
 * the API layer above turns those into the empty result.
 * The swap point: a future transport (TS 7's native LSP)
 * implements this same interface.
 */
export interface EngineTransport {
  /** The transport name, for diagnostics ('in-process' today). */
  readonly name: string;
  /** Send one LSP-shaped request; returns the result, or
   *  throws. Notifications (`didOpen` / `didChange` /
   *  `didClose` / `initialized`) never throw — they are
   *  accepted before the engine is up. */
  request<M extends EngineMethod>(
    method: M,
    params: EngineMethodParams[M],
  ): EngineMethodResult[M];
  /** Walk supported → installed → running → reachable and
   *  return the state. Loads the engine on first call. */
  checkHealth(): Promise<EngineState>;
}

/** The readiness guard for the query methods: the engine
 *  must be up, or the request is a state error (Kite's
 *  `UNREACHABLE` shape — the state is the fact). */
function requireReady(method: string, params: unknown): void {
  if (!tsLsp.isTsLspReady()) {
    throw new EngineStateError('The language service is not ready', {
      state: 'not-running',
      request: { method, params },
    });
  }
}

/**
 * The in-process transport: each LSP method dispatches to
 * the TS language service in this process. No spawned
 * server, no socket, no Node floor — the same reason steal
 * #3 runs the service in-process (Electron 28 embeds Node
 * 18; a language server needs Node >= 22). The module is
 * statically imported here, but the compiler is not: the
 * service dynamic-imports `typescript-lsp` inside
 * `ensureTsLsp`, so importing this client costs nothing
 * until the first engine use.
 */
export function createInProcessTransport(): EngineTransport {
  return {
    name: 'in-process',
    request<M extends EngineMethod>(
      method: M,
      params: EngineMethodParams[M],
    ): EngineMethodResult[M] {
      switch (method) {
        case 'initialize':
          return tsLsp.isTsLspReady() as EngineMethodResult[M];
        case 'initialized':
          return undefined as EngineMethodResult[M];
        case 'textDocument/didOpen': {
          const p = params as EngineMethodParams['textDocument/didOpen'];
          tsLsp.openDocument(p.path, p.content);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/didChange': {
          const p = params as EngineMethodParams['textDocument/didChange'];
          tsLsp.changeDocument(p.path, p.content);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/didClose': {
          const p = params as EngineMethodParams['textDocument/didClose'];
          tsLsp.closeDocument(p.path);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/completion': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/completion'];
          return tsLsp.getCompletions(p.path, p.position) as EngineMethodResult[M];
        }
        case 'completionItem/resolve': {
          requireReady(method, params);
          const p = params as EngineMethodParams['completionItem/resolve'];
          return tsLsp.resolveCompletion(p.path, p.item) as EngineMethodResult[M];
        }
        case 'textDocument/hover': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/hover'];
          return tsLsp.getHover(p.path, p.position) as EngineMethodResult[M];
        }
        case 'textDocument/signatureHelp': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/signatureHelp'];
          return tsLsp.getSignatureHelp(p.path, p.position) as EngineMethodResult[M];
        }
        case 'textDocument/publishDiagnostics': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/publishDiagnostics'];
          return tsLsp.getDiagnostics(p.path) as EngineMethodResult[M];
        }
        case 'textDocument/definition': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/definition'];
          return tsLsp.getDefinition(p.path, p.position) as EngineMethodResult[M];
        }
        case 'textDocument/typeDefinition': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/typeDefinition'];
          return tsLsp.getTypeDefinition(p.path, p.position) as EngineMethodResult[M];
        }
        case 'textDocument/references': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/references'];
          return tsLsp.getReferences(p.path, p.position) as EngineMethodResult[M];
        }
        case 'textDocument/documentSymbol': {
          requireReady(method, params);
          const p = params as EngineMethodParams['textDocument/documentSymbol'];
          return tsLsp.getDocumentSymbols(p.path) as EngineMethodResult[M];
        }
        default:
          throw new EngineRequestError(
            'unknown_method',
            `Unknown engine method: ${String(method)}`,
            { request: { method, params } },
          );
      }
    },
    async checkHealth(): Promise<EngineState> {
      // installed: the bundled compiler resolves. The
      // dynamic import is module-cached after the first
      // load, so the probe is cheap once the engine is up.
      try {
        const mod = await import('typescript-lsp');
        const ts = (mod as { default?: unknown } | null)?.default ?? mod;
        if (
          typeof (ts as { createLanguageService?: unknown })
            ?.createLanguageService !== 'function'
        ) {
          return 'uninstalled';
        }
      } catch {
        return 'uninstalled';
      }
      // running: the service initialises.
      const ready = await tsLsp.ensureTsLsp();
      if (!ready) return 'not-running';
      // reachable: the live service answers a probe (its own
      // version). 'unsupported' is never returned by this
      // transport — the in-process engine has no platform
      // gate; the state exists for a future transport that
      // does (a native engine needing an OS feature).
      return tsLsp.getTsVersion() !== null ? 'ready' : 'unreachable';
    },
  };
}

/** The docs-panel report (Kite's `getReportDataAtPosition`
 *  — hover, then the symbol report — in Lucid's shapes):
 *  the docs for the symbol at a position, where it is
 *  defined, and every use of it. Null when there is no
 *  symbol at the position (no hover). */
export interface SymbolReport {
  /** The identifier the report is about (the word at the cursor). */
  identifier: string;
  /** Hover docs (fenced signature + JSDoc), or null when the engine has none. */
  hover: LspHover | null;
  /** Where the symbol is defined, or [] when unknown. */
  definition: LspLocation[];
  /** Every use of the symbol, or [] when unknown. */
  references: LspLocation[];
}

/** The typed API over the connector (Kite's `kite-api-js`):
 *  one method per engine call, each returning an empty
 *  result on failure, never throwing into the editor. */
export interface EngineClient {
  /** The transport behind this client ('in-process' today). */
  readonly transportName: string;
  /** True once the engine has initialised successfully. */
  isReady(): boolean;
  /** Warm the engine (the async `initialize`); true when ready. */
  ensureReady(): Promise<boolean>;
  /** Walk the health states; updates the last-known state. */
  checkHealth(): Promise<EngineState>;
  /** The last-known state ('not-running' before the first check). */
  getState(): EngineState;
  /** The pinned compiler version, or null before init. */
  getEngineVersion(): string | null;
  /** Kite's `did-fail-request`: every failure the API
   *  swallows is emitted here, once per failed call. */
  onDidFailRequest(listener: (error: Error) => void): { dispose: () => void };

  /** `textDocument/didOpen` — register a document's content. */
  openDocument(path: string, content: string): void;
  /** `textDocument/didChange` — replace a document's content. */
  changeDocument(path: string, content: string): void;
  /** `textDocument/didClose` — drop a document (guest: nothing persists). */
  closeDocument(path: string): void;
  /** Drop every open document except the given paths. */
  dropDocumentsExcept(openPaths: Iterable<string>): void;

  /** `textDocument/completion` — the list at a position, or null. */
  getCompletions(path: string, position: LspPosition): LspCompletionList | null;
  /** `completionItem/resolve` — docs + auto-import edits, or null. */
  resolveCompletion(path: string, item: LspCompletionItem): LspCompletionItem | null;
  /** `textDocument/hover` — quickinfo as markdown, or null. */
  getHover(path: string, position: LspPosition): LspHover | null;
  /** `textDocument/signatureHelp` — the active signature, or null. */
  getSignatureHelp(path: string, position: LspPosition): LspSignatureHelp | null;
  /** `textDocument/publishDiagnostics` (pull form) — [] when clean. */
  getDiagnostics(path: string): LspDiagnostic[];
  /** Check an edit before it lands: swap in, read the
   *  diagnostics, restore. Never throws. */
  checkEdit(
    path: string,
    newContent: string,
  ): { clean: boolean; diagnostics: LspDiagnostic[] };
  /** Is this a real, resolvable symbol in this file? */
  verifyIdentifier(
    path: string,
    name: string,
  ): { kind: string; detail?: string } | null;
  /** Keep the candidates the engine can resolve, drop the rest. */
  verifyIdentifiers(path: string, names: string[]): string[];
  /** `textDocument/definition` — where a symbol is defined. */
  getDefinition(path: string, position: LspPosition): LspLocation[];
  /** `textDocument/typeDefinition` — where a symbol's type is defined. */
  getTypeDefinition(path: string, position: LspPosition): LspLocation[];
  /** `textDocument/references` — every use of a symbol. */
  getReferences(path: string, position: LspPosition): LspLocation[];
  /** `textDocument/documentSymbol` — the file outline. */
  getDocumentSymbols(path: string): LspDocumentSymbol[];
  /** The docs-panel report for the symbol at a position, or
   *  null when there is no symbol there. Returns null
   *  without emitting when the engine is down (a
   *  composition of three calls would otherwise emit three
   *  failures for one cursor move). */
  getSymbolReport(
    path: string,
    position: LspPosition,
    word: string,
  ): SymbolReport | null;
  /** Tree-sitter identifiers in scope at a position — the
   *  fallback when the engine is unavailable. */
  getStructureIdentifiers(
    path: string,
    lineNumber: number,
    column: number,
  ): string[];
  /** The synced pattern list for these files (the
   *  composer's source). */
  getPatterns(files: ReadonlyArray<PatternSourceFile>): CodePattern[];
  /** The ranked pattern texts for a line prefix (the
   *  editor's source), capped at `limit`. */
  getPatternCompletions(
    files: ReadonlyArray<PatternSourceFile>,
    linePrefix: string,
    limit?: number,
  ): string[];
}

/** Build a client over a transport (the in-process one by
 *  default). A test or a future transport passes its own. */
export function createEngineClient(
  transport: EngineTransport = createInProcessTransport(),
): EngineClient {
  const listeners = new Set<(error: Error) => void>();
  let lastState: EngineState = 'not-running';

  const emitFailure = (error: Error): void => {
    for (const listener of [...listeners]) {
      try {
        listener(error);
      } catch {
        // A failing listener must never break the engine
        // call it was observing.
      }
    }
  };

  // One transport call, with Kite's failure contract: the
  // error is emitted once and the empty result is returned.
  // `empty` is the per-method empty result (null / [] /
  // false), so the caller never sees a throw.
  const call = <T>(empty: T, fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      emitFailure(error instanceof Error ? error : new Error(String(error)));
      return empty;
    }
  };

  const client: EngineClient = {
    transportName: transport.name,

    isReady(): boolean {
      // A predicate, not an operation: a down engine is
      // "not ready", not a failure to observe. The probe
      // swallows without emitting — the docs panel calls it
      // on every render, and a failure emission per render
      // would be noise. Operations below emit.
      try {
        return transport.request('initialize', {});
      } catch {
        return false;
      }
    },

    async ensureReady(): Promise<boolean> {
      // The closure, not `this` — a destructured method
      // must still warm the same client.
      const state = await client.checkHealth();
      return state === 'ready';
    },

    async checkHealth(): Promise<EngineState> {
      try {
        lastState = await transport.checkHealth();
      } catch (error) {
        emitFailure(error instanceof Error ? error : new Error(String(error)));
        lastState = 'unreachable';
      }
      return lastState;
    },

    getState(): EngineState {
      return lastState;
    },

    getEngineVersion(): string | null {
      return call(null, () => tsLsp.getTsVersion());
    },

    onDidFailRequest(listener: (error: Error) => void): { dispose: () => void } {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },

    openDocument(path: string, content: string): void {
      call(undefined, () =>
        transport.request('textDocument/didOpen', { path, content }),
      );
    },

    changeDocument(path: string, content: string): void {
      call(undefined, () =>
        transport.request('textDocument/didChange', { path, content }),
      );
    },

    closeDocument(path: string): void {
      call(undefined, () =>
        transport.request('textDocument/didClose', { path }),
      );
    },

    dropDocumentsExcept(openPaths: Iterable<string>): void {
      // The service holds the open set; the client drops
      // what is no longer open, one didClose per document.
      // (The LSP has no bulk-close; the loop is the client's.)
      try {
        tsLsp.dropDocumentsExcept(openPaths);
      } catch (error) {
        emitFailure(error instanceof Error ? error : new Error(String(error)));
      }
    },

    getCompletions(path: string, position: LspPosition): LspCompletionList | null {
      return call(null, () =>
        transport.request('textDocument/completion', { path, position }),
      );
    },

    resolveCompletion(path: string, item: LspCompletionItem): LspCompletionItem | null {
      return call(null, () =>
        transport.request('completionItem/resolve', { path, item }),
      );
    },

    getHover(path: string, position: LspPosition): LspHover | null {
      return call(null, () =>
        transport.request('textDocument/hover', { path, position }),
      );
    },

    getSignatureHelp(path: string, position: LspPosition): LspSignatureHelp | null {
      return call(null, () =>
        transport.request('textDocument/signatureHelp', { path, position }),
      );
    },

    getDiagnostics(path: string): LspDiagnostic[] {
      return call([], () =>
        transport.request('textDocument/publishDiagnostics', { path }),
      );
    },

    checkEdit(
      path: string,
      newContent: string,
    ): { clean: boolean; diagnostics: LspDiagnostic[] } {
      // A client-side composition, not an LSP method: the
      // service module already implements the swap-in /
      // read / restore over the same primitives, and the
      // client delegates to it rather than duplicating the
      // logic. (A future real-LSP transport composes it
      // from didChange + publishDiagnostics instead.)
      return call({ clean: true, diagnostics: [] }, () =>
        tsLsp.checkEdit(path, newContent),
      );
    },

    verifyIdentifier(
      path: string,
      name: string,
    ): { kind: string; detail?: string } | null {
      // Same composition note as checkEdit: the service
      // module's check (completions at end-of-file, keyword
      // and primitive kinds rejected) is the implementation;
      // the client is the surface.
      return call(null, () => tsLsp.verifyIdentifier(path, name));
    },

    verifyIdentifiers(path: string, names: string[]): string[] {
      return call([], () => tsLsp.verifyIdentifiers(path, names));
    },

    getDefinition(path: string, position: LspPosition): LspLocation[] {
      return call([], () =>
        transport.request('textDocument/definition', { path, position }),
      );
    },

    getTypeDefinition(path: string, position: LspPosition): LspLocation[] {
      return call([], () =>
        transport.request('textDocument/typeDefinition', { path, position }),
      );
    },

    getReferences(path: string, position: LspPosition): LspLocation[] {
      return call([], () =>
        transport.request('textDocument/references', { path, position }),
      );
    },

    getDocumentSymbols(path: string): LspDocumentSymbol[] {
      return call([], () =>
        transport.request('textDocument/documentSymbol', { path }),
      );
    },

    getSymbolReport(
      path: string,
      position: LspPosition,
      word: string,
    ): SymbolReport | null {
      // One cursor move, one report — no triple emission
      // when the engine is down.
      if (!client.isReady()) return null;
      const hover = client.getHover(path, position);
      if (!hover) return null;
      return {
        identifier: word,
        hover,
        definition: client.getDefinition(path, position),
        references: client.getReferences(path, position),
      };
    },

    getStructureIdentifiers(
      path: string,
      lineNumber: number,
      column: number,
    ): string[] {
      return call([], () => getIdentifiersAtPosition(path, lineNumber, column));
    },

    getPatterns(files: ReadonlyArray<PatternSourceFile>): CodePattern[] {
      return call([], () => getPatternIndex().sync(files));
    },

    getPatternCompletions(
      files: ReadonlyArray<PatternSourceFile>,
      linePrefix: string,
      limit = 5,
    ): string[] {
      return call([], () => {
        const index = getPatternIndex();
        index.sync(files);
        return index.match(linePrefix, limit).map((p) => p.text);
      });
    },
  };

  return client;
}

let sharedClient: EngineClient | null = null;

/** The shared client — the only engine surface the UI,
 *  the composer and the agent loop use. Created on first
 *  use, over the in-process transport. */
export function getEngineClient(): EngineClient {
  if (!sharedClient) sharedClient = createEngineClient();
  return sharedClient;
}

/** Test seam: drop the shared client so the next
 *  `getEngineClient()` builds a fresh one. */
export function resetEngineClientForTests(): void {
  sharedClient = null;
}
