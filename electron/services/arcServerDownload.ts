/**
 * ARC Server add-on fetch — main process (Gary, 2026-11-14
 * ~14:53 PST: ARC Server is an installable add-on, "fetched
 * at install time (from its repo/release), NOT bundled inside
 * Lucid's asar, NOT pre-downloaded").
 *
 * What is fetched: the ARC-Server repo has NO releases and NO
 * tags (verified 2026-11-14 — the GitHub releases API returns
 * [] and there are no tags), so there is no release artifact.
 * The repo is C11 source. Install fetches the source tarball
 * for the repo's HEAD commit: the HEAD SHA comes from the
 * GitHub API, the tarball comes from codeload for that exact
 * SHA (a SHA never moves; a branch name does). The tarball is
 * shape-verified after extraction (Makefile +
 * src/arc-server.c + README.md present) — there is no
 * published hash to verify against, and this module says so
 * instead of inventing one.
 *
 * THE RULES (mirroring electron/services/snapshotDownload.ts):
 * - Download to a STAGING file/dir, never straight into the
 *   installed location. The installed directory appears by
 *   one atomic rename, only after the shape verifies.
 * - A failed fetch / bad shape deletes the staging files and
 *   leaves any installed version untouched.
 * - The main process never downloads an arbitrary URL: the
 *   two URLs are built here from constants + the API-fetched
 *   SHA (validated 40-hex). The renderer passes nothing.
 * - The BUILD is not done here: the fetched directory is
 *   source, and `make` in it needs a C compiler on the user's
 *   machine. Install delivers the fetched source; building is
 *   the follow-on, not this slice.
 *
 * This module must NOT value-import from src/ (TS6307).
 * The wire types are type-imported from
 * src/lib/arcServerAddon.ts; the SHA + host validators here
 * are twins of the ones there, kept identical by hand.
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  ArcServerInstallResult,
  ArcServerStatusResult,
} from '../../src/lib/arcServerAddon';

/** Where fetched add-on sources live: ~/.lucid/addons. */
export function resolveArcServerDir(homeDir?: string): string {
  return path.join(
    homeDir ?? os.homedir(),
    '.lucid',
    'addons',
    'arc-server',
  );
}

/** A git commit SHA is 40 lowercase hex chars. Twin of
 *  src/lib/arcServerAddon.ts isValidArcServerSha. */
export function isValidArcServerSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

const ARC_SERVER_API_BASE = 'https://api.github.com';
const ARC_SERVER_CODELOAD_BASE = 'https://codeload.github.com';

/** Files a fetched ARC-Server directory must contain — the
 *  shape check. No published hash exists to verify against. */
export const ARC_SERVER_SHAPE_FILES: readonly string[] = [
  'Makefile',
  'src/arc-server.c',
  'README.md',
];

export function verifyArcServerShape(dir: string): boolean {
  return ARC_SERVER_SHAPE_FILES.every((rel) => {
    try {
      return fs.statSync(path.join(dir, rel)).isFile();
    } catch {
      return false;
    }
  });
}

interface GetTextOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

/** GET a URL as text, following redirects. Rejects on
 *  non-2xx, on timeout, and past maxRedirects. */
function httpsGetText(url: string, options: GetTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRedirects = options.maxRedirects ?? 5;
  return new Promise((resolve, reject) => {
    const get = (current: string, redirectsLeft: number): void => {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        reject(new Error(`ARC Server fetch: not a URL: ${current}`));
        return;
      }
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(
        parsed,
        { headers: options.headers ?? {} },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location !== undefined) {
            if (redirectsLeft <= 0) {
              res.resume();
              reject(new Error('ARC Server fetch: too many redirects.'));
              return;
            }
            res.resume();
            get(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(
              new Error(`ARC Server fetch: ${parsed.hostname} answered ${status}.`),
            );
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        },
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('ARC Server fetch: timed out.'));
      });
      req.on('error', reject);
    };
    get(url, maxRedirects);
  });
}

/**
 * The repo's HEAD commit SHA on main, from the GitHub API.
 * `apiBase` is the test seam (a local HTTP server in tests);
 * production callers pass nothing.
 */
export async function fetchArcServerHeadSha(
  apiBase: string = ARC_SERVER_API_BASE,
): Promise<string> {
  const text = await httpsGetText(
    `${apiBase}/repos/GareBear99/ARC-Server/commits/main`,
    {
      headers: {
        'User-Agent': 'Lucid',
        Accept: 'application/vnd.github+json',
      },
    },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('ARC Server fetch: the GitHub API did not return JSON.');
  }
  const sha = (parsed as { sha?: unknown }).sha;
  if (!isValidArcServerSha(sha)) {
    throw new Error('ARC Server fetch: the GitHub API returned no commit SHA.');
  }
  return sha;
}

interface DownloadFileOptions {
  timeoutMs?: number;
  maxRedirects?: number;
}

/** GET a URL to a file, following redirects. The file is
 *  written via a `.part` path the caller renames into place
 *  only after the download completes. */
function downloadToFile(
  url: string,
  destPath: string,
  options: DownloadFileOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxRedirects = options.maxRedirects ?? 5;
  return new Promise((resolve, reject) => {
    const get = (current: string, redirectsLeft: number): void => {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        reject(new Error(`ARC Server download: not a URL: ${current}`));
        return;
      }
      const lib = parsed.protocol === 'https:' ? https : http;
      const file = fs.createWriteStream(destPath);
      const req = lib.get(parsed, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location !== undefined) {
          if (redirectsLeft <= 0) {
            res.resume();
            file.close();
            reject(new Error('ARC Server download: too many redirects.'));
            return;
          }
          res.resume();
          file.close();
          get(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          file.close();
          reject(
            new Error(
              `ARC Server download: ${parsed.hostname} answered ${status}.`,
            ),
          );
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        res.on('error', (err) => {
          file.close();
          reject(err);
        });
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('ARC Server download: timed out.'));
      });
      req.on('error', (err) => {
        file.close();
        reject(err);
      });
    };
    get(url, maxRedirects);
  });
}

/** Extract a .tar.gz into a directory (created if needed).
 *  The codeload tarball has one top-level dir
 *  (ARC-Server-<sha>/), stripped by --strip-components=1.
 *  Uses the system `tar` — present on macOS and Linux. */
export function extractArcServerTarball(
  tarPath: string,
  destDir: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    execFile(
      'tar',
      ['-xzf', tarPath, '-C', destDir, '--strip-components=1'],
      (err) => {
        if (err) {
          reject(new Error(`ARC Server extract failed: ${err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

export interface InstallArcServerOptions {
  /** Test seam: GitHub API base (default the real API). */
  apiBase?: string;
  /** Test seam: codeload base (default the real codeload). */
  codeloadBase?: string;
  /** Test seam: home dir (default os.homedir()). */
  homeDir?: string;
}

function removeQuietly(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Best effort — a failed cleanup must not mask the real error.
  }
}

/**
 * Fetch + install ARC Server: HEAD SHA from the API, tarball
 * for that SHA from codeload, extract to a staging dir,
 * shape-verify, then one atomic rename into place. An already
 * installed copy of the same SHA (valid shape) is a no-op
 * success. Any failure deletes the staging files and leaves
 * an installed version untouched.
 */
export async function installArcServer(
  options: InstallArcServerOptions = {},
): Promise<ArcServerInstallResult> {
  const apiBase = options.apiBase ?? ARC_SERVER_API_BASE;
  const codeloadBase = options.codeloadBase ?? ARC_SERVER_CODELOAD_BASE;
  const baseDir = resolveArcServerDir(options.homeDir);
  const stagingTar = path.join(baseDir, '.arc-server.tar.gz.part');
  const stagingDir = path.join(baseDir, `.staging-${process.pid}`);
  try {
    const sha = await fetchArcServerHeadSha(apiBase);
    const targetDir = path.join(baseDir, sha);
    if (verifyArcServerShape(targetDir)) {
      return { ok: true, version: sha, path: targetDir };
    }
    fs.mkdirSync(baseDir, { recursive: true });
    await downloadToFile(
      `${codeloadBase}/GareBear99/ARC-Server/tar.gz/${sha}`,
      stagingTar,
    );
    await extractArcServerTarball(stagingTar, stagingDir);
    if (!verifyArcServerShape(stagingDir)) {
      removeQuietly(stagingDir);
      removeQuietly(stagingTar);
      return {
        ok: false,
        error:
          'The fetched ARC-Server archive is missing expected files (Makefile, src/arc-server.c, README.md).',
      };
    }
    removeQuietly(targetDir);
    fs.renameSync(stagingDir, targetDir);
    removeQuietly(stagingTar);
    return { ok: true, version: sha, path: targetDir };
  } catch (err) {
    removeQuietly(stagingDir);
    removeQuietly(stagingTar);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'ARC Server fetch failed.',
    };
  }
}

/** Remove every fetched ARC Server copy. Returns ok even
 *  when nothing was installed. */
export async function uninstallArcServer(
  homeDir?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    removeQuietly(resolveArcServerDir(homeDir));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'ARC Server removal failed.',
    };
  }
}

/** The on-disk truth: the installed version (a 40-hex
 *  subdir with a valid shape), or not installed. */
export function arcServerStatus(homeDir?: string): ArcServerStatusResult {
  const baseDir = resolveArcServerDir(homeDir);
  try {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!isValidArcServerSha(entry.name)) continue;
      const dir = path.join(baseDir, entry.name);
      if (verifyArcServerShape(dir)) {
        return { installed: true, version: entry.name, path: dir };
      }
    }
  } catch {
    // Missing dir = not installed.
  }
  return { installed: false, version: null, path: null };
}
