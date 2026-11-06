/**
 * Devices store — renderer state for the Devices plugin.
 *
 * Holds the last scan: this Mac, the detected USB + Android
 * devices, any per-source errors, and when the scan ran. Detection
 * is on demand only — nothing polls, nothing watches for hotplug
 * in v1. The Settings Devices tab refreshes on first open; the
 * Refresh button re-scans after that.
 *
 * The IPC call is guarded: outside Electron (or before the preload
 * exposes `devices`) refresh records an error instead of throwing,
 * so the tab renders an honest message rather than a blank panel.
 */

import { create } from 'zustand';
import type {
  DetectedDevice,
  DevicesListResult,
} from '../lib/deviceDetection';

interface DevicesState {
  host: DetectedDevice | null;
  devices: DetectedDevice[];
  errors: string[];
  loading: boolean;
  lastRefreshedAt: number | null;

  refresh: () => Promise<void>;
}

export const useDevicesStore = create<DevicesState>()((set, get) => ({
  host: null,
  devices: [],
  errors: [],
  loading: false,
  lastRefreshedAt: null,

  refresh: async () => {
    if (get().loading) return;
    const list = window.lucidAPI?.devices?.list;
    if (typeof list !== 'function') {
      set({
        errors: ['Devices IPC is not available in this window.'],
        loading: false,
      });
      return;
    }
    set({ loading: true, errors: [] });
    try {
      const result: DevicesListResult = await list();
      set({
        host: result.host,
        devices: result.devices,
        errors: result.errors,
        lastRefreshedAt: result.refreshedAt,
        loading: false,
      });
    } catch (error) {
      set({
        errors: [
          `Device scan failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        loading: false,
      });
    }
  },
}));
