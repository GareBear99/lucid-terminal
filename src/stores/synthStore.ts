/**
 * Synth store — single source of truth for the Lucid synth view.
 *
 * GENERIC plugin architecture (Gary, 2026-11-04): the shell + mount system
 * is NOT Lucifer-specific. Every plugin can have its own shell; the plugin
 * mounts into it as its embodiment (its Sentinel/synth). Lucifer is the
 * FIRST instance (LuciferAI plugin embodied as Lucifer the Sentinel), not
 * a one-off. Nothing in this store hardcodes Lucifer — the mount logic
 * works on plugin ids and the PLUGIN_SHELLS registry.
 *
 * State model (Iteration 8 blueprint model):
 * - A shell exists on its own and boots in WAIT_BLUEPRINT with NOTHING
 *   mounted. No placeholder synth is forced in.
 * - A synth embodiment is mounted explicitly. The mount is gated on ROLE
 *   ('synth-embodiment'), never on classification — Lucifer mounts as the
 *   synth embodiment even though its classification is Sentinel.
 * - Once mounted, the embodiment is the plugin synth at the heart, with
 *   the Neural Synth in the eye.
 *
 * This store is pure state (no window/IPC access at module load) so it can
 * be imported by tests in a node environment.
 */

import { create } from 'zustand';
import {
  BootState,
  CENTER_TILE_ID,
  DEFAULT_PLUGIN_ID,
  EyeMode,
  PLUGIN_SHELLS,
  SynthEmbodiment,
  canMountEmbodiment,
} from '../types/synth';

function bootFor(
  mounted: SynthEmbodiment | null,
  shellLoaded: boolean,
): BootState {
  // The shell is READY once a synth embodiment is mounted. The empty shell
  // waits for a blueprint (and a mount).
  return mounted || shellLoaded ? 'READY' : 'WAIT_BLUEPRINT';
}

interface SynthState {
  /** Which plugin's shell is active in the view. */
  activePluginId: string;
  /** Seed hex for the active shell's Neural Synth thinker. */
  seedHex: string;
  /** Selected tile on the canonical spine; the Sentinel is pinned to the center tile. */
  selectedTileId: string;
  eyeMode: EyeMode;
  /** Whether a shell blueprint has been loaded into the active shell. */
  shellLoaded: boolean;
  /** Mounted embodiment per plugin/shell id — null means that shell is empty. */
  mounts: Record<string, SynthEmbodiment | null>;
  /** Boot state of the active shell. */
  bootState: BootState;

  // Actions
  setActivePlugin: (pluginId: string) => void;
  setSeed: (seedHex: string) => void;
  reseed: () => void;
  selectTile: (tileId: string) => void;
  setEyeMode: (mode: EyeMode) => void;
  setShellLoaded: (loaded: boolean) => void;
  /**
   * Mount an embodiment into a plugin's shell. Accepts anything whose role
   * is 'synth-embodiment' — classification is never inspected. Returns
   * true when the mount succeeded, false when it cannot be mounted
   * (wrong role / null / unknown plugin). Mounting replaces any embodiment
   * currently mounted in that shell.
   */
  mountEmbodiment: (
    pluginId: string,
    emb: SynthEmbodiment | null | undefined,
  ) => boolean;
  /** Mount a registered plugin's own embodiment into its shell. */
  mountPlugin: (pluginId: string) => boolean;
  /** Unmount the embodiment from a plugin's shell; it returns to empty. */
  unmountEmbodiment: (pluginId: string) => void;
}

function randomHexSeed(): string {
  const chars = '0123456789ABCDEF';
  let out = '';
  for (let i = 0; i < 16; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const useSynthStore = create<SynthState>((set, get) => {
  const initialPlugin = DEFAULT_PLUGIN_ID;

  return {
    activePluginId: initialPlugin,
    seedHex: PLUGIN_SHELLS[initialPlugin]?.defaultSeed ?? 'F1B49B1CB10D6FED',
    selectedTileId: CENTER_TILE_ID,
    eyeMode: 'AUTO',
    shellLoaded: false,
    mounts: {},
    bootState: 'WAIT_BLUEPRINT',

    setActivePlugin: (pluginId) => {
      const spec = PLUGIN_SHELLS[pluginId];
      if (!spec) return;
      const { mounts, shellLoaded } = get();
      const mounted = mounts[pluginId] ?? null;
      set({
        activePluginId: pluginId,
        seedHex: spec.defaultSeed,
        bootState: bootFor(mounted, shellLoaded),
      });
    },

    setSeed: (seedHex) => {
      const clean = seedHex.trim().toUpperCase();
      if (!/^[0-9A-F]{1,16}$/.test(clean)) return;
      set({ seedHex: clean });
    },

    reseed: () => set({ seedHex: randomHexSeed() }),

    selectTile: (tileId) => {
      if (!/^tile_\d{4}$/.test(tileId)) return;
      set({ selectedTileId: tileId });
    },

    setEyeMode: (mode) => set({ eyeMode: mode }),

    setShellLoaded: (loaded) => {
      const { mounts, activePluginId } = get();
      set({
        shellLoaded: loaded,
        bootState: bootFor(mounts[activePluginId] ?? null, loaded),
      });
    },

    mountEmbodiment: (pluginId, emb) => {
      // THE mount gate: role only. Classification is never checked here —
      // a Sentinel mounts as the synth embodiment exactly like a Synth would.
      // The plugin id must be a registered shell; the embodiment itself is
      // not required to name Lucifer or any other specific plugin.
      if (!PLUGIN_SHELLS[pluginId]) return false;
      if (!canMountEmbodiment(emb)) return false;
      const mounts = { ...get().mounts, [pluginId]: emb as SynthEmbodiment };
      const { activePluginId, shellLoaded } = get();
      set({
        mounts,
        bootState:
          pluginId === activePluginId
            ? bootFor(emb as SynthEmbodiment, shellLoaded)
            : get().bootState,
      });
      return true;
    },

    mountPlugin: (pluginId) => {
      const spec = PLUGIN_SHELLS[pluginId];
      if (!spec) return false;
      return get().mountEmbodiment(pluginId, spec.embodiment);
    },

    unmountEmbodiment: (pluginId) => {
      if (!PLUGIN_SHELLS[pluginId]) return;
      const mounts = { ...get().mounts, [pluginId]: null };
      const { activePluginId, shellLoaded } = get();
      set({
        mounts,
        bootState:
          pluginId === activePluginId
            ? bootFor(null, shellLoaded)
            : get().bootState,
      });
    },
  };
});

/** The embodiment mounted in the active shell, or null when it is empty. */
export function activeMount(state: SynthState): SynthEmbodiment | null {
  return state.mounts[state.activePluginId] ?? null;
}
