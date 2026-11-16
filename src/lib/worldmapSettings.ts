/**
 * Offline Worldmap add-on — user settings (Gary, 2026-11-15:
 * the plugin is user-customizable — its settings are
 * user-changeable, not hardcoded).
 *
 * Persisted in the settings store as `worldmapSettings`
 * (see src/types/index.ts). The segment's settings form and
 * the plugin page (over postMessage) both read and write
 * this one object. The plugin page's own settings.js is the
 * twin of this module (same defaults, same validation) for
 * the standalone page; keep them identical by hand.
 *
 * Defaults are the Williams Lake centre the original engine
 * shipped with (52.131, -122.141, zoom 15), grid tiles (no
 * tile files, no network) and no GPS source — the plugin
 * starts offline and silent, and the user turns things on.
 */

export type WorldmapTileMode = 'grid' | 'local' | 'url';
export type WorldmapGpsSource = 'none' | 'simulator' | 'geolocation' | 'gpx' | 'nmea';

export interface WorldmapSettings {
  /** Map centre latitude. */
  centerLat: number;
  /** Map centre longitude. */
  centerLon: number;
  /** Map zoom (0–19). */
  zoom: number;
  /** Tile source: grid (drawn, offline) | local (tile dir) | url (template). */
  tileMode: WorldmapTileMode;
  /** Local tile directory path (file:// or relative) for 'local'. */
  tilePath: string;
  /** Tile URL template for 'url'. */
  tileUrlTemplate: string;
  /** GPS source. */
  gpsSource: WorldmapGpsSource;
  /** Simulated device ids (simulator mode). */
  simulatorDevices: string[];
  /** Simulator tick interval, ms (100–60000). */
  simulatorIntervalMs: number;
  /** Draw device path polylines. */
  showPaths: boolean;
}

export const WORLDMAP_DEFAULT_SETTINGS: WorldmapSettings = {
  centerLat: 52.131,
  centerLon: -122.141,
  zoom: 15,
  tileMode: 'grid',
  tilePath: '',
  tileUrlTemplate: '',
  gpsSource: 'none',
  simulatorDevices: ['phone1', 'phone2'],
  simulatorIntervalMs: 600,
  showPaths: true,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Keep only known keys, coerce to sane types, fall back to
 *  defaults for anything missing or out of range. Never throws.
 *  Twin of sanitizeWorldmapSettings in the plugin's
 *  arc/settings.js — keep them identical by hand. */
export function sanitizeWorldmapSettings(raw: unknown): WorldmapSettings {
  const out: WorldmapSettings = { ...WORLDMAP_DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<WorldmapSettings>;
  if (isFiniteNumber(r.centerLat) && r.centerLat >= -90 && r.centerLat <= 90) out.centerLat = r.centerLat;
  if (isFiniteNumber(r.centerLon) && r.centerLon >= -180 && r.centerLon <= 180) out.centerLon = r.centerLon;
  if (isFiniteNumber(r.zoom) && r.zoom >= 0 && r.zoom <= 19) out.zoom = Math.floor(r.zoom);
  if (r.tileMode === 'grid' || r.tileMode === 'local' || r.tileMode === 'url') out.tileMode = r.tileMode;
  if (typeof r.tilePath === 'string') out.tilePath = r.tilePath.trim();
  if (typeof r.tileUrlTemplate === 'string') out.tileUrlTemplate = r.tileUrlTemplate.trim();
  if (
    r.gpsSource === 'none' ||
    r.gpsSource === 'simulator' ||
    r.gpsSource === 'geolocation' ||
    r.gpsSource === 'gpx' ||
    r.gpsSource === 'nmea'
  ) {
    out.gpsSource = r.gpsSource;
  }
  if (Array.isArray(r.simulatorDevices)) {
    const names = r.simulatorDevices.filter((d): d is string => typeof d === 'string' && d.trim() !== '').slice(0, 20);
    if (names.length > 0) out.simulatorDevices = names;
  }
  if (isFiniteNumber(r.simulatorIntervalMs) && r.simulatorIntervalMs >= 100 && r.simulatorIntervalMs <= 60000) {
    out.simulatorIntervalMs = Math.floor(r.simulatorIntervalMs);
  }
  if (typeof r.showPaths === 'boolean') out.showPaths = r.showPaths;
  return out;
}
