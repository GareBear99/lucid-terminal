/**
 * App updates — checking for a new Lucid version, and the
 * record of which versions have run on this machine (Gary,
 * 2026-11-16).
 *
 * Gary's order: "have an updates section for searching for the
 * latest update / about installing the latest version and your
 * prior versions installed on this machine, so not only when
 * snapshot is off do you get a message at the beginning but if
 * there is a new version out etc".
 *
 * THE SHAPE, as built here:
 * - The latest version comes from the GitHub releases API for
 *   GareBear99/lucid-terminal (tag vX.Y.Z, release page, publish
 *   date, notes, the Mac .dmg asset). The fetch itself lives in
 *   the main process (electron/ipc/appUpdate.ts) — same reason
 *   as the snapshot manifest: the renderer is not the side that
 *   fetches; the store (src/stores/appUpdateStore.ts) only
 *   decides. This module only parses + decides — pure
 *   functions, unit-testable without a browser.
 * - There is NO auto-update in Lucid: no electron-updater, no
 *   silent download. The Updates section says so plainly and
 *   shows the honest install path — download the release .dmg
 *   from the release page and replace the app (or pull + rebuild
 *   from the repo for a dev checkout). Nothing here downloads or
 *   installs anything.
 * - Prior versions on this machine are the versions Lucid has
 *   actually RUN here, recorded in settings
 *   (installedAppVersions, first-seen date per version). The
 *   list starts with the version running now — Lucid cannot
 *   know which versions ran here before this record existed,
 *   and it never invents them.
 * - The startup alert is per-profile opt-out (skipUpdateAlert
 *   on the Profile record, same pattern as skipLogoutConfirm,
 *   Gary 2026-11-16): a profile that checks "Do not show again"
 *   never sees the new-version alert; a guest NEVER opts out
 *   (guest wipes anyway — the store refuses the set, loading
 *   strips the flag, the dialog hides the checkbox and the
 *   Updates tab hides the toggle for Guest). The toggle only
 *   silences the STARTUP notice — the Updates section always
 *   shows the latest version and the Check now button, whatever
 *   the toggle says.
 *
 * WHAT IS NOT BUILT HERE (honest gap, do not fake it):
 * - No auto-update / no in-app download of the new version.
 * - No ring ticks for app-update steps (the snapshot stream
 *   logs detected/alert-shown/alert-dismissed to the event
 *   ring; app updates do not yet — the Security tab's event
 *   list has no app-update events).
 */

import { APP_VERSION } from './appVersion';

/** The repo the releases are read from. */
export const LUCID_REPO = 'GareBear99/lucid-terminal';

/** GitHub releases API — the latest release (main process
 *  fetches this; the renderer never calls it directly). */
export const LUCID_RELEASES_API_URL = `https://api.github.com/repos/${LUCID_REPO}/releases/latest`;

/** The releases page — where the user downloads the .dmg. */
export const LUCID_RELEASES_PAGE_URL = `https://github.com/${LUCID_REPO}/releases`;

/** One version Lucid has run on this machine, and when it
 *  first ran here. Machine-level (settings), not per-profile:
 *  it is about the machine, not who was signed in. */
export interface InstalledAppVersion {
  /** Version without the leading v, e.g. '1.1.0'. */
  version: string;
  /** ISO date the version first ran on this machine. */
  firstSeenAt: string;
}

/** How many installed versions are remembered. A cap, not a
 *  pile: old entries fall off the front (the list is a history
 *  of what ran here, and the oldest versions are the least
 *  useful to keep). */
export const INSTALLED_APP_VERSIONS_LIMIT = 50;

/** The latest release, parsed from the GitHub API response. */
export interface AppRelease {
  /** Version without the leading v, e.g. '1.2.0'. */
  version: string;
  /** The tag as published, e.g. 'v1.2.0'. */
  tagName: string;
  /** Release name (usually the tag). */
  name: string;
  /** The release page URL. */
  htmlUrl: string;
  /** ISO publish date. */
  publishedAt: string;
  /** Release notes (the body), may be ''. */
  notes: string;
  /** Download URL of the Mac Intel .dmg asset, or null when
   *  the release has no such asset. */
  downloadUrl: string | null;
}

/** The Mac Intel .dmg asset name for a version (this Mac is
 *  Intel x86_64 — the arm64 .dmg is a different file and never
 *  matches this name). */
export function macDmgAssetName(version: string): string {
  return `Lucid.Terminal-${version}.dmg`;
}

/** Strip a leading v (and whitespace) from a version string. */
export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '');
}

/** Numeric segments of a version, or null when it is not a
 *  plain dotted numeric version (v1.2.0, 1.2, 1.2.0.1). */
function versionSegments(value: string): number[] | null {
  const clean = normalizeVersion(value);
  if (clean === '') return null;
  const parts = clean.split('.');
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    nums.push(Number(part));
  }
  return nums;
}

/** Compare two versions: -1 when a < b, 0 when equal, 1 when
 *  a > b. A version that is not a plain dotted number does not
 *  compare — it counts as equal (never newer), so a weird tag
 *  can never trigger a false "new version" alert. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const aSegs = versionSegments(a);
  const bSegs = versionSegments(b);
  if (aSegs === null || bSegs === null) return 0;
  const len = Math.max(aSegs.length, bSegs.length);
  for (let i = 0; i < len; i++) {
    const av = aSegs[i] ?? 0;
    const bv = bSegs[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** True when the latest version is newer than the installed
 *  one. Equal (or uncomparable) is not newer. */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(current, latest) === -1;
}

/** True when a newer version than the installed one exists. */
export function isAppUpdateAvailable(
  current: string,
  latest: AppRelease | null,
): boolean {
  if (latest === null) return false;
  return isNewerVersion(current, latest.version);
}

/**
 * Parse a GitHub releases/latest response into an AppRelease.
 * Throws on anything that is not a usable release (no tag, a
 * tag that is not vX.Y.Z, no release page URL, no publish
 * date) — the caller reports the failure, never a made-up
 * version. The .dmg download URL is null when the release has
 * no Mac Intel .dmg asset, not an invented link.
 */
export function parseAppRelease(raw: unknown): AppRelease {
  if (!raw || typeof raw !== 'object') {
    throw new Error('GitHub release is not an object.');
  }
  const r = raw as Record<string, unknown>;
  const tagName = r.tag_name;
  if (typeof tagName !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tagName)) {
    throw new Error('GitHub release has no usable tag (expected vX.Y.Z).');
  }
  const htmlUrl = r.html_url;
  if (typeof htmlUrl !== 'string' || !htmlUrl.startsWith('https://github.com/')) {
    throw new Error('GitHub release has no usable release page URL.');
  }
  const publishedAt = r.published_at;
  if (typeof publishedAt !== 'string' || publishedAt.trim() === '') {
    throw new Error('GitHub release has no publish date.');
  }
  const version = normalizeVersion(tagName);
  const name = typeof r.name === 'string' ? r.name : tagName;
  const notes = typeof r.body === 'string' ? r.body : '';
  let downloadUrl: string | null = null;
  if (Array.isArray(r.assets)) {
    const wanted = macDmgAssetName(version);
    for (const asset of r.assets as unknown[]) {
      if (
        asset &&
        typeof asset === 'object' &&
        (asset as Record<string, unknown>).name === wanted &&
        typeof (asset as Record<string, unknown>).browser_download_url === 'string' &&
        ((asset as Record<string, unknown>).browser_download_url as string).startsWith('https://')
      ) {
        downloadUrl = (asset as Record<string, unknown>).browser_download_url as string;
        break;
      }
    }
  }
  return { version, tagName, name, htmlUrl, publishedAt, notes, downloadUrl };
}

/**
 * Should the new-version startup alert SHOW? A newer version
 * exists AND this profile has not opted out ("Do not show
 * again"). A guest never opts out — skipUpdateAlert is always
 * false for a guest (the store refuses the set), so a guest
 * always sees the message.
 */
export function shouldShowAppUpdateAlert(args: {
  latest: AppRelease | null;
  current: string;
  skipUpdateAlert: boolean;
}): boolean {
  if (args.skipUpdateAlert) return false;
  return isAppUpdateAvailable(args.current, args.latest);
}

/**
 * Record a version as having run on this machine. Pure:
 * returns the new history — the version appended with its
 * first-seen date when it is not already there, deduped,
 * capped at INSTALLED_APP_VERSIONS_LIMIT (oldest entries
 * fall off first). A version already in the list keeps its
 * original first-seen date.
 */
export function recordVersionSeen(
  history: readonly InstalledAppVersion[],
  version: string,
  nowIso: string,
): InstalledAppVersion[] {
  if (history.some((h) => h.version === version)) return [...history];
  return [...history, { version, firstSeenAt: nowIso }].slice(
    -INSTALLED_APP_VERSIONS_LIMIT,
  );
}

/** The result of checking the latest release. */
export interface AppUpdateCheckResult {
  /** A newer version than the installed one exists. */
  available: boolean;
  /** The startup alert should show for this release. */
  showAlert: boolean;
  /** Why, in plain words — the reason the check gave. */
  reason: string;
}

/**
 * The entry point the release-check caller invokes with a
 * fetched release: decide whether an update is available and
 * whether the alert shows. The caller does the fetch (the
 * main process); this function only decides. Returns the
 * decision + the reason.
 */
export function checkAppUpdate(
  latest: AppRelease | null,
  skipUpdateAlert: boolean,
): AppUpdateCheckResult {
  if (latest === null) {
    return {
      available: false,
      showAlert: false,
      reason: 'No release found — the latest version is unknown.',
    };
  }
  const available = isAppUpdateAvailable(APP_VERSION, latest);
  if (!available) {
    return {
      available: false,
      showAlert: false,
      reason: `Lucid ${APP_VERSION} is the latest version — release ${latest.tagName} matches what is installed.`,
    };
  }
  const showAlert = shouldShowAppUpdateAlert({
    latest,
    current: APP_VERSION,
    skipUpdateAlert,
  });
  return {
    available: true,
    showAlert,
    reason: showAlert
      ? `Lucid ${latest.tagName} is out — you are on ${APP_VERSION}.`
      : `Lucid ${latest.tagName} is out — this profile turned the new-version alert off.`,
  };
}
