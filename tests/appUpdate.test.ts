// App update decisions (Gary, 2026-11-16).
//
// The Updates section checks the latest GitHub release, decides
// whether it is newer than the installed version, and records
// which versions have run on this machine.
//
// Covers: version comparison (newer / equal / older /
// uncomparable never counts as newer); release parsing (valid,
// missing tag, bad tag, missing URL, missing date, the Mac
// Intel .dmg asset picked and the arm64 one ignored, no asset
// means a null download URL); the alert decision (newer +
// opted-in shows, opted-out never shows, guest never opts
// out so always shows); the version history (append, dedupe
// keeps the original first-seen date, capped at 50).
//
// Run with: npx vitest run tests/appUpdate.test.ts
import { describe, test, expect } from 'vitest';
import {
  INSTALLED_APP_VERSIONS_LIMIT,
  checkAppUpdate,
  compareVersions,
  isAppUpdateAvailable,
  isNewerVersion,
  macDmgAssetName,
  parseAppRelease,
  recordVersionSeen,
  shouldShowAppUpdateAlert,
  type AppRelease,
} from '../src/lib/appUpdate';

const RELEASE_120: AppRelease = {
  version: '1.2.0',
  tagName: 'v1.2.0',
  name: 'v1.2.0',
  htmlUrl: 'https://github.com/GareBear99/lucid-terminal/releases/tag/v1.2.0',
  publishedAt: '2026-11-16T10:00:00Z',
  notes: 'The Updates section.',
  downloadUrl: 'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0.dmg',
};

function rawRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v1.2.0',
    name: 'v1.2.0',
    html_url: 'https://github.com/GareBear99/lucid-terminal/releases/tag/v1.2.0',
    published_at: '2026-11-16T10:00:00Z',
    body: 'The Updates section.',
    assets: [
      {
        name: 'Lucid.Terminal-1.2.0.dmg',
        browser_download_url:
          'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0.dmg',
      },
      {
        name: 'Lucid.Terminal-1.2.0-arm64.dmg',
        browser_download_url:
          'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0-arm64.dmg',
      },
    ],
    ...overrides,
  };
}

describe('compareVersions / isNewerVersion', () => {
  test('newer, equal and older compare correctly', () => {
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    expect(compareVersions('v1.1.0', '1.2.0')).toBe(-1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  test('a version that is not a plain dotted number never counts as newer', () => {
    expect(compareVersions('1.1.0', 'v1.2.0-beta')).toBe(0);
    expect(isNewerVersion('1.1.0', 'v1.2.0-beta')).toBe(false);
    expect(isNewerVersion('1.1.0', 'latest')).toBe(false);
  });

  test('isNewerVersion is true only when the latest is strictly newer', () => {
    expect(isNewerVersion('1.1.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.2.0', '1.1.0')).toBe(false);
  });
});

describe('parseAppRelease', () => {
  test('parses a valid release and picks the Intel .dmg, not the arm64 one', () => {
    const release = parseAppRelease(rawRelease());
    expect(release.version).toBe('1.2.0');
    expect(release.tagName).toBe('v1.2.0');
    expect(release.htmlUrl).toContain('/releases/tag/v1.2.0');
    expect(release.publishedAt).toBe('2026-11-16T10:00:00Z');
    expect(release.notes).toBe('The Updates section.');
    expect(release.downloadUrl).toBe(
      'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0.dmg',
    );
  });

  test('a release with no Mac Intel .dmg asset has a null download URL, never an invented link', () => {
    const release = parseAppRelease(rawRelease({ assets: [] }));
    expect(release.downloadUrl).toBeNull();
  });

  test('throws on a missing tag, a bad tag, a missing URL, and a missing date', () => {
    expect(() => parseAppRelease(rawRelease({ tag_name: undefined }))).toThrow();
    expect(() => parseAppRelease(rawRelease({ tag_name: 'latest' }))).toThrow();
    expect(() => parseAppRelease(rawRelease({ tag_name: '1.2' }))).toThrow();
    expect(() => parseAppRelease(rawRelease({ html_url: undefined }))).toThrow();
    expect(() => parseAppRelease(rawRelease({ published_at: '' }))).toThrow();
    expect(() => parseAppRelease(null)).toThrow();
    expect(() => parseAppRelease('v1.2.0')).toThrow();
  });

  test('the .dmg asset name is the Intel one for the version', () => {
    expect(macDmgAssetName('1.2.0')).toBe('Lucid.Terminal-1.2.0.dmg');
  });
});

describe('shouldShowAppUpdateAlert / checkAppUpdate', () => {
  test('a newer version shows the alert when the profile has not opted out', () => {
    expect(
      shouldShowAppUpdateAlert({ latest: RELEASE_120, current: '1.1.0', skipUpdateAlert: false }),
    ).toBe(true);
  });

  test('opting out silences the alert even when a newer version exists', () => {
    expect(
      shouldShowAppUpdateAlert({ latest: RELEASE_120, current: '1.1.0', skipUpdateAlert: true }),
    ).toBe(false);
  });

  test('no newer version never alerts, whatever the toggle says', () => {
    expect(
      shouldShowAppUpdateAlert({
        latest: { ...RELEASE_120, version: '1.1.0', tagName: 'v1.1.0' },
        current: '1.1.0',
        skipUpdateAlert: false,
      }),
    ).toBe(false);
    expect(
      shouldShowAppUpdateAlert({ latest: null, current: '1.1.0', skipUpdateAlert: false }),
    ).toBe(false);
  });

  test('checkAppUpdate reports available + showAlert + the reason', () => {
    const result = checkAppUpdate(RELEASE_120, false);
    expect(result.available).toBe(true);
    expect(result.showAlert).toBe(true);
    expect(result.reason).toContain('v1.2.0');
    expect(isAppUpdateAvailable('1.1.0', RELEASE_120)).toBe(true);
  });

  test('checkAppUpdate reports not available when installed matches the release', () => {
    const result = checkAppUpdate(
      { ...RELEASE_120, version: '1.1.0', tagName: 'v1.1.0' },
      false,
    );
    expect(result.available).toBe(false);
    expect(result.showAlert).toBe(false);
  });
});

describe('recordVersionSeen', () => {
  test('appends a new version with its first-seen date', () => {
    const next = recordVersionSeen([], '1.1.0', '2026-11-16T10:00:00Z');
    expect(next).toEqual([{ version: '1.1.0', firstSeenAt: '2026-11-16T10:00:00Z' }]);
  });

  test('a version already in the list keeps its original first-seen date', () => {
    const history = [{ version: '1.1.0', firstSeenAt: '2026-11-09T10:00:00Z' }];
    const next = recordVersionSeen(history, '1.1.0', '2026-11-16T10:00:00Z');
    expect(next).toEqual(history);
  });

  test('caps at the limit, oldest entries fall off first', () => {
    const history = Array.from({ length: INSTALLED_APP_VERSIONS_LIMIT }, (_, i) => ({
      version: `1.0.${i}`,
      firstSeenAt: '2026-11-01T10:00:00Z',
    }));
    const next = recordVersionSeen(history, '1.2.0', '2026-11-16T10:00:00Z');
    expect(next.length).toBe(INSTALLED_APP_VERSIONS_LIMIT);
    expect(next[0].version).toBe('1.0.1');
    expect(next[next.length - 1].version).toBe('1.2.0');
  });
});
