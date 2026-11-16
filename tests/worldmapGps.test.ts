// @vitest-environment jsdom
/**
 * Offline Worldmap GPS parsers — tests against the SHIPPED
 * plugin file (plugin/arc/gps.js), loaded into jsdom and
 * exercised through window.WorldmapGPS. The parsers are
 * what real GPS projects depend on: GPX track points and
 * NMEA $GPGGA/$GPRMC sentences, file-based, offline.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const GPS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'arc', 'gps.js'),
  'utf8',
);

function loadGps() {
  // The shipped file assigns window.WorldmapGPS. feedFixes
  // needs the bus — provide a recording fake.
  const emitted: Array<{ event: string; data: unknown }> = [];
  (window as unknown as Record<string, unknown>).bus = {
    emit: (event: string, data: unknown) => {
      emitted.push({ event, data });
    },
  };
  window.eval(GPS_SRC);
  const gps = (window as unknown as Record<string, any>).WorldmapGPS;
  return { gps, emitted };
}

const GPX_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Williams Lake loop</name><trkseg>
    <trkpt lat="52.131" lon="-122.141"><ele>570</ele><time>2026-11-15T12:00:00Z</time></trkpt>
    <trkpt lat="52.132" lon="-122.140"><ele>571</ele><time>2026-11-15T12:01:00Z</time></trkpt>
    <trkpt lat="52.133" lon="-122.139"><ele>572</ele><time>2026-11-15T12:02:00Z</time></trkpt>
  </trkseg></trk>
  <wpt lat="52.130" lon="-122.142"><name>base</name></wpt>
</gpx>`;

const NMEA_SAMPLE = [
  '$GPGGA,120000.00,5207.8600,N,12208.4600,W,1,08,0.9,570.0,M,0.0,M,,*47',
  '$GPGGA,120100.00,5207.9200,N,12208.4000,W,1,08,0.9,571.0,M,0.0,M,,*48',
  '$GPGGA,120200.00,5207.8600,N,12208.4600,W,0,00,0.0,0.0,M,0.0,M,,*49',
  '$GPRMC,120300.00,A,5207.9800,N,12208.3400,W,0.5,0.0,151126,,,A*6C',
  '$GPRMC,120400.00,V,5207.9800,N,12208.3400,W,0.5,0.0,151126,,,A*6D',
  'not a sentence',
  '',
].join('\r\n');

describe('WorldmapGPS.parseGPX (shipped file)', () => {
  it('reads trkpt + wpt in order with time and elevation', () => {
    const { gps } = loadGps();
    const fixes = gps.parseGPX(GPX_SAMPLE);
    expect(fixes).toHaveLength(4);
    expect(fixes[0]).toEqual({ lat: 52.131, lon: -122.141, time: '2026-11-15T12:00:00Z', ele: 570 });
    expect(fixes[3]).toEqual({ lat: 52.13, lon: -122.142, time: null, ele: null });
  });

  it('returns [] for bad XML and non-strings', () => {
    const { gps } = loadGps();
    expect(gps.parseGPX('<gpx><trkpt lat="x"')).toEqual([]);
    expect(gps.parseGPX(null)).toEqual([]);
    expect(gps.parseGPX('')).toEqual([]);
  });
});

describe('WorldmapGPS.parseNMEA (shipped file)', () => {
  it('reads valid GGA fixes and RMC active fixes, skips the rest', () => {
    const { gps } = loadGps();
    const fixes = gps.parseNMEA(NMEA_SAMPLE);
    // 2 valid GGA + 1 valid RMC; the GGA with fix 0 and the
    // RMC with status V are skipped, as is the junk line.
    expect(fixes).toHaveLength(3);
    expect(fixes[0].lat).toBeCloseTo(52.131, 3);
    expect(fixes[0].lon).toBeCloseTo(-122.141, 3);
    expect(fixes[0].time).toBe('120000.00');
    expect(fixes[2].lat).toBeCloseTo(52.133, 3);
    expect(fixes[2].lon).toBeCloseTo(-122.139, 3);
  });

  it('returns [] for non-strings', () => {
    const { gps } = loadGps();
    expect(gps.parseNMEA(null)).toEqual([]);
    expect(gps.parseNMEA('')).toEqual([]);
  });
});

describe('WorldmapGPS.feedFixes (shipped file)', () => {
  it('emits one signal per valid fix on the bus', () => {
    const { gps, emitted } = loadGps();
    const fed = gps.feedFixes('gpx-track', [
      { lat: 52.131, lon: -122.141, time: 't1' },
      { lat: 52.132, lon: -122.14, time: 't2' },
      { lat: NaN, lon: -122.14 },
      { lat: 52.133, lon: -122.139 },
    ]);
    expect(fed).toBe(3);
    expect(emitted).toHaveLength(3);
    expect(emitted[0]).toEqual({
      event: 'signal',
      data: { device: 'gpx-track', rssi: -50, lat: 52.131, lon: -122.141, time: 't1' },
    });
  });
});
