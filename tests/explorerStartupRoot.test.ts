/**
 * Startup explorer-root resolution (2026-11-15, files-section
 * fix step 1).
 *
 * The explorer used to root at home unconditionally at startup,
 * so the owner paid for a wasted home load before workspace
 * restore re-rooted, and a guest stayed home-rooted. The root
 * is now resolved before the load, in this order:
 *   1. settings.explorerRoot (when set and the dir exists)
 *   2. the active profile's saved workspace currentDir
 *      (a guest has none, so guests fall through)
 *   3. home
 *
 * These tests pin the order against the pure resolver in
 * src/lib/explorerStartupRoot.ts, with the real
 * readSavedWorkspace wired in for the workspace cases (it
 * reads localStorage key `lucid.workspace.v1:<profileId>`).
 *
 * Run with: npx vitest run tests/explorerStartupRoot.test.ts
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { resolveStartupExplorerRoot } from '../src/lib/explorerStartupRoot';

const HOME = '/Users/gary';
const PROJECT = '/Users/gary/lucid-terminal';
const EXPLORER_ROOT = '/Users/gary/projects';

/** A saved workspace as readSavedWorkspace validates it. */
function seedWorkspace(profileId: string, currentDir: string): void {
  localStorage.setItem(
    `lucid.workspace.v1:${profileId}`,
    JSON.stringify({
      version: 1,
      projects: [currentDir],
      openFiles: [],
      activeFile: null,
      cursors: {},
      terminalCwds: [],
      currentDir,
      savedAt: '2026-11-15T00:00:00.000Z',
    }),
  );
}

describe('resolveStartupExplorerRoot', () => {
  let existsSet: Set<string>;
  let readSavedWorkspace: (profileId: string) => { currentDir: string } | null;

  beforeEach(async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    });
    existsSet = new Set([HOME, PROJECT, EXPLORER_ROOT]);
    // The real reader, dynamically imported after the
    // localStorage stub exists (workspaceStore's module graph
    // reads localStorage at import time).
    ({ readSavedWorkspace } = await import('../src/stores/workspaceStore'));
  });

  const resolve = (opts: {
    explorerRoot?: string | null;
    profileId?: string;
  }) =>
    resolveStartupExplorerRoot({
      explorerRoot: opts.explorerRoot ?? null,
      profileId: opts.profileId ?? 'owner',
      readSavedWorkspace,
      homeDir: HOME,
      exists: async (path: string) => existsSet.has(path),
    });

  test('explorerRoot set and existing wins over the workspace', async () => {
    seedWorkspace('owner', PROJECT);
    expect(await resolve({ explorerRoot: EXPLORER_ROOT })).toEqual({
      root: EXPLORER_ROOT,
      source: 'explorerRoot',
    });
  });

  test('explorerRoot set but missing falls through to the workspace', async () => {
    seedWorkspace('owner', PROJECT);
    expect(
      await resolve({ explorerRoot: '/Users/gary/deleted-project' }),
    ).toEqual({ root: PROJECT, source: 'workspace' });
  });

  test('no explorerRoot: the saved workspace dir is used', async () => {
    seedWorkspace('owner', PROJECT);
    expect(await resolve({})).toEqual({ root: PROJECT, source: 'workspace' });
  });

  test('no explorerRoot and no saved workspace: home', async () => {
    expect(await resolve({})).toEqual({ root: HOME, source: 'home' });
  });

  test('a saved workspace whose dir no longer exists falls back to home', async () => {
    seedWorkspace('owner', '/Users/gary/deleted-project');
    expect(await resolve({})).toEqual({ root: HOME, source: 'home' });
  });

  test('an empty saved currentDir falls back to home', async () => {
    seedWorkspace('owner', '');
    expect(await resolve({})).toEqual({ root: HOME, source: 'home' });
  });

  test('guest (no saved workspace) lands on home unless explorerRoot is set', async () => {
    expect(await resolve({ profileId: 'guest-1' })).toEqual({
      root: HOME,
      source: 'home',
    });
    expect(
      await resolve({ profileId: 'guest-1', explorerRoot: EXPLORER_ROOT }),
    ).toEqual({ root: EXPLORER_ROOT, source: 'explorerRoot' });
  });

  test('an empty-string explorerRoot counts as unset', async () => {
    seedWorkspace('owner', PROJECT);
    expect(await resolve({ explorerRoot: '' })).toEqual({
      root: PROJECT,
      source: 'workspace',
    });
  });

  test('an exists() throw counts as "does not exist"', async () => {
    seedWorkspace('owner', PROJECT);
    const result = await resolveStartupExplorerRoot({
      explorerRoot: EXPLORER_ROOT,
      profileId: 'owner',
      readSavedWorkspace,
      homeDir: HOME,
      exists: async () => {
        throw new Error('EACCES');
      },
    });
    // Both candidates fail the existence check: home.
    expect(result).toEqual({ root: HOME, source: 'home' });
  });
});
