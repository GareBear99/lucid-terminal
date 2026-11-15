/**
 * Project find-and-replace, main process (Atom steal #5 —
 * 2026-11-14).
 *
 * Atom's `find-and-replace` searches the project with
 * ripgrep and replaces in the matched files. The main
 * process runs `rg --json` (respecting .gitignore, as rg
 * does by default) and hands matches over IPC; when
 * ripgrep is missing it falls back to a Node recursive
 * scan (slower, same results shape — the response says
 * which engine ran, never faked). The replace handler
 * rewrites only the matched spans, only inside the searched
 * root: every file is resolved and checked against the root
 * before it is read or written, and the root itself must sit
 * inside the user's home directory.
 *
 * Caps: 50 matches per file (rg --max-count), 1,000 total
 * (truncated=true when the cap stops the search early), 30 s
 * per search, 1 MB per file in the Node fallback (larger
 * files are skipped, not read into memory).
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import type { IpcMain } from 'electron';
import { app } from 'electron';
import {
  buildSearchPattern,
  applyReplacements,
  SEARCH_MAX_RESULTS,
  SEARCH_MAX_PER_FILE,
  type SearchMatch,
  type SearchOptions,
  type SearchResult,
  type SearchEngine,
} from '../../src/lib/projectSearch';

/** Directories the Node fallback never descends into. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.turbo',
]);

/** Files the Node fallback never reads (over 1 MB). */
const NODE_MAX_FILE_BYTES = 1024 * 1024;
/** Bytes sniffed for a NUL (binary detection). */
const BINARY_SNIFF_BYTES = 8192;

export interface SearchHandlerOptions {
  /** Home directory (injected in tests; defaults to the
   *  app's home path). The search root must sit inside it. */
  getHomeDir?: () => string;
  /** Ripgrep lookup (injected in tests to force the Node
   *  fallback). Defaults to running `rg --version`. */
  checkRipgrep?: () => Promise<boolean>;
}

function isPathInside(dir: string, root: string): boolean {
  const rel = path.relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function runRipgrep(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      'rg',
      args,
      { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 2
              : 0;
        resolve({ code, stdout: stdout ?? '' });
      },
    );
  });
}

async function ripgrepAvailable(
  check?: () => Promise<boolean>,
): Promise<boolean> {
  if (check) return check();
  try {
    await runRipgrep(['--version']);
    return true;
  } catch {
    return false;
  }
}

interface RgJsonLine {
  type?: string;
  data?: {
    path?: { text?: string };
    line_number?: number;
    lines?: { text?: string };
    submatches?: Array<{
      match?: { text?: string };
      start?: number;
      end?: number;
    }>;
  };
}

/** Parse `rg --json` stdout into matches (up to the cap).
 *  Paths come back relative to the search root (rg is run
 *  with cwd=root, searching '.') — they are resolved against
 *  `root` here, so every match carries an absolute path. */
export function parseRipgrepJson(
  stdout: string,
  maxResults: number = SEARCH_MAX_RESULTS,
  root?: string,
): { matches: SearchMatch[]; truncated: boolean } {
  const matches: SearchMatch[] = [];
  let truncated = false;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    if (matches.length >= maxResults) {
      truncated = true;
      break;
    }
    let parsed: RgJsonLine;
    try {
      parsed = JSON.parse(line) as RgJsonLine;
    } catch {
      continue;
    }
    if (parsed.type !== 'match' || !parsed.data) continue;
    const rawPath = parsed.data.path?.text;
    const lineNumber = parsed.data.line_number;
    const text = (parsed.data.lines?.text ?? '').replace(/\r?\n$/, '');
    if (!rawPath || lineNumber === undefined) continue;
    const file =
      root && !path.isAbsolute(rawPath) ? path.resolve(root, rawPath) : rawPath;
    for (const sub of parsed.data.submatches ?? []) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }
      const matchText = sub.match?.text ?? '';
      const start = sub.start ?? 0;
      matches.push({
        file,
        line: lineNumber,
        column: start + 1,
        text,
        matchText,
      });
    }
  }
  return { matches, truncated };
}

/** The Node fallback: a recursive scan with the same
 *  result shape as ripgrep. Skips the SKIP_DIRS set, hidden
 *  directories, files over 1 MB, and binary files (a NUL in
 *  the first 8 KB). */
export async function nodeSearch(
  root: string,
  options: SearchOptions,
  maxResults: number = SEARCH_MAX_RESULTS,
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  const { source, flags } = buildSearchPattern(options);
  const regex = new RegExp(source, flags);
  const matches: SearchMatch[] = [];
  let truncated = false;

  const scanFile = async (file: string): Promise<boolean> => {
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      return true;
    }
    if (!stat.isFile() || stat.size > NODE_MAX_FILE_BYTES) return true;
    let buffer: Buffer;
    try {
      const handle = await fs.open(file, 'r');
      try {
        const sniff = Buffer.alloc(BINARY_SNIFF_BYTES);
        const { bytesRead } = await handle.read(sniff, 0, BINARY_SNIFF_BYTES, 0);
        if (sniff.subarray(0, bytesRead).includes(0)) return true;
        buffer = await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch {
      return true;
    }
    const content = buffer.toString('utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(lines[i])) !== null) {
        if (matches.length >= maxResults) {
          truncated = true;
          return false;
        }
        matches.push({
          file,
          line: i + 1,
          column: m.index + 1,
          text: lines[i],
          matchText: m[0],
        });
        if (m[0].length === 0) regex.lastIndex += 1;
      }
    }
    return true;
  };

  const walk = async (dir: string): Promise<boolean> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        if (!(await walk(full))) return false;
      } else if (entry.isFile()) {
        if (!(await scanFile(full))) return false;
      }
    }
    return true;
  };

  if (options.scope === 'file' && options.file) {
    await scanFile(options.file);
  } else {
    await walk(root);
  }
  return { matches, truncated };
}

export function setupSearchHandlers(
  ipcMain: IpcMain,
  handlerOptions: SearchHandlerOptions = {},
): void {
  const getHomeDir =
    handlerOptions.getHomeDir ?? (() => app.getPath('home'));

  ipcMain.handle(
    'search:search',
    async (
      _event: unknown,
      args: { root: string; options: SearchOptions },
    ): Promise<SearchResult> => {
      const root = path.resolve(args.root ?? '');
      const options = args.options;
      const home = path.resolve(getHomeDir());
      if (!root || !isPathInside(root, home)) {
        throw new Error('Search root must be inside the home directory');
      }
      if (!options?.query) throw new Error('Search query is empty');
      // An invalid regex fails fast with the engine's message.
      buildSearchPattern(options);

      const searchPath =
        options.scope === 'file' && options.file
          ? path.resolve(options.file)
          : root;
      if (!isPathInside(searchPath, root)) {
        throw new Error('Search path must be inside the search root');
      }

      let engine: SearchEngine = 'ripgrep';
      if (await ripgrepAvailable(handlerOptions.checkRipgrep)) {
        const { source } = buildSearchPattern(options);
        const rgArgs: string[] = [
          '--json',
          '--no-heading',
          '--line-number',
          '--column',
          '--max-count',
          String(SEARCH_MAX_PER_FILE),
        ];
        // The same exclusions the Node fallback applies (rg
        // only skips these when a .gitignore says so — a
        // fresh project has none, so the globs keep the two
        // engines in agreement). rg runs with cwd=root and
        // searches '.', so the globs are root-relative and the
        // returned paths resolve against the root.
        for (const dir of SKIP_DIRS) {
          rgArgs.push('--glob', `!${dir}/**`);
        }
        if (!options.regex) rgArgs.push('--fixed-strings');
        if (!options.caseSensitive) rgArgs.push('--ignore-case');
        // Whole-word in literal mode is rg's --word; in regex
        // mode the built source already carries the \b wrap.
        if (options.wholeWord && !options.regex) rgArgs.push('--word');
        const isFileScope = options.scope === 'file' && options.file;
        rgArgs.push(
          '--',
          options.regex ? source : options.query,
          isFileScope ? path.basename(searchPath) : '.',
        );
        const { code, stdout } = await runRipgrep(
          rgArgs,
          isFileScope ? path.dirname(searchPath) : root,
        );
        if (code === 0 || code === 1) {
          // 0 = matches, 1 = no matches — both are answers.
          const { matches, truncated } = parseRipgrepJson(
            stdout,
            SEARCH_MAX_RESULTS,
            isFileScope ? path.dirname(searchPath) : root,
          );
          return { matches, truncated, engine, root };
        }
        // code 2 = rg errored (bad regex slipped past the
        // builder, unreadable path, …) — fall through to the
        // Node scan rather than failing the search.
        engine = 'node';
      } else {
        engine = 'node';
      }
      const { matches, truncated } = await nodeSearch(root, options);
      return { matches, truncated, engine, root };
    },
  );

  ipcMain.handle(
    'search:replace',
    async (
      _event: unknown,
      args: { root: string; replacement: string; matches: SearchMatch[] },
    ): Promise<{ filesChanged: number; replacedCount: number }> => {
      const root = path.resolve(args.root ?? '');
      const home = path.resolve(getHomeDir());
      if (!root || !isPathInside(root, home)) {
        throw new Error('Replace root must be inside the home directory');
      }
      const replacement = args.replacement ?? '';
      const byFile = new Map<string, SearchMatch[]>();
      for (const match of args.matches ?? []) {
        const file = path.resolve(match.file);
        if (!isPathInside(file, root)) {
          throw new Error(`Refusing to write outside the search root: ${match.file}`);
        }
        const list = byFile.get(file) ?? [];
        list.push(match);
        byFile.set(file, list);
      }
      let filesChanged = 0;
      let replacedCount = 0;
      for (const [file, fileMatches] of byFile) {
        const content = await fs.readFile(file, 'utf8');
        const { content: next, replacedCount: n } = applyReplacements(
          content,
          fileMatches,
          replacement,
        );
        if (n === 0) continue;
        await fs.writeFile(file, next, 'utf8');
        filesChanged += 1;
        replacedCount += n;
      }
      return { filesChanged, replacedCount };
    },
  );
}
