/**
 * Phone streaming spike — pure-logic tests.
 *
 * Expected behaviour, written before the code ran (hand-checked
 * cases are marked):
 * - GPU gate: open only when `video_decode` really reads enabled
 *   AND no GPU is a software renderer; closed otherwise, with the
 *   hover reason.
 * - Two entries: external always; internal only when the Android
 *   add-on is installed, greyed out when the gate is closed.
 * - Capacity: 1 internal max, 99 external max, 100 total.
 * - STALE badge: 1999 ms is LIVE, 2000 ms is STALE.
 * - Annex B (hand-checked): [00 00 00 01 0x67 … 00 00 01 0x68 …]
 *   splits into 2 units of types 7 (SPS) and 8 (PPS).
 * - Touch (hand-checked): x=360 -> bytes 10-13 are 0x00000168,
 *   y=640 -> bytes 14-17 are 0x00000280; 32 bytes total.
 * - Metrics: frames at 0/33/66/100 ms -> ~30 fps, median 33 ms.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  GPU_GATE_DISABLED_REASON,
  GPU_GATE_CHECKING_REASON,
  PHONE_EXTERNAL_LABEL,
  PHONE_INTERNAL_LABEL,
  STALE_FRAME_MS,
  accessUnitIsKey,
  buildScrcpyServerArgs,
  buildScrcpyServerCommand,
  buildVideoDecoderConfig,
  canConnectExternal,
  canLoadInternal,
  capacitySummary,
  decodePathFromMediaCapabilities,
  encodeAccessUnit,
  encodeTouchMessage,
  decodeTouchMessage,
  evaluateGpuGate,
  extractSpsPps,
  frameAgeLabel,
  getPhoneEntries,
  groupAccessUnits,
  isFrameStale,
  isKeyFrameNal,
  nalUnitType,
  splitAnnexB,
  staleBadge,
  uncheckedGpuGate,
  StreamingMetrics,
} from '../src/phone/streaming';

const nal = (type: number, ...rest: number[]) =>
  new Uint8Array([(0x60 | type) & 0xff, ...rest]);

const annexB = (...units: Uint8Array[]) => {
  const total = units.reduce((s, u) => s + 4 + u.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const u of units) {
    out.set([0, 0, 0, 1], off);
    off += 4;
    out.set(u, off);
    off += u.length;
  }
  return out;
};

describe('GPU gate', () => {
  it('opens when video_decode is enabled on a real GPU', () => {
    const gate = evaluateGpuGate(
      { video_decode: 'enabled' },
      [{ deviceName: 'Intel(R) Iris Plus Graphics 645' }],
    );
    expect(gate.checked).toBe(true);
    expect(gate.hardwareDecode).toBe(true);
    expect(gate.reason).toBeNull();
    expect(gate.videoDecodeStatus).toBe('enabled');
  });

  it('closes when video_decode is software', () => {
    const gate = evaluateGpuGate({ video_decode: 'software' }, []);
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.reason).toBe(GPU_GATE_DISABLED_REASON);
  });

  it('closes when video_decode is disabled', () => {
    const gate = evaluateGpuGate({ video_decode: 'disabled' }, []);
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.reason).toBe(GPU_GATE_DISABLED_REASON);
  });

  it('closes when the status is missing entirely', () => {
    const gate = evaluateGpuGate({}, []);
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.videoDecodeStatus).toBe('unknown');
    expect(gate.reason).toBe(GPU_GATE_DISABLED_REASON);
  });

  it('closes when video_decode claims enabled but the GPU is SwiftShader', () => {
    const gate = evaluateGpuGate(
      { video_decode: 'enabled' },
      [{ deviceName: 'Google SwiftShader' }],
    );
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.reason).toBe(GPU_GATE_DISABLED_REASON);
  });

  it('closes when there is no feature status at all', () => {
    const gate = evaluateGpuGate(null, null);
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.reason).toBe(GPU_GATE_DISABLED_REASON);
  });

  it('unchecked gate reports checking, not open', () => {
    const gate = uncheckedGpuGate();
    expect(gate.checked).toBe(false);
    expect(gate.hardwareDecode).toBe(false);
    expect(gate.reason).toBe(GPU_GATE_CHECKING_REASON);
  });
});

describe('decode path reporting', () => {
  it('powerEfficient means hardware', () => {
    expect(
      decodePathFromMediaCapabilities({ supported: true, powerEfficient: true, smooth: true }),
    ).toBe('hardware');
  });

  it('supported but not powerEfficient means software', () => {
    expect(
      decodePathFromMediaCapabilities({ supported: true, powerEfficient: false, smooth: true }),
    ).toBe('software');
  });

  it('unsupported means unknown, never assumed hardware', () => {
    expect(
      decodePathFromMediaCapabilities({ supported: false, powerEfficient: false, smooth: false }),
    ).toBe('unknown');
    expect(decodePathFromMediaCapabilities(null)).toBe('unknown');
  });
});

describe('two-entry Phone button', () => {
  const openGate = evaluateGpuGate(
    { video_decode: 'enabled' },
    [{ deviceName: 'Intel(R) UHD Graphics 630' }],
  );
  const closedGate = evaluateGpuGate({ video_decode: 'software' }, []);

  it('shows only the external entry when the add-on is not installed', () => {
    const entries = getPhoneEntries({ androidAddonInstalled: false, gpuGate: openGate });
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe(PHONE_EXTERNAL_LABEL);
    expect(entries[0].kind).toBe('external');
    expect(entries[0].disabled).toBe(false);
    expect(entries[0].disabledReason).toBeNull();
  });

  it('shows both entries when installed and the gate is open', () => {
    const entries = getPhoneEntries({ androidAddonInstalled: true, gpuGate: openGate });
    expect(entries.map((e) => e.label)).toEqual([PHONE_EXTERNAL_LABEL, PHONE_INTERNAL_LABEL]);
    expect(entries[1].kind).toBe('internal');
    expect(entries[1].disabled).toBe(false);
    expect(entries[1].disabledReason).toBeNull();
  });

  it('greys out the internal entry with the hover reason when the gate is closed', () => {
    const entries = getPhoneEntries({ androidAddonInstalled: true, gpuGate: closedGate });
    expect(entries[1].disabled).toBe(true);
    expect(entries[1].disabledReason).toBe(GPU_GATE_DISABLED_REASON);
    // The external entry is unaffected by the gate.
    expect(entries[0].disabled).toBe(false);
  });

  it('greys out the internal entry while the gate is still checking', () => {
    const entries = getPhoneEntries({
      androidAddonInstalled: true,
      gpuGate: uncheckedGpuGate(),
    });
    expect(entries[1].disabled).toBe(true);
    expect(entries[1].disabledReason).toBe(GPU_GATE_CHECKING_REASON);
  });
});

describe('capacity caps', () => {
  it('refuses a second internal instance', () => {
    expect(canLoadInternal({ internalLoaded: 0, externalConnected: 0 }).allowed).toBe(true);
    const refused = canLoadInternal({ internalLoaded: 1, externalConnected: 0 });
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toMatch(/one internal/i);
  });

  it('refuses the 100th external connection', () => {
    expect(canConnectExternal({ internalLoaded: 0, externalConnected: 98 }).allowed).toBe(true);
    expect(canConnectExternal({ internalLoaded: 0, externalConnected: 99 }).allowed).toBe(false);
    const refused = canConnectExternal({ internalLoaded: 0, externalConnected: 99 });
    expect(refused.reason).toMatch(/99/);
  });

  it('refuses anything past 100 total', () => {
    expect(
      canConnectExternal({ internalLoaded: 1, externalConnected: 99 }).allowed,
    ).toBe(false);
    expect(canLoadInternal({ internalLoaded: 1, externalConnected: 99 }).allowed).toBe(false);
  });

  it('summarises the counts the way the UI shows them', () => {
    expect(capacitySummary({ internalLoaded: 1, externalConnected: 3 })).toBe(
      '1 internal loaded, 3/99 external connected',
    );
    expect(capacitySummary({ internalLoaded: 0, externalConnected: 0 })).toBe(
      '0 internal loaded, 0/99 external connected',
    );
  });
});

describe('STALE badge', () => {
  it('1999 ms is LIVE, 2000 ms is STALE', () => {
    expect(isFrameStale(STALE_FRAME_MS - 1)).toBe(false);
    expect(isFrameStale(STALE_FRAME_MS)).toBe(true);
  });

  it('labels a fresh frame LIVE and an old frame with its age', () => {
    expect(frameAgeLabel(500)).toBe('LIVE');
    expect(frameAgeLabel(2500)).toBe('STALE 2.5s');
    expect(staleBadge(500)).toEqual({ stale: false, label: 'LIVE', ageMs: 500 });
    expect(staleBadge(6300).label).toBe('STALE 6.3s');
  });
});

describe('Annex B parsing', () => {
  it('splits the hand-checked SPS/PPS stream into types 7 and 8', () => {
    const stream = annexB(nal(7, 0x42, 0x00), nal(8, 0x01));
    // 4-byte start code on the first unit, 3-byte on the second.
    const mixed = new Uint8Array([
      0, 0, 0, 1, 0x67, 0x42, 0x00, 0, 0, 1, 0x68, 0x01,
    ]);
    void stream;
    const units = splitAnnexB(mixed);
    expect(units).toHaveLength(2);
    expect(nalUnitType(units[0])).toBe(7);
    expect(nalUnitType(units[1])).toBe(8);
    expect(extractSpsPps(units).sps).toEqual(units[0]);
    expect(extractSpsPps(units).pps).toEqual(units[1]);
  });

  it('identifies IDR frames', () => {
    expect(isKeyFrameNal(nal(5, 0x88))).toBe(true);
    expect(isKeyFrameNal(nal(1, 0x41))).toBe(false);
  });

  it('groups NALs into one AU per frame', () => {
    const aus = groupAccessUnits([
      nal(7), nal(8), nal(5), nal(1), nal(1),
    ]);
    expect(aus).toHaveLength(3);
    expect(aus[0].map(nalUnitType)).toEqual([7, 8, 5]);
    expect(aus[1].map(nalUnitType)).toEqual([1]);
    expect(aus[2].map(nalUnitType)).toEqual([1]);
  });

  it('round-trips an access unit through start-code encoding', () => {
    const units = [nal(7, 1), nal(8, 2), nal(5, 3)];
    const encoded = encodeAccessUnit(units);
    const back = splitAnnexB(encoded);
    expect(back).toHaveLength(3);
    expect(back.map((u) => Array.from(u))).toEqual(units.map((u) => Array.from(u)));
    expect(accessUnitIsKey(encoded)).toBe(true);
    expect(accessUnitIsKey(encodeAccessUnit([nal(1, 9)]))).toBe(false);
  });
});

describe('scrcpy server launch', () => {
  it('builds key=value args with a raw stream, video only', () => {
    const args = buildScrcpyServerArgs({ scid: 12345678 });
    expect(args).toContain('scid=12345678');
    expect(args).toContain('raw_stream=true');
    expect(args).toContain('audio=false');
    expect(args).toContain('control=true');
    expect(args).toContain('max_size=720');
    expect(args).toContain('max_fps=30');
    expect(args).toContain('video_bit_rate=2000000');
    expect(args).toContain('video_codec=h264');
    expect(args.every((a) => !a.startsWith('--'))).toBe(true);
  });

  it('builds the app_process command with the pinned version', () => {
    const command = buildScrcpyServerCommand(['raw_stream=true']);
    expect(command).toContain('app_process / com.genymobile.scrcpy.Server 2.4');
    expect(command).toContain('CLASSPATH=/data/local/tmp/scrcpy-server.jar');
    expect(command).toContain('raw_stream=true');
  });
});

describe('touch messages', () => {
  it('encodes the hand-checked tap: 32 bytes, x=360, y=640', () => {
    const bytes = encodeTouchMessage({
      action: 0,
      pointerId: 1n,
      x: 360,
      y: 640,
      width: 720,
      height: 1280,
      pressure: 1,
      actionButton: 0,
      buttons: 1,
    });
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(2);
    expect(bytes[1]).toBe(0);
    // x = 360 = 0x00000168, y = 640 = 0x00000280, big-endian.
    expect(Array.from(bytes.slice(10, 14))).toEqual([0, 0, 1, 0x68]);
    expect(Array.from(bytes.slice(14, 18))).toEqual([0, 0, 2, 0x80]);
    // Pressure 1.0 -> 0xFFFF.
    expect(Array.from(bytes.slice(22, 24))).toEqual([0xff, 0xff]);
  });

  it('round-trips a move message exactly', () => {
    const msg = {
      action: 2,
      pointerId: 7n,
      x: 100,
      y: 200,
      width: 720,
      height: 1280,
      pressure: 0.5,
      actionButton: 0,
      buttons: 1,
    };
    const decoded = decodeTouchMessage(encodeTouchMessage(msg));
    expect(decoded.action).toBe(2);
    expect(decoded.pointerId).toBe(7n);
    expect(decoded.x).toBe(100);
    expect(decoded.y).toBe(200);
    expect(decoded.width).toBe(720);
    expect(decoded.height).toBe(1280);
    expect(decoded.pressure).toBeCloseTo(0.5, 2);
    expect(decoded.buttons).toBe(1);
  });

  it('rejects a short buffer instead of sending garbage', () => {
    expect(() => decodeTouchMessage(new Uint8Array(10))).toThrow();
  });
});

describe('VideoDecoder config', () => {
  it('asks for H.264 with prefer-hardware', () => {
    expect(buildVideoDecoderConfig()).toEqual({
      codec: 'avc1.42E01E',
      hardwareAcceleration: 'prefer-hardware',
    });
  });
});

describe('streaming metrics', () => {
  it('measures ~30 fps and a 33 ms median interval for frames at 0/33/66/100', () => {
    const m = new StreamingMetrics();
    m.recordFrame(0, 1000);
    m.recordFrame(33, 1000);
    m.recordFrame(66, 1000);
    m.recordFrame(100, 1000);
    const s = m.snapshot(100);
    expect(s.frames).toBe(4);
    expect(s.fps).toBeCloseTo(30, 0);
    expect(s.medianFrameIntervalMs).toBe(33);
    expect(s.lastFrameAgeMs).toBe(0);
    expect(s.decodePath).toBe('unknown');
  });

  it('medians tap latency and reports the decode path once told', () => {
    const m = new StreamingMetrics();
    m.recordTap(12);
    m.recordTap(18);
    m.recordTap(15);
    m.reportDecodePath('hardware');
    const s = m.snapshot(1000);
    expect(s.taps).toBe(3);
    expect(s.medianTapMs).toBe(15);
    expect(s.decodePath).toBe('hardware');
  });

  it('counts reconnects and bytes', () => {
    const m = new StreamingMetrics();
    m.recordFrame(0, 500);
    m.recordReconnect();
    const s = m.snapshot(10);
    expect(s.bytesReceived).toBe(500);
    expect(s.reconnects).toBe(1);
    expect(s.lastFrameAgeMs).toBe(10);
  });
});
