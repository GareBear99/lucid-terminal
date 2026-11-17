/**
 * The workspace file index — the agent's `@codebase`
 *
 * The shape: a content-addressed refresh — a refresh
 * produces compute / delete / addTag / removeTag lists, and
 * each index artifact implements `update()` over them — plus
 * a SQLite FTS5 trigram index (`CREATE VIRTUAL TABLE fts
 * USING fts5(path, content, tokenize='trigram')`, ranked by
 * bm25 with the path column weighted 10x), a security ignore
 * list (secrets never enter the index), and a hybrid
 * retrieval quota (recent / FTS / embeddings — here:
 * recent-edited files first, then FTS, no embeddings yet).
 *
 * What is re-implemented here, in TS, not copied: the
 * trigram index itself. Lucid has no SQLite dependency,
 * and adding a native module for the index would repeat
 * the asar-bloat trap the tree-sitter and TS-LSP slices
 * each caught. The index is pure TS, in-memory, built
 * from trigram posting lists over line-window chunks,
 * scored with the same shape as Continue's bm25 + path
 * weight. It is rebuilt lazily on first agent use and
 * refreshed incrementally (a file is re-indexed only
 * when its size or mtime changed — the content hash is
 * the cacheKey, computed only for changed files).
 *
 * This fixes a real, measured bug: `files.search`
 * returned 0 matches for an existing file after scanning
 * 35,840 entries. The index walks the same tree but
 * indexes every file it sees — a file in the tree is in
 * the index, and search is over the index, not over a
 * live scan that can miss.
 *
 * Guest: in-memory only, built per session, dropped on
 * exit — nothing is written to disk, ever. The index
 * never reads a denied path (secrets, keys, credentials,
 * cloud dirs) and never indexes one.
 *
 * Honest limits, stated plainly: the index is in-memory
 * (no SQLite persistence yet — a big workspace re-walks
 * on every launch; persistence is owed, not built); the
 * `.gitignore` is NOT parsed yet (only the hard-coded
 * ignore lists below — a `.gitignore`-aware walk is
 * owed); chunks are line windows, not the collapsed-AST
 * chunker (Continue's `chunk.ts` — the tree-sitter
 * structure feeds the composer ghost and the symbol
 * table, not chunk boundaries yet); oversized chunks are
 * split, not dropped (Continue drops them — that bug is
 * NOT copied).
 */

import { minimatch } from 'minimatch';
import type { AgentHost } from './agentHost';
import { normalizePosixPath } from './agentHost';
import { IgnoreSet } from './agentIgnore';

/** Continue's `DEFAULT_SECURITY_IGNORE_FILETYPES` +
 *  `DEFAULT_SECURITY_IGNORE_DIRS` (core/indexing/ignore.ts),
 *  as path patterns. Secrets never enter the index — the
 *  same list gates tool calls in agentPolicy.ts. */
export const AGENT_DENIED_FILE_PATTERNS: readonly string[] = [
  '*.env', '*.env.*', '.env*',
  'config.json', 'config.yaml', 'config.yml', 'settings.json',
  'appsettings.json', 'appsettings.*.json',
  'credentials.json', 'credentials.*.json',
  '*.key', '*.pem', '*.p12', '*.pfx', '*.crt', '*.cer',
  '*.jks', '*.keystore', '*.truststore',
  '*.db', '*.sqlite', '*.sqlite3', '*.mdb', '*.accdb',
  '*.secret', '*.secrets', 'auth.json', '*.token',
  '*.bak', '*.backup', '*.old', '*.orig',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '*.ppk', '*.gpg',
];

export const AGENT_DENIED_DIR_NAMES: readonly string[] = [
  '.env', 'env', '.aws', '.gcp', '.azure', '.kube', '.docker',
  'secrets', '.secrets', 'private', '.private', 'certs',
  '.git', '.ssh', '.gnupg', 'node_modules', '.next', 'dist',
  'build', 'out', 'coverage', '.cache', '__pycache__',
];

/** Precompiled denied-file matchers — one RegExp per pattern,
 *  built once at module load. Calling minimatch() per pattern
 *  per path made the workspace walk ~30x slower than the file
 *  reads (measured: isDeniedPath 0.276 ms/call vs a single
 *  precompiled RegExp test 0.0003 ms/call). A pattern whose
 *  RegExp cannot be built falls back to minimatch at call
 *  time, so the matching semantics are unchanged. */
const DENIED_FILE_RES: ReadonlyArray<{ re: RegExp | false; pattern: string }> =
  AGENT_DENIED_FILE_PATTERNS.map((pattern) => {
    try {
      return { re: minimatch.makeRe(pattern, { dot: true }), pattern };
    } catch {
      return { re: false, pattern };
    }
  });
/** Denied dir names as a Set (O(1) per segment). */
const DENIED_DIR_NAMES_SET = new Set(AGENT_DENIED_DIR_NAMES);

/** Binary / generated extensions the index never reads
 *  (content search over them is noise; the path is still
 *  listed by glob — the index knows the file exists). */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg',
  'mp3', 'wav', 'ogg', 'flac', 'mp4', 'mov', 'webm',
  'zip', 'tar', 'gz', 'dmg', 'pkg', 'exe', 'dll', 'so', 'dylib',
  'pdf', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'wasm', 'node', 'pyc', 'class', 'o', 'a', 'lock',
]);

/** True when the path is a secrets/credentials path —
 *  the policy gate's denied list (agentPolicy.ts) and the
 *  index's exclusion share this one function. */
export function isDeniedPath(path: string): boolean {
  const normalized = normalizePosixPath(path);
  const segments = normalized.split('/').filter(Boolean);
  for (const segment of segments) {
    if (DENIED_DIR_NAMES_SET.has(segment)) return true;
  }
  const base = segments[segments.length - 1] ?? '';
  for (const { re, pattern } of DENIED_FILE_RES) {
    if (re ? re.test(base) : minimatch(base, pattern, { dot: true })) return true;
  }
  return false;
}

/** True when the index skips the path entirely (denied
 *  paths + build/cache dirs + binary content — the path
 *  still exists for glob, it is just never read). */
export function isIgnoredPath(path: string): boolean {
  if (isDeniedPath(path)) return true;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

function fileExtension(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

/** The trigram set of a string (lowercased, padded so
 *  short words still produce trigrams). */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  const lower = `  ${text.toLowerCase()}  `;
  for (let i = 0; i + 3 <= lower.length; i++) {
    out.add(lower.slice(i, i + 3));
  }
  return out;
}

/** A tiny FNV-1a hash — the content cacheKey (Continue's
 *  index is content-addressed by file hash; the hash is
 *  computed only when size/mtime changed, not on every
 *  refresh). */
export function contentHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export interface AgentSymbol {
  name: string;
  kind: string;
  line: number;
}

/** One indexed chunk: a line window of a file, with the
 *  file's symbols attached (the chunker is line windows —
 *  the collapsed-AST chunker is owed, not built). */
export interface IndexedChunk {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  symbols: AgentSymbol[];
}

export interface IndexSearchResult {
  path: string;
  startLine: number;
  score: number;
  snippet: string;
  symbols: AgentSymbol[];
}

export interface IndexRefreshResult {
  added: number;
  updated: number;
  removed: number;
  files: number;
}

/** Progress of a build / refresh, for the UI — the loop
 *  forwards these as `index-progress` events so a run
 *  never sits at bare "Working…" while the index builds.
 *  `total` is null during the walk (the total is not known
 *  until the walk finishes). */
export interface IndexBuildProgress {
  phase: 'walk' | 'index' | 'done';
  done: number;
  total: number | null;
}

/** Line-window chunk size (Continue's max chunk is 500
 *  tokens — ~40 lines of code is the same order). */
const CHUNK_LINES = 40;
/** Files over this size are listed but never read into
 *  the index (their content is not searchable — the path
 *  still is). */
const MAX_INDEX_BYTES = 500_000;
/** The walk stops here (the 35,840-entry scan that missed
 *  a file is the bug being fixed — the cap is a safety
 *  valve, and hitting it is reported, not silent). */
const MAX_INDEX_FILES = 50_000;
/** How deep the walk goes. */
const MAX_WALK_DEPTH = 10;
/** Total retained index content cap (renderer-crash fix,
 *  2026-11-16): the renderer V8 heap limit is 2,096 MiB,
 *  and a home-dir index needed 2,712 MiB retained at
 *  20,000 files — ~5x the raw bytes in heap (UTF-16
 *  strings + chunk objects + trigram posting Sets). The
 *  per-file 500 KB cap alone still allows 551 MB raw, so
 *  the bulk build stops indexing new files once retained
 *  content passes ~200 MB and reports the index partial.
 *  Task files and files just created/edited bypass the cap
 *  (they are the files the run is about — one file cannot
 *  blow the heap, and the per-file cap still holds). */
const MAX_INDEX_TOTAL_BYTES = 200_000_000;
/** Heap-guard trip point (fraction of the V8 heap limit):
 *  abort the bulk build here, with the index partial,
 *  instead of letting V8 abort the whole renderer
 *  (exit code 6 — the 2026-11-16 renderer crashes). */
const HEAP_GUARD_FRACTION = 0.8;

/** The renderer's V8 heap usage, or null when it cannot
 *  be read (Node test runs have no performance.memory —
 *  the guard is inert there; the byte cap is the defense).
 *  Chromium exposes it as performance.memory. */
export function readHeapUsage(): { used: number; limit: number } | null {
  try {
    const memory = (
      globalThis as {
        performance?: { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
      }
    ).performance?.memory;
    if (memory && memory.jsHeapSizeLimit > 0) {
      return { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit };
    }
  } catch {
    // No heap stats available — no guard.
  }
  return null;
}

/** Pure trip check (unit-testable): true when the heap is
 *  past the guard fraction of its limit. */
export function isHeapOverGuard(used: number, limit: number): boolean {
  return limit > 0 && used > limit * HEAP_GUARD_FRACTION;
}

/** Options for AgentFileIndex (tests override the caps /
 *  the heap reader; production uses the defaults above). */
export interface AgentFileIndexOptions {
  /** Override the retained-content cap (tests) — default
   *  MAX_INDEX_TOTAL_BYTES. */
  maxTotalBytes?: number;
  /** Override the heap reader (tests) — default
   *  readHeapUsage. */
  heapUsage?: () => { used: number; limit: number } | null;
}

/** Symbol scan for code files (the index's symbol table).
 *  Regex-based and engine-free on purpose: the index
 *  builds over files never opened, where the language
 *  service has no document. The LSP's document symbols
 *  (getDocumentSymbols) refine this for OPEN files in the
 *  find_symbol tool — the index is the broad table, the
 *  LSP is the precise one. */
const SYMBOL_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: 'function', re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'class', re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'interface', re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: 'enum', re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'variable', re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::|=)/ },
  { kind: 'function', re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/ },
  { kind: 'function', re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/ },
];

export function extractSymbols(path: string, content: string): AgentSymbol[] {
  const ext = fileExtension(path);
  if (!['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'].includes(ext)) return [];
  const symbols: AgentSymbol[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { kind, re } of SYMBOL_PATTERNS) {
      const match = re.exec(lines[i]);
      if (!match) continue;
      const name = match[1];
      if (seen.has(name)) break;
      seen.add(name);
      symbols.push({ name, kind, line: i + 1 });
      break;
    }
  }
  return symbols;
}

interface IndexedFile {
  path: string;
  size: number;
  modified: number;
  cacheKey: string;
  symbols: AgentSymbol[];
  chunkIds: number[];
}

/** The workspace file index. One instance per workspace
 *  root (the loop owns the cache in agentLoop.ts). */
export class AgentFileIndex {
  private readonly host: AgentHost;
  private readonly maxTotalBytes: number;
  private readonly readHeap: () => { used: number; limit: number } | null;
  private root: string | null = null;
  private built = false;
  private building: Promise<void> | null = null;
  /** True when the task fast-path prepared this index
   *  (prepareForTask) — the task's files + cwd + open files
   *  are known, so the brain can plan before the full build
   *  finishes. Cleared when the full build completes. */
  private taskReady = false;
  private files = new Map<string, IndexedFile>();
  private chunks = new Map<number, IndexedChunk>();
  private trigramIndex = new Map<string, Set<number>>();
  private pathTrigrams = new Map<number, Set<string>>();
  private nextChunkId = 1;
  /** Retained content bytes (sum of the sizes of the
   *  files whose content is held in memory) — the byte
   *  cap's ledger. */
  private indexedBytes = 0;
  /** True when the bulk build stopped early on the
   *  retained-content cap or the heap guard — the index is
   *  partial (files past the stop are listed, not read). */
  private contentCapped = false;
  /** Why the full build was refused for this root (the
   *  home-dir guard, set by the loop) — null when builds
   *  are allowed. Index-backed tools report this instead
   *  of a bare "not built yet". */
  private refused: string | null = null;
  /** Files the walk saw but did not read (too big /
   *  binary) — still known to glob. */
  private knownPaths = new Set<string>();
  /** True when the walk hit the file cap (reported, not
   *  silent — the index is partial then). */
  capped = false;
  /** The root's ignore files (.gitignore, .cursorignore,
   *  .cursorindexingignore), loaded at build / refresh —
   *  Cursor respects both .cursorignore and .gitignore
   *  for search, and .cursorindexingignore for indexing
   *  only (staff post, forum.cursor.com, 2026-07-22).
   *  Null until the first build. */
  private ignoreSet: IgnoreSet | null = null;

  constructor(host: AgentHost, options: AgentFileIndexOptions = {}) {
    this.host = host;
    this.maxTotalBytes = options.maxTotalBytes ?? MAX_INDEX_TOTAL_BYTES;
    this.readHeap = options.heapUsage ?? readHeapUsage;
  }

  get workspaceRoot(): string | null {
    return this.root;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Retained content bytes held in memory. */
  get indexedContentBytes(): number {
    return this.indexedBytes;
  }

  /** True when the bulk build stopped early on the
   *  retained-content cap or the heap guard. */
  get isContentCapped(): boolean {
    return this.contentCapped;
  }

  /** Why the full build was refused for this root, or null. */
  get refusedReason(): string | null {
    return this.refused;
  }

  /** Refuse the full build for this root (the home-dir
   *  guard — the loop calls this when the workspace root
   *  is the user's home directory). A refused index never
   *  builds; the task fast path (named files + open files)
   *  still runs, and the index-backed tools report the
   *  reason instead of a bare "not built yet". */
  refuseFullBuild(reason: string): void {
    this.refused = reason;
  }

  /** True when the heap guard trips (heap past the guard
   *  fraction of its limit) — the bulk build stops, with
   *  the index partial, instead of letting V8 abort the
   *  renderer. False when heap stats are unavailable. */
  private heapTripped(): boolean {
    try {
      const usage = this.readHeap();
      return !!usage && isHeapOverGuard(usage.used, usage.limit);
    } catch {
      return false;
    }
  }

  /** True when the task fast-path prepared this index — the
   *  brain can plan on the task's files before the full
   *  build finishes. */
  get isTaskReady(): boolean {
    return this.taskReady;
  }

  get fileCount(): number {
    return this.files.size;
  }

  get knownPathCount(): number {
    return this.knownPaths.size;
  }

  /** All indexed file paths, sorted. */
  getFilePaths(): string[] {
    return [...this.files.keys()].sort();
  }

  /** All known paths (indexed + too-big/binary), sorted —
   *  the glob surface. */
  getKnownPaths(): string[] {
    return [...this.knownPaths].sort();
  }

  getSymbols(path: string): AgentSymbol[] {
    return this.files.get(path)?.symbols ?? [];
  }

  /** True when the path is ignored by the root's ignore
   *  files (.gitignore / .cursorignore /
   *  .cursorindexingignore). False before the first build
   *  (no rules loaded yet) — the walk loads them first. */
  isIgnoredByRules(path: string): boolean {
    if (!this.ignoreSet || !this.root) return false;
    const relative = path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : path;
    return this.ignoreSet.isIgnored(relative);
  }

  /** How many ignore rules the last build / refresh
   *  loaded (0 when no ignore file exists at the root). */
  get ignoreRuleCount(): number {
    return this.ignoreSet?.size ?? 0;
  }

  /** Note paths as known (for glob / resolution) without
   *  reading content — the fast path lists a directory and
   *  notes its files, so the brain can resolve cwd-relative
   *  paths before the full build reads anything. */
  noteKnownPaths(paths: string[]): void {
    for (const path of paths) {
      if (isDeniedPath(path) || this.isIgnoredByRules(path)) continue;
      this.knownPaths.add(path);
    }
  }

  /**
   * The task fast path: prepare the index for ONE task
   * without walking the whole workspace. Sets the root,
   * loads the ignore files, indexes the task's files and
   * the open files, and notes the cwd's listing — so the
   * brain can resolve the task's files and plan
   * immediately. The full build still runs afterwards
   * (in the background) for search / symbols. Never throws
   * — a fast-path failure just means the run proceeds
   * with an unprepared index.
   */
  async prepareForTask(
    root: string,
    opts: { cwd: string; taskPaths: string[]; openFiles: string[] },
  ): Promise<void> {
    try {
      const normalized = normalizePosixPath(root);
      if (this.root !== normalized) {
        // Workspace switch: drop everything.
        this.reset();
        this.root = normalized;
      }
      if (this.built && opts.taskPaths.length === 0 && opts.openFiles.length === 0) return; // Already fully built, nothing new to prepare.
      await this.loadIgnoreFiles();
      // The task's files + the open files: index each
      // (content + symbols). A file the ignore rules cover
      // is skipped here, as in indexOne — the brain can
      // still plan it by absolute path, which needs no index.
      // This runs even when the index is already built: a
      // file created since the last build is indexed now,
      // so the brain can resolve it before the background
      // refresh finishes. Task files bypass the retained-
      // content cap (force) — they are the files the run is
      // about, one file cannot blow the heap, and the
      // per-file 500 KB cap still holds.
      for (const path of [...opts.taskPaths, ...opts.openFiles]) {
        await this.indexOne(path, true);
      }
      // The cwd listing: note the paths (no content read),
      // so cwd-relative resolution works before the build.
      try {
        const entries = await this.host.readDir(opts.cwd);
        this.noteKnownPaths(entries.filter((e) => e.isFile).map((e) => e.path));
      } catch {
        // An unreadable cwd contributes nothing.
      }
      this.taskReady = true;
    } catch {
      // Never fatal — the run proceeds with what it has.
      this.taskReady = false;
    }
  }

  /**
   * Wait for the full build to complete. Resolves true
   * when the index is built, false on timeout (or when no
   * build is running). The index-backed tools (search /
   * symbols) use this instead of failing immediately when
   * the build is still running in the background.
   */
  whenBuilt(timeoutMs = 60_000): Promise<boolean> {
    if (this.built) return Promise.resolve(true);
    if (!this.building) return Promise.resolve(false);
    const build = this.building;
    return Promise.race([
      build.then(
        () => this.built,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  }

  /**
   * Load the root's ignore files, in order (.gitignore,
   * then .cursorignore, then .cursorindexingignore —
   * later rules win). A missing file contributes nothing;
   * an unreadable one is skipped, never fatal. Called at
   * build and at refresh, so a newly added ignore file
   * takes effect on the next refresh.
   */
  private async loadIgnoreFiles(): Promise<void> {
    if (!this.root) return;
    const texts: string[] = [];
    for (const name of ['.gitignore', '.cursorignore', '.cursorindexingignore']) {
      try {
        texts.push(await this.host.readFile(`${this.root}/${name}`));
      } catch {
        // No such file — nothing to ignore from it.
      }
    }
    this.ignoreSet = IgnoreSet.fromTexts(texts);
  }

  /** Build (or rebuild) the index over a workspace root.
   *  Async and chunked: it yields to the event loop every
   *  50 files, so the build never blocks the composer.
   *  Safe to call repeatedly — a build already in flight
   *  is shared, and a built index for the same root is a
   *  no-op (use refresh() for updates). `onProgress` fires
   *  during the walk and the content pass, so the loop can
   *  show real progress instead of a bare "Working…". */
  async build(root: string, onProgress?: (p: IndexBuildProgress) => void): Promise<void> {
    // A refused root never builds (the home-dir guard —
    // the loop refused it; a direct build call is a no-op,
    // not a way around the refusal).
    if (this.refused) return;
    if (this.built && this.root === root) return;
    if (this.building) {
      await this.building;
      return;
    }
    this.building = this.buildNow(root, onProgress);
    try {
      await this.building;
    } finally {
      this.building = null;
    }
  }

  private async buildNow(root: string, onProgress?: (p: IndexBuildProgress) => void): Promise<void> {
    const normalized = normalizePosixPath(root);
    // Continuing from a task fast-path for the same root:
    // keep the prepared entries (the walk re-adds everything
    // and indexFile skips unchanged files). A different root
    // (or no fast-path) starts clean.
    const continuing = this.root === normalized && this.taskReady;
    this.root = normalized;
    if (!continuing) {
      this.files.clear();
      this.chunks.clear();
      this.trigramIndex.clear();
      this.pathTrigrams.clear();
      this.knownPaths.clear();
      this.capped = false;
      this.indexedBytes = 0;
      this.contentCapped = false;
    }
    await this.loadIgnoreFiles();
    const walked = await this.walk(this.root, 0, onProgress);
    // Prune anything the walk did not see (a file deleted
    // since the fast-path prepared it).
    const seen = new Set(walked.map((f) => f.path));
    for (const path of [...this.files.keys()]) {
      if (!seen.has(path)) {
        this.removeFileChunks(path);
        this.files.delete(path);
      }
    }
    for (const path of [...this.knownPaths]) {
      if (!seen.has(path)) this.knownPaths.delete(path);
    }
    // The heap guard, before the content pass starts: a
    // heap already hot from the fast path means the bulk
    // pass would only push it further — skip it, with the
    // index partial (the fast-path files are still in).
    if (this.heapTripped()) {
      this.contentCapped = true;
      this.capped = true;
    }
    let done = 0;
    for (const file of walked) {
      // The byte cap (or the heap guard) stopped the pass
      // — the remaining files stay listed, not read, and
      // the index finishes partial instead of growing the
      // heap until V8 aborts the renderer.
      if (this.contentCapped) break;
      await this.indexFile(file.path, file.size, file.modified);
      done += 1;
      if (done % 50 === 0) {
        onProgress?.({ phase: 'index', done, total: walked.length });
        // Yield — the build never blocks the composer.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (this.heapTripped()) {
          this.contentCapped = true;
          this.capped = true;
          break;
        }
      }
    }
    onProgress?.({ phase: 'index', done, total: walked.length });
    this.built = true;
    this.taskReady = false;
    onProgress?.({ phase: 'done', done, total: walked.length });
  }

  /** Walk the tree (readDir per directory, depth-capped,
   *  ignore-aware). Returns the files found, in walk
   *  order. A file the walk sees is a file the index
   *  knows — the walk is the fix for the search miss.
   *  `onProgress` fires every 100 files found (the total
   *  is not known until the walk finishes). */
  private async walk(
    dir: string,
    depth: number,
    onProgress?: (p: IndexBuildProgress) => void,
  ): Promise<Array<{ path: string; size: number; modified: number }>> {
    const out: Array<{ path: string; size: number; modified: number }> = [];
    if (depth > MAX_WALK_DEPTH) return out;
    let entries;
    try {
      entries = await this.host.readDir(dir);
    } catch {
      return out; // An unreadable directory contributes nothing — never fatal.
    }
    for (const entry of entries) {
      if (this.knownPaths.size >= MAX_INDEX_FILES) {
        this.capped = true;
        return out;
      }
      const path = entry.path;
      if (isDeniedPath(path)) continue;
      // The ignore files (Cursor: .cursorignore +
      // .gitignore respected for search) — an ignored
      // directory is never descended into, an ignored
      // file never enters knownPaths at all.
      if (this.ignoreSet && this.root) {
        const relative = path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : path;
        if (this.ignoreSet.isIgnored(relative, entry.isDirectory)) continue;
      }
      if (entry.isDirectory) {
        if (DENIED_DIR_NAMES_SET.has(entry.name)) continue;
        out.push(...(await this.walk(path, depth + 1, onProgress)));
        continue;
      }
      if (!entry.isFile) continue;
      this.knownPaths.add(path);
      if (this.knownPaths.size % 100 === 0) {
        onProgress?.({ phase: 'walk', done: this.knownPaths.size, total: null });
      }
      out.push({ path, size: entry.size, modified: entry.modified });
    }
    return out;
  }

  /** Index one file: read it (unless too big / binary),
   *  hash it, chunk it, add its trigrams. A file whose
   *  size+mtime match the stored entry is skipped — the
   *  refresh path, not the build path. `force` bypasses
   *  the retained-content cap (task files + files just
   *  created/edited — the run's own files), never the
   *  per-file 500 KB cap. */
  private async indexFile(path: string, size: number, modified: number, force = false): Promise<void> {
    const existing = this.files.get(path);
    if (existing && existing.size === size && existing.modified === modified) return;
    if (size > MAX_INDEX_BYTES || isIgnoredPath(path)) {
      // Listed (knownPaths) but never read — the path is
      // searchable, the content is not.
      this.removeFileChunks(path);
      if (existing) this.files.delete(path);
      return;
    }
    // The retained-content cap: the ledger value if this
    // file's old entry were dropped, plus the new file.
    // A trip leaves the old entry in place (a re-index
    // refused is not a drop) and marks the index partial
    // instead of growing the heap until V8 aborts the
    // renderer. `force` (task files / just-created or
    // just-edited files) bypasses the cap — never the
    // per-file 500 KB cap above.
    if (!force && this.indexedBytes - (existing?.size ?? 0) + size > this.maxTotalBytes) {
      this.contentCapped = true;
      this.capped = true;
      return;
    }
    let content: string;
    try {
      content = await this.host.readFile(path);
    } catch {
      return; // Unreadable file — listed, not indexed.
    }
    const cacheKey = contentHash(content);
    if (existing && existing.cacheKey === cacheKey) {
      // Same content, new mtime — keep the old chunks
      // (they are still valid; only the metadata moves).
      this.files.set(path, { ...existing, size, modified });
      this.indexedBytes += size - existing.size;
      return;
    }
    // Content changed (or new): drop the old chunks, then
    // chunk the new content.
    this.removeFileChunks(path);
    const symbols = extractSymbols(path, content);
    const chunkIds: number[] = [];
    const lines = content.split('\n');
    // Line windows — oversized files are SPLIT into
    // windows, never dropped (Continue's chunker drops
    // oversized chunks; that bug is not copied).
    for (let start = 0; start < lines.length; start += CHUNK_LINES) {
      const end = Math.min(lines.length, start + CHUNK_LINES);
      const chunkContent = lines.slice(start, end).join('\n');
      const id = this.nextChunkId++;
      const chunk: IndexedChunk = {
        id,
        path,
        startLine: start + 1,
        endLine: end,
        content: chunkContent,
        symbols,
      };
      this.chunks.set(id, chunk);
      chunkIds.push(id);
      for (const trigram of trigrams(chunkContent)) {
        let posting = this.trigramIndex.get(trigram);
        if (!posting) {
          posting = new Set();
          this.trigramIndex.set(trigram, posting);
        }
        posting.add(id);
      }
      // The path itself is searchable: a query for a
      // filename must find its file (the search-miss fix).
      const pathTrigramSet = trigrams(path);
      this.pathTrigrams.set(id, pathTrigramSet);
      for (const trigram of pathTrigramSet) {
        let posting = this.trigramIndex.get(trigram);
        if (!posting) {
          posting = new Set();
          this.trigramIndex.set(trigram, posting);
        }
        posting.add(id);
      }
    }
    this.files.set(path, { path, size, modified, cacheKey, symbols, chunkIds });
    this.indexedBytes += size;
  }

  private removeFileChunks(path: string): void {
    const existing = this.files.get(path);
    if (!existing) return;
    // The ledger moves with the entry: dropping a file's
    // chunks frees its retained bytes. (Guarded by the
    // `!existing` return above — a file already dropped
    // never subtracts twice.)
    this.indexedBytes = Math.max(0, this.indexedBytes - existing.size);
    for (const id of existing.chunkIds) {
      const chunk = this.chunks.get(id);
      if (!chunk) continue;
      this.chunks.delete(id);
      for (const trigram of trigrams(chunk.content)) {
        this.trigramIndex.get(trigram)?.delete(id);
      }
      for (const trigram of this.pathTrigrams.get(id) ?? []) {
        this.trigramIndex.get(trigram)?.delete(id);
      }
      this.pathTrigrams.delete(id);
    }
  }

  /**
   * Index (or re-index) one file by path — the cheap
   * update after a create or an edit, instead of a full
   * refresh (the walk is the expensive part; one file is
   * one stat + one read). `force` bypasses the
   * retained-content cap (the file is the run's own) —
   * the task fast path and the create/edit tools pass it.
   */
  async indexOne(path: string, force = false): Promise<void> {
    if (!this.root) return;
    // A file the ignore files cover is listed nowhere —
    // an edit to it drops it from the index instead of
    // re-indexing it.
    if (this.isIgnoredByRules(path)) {
      this.removeFileChunks(path);
      this.files.delete(path);
      this.knownPaths.delete(path);
      return;
    }
    let stats;
    try {
      stats = await this.host.getStats(path);
    } catch {
      return; // Gone already — the next refresh drops it.
    }
    if (stats.isDirectory) return;
    this.knownPaths.add(path);
    await this.indexFile(path, stats.size, 0, force);
  }

  /**
   * Refresh the index: re-walk the tree and diff by path
   * + (size, mtime) — Continue's refresh shape (compute /
   * delete lists), simplified to add / update / remove.
   * Unchanged files are never re-read. Returns the counts.
   */
  async refresh(onProgress?: (p: IndexBuildProgress) => void): Promise<IndexRefreshResult> {
    if (!this.root || this.refused) return { added: 0, updated: 0, removed: 0, files: 0 };
    // A newly added ignore file takes effect here — the
    // walk below drops what it now covers.
    await this.loadIgnoreFiles();
    // Snapshot BEFORE the walk: the walk itself adds every
    // path it sees to knownPaths, so "new" must be measured
    // against the pre-walk state.
    const knownBefore = new Set(this.knownPaths);
    const indexedBefore = new Set(this.files.keys());
    const walked = await this.walk(this.root, 0, onProgress);
    // `seen` is the FULL walk, built up front — the content
    // pass below may stop early on the byte cap / heap
    // guard, and the prune step must not drop files the
    // pass never reached (they still exist; they are just
    // listed, not re-read).
    const seen = new Set(walked.map((f) => f.path));
    let added = 0;
    let updated = 0;
    let done = 0;
    // Re-evaluate the cap from scratch: files deleted since
    // the last build free retained bytes, so a refresh may
    // fit where the last build stopped. The pass below
    // re-trips the flags if it still does not fit (and the
    // heap pre-check re-trips them if the heap is hot).
    this.contentCapped = false;
    this.capped = false;
    // The heap guard, before the content pass (as in build).
    if (this.heapTripped()) {
      this.contentCapped = true;
      this.capped = true;
    }
    for (const file of walked) {
      if (this.contentCapped) break;
      const wasIndexed = indexedBefore.has(file.path);
      const sizeChanged =
        wasIndexed &&
        (this.files.get(file.path)?.size !== file.size ||
          this.files.get(file.path)?.modified !== file.modified);
      await this.indexFile(file.path, file.size, file.modified);
      const isIndexed = this.files.has(file.path);
      if (!knownBefore.has(file.path) && isIndexed) {
        added += 1;
      } else if (wasIndexed && isIndexed && sizeChanged) {
        updated += 1;
      }
      done += 1;
      if (done % 50 === 0) {
        onProgress?.({ phase: 'index', done, total: walked.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (this.heapTripped()) {
          this.contentCapped = true;
          this.capped = true;
          break;
        }
      }
    }
    onProgress?.({ phase: 'index', done, total: walked.length });
    let removed = 0;
    for (const path of [...this.files.keys()]) {
      if (!seen.has(path)) {
        this.removeFileChunks(path);
        this.files.delete(path);
        this.knownPaths.delete(path);
        removed += 1;
      }
    }
    for (const path of [...this.knownPaths]) {
      if (!seen.has(path)) this.knownPaths.delete(path);
    }
    onProgress?.({ phase: 'done', done, total: walked.length });
    return { added, updated, removed, files: this.files.size };
  }

  /**
   * Search the index: trigram match over chunk content +
   * path, scored like Continue's bm25 + path weight —
   * matched-trigram count weighted by inverse document
   * frequency (log(N/df)), with a path match multiplied
   * by the path weight (10x, Continue's
   * pathWeightMultiplier). One result per file (its best
   * chunk), top `n`, above the rank threshold. A query
   * with fewer than 3 characters matches by substring on
   * the path instead (a 2-letter query has no trigram).
   */
  search(query: string, n = 10): IndexSearchResult[] {
    const trimmed = query.trim();
    if (!trimmed || this.chunks.size === 0) return [];
    if (trimmed.length < 3) {
      const lower = trimmed.toLowerCase();
      const hits: IndexSearchResult[] = [];
      for (const chunk of this.chunks.values()) {
        if (chunk.startLine !== 1) continue;
        if (!chunk.path.toLowerCase().includes(lower)) continue;
        hits.push({
          path: chunk.path,
          startLine: 1,
          score: 1,
          snippet: chunk.path,
          symbols: chunk.symbols,
        });
        if (hits.length >= n) break;
      }
      return hits;
    }
    const queryTrigrams = trigrams(trimmed);
    const docCount = this.chunks.size;
    const scores = new Map<number, number>();
    // Distinct query trigrams matched per chunk (the rank
    // threshold counts these) and per chunk path.
    const matched = new Map<number, number>();
    const pathMatched = new Map<number, number>();
    for (const trigram of queryTrigrams) {
      const posting = this.trigramIndex.get(trigram);
      if (!posting) continue;
      // Inverse document frequency: rare trigrams count
      // more (Continue's bm25 shape, simplified to idf).
      const idf = Math.log(1 + docCount / posting.size);
      for (const id of posting) {
        scores.set(id, (scores.get(id) ?? 0) + idf);
        matched.set(id, (matched.get(id) ?? 0) + 1);
        if (this.pathTrigrams.get(id)?.has(trigram)) {
          pathMatched.set(id, (pathMatched.get(id) ?? 0) + 1);
        }
      }
    }
    // Rank threshold: a chunk must match at least a third
    // of the query's trigrams (Continue's
    // RETRIEVAL_PARAMS.bm25Threshold shape — a floor, not
    // a guess: below it the chunk is noise).
    const threshold = Math.max(1, Math.floor(queryTrigrams.size / 3));
    const bestByPath = new Map<string, IndexSearchResult>();
    for (const [id, score] of scores) {
      const chunk = this.chunks.get(id);
      if (!chunk) continue;
      if ((matched.get(id) ?? 0) < threshold) continue;
      // Path weight (Continue's pathWeightMultiplier, 10x):
      // the path must match at least half the query's
      // trigrams — a filename hit is a strong signal, a
      // single shared trigram is not.
      const pathHits = pathMatched.get(id) ?? 0;
      const finalScore = pathHits * 2 >= queryTrigrams.size ? score * 10 : score;
      const existing = bestByPath.get(chunk.path);
      if (!existing || finalScore > existing.score) {
        const snippetLines = chunk.content.split('\n').slice(0, 3).join('\n');
        bestByPath.set(chunk.path, {
          path: chunk.path,
          startLine: chunk.startLine,
          score: finalScore,
          snippet: snippetLines.slice(0, 300),
          symbols: chunk.symbols,
        });
      }
    }
    return [...bestByPath.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  /**
   * Multi-term search — Cursor's "doesn't bet on one
   * seed" (staff post, forum.cursor.com, 2026-07-22):
   * Instant Grep is fast enough that the agent searches
   * several candidate terms in parallel, lists directories
   * and reads files to refine. Each term searches the
   * trigram index on its own; the merge ranks a file
   * matching MORE terms above one matching fewer, then by
   * summed score. One result per file (its best chunk),
   * top `n`.
   */
  searchMultiTerm(terms: string[], n = 10): IndexSearchResult[] {
    const cleaned = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
    if (cleaned.length === 0 || this.chunks.size === 0) return [];
    if (cleaned.length === 1) return this.search(cleaned[0], n);
    const merged = new Map<string, { result: IndexSearchResult; termsMatched: number; score: number }>();
    for (const term of cleaned) {
      for (const result of this.search(term, n)) {
        const existing = merged.get(result.path);
        if (existing) {
          existing.termsMatched += 1;
          existing.score += result.score;
          if (result.score > existing.result.score) existing.result = result;
        } else {
          merged.set(result.path, { result, termsMatched: 1, score: result.score });
        }
      }
    }
    return [...merged.values()]
      .sort((a, b) => b.termsMatched - a.termsMatched || b.score - a.score)
      .slice(0, n)
      .map((entry) => ({ ...entry.result, score: entry.score }));
  }

  /** Glob over known paths (minimatch — already a Lucid
   *  dependency). A bare basename (`foo.ts`) matches any
   *  depth; a pattern with a slash is matched against the
   *  path relative to the workspace root. */
  glob(pattern: string): string[] {
    const trimmed = pattern.trim();
    if (!trimmed) return [];
    const root = this.root ?? '';
    const withDepth = trimmed.includes('/') ? trimmed : `**/${trimmed}`;
    const out: string[] = [];
    for (const path of this.knownPaths) {
      const relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
      if (minimatch(relative, withDepth, { dot: true }) || minimatch(path, withDepth, { dot: true })) {
        out.push(path);
      }
    }
    return out.sort();
  }

  /** Find a symbol by name in the index's symbol table
   *  (exact name first, then prefix). The find_symbol tool
   *  merges this with the LSP's document symbols for open
   *  files — the index is the broad table, the LSP is the
   *  precise one. */
  findSymbol(name: string): Array<{ path: string; line: number; kind: string }> {
    const lower = name.toLowerCase();
    const exact: Array<{ path: string; line: number; kind: string }> = [];
    const prefix: Array<{ path: string; line: number; kind: string }> = [];
    for (const file of this.files.values()) {
      for (const symbol of file.symbols) {
        if (symbol.name === name) {
          exact.push({ path: file.path, line: symbol.line, kind: symbol.kind });
        } else if (symbol.name.toLowerCase().startsWith(lower)) {
          prefix.push({ path: file.path, line: symbol.line, kind: symbol.kind });
        }
      }
    }
    return [...exact, ...prefix].slice(0, 20);
  }

  /** Drop everything (tests / workspace switch). */
  reset(): void {
    this.root = null;
    this.built = false;
    this.building = null;
    this.taskReady = false;
    this.ignoreSet = null;
    this.files.clear();
    this.chunks.clear();
    this.trigramIndex.clear();
    this.pathTrigrams.clear();
    this.knownPaths.clear();
    this.capped = false;
    this.indexedBytes = 0;
    this.contentCapped = false;
    this.refused = null;
  }
}
