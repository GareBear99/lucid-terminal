/**
 * ARC Server add-on — shared constants + pure helpers (Gary,
 * 2026-11-14 ~14:53 PST: "also put arc server as an add on you
 * can install i guess" / "it shouldnt come pre downloaded").
 *
 * ARC Server is the ONE add-on that is fetched at install time
 * (the other five install by recording an id — their UI already
 * ships inside the bundle). It is NEVER bundled in Lucid's asar
 * and NEVER pre-downloaded: Install downloads the repo tarball
 * from GitHub in the main process (see
 * electron/services/arcServerDownload.ts) and records the
 * fetched commit SHA + path in settings (`arcServerInstall`).
 *
 * HARD RULE (Gary, 2026-11-14 ~02:10 PST): "arc server has 0
 * to do with lucid." No Lucid integration beyond the catalogue
 * entry + install/uninstall: nothing here wires ARC Server into
 * the terminal, the agent, the driving intelligence, or any
 * other surface. The add-on has no settings page — its Settings
 * button toasts "No settings yet" by the existing default.
 *
 * HONEST FACTS (verified 2026-11-14): the ARC-Server repo
 * (GareBear99/ARC-Server, HEAD aa5a903) has NO releases and NO
 * tags — there is no release artifact to fetch. The repo is C11
 * source (Makefile, src/, tests/, tools/, www/) — `make`
 * builds ./arc-server (needs a C compiler + pthreads; zlib /
 * OpenSSL are optional probes). So the install fetches the
 * source tarball for the repo's HEAD commit (codeload tarball
 * for that exact SHA) and shape-verifies it (Makefile +
 * src/arc-server.c + README.md present). The BUILD is not
 * automated in this slice: the user builds it with `make` in
 * the fetched directory. A "Build" action is the follow-on,
 * not this slice.
 *
 * This module is renderer-safe and pure: URL builders,
 * validators, the install-state type, and status text. The
 * main-process side (download / extract / shape-verify) lives
 * in electron/services/arcServerDownload.ts and must NOT
 * value-import from here (TS6307 — the electron project must
 * not import from src/); the SHA + host validators there are
 * twins of the ones here, kept identical by hand.
 */
export const ARC_SERVER_ADDON_ID = 'arc-server';

/** The ARC-Server repo (public). */
export const ARC_SERVER_REPO = 'GareBear99/ARC-Server';
export const ARC_SERVER_REPO_URL = `https://github.com/${ARC_SERVER_REPO}`;

/** GitHub API endpoint for the repo's HEAD commit on main. */
export const ARC_SERVER_HEAD_API_URL = `https://api.github.com/repos/${ARC_SERVER_REPO}/commits/main`;

/**
 * The tarball for one exact commit — the fetch target. A
 * codeload tarball for a full 40-hex SHA, never for a branch
 * name (a branch moves; a SHA does not).
 */
export function arcServerTarballUrl(sha: string): string {
  return `https://codeload.github.com/${ARC_SERVER_REPO}/tar.gz/${sha}`;
}

/** A git commit SHA is 40 lowercase hex chars. */
export function isValidArcServerSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

/** Hosts an ARC Server download URL may point at. */
export const ARC_SERVER_DOWNLOAD_HOSTS: readonly string[] = [
  'codeload.github.com',
  'api.github.com',
];

export function isAllowedArcServerDownloadUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ARC_SERVER_DOWNLOAD_HOSTS.includes(parsed.hostname);
}

/** First 7 chars of a commit SHA, for display. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * The install state, persisted in settings (`arcServerInstall`).
 * Null in settings = never installed (or removed). `version` is
 * the full commit SHA fetched; `path` is the absolute path of
 * the fetched directory. `status` is 'downloading' only while
 * a fetch is in flight — the id is added to `installedAddons`
 * only once the fetch has succeeded and the state is
 * 'installed'.
 */
export interface ArcServerInstallState {
  status: 'installed' | 'downloading' | 'failed';
  version: string | null;
  path: string | null;
  error: string | null;
}

/** Result of the main-process install (wire type). */
export interface ArcServerInstallResult {
  ok: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/** Result of the main-process status check (wire type). */
export interface ArcServerStatusResult {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/**
 * One-line status text for the Settings row. Installed shows
 * the fetched SHA + path; failed shows the error; downloading
 * shows the in-flight state.
 */
export function arcServerInstallStateText(state: ArcServerInstallState | null): string {
  if (!state) return 'Not installed';
  if (state.status === 'downloading') return 'Fetching from the repo…';
  if (state.status === 'failed') {
    return state.error ? `Fetch failed: ${state.error}` : 'Fetch failed.';
  }
  const sha = state.version ? shortSha(state.version) : 'unknown';
  return state.path ? `Fetched ${sha} · ${state.path}` : `Fetched ${sha}`;
}

/** The build note shown under the installed row: the fetched
 *  directory is source, and the build is the repo's own
 *  Makefile — Lucid does not build it in this slice. */
export const ARC_SERVER_BUILD_NOTE =
  'Source only — build it yourself with `make` in that directory (needs a C compiler).';
