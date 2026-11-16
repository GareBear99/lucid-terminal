/**
 * Offline Worldmap add-on — lib tests (Gary, 2026-11-15).
 * Pure helpers from src/lib/worldmapAddon.ts (the patch copy).
 */
import {
  WORLDMAP_ADDON_ID,
  WORLDMAP_REPO,
  WORLDMAP_PACKAGE_PATH,
  WORLDMAP_SHAPE_FILES,
  WORLDMAP_OFFLINE_FORBIDDEN_STRINGS,
  worldmapTarballUrl,
  isValidWorldmapSha,
  isAllowedWorldmapDownloadUrl,
  worldmapInstallStateText,
  worldmapPluginPageUrl,
} from '../src/lib/worldmapAddon';

describe('worldmap add-on constants', () => {
  it('identifies the add-on, repo and package path', () => {
    expect(WORLDMAP_ADDON_ID).toBe('offline-worldmap');
    expect(WORLDMAP_REPO).toBe('GareBear99/A-real-time-spatial-signal-intelligence-engine');
    expect(WORLDMAP_PACKAGE_PATH).toBe('arc_serverless_v10_complete');
  });

  it('requires the offline build in the shape list', () => {
    expect(WORLDMAP_SHAPE_FILES).toContain('index.html');
    expect(WORLDMAP_SHAPE_FILES).toContain('arc/map.js');
    expect(WORLDMAP_SHAPE_FILES).toContain('README.txt');
    expect(WORLDMAP_SHAPE_FILES).toContain('vendor/leaflet.js');
    expect(WORLDMAP_SHAPE_FILES).toContain('vendor/leaflet.css');
    expect(WORLDMAP_SHAPE_FILES).toContain('vendor/leaflet-heat.js');
    expect(WORLDMAP_SHAPE_FILES).toContain('vendor/images/marker-icon.png');
    expect(WORLDMAP_SHAPE_FILES).toContain('vendor/images/marker-shadow.png');
    expect(WORLDMAP_SHAPE_FILES).toContain('arc/gps.js');
    expect(WORLDMAP_SHAPE_FILES).toContain('arc/settings.js');
  });

  it('forbids the online markers', () => {
    expect(WORLDMAP_OFFLINE_FORBIDDEN_STRINGS).toContain('unpkg.com');
    expect(WORLDMAP_OFFLINE_FORBIDDEN_STRINGS).toContain('tile.openstreetmap.org');
  });
});

describe('worldmapTarballUrl', () => {
  it('builds a codeload tarball URL for an exact SHA', () => {
    const sha = 'a'.repeat(40);
    expect(worldmapTarballUrl(sha)).toBe(
      `https://codeload.github.com/${WORLDMAP_REPO}/tar.gz/${sha}`,
    );
  });
});

describe('isValidWorldmapSha', () => {
  it('accepts 40 lowercase hex', () => {
    expect(isValidWorldmapSha('a'.repeat(40))).toBe(true);
    expect(isValidWorldmapSha('0123456789abcdef'.repeat(2) + '01234567')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidWorldmapSha('main')).toBe(false);
    expect(isValidWorldmapSha('A'.repeat(40))).toBe(false);
    expect(isValidWorldmapSha('a'.repeat(39))).toBe(false);
    expect(isValidWorldmapSha(null)).toBe(false);
    expect(isValidWorldmapSha(42)).toBe(false);
  });
});

describe('isAllowedWorldmapDownloadUrl', () => {
  it('allows only the two GitHub hosts over https', () => {
    expect(isAllowedWorldmapDownloadUrl('https://codeload.github.com/x/y')).toBe(true);
    expect(isAllowedWorldmapDownloadUrl('https://api.github.com/repos/x')).toBe(true);
    expect(isAllowedWorldmapDownloadUrl('http://codeload.github.com/x')).toBe(false);
    expect(isAllowedWorldmapDownloadUrl('https://unpkg.com/leaflet')).toBe(false);
    expect(isAllowedWorldmapDownloadUrl('not a url')).toBe(false);
  });
});

describe('worldmapInstallStateText', () => {
  it('reads null / downloading / failed / installed', () => {
    expect(worldmapInstallStateText(null)).toBe('Not installed');
    expect(worldmapInstallStateText({ status: 'downloading', version: null, path: null, error: null })).toBe(
      'Fetching from the repo…',
    );
    expect(
      worldmapInstallStateText({ status: 'failed', version: null, path: null, error: 'boom' }),
    ).toBe('Fetch failed: boom');
    expect(
      worldmapInstallStateText({ status: 'installed', version: 'b'.repeat(40), path: '/tmp/wm', error: null }),
    ).toBe(`Fetched ${'b'.repeat(7)} · /tmp/wm`);
  });
});

describe('worldmapPluginPageUrl', () => {
  it('builds the file URL of the fetched package page', () => {
    expect(worldmapPluginPageUrl('/Users/gary/.lucid/addons/offline-worldmap/abc/arc_serverless_v10_complete')).toBe(
      'file:///Users/gary/.lucid/addons/offline-worldmap/abc/arc_serverless_v10_complete/index.html',
    );
    expect(worldmapPluginPageUrl('/tmp/wm/')).toBe('file:///tmp/wm/index.html');
  });
  it('returns null with no install path', () => {
    expect(worldmapPluginPageUrl(null)).toBeNull();
    expect(worldmapPluginPageUrl(undefined)).toBeNull();
  });
});
