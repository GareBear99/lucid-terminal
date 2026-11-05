import * as path from 'path';
import type { BrowserDownload } from '../types';

/**
 * Pure download helpers, shared by the main-process handler and
 * the renderer's shelf (Area 2).
 *
 * This module has NO Electron dependency, so both sides can import
 * it: the handler (`electron/services/browserDownloads.ts`) and the
 * shelf (`src/components/Browser/DownloadShelf.tsx`) agree on what
 * "1.5 MB" means and on how a file name is sanitised. The Electron
 * service re-exports these, so tests can import them from either
 * place.
 */

/** Strip a site-supplied file name down to something safe to put on
 * disk: basename only (no `../`, no separators), no control
 * characters, and a fallback when nothing is left. */
export function sanitizeDownloadFilename(name: string): string {
  // Normalise backslashes first: on POSIX, path.basename does not
  // treat `\` as a separator, so a Windows-style path from a site
  // (`C:\Users\gary\secret.txt`) would otherwise survive as one
  // mangled name instead of its basename.
  const normalized = (name ?? '').replace(/\\/g, '/');
  const base = path.basename(normalized);
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
  const ext = path.extname(clean);
  const stem = ext ? clean.slice(0, -ext.length) : clean;
  let candidate = path.join(folder, clean);
  let n = 1;
  while (exists(candidate)) {
    candidate = path.join(folder, `${stem} (${n})${ext}`);
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
