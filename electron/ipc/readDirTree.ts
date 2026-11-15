/**
 * Recursive directory read — the `fs:readDir` work, extracted so
 * tests can run it without Electron and so the worker thread
 * (`electron/workers/readDirWorker.ts`) can run the exact same
 * implementation as the main process (one implementation, not a
 * copy). `electron/ipc/fileSystem.ts` re-exports this module and
 * its handler delegates to {@link readDirTreeViaWorker}.
 *
 * Depth 1 by default: the top level only, children left undefined
 * for lazy loading on expand. The startup file-explorer load reads
 * only the top level, so it never descends into Desktop / Documents
 * / Downloads and never prompts. Deeper reads still skip the
 * protected folders below the root (defense in depth) — a caller
 * that recurses from the home directory must not silently walk
 * into them.
 *
 * Two hang classes are closed here (Item 0, sweep fixes):
 * symlinks are never followed (`lstat`, not `stat` — a symlink
 * to a sleeping volume used to block the whole walk on its
 * target), and a subdirectory branch that never settles is
 * dropped after READ_DIR_BRANCH_TIMEOUT_MS instead of bricking
 * the index — the rest of the tree still returns.
 *
 * Step 5 of the files-section fix (2026-11-15): the recursive
 * walk runs in a worker thread (see readDirTreeViaWorker), each
 * directory's .gitignore is honoured (src/lib/gitignore.ts), and
 * the descend skip list covers the home cache/config dirs that
 * used to be walked at depth >= 2 (.Trash, .npm, .cache, ...).
 */
import { Worker } from 'worker_threads';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  parseGitignore,
  isIgnoredByRulesets,
  type GitignorePattern,
  type GitignoreRuleset,
} from '../../src/lib/gitignore';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  children?: FileEntry[];
}

export interface ReadDirOptions {
  /**
   * How many levels to include. 1 = the directory's own entries
   * only (children left undefined — the caller loads them lazily
   * on expand). Deeper levels recurse that far. Defaults to 1.
   */
  depth?: number;
  /**
   * Stop collecting once this many entries (files + directories)
   * have been gathered — bounds the walk and the IPC payload for
   * huge trees (the fuzzy finder's home-rooted walk used to walk
   * the whole home tree before the renderer capped it at 5,000
   * files). Omit for no cap (the file explorer's shallow reads).
   */
  maxEntries?: number;
  /**
   * Wall-clock deadline per recursive branch (see
   * readDirTree). Omit for the default
   * (READ_DIR_BRANCH_TIMEOUT_MS).
   */
  branchTimeoutMs?: number;
}

/**
 * Directories macOS protects with a per-folder prompt (TCC "Files
 * and Folders") plus Library, which holds the Full Disk Access
 * locations (Mail, Messages) and is enormous to walk. A recursive
 * read must never descend into one of these unless the user
 * explicitly opened that folder as the root — descending into all
 * three user folders at once is what asked Gary for his files
 * 3 times on startup (Gary, 2026-11-08 ~07:22 PST): the startup
 * file-explorer load walked the whole home directory, so macOS
 * prompted once for Desktop, once for Documents, once for
 * Downloads. The prompt is per folder, so three folders = three
 * prompts. Skipping them in recursion (and loading only the top
 * level by default) means startup touches no protected folder
 * and prompts zero times; a folder the user explicitly opened
 * still prompts once for that folder, which is correct.
 */
export const TCC_PROTECTED_DIR_NAMES: readonly string[] = [
  'Desktop',
  'Documents',
  'Downloads',
  'Library',
];

/**
 * Home cache/config/output dirs that must never be descended into
 * below the root (step 5, files-section fix). They are still
 * LISTED at depth 1 — the skip only gates recursion, like the
 * TCC list — so the user can still open one explicitly; the walk
 * just never wanders into `.npm` (tens of thousands of tiny
 * files), `.Trash`, `.cache`, or a `.next` / `.turbo` build
 * output on its own. `Applications` is the macOS user
 * Applications folder (a whole app bundle tree, not source).
 */
export const SKIP_DESCEND_DIR_NAMES: readonly string[] = [
  '.Trash',
  '.thumbnails',
  '.npm',
  '.cache',
  '.openclaw',
  '.matplotlib',
  '.warp',
  '.vscode',
  '.luciferai',
  'Applications',
  '.next',
  '.turbo',
];

/**
 * Per-branch wall-clock deadline for a recursive read. A single
 * hung filesystem call (a stat/readdir that never returns — a
 * symlink to a sleeping volume, a stale mount, an iCloud edge)
 * used to block the whole walk, so the finder's 30 s renderer
 * timeout fired and ⌘P settled on "No files in this project"
 * with an empty index (Atom rest live check, 2026-11-14). Each
 * subdirectory branch now races this deadline; a branch that
 * never settles is dropped (its entry stays, children
 * undefined — lazy-loadable like a depth-1 read) and the rest
 * of the tree still comes back. The renderer timeout is the
 * outer bound; this is the per-branch one, well inside it.
 */
export const READ_DIR_BRANCH_TIMEOUT_MS = 10_000;

/**
 * Overall deadline for a worker-thread walk (see
 * readDirTreeViaWorker). Inside the Finder's 30 s renderer
 * timeout with headroom for IPC serialisation, so a hung worker
 * fails the IPC call instead of leaving the renderer waiting
 * past its own deadline.
 */
export const READ_DIR_WORKER_TIMEOUT_MS = 25_000;

/** The filesystem surface readDirTree needs — the real
 * `fs/promises` module in production, a fake in tests (a hung
 * branch is only testable with an injected readdir that never
 * resolves). */
export interface ReadDirTreeFS {
  readdir: (
    path: string,
    options: { withFileTypes: true },
  ) => Promise<
    Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  >;
  lstat: (path: string) => Promise<{ size: number; mtimeMs: number }>;
  /**
   * Best-effort .gitignore reads. Optional so existing fakes keep
   * working — absent means no .gitignore rules (same as a
   * missing/unreadable .gitignore). The real `fs/promises`
   * module provides it.
   */
  readFile?: (path: string, encoding: 'utf-8') => Promise<string>;
}

export async function readDirTree(
  dirPath: string,
  options?: ReadDirOptions,
  io: ReadDirTreeFS = fs,
): Promise<FileEntry[]> {
  const depth = Math.max(1, Math.floor(options?.depth ?? 1));
  const maxEntries = options?.maxEntries;
  const branchTimeoutMs =
    options?.branchTimeoutMs ?? READ_DIR_BRANCH_TIMEOUT_MS;
  let collected = 0;

  // .gitignore rules per directory, read once per walk (a missing
  // or unreadable .gitignore means no rules for that directory).
  // The cache lives for this walk only, never across walks — a
  // .gitignore edited between two reads is picked up by the next
  // one.
  const gitignoreCache = new Map<string, GitignorePattern[] | null>();

  async function readGitignore(dir: string): Promise<GitignorePattern[] | null> {
    const cached = gitignoreCache.get(dir);
    if (cached !== undefined) return cached;
    let patterns: GitignorePattern[] | null = null;
    try {
      const content = await io.readFile?.(
        path.join(dir, '.gitignore'),
        'utf-8',
      );
      if (content !== undefined) patterns = parseGitignore(content);
    } catch {
      // Missing / unreadable .gitignore = no rules.
      patterns = null;
    }
    gitignoreCache.set(dir, patterns);
    return patterns;
  }

  // Race a branch against its deadline; undefined means the
  // branch never settled (or its readdir threw) and is dropped.
  // The dangling branch keeps running in the background but its
  // result is discarded — it can only touch `collected`, never
  // the returned tree (each level builds its own results array).
  function withBranchTimeout<T>(
    promise: Promise<T>,
    ms: number,
  ): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    });
    return Promise.race([
      promise.then(
        (value) => value,
        () => undefined,
      ),
      timeout,
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  // Never descend into these below the root — the root itself
  // is always listed (the user explicitly opened it), but its
  // protected subfolders are not walked into uninvited.
  function shouldDescend(name: string, fullPath: string): boolean {
    if (
      name === 'node_modules' ||
      name === '.git' ||
      name === '.DS_Store' ||
      name === 'dist' ||
      name === 'build' ||
      SKIP_DESCEND_DIR_NAMES.includes(name)
    ) {
      return false;
    }
    const isProtected = TCC_PROTECTED_DIR_NAMES.includes(name);
    const isRoot = fullPath === dirPath;
    return !(isProtected && !isRoot);
  }

  async function readDirRecursive(
    currentPath: string,
    remainingDepth: number,
    parentRules: readonly GitignoreRuleset[],
  ): Promise<FileEntry[]> {
    let entries;
    try {
      entries = await io.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Failed to read directory: ${error}`);
    }
    // This directory's own .gitignore joins the stack for its
    // whole subtree (deeper rules win over shallower ones).
    const ownRules = await readGitignore(currentPath);
    const rules: readonly GitignoreRuleset[] =
      ownRules && ownRules.length > 0
        ? [...parentRules, { base: currentPath, patterns: ownRules }]
        : parentRules;
    const results: FileEntry[] = [];
    const branches: Array<{
      entry: FileEntry;
      promise: Promise<FileEntry[] | undefined>;
    }> = [];
    for (const entry of entries) {
      // Budget hit — stop collecting at this level (branches
      // already spawned keep their own budget checks).
      if (maxEntries !== undefined && collected >= maxEntries) break;
      const fullPath = path.join(currentPath, entry.name);
      const isDirectory = entry.isDirectory();
      // .gitignore match (this level's stack, dirent's own
      // isDirectory — no lstat spent on an ignored entry).
      // Ignored entries are skipped entirely: not listed, not
      // descended into, and they consume no budget. The
      // .gitignore file itself is never matched by its own rules
      // (its base is this directory), so it stays listed.
      if (isIgnoredByRulesets(rules, fullPath, isDirectory)) continue;
      let stats;
      try {
        // lstat, never stat: a symlink's target is never
        // touched (a link to a sleeping volume used to block
        // the whole walk). Dirent already reports the link
        // itself as neither file nor directory.
        stats = await io.lstat(fullPath);
      } catch {
        // Skip entries we can't access
        continue;
      }
      const fileEntry: FileEntry = {
        name: entry.name,
        path: fullPath,
        isDirectory,
        isFile: entry.isFile(),
        size: stats.size,
        modified: stats.mtimeMs,
        children: undefined,
      };
      // Check + count + push in one synchronous stretch — no
      // await between them — so concurrent branches can never
      // push the total past maxEntries.
      if (maxEntries !== undefined && collected >= maxEntries) break;
      results.push(fileEntry);
      collected += 1;
      if (
        isDirectory &&
        remainingDepth > 1 &&
        shouldDescend(entry.name, fullPath) &&
        (maxEntries === undefined || collected < maxEntries)
      ) {
        branches.push({
          entry: fileEntry,
          promise: withBranchTimeout(
            readDirRecursive(fullPath, remainingDepth - 1, rules),
            branchTimeoutMs,
          ),
        });
      }
    }
    // Branches run concurrently; a timed-out branch keeps its
    // entry with children undefined (lazy-loadable), like a
    // depth-1 read.
    const settled = await Promise.all(branches.map((b) => b.promise));
    branches.forEach((b, i) => {
      if (settled[i] !== undefined) b.entry.children = settled[i];
    });

    // Sort: directories first, then alphabetically
    return results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  return await readDirRecursive(dirPath, depth, []);
}

// ---------------------------------------------------------------------------
// Worker-thread walk (step 5)
// ---------------------------------------------------------------------------

/**
 * Where the compiled worker lives, in every layout this repo
 * produces. The tsc node build emits
 * `dist-electron/electron/workers/readDirWorker.js` (rootDir is
 * the repo root — src/lib is pulled in as a dependency); the
 * vite-bundled main is `dist-electron/main.js`, so from the main
 * process `__dirname` is `dist-electron`. The extra candidates
 * cover a main that lives under `dist-electron/electron/` and a
 * future rootDir of `electron/` (`dist-electron/workers/...`),
 * plus a repo-root CWD in dev. First file that exists wins;
 * none exists (dev without a node tsc run) means "walk
 * in-process" — the worker is a performance move, never a
 * correctness dependency.
 */
export function resolveReadDirWorkerPath(): string | undefined {
  const base =
    typeof __dirname === 'string' ? __dirname : process.cwd();
  const candidates = [
    path.join(base, 'electron/workers/readDirWorker.js'),
    path.join(base, 'workers/readDirWorker.js'),
    path.join(process.cwd(), 'dist-electron/electron/workers/readDirWorker.js'),
    path.join(process.cwd(), 'dist-electron/workers/readDirWorker.js'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // A stat that throws is a "no" for this candidate.
    }
  }
  return undefined;
}

export interface ReadDirWorkerOverrides {
  /** Test seam: use this worker file instead of the resolved one. */
  workerPath?: string;
  /** Test seam: overall deadline in ms. */
  timeoutMs?: number;
}

/**
 * Recursive walk via a worker thread when there is one to use.
 * Depth-1 reads stay in-process — one readdir plus a few stats
 * is cheaper than spawning a worker (~tens of ms) for every
 * folder expand in the Explorer. The recursive walk (the stat
 * storm) is what moves off the main process.
 *
 * Timeout: the caller races the worker against
 * READ_DIR_WORKER_TIMEOUT_MS and terminates it on expiry, so a
 * hung worker fails the IPC call instead of hanging it — the
 * handler throws, like the renderer's own 30 s timeout path.
 * A worker that cannot spawn or dies (e.g. an asar path the
 * loader cannot open in the packaged app) falls back to the
 * in-process walk rather than failing the read.
 */
export async function readDirTreeViaWorker(
  dirPath: string,
  options?: ReadDirOptions,
  overrides?: ReadDirWorkerOverrides,
): Promise<FileEntry[]> {
  const effectiveDepth = Math.max(1, Math.floor(options?.depth ?? 1));
  if (effectiveDepth <= 1) return readDirTree(dirPath, options);
  const workerPath = overrides?.workerPath ?? resolveReadDirWorkerPath();
  if (!workerPath) return readDirTree(dirPath, options);
  const timeoutMs = overrides?.timeoutMs ?? READ_DIR_WORKER_TIMEOUT_MS;

  let worker: Worker;
  try {
    worker = new Worker(workerPath);
  } catch {
    // Exists on disk but cannot be spawned — walk in-process.
    return readDirTree(dirPath, options);
  }

  try {
    return await new Promise<FileEntry[]>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        reject(
          new Error(
            `fs:readDir worker timed out after ${timeoutMs} ms (dir: ${dirPath})`,
          ),
        );
      }, timeoutMs);
      const done = (): void => {
        clearTimeout(timer);
        void worker.terminate();
      };
      worker.once(
        'message',
        (msg: { ok: boolean; tree?: FileEntry[]; error?: string }) => {
          if (settled) return;
          settled = true;
          done();
          if (msg.ok && msg.tree) resolve(msg.tree);
          else reject(new Error(msg.error ?? 'fs:readDir worker failed'));
        },
      );
      worker.once('error', () => {
        if (settled) return;
        settled = true;
        done();
        // Died after construction — walk in-process instead.
        readDirTree(dirPath, options).then(resolve, reject);
      });
      worker.once('exit', (code) => {
        if (settled) return;
        settled = true;
        done();
        if (code === 0) {
          reject(
            new Error('fs:readDir worker exited without returning a tree'),
          );
        } else {
          readDirTree(dirPath, options).then(resolve, reject);
        }
      });
      worker.postMessage({ dirPath, options });
    });
  } finally {
    // Terminate is idempotent; every path above already
    // terminated — this covers the synchronous-throw path.
    void worker.terminate();
  }
}
