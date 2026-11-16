/**
 * The async engine client over the TypeScript 7 native-LSP
 * transport (Kite real transport — 2026-11-15).
 *
 * The companion to `ts7LspTransport.ts`: the same `EngineClient`
 * surface, the same `TS_LSP_METHODS` set, the same `checkHealth()`,
 * the same failure contract (empty results, never throw, one
 * `did-fail-request` per failure) — but ASYNC, because a real
 * LSP server over stdio cannot answer synchronously. The sync
 * `createEngineClient` / `getEngineClient()` in `engineClient.ts`
 * are untouched and remain the default; this client becomes the
 * default only when the main-process sidecar + IPC bridge lands
 * (the follow-on slice — the renderer cannot spawn, and this
 * module is Node-only by construction).
 *
 * The compositions the `engineClient` header promised for the
 * real transport live here, composed over real transport calls:
 *   - `checkEdit` — didChange(new) → pull diagnostics →
 *     didChange(original) restore, in a finally. A document
 *     that was not open is opened with the new content,
 *     checked, and closed again. The original is restored on
 *     any failure — the document is never left holding the
 *     unchecked content.
 *   - `verifyIdentifier(s)` — completions at the end of the
 *     open file, the same rule as the in-process service: a
 *     name that appears with a non-keyword kind resolves; a
 *     keyword (LSP kind 14 — which is also where TS 7 reports
 *     primitive types) or an absent name does not. When the
 *     engine is down, `verifyIdentifiers` passes candidates
 *     through unchanged, like the in-process client (the ghost
 *     degrades to tree-sitter, it never goes silent).
 *   - `getDiagnostics` — the PULL `textDocument/diagnostic`
 *     (TS 7.0.2 publishes nothing for open `.ts` files; see
 *     `ts7LspTransport.ts` for the measured evidence). The
 *     push cache is exposed separately via
 *     `onDidPublishDiagnostics` / `getPublishedDiagnostics`.
 *   - `getSymbolReport` — hover + definition + references,
 *     with the same single-probe short-circuit as the sync
 *     client (no triple emission when the engine is down).
 *
 * Structure (tree-sitter) and patterns (Tabnine) are not LSP
 * at all: like the sync client, this client serves them from
 * their lazy in-memory engines directly, through the same
 * never-throw surface.
 */

import {
  EngineRequestError,
  EngineStateError,
  type EngineMethod,
  type EngineMethodParams,
  type EngineMethodResult,
  type EngineState,
  type SymbolReport,
} from './engineClient';
import { getIdentifiersAtPosition } from './treeSitter';
import {
  getPatternIndex,
  type CodePattern,
  type PatternSourceFile,
} from './codePatterns';
import {
  mapCompletionList,
  mapDiagnostics,
  mapDocumentSymbols,
  mapHover,
  mapLocations,
  mapResolvedCompletionItem,
  mapSignatureHelp,
  pathToUri,
  resolveTs7Server,
  Ts7LspClient,
  uriToPath,
  type Ts7ServerResolution,
} from './ts7LspTransport';
import {
  offsetToLsp,
  LspCompletionItemKind,
  type LspCompletionItem,
  type LspCompletionList,
  type LspDiagnostic,
  type LspDocumentSymbol,
  type LspHover,
  type LspLocation,
  type LspPosition,
  type LspSignatureHelp,
} from './tsLspContract';

/**
 * The async connector layer: the same `request(method, params)`
 * surface and the same method set as the sync `EngineTransport`,
 * but every call is a Promise — a real LSP server answers over
 * stdio, never synchronously.
 */
export interface AsyncEngineTransport {
  /** The transport name, for diagnostics ('typescript-7'). */
  readonly name: string;
  /** True once `initialize` has answered. */
  isReady(): boolean;
  /** The server's version, or null before init. */
  getServerVersion(): string | null;
  /** Send one LSP-shaped request; returns the result, or
   *  throws (`EngineStateError` while the engine is not
   *  ready, `EngineRequestError` for a bad method/answer).
   *  Notifications (`didOpen` / `didChange` / `didClose` /
   *  `initialized`) never throw — they are accepted before
   *  the engine is up. */
  request<M extends EngineMethod>(
    method: M,
    params: EngineMethodParams[M],
  ): Promise<EngineMethodResult[M]>;
  /** Walk supported → installed → running → reachable and
   *  return the state. Loads the engine on first call. */
  checkHealth(): Promise<EngineState>;
  /** The open document's content, or null when not open
   *  (the compositions need it; the transport owns it). */
  getOpenDocumentContent(path: string): string | null;
  /** Push diagnostics the server published (config files in
   *  TS 7.0.2 — open `.ts` files come from the pull). */
  onDidPublishDiagnostics(
    listener: (uri: string, diagnostics: LspDiagnostic[]) => void,
  ): { dispose: () => void };
  /** Stop the server. */
  dispose(): Promise<void>;
}

export interface CreateTs7TransportOptions {
  /** Explicit server entrypoint (tests / debugging). When
   *  absent, `resolveTs7Server()` runs at start time. */
  resolution?: Ts7ServerResolution;
  /** Workspace root the server is rooted at (default:
   *  `process.cwd()`). */
  rootPath?: string;
  /** Per-request timeout in ms. */
  requestTimeoutMs?: number;
}

/** The readiness guard for the query methods (the sync
 *  client's `requireReady`, async). */
function requireReady(
  client: Ts7LspClient,
  method: string,
  params: unknown,
): void {
  if (!client.isReady()) {
    throw new EngineStateError('The language service is not ready', {
      state: 'not-running',
      request: { method, params },
    });
  }
}

/**
 * Build the async transport over a `Ts7LspClient` — the real
 * TS 7 native-LSP server behind the engineClient method set.
 * The client owns the server process; this adapter owns the
 * translation between Lucid's path-based params and the
 * server's URI-based LSP, and between the server's raw
 * results and the contract shapes.
 */
export function createTs7Transport(
  opts: CreateTs7TransportOptions = {},
): AsyncEngineTransport {
  const client = new Ts7LspClient({
    resolution: opts.resolution,
    rootPath: opts.rootPath,
    requestTimeoutMs: opts.requestTimeoutMs,
  });
  // completionItem/resolve needs the raw item the server
  // returned (its `data` is the server's cache key) — the
  // contract's resolveKey is our index into it (the clone's
  // CompletionDataCache, without the cache).
  const resolveCache = new Map<string, unknown>();
  let resolveCounter = 0;
  // Last pulled diagnostics per path — the server may answer
  // a pull with kind 'unchanged', which means "still these".
  const lastPulled = new Map<string, LspDiagnostic[]>();

  const transport: AsyncEngineTransport = {
    name: 'typescript-7',

    isReady(): boolean {
      return client.isReady();
    },

    getServerVersion(): string | null {
      return client.getServerVersion();
    },

    async request<M extends EngineMethod>(
      method: M,
      params: EngineMethodParams[M],
    ): Promise<EngineMethodResult[M]> {
      switch (method) {
        case 'initialize': {
          const ok = await client.start();
          return ok as EngineMethodResult[M];
        }
        case 'initialized':
          // `start()` already sent `initialized` after the
          // handshake; a later one is a no-op.
          return undefined as EngineMethodResult[M];
        case 'textDocument/didOpen': {
          const p = params as EngineMethodParams['textDocument/didOpen'];
          client.openDocument(p.path, p.content);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/didChange': {
          const p = params as EngineMethodParams['textDocument/didChange'];
          client.changeDocument(p.path, p.content);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/didClose': {
          const p = params as EngineMethodParams['textDocument/didClose'];
          client.closeDocument(p.path);
          return undefined as EngineMethodResult[M];
        }
        case 'textDocument/completion': {
          requireReady(client, method, params);
          const p = params as EngineMethodParams['textDocument/completion'];
          const raw = await client.request('textDocument/completion', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
          });
          return mapCompletionList(raw, (rawItem) => {
            const key = `ts7:${++resolveCounter}`;
            resolveCache.set(key, rawItem);
            return key;
          }) as EngineMethodResult[M];
        }
        case 'completionItem/resolve': {
          requireReady(client, method, params);
          const p = params as EngineMethodParams['completionItem/resolve'];
          const rawItem = p.item.resolveKey
            ? resolveCache.get(p.item.resolveKey)
            : undefined;
          // No cached raw item (stale key, or an item that
          // never came from this server): return the item
          // unchanged, like the in-process transport.
          if (!rawItem) return p.item as EngineMethodResult[M];
          const raw = await client.request(
            'completionItem/resolve',
            rawItem,
          );
          return mapResolvedCompletionItem(
            raw,
            p.item,
          ) as EngineMethodResult[M];
        }
        case 'textDocument/hover': {
          requireReady(client, method, params);
          const p = params as EngineMethodParams['textDocument/hover'];
          const raw = await client.request('textDocument/hover', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
          });
          return mapHover(raw) as EngineMethodResult[M];
        }
        case 'textDocument/signatureHelp': {
          requireReady(client, method, params);
          const p =
            params as EngineMethodParams['textDocument/signatureHelp'];
          const raw = await client.request('textDocument/signatureHelp', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
          });
          return mapSignatureHelp(raw) as EngineMethodResult[M];
        }
        case 'textDocument/publishDiagnostics': {
          // Pull form (the clone's
          // diagnosticsManager.getDiagnosticsForFile): TS 7
          // publishes nothing for open files, so the pull
          // `textDocument/diagnostic` IS the diagnostics
          // channel. [] when the document is not open.
          requireReady(client, method, params);
          const p =
            params as EngineMethodParams['textDocument/publishDiagnostics'];
          if (client.getOpenDocumentContent(p.path) === null) {
            return [] as unknown as EngineMethodResult[M];
          }
          const raw = await client.request('textDocument/diagnostic', {
            textDocument: { uri: pathToUri(p.path) },
          });
          const result = raw as { kind?: string; items?: unknown } | null;
          if (result && result.kind === 'unchanged') {
            // The server says nothing changed since our last
            // pull — the cached pull is still current.
            return (lastPulled.get(p.path) ?? []) as EngineMethodResult[M];
          }
          const diagnostics = mapDiagnostics(result?.items);
          lastPulled.set(p.path, diagnostics);
          return diagnostics as EngineMethodResult[M];
        }
        case 'textDocument/definition': {
          requireReady(client, method, params);
          const p = params as EngineMethodParams['textDocument/definition'];
          const raw = await client.request('textDocument/definition', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
          });
          // DefinitionLinks carry targetUris (file://) — the
          // contract's locations are paths, like the
          // in-process service's.
          return mapLocations(raw).map((loc) => ({
            uri: uriToPath(loc.uri),
            range: loc.range,
          })) as EngineMethodResult[M];
        }
        case 'textDocument/typeDefinition': {
          requireReady(client, method, params);
          const p =
            params as EngineMethodParams['textDocument/typeDefinition'];
          const raw = await client.request('textDocument/typeDefinition', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
          });
          return mapLocations(raw).map((loc) => ({
            uri: uriToPath(loc.uri),
            range: loc.range,
          })) as EngineMethodResult[M];
        }
        case 'textDocument/references': {
          requireReady(client, method, params);
          const p = params as EngineMethodParams['textDocument/references'];
          const raw = await client.request('textDocument/references', {
            textDocument: { uri: pathToUri(p.path) },
            position: p.position,
            context: { includeDeclaration: true },
          });
          return mapLocations(raw).map((loc) => ({
            uri: uriToPath(loc.uri),
            range: loc.range,
          })) as EngineMethodResult[M];
        }
        case 'textDocument/documentSymbol': {
          requireReady(client, method, params);
          const p =
            params as EngineMethodParams['textDocument/documentSymbol'];
          const raw = await client.request('textDocument/documentSymbol', {
            textDocument: { uri: pathToUri(p.path) },
          });
          return mapDocumentSymbols(raw) as EngineMethodResult[M];
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
      // installed: the server resolves to a real binary.
      const resolution = opts.resolution ?? resolveTs7Server();
      if (resolution.kind === 'missing') return 'uninstalled';
      // running: the server starts and answers initialize.
      const ready = await client.start();
      if (!ready) return 'not-running';
      // reachable: the live server answers with a version.
      return client.getServerVersion() !== null ? 'ready' : 'unreachable';
    },

    getOpenDocumentContent(filePath: string): string | null {
      return client.getOpenDocumentContent(filePath);
    },

    onDidPublishDiagnostics(
      listener: (uri: string, diagnostics: LspDiagnostic[]) => void,
    ): { dispose: () => void } {
      return client.onDidPublishDiagnostics(listener);
    },

    async dispose(): Promise<void> {
      await client.dispose();
    },
  };

  return transport;
}

/** The async typed API over the connector — the `EngineClient`
 *  surface, every method a Promise. */
export interface AsyncEngineClient {
  readonly transportName: string;
  isReady(): boolean;
  ensureReady(): Promise<boolean>;
  checkHealth(): Promise<EngineState>;
  getState(): EngineState;
  getEngineVersion(): string | null;
  getLastSuccessAt(): number | null;
  getLastError(): { at: number; message: string } | null;
  onDidFailRequest(listener: (error: Error) => void): { dispose: () => void };
  onDidPublishDiagnostics(
    listener: (uri: string, diagnostics: LspDiagnostic[]) => void,
  ): { dispose: () => void };

  openDocument(path: string, content: string): Promise<void>;
  changeDocument(path: string, content: string): Promise<void>;
  closeDocument(path: string): Promise<void>;
  dropDocumentsExcept(openPaths: Iterable<string>): Promise<void>;

  getCompletions(
    path: string,
    position: LspPosition,
  ): Promise<LspCompletionList | null>;
  resolveCompletion(
    path: string,
    item: LspCompletionItem,
  ): Promise<LspCompletionItem | null>;
  getHover(
    path: string,
    position: LspPosition,
  ): Promise<LspHover | null>;
  getSignatureHelp(
    path: string,
    position: LspPosition,
  ): Promise<LspSignatureHelp | null>;
  getDiagnostics(path: string): Promise<LspDiagnostic[]>;
  checkEdit(
    path: string,
    newContent: string,
  ): Promise<{ clean: boolean; diagnostics: LspDiagnostic[] }>;
  verifyIdentifier(
    path: string,
    name: string,
  ): Promise<{ kind: string; detail?: string } | null>;
  verifyIdentifiers(path: string, names: string[]): Promise<string[]>;
  getDefinition(
    path: string,
    position: LspPosition,
  ): Promise<LspLocation[]>;
  getTypeDefinition(
    path: string,
    position: LspPosition,
  ): Promise<LspLocation[]>;
  getReferences(
    path: string,
    position: LspPosition,
  ): Promise<LspLocation[]>;
  getDocumentSymbols(path: string): Promise<LspDocumentSymbol[]>;
  getSymbolReport(
    path: string,
    position: LspPosition,
    word: string,
  ): Promise<SymbolReport | null>;
  getStructureIdentifiers(
    path: string,
    lineNumber: number,
    column: number,
  ): string[];
  getPatterns(files: ReadonlyArray<PatternSourceFile>): CodePattern[];
  getPatternCompletions(
    files: ReadonlyArray<PatternSourceFile>,
    linePrefix: string,
    limit?: number,
  ): string[];
  /** Push diagnostics the server last published for a path. */
  getPublishedDiagnostics(path: string): LspDiagnostic[] | undefined;
  /** Stop the server behind this client. */
  dispose(): Promise<void>;
}

/** Build an async client over a transport (the TS 7 one by
 *  default — pass a fake for tests). */
export function createAsyncEngineClient(
  transport: AsyncEngineTransport = createTs7Transport(),
): AsyncEngineClient {
  const listeners = new Set<(error: Error) => void>();
  let lastState: EngineState = 'not-running';
  let lastSuccessAt: number | null = null;
  let lastError: { at: number; message: string } | null = null;
  // The client's own open-document contents — the editor's
  // text, as the client saw it. The compositions need the
  // original content to restore after checkEdit, and the
  // end-of-file position for verifyIdentifier.
  const documents = new Map<string, string>();
  // The last pushed diagnostics per path (from the
  // transport's publish subscription).
  const published = new Map<string, LspDiagnostic[]>();
  transport.onDidPublishDiagnostics((uri, diagnostics) => {
    published.set(uriToPath(uri), diagnostics);
  });

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
  const call = async <T>(empty: T, fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await fn();
      lastSuccessAt = Date.now();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = { at: Date.now(), message: err.message };
      emitFailure(err);
      return empty;
    }
  };

  const client: AsyncEngineClient = {
    transportName: transport.name,

    isReady(): boolean {
      try {
        return transport.isReady();
      } catch {
        return false;
      }
    },

    async ensureReady(): Promise<boolean> {
      const state = await client.checkHealth();
      return state === 'ready';
    },

    async checkHealth(): Promise<EngineState> {
      try {
        lastState = await transport.checkHealth();
        if (lastState === 'ready') lastSuccessAt = Date.now();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = { at: Date.now(), message: err.message };
        emitFailure(err);
        lastState = 'unreachable';
      }
      return lastState;
    },

    getState(): EngineState {
      return lastState;
    },

    getLastSuccessAt(): number | null {
      return lastSuccessAt;
    },

    getLastError(): { at: number; message: string } | null {
      return lastError;
    },

    getEngineVersion(): string | null {
      // A predicate over the transport, not an operation —
      // a down engine reports null, not a failure.
      try {
        return transport.getServerVersion();
      } catch {
        return null;
      }
    },

    onDidFailRequest(listener: (error: Error) => void): { dispose: () => void } {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },

    onDidPublishDiagnostics(
      listener: (uri: string, diagnostics: LspDiagnostic[]) => void,
    ): { dispose: () => void } {
      return transport.onDidPublishDiagnostics(listener);
    },

    async openDocument(path: string, content: string): Promise<void> {
      documents.set(path, content);
      await call(undefined, () =>
        transport.request('textDocument/didOpen', { path, content }),
      );
    },

    async changeDocument(path: string, content: string): Promise<void> {
      documents.set(path, content);
      await call(undefined, () =>
        transport.request('textDocument/didChange', { path, content }),
      );
    },

    async closeDocument(path: string): Promise<void> {
      documents.delete(path);
      await call(undefined, () =>
        transport.request('textDocument/didClose', { path }),
      );
    },

    async dropDocumentsExcept(openPaths: Iterable<string>): Promise<void> {
      const keep = new Set(openPaths);
      const dropped = [...documents.keys()].filter((p) => !keep.has(p));
      for (const path of dropped) documents.delete(path);
      await call(undefined, async () => {
        for (const path of dropped) {
          await transport.request('textDocument/didClose', { path });
        }
        return undefined;
      });
    },

    async getCompletions(
      path: string,
      position: LspPosition,
    ): Promise<LspCompletionList | null> {
      return call(null, () =>
        transport.request('textDocument/completion', { path, position }),
      );
    },

    async resolveCompletion(
      path: string,
      item: LspCompletionItem,
    ): Promise<LspCompletionItem | null> {
      return call(null, () =>
        transport.request('completionItem/resolve', { path, item }),
      );
    },

    async getHover(
      path: string,
      position: LspPosition,
    ): Promise<LspHover | null> {
      return call(null, () =>
        transport.request('textDocument/hover', { path, position }),
      );
    },

    async getSignatureHelp(
      path: string,
      position: LspPosition,
    ): Promise<LspSignatureHelp | null> {
      return call(null, () =>
        transport.request('textDocument/signatureHelp', { path, position }),
      );
    },

    async getDiagnostics(path: string): Promise<LspDiagnostic[]> {
      return call([], () =>
        transport.request('textDocument/publishDiagnostics', { path }),
      );
    },

    async checkEdit(
      path: string,
      newContent: string,
    ): Promise<{ clean: boolean; diagnostics: LspDiagnostic[] }> {
      // Composed over real transport calls (the header's
      // future slice): didChange(new) → pull diagnostics →
      // didChange(original). A document that was not open is
      // opened with the new content, checked, and closed.
      const original = documents.get(path) ?? null;
      const wasOpen = original !== null;
      return call({ clean: true, diagnostics: [] }, async () => {
        try {
          if (wasOpen) {
            await transport.request('textDocument/didChange', {
              path,
              content: newContent,
            });
          } else {
            await transport.request('textDocument/didOpen', {
              path,
              content: newContent,
            });
          }
          const diagnostics = await transport.request(
            'textDocument/publishDiagnostics',
            { path },
          );
          return { clean: diagnostics.length === 0, diagnostics };
        } finally {
          // Restore on any path — success, failure, or a
          // throw mid-check. The document must never be left
          // holding the unchecked content.
          try {
            if (wasOpen) {
              await transport.request('textDocument/didChange', {
                path,
                content: original as string,
              });
            } else {
              await transport.request('textDocument/didClose', { path });
            }
          } catch {
            // Already restored or gone — the next open
            // re-syncs it.
          }
        }
      });
    },

    async verifyIdentifier(
      path: string,
      name: string,
    ): Promise<{ kind: string; detail?: string } | null> {
      const content = documents.get(path);
      if (!content || !name) return null;
      return call(null, async () => {
        // The in-process rule, over the real server:
        // completions at the end of the file (top-level
        // scope); a name that appears there with a
        // non-keyword kind is defined or imported.
        const end: LspPosition = offsetToLsp(content, content.length);
        const list = await transport.request('textDocument/completion', {
          path,
          position: end,
        });
        for (const entry of list?.items ?? []) {
          if (entry.label !== name) continue;
          if (entry.kind === LspCompletionItemKind.Keyword) return null;
          // The kind is an LSP number here (3 = Function);
          // report the kind NAME ('Function'), the closest
          // the LSP has to the in-process service's 'function'.
          const kindName =
            (
              Object.entries(LspCompletionItemKind).find(
                ([, value]) => value === entry.kind,
              ) ?? []
            )[0] ?? String(entry.kind);
          return { kind: kindName, detail: entry.detail };
        }
        return null;
      });
    },

    async verifyIdentifiers(
      path: string,
      names: string[],
    ): Promise<string[]> {
      // Engine down: pass through unchanged (the ghost
      // degrades to tree-sitter, never goes silent) — the
      // same rule as the in-process client.
      if (!transport.isReady()) return names;
      const kept: string[] = [];
      for (const name of names) {
        if ((await client.verifyIdentifier(path, name)) !== null) {
          kept.push(name);
        }
      }
      return kept;
    },

    async getDefinition(
      path: string,
      position: LspPosition,
    ): Promise<LspLocation[]> {
      return call([], () =>
        transport.request('textDocument/definition', { path, position }),
      );
    },

    async getTypeDefinition(
      path: string,
      position: LspPosition,
    ): Promise<LspLocation[]> {
      return call([], () =>
        transport.request('textDocument/typeDefinition', { path, position }),
      );
    },

    async getReferences(
      path: string,
      position: LspPosition,
    ): Promise<LspLocation[]> {
      return call([], () =>
        transport.request('textDocument/references', { path, position }),
      );
    },

    async getDocumentSymbols(path: string): Promise<LspDocumentSymbol[]> {
      return call([], () =>
        transport.request('textDocument/documentSymbol', { path }),
      );
    },

    async getSymbolReport(
      path: string,
      position: LspPosition,
      word: string,
    ): Promise<SymbolReport | null> {
      // One cursor move, one report — no triple emission
      // when the engine is down.
      if (!client.isReady()) return null;
      const hover = await client.getHover(path, position);
      if (!hover) return null;
      return {
        identifier: word,
        hover,
        definition: await client.getDefinition(path, position),
        references: await client.getReferences(path, position),
      };
    },

    getStructureIdentifiers(
      path: string,
      lineNumber: number,
      column: number,
    ): string[] {
      try {
        return getIdentifiersAtPosition(path, lineNumber, column);
      } catch {
        return [];
      }
    },

    getPatterns(files: ReadonlyArray<PatternSourceFile>): CodePattern[] {
      try {
        return getPatternIndex().sync(files);
      } catch {
        return [];
      }
    },

    getPatternCompletions(
      files: ReadonlyArray<PatternSourceFile>,
      linePrefix: string,
      limit = 5,
    ): string[] {
      try {
        const index = getPatternIndex();
        index.sync(files);
        return index.match(linePrefix, limit).map((p) => p.text);
      } catch {
        return [];
      }
    },

    getPublishedDiagnostics(path: string): LspDiagnostic[] | undefined {
      return published.get(path);
    },

    async dispose(): Promise<void> {
      await transport.dispose();
    },
  };

  return client;
}

let sharedTs7Client: AsyncEngineClient | null = null;

/**
 * The shared async client — the only TS 7 engine surface the
 * UI, the composer and the agent loop will use, once the
 * main-process sidecar + IPC bridge lands. Created on first
 * use, over the real TS 7 transport. Node-host only: the
 * renderer cannot spawn, so nothing in renderer code may call
 * this until the bridge exists.
 */
export function getTs7EngineClient(): AsyncEngineClient {
  if (!sharedTs7Client) sharedTs7Client = createAsyncEngineClient();
  return sharedTs7Client;
}

/** Test seam: drop the shared client so the next
 *  `getTs7EngineClient()` builds a fresh one. */
export function resetTs7EngineClientForTests(): void {
  sharedTs7Client = null;
}
