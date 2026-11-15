/**
 * Startup explorer-root resolution (2026-11-15, files-section
 * fix step 1).
 *
 * The explorer used to root at home unconditionally at startup
 * (App.tsx called getHomeDir() then setCurrentDir(homeDir)), so
 * the owner paid for a wasted home load before workspace restore
 * re-rooted, and a guest — who restores nothing — stayed on home
 * forever, which also left the fuzzy Finder home-rooted and
 * timing out empty (see src/lib/projectFileIndex.ts).
 *
 * The root is now resolved BEFORE the explorer load, in this
 * order:
 *   1. settings.explorerRoot, when set and the directory exists
 *      (verified with fs.exists; a stale/missing path falls
 *      through, never bricks startup).
 *   2. The active profile's saved workspace currentDir, when a
 *      saved workspace exists, the dir is non-empty, and the
 *      directory still exists. A guest has no saved workspace
 *      by construction (the veil), so this step yields nothing
 *      for guests — that is the guest-safety property.
 *   3. Home (the unchanged fallback).
 *
 * Pure apart from its injected deps, so the order is unit-tested
 * here without booting the app (see
 * tests/explorerStartupRoot.test.ts). The caller (App.tsx init)
 * supplies the real deps: settings, the active profile id,
 * readSavedWorkspace, the home dir, and fs.exists.
 */

export type StartupExplorerRootSource = 'explorerRoot' | 'workspace' | 'home';

export interface StartupExplorerRoot {
  root: string;
  source: StartupExplorerRootSource;
}

export interface ResolveStartupExplorerRootDeps {
  /** settings.explorerRoot (null = auto). */
  explorerRoot: string | null;
  /** The active profile id ('' when none). */
  profileId: string;
  /** The saved-workspace reader (workspaceStore.readSavedWorkspace). */
  readSavedWorkspace: (profileId: string) => { currentDir: string } | null;
  /** The home directory (already fetched by the caller). */
  homeDir: string;
  /** fs.exists — a throw counts as "does not exist". */
  exists: (path: string) => Promise<boolean>;
}

async function dirExists(
  exists: ResolveStartupExplorerRootDeps['exists'],
  path: string,
): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

export async function resolveStartupExplorerRoot(
  deps: ResolveStartupExplorerRootDeps,
): Promise<StartupExplorerRoot> {
  const { explorerRoot, profileId, readSavedWorkspace, homeDir, exists } = deps;

  // (1) The explicit setting wins when it points at a real dir.
  if (explorerRoot) {
    if (await dirExists(exists, explorerRoot)) {
      return { root: explorerRoot, source: 'explorerRoot' };
    }
  }

  // (2) The active profile's saved workspace dir — absent for a
  // guest (no saved workspace), so guests fall through to home
  // unless the setting above applied.
  if (profileId) {
    const saved = readSavedWorkspace(profileId);
    const dir = saved?.currentDir;
    if (dir && (await dirExists(exists, dir))) {
      return { root: dir, source: 'workspace' };
    }
  }

  // (3) Home — the unchanged fallback.
  return { root: homeDir, source: 'home' };
}
