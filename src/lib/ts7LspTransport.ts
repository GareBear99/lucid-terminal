/**
 * The TypeScript 7 native-LSP transport (Kite real transport —
 * 2026-11-15).
 *
 * The swap the `engineClient` header promised: a REAL transport
 * speaking TypeScript 7's own native LSP server, behind the same
 * `request(method, params)` surface and the same `TS_LSP_METHODS`
 * set. The in-process transport (`createInProcessTransport`) stays
 * the default and the fallback — this module does not replace it.
 *
 * HOSTING DECISION (recorded — the docs did not define this):
 *
 *   - Server: the native binary shipped by the `typescript@7.0.2`
 *     npm package — `tsc --lsp --stdio`. Verified live in this
 *     environment (2026-11-15): `initialize` answers
 *     `serverInfo: { name: 'typescript-go', version: '7.0.2' }`,
 *     hover / completion / resolve / definition / references /
 *     documentSymbol / signatureHelp all answer, and pull
 *     diagnostics (`textDocument/diagnostic`) returns the real
 *     2322. `--lsp` alone does NOT work (the server errors
 *     "only stdio is supported"); `--lsp --stdio` is the form.
 *   - Hosting: a CHILD PROCESS, spawned by a Node host — the
 *     Electron MAIN process in the app (the renderer has
 *     `nodeIntegration: false` and cannot spawn; see
 *     `electron/main.ts`). This module is pure Node
 *     (`node:child_process`, no Electron imports) so it runs in
 *     main AND in vitest (node env). The main↔renderer IPC
 *     bridge is NOT built here — that is the follow-on slice;
 *     until it lands, `getEngineClient()` stays in-process.
 *   - Entrypoint, in order: (1) the native binary resolved
 *     DIRECTLY from the platform package
 *     `@typescript/typescript-<platform>-<arch>/lib/tsc`
 *     (`darwin-x64` exists for Gary's Intel Mac, `darwin-arm64`
 *     and `linux-x64` too — all at 7.0.2 on npm), bypassing the
 *     JS wrapper; (2) the JS wrapper
 *     `node <typescript-7>/bin/tsc --lsp --stdio` as fallback
 *     (it execve's the binary on Node >= 22.15 and
 *     execFileSync's it otherwise — both inherit stdio, but the
 *     indirection is why it is second, not first).
 *     `LUCID_TS7_SERVER_PATH` overrides both, for debugging.
 *   - Local-only: stdio pipes to a local child, no socket, no
 *     network, no cloud. Documents live in the server's memory;
 *     nothing is persisted by the transport (guest-safe by
 *     construction, same as the in-process service).
 *
 * ASYNC, stated plainly: the sync `EngineTransport` interface
 * cannot be implemented over stdio JSON-RPC — a synchronous
 * `request()` would have to block the event loop waiting on a
 * pipe. The `engineClient` header already anticipates this
 * ("a future async transport would make the API async at that
 * point; the method set is what survives the swap"). So this
 * module speaks the same method/params/result shapes, but
 * async: `AsyncEngineTransport` in `ts7EngineClient.ts`. The
 * failure contract is unchanged (empty results, never throw
 * into the editor, one `did-fail-request` per failure).
 *
 * DIAGNOSTICS DEVIATION (measured, not assumed): TS 7.0.2
 * advertises `diagnosticProvider: { identifier: 'typescript',
 * interFileDependencies: true, workspaceDiagnostics: false }`
 * — diagnostics are PULL (`textDocument/diagnostic`), not
 * push. Across three live probes the server published exactly
 * one `publishDiagnostics` notification, and it was for the
 * `tsconfig.json` (empty), never for an open `.ts` file — not
 * on didOpen, didChange, or didSave, over ~17 s of waiting.
 * So `getDiagnostics` is implemented as a pull, and the push
 * subscription exists only to surface whatever the server
 * does push (config files today). `checkEdit` composes
 * didChange + PULL diagnostics, which is the header's
 * "didChange + publishDiagnostics" with the server's actual
 * diagnostics channel substituted — recorded here, not hidden.
 *
 * Server→client requests the transport answers (the server
 * blocks on these — an unanswered `client/registerCapability`
 * stalled the first probe's hover for 15 s): `workspace/
 * configuration` → one null per item (server defaults),
 * `client/registerCapability` / `client/unregisterCapability`
 * → null, `window/workDoneProgress/create` → null, anything
 * else → null. `workspace/applyEdit` → `{ applied: false }`
 * (the transport never asks the server for edits).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { EngineRequestError, EngineStateError } from './engineClient';
import {
  type LspCompletionItem,
  type LspCompletionList,
  type LspDiagnostic,
  type LspDocumentSymbol,
  type LspHover,
  type LspLocation,
  type LspSignatureHelp,
} from './tsLspContract';

/** How the TS 7 server is reached. */
export type Ts7ServerResolution =
  | {
      kind: 'native';
      /** Absolute path of the native binary. */
      binaryPath: string;
      command: string;
      args: string[];
    }
  | {
      kind: 'wrapper';
      /** Absolute path of the JS wrapper (`bin/tsc`). */
      wrapperPath: string;
      command: string;
      args: string[];
    }
  | { kind: 'missing'; reason: string };

/** The platform package name for this machine. */
export function ts7PlatformPackageName(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  return `@typescript/typescript-${platform}-${arch}`;
}

export interface ResolveTs7ServerOptions {
  /** Directory whose `node_modules` to resolve from (default:
   *  `process.cwd()`). Tests pass a fake tree here. */
  fromDir?: string;
  /** Environment to read `LUCID_TS7_SERVER_PATH` from. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the TS 7 server entrypoint. Order: explicit env
 * override → native binary from the platform package →
 * JS wrapper → missing. Never throws.
 */
export function resolveTs7Server(
  opts: ResolveTs7ServerOptions = {},
): Ts7ServerResolution {
  const env = opts.env ?? process.env;
  const override = env.LUCID_TS7_SERVER_PATH;
  if (override) {
    return existsSync(override)
      ? {
          kind: 'native',
          binaryPath: override,
          command: override,
          args: ['--lsp', '--stdio'],
        }
      : {
          kind: 'missing',
          reason: `LUCID_TS7_SERVER_PATH points at a missing file: ${override}`,
        };
  }
  const fromDir = opts.fromDir ?? process.cwd();
  const tryRequire = (spec: string): string | null => {
    try {
      const req = createRequire(path.join(fromDir, 'package.json'));
      return req.resolve(spec);
    } catch {
      return null;
    }
  };
  // Native binary first: <platform-pkg>/lib/tsc (+ .exe).
  const platformPkg = ts7PlatformPackageName();
  const platformPkgJson = tryRequire(`${platformPkg}/package.json`);
  if (platformPkgJson) {
    const exeName = process.platform === 'win32' ? 'tsc.exe' : 'tsc';
    const binaryPath = path.join(
      path.dirname(platformPkgJson),
      'lib',
      exeName,
    );
    if (existsSync(binaryPath)) {
      return {
        kind: 'native',
        binaryPath,
        command: binaryPath,
        args: ['--lsp', '--stdio'],
      };
    }
  }
  // JS wrapper fallback: node <typescript-7>/bin/tsc.
  const ts7PkgJson = tryRequire('typescript-7/package.json');
  if (ts7PkgJson) {
    const wrapperPath = path.join(
      path.dirname(ts7PkgJson),
      'bin',
      'tsc',
    );
    if (existsSync(wrapperPath)) {
      return {
        kind: 'wrapper',
        wrapperPath,
        command: process.execPath,
        args: [wrapperPath, '--lsp', '--stdio'],
      };
    }
  }
  return {
    kind: 'missing',
    reason:
      `No TypeScript 7 server found from ${fromDir}: ` +
      `looked for ${platformPkg}/lib/tsc and typescript-7/bin/tsc. ` +
      `Install typescript@7 (npm alias typescript-7) or set LUCID_TS7_SERVER_PATH.`,
  };
}

/** A raw LSP message body (JSON-RPC 2.0). */
export type LspMessage = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
};

/** A `textDocument/*` result straight from the server. */
export type RawLspResult = unknown;

export interface Ts7LspClientOptions {
  /** Explicit server entrypoint (tests / debugging). When
   *  absent, `resolveTs7Server()` runs at start time. */
  resolution?: Ts7ServerResolution;
  /** Workspace root the server is rooted at (default:
   *  `process.cwd()`). */
  rootPath?: string;
  /** Per-request timeout in ms (default 20000). */
  requestTimeoutMs?: number;
  /** `initialize` timeout in ms (default 30000 — first
   *  project load can be slow on a big tree). */
  initializeTimeoutMs?: number;
}

/** One open document, as the transport tracks it. */
export interface Ts7OpenDocument {
  content: string;
  version: number;
}

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_INITIALIZE_TIMEOUT_MS = 30000;

/** The client capabilities sent on `initialize` — the steal
 *  note's checklist (§2h): incremental sync, snippet support,
 *  `completionList.itemDefaults`, definition links,
 *  diagnostics support (push + pull). Only what this client
 *  implements is declared. */
export function ts7ClientCapabilities(): Record<string, unknown> {
  return {
    textDocument: {
      synchronization: { didSave: true },
      completion: {
        completionItem: {
          snippetSupport: true,
          documentationFormat: ['markdown', 'plaintext'],
          resolveSupport: {
            properties: ['documentation', 'detail', 'additionalTextEdits'],
          },
        },
      },
      hover: { contentFormat: ['markdown', 'plaintext'] },
      signatureHelp: {
        signatureInformation: { documentationFormat: ['markdown', 'plaintext'] },
      },
      publishDiagnostics: { relatedInformation: true, versionSupport: true },
      diagnostic: {},
      definition: { linkSupport: true },
      documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    },
    workspace: { configuration: true },
    general: { positionEncodings: ['utf-16'] },
  };
}

/** LSP `MarkupContent | string | undefined` → plain string. */
export function markupToString(
  content: unknown,
): string | undefined {
  if (content === undefined || content === null) return undefined;
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    const value = (content as { value?: unknown }).value;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** A file path (the engineClient surface) → a `file://` URI. */
export function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).href;
}

/** A `file://` URI → a file path. */
export function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

/** Map a raw hover result to the contract shape. A plaintext
 *  hover is wrapped in the same fenced code block the
 *  in-process service produces, so callers see one shape. */
export function mapHover(result: RawLspResult): LspHover | null {
  if (!result || typeof result !== 'object') return null;
  const contents = (result as { contents?: unknown }).contents;
  const range = (result as { range?: LspHover['range'] }).range;
  if (contents === undefined || contents === null) return null;
  if (typeof contents === 'string') {
    return { contents: contents, range };
  }
  if (Array.isArray(contents)) {
    const text = contents
      .map((c) => markupToString(c) ?? '')
      .filter(Boolean)
      .join('\n\n');
    return text ? { contents: text, range } : null;
  }
  const kind = (contents as { kind?: string }).kind;
  const value = markupToString(contents);
  if (value === undefined) return null;
  if (kind === 'plaintext') {
    return {
      contents: `\`\`\`typescript\n${value}\n\`\`\``,
      range,
    };
  }
  return { contents: value, range };
}

/** Map a raw completion list to the contract shape. `items`
 *  may be a bare array (some servers) or a CompletionList. */
export function mapCompletionList(
  result: RawLspResult,
  onItem?: (raw: any) => string | undefined,
): LspCompletionList | null {
  if (result === null || result === undefined) return null;
  const list = Array.isArray(result)
    ? { items: result, isIncomplete: false }
    : (result as { items?: any[]; isIncomplete?: boolean });
  if (!Array.isArray(list.items)) return null;
  const items: LspCompletionItem[] = [];
  for (const raw of list.items) {
    if (!raw || typeof raw !== 'object') continue;
    const label =
      typeof raw.label === 'string'
        ? raw.label
        : typeof raw.label?.label === 'string'
          ? raw.label.label
          : null;
    if (label === null) continue;
    const item: LspCompletionItem = {
      label,
      kind:
        typeof raw.kind === 'number'
          ? (raw.kind as LspCompletionItem['kind'])
          : 10, // Property — the contract's default kind.
      detail:
        typeof raw.detail === 'string' ? raw.detail : undefined,
      documentation: markupToString(raw.documentation),
      sortText:
        typeof raw.sortText === 'string' ? raw.sortText : undefined,
      resolveKey: onItem ? onItem(raw) : undefined,
    };
    if (raw.textEdit && typeof raw.textEdit === 'object') {
      const edit = raw.textEdit;
      const range = edit.range ?? edit.replace?.range ?? edit.insert?.range;
      if (range) item.range = range;
    }
    items.push(item);
  }
  return { isIncomplete: !!list.isIncomplete, items };
}

/** Map a raw resolved completion item (detail + docs +
 *  auto-import edits) onto the contract item. */
export function mapResolvedCompletionItem(
  result: RawLspResult,
  item: LspCompletionItem,
): LspCompletionItem | null {
  if (!result || typeof result !== 'object') return item;
  const raw = result as Record<string, unknown>;
  const resolved: LspCompletionItem = { ...item };
  if (typeof raw.detail === 'string' && raw.detail) {
    resolved.detail = raw.detail;
  }
  const docs = markupToString(raw.documentation);
  if (docs !== undefined) resolved.documentation = docs;
  // LSP additionalTextEdits are always for the current file
  // (unlike tsserver codeActions, which can name other files)
  // — no file filtering is needed, or possible.
  if (Array.isArray(raw.additionalTextEdits)) {
    const edits = (raw.additionalTextEdits as any[])
      .filter((e) => e && e.range && typeof e.newText === 'string')
      .map((e) => ({ range: e.range, newText: e.newText }));
    if (edits.length > 0) resolved.additionalTextEdits = edits;
  }
  return resolved;
}

/** Map a raw definition / references / typeDefinition result
 *  to locations. Accepts a single Location, a Location[], a
 *  DefinitionLink[] (targetUri + targetSelectionRange), or
 *  null. */
export function mapLocations(result: RawLspResult): LspLocation[] {
  if (result === null || result === undefined) return [];
  const entries = Array.isArray(result) ? result : [result];
  const out: LspLocation[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (
      typeof (entry as { targetUri?: unknown }).targetUri === 'string'
    ) {
      // DefinitionLink.
      const link = entry as {
        targetUri: string;
        targetSelectionRange?: LspRange;
        targetRange?: LspRange;
      };
      const range = link.targetSelectionRange ?? link.targetRange;
      if (range) out.push({ uri: link.targetUri, range });
      continue;
    }
    if (typeof (entry as { uri?: unknown }).uri === 'string') {
      const loc = entry as { uri: string; range: LspLocation['range'] };
      if (loc.range) out.push({ uri: loc.uri, range: loc.range });
    }
  }
  return out;
}

/** Map a raw documentSymbol result to the contract shape.
 *  Accepts hierarchical DocumentSymbol[] (selectionRange)
 *  AND flat SymbolInformation[] (location) — TS 7.0.2
 *  returns the flat form. */
export function mapDocumentSymbols(
  result: RawLspResult,
): LspDocumentSymbol[] {
  if (!Array.isArray(result)) return [];
  const out: LspDocumentSymbol[] = [];
  const convert = (node: any): LspDocumentSymbol | null => {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.name !== 'string') return null;
    if (node.location && typeof node.location === 'object') {
      // SymbolInformation (flat).
      const range = node.location.range;
      if (!range) return null;
      return {
        name: node.name,
        kind:
          typeof node.kind === 'number'
            ? (node.kind as LspDocumentSymbol['kind'])
            : 10,
        range,
        selectionRange: range,
      };
    }
    if (!node.range || !node.selectionRange) return null;
    const children: LspDocumentSymbol[] = [];
    for (const child of node.children ?? []) {
      const translated = convert(child);
      if (translated) children.push(translated);
    }
    return {
      name: node.name,
      kind:
        typeof node.kind === 'number'
          ? (node.kind as LspDocumentSymbol['kind'])
          : 10,
      range: node.range,
      selectionRange: node.selectionRange,
      children: children.length > 0 ? children : undefined,
    };
  };
  for (const node of result) {
    const translated = convert(node);
    if (translated) out.push(translated);
  }
  return out;
}

/** Map a raw signatureHelp result to the contract shape. */
export function mapSignatureHelp(
  result: RawLspResult,
): LspSignatureHelp | null {
  if (!result || typeof result !== 'object') return null;
  const raw = result as {
    signatures?: any[];
    activeSignature?: number;
    activeParameter?: number;
  };
  if (!Array.isArray(raw.signatures) || raw.signatures.length === 0) {
    return null;
  }
  return {
    signatures: raw.signatures.map((sig) => ({
      label: typeof sig.label === 'string' ? sig.label : '',
      documentation: markupToString(sig.documentation),
      parameters: (sig.parameters ?? []).map((param: any) => {
        const label = param?.label;
        return {
          label:
            typeof label === 'string'
              ? label
              : Array.isArray(label) && label.length === 2
                ? sig.label?.slice(label[0], label[1]) ?? ''
                : typeof label === 'number'
                  ? String(label)
                  : '',
          documentation: markupToString(param?.documentation),
        };
      }),
    })),
    activeSignature: raw.activeSignature ?? 0,
    activeParameter: raw.activeParameter ?? 0,
  };
}

/** Map raw pull-diagnostic items to the contract shape.
 *  `code` may arrive as a string — the contract wants a
 *  number, so parse it (0 when unparseable). `source` is
 *  forced to 'ts', matching the in-process service. */
export function mapDiagnostics(items: unknown): LspDiagnostic[] {
  if (!Array.isArray(items)) return [];
  const out: LspDiagnostic[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as {
      range?: LspDiagnostic['range'];
      severity?: number;
      code?: number | string;
      message?: string;
    };
    if (!item.range || typeof item.message !== 'string') continue;
    const code =
      typeof item.code === 'number'
        ? item.code
        : typeof item.code === 'string'
          ? Number.parseInt(item.code, 10) || 0
          : 0;
    out.push({
      range: item.range,
      severity: (item.severity ?? 1) as LspDiagnostic['severity'],
      code,
      source: 'ts',
      message: item.message,
    });
  }
  return out;
}

type LspRange = LspLocation['range'];

/**
 * The JSON-RPC client over stdio to one TS 7 server process.
 * Owns the process, the initialize handshake, the open
 * documents (content + version), the pending-request map, and
 * the publishDiagnostics cache. Local only — stdio pipes to
 * a local child, no socket, no network.
 */
export class Ts7LspClient {
  private readonly resolution: Ts7ServerResolution | undefined;
  private readonly rootPath: string;
  private readonly requestTimeoutMs: number;
  private readonly initializeTimeoutMs: number;
  private child: ChildProcess | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = Buffer.alloc(0);
  private started = false;
  private startPromise: Promise<boolean> | null = null;
  private serverVersion: string | null = null;
  private readonly documents = new Map<string, Ts7OpenDocument>();
  /** Documents the CURRENT server generation has open.
   *  Cleared on crash/exit — a fresh server has seen
   *  nothing, so a restart re-sends every tracked document. */
  private readonly serverKnows = new Set<string>();
  private readonly published = new Map<string, LspDiagnostic[]>();
  private readonly publishListeners = new Set<
    (uri: string, diagnostics: LspDiagnostic[]) => void
  >();
  private readonly exitListeners = new Set<(code: number | null) => void>();
  private readonly bufferedNotifications: LspMessage[] = [];
  private lastStderr = '';
  private lastError: { at: number; message: string } | null = null;
  private resolutionMissing = false;

  constructor(opts: Ts7LspClientOptions = {}) {
    this.resolution = opts.resolution;
    this.rootPath = opts.rootPath ?? process.cwd();
    this.requestTimeoutMs =
      opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.initializeTimeoutMs =
      opts.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS;
  }

  /** True once `initialize` has answered. */
  isReady(): boolean {
    return this.started;
  }

  /** The server's version (`7.0.2`), or null before init. */
  getServerVersion(): string | null {
    return this.serverVersion;
  }

  /** The last recorded failure, or null. */
  getLastError(): { at: number; message: string } | null {
    return this.lastError;
  }

  /** The server's recent stderr (bounded), for diagnosis. */
  getLastStderr(): string {
    return this.lastStderr;
  }

  /** The open documents this client tracks (path → content). */
  getOpenDocumentContent(filePath: string): string | null {
    return this.documents.get(filePath)?.content ?? null;
  }

  /** The last pushed diagnostics for a URI, if any arrived. */
  getPublishedDiagnostics(uri: string): LspDiagnostic[] | undefined {
    return this.published.get(uri);
  }

  onDidPublishDiagnostics(
    listener: (uri: string, diagnostics: LspDiagnostic[]) => void,
  ): { dispose: () => void } {
    this.publishListeners.add(listener);
    return { dispose: () => this.publishListeners.delete(listener) };
  }

  onDidExit(listener: (code: number | null) => void): {
    dispose: () => void;
  } {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  /**
   * Start the server (spawn + initialize + initialized).
   * Idempotent; a failed start is retried on the next call
   * (the promise is cleared on failure, like `ensureTsLsp`).
   * Returns true when the server answered `initialize`.
   */
  async start(): Promise<boolean> {
    if (this.started) return true;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInner();
    const ok = await this.startPromise;
    if (!ok) this.startPromise = null;
    return ok;
  }

  private async startInner(): Promise<boolean> {
    const resolution = this.resolution ?? resolveTs7Server();
    if (resolution.kind === 'missing') {
      this.resolutionMissing = true;
      this.recordError(`TypeScript 7 server not found: ${resolution.reason}`);
      return false;
    }
    this.resolutionMissing = false;
    let child: ChildProcess;
    try {
      child = spawn(resolution.command, resolution.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      this.recordError(
        `Failed to spawn the TypeScript 7 server: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
    this.child = child;
    const spawnFailed = await new Promise<boolean>((resolve) => {
      const onError = (error: Error) => {
        this.recordError(
          `TypeScript 7 server spawn error: ${error.message}`,
        );
        resolve(true);
      };
      child.once('error', onError);
      // Give the process a tick to fail fast (ENOENT); a
      // healthy server stays alive and answers initialize.
      setTimeout(() => {
        child.off('error', onError);
        resolve(false);
      }, 250);
    });
    if (spawnFailed || child.exitCode !== null) {
      this.disposeChild();
      return false;
    }
    child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk));
    child.stderr?.on('data', (chunk: Buffer) => {
      this.lastStderr = `${this.lastStderr}${chunk.toString()}`.slice(-4000);
    });
    child.on('exit', (code) => {
      // Generation guard: an old server's exit must not tear
      // down its replacement (a kill followed by an immediate
      // restart races the old process's exit event).
      if (this.child !== child) return;
      const wasReady = this.started;
      this.started = false;
      this.startPromise = null;
      this.serverVersion = null;
      this.child = null;
      this.serverKnows.clear();
      this.failPending(
        new Error(`TypeScript 7 server exited (code ${code})`),
      );
      if (wasReady) {
        for (const listener of [...this.exitListeners]) {
          try {
            listener(code);
          } catch {
            // A failing listener must never break teardown.
          }
        }
      }
    });
    try {
      const result = await this.requestRaw(
        'initialize',
        {
          processId: process.pid,
          rootUri: pathToFileURL(this.rootPath).href,
          capabilities: ts7ClientCapabilities(),
          workspaceFolders: [
            {
              uri: pathToFileURL(this.rootPath).href,
              name: path.basename(this.rootPath) || 'workspace',
            },
          ],
        },
        this.initializeTimeoutMs,
      );
      const info = (result as { serverInfo?: { version?: string } } | null)
        ?.serverInfo;
      this.serverVersion =
        typeof info?.version === 'string' ? info.version : null;
      // `initialized` goes out DIRECTLY (not via notify — the
      // client is not started yet, so notify would buffer it
      // behind the pre-start didOpens and the server would see
      // documents before `initialized`).
      this.sendRaw({ jsonrpc: '2.0', method: 'initialized', params: {} });
      this.started = true;
      // A (re)start is a fresh server generation: it has seen
      // no documents. Re-send every tracked document (the
      // crash case), then flush the buffered notifications
      // minus the doc-sync ones — the re-send subsumes every
      // buffered didOpen/didChange (same content), and a
      // buffered didClose names a document the fresh server
      // never saw.
      this.serverKnows.clear();
      for (const [filePath, doc] of this.documents) {
        this.sendRaw({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: {
            textDocument: {
              uri: pathToUri(filePath),
              languageId:
                filePath.endsWith('.js') || filePath.endsWith('.jsx')
                  ? 'javascript'
                  : 'typescript',
              version: doc.version,
              text: doc.content,
            },
          },
        });
        this.serverKnows.add(filePath);
      }
      const buffered = [...this.bufferedNotifications];
      this.bufferedNotifications.length = 0;
      for (const msg of buffered) {
        if (
          msg.method === 'textDocument/didOpen' ||
          msg.method === 'textDocument/didChange' ||
          msg.method === 'textDocument/didClose'
        ) {
          continue;
        }
        this.sendRaw(msg);
      }
      return true;
    } catch (error) {
      this.recordError(
        error instanceof Error ? error.message : String(error),
      );
      this.disposeChild();
      return false;
    }
  }

  private disposeChild(): void {
    const child = this.child;
    this.child = null;
    this.started = false;
    this.serverVersion = null;
    this.serverKnows.clear();
    if (child) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }

  private recordError(message: string): void {
    this.lastError = { at: Date.now(), message };
  }

  private failPending(error: Error): void {
    for (const [, pending] of [...this.pending]) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /** One JSON-RPC request; throws on timeout, server error,
   *  or a dead/unstarted server. */
  async request(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    if (!this.started) {
      const ok = await this.start();
      if (!ok) {
        throw new EngineStateError('The TypeScript 7 server is not running', {
          state: this.resolutionMissing ? 'uninstalled' : 'not-running',
          request: { method, params },
        });
      }
    }
    return this.requestRaw(method, params, timeoutMs);
  }

  private requestRaw(
    method: string,
    params: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    const child = this.child;
    if (!child || !child.stdin) {
      return Promise.reject(
        new EngineStateError('The TypeScript 7 server is not running', {
          state: 'not-running',
          request: { method, params },
        }),
      );
    }
    const timeout = timeoutMs ?? this.requestTimeoutMs;
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new EngineRequestError(
            'engine_error',
            `TypeScript 7 server request timed out: ${method}`,
            { request: { method, params } },
          ),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.sendRaw(
          params === undefined
            ? { jsonrpc: '2.0', id, method }
            : { jsonrpc: '2.0', id, method, params },
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** One JSON-RPC notification. Accepted before the engine
   *  is up — buffered and flushed on start, per the
   *  engineClient contract. Never throws. */
  notify(method: string, params?: unknown): void {
    const msg: LspMessage =
      params === undefined
        ? { jsonrpc: '2.0', method }
        : { jsonrpc: '2.0', method, params };
    if (!this.started) {
      this.bufferedNotifications.push(msg);
      return;
    }
    try {
      this.sendRaw(msg);
    } catch {
      // A failed notification is swallowed — notifications
      // never fail, per the contract.
    }
  }

  private sendRaw(msg: LspMessage): void {
    const child = this.child;
    if (!child || !child.stdin) {
      throw new Error('TypeScript 7 server stdin is not available');
    }
    const body = JSON.stringify(msg);
    child.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  }

  // -- Document sync (tracked here so didChange carries the
  //    right version and checkEdit can restore) ------------

  openDocument(filePath: string, content: string): void {
    const existing = this.documents.get(filePath);
    const version = (existing?.version ?? 0) + 1;
    this.documents.set(filePath, { content, version });
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: pathToUri(filePath),
        languageId: filePath.endsWith('.js') || filePath.endsWith('.jsx')
          ? 'javascript'
          : 'typescript',
        version,
        text: content,
      },
    });
    if (this.started) this.serverKnows.add(filePath);
  }

  changeDocument(filePath: string, content: string): void {
    const existing = this.documents.get(filePath);
    if (existing && existing.content === content) return;
    if (!existing) {
      // A change for a document the server never saw is an
      // open, not a loss: the editor edits open documents,
      // and dropping the change would leave the server
      // answering from stale (or no) text.
      this.openDocument(filePath, content);
      return;
    }
    const version = existing.version + 1;
    this.documents.set(filePath, { content, version });
    this.notify('textDocument/didChange', {
      textDocument: { uri: pathToUri(filePath), version },
      contentChanges: [{ text: content }],
    });
    if (this.started) this.serverKnows.add(filePath);
  }

  closeDocument(filePath: string): void {
    if (!this.documents.has(filePath)) return;
    this.documents.delete(filePath);
    this.notify('textDocument/didClose', {
      textDocument: { uri: pathToUri(filePath) },
    });
    if (this.started) this.serverKnows.delete(filePath);
  }

  dropDocumentsExcept(openPaths: Iterable<string>): void {
    const keep = new Set(openPaths);
    for (const filePath of [...this.documents.keys()]) {
      if (!keep.has(filePath)) this.closeDocument(filePath);
    }
  }

  // -- Incoming frames --------------------------------------

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        // Unframed output — drop the header line and continue.
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      if (this.buffer.length < headerEnd + 4 + length) break;
      const body = this.buffer
        .subarray(headerEnd + 4, headerEnd + 4 + length)
        .toString('utf8');
      this.buffer = this.buffer.subarray(headerEnd + 4 + length);
      let msg: LspMessage;
      try {
        msg = JSON.parse(body) as LspMessage;
      } catch {
        continue;
      }
      this.onMessage(msg);
    }
  }

  private onMessage(msg: LspMessage): void {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id as number);
      if (!pending) return;
      this.pending.delete(msg.id as number);
      clearTimeout(pending.timer);
      if (msg.error) {
        pending.reject(
          new EngineRequestError(
            'engine_error',
            `TypeScript 7 server error: ${msg.error.message}`,
            { request: { id: msg.id } },
          ),
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (typeof msg.method !== 'string') return;
    if (msg.id !== undefined) {
      // A server→client request: answer it, or the server
      // blocks waiting (an unanswered registerCapability
      // stalled hover for 15 s in the first live probe).
      this.answerServerRequest(msg);
      return;
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      const params = (msg.params ?? {}) as {
        uri?: string;
        diagnostics?: unknown;
      };
      if (typeof params.uri === 'string') {
        const diagnostics = mapDiagnostics(params.diagnostics);
        this.published.set(params.uri, diagnostics);
        for (const listener of [...this.publishListeners]) {
          try {
            listener(params.uri, diagnostics);
          } catch {
            // A failing listener must never break the server
            // read loop.
          }
        }
      }
      return;
    }
    // window/logMessage, $/cancelRequest, progress — ignored.
  }

  private answerServerRequest(msg: LspMessage): void {
    let result: unknown = null;
    if (msg.method === 'workspace/configuration') {
      const items = (msg.params as { items?: unknown[] } | undefined)?.items;
      result = Array.isArray(items) ? items.map(() => null) : [];
    } else if (msg.method === 'workspace/applyEdit') {
      result = { applied: false };
    }
    try {
      this.sendRaw({ jsonrpc: '2.0', id: msg.id, result });
    } catch {
      // The server is gone; there is nobody to answer.
    }
  }

  /**
   * Test seam: kill the server process WITHOUT a graceful
   * shutdown, simulating a crash. The next query must fail
   * (empty states) and the next health check must restart
   * it. Never used outside tests.
   */
  terminateForTests(): void {
    const child = this.child;
    this.child = null;
    this.started = false;
    this.startPromise = null;
    this.serverVersion = null;
    this.serverKnows.clear();
    this.failPending(new Error('TypeScript 7 server terminated'));
    if (child) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }

  /**
   * Stop the server: `shutdown` (no params — the server
   * rejects `shutdown` with `null` params as InvalidParams),
   * then `exit`, then SIGKILL after a grace period.
   */
  async dispose(): Promise<void> {
    const child = this.child;
    this.started = false;
    this.startPromise = null;
    this.failPending(new Error('TypeScript 7 server disposed'));
    if (!child) return;
    this.child = null;
    // `shutdown` is sent on the local child handle (not via
    // requestRaw — this.child is already null) and takes NO
    // params: the server rejects `shutdown` with `null`
    // params as InvalidParams.
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: ++this.nextId, method: 'shutdown' });
      child.stdin?.write(
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        child.stdout?.once('data', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } catch {
      // Already dead or refusing — kill below.
    }
    try {
      this.sendRaw({ jsonrpc: '2.0', method: 'exit' });
    } catch {
      // Gone.
    }
    const exited = await new Promise<boolean>((resolve) => {
      if (child.exitCode !== null) return resolve(true);
      const timer = setTimeout(() => resolve(false), 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!exited) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
}
