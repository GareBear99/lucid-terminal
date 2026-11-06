/**
 * Phone streaming store — renderer state for the Phase 0 spike.
 *
 * Holds the GPU gate (reported by main, or the renderer's own
 * mediaCapabilities fallback when the IPC is absent), whether the
 * Android add-on is installed, which internal stream (if any) is
 * showing, and the latest metrics snapshot. The gate applies ONLY
 * to Lucid's in-app (internal) streaming entry — the external
 * entry never consults it.
 *
 * `androidAddonInstalled` starts from the add-on data (not
 * installed — there is no install flow yet). The install flow,
 * when it lands, calls `setAndroidAddonInstalled(true)` and the
 * internal entry appears.
 */

import { create } from 'zustand';
import { PLUGIN_ADDONS, isAddonInstalled } from '../data/pluginAddons';
import {
  decodePathFromMediaCapabilities,
  getPhoneEntries,
  uncheckedGpuGate,
  GPU_GATE_DISABLED_REASON,
  H264_CODEC,
  type GpuGateStatus,
  type PhoneEntry,
  type StreamMetricsSnapshot,
} from '../phone/streaming';

function androidAddonInstalledFromData(): boolean {
  // Anchor-install is REAL, not just UI text: Android Connect is an
  // add-on of the Devices anchor plugin, so it counts as installed
  // by virtue of the anchor (isAddonInstalled) — the internal Phone
  // entry appears without anyone installing anything.
  const addon = PLUGIN_ADDONS.find((a) => a.id === 'android-emulator');
  return addon ? isAddonInstalled(addon) : false;
}

interface PhoneState {
  androidAddonInstalled: boolean;
  gpuGate: GpuGateStatus;
  /** Serial of the internal stream showing in PhoneView, or null. */
  activeInternalSerial: string | null;
  metrics: StreamMetricsSnapshot | null;

  setAndroidAddonInstalled: (installed: boolean) => void;
  setGpuGate: (gate: GpuGateStatus) => void;
  setActiveInternalSerial: (serial: string | null) => void;
  setMetrics: (metrics: StreamMetricsSnapshot | null) => void;
  /** The two Phone entries for the button (external + internal). */
  phoneEntries: () => PhoneEntry[];
  /**
   * Ask main for the real GPU check; fall back to the renderer's
   * mediaCapabilities H.264 probe when the IPC is absent (e.g.
   * outside Electron). Never leaves the gate as "assumed".
   */
  refreshGpuGate: () => Promise<void>;
}

export const usePhoneStore = create<PhoneState>()((set, get) => ({
  androidAddonInstalled: androidAddonInstalledFromData(),
  gpuGate: uncheckedGpuGate(),
  activeInternalSerial: null,
  metrics: null,

  setAndroidAddonInstalled: (installed) => set({ androidAddonInstalled: installed }),
  setGpuGate: (gate) => set({ gpuGate: gate }),
  setActiveInternalSerial: (serial) => set({ activeInternalSerial: serial }),
  setMetrics: (metrics) => set({ metrics }),

  phoneEntries: () =>
    getPhoneEntries({
      androidAddonInstalled: get().androidAddonInstalled,
      gpuGate: get().gpuGate,
    }),

  refreshGpuGate: async () => {
    let ipcGate;
    try {
      ipcGate = await window.lucidAPI?.android
        ?.getGpuGate()
        .catch(() => undefined);
    } catch {
      ipcGate = undefined;
    }
    if (ipcGate) {
      set({ gpuGate: ipcGate });
      return;
    }
    // Renderer fallback: the browser's own H.264 decode probe.
    try {
      const media = navigator.mediaCapabilities;
      const info = await media.decodingInfo({
        type: 'media-source',
        video: {
          contentType: `video/mp4; codecs="${H264_CODEC}"`,
          width: 720,
          height: 1280,
          bitrate: 2_000_000,
          framerate: 30,
        },
      });
      const hardwareDecode = info.supported && info.powerEfficient;
      set({
        gpuGate: {
          checked: true,
          hardwareDecode,
          videoDecodeStatus: hardwareDecode ? 'enabled' : 'software',
          deviceName: null,
          reason: hardwareDecode ? null : GPU_GATE_DISABLED_REASON,
        },
      });
    } catch {
      // No probe available — the gate stays closed, honestly.
      set({
        gpuGate: {
          checked: true,
          hardwareDecode: false,
          videoDecodeStatus: 'unknown',
          deviceName: null,
          reason: GPU_GATE_DISABLED_REASON,
        },
      });
    }
  },
}));

/** Re-export for callers that only need the probe result shape. */
export { decodePathFromMediaCapabilities };
export type { DecodePath } from '../phone/streaming';
