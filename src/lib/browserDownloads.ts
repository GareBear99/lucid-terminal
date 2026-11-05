import type { BrowserDownload } from '../types';

/**
 * Pure download helpers, shared by the main-process handler and
 * the renderer's shelf (Area 2).
 *
 * This module has NO Node and NO Electron dependency, so both sides
 * can import it: the handler (`electron/services/browserDownloads.ts`)
 * and the shelf (`src/components/Browser/DownloadShelf.tsx`) agree on
 * what "1.5 MB" means and on how a file name is sanitised. The
 * Electron service re-exports these, so tests can import them from
 * either place.
 *
 * No Node builtins here on purpose: the renderer bundle runs with
 * `nodeIntegration: false`, so a `path` import leaves a bare
 * `require("path")` in the bundle and the whole app fails to mount
 * (blank window). The three helpers below are small POSIX
 * `path.basename` / `path.extname` / `path.join` re-implementations,
 * verified against Node's own results (see the parity tests in
 * `tests/browserDownloads.test.ts`).
 */

/** POSIX `path.basename` for `/`-separated input: the last component,
 * with trailing slashes stripped. `''` and all-slash input give `''`
 * (Node's result, not `'.'` or `'/'`). */
function posixBasename(p: string): string {
  let end = p.length;
  while (end > 0 && p.charCodeAt(end - 1) === 47 /* / */) end -= 1;
  if (end === 0) return '';
  let start = end;
  while (start > 0 && p.charCodeAt(start - 1) !== 47 /* / */) start -= 1;
  return p.slice(start, end);
}

/** POSIX `path.extname`: the `.ext` of the last component, or `''`
 * when there is none — including for dotfiles (`.hidden` → `''`).
 * The one case the `lastIndexOf` shortcut gets wrong is `..`
 * (Node returns `''` there), so it is pinned explicitly. */
function posixExtname(p: string): string {
  const base = posixBasename(p);
  if (base === '..') return '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return '';
  return base.slice(idx);
}

/** POSIX `path.join` + `path.normalize`: empty parts are skipped,
 * `.` segments dropped, `..` resolved (never above the root for
 * absolute paths), slashes collapsed. */
function posixJoin(...parts: string[]): string {
  let joined = '';
  for (const part of parts) {
    if (part.length > 0) joined = joined === '' ? part : `${joined}/${part}`;
  }
  if (joined === '') return '.';
  const isAbsolute = joined.charCodeAt(0) === 47 /* / */;
  const out: string[] = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!isAbsolute) out.push('..');
      continue;
    }
    out.push(seg);
  }
  const result = (isAbsolute ? '/' : '') + out.join('/');
  return result === '' ? (isAbsolute ? '/' : '.') : result;
}

/** Strip a site-supplied file name down to something safe to put on
 * disk: basename only (no `../`, no separators), no control
 * characters, and a fallback when nothing is left. */
export function sanitizeDownloadFilename(name: string): string {
  // Normalise backslashes first: our basename only splits on `/`,
  // so a Windows-style path from a site (`C:\Users\gary\secret.txt`)
  // would otherwise survive as one mangled name instead of its
  // basename.
  const normalized = (name ?? '').replace(/\\/g, '/');
  const base = posixBasename(normalized);
  const cleaned = base.replace(/[<>:\"/\\|?*\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'download';
}

/** Pick a path in `folder` for `filename` that does not already
 * exist: `name.ext`, then `name (1).ext`, `name (2).ext`, … — so a
 * re-download never silently overwrites the first copy. `exists`
 * is injected so tests can fake the disk. */
export function uniqueDownloadPath(
  folder: string,
  filename: string,
  exists: (p: string) => boolean,
): string {
  const clean = sanitizeDownloadFilename(filename);
  const ext = posixExtname(clean);
  const stem = ext ? clean.slice(0, -ext.length) : clean;
  let candidate = posixJoin(folder, clean);
  let n = 1;
  while (exists(candidate)) {
    candidate = posixJoin(folder, `${stem} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

/** 0–1 progress, or null when the total is unknown (indeterminate
 * bar in the shelf). */
export function downloadProgress(d: BrowserDownload): number | null {
  if (!d.totalBytes || d.totalBytes <= 0) return null;
  return Math.min(1, Math.max(0, d.receivedBytes / d.totalBytes));
}

/** Human size for the shelf: `1.5 MB`, `840 B`, … */
export function formatDownloadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text =
    unit === 0
      ? `${Math.round(value)}`
      : value >= 100
        ? `${Math.round(value)}`
        : value.toFixed(1);
  return `${text} ${units[unit]}`;
}
