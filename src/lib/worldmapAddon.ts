/**
 * Offline Worldmap add-on — shared constants + pure helpers
 * (Gary, 2026-11-15: ARC v10 as an offline worldmap plugin
 * for offline GPS projects, installed through the custom
 * plugin setup, showing up as a plugin when installed, user
 * customizable).
 *
 * The worldmap is the SECOND add-on fetched at install time
 * (the ARC Server pattern): it is NEVER bundled in Lucid's
 * asar and NEVER pre-downloaded. Install downloads the repo
 * tarball from GitHub in the main process (see
 * electron/services/worldmapDownload.ts) and records the
 * fetched commit SHA + package path in settings
 * (`worldmapInstall`).
 *
 * SOURCE (Gary, 2026-11-15): the repo is
 * GareBear99/A-real-time-spatial-signal-intelligence-engine
 * (public, main) and the package lives at
 * arc_serverless_v10_complete/ on main. The repo copy and the
 * zip Gary gave us (arc_serverless_v10_complete.zip) are
 * identical — parent-verified byte-for-byte. The zip is the
 * authority for the BASE engine: if the repo copy ever drifts
 * from the zip, the zip wins for the base. The converted
 * offline build (this package) is the zip base plus the
 * offline conversion (vendored Leaflet, settings-driven
 * tiles, real GPS input); the repo must carry the converted
 * package for the install to yield an offline plugin — the
 * shape check below enforces that, and install fails with a
 * clear error until it does.
 *
 * This module is renderer-safe and pure: URL builders,
 * validators, the install-state type, and status text. The
 * main-process side (download / extract / shape-verify)
 * lives in electron/services/worldmapDownload.ts and must
 * NOT value-import from here (TS6307 — the electron project
 * must not import from src/); the SHA + host validators
 * there are twins of the ones here, kept identical by hand.
 */
export const WORLDMAP_ADDON_ID = 'offline-worldmap';

/** The worldmap repo (public). */
export const WORLDMAP_REPO = 'GareBear99/A-real-time-spatial-signal-intelligence-engine';
export const WORLDMAP_REPO_URL = `https://github.com/${WORLDMAP_REPO}`;

/** The package inside the repo — the directory the install
 *  uses after extracting the tarball. */
export const WORLDMAP_PACKAGE_PATH = 'arc_serverless_v10_complete';

/** GitHub API endpoint for the repo's HEAD commit on main. */
export const WORLDMAP_HEAD_API_URL = `https://api.github.com/repos/${WORLDMAP_REPO}/commits/main`;

/**
 * The tarball for one exact commit — the fetch target. A
 * codeload tarball for a full 40-hex SHA, never for a branch
 * name (a branch moves; a SHA does not).
 */
export function worldmapTarballUrl(sha: string): string {
  return `https://codeload.github.com/${WORLDMAP_REPO}/tar.gz/${sha}`;
}

/** A git commit SHA is 40 lowercase hex chars. */
export function isValidWorldmapSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

/** Hosts a worldmap download URL may point at. */
export const WORLDMAP_DOWNLOAD_HOSTS: readonly string[] = [
  'codeload.github.com',
  'api.github.com',
];

export function isAllowedWorldmapDownloadUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return WORLDMAP_DOWNLOAD_HOSTS.includes(parsed.hostname);
}

/** First 7 chars of a commit SHA, for display. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Files the fetched package directory must contain — the
 *  shape check (see electron/services/worldmapDownload.ts).
 *  The offline markers (vendor/leaflet.js + no CDN references
 *  in index.html) are checked separately by the download
 *  service; this list is the base shape. */
export const WORLDMAP_SHAPE_FILES: readonly string[] = [
  'index.html',
  'arc/map.js',
  'README.txt',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/leaflet-heat.js',
  // Marker art: without these the markers exist in the DOM
  // but render as broken images (caught by the offline proof
  // screenshot, 2026-11-15 — the DOM count alone is not proof).
  'vendor/images/marker-icon.png',
  'vendor/images/marker-shadow.png',
  'arc/gps.js',
  'arc/settings.js',
];

/** Strings that must NOT appear in the fetched index.html —
 *  their presence means the fetched copy is the old online
 *  build (CDN Leaflet, OSM tiles), not the offline build. */
export const WORLDMAP_OFFLINE_FORBIDDEN_STRINGS: readonly string[] = [
  'unpkg.com',
  'tile.openstreetmap.org',
];

/**
 * The install state, persisted in settings (`worldmapInstall`).
 * Null in settings = never installed (or removed). `version` is
 * the full commit SHA fetched; `path` is the absolute path of
 * the fetched PACKAGE directory (the
 * arc_serverless_v10_complete/ dir inside the versioned
 * install dir — the segment loads index.html from here).
 * `status` is 'downloading' only while a fetch is in flight —
 * the id is added to `installedAddons` only once the fetch has
 * succeeded and the state is 'installed'.
 */
export interface WorldmapInstallState {
  status: 'installed' | 'downloading' | 'failed';
  version: string | null;
  path: string | null;
  error: string | null;
}

/** Result of the main-process install (wire type). */
export interface WorldmapInstallResult {
  ok: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/** Result of the main-process status check (wire type). */
export interface WorldmapStatusResult {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/**
 * One-line status text for the Settings row. Installed shows
 * the fetched SHA + path; failed shows the error; downloading
 * shows the in-flight state.
 */
export function worldmapInstallStateText(state: WorldmapInstallState | null): string {
  if (!state) return 'Not installed';
  if (state.status === 'downloading') return 'Fetching from the repo…';
  if (state.status === 'failed') {
    return state.error ? `Fetch failed: ${state.error}` : 'Fetch failed.';
  }
  const sha = state.version ? shortSha(state.version) : 'unknown';
  return state.path ? `Fetched ${sha} · ${state.path}` : `Fetched ${sha}`;
}

/** The file URL of the fetched package's page, for the
 *  segment iframe. Null when no package path is recorded. */
export function worldmapPluginPageUrl(installPath: string | null | undefined): string | null {
  if (!installPath) return null;
  const clean = installPath.replace(/\/+$/, '');
  return `file://${encodeURI(clean)}/index.html`;
}

/** The note shown under the installed row: the fetched copy
 *  must be the offline build, and the repo is the source to
 *  update when the plugin changes. */
export const WORLDMAP_BUILD_NOTE =
  'Fetched from its repo at install time — the repo must carry the offline build (vendored Leaflet, no CDN). Update the repo package to update the plugin.';
