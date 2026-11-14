/**
 * The workspace file index — the agent's `@codebase`
 * (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue's indexing: the
 * content-addressed refresh (`core/indexing/README.md` —
 * a refresh produces compute / delete / addTag / removeTag
 * lists, and each index artifact implements `update()` over
 * them), the SQLite FTS5 trigram index
 * (`core/indexing/FullTextSearchCodebaseIndex.ts` —
 * `CREATE VIRTUAL TABLE fts USING fts5(path, content,
 * tokenize='trigram')`, ranked by bm25 with the path
 * column weighted 10x), the security ignore list
 * (`core/indexing/ignore.ts` — secrets never enter the
 * index), and the hybrid retrieval quota idea (recent /
 * FTS / embeddings — here: recent-edited files first,
 * then FTS, no embeddings yet).
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
    if (AGENT_DENIED_DIR_NAMES.includes(segment)) return true;
  }
  const base = segments[segments.length - 1] ?? '';
  for (const pattern of AGENT_DENIED_FILE_PATTERNS) {
    if (minimatch(base, pattern, { dot: true })) return true;
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
  private root: string | null = null;
  private built = false;
  private building: Promise<void> | null = null;
  private files = new Map<string, IndexedFile>();
  private chunks = new Map<number, IndexedChunk>();
  private trigramIndex = new Map<string, Set<number>>();
  private pathTrigrams = new Map<number, Set<string>>();
  private nextChunkId = 1;
  /** Files the walk saw but did not read (too big /
   *  binary) — still known to glob. */
  private knownPaths = new Set<string>();
  /** True when the walk hit the file cap (reported, not
   *  silent — the index is partial then). */
  capped = false;

  constructor(host: AgentHost) {
    this.host = host;
  }

  get workspaceRoot(): string | null {
    return this.root;
  }

  get isBuilt(): boolean {
    return this.built;
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

  /** Build (or rebuild) the index over a workspace root.
   *  Async and chunked: it yields to the event loop every
   *  50 files, so the build never blocks the composer.
   *  Safe to call repeatedly — a build already in flight
   *  is shared, and a built index for the same root is a
   *  no-op (use refresh() for updates). */
  async build(root: string): Promise<void> {
    if (this.built && this.root === root) return;
    if (this.building) {
      await this.building;
      return;
    }
    this.building = this.buildNow(root);
    try {
      await this.building;
    } finally {
      this.building = null;
    }
  }

  private async buildNow(root: string): Promise<void> {
    this.root = normalizePosixPath(root);
    this.files.clear();
    this.chunks.clear();
    this.trigramIndex.clear();
    this.pathTrigrams.clear();
    this.knownPaths.clear();
    this.capped = false;
    const walked = await this.walk(this.root, 0);
    let done = 0;
    for (const file of walked) {
      await this.indexFile(file.path, file.size, file.modified);
      done += 1;
      if (done % 50 === 0) {
        // Yield — the build never blocks the composer.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    this.built = true;
  }

  /** Walk the tree (readDir per directory, depth-capped,
   *  ignore-aware). Returns the files found, in walk
   *  order. A file the walk sees is a file the index
   *  knows — the walk is the fix for the search miss. */
  private async walk(
    dir: string,
    depth: number,
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
      if (entry.isDirectory) {
        if (AGENT_DENIED_DIR_NAMES.includes(entry.name)) continue;
        out.push(...(await this.walk(path, depth + 1)));
        continue;
      }
      if (!entry.isFile) continue;
      this.knownPaths.add(path);
      out.push({ path, size: entry.size, modified: entry.modified });
    }
    return out;
  }

  /** Index one file: read it (unless too big / binary),
   *  hash it, chunk it, add its trigrams. A file whose
   *  size+mtime match the stored entry is skipped — the
   *  refresh path, not the build path. */
  private async indexFile(path: string, size: number, modified: number): Promise<void> {
    const existing = this.files.get(path);
    if (existing && existing.size === size && existing.modified === modified) return;
    if (size > MAX_INDEX_BYTES || isIgnoredPath(path)) {
      // Listed (knownPaths) but never read — the path is
      // searchable, the content is not.
      this.removeFileChunks(path);
      if (existing) this.files.delete(path);
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
  }

  private removeFileChunks(path: string): void {
    const existing = this.files.get(path);
    if (!existing) return;
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
   * one stat + one read).
   */
  async indexOne(path: string): Promise<void> {
    if (!this.root) return;
    let stats;
    try {
      stats = await this.host.getStats(path);
    } catch {
      return; // Gone already — the next refresh drops it.
    }
    if (stats.isDirectory) return;
    this.knownPaths.add(path);
    await this.indexFile(path, stats.size, 0);
  }

  /**
   * Refresh the index: re-walk the tree and diff by path
   * + (size, mtime) — Continue's refresh shape (compute /
   * delete lists), simplified to add / update / remove.
   * Unchanged files are never re-read. Returns the counts.
   */
  async refresh(): Promise<IndexRefreshResult> {
    if (!this.root) return { added: 0, updated: 0, removed: 0, files: 0 };
    // Snapshot BEFORE the walk: the walk itself adds every
    // path it sees to knownPaths, so "new" must be measured
    // against the pre-walk state.
    const knownBefore = new Set(this.knownPaths);
    const indexedBefore = new Set(this.files.keys());
    const walked = await this.walk(this.root, 0);
    const seen = new Set<string>();
    let added = 0;
    let updated = 0;
    let done = 0;
    for (const file of walked) {
      seen.add(file.path);
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
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
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
    this.files.clear();
    this.chunks.clear();
    this.trigramIndex.clear();
    this.pathTrigrams.clear();
    this.knownPaths.clear();
    this.capped = false;
  }
}
