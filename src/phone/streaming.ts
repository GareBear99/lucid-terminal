/**
 * Phone streaming — shared pure logic for the Phase 0 spike.
 *
 * This module has no Electron, DOM, or Node imports, so the main
 * process, the renderer, and vitest can all use it as-is. It owns:
 *
 * - the GPU gate (Gary's rule: Lucid's in-app streaming button is
 *   enabled only when hardware video decode is really there);
 * - the two-entry Phone button (external vs installed add-on);
 * - the capacity caps (1 internal, 99 external, 100 total);
 * - the STALE badge (frame age);
 * - the scrcpy wire format (raw Annex B video, 32-byte touch
 *   messages) and the server launch options;
 * - the streaming metrics (fps, frame interval, tap latency, decode
 *   path) the spike reports instead of assuming.
 *
 * Protocol sources (checked 2026-11-05, not assumed):
 * - scrcpy develop.md: the server is started as
 *   `app_process / com.genymobile.scrcpy.Server <version>
 *   key=value ...`; with `raw_stream=true` the video socket carries
 *   raw H.264 Annex B with no per-packet headers, no codec id, no
 *   session packet, no device name. Server and client versions must
 *   match exactly — the spike pins 2.4.
 * - scrcpy control protocol: INJECT_TOUCH_EVENT (type 2) is
 *   type(1) + action(1) + pointerId(8) + position(12: x, y, width,
 *   height) + pressure(2, u16 fixed-point) + actionButton(4) +
 *   buttons(4) = 32 bytes, big-endian.
 *
 * What this module does NOT do: touch the emulator, the standalone
 * phone-control server, or anything outside Lucid's in-app stream.
 * The relay-vs-P2P question is still Gary's to answer (Phase 3).
 */

/** Pinned scrcpy-server version. Server and client must match exactly. */
export const SCRCPY_SERVER_VERSION = '2.4';
/** Where the jar lives when bundled (Apache-2.0, Genymobile). Not
 *  bundled yet — the session fails loudly naming this path until
 *  Gary answers whether the jar ships inside Lucid or downloads on
 *  first use. */
export const SCRCPY_SERVER_JAR_RELATIVE = 'resources/scrcpy/scrcpy-server.jar';
export const SCRCPY_SERVER_DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';
export const SCRCPY_SERVER_CLASS = 'com.genymobile.scrcpy.Server';

/** Hard caps (Gary's rule): 1 loaded internal, 99 external, 100 total. */
export const MAX_INTERNAL_DEVICES = 1;
export const MAX_EXTERNAL_DEVICES = 99;
export const MAX_TOTAL_DEVICES = 100;

/** A frame older than this is shown as STALE, never as live. */
export const STALE_FRAME_MS = 2000;
/** The frame-rate target for the visible (internal) stream. */
export const STREAM_TARGET_FPS = 30;
/** Tap-to-device target over the control socket (not visual feedback). */
export const TAP_LATENCY_TARGET_MS = 20;

/** Hover reason on the greyed-out internal Phone entry. */
export const GPU_GATE_DISABLED_REASON =
  'Phone streaming needs hardware video decoding — no GPU detected';
export const GPU_GATE_CHECKING_REASON = 'Checking hardware video decoding…';

/** Labels for the two separate Phone entries. */
export const PHONE_EXTERNAL_ID = 'phone-external';
export const PHONE_EXTERNAL_LABEL = 'Phone — External';
export const PHONE_INTERNAL_ID = 'phone-internal';
export const PHONE_INTERNAL_LABEL = 'Android — Installed';

/** VideoDecoder config for the spike's H.264 stream. */
export const H264_CODEC = 'avc1.42E01E';

// ---------------------------------------------------------------------------
// GPU gate
// ---------------------------------------------------------------------------

/** Shape of one entry of Electron's `app.getGPUFeatureStatus()`. */
export type GpuFeatureStatusMap = Record<string, string | undefined>;

/** One GPU from `app.getGPUInfo('complete')`. */
export interface GpuDeviceInfo {
  deviceName?: string;
  vendorId?: number;
  deviceId?: number;
  driverVersion?: string;
}

export interface GpuGateStatus {
  /** False until main (or the renderer fallback) has really checked. */
  checked: boolean;
  /** True only when hardware video decode is really available. */
  hardwareDecode: boolean;
  /** Raw `video_decode` feature status, e.g. 'enabled' / 'software'. */
  videoDecodeStatus: string;
  /** First GPU device name, when the platform reports one. */
  deviceName: string | null;
  /** Non-null when the gate is closed: the hover reason. */
  reason: string | null;
}

const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'software', 'basic render'];

/** A GPU device name that means "no real GPU" (software rasterizer). */
export function isSoftwareRenderer(deviceName: string | undefined | null): boolean {
  if (!deviceName) return false;
  const name = deviceName.toLowerCase();
  return SOFTWARE_RENDERERS.some((marker) => name.includes(marker));
}

/**
 * Decide the gate from the REAL capability, not a flag:
 * `video_decode` from `app.getGPUFeatureStatus()` must read as
 * hardware-enabled, and no reported GPU may be a software renderer.
 * A missing/unknown `video_decode` status closes the gate — the
 * spike never assumes hardware decode.
 */
export function evaluateGpuGate(
  featureStatus: GpuFeatureStatusMap | null | undefined,
  devices: readonly GpuDeviceInfo[] | null | undefined,
): GpuGateStatus {
  const videoDecodeStatus = featureStatus?.video_decode ?? 'unknown';
  const deviceName = devices?.[0]?.deviceName ?? null;
  const hardwareFlag =
    videoDecodeStatus === 'enabled' ||
    videoDecodeStatus.startsWith('enabled');
  const softwareOnly =
    !hardwareFlag || (devices ?? []).some((d) => isSoftwareRenderer(d.deviceName));

  if (!featureStatus) {
    return {
      checked: true,
      hardwareDecode: false,
      videoDecodeStatus,
      deviceName,
      reason: GPU_GATE_DISABLED_REASON,
    };
  }
  if (softwareOnly) {
    return {
      checked: true,
      hardwareDecode: false,
      videoDecodeStatus,
      deviceName,
      reason: GPU_GATE_DISABLED_REASON,
    };
  }
  return {
    checked: true,
    hardwareDecode: true,
    videoDecodeStatus,
    deviceName,
    reason: null,
  };
}

/** Gate state before any check has run (button shows "checking"). */
export function uncheckedGpuGate(): GpuGateStatus {
  return {
    checked: false,
    hardwareDecode: false,
    videoDecodeStatus: 'unknown',
    deviceName: null,
    reason: GPU_GATE_CHECKING_REASON,
  };
}

/** Renderer-side fallback: what `mediaCapabilities.decodingInfo()`
 *  says about H.264. `powerEfficient` is the browser's own signal
 *  that the decode runs on dedicated hardware. */
export interface MediaCapabilitiesResult {
  supported: boolean;
  powerEfficient: boolean;
  smooth: boolean;
}

export type DecodePath = 'hardware' | 'software' | 'unknown';

/** The decode path the spike reports — never assumed, always measured. */
export function decodePathFromMediaCapabilities(
  result: MediaCapabilitiesResult | null | undefined,
): DecodePath {
  if (!result || !result.supported) return 'unknown';
  return result.powerEfficient ? 'hardware' : 'software';
}

// ---------------------------------------------------------------------------
// Two-entry Phone button
// ---------------------------------------------------------------------------

export type PhoneEntryKind = 'external' | 'internal';

export interface PhoneEntry {
  id: string;
  label: string;
  kind: PhoneEntryKind;
  /** Browser URL for the external entry; undefined for the in-app one. */
  url?: string;
  disabled: boolean;
  /** Hover reason when disabled; null when enabled. */
  disabledReason: string | null;
}

export interface PhoneEntriesInput {
  /** True only when the Android add-on is installed. */
  androidAddonInstalled: boolean;
  gpuGate: GpuGateStatus;
}

/**
 * The Phone button's entries. The external entry is always there and
 * is never gated. The internal entry exists ONLY when the Android
 * add-on is installed, and is greyed out with the hover reason when
 * the GPU gate is closed. The two are never conflated.
 */
export function getPhoneEntries(input: PhoneEntriesInput): PhoneEntry[] {
  const entries: PhoneEntry[] = [
    {
      id: PHONE_EXTERNAL_ID,
      label: PHONE_EXTERNAL_LABEL,
      kind: 'external',
      disabled: false,
      disabledReason: null,
    },
  ];
  if (input.androidAddonInstalled) {
    const gateOpen = input.gpuGate.checked && input.gpuGate.hardwareDecode;
    entries.push({
      id: PHONE_INTERNAL_ID,
      label: PHONE_INTERNAL_LABEL,
      kind: 'internal',
      disabled: !gateOpen,
      disabledReason: gateOpen
        ? null
        : (input.gpuGate.reason ?? GPU_GATE_DISABLED_REASON),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export interface CapacityState {
  internalLoaded: number;
  externalConnected: number;
}

export interface CapacityCheck {
  allowed: boolean;
  reason: string | null;
}

export function canLoadInternal(state: CapacityState): CapacityCheck {
  if (state.internalLoaded >= MAX_INTERNAL_DEVICES) {
    return {
      allowed: false,
      reason: `Only one internal Android instance can be loaded at a time (${state.internalLoaded}/${MAX_INTERNAL_DEVICES} loaded)`,
    };
  }
  if (state.internalLoaded + state.externalConnected >= MAX_TOTAL_DEVICES) {
    return { allowed: false, reason: `Device limit reached (${MAX_TOTAL_DEVICES} total)` };
  }
  return { allowed: true, reason: null };
}

export function canConnectExternal(state: CapacityState): CapacityCheck {
  if (state.externalConnected >= MAX_EXTERNAL_DEVICES) {
    return {
      allowed: false,
      reason: `External connection limit reached (${state.externalConnected}/${MAX_EXTERNAL_DEVICES} connected)`,
    };
  }
  if (state.internalLoaded + state.externalConnected >= MAX_TOTAL_DEVICES) {
    return { allowed: false, reason: `Device limit reached (${MAX_TOTAL_DEVICES} total)` };
  }
  return { allowed: true, reason: null };
}

/** e.g. "1 internal loaded, 3/99 external connected". */
export function capacitySummary(state: CapacityState): string {
  return `${state.internalLoaded} internal loaded, ${state.externalConnected}/${MAX_EXTERNAL_DEVICES} external connected`;
}

// ---------------------------------------------------------------------------
// STALE badge
// ---------------------------------------------------------------------------

/** True when the frame is too old to present as live. */
export function isFrameStale(
  frameAgeMs: number,
  thresholdMs: number = STALE_FRAME_MS,
): boolean {
  return frameAgeMs >= thresholdMs;
}

/** Short label for the badge: "LIVE" or "STALE 2.3s". */
export function frameAgeLabel(frameAgeMs: number): string {
  if (!isFrameStale(frameAgeMs)) return 'LIVE';
  return `STALE ${(frameAgeMs / 1000).toFixed(1)}s`;
}

export interface StaleBadge {
  stale: boolean;
  label: string;
  ageMs: number;
}

export function staleBadge(frameAgeMs: number): StaleBadge {
  return { stale: isFrameStale(frameAgeMs), label: frameAgeLabel(frameAgeMs), ageMs: frameAgeMs };
}

// ---------------------------------------------------------------------------
// scrcpy server launch
// ---------------------------------------------------------------------------

export interface ScrcpyServerOptions {
  /** Long edge cap in pixels (720 keeps the emulator at 2–5 Mbps). */
  maxSize?: number;
  maxFps?: number;
  /** Bits per second; the spike uses 2 Mbps. */
  videoBitRate?: number;
  videoCodec?: 'h264' | 'h265' | 'av1';
  /** Random 31-bit client id, so two Lucid runs do not collide. */
  scid?: number;
}

/**
 * Server launch arguments as `key=value` pairs, per develop.md —
 * NOT `--flag` form. `raw_stream=true` disables every header, so
 * the video socket is pure Annex B H.264. `audio=false`: video
 * only for this spike. The caller prefixes these with the version
 * (`2.4`) in the `app_process` command.
 */
export function buildScrcpyServerArgs(options: ScrcpyServerOptions = {}): string[] {
  const {
    maxSize = 720,
    maxFps = STREAM_TARGET_FPS,
    videoBitRate = 2_000_000,
    videoCodec = 'h264',
    scid = Math.floor(Math.random() * 0x7fffffff),
  } = options;
  return [
    `scid=${scid}`,
    'log_level=info',
    'audio=false',
    'control=true',
    'tunnel_forward=false',
    'raw_stream=true',
    `video_codec=${videoCodec}`,
    `video_bit_rate=${videoBitRate}`,
    `max_size=${maxSize}`,
    `max_fps=${maxFps}`,
  ];
}

/** The `adb shell` command that starts the server on the device. */
export function buildScrcpyServerCommand(args: string[]): string {
  return (
    `CLASSPATH=${SCRCPY_SERVER_DEVICE_PATH} app_process / ` +
    `${SCRCPY_SERVER_CLASS} ${SCRCPY_SERVER_VERSION} ${args.join(' ')}`
  );
}

// ---------------------------------------------------------------------------
// Annex B H.264 (the raw stream, no per-packet headers)
// ---------------------------------------------------------------------------

const START_CODE_3 = [0, 0, 1];
const START_CODE_4 = [0, 0, 0, 1];

/** Split a raw Annex B byte stream into NAL units (start codes stripped). */
export function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = [];
  let start = -1;
  let i = 0;
  const findStartCode = (from: number): { index: number; length: number } | null => {
    for (let j = from; j + 2 < data.length; j += 1) {
      if (data[j] === 0 && data[j + 1] === 0) {
        if (data[j + 2] === 1) return { index: j, length: 3 };
        if (j + 3 < data.length && data[j + 2] === 0 && data[j + 3] === 1) {
          return { index: j, length: 4 };
        }
      }
    }
    return null;
  };
  // Keep the constants referenced so the two start-code forms stay explicit.
  void START_CODE_3;
  void START_CODE_4;
  while (true) {
    const found = findStartCode(i);
    if (!found) break;
    if (start !== -1) {
      const unit = data.slice(start, found.index);
      if (unit.length > 0) units.push(unit);
    }
    start = found.index + found.length;
    i = start;
  }
  if (start !== -1 && start < data.length) {
    const unit = data.slice(start);
    if (unit.length > 0) units.push(unit);
  }
  return units;
}

/** H.264 NAL unit type (low 5 bits of the first byte). */
export function nalUnitType(nal: Uint8Array): number {
  return nal.length > 0 ? nal[0] & 0x1f : -1;
}

export function isSpsNal(nal: Uint8Array): boolean {
  return nalUnitType(nal) === 7;
}

export function isPpsNal(nal: Uint8Array): boolean {
  return nalUnitType(nal) === 8;
}

export function isKeyFrameNal(nal: Uint8Array): boolean {
  return nalUnitType(nal) === 5;
}

/** First SPS/PPS in the units, when present (in-band with raw_stream). */
export function extractSpsPps(units: readonly Uint8Array[]): {
  sps?: Uint8Array;
  pps?: Uint8Array;
} {
  return {
    sps: units.find(isSpsNal),
    pps: units.find(isPpsNal),
  };
}

/**
 * Group NAL units (start codes stripped) into access units — one
 * AU is one frame for VideoDecoder. A new AU starts at the first
 * NAL after a slice: SPS/PPS/IDR open a key frame, a lone slice is
 * its own frame, and two slices in a row are two frames (TCP may
 * coalesce two encoder outputs into one chunk).
 */
export function groupAccessUnits(units: readonly Uint8Array[]): Uint8Array[][] {
  const aus: Uint8Array[][] = [];
  let current: Uint8Array[] = [];
  const hasSlice = (au: readonly Uint8Array[]): boolean =>
    au.some((nal) => nalUnitType(nal) === 1 || nalUnitType(nal) === 5);
  for (const unit of units) {
    if (current.length > 0 && hasSlice(current)) {
      aus.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length > 0) aus.push(current);
  return aus;
}

/** Re-attach 4-byte start codes so an AU is a valid Annex B chunk. */
export function encodeAccessUnit(nals: readonly Uint8Array[]): Uint8Array {
  const total = nals.reduce((sum, nal) => sum + 4 + nal.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const nal of nals) {
    out.set([0, 0, 0, 1], offset);
    offset += 4;
    out.set(nal, offset);
    offset += nal.length;
  }
  return out;
}

/** True when the AU holds an IDR frame (a key frame for the decoder). */
export function accessUnitIsKey(au: Uint8Array): boolean {
  return splitAnnexB(au).some(isKeyFrameNal);
}

/** VideoDecoder config for the spike's stream. `prefer-hardware`
 *  asks for the hardware path; the reported decode path (see
 *  `decodePathFromMediaCapabilities`) is what proves it engaged —
 *  a silent software fallback is a bug, not a fallback. */
export function buildVideoDecoderConfig(): {
  codec: string;
  hardwareAcceleration: 'prefer-hardware';
} {
  return { codec: H264_CODEC, hardwareAcceleration: 'prefer-hardware' };
}

// ---------------------------------------------------------------------------
// Control messages (client -> device, big-endian)
// ---------------------------------------------------------------------------

export const CONTROL_MSG_INJECT_TOUCH_EVENT = 2;
export const TOUCH_ACTION_DOWN = 0;
export const TOUCH_ACTION_UP = 1;
export const TOUCH_ACTION_MOVE = 2;

export interface TouchMessage {
  action: number;
  pointerId: bigint;
  x: number;
  y: number;
  /** Video width/height at the time of the event. */
  width: number;
  height: number;
  /** 0.0–1.0; 1.0 for a firm tap. */
  pressure: number;
  actionButton: number;
  buttons: number;
}

/**
 * Encode a 32-byte INJECT_TOUCH_EVENT message:
 * type(1) action(1) pointerId(8) x(4) y(4) width(2) height(2)
 * pressure(2, u16 fixed-point) actionButton(4) buttons(4).
 */
export function encodeTouchMessage(msg: TouchMessage): Uint8Array {
  const buf = new ArrayBuffer(32);
  const view = new DataView(buf);
  view.setUint8(0, CONTROL_MSG_INJECT_TOUCH_EVENT);
  view.setUint8(1, msg.action);
  view.setBigUint64(2, msg.pointerId, false);
  view.setInt32(10, msg.x, false);
  view.setInt32(14, msg.y, false);
  view.setUint16(18, msg.width, false);
  view.setUint16(20, msg.height, false);
  const pressure = Math.max(0, Math.min(1, msg.pressure));
  view.setUint16(22, Math.round(pressure * 0xffff), false);
  view.setInt32(24, msg.actionButton, false);
  view.setInt32(28, msg.buttons, false);
  return new Uint8Array(buf);
}

/** Decode a 32-byte touch message (round-trip check + debugging). */
export function decodeTouchMessage(data: Uint8Array): TouchMessage {
  if (data.length < 32 || data[0] !== CONTROL_MSG_INJECT_TOUCH_EVENT) {
    throw new Error('Not a 32-byte INJECT_TOUCH_EVENT message');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    action: view.getUint8(1),
    pointerId: view.getBigUint64(2, false),
    x: view.getInt32(10, false),
    y: view.getInt32(14, false),
    width: view.getUint16(18, false),
    height: view.getUint16(20, false),
    pressure: view.getUint16(22, false) / 0xffff,
    actionButton: view.getInt32(24, false),
    buttons: view.getInt32(28, false),
  };
}

// ---------------------------------------------------------------------------
// Metrics (instrumentation — the spike measures, it does not assume)
// ---------------------------------------------------------------------------

export interface StreamMetricsSnapshot {
  /** Frames decoded (renderer) since the stream started. */
  frames: number;
  /** Frames per second over the recent window. */
  fps: number;
  /** Median time between frames, ms. */
  medianFrameIntervalMs: number | null;
  /** Median tap send time, ms (control socket write). */
  medianTapMs: number | null;
  /** Taps sent. */
  taps: number;
  /** Age of the newest frame, ms (null before the first frame). */
  lastFrameAgeMs: number | null;
  /** 'hardware' | 'software' | 'unknown' — reported, never assumed. */
  decodePath: DecodePath;
  /** Bytes of video received since the stream started. */
  bytesReceived: number;
  /** Reconnect attempts since the stream started. */
  reconnects: number;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sliding-window metrics for one stream. Pure; the clock is injected. */
export class StreamingMetrics {
  private frameTimes: number[] = [];
  private tapTimes: number[] = [];
  private frames = 0;
  private taps = 0;
  private bytesReceived = 0;
  private reconnects = 0;
  private lastFrameAtMs: number | null = null;
  private decodePath: DecodePath = 'unknown';

  recordFrame(nowMs: number, bytes: number): void {
    this.frames += 1;
    this.bytesReceived += bytes;
    this.frameTimes.push(nowMs);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.lastFrameAtMs = nowMs;
  }

  recordTap(latencyMs: number): void {
    this.taps += 1;
    this.tapTimes.push(latencyMs);
    if (this.tapTimes.length > 120) this.tapTimes.shift();
  }

  recordReconnect(): void {
    this.reconnects += 1;
  }

  reportDecodePath(path: DecodePath): void {
    this.decodePath = path;
  }

  snapshot(nowMs: number): StreamMetricsSnapshot {
    const intervals: number[] = [];
    for (let i = 1; i < this.frameTimes.length; i += 1) {
      intervals.push(this.frameTimes[i] - this.frameTimes[i - 1]);
    }
    const windowMs =
      this.frameTimes.length >= 2
        ? this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]
        : 0;
    const fps =
      windowMs > 0 && this.frameTimes.length >= 2
        ? ((this.frameTimes.length - 1) / windowMs) * 1000
        : 0;
    return {
      frames: this.frames,
      fps: Math.round(fps * 10) / 10,
      medianFrameIntervalMs: median(intervals),
      medianTapMs: median(this.tapTimes),
      taps: this.taps,
      lastFrameAgeMs: this.lastFrameAtMs === null ? null : nowMs - this.lastFrameAtMs,
      decodePath: this.decodePath,
      bytesReceived: this.bytesReceived,
      reconnects: this.reconnects,
    };
  }
}
