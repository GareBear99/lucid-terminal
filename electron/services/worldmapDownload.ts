/**
 * Offline Worldmap add-on fetch — main process (Gary,
 * 2026-11-15: ARC v10 as an offline worldmap plugin,
 * installed through the custom plugin setup).
 *
 * Twin of electron/services/arcServerDownload.ts — the same
 * rules, the same shape:
 * - Download to a STAGING file/dir, never straight into the
 *   installed location. The installed directory appears by
 *   one atomic rename, only after the shape verifies.
 * - A failed fetch / bad shape deletes the staging files and
 *   leaves any installed version untouched.
 * - The main process never downloads an arbitrary URL: the
 *   two URLs are built here from constants + the API-fetched
 *   SHA (validated 40-hex). The renderer passes nothing.
 *
 * Differences from ARC Server (the package is a SUBDIRECTORY
 * of its repo, and the fetched copy must be the OFFLINE
 * build):
 * - The repo is GareBear99/A-real-time-spatial-signal-
 *   intelligence-engine; the package lives at
 *   arc_serverless_v10_complete/ on main. The tarball is
 *   the whole repo; the install uses the package subdir.
 * - The recorded `path` is the PACKAGE directory (the
 *   arc_serverless_v10_complete/ dir inside the versioned
 *   install dir) — the segment loads index.html from there.
 * - The shape check requires the offline markers
 *   (vendor/leaflet.js present AND index.html free of
 *   unpkg.com / tile.openstreetmap.org). A fetched copy that
 *   is still the old online build FAILS the install with a
 *   clear error instead of installing a plugin that is not
 *   offline. The repo must carry the converted package
 *   (see the plugin's README.md) before install works.
 *
 * This module must NOT value-import from src/ (TS6307).
 * The wire types are type-imported from
 * src/lib/worldmapAddon.ts; the SHA + host validators here
 * are twins of the ones there, kept identical by hand.
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  WorldmapInstallResult,
  WorldmapStatusResult,
} from '../../src/lib/worldmapAddon';

/** Where fetched add-on sources live: ~/.lucid/addons. */
export function resolveWorldmapDir(homeDir?: string): string {
  return path.join(
    homeDir ?? os.homedir(),
    '.lucid',
    'addons',
    'offline-worldmap',
  );
}

/** The package inside the repo — the directory the install
 *  uses after extracting the tarball. */
export const WORLDMAP_PACKAGE_PATH = 'arc_serverless_v10_complete';

/** A git commit SHA is 40 lowercase hex chars. Twin of
 *  src/lib/worldmapAddon.ts isValidWorldmapSha. */
export function isValidWorldmapSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

const WORLDMAP_API_BASE = 'https://api.github.com';
const WORLDMAP_CODELOAD_BASE = 'https://codeload.github.com';
const WORLDMAP_REPO = 'GareBear99/A-real-time-spatial-signal-intelligence-engine';

/** Files a fetched worldmap package directory must contain. */
export const WORLDMAP_SHAPE_FILES: readonly string[] = [
  'index.html',
  'arc/map.js',
  'README.txt',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/leaflet-heat.js',
  'arc/gps.js',
  'arc/settings.js',
];

/** Strings that must NOT appear in the fetched index.html —
 *  their presence means the fetched copy is the old online
 *  build, not the offline build. */
export const WORLDMAP_OFFLINE_FORBIDDEN_STRINGS: readonly string[] = [
  'unpkg.com',
  'tile.openstreetmap.org',
];

export function verifyWorldmapShape(dir: string): boolean {
  return WORLDMAP_SHAPE_FILES.every((rel) => {
    try {
      return fs.statSync(path.join(dir, rel)).isFile();
    } catch {
      return false;
    }
  });
}

/** The fetched index.html must be the offline build: no CDN
 *  Leaflet, no OSM tiles. */
export function verifyWorldmapOffline(dir: string): boolean {
  let html: string;
  try {
    html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  } catch {
    return false;
  }
  return WORLDMAP_OFFLINE_FORBIDDEN_STRINGS.every((s) => !html.includes(s));
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
        reject(new Error(`Worldmap fetch: not a URL: ${current}`));
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
              reject(new Error('Worldmap fetch: too many redirects.'));
              return;
            }
            res.resume();
            get(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(
              new Error(`Worldmap fetch: ${parsed.hostname} answered ${status}.`),
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
        req.destroy(new Error('Worldmap fetch: timed out.'));
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
export async function fetchWorldmapHeadSha(
  apiBase: string = WORLDMAP_API_BASE,
): Promise<string> {
  const text = await httpsGetText(
    `${apiBase}/repos/${WORLDMAP_REPO}/commits/main`,
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
    throw new Error('Worldmap fetch: the GitHub API did not return JSON.');
  }
  const sha = (parsed as { sha?: unknown }).sha;
  if (!isValidWorldmapSha(sha)) {
    throw new Error('Worldmap fetch: the GitHub API returned no commit SHA.');
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
        reject(new Error(`Worldmap download: not a URL: ${current}`));
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
            reject(new Error('Worldmap download: too many redirects.'));
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
              `Worldmap download: ${parsed.hostname} answered ${status}.`,
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
        req.destroy(new Error('Worldmap download: timed out.'));
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
 *  (A-real-time-spatial-signal-intelligence-engine-<sha>/),
 *  stripped by --strip-components=1. Uses the system `tar`
 *  — present on macOS and Linux. */
export function extractWorldmapTarball(
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
          reject(new Error(`Worldmap extract failed: ${err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

export interface InstallWorldmapOptions {
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
 * Fetch + install the worldmap: HEAD SHA from the API,
 * tarball for that SHA from codeload, extract to a staging
 * dir, shape-verify the package subdir (including the
 * offline markers), then one atomic rename into place. An
 * already installed copy of the same SHA (valid shape) is a
 * no-op success. Any failure deletes the staging files and
 * leaves an installed version untouched.
 */
export async function installWorldmap(
  options: InstallWorldmapOptions = {},
): Promise<WorldmapInstallResult> {
  const apiBase = options.apiBase ?? WORLDMAP_API_BASE;
  const codeloadBase = options.codeloadBase ?? WORLDMAP_CODELOAD_BASE;
  const baseDir = resolveWorldmapDir(options.homeDir);
  const stagingTar = path.join(baseDir, '.worldmap.tar.gz.part');
  const stagingDir = path.join(baseDir, `.staging-${process.pid}`);
  try {
    const sha = await fetchWorldmapHeadSha(apiBase);
    const targetDir = path.join(baseDir, sha);
    const targetPackageDir = path.join(targetDir, WORLDMAP_PACKAGE_PATH);
    if (verifyWorldmapShape(targetPackageDir) && verifyWorldmapOffline(targetPackageDir)) {
      return { ok: true, version: sha, path: targetPackageDir };
    }
    fs.mkdirSync(baseDir, { recursive: true });
    await downloadToFile(
      `${codeloadBase}/${WORLDMAP_REPO}/tar.gz/${sha}`,
      stagingTar,
    );
    await extractWorldmapTarball(stagingTar, stagingDir);
    const stagingPackageDir = path.join(stagingDir, WORLDMAP_PACKAGE_PATH);
    if (!verifyWorldmapShape(stagingPackageDir)) {
      removeQuietly(stagingDir);
      removeQuietly(stagingTar);
      return {
        ok: false,
        error:
          'The fetched worldmap archive is missing expected files (index.html, arc/map.js, README.txt, vendor/leaflet.js, arc/gps.js, arc/settings.js).',
      };
    }
    if (!verifyWorldmapOffline(stagingPackageDir)) {
      removeQuietly(stagingDir);
      removeQuietly(stagingTar);
      return {
        ok: false,
        error:
          'The fetched worldmap copy is not the offline build — it still references unpkg or OpenStreetMap tiles. Push the converted offline package to the repo first (see the plugin README).',
      };
    }
    removeQuietly(targetDir);
    fs.renameSync(stagingDir, targetDir);
    removeQuietly(stagingTar);
    return { ok: true, version: sha, path: targetPackageDir };
  } catch (err) {
    removeQuietly(stagingDir);
    removeQuietly(stagingTar);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Worldmap fetch failed.',
    };
  }
}

/** Remove every fetched worldmap copy. Returns ok even
 *  when nothing was installed. */
export async function uninstallWorldmap(
  homeDir?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    removeQuietly(resolveWorldmapDir(homeDir));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Worldmap removal failed.',
    };
  }
}

/** The on-disk truth: the installed version (a 40-hex
 *  subdir whose package dir has a valid offline shape), or
 *  not installed. */
export function worldmapStatus(homeDir?: string): WorldmapStatusResult {
  const baseDir = resolveWorldmapDir(homeDir);
  try {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!isValidWorldmapSha(entry.name)) continue;
      const packageDir = path.join(baseDir, entry.name, WORLDMAP_PACKAGE_PATH);
      if (verifyWorldmapShape(packageDir) && verifyWorldmapOffline(packageDir)) {
        return { installed: true, version: entry.name, path: packageDir };
      }
    }
  } catch {
    // Missing dir = not installed.
  }
  return { installed: false, version: null, path: null };
}
