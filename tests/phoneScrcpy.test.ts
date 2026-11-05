/**
 * scrcpy session + registry tests (fake adb, fake sockets — no device).
 *
 * Expected behaviour:
 * - adb resolution returns null when nothing exists (fails loudly).
 * - `adb devices` output parses to serial/state pairs.
 * - Registry enforces 1 internal / 99 external in code, not just UI.
 * - Session start without the jar fails loudly naming the jar path.
 * - Happy path: push + reverse + spawn, video socket feeds Annex B,
 *   only whole frames (access units) reach the callback, the
 *   control socket carries 32-byte touch messages.
 * - A dropped video socket moves the session to `reconnecting`
 *   and counts the reconnect.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type * as net from 'net';
import {
  PhoneRegistry,
  ScrcpySession,
  parseAdbDevices,
  resolveAdbPath,
  type AdbResult,
  type ScrcpyDeps,
  type SessionState,
} from '../electron/services/scrcpy';
import {
  decodeTouchMessage,
  nalUnitType,
  splitAnnexB,
} from '../src/phone/streaming';

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
  return Buffer.from(out);
};
const nal = (type: number, ...rest: number[]) =>
  new Uint8Array([(0x60 | type) & 0xff, ...rest]);

class FakeSocket extends EventEmitter {
  written: Buffer[] = [];
  destroyed = false;
  write(data: Buffer, cb?: (err?: Error) => void): boolean {
    this.written.push(Buffer.from(data));
    cb?.();
    return true;
  }
  destroy(): this {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}

class FakeServer extends EventEmitter {
  listen(_port: number, _host: string, cb: () => void): this {
    cb();
    return this;
  }
  address(): { port: number } {
    return { port: 27183 };
  }
  close(cb?: () => void): this {
    cb?.();
    return this;
  }
}

interface FakeWorld {
  adbCalls: string[][];
  proc: EventEmitter & { kill: ReturnType<typeof vi.fn> };
  connectSocket: () => FakeSocket;
  deps: ScrcpyDeps;
}

function makeWorld(opts: { jarExists?: boolean } = {}): FakeWorld {
  const adbCalls: string[][] = [];
  const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
  proc.kill = vi.fn();
  let connectionHandler: ((socket: net.Socket) => void) | null = null;
  const deps: ScrcpyDeps = {
    exists: () => opts.jarExists ?? true,
    runAdb: async (args: string[]): Promise<AdbResult> => {
      adbCalls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    },
    spawnAdb: (args: string[]) => {
      adbCalls.push(['spawn', ...args]);
      return proc as unknown as ReturnType<ScrcpyDeps['spawnAdb']>;
    },
    createServer: (onConnection) => {
      connectionHandler = onConnection;
      return new FakeServer() as unknown as net.Server;
    },
    now: () => 1000,
  };
  return {
    adbCalls,
    proc,
    connectSocket: () => {
      const socket = new FakeSocket();
      connectionHandler?.(socket as unknown as net.Socket);
      return socket;
    },
    deps,
  };
}

function makeSession(world: FakeWorld, serial = 'emulator-5554') {
  const chunks: Uint8Array[] = [];
  const states: { state: SessionState; error?: string }[] = [];
  const session = new ScrcpySession(
    serial,
    'internal',
    { adbPath: '/fake/adb', jarPath: '/fake/scrcpy-server.jar' },
    world.deps,
    {
      onVideoChunk: (_id, chunk) => chunks.push(chunk),
      onState: (_id, state, error) => states.push({ state, error }),
    },
  );
  return { session, chunks, states };
}

describe('resolveAdbPath', () => {
  it('returns null when no candidate, SDK root, or PATH entry exists', () => {
    expect(resolveAdbPath([], '', [])).toBeNull();
  });
});

describe('parseAdbDevices', () => {
  it('parses serial + state lines, skipping the header', () => {
    const out = parseAdbDevices(
      'List of devices attached\nemulator-5554\tdevice\n192.168.1.2:5555\toffline\n\n',
    );
    expect(out).toEqual([
      { serial: 'emulator-5554', state: 'device' },
      { serial: '192.168.1.2:5555', state: 'offline' },
    ]);
  });

  it('returns an empty list when nothing is attached', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

describe('PhoneRegistry caps', () => {
  const factory = (world: FakeWorld) => (serial: string) =>
    new ScrcpySession(
      serial,
      'external',
      { adbPath: '/fake/adb', jarPath: '/fake/scrcpy-server.jar' },
      world.deps,
      { onVideoChunk: () => undefined, onState: () => undefined },
    );

  it('refuses a second internal instance', () => {
    const world = makeWorld();
    const registry = new PhoneRegistry();
    const first = registry.loadInternal(
      'emulator-5554',
      (id) => new ScrcpySession(id, 'internal', { adbPath: '/fake/adb', jarPath: '/fake/x.jar' }, world.deps, { onVideoChunk: () => undefined, onState: () => undefined }),
    );
    expect(first.ok).toBe(true);
    const second = registry.loadInternal(
      'emulator-5556',
      (id) => new ScrcpySession(id, 'internal', { adbPath: '/fake/adb', jarPath: '/fake/x.jar' }, world.deps, { onVideoChunk: () => undefined, onState: () => undefined }),
    );
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/one internal/i);
    expect(registry.summary()).toBe('1 internal loaded, 0/99 external connected');
  });

  it('refuses the 100th external connection', () => {
    const world = makeWorld();
    const registry = new PhoneRegistry();
    for (let i = 0; i < 99; i += 1) {
      const added = registry.connectExternal(`phone-${i}`, factory(world));
      expect(added.ok).toBe(true);
    }
    const hundredth = registry.connectExternal('phone-99', factory(world));
    expect(hundredth.ok).toBe(false);
    expect(hundredth.reason).toMatch(/99/);
    expect(registry.summary()).toBe('0 internal loaded, 99/99 external connected');
  });

  it('re-connecting the same serial returns the existing session', () => {
    const world = makeWorld();
    const registry = new PhoneRegistry();
    const first = registry.connectExternal('phone-1', factory(world));
    const second = registry.connectExternal('phone-1', factory(world));
    expect(second.ok).toBe(true);
    expect(second.session).toBe(first.session);
    expect(registry.counts().externalConnected).toBe(1);
  });
});

describe('ScrcpySession', () => {
  it('fails loudly without the jar, naming the path', async () => {
    const world = makeWorld({ jarExists: false });
    const { session, states } = makeSession(world);
    const result = await session.start();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/scrcpy-server\.jar/);
    expect(session.state).toBe('error');
    expect(states.at(-1)?.state).toBe('error');
    expect(world.adbCalls).toEqual([]);
  });

  it('starts: push + reverse + spawn, then streams whole frames', async () => {
    const world = makeWorld();
    const { session, chunks } = makeSession(world);
    const starting = session.start();
    // Let start() reach the video-socket wait, then connect it.
    await new Promise((r) => setTimeout(r, 0));
    const video = world.connectSocket();
    const result = await starting;
    expect(result.ok).toBe(true);
    expect(session.state).toBe('streaming');
    expect(world.adbCalls[0]).toEqual([
      '-s', 'emulator-5554', 'push', '/fake/scrcpy-server.jar', '/data/local/tmp/scrcpy-server.jar',
    ]);
    expect(world.adbCalls[1]).toEqual([
      '-s', 'emulator-5554', 'reverse', 'localabstract:scrcpy', 'tcp:27183',
    ]);
    expect(world.adbCalls[2][0]).toBe('spawn');

    // First chunk: SPS + PPS + IDR in one write. The IDR is the
    // last unit, so nothing is forwarded yet (it may still grow).
    video.emit('data', annexB(nal(7, 1), nal(8, 2), nal(5, 3)));
    expect(chunks).toHaveLength(0);
    // Second chunk: a P-frame slice. The key frame completes and
    // is forwarded as one access unit; the slice is held (last).
    video.emit('data', annexB(nal(1, 4)));
    expect(chunks).toHaveLength(1);
    const units = splitAnnexB(chunks[0]);
    expect(units.map(nalUnitType)).toEqual([7, 8, 5]);
    // Third chunk: another slice completes the held P-frame.
    video.emit('data', annexB(nal(1, 5)));
    expect(chunks).toHaveLength(2);
    expect(splitAnnexB(chunks[1]).map(nalUnitType)).toEqual([1]);
    expect(session.metrics.snapshot(1000).frames).toBe(2);

    await session.stop();
    expect(world.proc.kill).toHaveBeenCalled();
    expect(video.destroyed).toBe(true);
    expect(session.state).toBe('stopped');
  });

  it('sends a tap as one 32-byte control message and measures the write', async () => {
    const world = makeWorld();
    const { session } = makeSession(world);
    const starting = session.start();
    await new Promise((r) => setTimeout(r, 0));
    world.connectSocket(); // video
    await starting;
    const control = world.connectSocket(); // control
    const sent = await session.sendTouch({
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
    expect(sent.ok).toBe(true);
    expect(sent.latencyMs).toBe(0); // fake clock is fixed at 1000
    expect(control.written).toHaveLength(1);
    expect(control.written[0].length).toBe(32);
    const decoded = decodeTouchMessage(new Uint8Array(control.written[0]));
    expect(decoded.x).toBe(360);
    expect(decoded.y).toBe(640);
    await session.stop();
  });

  it('refuses a tap with no control socket instead of faking success', async () => {
    const world = makeWorld();
    const { session } = makeSession(world);
    const sent = await session.sendTouch({
      action: 0,
      pointerId: 1n,
      x: 0,
      y: 0,
      width: 720,
      height: 1280,
      pressure: 1,
      actionButton: 0,
      buttons: 1,
    });
    expect(sent.ok).toBe(false);
    expect(sent.error).toMatch(/control socket/);
    await session.stop();
  });

  it('a dropped video socket moves to reconnecting and counts it', async () => {
    const world = makeWorld();
    const { session } = makeSession(world);
    const starting = session.start();
    await new Promise((r) => setTimeout(r, 0));
    const video = world.connectSocket();
    await starting;
    expect(session.state).toBe('streaming');
    video.emit('close');
    expect(session.state).toBe('reconnecting');
    expect(session.metrics.snapshot(1000).reconnects).toBe(1);
    await session.stop();
  });
});
