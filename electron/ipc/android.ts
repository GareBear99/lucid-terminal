/**
 * Android / phone streaming IPC (Electron main process) — Phase 0 spike.
 *
 * Wiring only: the session lifecycle lives in
 * electron/services/scrcpy.ts and the pure rules (GPU gate,
 * capacity, wire format) in src/phone/streaming.ts.
 *
 * NOTE FOR THE COORDINATOR: main.ts does not import this yet.
 * Wire it with one line in app.whenReady, next to the browser
 * handlers:
 *   setupAndroidHandlers(ipcMain, () => mainWindow);
 *
 * Channels:
 *   android:getGpuGate      -> GpuGateStatus (real GPU check)
 *   android:listDevices     -> { devices, error? } (adb devices)
 *   android:getCapacity     -> { internalLoaded, externalConnected, summary }
 *   android:connectExternal -> { ok, reason? }  (external device, cap 99)
 *   android:loadInternal    -> { ok, reason? }  (internal add-on, cap 1)
 *   android:disconnect      -> boolean
 *   android:startStream     -> { ok, error? }
 *   android:stopStream      -> { ok, error? }
 *   android:touch           -> { ok, latencyMs?, error? }
 *   android:getMetrics      -> StreamMetricsSnapshot | null
 *   android:reportDecodePath-> void (renderer reports hardware/software)
 *
 * Pushed to the renderer:
 *   android:frame        (serial, Uint8Array Annex B chunk)
 *   android:device-state (serial, state, error?)
 *
 * The GPU gate is the real check: `app.getGPUFeatureStatus()` for
 * `video_decode` plus `app.getGPUInfo('complete')` for the device
 * names — never a hardcoded flag. The gate applies ONLY to the
 * in-app (internal) entry; the external entry never calls it.
 */

import { app, BrowserWindow, IpcMain } from 'electron';
import * as path from 'path';
import {
  PhoneRegistry,
  ScrcpySession,
  defaultScrcpyDeps,
  parseAdbDevices,
  resolveAdbPath,
  scrcpyJarPath,
} from '../services/scrcpy';
import {
  evaluateGpuGate,
  type DecodePath,
  type GpuDeviceInfo,
  type GpuFeatureStatusMap,
  type GpuGateStatus,
  type TouchMessage,
} from '../../src/phone/streaming';

interface AppLike {
  getGPUFeatureStatus: () => GpuFeatureStatusMap;
  getGPUInfo: (kind: string) => Promise<{ gpuDevice?: GpuDeviceInfo[] }>;
}

/**
 * The real GPU check. `video_decode` must read hardware-enabled
 * and no reported GPU may be a software renderer. Any failure to
 * read the status closes the gate — the spike never assumes
 * hardware decode, and a silent software fallback is a bug.
 */
export async function getGpuGateStatus(appLike: AppLike): Promise<GpuGateStatus> {
  let featureStatus: GpuFeatureStatusMap | null = null;
  let devices: GpuDeviceInfo[] | null = null;
  try {
    featureStatus = appLike.getGPUFeatureStatus();
  } catch {
    featureStatus = null;
  }
  try {
    const info = await appLike.getGPUInfo('complete');
    devices = info?.gpuDevice ?? null;
  } catch {
    devices = null;
  }
  return evaluateGpuGate(featureStatus, devices);
}

export interface AndroidHandlersOptions {
  /** Repo root in dev / app root packaged. Defaults to dist-electron/.. */
  appRoot?: string;
  /** Override adb resolution (tests). */
  adbPath?: string | null;
  /** Override the registry (tests). */
  registry?: PhoneRegistry;
}

export function setupAndroidHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  opts: AndroidHandlersOptions = {},
): PhoneRegistry {
  const registry = opts.registry ?? new PhoneRegistry();
  const appRoot = opts.appRoot ?? path.join(__dirname, '..');
  const adbPath = opts.adbPath !== undefined ? opts.adbPath : resolveAdbPath();
  const jarPath = scrcpyJarPath(appRoot);

  const sendToRenderer = (channel: string, ...args: unknown[]): void => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  const makeSession = (serial: string, kind: 'internal' | 'external'): ScrcpySession => {
    const deps = adbPath ? defaultScrcpyDeps(adbPath) : defaultScrcpyDeps('adb');
    return new ScrcpySession(
      serial,
      kind,
      { adbPath: adbPath ?? 'adb', jarPath },
      deps,
      {
        onVideoChunk: (id, chunk) => sendToRenderer('android:frame', id, chunk),
        onState: (id, state, error) =>
          sendToRenderer('android:device-state', id, state, error),
      },
    );
  };

  ipcMain.handle('android:getGpuGate', async () => getGpuGateStatus(app as unknown as AppLike));

  ipcMain.handle('android:listDevices', async () => {
    if (!adbPath) {
      return { devices: [], error: 'adb not found — install the Android SDK platform-tools (no adb on PATH or in the usual SDK locations)' };
    }
    const deps = defaultScrcpyDeps(adbPath);
    const result = await deps.runAdb(['devices']);
    if (result.code !== 0) {
      return { devices: [], error: result.stderr.trim() || `adb devices failed (exit ${result.code})` };
    }
    return { devices: parseAdbDevices(result.stdout) };
  });

  ipcMain.handle('android:getCapacity', () => {
    const counts = registry.counts();
    return { ...counts, summary: registry.summary() };
  });

  ipcMain.handle('android:connectExternal', async (_event, serial: string) => {
    if (!serial) return { ok: false, reason: 'no device serial given' };
    const connected = registry.connectExternal(serial, (id) => makeSession(id, 'external'));
    if (!connected.ok || !connected.session) {
      return { ok: false, reason: connected.reason ?? 'could not connect device' };
    }
    return connected.session.start();
  });

  ipcMain.handle('android:loadInternal', async (_event, serial: string) => {
    if (!serial) return { ok: false, reason: 'no device serial given' };
    const loaded = registry.loadInternal(serial, (id) => makeSession(id, 'internal'));
    if (!loaded.ok || !loaded.session) {
      return { ok: false, reason: loaded.reason ?? 'could not load internal instance' };
    }
    return loaded.session.start();
  });

  ipcMain.handle('android:disconnect', async (_event, serial: string) => {
    if (!serial) return false;
    return registry.disconnect(serial);
  });

  ipcMain.handle('android:startStream', async (_event, serial: string) => {
    const session = registry.get(serial);
    if (!session) return { ok: false, error: `no session for ${serial} — connect it first` };
    return session.start();
  });

  ipcMain.handle('android:stopStream', async (_event, serial: string) => {
    const session = registry.get(serial);
    if (!session) return { ok: false, error: `no session for ${serial}` };
    await session.stop();
    return { ok: true };
  });

  ipcMain.handle('android:touch', async (_event, serial: string, msg: TouchMessage) => {
    const session = registry.get(serial);
    if (!session) return { ok: false, error: `no session for ${serial} — connect it first` };
    return session.sendTouch(msg);
  });

  ipcMain.handle('android:getMetrics', (_event, serial?: string) => {
    const first = serial ? undefined : registry.list()[0];
    const session = serial ? registry.get(serial) : first ? registry.get(first.serial) : undefined;
    if (!session) return null;
    return session.snapshot(Date.now());
  });

  ipcMain.handle('android:reportDecodePath', (_event, serial: string, decodePath: DecodePath) => {
    registry.get(serial)?.metrics.reportDecodePath(decodePath);
  });

  return registry;
}
