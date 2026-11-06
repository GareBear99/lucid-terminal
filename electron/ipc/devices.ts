/**
 * Devices IPC (Electron main process) — detection only.
 *
 * One channel: `devices:list` -> DevicesListResult. It lists and
 * identifies devices and nothing else: no control, no communication,
 * no open channel to any device.
 *
 * Sources (all read-only, zero new native modules — the build sets
 * npmRebuild:false, so no node-usb / node-hid):
 * - USB: `system_profiler SPUSBDataType` (macOS only), parsed by
 *   src/lib/deviceDetection.ts.
 * - Android: `adb devices`, reusing the scrcpy service's resolver
 *   and parser (the same spawn the Android add-on uses).
 * - Host: the Mac Lucid is running on, from Node's os module.
 *
 * A source that fails does not fail the scan — its error lands in
 * `errors` and the other sources still report. The renderer shows
 * the errors next to the list instead of a blank tab.
 */

import { execFile } from 'child_process';
import * as os from 'os';
import type { IpcMain } from 'electron';
import {
  parseSystemProfiler,
  type DetectedDevice,
  type DevicesListResult,
} from '../../src/lib/deviceDetection';
import {
  defaultScrcpyDeps,
  parseAdbDevices,
  resolveAdbPath,
} from '../services/scrcpy';

export interface DevicesDeps {
  /** `system_profiler SPUSBDataType` stdout. Rejects on spawn failure. */
  runSystemProfiler: () => Promise<string>;
  /** `adb devices` result. Never rejects — a missing/failed adb
   * reports as `{ devices: [], error }`. */
  listAdbDevices: () => Promise<{
    devices: { serial: string; state: string }[];
    error?: string;
  }>;
  /** This Mac, as a device row. */
  getHostInfo: () => DetectedDevice;
}

function defaultDeps(): DevicesDeps {
  return {
    runSystemProfiler: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          'system_profiler',
          ['SPUSBDataType'],
          { timeout: 15_000 },
          (error, stdout) => {
            if (error) {
              reject(
                new Error(
                  `system_profiler failed: ${error.message}`,
                ),
              );
              return;
            }
            resolve(String(stdout ?? ''));
          },
        );
      }),
    listAdbDevices: async () => {
      const adbPath = resolveAdbPath();
      if (!adbPath) {
        return {
          devices: [],
          error:
            'adb not found — install the Android SDK platform-tools (no adb on PATH or in the usual SDK locations)',
        };
      }
      const deps = defaultScrcpyDeps(adbPath);
      const result = await deps.runAdb(['devices']);
      if (result.code !== 0) {
        return {
          devices: [],
          error:
            result.stderr.trim() || `adb devices failed (exit ${result.code})`,
        };
      }
      return { devices: parseAdbDevices(result.stdout) };
    },
    getHostInfo: () => {
      const cpu = os.cpus()[0]?.model;
      return {
        id: 'host',
        name: os.hostname(),
        kind: 'host',
        status: `${os.type()} ${os.release()} (${os.arch()})`,
        detail: cpu,
      };
    },
  };
}

/** Scan every source and return the combined result. Exported for
 * tests — the IPC handler below is one line over it. */
export async function listDevices(
  deps: DevicesDeps = defaultDeps(),
): Promise<DevicesListResult> {
  const errors: string[] = [];
  const devices: DetectedDevice[] = [];
  const host = deps.getHostInfo();

  // USB is macOS-only: system_profiler does not exist elsewhere.
  if (process.platform === 'darwin') {
    try {
      const output = await deps.runSystemProfiler();
      devices.push(...parseSystemProfiler(output));
    } catch (error) {
      errors.push(
        `USB scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    errors.push('USB scan needs macOS (system_profiler is darwin-only)');
  }

  try {
    const adb = await deps.listAdbDevices();
    if (adb.error) errors.push(`Android scan: ${adb.error}`);
    for (const device of adb.devices) {
      devices.push({
        id: `android:${device.serial}`,
        name: device.serial,
        kind: 'android',
        // The adb state is the status verbatim: 'device',
        // 'unauthorized', 'offline', ... — never normalised away.
        status: device.state,
        detail: 'Android device (adb)',
      });
    }
  } catch (error) {
    errors.push(
      `Android scan failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { host, devices, errors, refreshedAt: Date.now() };
}

export function setupDevicesHandlers(
  ipcMain: IpcMain,
  deps?: DevicesDeps,
): void {
  ipcMain.handle('devices:list', async () => listDevices(deps ?? defaultDeps()));
}
