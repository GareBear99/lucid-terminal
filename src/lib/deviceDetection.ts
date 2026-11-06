/**
 * Device detection — pure parsing + shared device types.
 *
 * Detection ONLY: Lucid lists and identifies devices. It never
 * controls them, never communicates with them, and never opens a
 * channel to one. The detection itself runs in the main process
 * (electron/ipc/devices.ts); this module is the pure part — the
 * system_profiler output parser and the shapes every side shares —
 * so vitest can exercise it with no Electron, DOM, or Node imports.
 *
 * Sources (all read-only, zero new native modules):
 * - USB: `system_profiler SPUSBDataType` on macOS (spawned by main).
 * - Android: `adb devices` (the same spawn the Android add-on uses).
 * - Host: the Mac Lucid is running on (hostname + OS + CPU).
 *
 * A device is a USB entry only when system_profiler gives it a
 * Product ID. Bus headers ("USB 3.1 Bus:") and property lines
 * ("Host Controller Driver: ...") have no Product ID, so they are
 * never devices. A hub IS a device — it has a Product ID — and a
 * device nested under a hub parses by indentation, like everything
 * else in the tree.
 */

export type DeviceKind = 'usb' | 'android' | 'host';

export interface DetectedDevice {
  /** Stable id within one scan: `usb-<n>`, `android:<serial>`, `host`. */
  id: string;
  /** Display name: the USB product name, the adb serial, the hostname. */
  name: string;
  kind: DeviceKind;
  /** Human status: 'Connected' for USB, the adb state ('device',
   * 'unauthorized', 'offline', ...) for Android, the OS string for
   * the host. */
  status: string;
  /** Hex ids from the source, e.g. '0x05ac' / '0x8300'. */
  vendorId?: string;
  productId?: string;
  /** Vendor name when the source gives one, e.g. 'Apple Inc.'. */
  vendorName?: string;
  /** Extra detail line, e.g. the host CPU model. */
  detail?: string;
}

export interface DevicesListResult {
  /** This Mac. Always present — detection never returns no host. */
  host: DetectedDevice;
  /** USB + Android devices, in scan order (USB first, then Android). */
  devices: DetectedDevice[];
  /** One line per source that failed or was skipped, e.g. adb missing.
   * Empty means every source scanned clean. */
  errors: string[];
  /** Wall-clock ms when the scan ran. */
  refreshedAt: number;
}

interface HeaderCandidate {
  indent: number;
  name: string;
}

/** A `Name:` header line (no value after the colon), or null. */
function parseHeaderLine(line: string): HeaderCandidate | null {
  const match = /^(\s*)([^:]+):\s*$/.exec(line);
  if (!match) return null;
  return { indent: match[1].length, name: match[2].trim() };
}

function parseHexId(line: string, label: string): string | null {
  const match = new RegExp(`^\\s*${label}:\\s*(0[xX][0-9a-fA-F]+)\\s*$`).exec(line);
  return match ? match[1].toLowerCase() : null;
}

/**
 * `system_profiler SPUSBDataType` output -> USB devices, in document
 * order. A device is emitted the moment its Product ID is seen; its
 * name is the nearest preceding header with a smaller indent, and a
 * Vendor ID line after it fills in vendorId/vendorName.
 *
 * Lines that are not a header, a Product ID, or a Vendor ID are
 * ignored — bus properties, speeds, currents, location ids.
 */
export function parseSystemProfiler(output: string): DetectedDevice[] {
  const devices: DetectedDevice[] = [];
  // One record per header that turned out to be a device, keyed by the
  // header's position in the candidate list. A header only becomes a
  // device when a Product ID line lands under it.
  const byHeader = new Map<number, DetectedDevice>();
  const headers: HeaderCandidate[] = [];

  for (const line of output.split(/\r?\n/)) {
    const header = parseHeaderLine(line);
    if (header) {
      headers.push(header);
      continue;
    }

    const productId = parseHexId(line, 'Product ID');
    if (productId) {
      const indent = /^\s*/.exec(line)?.[0].length ?? 0;
      // The device is the nearest header above this line.
      let headerIndex = -1;
      for (let i = headers.length - 1; i >= 0; i--) {
        if (headers[i].indent < indent) {
          headerIndex = i;
          break;
        }
      }
      if (headerIndex === -1) continue;
      if (!byHeader.has(headerIndex)) {
        const device: DetectedDevice = {
          id: `usb-${devices.length}`,
          name: headers[headerIndex].name,
          kind: 'usb',
          status: 'Connected',
          productId,
        };
        byHeader.set(headerIndex, device);
        devices.push(device);
      } else {
        // A second Product ID under one header: keep the first — a
        // header names one device, and a repeat would be a parse
        // artefact, not a second device. (No overwrite.)
      }
      continue;
    }

    const vendorMatch = /^\s*Vendor ID:\s*(0[xX][0-9a-fA-F]+)(?:\s*\(([^)]*)\))?\s*$/.exec(line);
    if (vendorMatch) {
      const indent = /^\s*/.exec(line)?.[0].length ?? 0;
      let headerIndex = -1;
      for (let i = headers.length - 1; i >= 0; i--) {
        if (headers[i].indent < indent) {
          headerIndex = i;
          break;
        }
      }
      const device = headerIndex === -1 ? undefined : byHeader.get(headerIndex);
      if (device) {
        device.vendorId = vendorMatch[1].toLowerCase();
        if (vendorMatch[2]) device.vendorName = vendorMatch[2].trim();
      }
    }
  }

  return devices;
}
