/**
 * Devices IPC — the main-process scan behind `devices:list`.
 *
 * The scan combines three sources (USB via system_profiler, Android
 * via adb, the host Mac) and never fails as a whole: a source that
 * fails lands in `errors` and the others still report. The handler
 * itself is one line over listDevices, so these tests drive
 * listDevices with fake deps and check the IPC registration
 * separately.
 *
 * USB is darwin-only (system_profiler does not exist elsewhere), so
 * the USB cases redefine process.platform for the test — the VM is
 * Linux, and the non-darwin path is tested as the default.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listDevices,
  setupDevicesHandlers,
  type DevicesDeps,
} from '../electron/ipc/devices';

const SYSTEM_PROFILER_FIXTURE = `USB:

    USB 3.1 Bus:

        Hub:

            Product ID: 0x8100
            Vendor ID: 0x05ac  (Apple Inc.)

            Apple Keyboard:

                Product ID: 0x024f
                Vendor ID: 0x05ac  (Apple Inc.)

            USB Receiver:

                Product ID: 0xc52b
                Vendor ID: 0x046d  (Logitech Inc.)
`;

const HOST = {
  id: 'host',
  name: 'gary-mac',
  kind: 'host' as const,
  status: 'Darwin 24.0.0 (arm64)',
  detail: 'Apple M1',
};

function fakeDeps(overrides: Partial<DevicesDeps> = {}): DevicesDeps {
  return {
    runSystemProfiler: async () => SYSTEM_PROFILER_FIXTURE,
    listAdbDevices: async () => ({
      devices: [
        { serial: 'emulator-5554', state: 'device' },
        { serial: 'R5CT1234567', state: 'unauthorized' },
      ],
    }),
    getHostInfo: () => HOST,
    ...overrides,
  };
}

const originalPlatform = process.platform;

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

describe('listDevices', () => {
  it('combines host + USB + Android, no errors, on darwin', async () => {
    setPlatform('darwin');
    const result = await listDevices(fakeDeps());
    expect(result.host).toEqual(HOST);
    expect(result.errors).toEqual([]);
    expect(result.devices.map((d) => d.name)).toEqual([
      'Hub',
      'Apple Keyboard',
      'USB Receiver',
      'emulator-5554',
      'R5CT1234567',
    ]);
    expect(result.devices.map((d) => d.kind)).toEqual([
      'usb',
      'usb',
      'usb',
      'android',
      'android',
    ]);
    // The adb state is the status verbatim — never normalised away.
    expect(result.devices[3]).toMatchObject({ id: 'android:emulator-5554', status: 'device' });
    expect(result.devices[4]).toMatchObject({ id: 'android:R5CT1234567', status: 'unauthorized' });
    expect(typeof result.refreshedAt).toBe('number');
  });

  it('a failing USB source lands in errors; host + Android still report', async () => {
    setPlatform('darwin');
    const result = await listDevices(
      fakeDeps({ runSystemProfiler: async () => { throw new Error('spawn ENOENT'); } }),
    );
    expect(result.host).toEqual(HOST);
    expect(result.devices.map((d) => d.name)).toEqual(['emulator-5554', 'R5CT1234567']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('USB scan failed');
  });

  it('a missing adb lands in errors; host + USB still report', async () => {
    setPlatform('darwin');
    const result = await listDevices(
      fakeDeps({ listAdbDevices: async () => ({ devices: [], error: 'adb not found' }) }),
    );
    expect(result.devices.map((d) => d.name)).toEqual(['Hub', 'Apple Keyboard', 'USB Receiver']);
    expect(result.errors).toEqual(['Android scan: adb not found']);
  });

  it('off darwin the USB scan is skipped with an honest error, not a crash', async () => {
    setPlatform('linux');
    const result = await listDevices(fakeDeps());
    expect(result.host).toEqual(HOST);
    expect(result.devices.map((d) => d.kind)).toEqual(['android', 'android']);
    expect(result.errors).toEqual(['USB scan needs macOS (system_profiler is darwin-only)']);
  });
});

describe('setupDevicesHandlers', () => {
  it("registers the 'devices:list' handler and it returns the combined scan", async () => {
    setPlatform('darwin');
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }) };
    setupDevicesHandlers(ipcMain as never, fakeDeps());
    expect(ipcMain.handle).toHaveBeenCalledWith('devices:list', expect.any(Function));
    const handler = handlers.get('devices:list')!;
    const result = (await handler()) as Awaited<ReturnType<typeof listDevices>>;
    expect(result.host).toEqual(HOST);
    expect(result.devices).toHaveLength(5);
    expect(result.errors).toEqual([]);
  });
});
