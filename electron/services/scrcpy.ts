/**
 * scrcpy session manager (Electron main process) — Phase 0 spike.
 *
 * Main owns the adb lifecycle: one adb server, one scrcpy-server
 * process per connected device, persistent sockets (no per-frame or
 * per-tap process spawns — the old pipeline forked adb per capture
 * and per tap, which is exactly what made it slow). The renderer
 * only ever sees NAL units over IPC and sends touch messages back.
 *
 * Transport (per scrcpy develop.md, pinned server 2.4):
 * - jar pushed once to /data/local/tmp/scrcpy-server.jar;
 * - `adb reverse localabstract:scrcpy tcp:<port>` — the device
 *   connects back to Lucid (no forward race, no open port on the
 *   device side);
 * - server started with `key=value` args incl. `raw_stream=true`,
 *   so the video socket is pure Annex B H.264 — no packet headers
 *   to parse, frames split on start codes;
 * - control socket carries 32-byte touch messages (see
 *   src/phone/streaming.ts).
 *
 * The jar is NOT bundled yet (Gary has not answered whether it
 * ships inside Lucid or downloads on first use): start() fails
 * loudly naming the expected path instead of pretending to stream.
 * No relay, no remote transport — local emulator/USB only.
 *
 * `ScrcpyDeps` exists so tests can drive the whole lifecycle with
 * fake adb / fake sockets instead of a real device.
 */

import { spawn, execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
  buildScrcpyServerArgs,
  buildScrcpyServerCommand,
  canConnectExternal,
  canLoadInternal,
  capacitySummary,
  encodeAccessUnit,
  encodeTouchMessage,
  groupAccessUnits,
  nalUnitType,
  splitAnnexB,
  StreamingMetrics,
  MAX_EXTERNAL_DEVICES,
  MAX_INTERNAL_DEVICES,
  MAX_TOTAL_DEVICES,
  SCRCPY_SERVER_DEVICE_PATH,
  SCRCPY_SERVER_JAR_RELATIVE,
  type CapacityState,
  type StreamMetricsSnapshot,
  type TouchMessage,
} from '../../src/phone/streaming';

export { MAX_EXTERNAL_DEVICES, MAX_INTERNAL_DEVICES, MAX_TOTAL_DEVICES };

export type DeviceKind = 'internal' | 'external';
export type SessionState =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'reconnecting'
  | 'stopped'
  | 'error';

export interface AdbDevice {
  serial: string;
  state: string;
}

export interface AdbResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ScrcpyDeps {
  exists: (p: string) => boolean;
  runAdb: (args: string[]) => Promise<AdbResult>;
  spawnAdb: (args: string[]) => {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    kill: () => void;
  };
  createServer: (
    onConnection: (socket: net.Socket) => void,
  ) => net.Server;
  now: () => number;
}

const ADB_CANDIDATES: readonly string[] = [
  path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
  '/opt/android-sdk/platform-tools/adb',
  '/usr/local/bin/adb',
  '/opt/homebrew/bin/adb',
];

/**
 * Resolve adb the way pythonPath.ts resolves python3: well-known
 * SDK locations first (Finder-launched apps get no PATH), then the
 * user's PATH. Returns null when nothing exists — callers fail
 * loudly instead of spawning a bare `adb` that cannot resolve.
 */
export function resolveAdbPath(
  candidates: readonly string[] = ADB_CANDIDATES,
  pathEnv: string | undefined = process.env.PATH,
  sdkRoots: readonly (string | undefined)[] = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
  ],
): string | null {
  for (const root of sdkRoots) {
    if (!root) continue;
    const candidate = path.join(root, 'platform-tools', 'adb');
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // A broken candidate is the same as a missing one.
    }
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // As above.
    }
  }
  if (pathEnv) {
    try {
      const which = process.platform === 'win32' ? 'where' : '/usr/bin/which';
      const found = execFileSync(which, ['adb'], { encoding: 'utf-8' })
        .trim()
        .split('\n')[0]
        ?.trim();
      if (found && fs.existsSync(found)) return found;
    } catch {
      // Fall through to null.
    }
  }
  return null;
}

/** Default deps: the real child_process / net / fs. */
export function defaultScrcpyDeps(adbPath: string): ScrcpyDeps {
  return {
    exists: (p) => fs.existsSync(p),
    runAdb: (args) =>
      new Promise<AdbResult>((resolve) => {
        execFile(adbPath, args, (error, stdout, stderr) => {
          resolve({
            code: error ? (error as { code?: number }).code ?? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
          });
        });
      }),
    spawnAdb: (args) => spawn(adbPath, args, { stdio: 'ignore' }),
    createServer: (onConnection) => net.createServer(onConnection),
    now: () => Date.now(),
  };
}

/** `adb devices` output -> [{ serial, state }]. */
export function parseAdbDevices(stdout: string): AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('List of devices')) continue;
    const [serial, state] = trimmed.split(/\s+/);
    if (serial && state) devices.push({ serial, state });
  }
  return devices;
}

/** Where Lucid looks for the jar in the packaged / dev app. */
export function scrcpyJarPath(appRoot: string): string {
  return path.join(appRoot, SCRCPY_SERVER_JAR_RELATIVE);
}

/** True when the AU holds a slice NAL (a decodable frame). */
function hasSliceNal(au: readonly Uint8Array[]): boolean {
  return au.some((nal) => nalUnitType(nal) === 1 || nalUnitType(nal) === 5);
}

export interface SessionCallbacks {
  /** Raw Annex B chunk from the video socket (main forwards to IPC). */
  onVideoChunk: (serial: string, chunk: Uint8Array) => void;
  onState: (serial: string, state: SessionState, error?: string) => void;
}

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000];
const VIDEO_SOCKET_TIMEOUT_MS = 10_000;

/**
 * One scrcpy session for one device: jar push, reverse tunnel,
 * server spawn, video + control sockets, reconnect with backoff.
 * The session holds persistent sockets — never a spawn per frame
 * or per tap.
 */
export class ScrcpySession {
  readonly serial: string;
  readonly kind: DeviceKind;
  state: SessionState = 'idle';
  error: string | null = null;
  readonly metrics = new StreamingMetrics();

  private deps: ScrcpyDeps;
  private adbPath: string;
  private jarPath: string;
  private callbacks: SessionCallbacks;
  private server: net.Server | null = null;
  private videoSocket: net.Socket | null = null;
  private controlSocket: net.Socket | null = null;
  private serverProcess: { kill: () => void } | null = null;
  private wanted = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVideo = new Uint8Array(0);
  private pendingNals: Uint8Array[] = [];
  private port = 0;

  constructor(
    serial: string,
    kind: DeviceKind,
    opts: { adbPath: string; jarPath: string },
    deps: ScrcpyDeps,
    callbacks: SessionCallbacks,
  ) {
    this.serial = serial;
    this.kind = kind;
    this.adbPath = opts.adbPath;
    this.jarPath = opts.jarPath;
    this.deps = deps;
    this.callbacks = callbacks;
  }

  private setState(state: SessionState, error?: string): void {
    this.state = state;
    this.error = error ?? null;
    this.callbacks.onState(this.serial, state, error);
  }

  /** Start (or restart) the session. Fails loudly, never silently. */
  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.wanted && this.state === 'streaming') return { ok: true };
    this.wanted = true;
    this.setState('starting');
    if (!this.deps.exists(this.jarPath)) {
      const error =
        `scrcpy-server jar not found at ${this.jarPath} — ` +
        'the spike does not bundle the jar yet; place the pinned ' +
        '2.4 scrcpy-server.jar there (Genymobile/scrcpy, Apache-2.0).';
      this.setState('error', error);
      return { ok: false, error };
    }
    try {
      const pushed = await this.deps.runAdb([
        '-s', this.serial, 'push', this.jarPath, SCRCPY_SERVER_DEVICE_PATH,
      ]);
      if (pushed.code !== 0) {
        const error = `adb push of scrcpy-server failed: ${pushed.stderr.trim() || `exit ${pushed.code}`}`;
        this.setState('error', error);
        return { ok: false, error };
      }
      const server = this.deps.createServer((socket) => this.onSocket(socket));
      this.server = server;
      const port = await new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : 0);
        });
      });
      this.port = port;
      const reversed = await this.deps.runAdb([
        '-s', this.serial, 'reverse', 'localabstract:scrcpy', `tcp:${port}`,
      ]);
      if (reversed.code !== 0) {
        const error = `adb reverse failed: ${reversed.stderr.trim() || `exit ${reversed.code}`}`;
        this.setState('error', error);
        return { ok: false, error };
      }
      const command = buildScrcpyServerCommand(buildScrcpyServerArgs());
      const proc = this.deps.spawnAdb(['-s', this.serial, 'shell', command]);
      this.serverProcess = proc;
      proc.on('error', (err) => {
        if (this.wanted) this.scheduleReconnect(String(err));
      });
      const connected = await this.waitForVideoSocket();
      if (!connected) {
        const error = 'scrcpy server did not connect its video socket within 10 s (device gone, or jar/version mismatch)';
        this.setState('error', error);
        return { ok: false, error };
      }
      this.reconnectAttempt = 0;
      this.setState('streaming');
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.setState('error', error);
      return { ok: false, error };
    }
  }

  private waitForVideoSocket(): Promise<boolean> {
    if (this.videoSocket) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), VIDEO_SOCKET_TIMEOUT_MS);
      const check = setInterval(() => {
        if (this.videoSocket) {
          clearTimeout(timer);
          clearInterval(check);
          resolve(true);
        }
      }, 50);
      // If the timer fires first, the interval keeps the process
      // alive no longer than the timeout itself.
      setTimeout(() => clearInterval(check), VIDEO_SOCKET_TIMEOUT_MS + 100);
    });
  }

  private onSocket(socket: net.Socket): void {
    if (!this.videoSocket) {
      this.videoSocket = socket;
      socket.on('data', (chunk: Buffer) => this.onVideoData(new Uint8Array(chunk)));
      socket.on('close', () => this.onVideoSocketClosed());
      socket.on('error', () => this.onVideoSocketClosed());
      return;
    }
    if (!this.controlSocket) {
      this.controlSocket = socket;
      socket.on('close', () => {
        this.controlSocket = null;
      });
      socket.on('error', () => {
        this.controlSocket = null;
      });
    }
  }

  /** Split the raw Annex B stream into complete access units; the
   *  trailing partial NAL stays buffered until its end arrives, and
   *  a slice-less AU (SPS/PPS waiting for its IDR) is held until
   *  the slice lands — only whole frames go to the decoder, with
   *  start codes re-attached. */
  private onVideoData(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.pendingVideo.length + chunk.length);
    merged.set(this.pendingVideo, 0);
    merged.set(chunk, this.pendingVideo.length);
    const units = splitAnnexB(merged);
    if (units.length === 0) {
      this.pendingVideo = merged;
      return;
    }
    // The last unit may still be growing — hold it back.
    const complete = units.slice(0, -1);
    const last = units[units.length - 1];
    const pending = new Uint8Array(4 + last.length);
    pending.set([0, 0, 0, 1], 0);
    pending.set(last, 4);
    this.pendingVideo = pending;
    const allNals = [...this.pendingNals, ...complete];
    const aus = groupAccessUnits(allNals);
    this.pendingNals = [];
    // Hold a trailing slice-less AU: its IDR has not arrived yet.
    const lastAu = aus[aus.length - 1];
    const emit = lastAu && !hasSliceNal(lastAu) ? aus.slice(0, -1) : aus;
    if (lastAu && !hasSliceNal(lastAu)) this.pendingNals = lastAu;
    for (const au of emit) {
      const bytes = encodeAccessUnit(au);
      this.metrics.recordFrame(this.deps.now(), bytes.length);
      this.callbacks.onVideoChunk(this.serial, bytes);
    }
  }

  private onVideoSocketClosed(): void {
    this.videoSocket = null;
    if (this.wanted && this.state === 'streaming') {
      this.scheduleReconnect('video socket closed (device gone or server died)');
    }
  }

  private scheduleReconnect(reason: string): void {
    if (!this.wanted) return;
    this.metrics.recordReconnect();
    this.setState('reconnecting', reason);
    const delay =
      RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.wanted) return;
      void this.start();
    }, delay);
  }

  /**
   * Send a touch message over the control socket. Returns the
   * socket-write latency (send-side only — visual feedback is
   * measured separately from frame arrivals after the tap).
   */
  async sendTouch(msg: TouchMessage): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (!this.controlSocket) {
      return { ok: false, error: 'control socket not connected — stream first' };
    }
    const bytes = encodeTouchMessage(msg);
    const started = this.deps.now();
    return new Promise((resolve) => {
      this.controlSocket!.write(Buffer.from(bytes), (err) => {
        if (err) {
          resolve({ ok: false, error: `control write failed: ${err.message}` });
          return;
        }
        const latencyMs = this.deps.now() - started;
        this.metrics.recordTap(latencyMs);
        resolve({ ok: true, latencyMs });
      });
    });
  }

  snapshot(nowMs: number): StreamMetricsSnapshot {
    return this.metrics.snapshot(nowMs);
  }

  /** Stop for good: kill the server, close sockets, drop the tunnel. */
  async stop(): Promise<void> {
    this.wanted = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.serverProcess?.kill();
    } catch {
      // Already gone — stopping is the goal either way.
    }
    this.serverProcess = null;
    try {
      this.videoSocket?.destroy();
    } catch {
      // As above.
    }
    try {
      this.controlSocket?.destroy();
    } catch {
      // As above.
    }
    this.videoSocket = null;
    this.controlSocket = null;
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }
    await this.deps
      .runAdb(['-s', this.serial, 'reverse', '--remove', 'localabstract:scrcpy'])
      .catch(() => undefined);
    this.setState('stopped');
  }
}

// ---------------------------------------------------------------------------
// Registry: 1 internal, 99 external, 100 total — enforced here, not in UI.
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  serial: string;
  kind: DeviceKind;
  session: ScrcpySession;
}

export class PhoneRegistry {
  private entries = new Map<string, ScrcpySession>();

  counts(): CapacityState {
    let internalLoaded = 0;
    let externalConnected = 0;
    this.entries.forEach((session) => {
      if (session.kind === 'internal') internalLoaded += 1;
      else externalConnected += 1;
    });
    return { internalLoaded, externalConnected };
  }

  summary(): string {
    return capacitySummary(this.counts());
  }

  has(serial: string): boolean {
    return this.entries.has(serial);
  }

  get(serial: string): ScrcpySession | undefined {
    return this.entries.get(serial);
  }

  list(): { serial: string; kind: DeviceKind; state: SessionState }[] {
    const out: { serial: string; kind: DeviceKind; state: SessionState }[] = [];
    this.entries.forEach((s) => {
      out.push({ serial: s.serial, kind: s.kind, state: s.state });
    });
    return out;
  }

  /** Load the single internal instance. Refuses the second one. */
  loadInternal(
    serial: string,
    makeSession: (serial: string) => ScrcpySession,
  ): { ok: boolean; session?: ScrcpySession; reason?: string } {
    const existing = this.entries.get(serial);
    if (existing) return { ok: true, session: existing };
    const check = canLoadInternal(this.counts());
    if (!check.allowed) return { ok: false, reason: check.reason ?? 'internal cap reached' };
    const session = makeSession(serial);
    this.entries.set(serial, session);
    return { ok: true, session };
  }

  /** Connect an external device. Refuses past 99. */
  connectExternal(
    serial: string,
    makeSession: (serial: string) => ScrcpySession,
  ): { ok: boolean; session?: ScrcpySession; reason?: string } {
    const existing = this.entries.get(serial);
    if (existing) return { ok: true, session: existing };
    const check = canConnectExternal(this.counts());
    if (!check.allowed) return { ok: false, reason: check.reason ?? 'external cap reached' };
    const session = makeSession(serial);
    this.entries.set(serial, session);
    return { ok: true, session };
  }

  async disconnect(serial: string): Promise<boolean> {
    const session = this.entries.get(serial);
    if (!session) return false;
    await session.stop();
    this.entries.delete(serial);
    return true;
  }
}
