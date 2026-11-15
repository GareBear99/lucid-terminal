/**
 * ARC Server add-on helper tests (Gary, 2026-11-14 ~14:53
 * PST: ARC Server is an installable add-on, fetched at
 * install time from its repo, never bundled in Lucid).
 *
 * The fetch target is the repo tarball for one exact commit
 * SHA — the repo has no releases and no tags (verified
 * 2026-11-14), so there is no release artifact. A SHA never
 * moves; a branch name does. The main process never
 * downloads an arbitrary URL: the URLs are built from
 * constants + the API-fetched SHA.
 *
 * Run with: npx vitest run tests/arcServerAddon.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  ARC_SERVER_ADDON_ID,
  ARC_SERVER_BUILD_NOTE,
  ARC_SERVER_DOWNLOAD_HOSTS,
  ARC_SERVER_REPO,
  ARC_SERVER_REPO_URL,
  arcServerInstallStateText,
  arcServerTarballUrl,
  isAllowedArcServerDownloadUrl,
  isValidArcServerSha,
  shortSha,
  type ArcServerInstallState,
} from '../src/lib/arcServerAddon';

const SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('ARC Server add-on identity', () => {
  it('the add-on id is arc-server (not the driving-agent id — same string, different thing)', () => {
    expect(ARC_SERVER_ADDON_ID).toBe('arc-server');
  });

  it('points at the GareBear99/ARC-Server repo', () => {
    expect(ARC_SERVER_REPO).toBe('GareBear99/ARC-Server');
    expect(ARC_SERVER_REPO_URL).toBe('https://github.com/GareBear99/ARC-Server');
  });
});

describe('arcServerTarballUrl', () => {
  it('builds the codeload tarball URL for one exact SHA', () => {
    expect(arcServerTarballUrl(SHA)).toBe(
      `https://codeload.github.com/GareBear99/ARC-Server/tar.gz/${SHA}`,
    );
  });
});

describe('isValidArcServerSha', () => {
  it('accepts a 40-char lowercase hex SHA', () => {
    expect(isValidArcServerSha(SHA)).toBe(true);
  });

  it('rejects a branch name, a short SHA, uppercase, and non-strings', () => {
    expect(isValidArcServerSha('main')).toBe(false);
    expect(isValidArcServerSha('a1b2c3d')).toBe(false);
    expect(isValidArcServerSha(SHA.toUpperCase())).toBe(false);
    expect(isValidArcServerSha('g'.repeat(40))).toBe(false);
    expect(isValidArcServerSha(42)).toBe(false);
    expect(isValidArcServerSha(null)).toBe(false);
  });
});

describe('isAllowedArcServerDownloadUrl', () => {
  it('allows the codeload tarball and the GitHub API, https only', () => {
    expect(isAllowedArcServerDownloadUrl(arcServerTarballUrl(SHA))).toBe(true);
    expect(
      isAllowedArcServerDownloadUrl(
        'https://api.github.com/repos/GareBear99/ARC-Server/commits/main',
      ),
    ).toBe(true);
  });

  it('refuses http, other hosts, and non-URLs', () => {
    expect(
      isAllowedArcServerDownloadUrl(
        'http://codeload.github.com/GareBear99/ARC-Server/tar.gz/' + SHA,
      ),
    ).toBe(false);
    expect(
      isAllowedArcServerDownloadUrl('https://example.com/arc-server.tar.gz'),
    ).toBe(false);
    expect(
      isAllowedArcServerDownloadUrl(
        'https://objects.githubusercontent.com/arc-server.tar.gz',
      ),
    ).toBe(false);
    expect(isAllowedArcServerDownloadUrl('not a url')).toBe(false);
    expect(isAllowedArcServerDownloadUrl(undefined)).toBe(false);
  });

  it('the host allowlist is exactly codeload + api.github.com', () => {
    expect(ARC_SERVER_DOWNLOAD_HOSTS).toEqual([
      'codeload.github.com',
      'api.github.com',
    ]);
  });
});

describe('shortSha', () => {
  it('shows the first 7 chars', () => {
    expect(shortSha(SHA)).toBe('a1b2c3d');
  });
});

describe('arcServerInstallStateText', () => {
  it('null state reads Not installed', () => {
    expect(arcServerInstallStateText(null)).toBe('Not installed');
  });

  it('downloading reads as fetching', () => {
    const state: ArcServerInstallState = {
      status: 'downloading',
      version: null,
      path: null,
      error: null,
    };
    expect(arcServerInstallStateText(state)).toBe('Fetching from the repo…');
  });

  it('failed reads with the error', () => {
    const state: ArcServerInstallState = {
      status: 'failed',
      version: null,
      path: null,
      error: 'boom',
    };
    expect(arcServerInstallStateText(state)).toBe('Fetch failed: boom');
    expect(
      arcServerInstallStateText({ ...state, error: null }),
    ).toBe('Fetch failed.');
  });

  it('installed reads the fetched SHA and path', () => {
    const state: ArcServerInstallState = {
      status: 'installed',
      version: SHA,
      path: `/Users/gary/.lucid/addons/arc-server/${SHA}`,
      error: null,
    };
    expect(arcServerInstallStateText(state)).toBe(
      `Fetched a1b2c3d · /Users/gary/.lucid/addons/arc-server/${SHA}`,
    );
    expect(
      arcServerInstallStateText({ ...state, path: null }),
    ).toBe('Fetched a1b2c3d');
  });
});

describe('ARC_SERVER_BUILD_NOTE', () => {
  it('says the fetched directory is source and make is the user’s step', () => {
    expect(ARC_SERVER_BUILD_NOTE).toContain('make');
    expect(ARC_SERVER_BUILD_NOTE).toContain('Source only');
  });
});
