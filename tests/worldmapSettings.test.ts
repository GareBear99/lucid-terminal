/**
 * Offline Worldmap settings — lib tests (Gary, 2026-11-15).
 * Pure helpers from src/lib/worldmapSettings.ts (the patch copy).
 * Twin of the plugin's arc/settings.js sanitize — both must
 * accept the same inputs and produce the same defaults.
 */
import {
  WORLDMAP_DEFAULT_SETTINGS,
  sanitizeWorldmapSettings,
} from '../src/lib/worldmapSettings';

describe('WORLDMAP_DEFAULT_SETTINGS', () => {
  it('starts offline and silent on Williams Lake', () => {
    expect(WORLDMAP_DEFAULT_SETTINGS.centerLat).toBe(52.131);
    expect(WORLDMAP_DEFAULT_SETTINGS.centerLon).toBe(-122.141);
    expect(WORLDMAP_DEFAULT_SETTINGS.zoom).toBe(15);
    expect(WORLDMAP_DEFAULT_SETTINGS.tileMode).toBe('grid');
    expect(WORLDMAP_DEFAULT_SETTINGS.tilePath).toBe('');
    expect(WORLDMAP_DEFAULT_SETTINGS.tileUrlTemplate).toBe('');
    expect(WORLDMAP_DEFAULT_SETTINGS.gpsSource).toBe('none');
    expect(WORLDMAP_DEFAULT_SETTINGS.simulatorDevices).toEqual(['phone1', 'phone2']);
    expect(WORLDMAP_DEFAULT_SETTINGS.simulatorIntervalMs).toBe(600);
    expect(WORLDMAP_DEFAULT_SETTINGS.showPaths).toBe(true);
  });
});

describe('sanitizeWorldmapSettings', () => {
  it('returns defaults for null / non-objects', () => {
    expect(sanitizeWorldmapSettings(null)).toEqual(WORLDMAP_DEFAULT_SETTINGS);
    expect(sanitizeWorldmapSettings(undefined)).toEqual(WORLDMAP_DEFAULT_SETTINGS);
    expect(sanitizeWorldmapSettings('nope')).toEqual(WORLDMAP_DEFAULT_SETTINGS);
  });

  it('accepts a full valid patch', () => {
    const next = sanitizeWorldmapSettings({
      centerLat: 10,
      centerLon: 20,
      zoom: 12,
      tileMode: 'local',
      tilePath: '/tmp/tiles',
      tileUrlTemplate: '',
      gpsSource: 'gpx',
      simulatorDevices: ['a', 'b', 'c'],
      simulatorIntervalMs: 1000,
      showPaths: false,
    });
    expect(next.centerLat).toBe(10);
    expect(next.centerLon).toBe(20);
    expect(next.zoom).toBe(12);
    expect(next.tileMode).toBe('local');
    expect(next.tilePath).toBe('/tmp/tiles');
    expect(next.gpsSource).toBe('gpx');
    expect(next.simulatorDevices).toEqual(['a', 'b', 'c']);
    expect(next.simulatorIntervalMs).toBe(1000);
    expect(next.showPaths).toBe(false);
  });

  it('clamps out-of-range centre/zoom/interval to defaults', () => {
    const next = sanitizeWorldmapSettings({
      centerLat: 200,
      centerLon: -300,
      zoom: 99,
      simulatorIntervalMs: 5,
    });
    expect(next.centerLat).toBe(WORLDMAP_DEFAULT_SETTINGS.centerLat);
    expect(next.centerLon).toBe(WORLDMAP_DEFAULT_SETTINGS.centerLon);
    expect(next.zoom).toBe(WORLDMAP_DEFAULT_SETTINGS.zoom);
    expect(next.simulatorIntervalMs).toBe(WORLDMAP_DEFAULT_SETTINGS.simulatorIntervalMs);
  });

  it('rejects unknown tile modes and GPS sources', () => {
    const next = sanitizeWorldmapSettings({ tileMode: 'satellite', gpsSource: 'cell' });
    expect(next.tileMode).toBe('grid');
    expect(next.gpsSource).toBe('none');
  });

  it('trims string fields and drops empty device names', () => {
    const next = sanitizeWorldmapSettings({
      tilePath: '  /tmp/tiles/  ',
      simulatorDevices: ['  ', 'phone9', 42, ''],
    });
    expect(next.tilePath).toBe('/tmp/tiles/');
    expect(next.simulatorDevices).toEqual(['phone9']);
  });

  it('ignores unknown keys', () => {
    const next = sanitizeWorldmapSettings({ whatever: 1, centerLat: 5 });
    expect((next as unknown as Record<string, unknown>).whatever).toBeUndefined();
    expect(next.centerLat).toBe(5);
  });
});
