/**
 * The built-in tools — the registry's first population
 * (steal #4 — Continue, 2026-11-14).
 *
 * The set mirrors Continue's `getBaseToolDefinitions()`
 * (`core/tools/index.ts` — 9 always-on tools), adapted to
 * Lucid: read_file, create_new_file, run_terminal_command,
 * glob_search, view_diff, read_currently_open_file, ls,
 * create_rule_block, fetch_url_content. What lands here:
 * read_file, create_new_file, file_glob_search (glob),
 * read_currently_open_file, ls — plus the three the
 * earlier slices built hooks for: grep_search,
 * codebase_search (the index), find_symbol /
 * go_to_definition / find_references (the TS-LSP
 * definition/reference/symbol getters), and multi_edit
 * (Continue's atomic edit primitive).
 *
 * Deliberately NOT here (owed, with reasons):
 * - run_terminal_command — the terminal tool needs the
 *   terminal-security shape (Continue's
 *   `packages/terminal-security/` — shell parsing, privilege
 *   escalation, chaining) + a policy Gary has not set.
 *   A shell tool without that shape is a hole, not a tool.
 * - create_rule_block / request_rule — writes rules to
 *   disk; the rules engine is later work, and guest must
 *   never use them.
 * - fetch_url_content / search_web — network. The loop is
 *   local only.
 * - delete / rename — destructive; they land with the
 *   review UI (Zed #6), not before.
 *
 * Landed in the Aider slice (#5, 2026-11-14): view_diff
 * (the `git diff` runner in main — electron/ipc/git.ts —
 * the renderer only parses git output, it never runs git)
 * and fix_diagnostics (the verify loop — agentVerify.ts).
 *
 * Every tool runs through the host (agentHost.ts), never
 * through IPC or stores directly — so the loop core stays
 * host-agnostic and the tools stay testable against the
 * in-memory host. Edit tools run the TS-LSP `checkEdit`
 * pre-flight (the hook the TS-LSP slice built for exactly
 * this): the edit is checked before it lands, the
 * diagnostics ride in the result, and the edit still
 * lands — the user asked for it. Reflecting on those
 * diagnostics is the Aider slice (#5): the loop calls
 * `fix_diagnostics` after any edit that leaves
 * diagnostics behind, and the tool's result is marked
 * `verified: true` so the loop never reflects twice.
 * When the engine is unavailable the check is skipped
 * and the result says so (`diagnosticsChecked: false`) —
 * never a faked "clean".
 */

import type {
  AgentToolContext,
  AgentToolDefinition,
  AgentToolResult,
  ToolRegistry,
} from './agentTools';
import { executeMultiEdit, EditError, type EditOperation } from './agentMultiEdit';
import { isWithinWorkspace, resolveAgentPath } from './agentHost';
import { makeLspVerifyDeps, verifyContent } from './agentVerify';
import { getEngineClient } from './engineClient';

/** How much of a diff the tool returns (the loop's reply
 *  cap is 2,000 chars — the diff itself is capped here so
 *  the brain still sees a useful slice on a re-plan). */
const MAX_DIFF_CHARS = 20_000;

/** Continue's readFileLimit: refuse a file over half the
 *  context window. The window here is the agent's working
 *  context — 200k chars is the cap, and the refusal names
 *  the alternative (grep for the part you need). */
const MAX_READ_CHARS = 200_000;
/** Grep scans at most this many files / bytes per call. */
const MAX_GREP_FILES = 300;
const MAX_GREP_BYTES = 5_000_000;
const MAX_GREP_MATCHES = 50;

function isCodeFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mts|cts)$/i.test(path);
}

/**
 * Resolve a path argument the way the host does, and
 * refuse anything outside the workspace (the gate checks
 * this too — defense in depth: the tool never trusts the
 * gate alone).
 */
function resolveToolPath(
  value: unknown,
  ctx: AgentToolContext,
): { path: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'a file path is required' };
  }
  const path = resolveAgentPath(value, ctx.cwd, ctx.workspaceRoot);
  if (!isWithinWorkspace(ctx.workspaceRoot, path)) {
    return { error: `Denied path: ${value} is outside the workspace` };
  }
  return { path };
}

/** The open file's content when the file is open in the
 *  editor (edits-in-progress included), else null. */
function openContent(ctx: AgentToolContext, path: string): string | null {
  const open = ctx.host.getOpenFiles().find((f) => f.path === path);
  return open ? open.content : null;
}

/** One diagnostic, in the loop's own shape. */
export interface LspDiagnosticInfo {
  path: string;
  line: number;
  message: string;
  code?: string | number;
}

/** Lazily load the TS-LSP engine (dynamic import — the
 *  tools module never pulls the compiler in statically)
 *  and return the diagnostics helpers, or null when the
 *  engine is unavailable. The loop never blocks on this:
 *  a dead engine means "diagnostics unavailable", never
 *  an error in the user's face (Kite's contract). */
async function lspFor(path: string, content: string): Promise<{
  checked: boolean;
  diagnostics: LspDiagnosticInfo[];
  checkEdit: (newContent: string) => { clean: boolean; diagnostics: LspDiagnosticInfo[] };
} | null> {
  if (!isCodeFile(path)) return null;
  try {
    const client = getEngineClient();
    const ready = await client.ensureReady();
    if (!ready) return null;
    client.openDocument(path, content);
    return {
      checked: true,
      diagnostics: client.getDiagnostics(path).map((d) => ({
        path,
        line: d.range.start.line + 1,
        message: d.message,
        code: d.code,
      })),
      checkEdit: (newContent: string) => {
        const result = client.checkEdit(path, newContent);
        return {
          clean: result.clean,
          diagnostics: result.diagnostics.map((d) => ({
            path,
            line: d.range.start.line + 1,
            message: d.message,
            code: d.code,
          })),
        };
      },
    };
  } catch {
    return null;
  }
}

function formatDiagnostics(diagnostics: LspDiagnosticInfo[]): string {  if (diagnostics.length === 0) return 'Diagnostics: clean.';
  const shown = diagnostics.slice(0, 5);
  const lines = shown.map(
    (d) => `  ${d.path}:${d.line}: ${d.message}${d.code !== undefined ? ` (${d.code})` : ''}`,
  );
  const more = diagnostics.length > 5 ? `\n  …and ${diagnostics.length - 5} more` : '';
  return `Diagnostics (${diagnostics.length}):\n${lines.join('\n')}${more}`;
}

/**
 * The index-backed tools (glob, grep, codebase, symbol)
 * need a built index — the loop builds it at turn start,
 * but a direct call must not silently answer "nothing
 * matches" from an empty index. An unbuilt index is an
 * error, not an empty result.
 */
function requireIndex(ctx: AgentToolContext): { error: string } | null {
  return ctx.index.isBuilt ? null : { error: 'The workspace index is not built yet.' };
}

function tool(
  name: string,
  description: string,
  displayTitle: string,
  wouldLikeTo: string,
  isCurrently: string,
  hasAlready: string,
  readonly: boolean,
  defaultPolicy: AgentToolDefinition['defaultPolicy'],
  required: string[],
  properties: AgentToolDefinition['function']['parameters']['properties'],
): AgentToolDefinition {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', required, properties } },
    displayTitle,
    wouldLikeTo,
    isCurrently,
    hasAlready,
    readonly,
    isInstant: readonly,
    group: 'built-in',
    defaultPolicy,
  };
}

const FILEPATH_PROP = {
  filepath: { type: 'string', description: 'The path of the file, relative to the workspace root or absolute.' },
};

async function readFileImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
  if (content === null) {
    return { ok: false, output: '', error: `Could not read file: ${path}` };
  }
  if (content.length > MAX_READ_CHARS) {
    return {
      ok: false,
      output: '',
      error: `File ${path} is ${content.length} chars (over the ${MAX_READ_CHARS} cap). Use grep_search for the part you need.`,
    };
  }
  // The fact-checker's line: when the engine has the file,
  // the read carries its diagnostics — "fix the build"
  // starts from what is broken, not from a re-read.
  const lsp = await lspFor(path, content);
  const diagnosticsPart = lsp && lsp.diagnostics.length > 0 ? `\n${formatDiagnostics(lsp.diagnostics)}` : '';
  return {
    ok: true,
    output: `${path} (${content.split('\n').length} lines):\n${content}${diagnosticsPart}`,
    diagnosticsChecked: lsp?.checked ?? false,
    diagnostics: lsp?.diagnostics,
  };
}

async function readCurrentlyOpenFileImpl(
  _args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const active = ctx.host.getActiveFilePath();
  if (!active) return { ok: false, output: '', error: 'No file is open in the editor.' };
  return readFileImpl({ filepath: active }, ctx);
}

async function lsImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const dirArg = typeof args.dirPath === 'string' && args.dirPath ? args.dirPath : '.';
  const resolved = resolveToolPath(dirArg, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  let entries;
  try {
    entries = await ctx.host.readDir(path);
  } catch {
    return { ok: false, output: '', error: `Could not list directory: ${path}` };
  }
  const lines = entries.map((e) => `${e.name}${e.isDirectory ? '/' : ''}`);
  return { ok: true, output: `${path}:\n${lines.join('\n') || '(empty)'}` };
}

async function globSearchImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const pattern = args.pattern;
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return { ok: false, output: '', error: 'a glob pattern is required' };
  }
  const indexError = requireIndex(ctx);
  if (indexError) return { ok: false, output: '', error: indexError.error };
  const paths = ctx.index.glob(pattern);
  if (paths.length === 0) {
    return { ok: true, output: `No files match "${pattern}".` };
  }
  const shown = paths.slice(0, 100);
  const more = paths.length > 100 ? `\n…and ${paths.length - 100} more` : '';
  return { ok: true, output: `${paths.length} file(s) match "${pattern}":\n${shown.join('\n')}${more}` };
}

async function grepSearchImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const pattern = args.pattern;
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return { ok: false, output: '', error: 'a search pattern is required' };
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, args.caseSensitive === true ? '' : 'i');
  } catch {
    return { ok: false, output: '', error: `Invalid search pattern: ${pattern}` };
  }
  let files: string[];
  if (typeof args.filepath === 'string' && args.filepath) {
    const resolved = resolveToolPath(args.filepath, ctx);
    if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
    files = [resolved.path];
  } else {
    const indexError = requireIndex(ctx);
    if (indexError) return { ok: false, output: '', error: indexError.error };
    files = ctx.index.getFilePaths().slice(0, MAX_GREP_FILES);
  }
  const matches: string[] = [];
  let scannedBytes = 0;
  for (const path of files) {
    if (matches.length >= MAX_GREP_MATCHES || scannedBytes >= MAX_GREP_BYTES) break;
    const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
    if (content === null) continue;
    scannedBytes += content.length;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(`${path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        if (matches.length >= MAX_GREP_MATCHES) break;
      }
    }
  }
  if (matches.length === 0) {
    return { ok: true, output: `No matches for /${pattern}/.` };
  }
  return { ok: true, output: `${matches.length} match(es) for /${pattern}/:\n${matches.join('\n')}` };
}

async function codebaseSearchImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const query = args.query;
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, output: '', error: 'a search query is required' };
  }
  const indexError = requireIndex(ctx);
  if (indexError) return { ok: false, output: '', error: indexError.error };
  const results = ctx.index.search(query, 10);
  if (results.length === 0) {
    return { ok: true, output: `Nothing in the workspace matches "${query}".` };
  }
  const lines = results.map((r) => {
    const symbols = r.symbols.length > 0 ? ` [${r.symbols.map((s) => s.name).slice(0, 5).join(', ')}]` : '';
    return `${r.path}:${r.startLine}${symbols}\n  ${r.snippet.split('\n')[0]?.slice(0, 160) ?? ''}`;
  });
  return { ok: true, output: `${results.length} result(s) for "${query}":\n${lines.join('\n')}` };
}

async function findSymbolImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const name = args.name;
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, output: '', error: 'a symbol name is required' };
  }
  // The index is the broad table; the LSP's document
  // symbols are the precise one for open files — merge,
  // LSP first, deduped by path:line.
  const found = new Map<string, { path: string; line: number; kind: string }>();
  // The LSP's DocumentSymbol.kind is a numeric enum —
  // render it as its name, like the index's string kind.
  const lspKindName = (kind: number): string =>
    (
      {
        1: 'File',
        2: 'Module',
        3: 'Namespace',
        4: 'Package',
        5: 'Class',
        6: 'Method',
        7: 'Property',
        8: 'Field',
        9: 'Constructor',
        10: 'Enum',
        11: 'Interface',
        12: 'Function',
        13: 'Variable',
        14: 'Constant',
        15: 'String',
        16: 'Number',
        17: 'Boolean',
        18: 'Array',
        19: 'Object',
        20: 'Key',
        21: 'Null',
        22: 'EnumMember',
        23: 'Struct',
        24: 'Event',
        25: 'Operator',
        26: 'TypeParameter',
      } as Record<number, string>
    )[kind] ?? `Symbol(${kind})`;
  try {
    const client = getEngineClient();
    if (client.isReady()) {
      for (const open of ctx.host.getOpenFiles()) {
        if (!isCodeFile(open.path)) continue;
        for (const symbol of client.getDocumentSymbols(open.path)) {
          const walk = (s: typeof symbol) => {
            if (s.name === name || s.name.toLowerCase().startsWith(name.toLowerCase())) {
              found.set(`${open.path}:${s.selectionRange.start.line + 1}`, {
                path: open.path,
                line: s.selectionRange.start.line + 1,
                kind: lspKindName(s.kind),
              });
            }
            for (const child of s.children ?? []) walk(child);
          };
          walk(symbol);
        }
      }
    }
  } catch {
    // LSP unavailable — the index table stands alone.
  }
  for (const hit of ctx.index.isBuilt ? ctx.index.findSymbol(name) : []) {
    found.set(`${hit.path}:${hit.line}`, hit);
  }
  const hits = [...found.values()];
  if (hits.length === 0) {
    return { ok: true, output: `No symbol named "${name}" in the workspace.` };
  }
  return {
    ok: true,
    output: `${hits.length} symbol(s) named "${name}":\n${hits.map((h) => `  ${h.path}:${h.line} (${h.kind})`).join('\n')}`,
  };
}

/** Find the first word-occurrence of a symbol in content
 *  (the position the LSP getters need). */
function findSymbolPosition(
  content: string,
  symbol: string,
  lineHint?: number,
): { line: number; character: number } | null {
  const lines = content.split('\n');
  const wordRe = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const scan = (lineIdx: number): { line: number; character: number } | null => {
    const at = wordRe.exec(lines[lineIdx]);
    return at ? { line: lineIdx, character: at.index } : null;
  };
  if (lineHint !== undefined && lineHint >= 1 && lineHint <= lines.length) {
    return scan(lineHint - 1) ?? null;
  }
  for (let i = 0; i < lines.length; i++) {
    const found = scan(i);
    if (found) return found;
  }
  return null;
}

function formatLocations(
  locations: Array<{ uri: string; range: { start: { line: number; character: number } } }>,
): string {
  return locations
    .map((l) => `  ${l.uri}:${l.range.start.line + 1}:${l.range.start.character + 1}`)
    .join('\n');
}

async function goToDefinitionImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const symbol = args.symbol;
  if (typeof symbol !== 'string' || !symbol.trim()) {
    return { ok: false, output: '', error: 'a symbol name is required' };
  }
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
  if (content === null) {
    return { ok: false, output: '', error: `Could not read file: ${path}` };
  }
  const lineHint = typeof args.line === 'number' ? args.line : undefined;
  const position = findSymbolPosition(content, symbol, lineHint);
  if (!position) {
    return { ok: true, output: `Symbol "${symbol}" does not occur in ${path}.` };
  }
  try {
    const client = getEngineClient();
    if (await client.ensureReady()) {
      client.openDocument(path, content);
      const locations = client.getDefinition(path, { line: position.line, character: position.character });
      if (locations.length > 0) {
        return {
          ok: true,
          output: `"${symbol}" is defined at:\n${formatLocations(locations)}`,
        };
      }
    }
  } catch {
    // Fall through to the index table.
  }
  const hits = ctx.index.isBuilt ? ctx.index.findSymbol(symbol) : [];
  if (hits.length === 0) {
    return { ok: true, output: `No definition found for "${symbol}".` };
  }
  return {
    ok: true,
    output: `"${symbol}" is defined at (index):\n${hits.map((h) => `  ${h.path}:${h.line} (${h.kind})`).join('\n')}`,
  };
}

async function findReferencesImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const symbol = args.symbol;
  if (typeof symbol !== 'string' || !symbol.trim()) {
    return { ok: false, output: '', error: 'a symbol name is required' };
  }
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
  if (content === null) {
    return { ok: false, output: '', error: `Could not read file: ${path}` };
  }
  const lineHint = typeof args.line === 'number' ? args.line : undefined;
  const position = findSymbolPosition(content, symbol, lineHint);
  if (!position) {
    return { ok: true, output: `Symbol "${symbol}" does not occur in ${path}.` };
  }
  try {
    const client = getEngineClient();
    if (await client.ensureReady()) {
      client.openDocument(path, content);
      const locations = client.getReferences(path, { line: position.line, character: position.character });
      if (locations.length > 0) {
        return {
          ok: true,
          output: `${locations.length} reference(s) to "${symbol}":\n${formatLocations(locations)}`,
        };
      }
    }
  } catch {
    // Fall through to a text search.
  }
  return grepSearchImpl({ pattern: `\\b${symbol}\\b`, caseSensitive: true }, ctx);
}

async function createNewFileImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  if (await ctx.host.exists(path)) {
    return { ok: false, output: '', error: `File already exists: ${path}` };
  }
  const content = typeof args.content === 'string' ? args.content : '';
  // Make the parent directory first (a new nested path
  // must not fail on a missing folder).
  const parent = path.slice(0, path.lastIndexOf('/')) || '/';
  if (!(await ctx.host.exists(parent))) {
    await ctx.host.createDir(parent);
  }
  try {
    await ctx.host.createFile(path, content);
  } catch (e) {
    return { ok: false, output: '', error: `Could not create file: ${path} — ${e instanceof Error ? e.message : String(e)}` };
  }
  // The new file enters the index (it exists now) and, for
  // code files, the diagnostics check runs on its content.
  await ctx.index.indexOne(path);
  const lsp = await lspFor(path, content);
  const diagnosticsPart = lsp && lsp.diagnostics.length > 0 ? `\n${formatDiagnostics(lsp.diagnostics)}` : '';
  return {
    ok: true,
    output: `Created ${path} (${content.split('\n').length} line(s)).${diagnosticsPart}`,
    edits: [{ path, kind: 'created', replacements: 1 }],
    diagnosticsChecked: lsp?.checked ?? false,
    diagnostics: lsp?.diagnostics,
  };
}

async function multiEditImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  const rawEdits = args.edits;
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
    return { ok: false, output: '', error: 'multi_edit needs a non-empty edits array.' };
  }
  const edits: EditOperation[] = [];
  for (const raw of rawEdits) {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as Record<string, unknown>).old_string !== 'string' ||
      typeof (raw as Record<string, unknown>).new_string !== 'string'
    ) {
      return { ok: false, output: '', error: 'Each edit needs old_string and new_string strings.' };
    }
    edits.push({
      old_string: (raw as Record<string, unknown>).old_string as string,
      new_string: (raw as Record<string, unknown>).new_string as string,
      replace_all: (raw as Record<string, unknown>).replace_all === true,
    });
  }
  const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
  if (content === null) {
    return { ok: false, output: '', error: `Could not read file: ${path}` };
  }
  let next: string;
  let applied;
  try {
    ({ content: next, applied } = executeMultiEdit(content, edits));
  } catch (e) {
    if (e instanceof EditError) {
      // Atomic by construction: nothing was applied, and
      // the failure names the edit + the reason — the loop
      // feeds it back as context for a re-plan.
      return { ok: false, output: '', error: `multi_edit failed (${e.reason}): old_string ${JSON.stringify(e.operation.old_string.slice(0, 80))} did not match ${path} as given.` };
    }
    throw e;
  }
  // The TS-LSP pre-flight (the hook the TS-LSP slice built
  // for exactly this): check the edit before it lands.
  // The edit still lands when the check is dirty — the
  // user asked for it; the diagnostics are information,
  // and reflecting on them is the Aider slice (#5).
  const lsp = await lspFor(path, content);
  let diagnostics = lsp?.diagnostics ?? [];
  let diagnosticsChecked = lsp?.checked ?? false;
  if (lsp) {
    const check = lsp.checkEdit(next);
    diagnostics = check.diagnostics;
    diagnosticsChecked = true;
  }
  await persistEdit(ctx, path, next);
  const total = applied.reduce((sum, a) => sum + a.replacements, 0);
  const diagnosticsPart = diagnostics.length > 0 ? `\n${formatDiagnostics(diagnostics)}` : '\nDiagnostics: clean.';
  return {
    ok: true,
    output: `Edited ${path}: ${applied.length} edit(s), ${total} replacement(s).${diagnosticsPart}`,
    edits: [{ path, kind: 'edited', replacements: total }],
    diagnosticsChecked,
    diagnostics,
  };
}

/**
 * Persist edited content the way every edit tool does:
 * an open file keeps its editor state (content replaced,
 * saved, dirty flag cleared); a closed file is written
 * to disk. The index re-reads the file either way, so
 * the next tool call sees the new content.
 */
async function persistEdit(
  ctx: AgentToolContext,
  path: string,
  next: string,
): Promise<void> {
  const isOpen = ctx.host.getOpenFiles().some((f) => f.path === path);
  if (isOpen) {
    ctx.host.updateOpenFileContent(path, next);
    await ctx.host.saveOpenFile(path);
  } else {
    await ctx.host.writeFile(path, next);
  }
  await ctx.index.indexOne(path);
}

/**
 * The verify loop's tool (steal #5 — Aider): reflect on
 * a file's live diagnostics, fix what has a safe
 * automatic repair, re-check — up to 3 reflections —
 * and persist the verified content. The result is marked
 * `verified: true` so the loop never reflects twice on
 * the same diagnostics. A file with no safe repair is
 * reported, not guessed at — the diagnostics ride in
 * the result either way.
 */
async function fixDiagnosticsImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const resolved = resolveToolPath(args.filepath, ctx);
  if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
  const { path } = resolved;
  const content = openContent(ctx, path) ?? (await ctx.host.readFile(path).catch(() => null));
  if (content === null) {
    return { ok: false, output: '', error: `Could not read file: ${path}` };
  }
  if (!isCodeFile(path)) {
    return {
      ok: true,
      output: `${path} is not a TypeScript/JavaScript file — there are no language diagnostics to verify.`,
      diagnosticsChecked: false,
      verified: true,
      verification: { reflections: 0, fixed: 0, remaining: 0 },
    };
  }
  const deps = await makeLspVerifyDeps(path, content, ctx.index, ctx.host);
  if (!deps) {
    return {
      ok: true,
      output: `${path}: the language engine is unavailable — diagnostics could not be checked, nothing changed.`,
      diagnosticsChecked: false,
      verified: true,
      verification: { reflections: 0, fixed: 0, remaining: 0 },
    };
  }
  const verified = await verifyContent(path, content, deps);
  const verification = {
    reflections: verified.reflections,
    fixed: verified.fixed,
    remaining: verified.diagnostics.length,
  };
  // Persist FIRST, report after — a fix that ends clean
  // still changed the file, and returning before the
  // write (the old code did exactly that on the clean
  // path) would report a fix that never landed.
  if (verified.fixed > 0) {
    await persistEdit(ctx, path, verified.content);
  }
  const edits =
    verified.fixed > 0 ? [{ path, kind: 'edited' as const, replacements: verified.fixed }] : undefined;
  if (verified.diagnostics.length === 0) {
    return {
      ok: true,
      output:
        verified.fixed > 0
          ? `Verified ${path}: fixed ${verified.fixed} diagnostic(s) in ${verified.reflections} reflection(s) — clean.`
          : `Verified ${path}: clean — no diagnostics.`,
      edits,
      diagnosticsChecked: true,
      diagnostics: [],
      verified: true,
      verification,
    };
  }
  if (verified.fixed === 0) {
    return {
      ok: true,
      output:
        `Verified ${path}: no safe automatic repair for the ${verified.diagnostics.length} diagnostic(s) — nothing changed.\n${formatDiagnostics(verified.diagnostics)}`,
      diagnosticsChecked: true,
      diagnostics: verified.diagnostics,
      verified: true,
      verification,
    };
  }
  return {
    ok: true,
    output:
      `Verified ${path}: fixed ${verified.fixed} diagnostic(s) in ${verified.reflections} reflection(s).\n${formatDiagnostics(verified.diagnostics)}`,
    edits,
    diagnosticsChecked: true,
    diagnostics: verified.diagnostics,
    verified: true,
    verification,
  };
}

/**
 * Show what changed in the workspace — the unified diff
 * against HEAD (staged + unstaged together; an untracked
 * file shows as a new-file diff). The runner lives in
 * main (electron/ipc/git.ts — the renderer only parses
 * git output, it never runs git); the host is the seam,
 * so tests run against a fake diff.
 */
async function viewDiffImpl(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  let filepath: string | undefined;
  if (typeof args.filepath === 'string' && args.filepath) {
    const resolved = resolveToolPath(args.filepath, ctx);
    if ('error' in resolved) return { ok: false, output: '', error: resolved.error };
    filepath = resolved.path;
  }
  const diff = await ctx.host.getDiff(ctx.workspaceRoot, filepath);
  if (diff === null) {
    return { ok: false, output: '', error: 'Not a git repository (or git is unavailable) in this workspace.' };
  }
  if (diff.trim() === '') {
    return { ok: true, output: filepath ? `No changes in ${filepath}.` : 'No changes in the workspace.' };
  }
  const shown =
    diff.length <= MAX_DIFF_CHARS
      ? diff
      : `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)`;
  return { ok: true, output: shown };
}

/** The built-in tool set, in registration order. */
export function getBuiltInToolDefinitions(): AgentToolDefinition[] {
  return [
    tool(
      'read_file',
      'Use this tool if you need to view the contents of an existing file.',
      'Read File',
      'read {{{ filepath }}}',
      'reading {{{ filepath }}}',
      'read {{{ filepath }}}',
      true,
      'allowedWithoutPermission',
      ['filepath'],
      FILEPATH_PROP,
    ),
    tool(
      'read_currently_open_file',
      'Read the file currently open in the editor.',
      'Read Open File',
      'read the open file',
      'reading the open file',
      'read the open file',
      true,
      'allowedWithoutPermission',
      [],
      {},
    ),
    tool(
      'ls',
      'List files and folders in a given directory.',
      'List Directory',
      'list files in {{{ dirPath }}}',
      'listing files in {{{ dirPath }}}',
      'listed files in {{{ dirPath }}}',
      true,
      'allowedWithoutPermission',
      [],
      {
        dirPath: { type: 'string', description: 'The directory to list, relative to the workspace root or absolute. Defaults to the workspace root.' },
      },
    ),
    tool(
      'file_glob_search',
      'Search for files recursively in the project using glob patterns. Supports ** for recursive directory search.',
      'Glob File Search',
      'search for files like "{{{ pattern }}}"',
      'searching for files like "{{{ pattern }}}"',
      'searched for files like "{{{ pattern }}}"',
      true,
      'allowedWithoutPermission',
      ['pattern'],
      {
        pattern: { type: 'string', description: 'Glob pattern for file path matching, e.g. **/*.ts or src/*.tsx.' },
      },
    ),
    tool(
      'grep_search',
      'Search file contents for a pattern (regular expression). Searches the indexed workspace files, or one file when filepath is given.',
      'Grep Search',
      'search for "{{{ pattern }}}"',
      'searching for "{{{ pattern }}}"',
      'searched for "{{{ pattern }}}"',
      true,
      'allowedWithoutPermission',
      ['pattern'],
      {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        filepath: { type: 'string', description: 'Optional: one file to search instead of the whole workspace.' },
        caseSensitive: { type: 'boolean', description: 'Optional: true for a case-sensitive search.' },
      },
    ),
    tool(
      'codebase_search',
      'Search the workspace index by meaning — file contents and paths, ranked. Use this when you know what the code does but not where it lives.',
      'Codebase Search',
      'search the codebase for "{{{ query }}}"',
      'searching the codebase for "{{{ query }}}"',
      'searched the codebase for "{{{ query }}}"',
      true,
      'allowedWithoutPermission',
      ['query'],
      {
        query: { type: 'string', description: 'What to search for — words from the code or the filename.' },
      },
    ),
    tool(
      'find_symbol',
      'Find a symbol (function, class, interface, type, variable) by name in the workspace.',
      'Find Symbol',
      'find symbol "{{{ name }}}"',
      'finding symbol "{{{ name }}}"',
      'found symbol "{{{ name }}}"',
      true,
      'allowedWithoutPermission',
      ['name'],
      {
        name: { type: 'string', description: 'The symbol name to find.' },
      },
    ),
    tool(
      'go_to_definition',
      'Find where a symbol is defined. Give the file it is used in and the symbol name.',
      'Go to Definition',
      'find the definition of "{{{ symbol }}}"',
      'finding the definition of "{{{ symbol }}}"',
      'found the definition of "{{{ symbol }}}"',
      true,
      'allowedWithoutPermission',
      ['filepath', 'symbol'],
      {
        ...FILEPATH_PROP,
        symbol: { type: 'string', description: 'The symbol name.' },
        line: { type: 'string', description: 'Optional: the line number the symbol is used on (1-based).' },
      },
    ),
    tool(
      'find_references',
      'Find every use of a symbol. Give the file it is used in and the symbol name.',
      'Find References',
      'find references to "{{{ symbol }}}"',
      'finding references to "{{{ symbol }}}"',
      'found references to "{{{ symbol }}}"',
      true,
      'allowedWithoutPermission',
      ['filepath', 'symbol'],
      {
        ...FILEPATH_PROP,
        symbol: { type: 'string', description: 'The symbol name.' },
        line: { type: 'string', description: 'Optional: the line number the symbol is used on (1-based).' },
      },
    ),
    tool(
      'create_new_file',
      'Create a new file with the given content. The parent directory is created when it does not exist.',
      'Create File',
      'create {{{ filepath }}}',
      'creating {{{ filepath }}}',
      'created {{{ filepath }}}',
      false,
      'allowedWithPermission',
      ['filepath'],
      {
        ...FILEPATH_PROP,
        content: { type: 'string', description: 'The initial content of the file.' },
      },
    ),
    tool(
      'multi_edit',
      'Make multiple edits to a single file in one atomic operation. Each edit is a find-and-replace: old_string must match the file contents (whitespace-tolerant — the match may differ in indentation), new_string is the replacement. All edits are applied in sequence; all must be valid or none apply.',
      'Multi Edit',
      'edit {{{ filepath }}}',
      'editing {{{ filepath }}}',
      'edited {{{ filepath }}}',
      false,
      'allowedWithPermission',
      ['filepath', 'edits'],
      {
        ...FILEPATH_PROP,
        edits: { type: 'array', description: 'Array of {old_string, new_string, replace_all?} operations.', items: { type: 'object' } },
      },
    ),
    tool(
      'fix_diagnostics',
      'Reflect on a file\'s language diagnostics (type errors), fix the ones with a safe automatic repair — a compiler-named rename, a unique import, a wrong module specifier, an unused import — re-check, and repeat up to 3 times. Diagnostics with no safe repair are reported, never guessed at.',
      'Fix Diagnostics',
      'verify {{{ filepath }}}',
      'verifying {{{ filepath }}}',
      'verified {{{ filepath }}}',
      false,
      'allowedWithPermission',
      ['filepath'],
      FILEPATH_PROP,
    ),
    tool(
      'view_diff',
      'Show what changed in the workspace — the unified diff against HEAD (staged and unstaged together; an untracked file shows as a new-file diff). Give a filepath to see only that file\'s diff.',
      'View Diff',
      'show the diff',
      'showing the diff',
      'showed the diff',
      true,
      'allowedWithoutPermission',
      [],
      FILEPATH_PROP,
    ),
  ];
}

/** Register every built-in tool on a registry. Idempotent
 *  by the registry's replace-on-duplicate rule — calling
 *  it twice yields one of each tool, never two. */
export function registerBuiltInTools(registry: ToolRegistry): void {
  const definitions = getBuiltInToolDefinitions();
  const implementations: Record<string, (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<AgentToolResult>> = {
    read_file: readFileImpl,
    read_currently_open_file: readCurrentlyOpenFileImpl,
    ls: lsImpl,
    file_glob_search: globSearchImpl,
    grep_search: grepSearchImpl,
    codebase_search: codebaseSearchImpl,
    find_symbol: findSymbolImpl,
    go_to_definition: goToDefinitionImpl,
    find_references: findReferencesImpl,
    create_new_file: createNewFileImpl,
    multi_edit: multiEditImpl,
    fix_diagnostics: fixDiagnosticsImpl,
    view_diff: viewDiffImpl,
  };
  for (const definition of definitions) {
    const implementation = implementations[definition.function.name];
    if (implementation) registry.register(definition, implementation);
  }
}
