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
 * State model (Iteration 8, ported from the Proto-Synth Grid Engine
 * repo, 2026-11-12 — the old version, the one in the repo, finished
 * properly):
 * - A shell exists on its own and boots in WAIT_BLUEPRINT with NOTHING
 *   mounted. No placeholder synth is forced in.
 * - The shell runs the repo's 6-state boot machine
 *   (WAIT_BLUEPRINT → COLD → POST → PING_TEST → READY, or SAFE_MODE)
 *   and the build machine (PLANNED → INTEGRITY → MAPPING → COMPLETE
 *   → EMPTY_REPO_READY). The machine is the ONLY boot truth — the old
 *   2-state derivation (READY when mounted OR shellLoaded) is gone,
 *   because it could read READY while the shell was still waiting or
 *   failed. The machine is the ACTIVE shell's machine; it needs a
 *   blueprint loaded AND the shell iframe loaded (shellReady) before
 *   it leaves WAIT_BLUEPRINT, and boot needs a NOOP GRANT receipt.
 * - Modules attach in three lanes (ship/scanner/hud). Loading a
 *   blueprint fills the lanes with the repo's defaults, so the eye +
 *   probe are always visible; the builder overrides lanes with
 *   uploaded module blueprints or detaches them.
 * - A synth embodiment mounts explicitly. The mount is gated on ROLE
 *   ('synth-embodiment'), never on classification — Lucifer mounts as
 *   the synth embodiment even though its classification is Sentinel —
 *   AND, for the active shell, on the ping handshake: the machine must
 *   be READY with a NOOP GRANT receipt for the active shell. (Mounts
 *   into non-active shells are role-gated only — their machine isn't
 *   tracked until they become active. See the build report.)
 * - Once mounted, the embodiment is the plugin synth at the heart,
 *   with the thinker/field/ship drawn at the eye's world-projected
 *   position (ex, ey) = projectDir(eye) — the blueprint's
 *   centre-anchor — gated on eyeVisible (Gary, 2026-11-08 ~03:55,
 *   af90dd2, proved by Gary with a scroll). Canvas centre (cx, cy)
 *   is the RETICLE's anchor in the vendored v67 shell (cameraStep
 *   builds the camera from reticleDir); the world origin (0,0,0) is
 *   empty and unprojectable. The eye is the observer/camera
 *   direction; only the reticle is outside. See SHELL_CENTER in
 *   src/types/synth.ts (origin vector only — nothing draws at it).
 * - THE VOXEL DIRECTORY IS GATED (Gary, 2026-11-12 ~12:23 PST): it
 *   only exists AFTER the demo has been PERMANENTLY replaced by the
 *   creation one (the Iteration 8 creator build). No directory while
 *   the demo is still there. The gate is settings.synthDemoReplaced
 *   (one-way, permanent) AND a saved creation build. directories
 *   starts EMPTY and is built only when the gate is met.
 * - THE CREATION IS A PROFILE THING (Gary, 2026-11-12 ~12:23 PST):
 *   the created build belongs to / is tracked by a profile. Profiles
 *   are a LATER build (splashscreen → profile → splashscreen →
 *   Lucid); until they land, the creation carries profileId 'default'
 *   (the implicit profile) and is picked up after the profile step,
 *   on the way into Lucid (restoreCreation, called on Synth entry).
 *   The creation's storage is profile-shaped so it slots into
 *   profiles when they land — see CreatorBuild.profileId.
 *
 * This store is pure state (no window/IPC access at module load) so it can
 * be imported by tests in a node environment.
 */

import { create } from 'zustand';
import {
  BootState,
  BuildState,
  CENTER_TILE_ID,
  DEFAULT_PLUGIN_ID,
  EyeMode,
  PLUGIN_SHELLS,
  ShellIframeState,
  SynthEmbodiment,
  VoxelDirectory,
  buildVoxelDirectory,
  canMountEmbodiment,
} from '../types/synth';
import { useSettingsStore } from './settingsStore';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
  type ModuleBlueprint,
  type ModuleType,
  type ShellBlueprint,
} from '../lib/synthBlueprint';
import {
  createMachine,
  hasBootNoopGrant,
  loadBlueprintIntoMachine,
  runMachine,
  stepMachine,
  type ShellMachineState,
} from '../lib/synthBoot';
import {
  parseCreatorBuild,
  type CreatorBuild,
} from '../lib/synthDisclaimer';

/**
 * The Voxel Directory gate (Gary, 2026-11-12 ~12:23 PST): the directory
 * only exists once the demo has been PERMANENTLY replaced by the
 * creation one. The gate is the one-way settings flag synthDemoReplaced
 * AND a saved creation build. No directory while the demo is still there.
 */
export function directoryGateMet(): boolean {
  const settings = useSettingsStore.getState().settings;
  return (
    settings.synthDemoReplaced === true &&
    parseCreatorBuild(settings.synthOwnBuild) !== null
  );
}

/**
 * Build (or clear) the active plugin's directory from the gate + seed.
 * Returns the new directories map: the active entry is built when the
 * gate is met, dropped when it is not. Other plugins' entries are kept.
 */
function gatedDirectories(
  directories: Record<string, VoxelDirectory>,
  pluginId: string,
  seedHex: string,
): Record<string, VoxelDirectory> {
  // A shell that manages its own state (Iteration 8) has no Voxel
  // Directory: the directory is the demo flow's neural-scene
  // structure, and Iteration 8 is a blueprint shell whose build
  // lives in the shell itself. Never build one for it, gate or not.
  if (PLUGIN_SHELLS[pluginId]?.managesOwnState) {
    const { [pluginId]: _dropped, ...rest } = directories;
    return rest;
  }
  if (!directoryGateMet()) {
    const { [pluginId]: _dropped, ...rest } = directories;
    return rest;
  }
  return {
    ...directories,
    [pluginId]: buildVoxelDirectory(pluginId, seedHex),
  };
}

interface SynthState {
  /** Which plugin's shell is active in the view. */
  activePluginId: string;
  /** Seed hex for the active shell's Neural Synth thinker. */
  seedHex: string;
  /** Selected tile on the canonical spine; the Sentinel is pinned to the center tile. */
  selectedTileId: string;
  eyeMode: EyeMode;
  /**
   * The shell machine — boot + build + ping gate + loaded shell — for
   * the ACTIVE shell. The ONLY boot truth: read machine.boot, never a
   * derivation. Starts WAIT_BLUEPRINT / IDLE with no shell loaded.
   */
  machine: ShellMachineState;
  /**
   * The iframe shell's latest reported state — only for a shell that
   * manages its own state (Iteration 8). Null until the shell posts.
   * Lucid never writes the shell's boot/build; it reads this.
   */
  iframeShellState: ShellIframeState | null;
  /** Attached module blueprints per lane (ship/scanner/hud). */
  modules: Record<ModuleType, ModuleBlueprint | null>;
  /** Mounted embodiment per plugin/shell id — null means that shell is empty. */
  mounts: Record<string, SynthEmbodiment | null>;
  /**
   * Voxel Directory per plugin/shell id (Iteration 8) — GATED (see
   * directoryGateMet above). Starts EMPTY: no directory while the
   * demo is still there. Built when the creation permanently replaces
   * the demo, from that synth's seed; rebuilt whenever its seed
   * changes. The directory's seed always equals the active seedHex.
   */
  directories: Record<string, VoxelDirectory>;
  /**
   * Voxel Directory local-file access, session grant (Gary,
   * 2026-11-12 ~10:45 PST) — in-memory, set by Allowing the
   * Local-tab access prompt WITHOUT "do not show again". It lapses
   * when the directory panel closes (the Synth view unmounts), so
   * the next open asks again. The REMEMBERED grant lives in
   * settings (voxelLocalAccessDontAsk, persisted). The effective
   * grant is remembered OR session — read it through
   * useVoxelLocalAccessGranted below, never by reading either flag
   * directly in a segment. One source of truth in the plugin, not
   * per-segment copies: every segment that connects to the synth
   * sees the same permission state.
   */
  localAccessSessionGranted: boolean;

  // Actions
  setActivePlugin: (pluginId: string) => void;
  setSeed: (seedHex: string) => void;
  reseed: () => void;
  selectTile: (tileId: string) => void;
  setEyeMode: (mode: EyeMode) => void;
  /** Set the session local-access grant (see above). */
  setLocalAccessSessionGranted: (granted: boolean) => void;
  /** The shell iframe loaded (or unloaded) — the machine needs this to leave WAIT_BLUEPRINT. */
  setShellReady: (ready: boolean) => void;
  /**
   * Record the iframe shell's reported state (posted by the shell
   * itself). Ignored unless the active plugin manages its own state
   * — the demo shell's state comes from the TS machine, never the
   * iframe.
   */
  setIframeShellState: (state: ShellIframeState) => void;
  /** Load a shell blueprint into the active shell's machine (fills module lanes with defaults). */
  loadShellBlueprint: (blueprint: ShellBlueprint, seedHex?: string) => void;
  /** Load the default octagon blueprint into the active shell's machine. */
  loadDefaultShellBlueprint: () => void;
  /** Attach a module blueprint to a lane. */
  attachModule: (type: ModuleType, module: ModuleBlueprint) => void;
  /** Detach a module lane (back to empty — the lane stays empty until re-attached or a blueprint loads). */
  detachModule: (type: ModuleType) => void;
  /** Advance the machine one step (the builder drives this on an interval for live progress). */
  stepShellMachine: () => void;
  /** Run the machine to a terminal state (EMPTY_REPO_READY or SAFE_MODE). */
  runShellMachine: () => void;
  /** Reset the active shell to empty: fresh machine, no modules, no directory. */
  resetShell: () => void;
  /**
   * Rebuild the active plugin's directory from the gate + current
   * seed. The parent calls this after flipping synthDemoReplaced
   * (on create): the builder loads the blueprint while the demo is
   * still there (gate not met, no directory), and this builds the
   * directory once the replacement is permanent.
   */
  refreshDirectory: () => void;
  /**
   * Load a saved creation build (Iteration 8) into the active shell:
   * its blueprint, its modules, its seed. Returns false when the
   * build is not a valid creation. Does NOT flip synthDemoReplaced —
   * the caller (the builder, on create) flips that first.
   */
  loadCreationBuild: (build: CreatorBuild) => boolean;
  /**
   * Restore the saved creation on Synth entry (the pickup after the
   * profile step, on the way into Lucid): when the demo was
   * permanently replaced and a creation is saved, load it. Returns
   * false when there is nothing to restore.
   */
  restoreCreation: () => boolean;
  /**
   * Mount an embodiment into a plugin's shell. The gate is role
   * ('synth-embodiment') — classification is never checked — AND,
   * for the ACTIVE shell, the ping handshake: the machine must be
   * READY with a NOOP GRANT receipt for the active shell — or, for
   * a shell that manages its own state (Iteration 8), the shell's
   * own reported boot must be READY. Returns
   * true when the mount succeeded, false when it cannot be mounted
   * (wrong role / null / unknown plugin / machine not READY / no
   * NOOP grant). Mounting replaces any embodiment currently mounted
   * in that shell. Mounting puts the synth's neural capabilities
   * back in action (Gary, 2026-11-12 ~10:21 PST): the thinker
   * appears in the eye and neural action flows through the synth
   * again.
   */
  mountEmbodiment: (
    pluginId: string,
    emb: SynthEmbodiment | null | undefined,
  ) => boolean;
  /** Mount a registered plugin's own embodiment into its shell. */
  mountPlugin: (pluginId: string) => boolean;
  /**
   * Unmount the embodiment from a plugin's shell; it returns to empty.
   * Unmounting pretty much REMOVES the synth's neural capabilities
   * from action (Gary, 2026-11-12 ~10:21 PST): the thinker is not
   * there, no neural action through the synth. The Voxel Directory
   * stays — it is the synth's starting structure, not a capability,
   * and the gate (demo permanently replaced) is unchanged by an
   * unmount. Boot stays READY: boot is a property of the
   * shell+blueprint, not the mount. The daemon-inference door stays
   * open: unmount touches nothing about the brain/Agent, which keeps
   * working headless — homunculi daemons may still infer on the
   * underlying brain even when unmounted. The relay itself is
   * Phase 5, blocked on what a daemon is — not built here.
   */
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
  const initialSeed =
    PLUGIN_SHELLS[initialPlugin]?.defaultSeed ?? 'F1B49B1CB10D6FED';

  return {
    activePluginId: initialPlugin,
    seedHex: initialSeed,
    selectedTileId: CENTER_TILE_ID,
    eyeMode: 'AUTO',
    machine: createMachine(),
    iframeShellState: null,
    modules: { ship: null, scanner: null, hud: null },
    mounts: {},
    // No directory at start: the gate is the permanent replacement
    // of the demo by the creation, and the demo is still there.
    directories: {},
    localAccessSessionGranted: false,

    setActivePlugin: (pluginId) => {
      const spec = PLUGIN_SHELLS[pluginId];
      if (!spec) return;
      const { directories } = get();
      // Switching shells resets the machine: the new shell boots in
      // WAIT_BLUEPRINT with nothing loaded. The creation is restored
      // on Synth entry (restoreCreation), not on plugin switch.
      set({
        activePluginId: pluginId,
        seedHex: spec.defaultSeed,
        machine: createMachine(),
        iframeShellState: null,
        modules: { ship: null, scanner: null, hud: null },
        directories: gatedDirectories(
          directories,
          pluginId,
          spec.defaultSeed,
        ),
      });
    },

    setSeed: (seedHex) => {
      const clean = seedHex.trim().toUpperCase();
      if (!/^[0-9A-F]{1,16}$/.test(clean)) return;
      const { activePluginId, directories } = get();
      set({
        seedHex: clean,
        // Rebuild the directory only when the gate is met — no
        // directory while the demo is still there.
        directories: gatedDirectories(directories, activePluginId, clean),
      });
    },

    reseed: () => {
      const seed = randomHexSeed();
      const { activePluginId, directories } = get();
      set({
        seedHex: seed,
        directories: gatedDirectories(directories, activePluginId, seed),
      });
    },

    selectTile: (tileId) => {
      if (!/^tile_\d{4}$/.test(tileId)) return;
      set({ selectedTileId: tileId });
    },

    setEyeMode: (mode) => set({ eyeMode: mode }),

    setLocalAccessSessionGranted: (granted) =>
      set({ localAccessSessionGranted: granted }),

    setShellReady: (ready) => {
      const { machine, seedHex } = get();
      const stepped = stepMachine(
        { ...machine, shellReady: ready },
        seedHex,
      );
      set({ machine: stepped });
    },

    setIframeShellState: (reported) => {
      // Only a shell that manages its own state reports one — the
      // demo shell's state comes from the TS machine, never the iframe.
      const spec = PLUGIN_SHELLS[get().activePluginId];
      if (!spec?.managesOwnState) return;
      set({ iframeShellState: reported });
    },

    loadShellBlueprint: (blueprint, seedHex) => {
      const seed = seedHex ?? get().seedHex;
      const { machine, activePluginId, directories } = get();
      set({
        machine: loadBlueprintIntoMachine(machine, blueprint, seed),
        // The repo's defaults, so the eye + probe are always
        // visible — the builder overrides lanes as needed.
        modules: { ...DEFAULT_MODULES },
        seedHex: seed,
        directories: gatedDirectories(directories, activePluginId, seed),
      });
    },

    loadDefaultShellBlueprint: () => {
      get().loadShellBlueprint(DEFAULT_SHELL_BLUEPRINT);
    },

    attachModule: (type, module) => {
      set({ modules: { ...get().modules, [type]: module } });
    },

    detachModule: (type) => {
      set({ modules: { ...get().modules, [type]: null } });
    },

    stepShellMachine: () => {
      const { machine, seedHex } = get();
      set({ machine: stepMachine(machine, seedHex) });
    },

    runShellMachine: () => {
      const { machine, seedHex } = get();
      set({ machine: runMachine(machine, seedHex) });
    },

    resetShell: () => {
      set({
        machine: createMachine(),
        iframeShellState: null,
        modules: { ship: null, scanner: null, hud: null },
        directories: {},
      });
    },

    refreshDirectory: () => {
      const { activePluginId, seedHex, directories } = get();
      set({
        directories: gatedDirectories(directories, activePluginId, seedHex),
      });
    },

    loadCreationBuild: (build) => {
      const parsed = parseCreatorBuild(build);
      if (!parsed) return false;
      const { activePluginId, directories } = get();
      const { machine } = get();
      set({
        machine: loadBlueprintIntoMachine(
          machine,
          parsed.blueprint,
          parsed.seedHex,
        ),
        modules: { ...parsed.modules },
        seedHex: parsed.seedHex,
        directories: gatedDirectories(
          directories,
          activePluginId,
          parsed.seedHex,
        ),
      });
      return true;
    },

    restoreCreation: () => {
      const settings = useSettingsStore.getState().settings;
      if (settings.synthDemoReplaced !== true) return false;
      const build = parseCreatorBuild(settings.synthOwnBuild);
      if (!build) return false;
      return get().loadCreationBuild(build);
    },

    mountEmbodiment: (pluginId, emb) => {
      // THE mount gate: role only. Classification is never checked here —
      // a Sentinel mounts as the synth embodiment exactly like a Synth would.
      // The plugin id must be a registered shell; the embodiment itself is
      // not required to name Lucifer or any other specific plugin.
      const spec = PLUGIN_SHELLS[pluginId];
      if (!spec) return false;
      if (!canMountEmbodiment(emb)) return false;
      // The ping handshake, for the ACTIVE shell: the machine must be
      // READY with a NOOP GRANT receipt for the active shell — OR, for
      // a shell that manages its own state (Iteration 8), the shell's
      // own reported boot must be READY: its PING_TEST NOOP grant
      // lives inside the shell, and the TS machine never sees it.
      // A mount without the handshake is the old direct store call —
      // that is exactly what the port replaced.
      if (pluginId === get().activePluginId) {
        if (spec.managesOwnState) {
          if (get().iframeShellState?.boot !== 'READY') return false;
        } else {
          const { machine } = get();
          if (machine.boot !== 'READY') return false;
          if (!hasBootNoopGrant(machine)) return false;
        }
      }
      const mounts = { ...get().mounts, [pluginId]: emb as SynthEmbodiment };
      set({ mounts });
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
      set({ mounts });
      // Boot is a property of the shell+blueprint, NOT the mount:
      // unmounting leaves the machine (and its READY) alone. The
      // directory stays too — the gate is the permanent replacement,
      // unchanged by an unmount.
    },
  };
});

/** The embodiment mounted in the active shell, or null when it is empty. */
export function activeMount(state: SynthState): SynthEmbodiment | null {
  return state.mounts[state.activePluginId] ?? null;
}

/** The Voxel directory of the active shell, or null when the gate is not met. */
export function activeVoxelDirectory(
  state: SynthState,
): VoxelDirectory | null {
  return state.directories[state.activePluginId] ?? null;
}

/** The boot state of the active shell — the machine's boot, the only boot truth. */
export function activeBootState(state: SynthState): BootState {
  return state.machine.boot;
}

/** The build state of the active shell — the machine's build. */
export function activeBuildState(state: SynthState): BuildState {
  return state.machine.build;
}

/**
 * The Voxel Directory local-file access permission, as every
 * connecting segment sees it (Gary, 2026-11-12 ~10:45 PST) — ONE
 * source of truth in the synth plugin, not per-segment copies.
 *
 * `granted` is true when the access was granted either way it can
 * be granted: the REMEMBERED grant (settings.voxelLocalAccessDontAsk
 * — the user checked "do not show again" with an Allow, persisted)
 * OR the SESSION grant (localAccessSessionGranted — an Allow without
 * "do not show again", lapses when the Synth view unmounts). `remembered`
 * says which kind it is, so the UI can say so honestly.
 *
 * Subscribes to both flags, so revoking in Security (Settings >
 * Security) hides the Local tab again live, in every segment at
 * once.
 */
export function useVoxelLocalAccessGranted(): {
  granted: boolean;
  remembered: boolean;
} {
  const remembered =
    useSettingsStore((s) => s.settings.voxelLocalAccessDontAsk) === true;
  const session = useSynthStore((s) => s.localAccessSessionGranted);
  return { granted: remembered || session, remembered };
}

/**
 * The single revocation path for the Voxel Directory local-file
 * access (Settings > Security "Revoke", and anywhere else that
 * needs it): clears the remembered grant AND the session grant.
 * The panel and every other reader subscribe through
 * useVoxelLocalAccessGranted, so the Local tab hides again live.
 */
export async function revokeVoxelLocalAccess(): Promise<void> {
  await useSettingsStore
    .getState()
    .updateSetting('voxelLocalAccessDontAsk', false);
  useSynthStore.getState().setLocalAccessSessionGranted(false);
}

/**
 * The SYNTH side of a profile wipe (Gary, 2026-11-12 ~12:28 PST):
 * "your synth is bound to that profile and wiping that profile wipes
 * the synth back to demo and all retained knowledge right but youll
 * still have all the tings you setup connected to the ppaltform like
 * you never left like file and homunculi daemon etc, just chats and
 * driving agent memory gone."
 *
 * The wipe boundary:
 * - WIPED (profile-owned): the creation build (synthOwnBuild), the
 *   permanent-replacement flag (synthDemoReplaced — the synth goes
 *   BACK TO DEMO), the disclaimer choice + version, the Homunculus
 *   colour (the face is the synth's identity; the demo re-asks on
 *   entry), the shell machine, the modules, the mounts, the Voxel
 *   Directory, the session local-access grant, the active plugin /
 *   seed / tile / eye back to demo defaults.
 * - SURVIVES (platform-connected, "like you never left"): files
 *   (fileStore — untouched), homunculi (forgeStore — untouched),
 *   daemons (daemon settings — untouched), the REMEMBERED local-file
 *   access grant (voxelLocalAccessDontAsk — a platform setup, the
 *   user's file-access permission, like the files themselves; the
 *   directory it gates is gone, but the permission stays for the
 *   next creation — judgment call, flagged in the build report for
 *   Gary to correct), and every other platform setup.
 * - NOT wiped here: chats + driving-agent (LLMBuilder) memory — the
 *   profile wipe (LATER, when profiles land) clears those itself;
 *   this function is the synth side it calls. The profile system
 *   calls wipeProfileSynth() as part of wiping a profile, then
 *   clears AI chat memory + driving-agent memory.
 *
 * Profiles do not exist yet — there is no UI that calls this. It is
 * the seam: exported, tested, ready for the profile system to call.
 */
export async function wipeProfileSynth(): Promise<void> {
  await useSettingsStore.getState().updateSettings({
    synthOwnBuild: null,
    synthDemoReplaced: false,
    synthDisclaimerChoice: null,
    synthVersion: null,
    homunculusColor: null,
  });
  const store = useSynthStore.getState();
  store.resetShell();
  for (const pluginId of Object.keys(PLUGIN_SHELLS)) {
    store.unmountEmbodiment(pluginId);
  }
  store.setLocalAccessSessionGranted(false);
  useSynthStore.setState({
    activePluginId: DEFAULT_PLUGIN_ID,
    seedHex:
      PLUGIN_SHELLS[DEFAULT_PLUGIN_ID]?.defaultSeed ?? 'F1B49B1CB10D6FED',
    selectedTileId: CENTER_TILE_ID,
    eyeMode: 'AUTO',
  });
}
