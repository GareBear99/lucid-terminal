/**
 * Device detection parsing — the read-only half of the Devices
 * plugin. The fixture is a hand-built system_profiler SPUSBDataType
 * tree (bus -> hub -> keyboard + receiver); the expected devices
 * were worked out from the parser's rules by hand before running.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { parseSystemProfiler } from '../src/lib/deviceDetection';
import { parseAdbDevices } from '../electron/services/scrcpy';

const SYSTEM_PROFILER_FIXTURE = `USB:

    USB 3.1 Bus:

        Host Controller Driver: AppleT8103USBXHCI

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

describe('parseSystemProfiler', () => {
  it('parses a hub + nested devices in document order, bus excluded', () => {
    const devices = parseSystemProfiler(SYSTEM_PROFILER_FIXTURE);
    // The bus header has no Product ID under it, so it never becomes
    // a device; the hub and its two nested devices do.
    expect(devices).toHaveLength(3);
    expect(devices.map((d) => d.name)).toEqual(['Hub', 'Apple Keyboard', 'USB Receiver']);
    expect(devices.map((d) => d.id)).toEqual(['usb-0', 'usb-1', 'usb-2']);
    expect(devices.map((d) => d.kind)).toEqual(['usb', 'usb', 'usb']);
    expect(devices.map((d) => d.status)).toEqual(['Connected', 'Connected', 'Connected']);
    expect(devices[0]).toMatchObject({ productId: '0x8100', vendorId: '0x05ac', vendorName: 'Apple Inc.' });
    expect(devices[1]).toMatchObject({ productId: '0x024f', vendorId: '0x05ac', vendorName: 'Apple Inc.' });
    expect(devices[2]).toMatchObject({ productId: '0xc52b', vendorId: '0x046d', vendorName: 'Logitech Inc.' });
  });

  it('empty output parses to no devices', () => {
    expect(parseSystemProfiler('')).toEqual([]);
    expect(parseSystemProfiler('USB:\n')).toEqual([]);
  });

  it('a Product ID without a Vendor ID leaves vendorId undefined', () => {
    const devices = parseSystemProfiler(
      '    Solo Device:\n\n        Product ID: 0x1234\n',
    );
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Solo Device');
    expect(devices[0].productId).toBe('0x1234');
    expect(devices[0].vendorId).toBeUndefined();
    expect(devices[0].vendorName).toBeUndefined();
  });

  it('a Product ID with no header above it is skipped', () => {
    expect(parseSystemProfiler('Product ID: 0x1234\n')).toEqual([]);
  });

  it('a second Product ID under one header keeps the first', () => {
    const devices = parseSystemProfiler(
      '    Dup Device:\n\n        Product ID: 0x1111\n        Product ID: 0x2222\n',
    );
    expect(devices).toHaveLength(1);
    expect(devices[0].productId).toBe('0x1111');
  });
});

describe('parseAdbDevices (scrcpy service)', () => {
  it('parses device + unauthorized states, skips the header and blanks', () => {
    const devices = parseAdbDevices(
      'List of devices attached\n' +
        'emulator-5554\tdevice\n' +
        'R5CT1234567\tunauthorized\n' +
        '\n',
    );
    expect(devices).toEqual([
      { serial: 'emulator-5554', state: 'device' },
      { serial: 'R5CT1234567', state: 'unauthorized' },
    ]);
  });

  it('empty output parses to no devices', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
    expect(parseAdbDevices('')).toEqual([]);
  });
});
