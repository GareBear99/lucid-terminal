/**
 * SynthView — the Lucid synth view.
 *
 * Layout: the plugin's shell (vendored MATRIX SYNTH v67, an <iframe>) fills
 * the main area; the right inspector shows the shell state, the mounted
 * embodiment, and the Neural Synth categories.
 *
 * Generic by design: everything here is driven by the active plugin's shell
 * spec (PLUGIN_SHELLS). Lucifer is the first plugin using it. The view
 * never hardcodes Lucifer — the embodiment card renders whatever plugin is
 * active.
 *
 * Mount flow: the shell boots empty (WAIT_BLUEPRINT). Mounting an
 * embodiment posts {type:'lucid-synth-mount', mounted, seed} to the
 * shell iframe, which then renders the Neural Synth thinker in the eye.
 * The mount is classification-agnostic (role-gated in the store).
 *
 * The embodiment's live condition is best-effort from the plugin backend
 * (window.lucidAPI.lucid.getModelStatuses, same pattern as FixNetStatus).
 * If the API is unavailable the card says so instead of guessing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLUGIN_SHELLS,
  type BootState,
  type BuildState,
} from '../../types/synth';
// The vendored Iteration 8 defaults — bundled into the renderer at
// build time, so the inspector can load them straight into the shell
// (one click) instead of making the user hunt the files down with the
// picker. The shell's own Upload buttons stay for arbitrary files.
import octagonBlueprint from '../../../public/synth/iteration8/blueprint_octagon.json';
import shipModule from '../../../public/synth/iteration8/module_ship_default.json';
import scannerModule from '../../../public/synth/iteration8/module_scanner_default.json';
import hudModule from '../../../public/synth/iteration8/module_hud_default.json';
import {
  activeMount,
  activeVoxelDirectory,
  useSynthStore,
} from '../../stores/synthStore';
import { useWindowMaximized } from '../../hooks/useWindowMaximized';
import { synthScaleStyle } from './windowedScale';
import { WidgetLayer } from './widgets';
import { Tooltip } from '../Tooltip/Tooltip';
import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  isGuestProfile,
  useProfileStore,
} from '../../stores/profileStore';
import {
  HOMUNCULUS_REVEAL_MS,
  HOMUNCULUS_THEMES,
  HOMUNCULUS_UNFORMED_THEME,
  parseHomunculusColor,
  shouldShowHomunculusPicker,
  type HomunculusColor,
} from '../../lib/homunculusColor';
import {
  SYNTH_VERSION_LABELS,
  creatorBuildSummary,
  parseCreatorBuild,
  parseSynthDisclaimerChoice,
  parseSynthVersion,
  type CreatorBuild,
  type SynthDisclaimerChoice,
  type SynthVersion,
} from '../../lib/synthDisclaimer';
import {
  CreatorBuilder,
  CreatorBuilderErrorBoundary,
  BUILDER_STEPS_PER_TICK,
  BUILDER_TICK_MS,
} from './CreatorBuilder';
import { machineIsTerminal } from '../../lib/synthBoot';
import {
  VoxelDirectoryPanel,
  VoxelDirectoryPanelErrorBoundary,
} from './VoxelDirectoryPanel';
import {
  HomunculusColorPicker,
  HomunculusPickerErrorBoundary,
} from './HomunculusColorPicker';
import {
  SynthDemoDisclaimer,
  SynthDemoDisclaimerErrorBoundary,
} from './SynthDemoDisclaimer';

/**
 * The boot/build values a shell may report from its iframe. The
 * listener validates against these before the store records anything
 * — a stray message never writes garbage into the shell state.
 */
const IFRAME_BOOTS: readonly BootState[] = [
  'COLD',
  'POST',
  'PING_TEST',
  'READY',
  'SAFE_MODE',
  'WAIT_BLUEPRINT',
];
const IFRAME_BUILDS: readonly BuildState[] = [
  'IDLE',
  'PLANNED',
  'INTEGRITY',
  'MAPPING',
  'COMPLETE',
  'EMPTY_REPO_READY',
];

export function SynthView() {
  const activePluginId = useSynthStore((s) => s.activePluginId);
  const seedHex = useSynthStore((s) => s.seedHex);
  const selectedTileId = useSynthStore((s) => s.selectedTileId);
  const eyeMode = useSynthStore((s) => s.eyeMode);
  // The machine is the ONLY boot truth — boot/build come from it,
  // never from a derivation. machine.shell is null until a blueprint
  // is loaded; machine.shellReady is true once the iframe loads.
  const machine = useSynthStore((s) => s.machine);
  const bootState = machine.boot;
  const buildState = machine.build;
  const mounted = useSynthStore(activeMount);
  const directory = useSynthStore(activeVoxelDirectory);
  const mountPlugin = useSynthStore((s) => s.mountPlugin);
  const unmountEmbodiment = useSynthStore((s) => s.unmountEmbodiment);
  const reseed = useSynthStore((s) => s.reseed);
  const loadDefaultShellBlueprint = useSynthStore(
    (s) => s.loadDefaultShellBlueprint,
  );
  const refreshDirectory = useSynthStore((s) => s.refreshDirectory);

  // Guest demo-lock (Gary, 2026-11-12 ~16:41 PST): "allow guests in
  // the profiles for it to be locked to demo mode in synth" — while
  // the active profile is a guest, the synth stays in demo mode: no
  // builder, no permanent demo replacement, no demo wipe, no owner
  // creation loaded or shown. The shell picker still offers both
  // shells, so the guest compares the demo synth vs Iteration 8 — the
  // lock is about not building or replacing, not about hiding
  // Iteration 8. The saved guest profile is the test bed for that
  // comparison.
  const activeProfile = useProfileStore((s) =>
    s.profiles.find((p) => p.id === s.activeProfileId),
  );
  const demoLocked = isGuestProfile(activeProfile);
  // The Voxel Directory belongs to the owner's creation — a guest
  // never sees it (its directory is always null, even when the
  // store holds the owner's rebuilt directory).
  const displayDirectory = demoLocked ? null : directory;

  const spec = PLUGIN_SHELLS[activePluginId];
  const embodiment = spec?.embodiment;
  // The iframe shell's own reported state — only a shell that manages
  // its own state (Iteration 8) posts one.
  const iframeShellState = useSynthStore((s) => s.iframeShellState);
  const setActivePlugin = useSynthStore((s) => s.setActivePlugin);

  // What the inspector shows for boot/build: a shell that manages its
  // own state reports from the iframe — the TS machine is not the
  // shell and never sees its boot. The demo shell reads the machine.
  const displayBoot = spec?.managesOwnState
    ? (iframeShellState?.boot ?? 'WAIT_BLUEPRINT')
    : bootState;
  const displayBuild = spec?.managesOwnState
    ? (iframeShellState?.build ?? 'IDLE')
    : buildState;

  // The seed the inspector shows: the SESSION's loaded creation, never
  // the store's seedHex as-is — the same rule as the widget layer
  // (src/components/Synth/widgets/WidgetLayer.tsx). The store
  // initializes to the shell's default seed, and the Lucifer default
  // IS the owner's creation seed, so rendering seedHex whenever would
  // show the owner's seed to a session with nothing loaded (the guest
  // leak, 2026-11-12 ~20:34 PST: the inspector's SHELL — LUCIFER
  // block showed seed: F1B49B1CB10D6FED as guest). A demo-locked
  // session gets null whatever is loaded; a shell that manages its own
  // state reports its own seed once a blueprint is loaded (shellId);
  // otherwise a seed exists only once the TS machine has a shell
  // loaded. Null renders "no creation loaded", the SeedWidget
  // convention — never the persisted store seed.
  const sessionSeedHex: string | null =
    demoLocked
      ? null
      : spec?.managesOwnState
        ? iframeShellState?.shellId
          ? (iframeShellState.seed ?? null)
          : null
        : machine.shell
          ? seedHex
          : null;

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Post the mount state into the shell iframe (bridge, Phase 1).
  const postMount = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: 'lucid-synth-mount',
        mounted: !!mounted,
        seed: seedHex,
      },
      '*',
    );
  }, [mounted, seedHex]);

  // Demo progress wipe — Gary (2026-11-08 ~00:46 PST): leaving the demo to
  // build your own wipes the demo progress; the build starts fresh, demo
  // progress does NOT carry over. The wipe is a postMessage to the shell
  // iframe ({type:'lucid-synth-wipe-demo'}); the shell clears its persisted
  // demo state (world state, restore flag, survey save, bookmarks) and
  // reloads itself fresh. The parent re-posts the mount on iframe load,
  // so the fresh shell mounts the same way. If the shell hasn't loaded
  // yet the wipe would be lost (no listener registered) — it is deferred
  // to the iframe load and posted exactly once, so a wipe can never
  // re-fire on the reload the wipe itself triggers.
  const iframeLoadedRef = useRef(false);
  // Whether the current shell iframe has loaded (the one-click
  // default load posts into it — posting before load loses the message).
  const [iframeLoaded, setIframeLoaded] = useState(false);
  useEffect(() => {
    setIframeLoaded(false);
  }, [activePluginId]);
  const pendingDemoWipeRef = useRef(false);
  const postDemoWipe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'lucid-synth-wipe-demo' }, '*');
  }, []);
  const wipeDemoProgress = useCallback(() => {
    if (iframeLoadedRef.current) {
      postDemoWipe();
    } else {
      pendingDemoWipeRef.current = true;
    }
  }, [postDemoWipe]);
  const handleIframeLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    setIframeLoaded(true);
    if (pendingDemoWipeRef.current) {
      pendingDemoWipeRef.current = false;
      postDemoWipe();
    }
    // The shell iframe loaded — the machine needs this to leave
    // WAIT_BLUEPRINT (boot is a property of the shell+blueprint).
    useSynthStore.getState().setShellReady(true);
    postMount();
  }, [postDemoWipe, postMount]);

  useEffect(() => {
    postMount();
  }, [postMount]);

  // Iteration 8 reports its own boot/build from the iframe (it
  // manages its own state). The store ignores reports unless the
  // active plugin is such a shell.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as {
        type?: unknown;
        boot?: unknown;
        build?: unknown;
        shellId?: unknown;
        seed?: unknown;
        routeTiles?: unknown;
        mappedCount?: unknown;
        receipts?: unknown;
      } | null;
      if (!d || typeof d !== 'object') return;
      if (d.type !== 'iteration8-shell-state') return;
      if (
        typeof d.boot !== 'string' ||
        typeof d.build !== 'string' ||
        !(IFRAME_BOOTS as readonly string[]).includes(d.boot) ||
        !(IFRAME_BUILDS as readonly string[]).includes(d.build)
      ) {
        return;
      }
      useSynthStore.getState().setIframeShellState({
        boot: d.boot as BootState,
        build: d.build as BuildState,
        shellId: typeof d.shellId === 'string' ? d.shellId : null,
        seed: typeof d.seed === 'string' ? d.seed : null,
        routeTiles: typeof d.routeTiles === 'number' ? d.routeTiles : 0,
        mappedCount: typeof d.mappedCount === 'number' ? d.mappedCount : 0,
        receipts: typeof d.receipts === 'number' ? d.receipts : 0,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Post a message into the shell iframe (Iteration 8's Lucid bridge).
  const postToShell = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  // Load the vendored defaults straight into the shell — the shell's
  // own Upload buttons stay for arbitrary files, but the defaults are
  // one click (they live in the app bundle, not on a path the file
  // picker can reach).
  const loadIteration8Defaults = useCallback(() => {
    postToShell({
      type: 'iteration8-load-blueprint',
      blueprint: octagonBlueprint,
    });
    postToShell({ type: 'iteration8-load-module', module: shipModule });
    postToShell({ type: 'iteration8-load-module', module: scannerModule });
    postToShell({ type: 'iteration8-load-module', module: hudModule });
  }, [postToShell]);

  // Restore the saved creation on entry — the pickup after the
  // profile step, on the way into Lucid (the creation is a profile
  // thing; profiles land later, and until then the implicit
  // 'default' profile's creation is restored here). Once only: the
  // restore loads the creation's blueprint + modules + seed into
  // the machine. When there is nothing to restore (demo still
  // there, or no creation saved) the builder shows instead.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // A guest never loads the owner's creation — its synth is
    // demo-only. Without this the guest would see (and the machine
    // would run) the owner's build.
    if (demoLocked) return;
    useSynthStore.getState().restoreCreation();
  }, [demoLocked]);

  // Drive the shell machine — ONE driver, for both the builder
  // path and the demo path (the view owns the shell, so the view
  // steps its machine). 120 steps per 50 ms tick, whenever a shell
  // is loaded and the machine is not terminal; otherwise it
  // no-ops. The builder only loads the blueprint and reads live
  // progress — it runs no interval of its own.
  useEffect(() => {
    const id = window.setInterval(() => {
      const state = useSynthStore.getState();
      if (!state.machine.shell) return;
      if (machineIsTerminal(state.machine)) return;
      for (let i = 0; i < BUILDER_STEPS_PER_TICK; i++) {
        useSynthStore.getState().stepShellMachine();
      }
    }, BUILDER_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // The Voxel Directory session grant lapses when the Synth view
  // unmounts: the next entry asks again, unless "do not show
  // again" was checked (the remembered grant survives).
  useEffect(() => {
    return () => {
      useSynthStore.getState().setLocalAccessSessionGranted(false);
    };
  }, []);

  // Live plugin-backend status (best-effort; the card says so if unavailable).
  const [modelStatuses, setModelStatuses] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [statusAvailable, setStatusAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchStatuses = async () => {
      try {
        const api = (window as unknown as {
          lucidAPI?: { lucid?: { getModelStatuses?: () => Promise<unknown> } };
        }).lucidAPI?.lucid;
        if (!api || typeof api.getModelStatuses !== 'function') {
          if (!cancelled) setStatusAvailable(false);
          return;
        }
        const result = await api.getModelStatuses();
        if (!cancelled && result && typeof result === 'object') {
          setModelStatuses(result as Record<string, boolean>);
        }
      } catch {
        // Best-effort: a failed fetch leaves the last known status in place.
      }
    };
    fetchStatuses();
    const timer = setInterval(fetchStatuses, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const anyBackendUp =
    modelStatuses !== null &&
    Object.values(modelStatuses).some((v) => v === true);
  const condition = !mounted
    ? 'UNMOUNTED'
    : !statusAvailable
      ? 'STATUS UNAVAILABLE'
      : modelStatuses === null
        ? 'DORMANT'
        : anyBackendUp
          ? 'AWAKE'
          : 'DORMANT';
  // A shell that manages its own state has no plugin backend to
  // report — its condition is just mounted or not.
  const displayCondition = spec?.managesOwnState
    ? mounted
      ? 'MOUNTED'
      : 'UNMOUNTED'
    : condition;

  // While the app is windowed the whole synth plugin renders 25%
  // smaller (75%); maximized it renders at full size. The scaling
  // wrapper lays out at 100%/0.75 so the scaled content exactly
  // fills the pane — shell, inspector, and mount button all scale
  // together and stay interactive.
  const isMaximized = useWindowMaximized();

  // Homunculus colour — purple or pink, chosen on first entry. Pink is
  // the face's current variation; purple is the new alternative. The
  // stored choice themes the face everywhere (SentinelFace reads the
  // same setting); no choice yet shows the picker over the view and
  // the face is unformed — black, with no eyes.
  // The picker never blocks the view: it is wrapped in an error
  // boundary, and a picker crash leaves the face unformed. A failed
  // persist still hides the picker for this entry — the choice is
  // simply asked again on the next entry.
  const storedHomunculusColor = useSettingsStore(
    (s) => s.settings?.homunculusColor,
  );
  const chosenHomunculusColor = parseHomunculusColor(storedHomunculusColor);
  const homunculusTheme = chosenHomunculusColor
    ? HOMUNCULUS_THEMES[chosenHomunculusColor]
    : HOMUNCULUS_UNFORMED_THEME;
  const [homunculusPickerDone, setHomunculusPickerDone] = useState(false);
  const showHomunculusPicker =
    shouldShowHomunculusPicker(storedHomunculusColor) &&
    !homunculusPickerDone;
  // The disclaimer waits for the wake-up reveal to finish when a
  // colour was just chosen; on a later entry (colour already stored)
  // there is no reveal to wait for. The timer lives in a ref and is
  // cleared on unmount, so it can never fire into a dead view.
  const disclaimerTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(disclaimerTimerRef.current), []);
  const [synthDisclaimerDelayDone, setSynthDisclaimerDelayDone] = useState(
    () => chosenHomunculusColor !== null,
  );
  const chooseHomunculusColor = useCallback((color: HomunculusColor) => {
    void useSettingsStore.getState().updateSetting('homunculusColor', color);
    setHomunculusPickerDone(true);
    // The disclaimer follows the wake-up reveal: let the eye fade in
    // and the line draw before asking.
    window.clearTimeout(disclaimerTimerRef.current);
    disclaimerTimerRef.current = window.setTimeout(
      () => setSynthDisclaimerDelayDone(true),
      HOMUNCULUS_REVEAL_MS,
    );
  }, []);

  // Demo disclaimer — after the colour choice. Gary (2026-11-05): the
  // Lucid synth is a demo, the demo of what it can become, until you
  // build your own — and you build your own with Iteration 8, the
  // creator builder. Gary (2026-11-08 ~00:20 PST): it should know in
  // most cases. The prompt shows on every entry (SynthView mounts
  // fresh each time), but when a valid choice is stored it shows the
  // known mode with a quick confirm/switch — it only asks the full
  // "which mode?" question when it genuinely doesn't know (first
  // time, no saved preference, missing/ambiguous). In most cases it
  // knows, so going in is frictionless.
  const storedSynthDisclaimerChoice = useSettingsStore(
    (s) => s.settings?.synthDisclaimerChoice,
  );
  const knownSynthDisclaimerChoice = parseSynthDisclaimerChoice(
    storedSynthDisclaimerChoice,
  );
  const [synthDisclaimerDone, setSynthDisclaimerDone] = useState(false);
  // The disclaimer never shows once the demo was permanently
  // replaced — the creation is the mode now, there is nothing to
  // choose between.
  const demoReplaced = useSettingsStore(
    (s) => s.settings?.synthDemoReplaced,
  );
  const showSynthDisclaimer =
    !synthDisclaimerDone &&
    !demoReplaced &&
    !demoLocked &&
    chosenHomunculusColor !== null &&
    synthDisclaimerDelayDone;
  const chooseSynthDisclaimer = useCallback(
    (choice: SynthDisclaimerChoice, version?: SynthVersion) => {
      const store = useSettingsStore.getState();
      // Leaving the demo to build your own wipes the demo progress
      // (Gary, 2026-11-08 ~00:46 PST) — the build starts fresh; demo
      // progress does not carry over. Entering build from any non-build
      // state wipes: demo ('explore'), or no choice yet (the demo is the
      // implicit mode before the first answer). Re-affirming build does
      // not wipe — there is no demo progress to carry over.
      const prevChoice = parseSynthDisclaimerChoice(
        store.settings?.synthDisclaimerChoice,
      );
      if (choice === 'build' && prevChoice !== 'build') {
        wipeDemoProgress();
      }
      void store.updateSetting('synthDisclaimerChoice', choice);
      // Build only: record the synth version from the drop-down.
      // Only exact known values are stored; anything else leaves the
      // version unset (Iteration 8 is the fallback).
      if (choice === 'build') {
        const parsed = parseSynthVersion(version);
        if (parsed !== null) {
          void store.updateSetting('synthVersion', parsed);
        }
      }
      setSynthDisclaimerDone(true);
    },
    [wipeDemoProgress],
  );
  // "Create Iteration 8 and load it as your own build" / "Continue in
  // the demo" is a resume, not a mode choice (Gary, 2026-11-08 ~00:46
  // PST: continue building is obviously not iteration 8; ~02:01 PST:
  // continue building is the wrong thing to say — say create Iteration
  // 8 and load it as your own build). It dismisses the prompt and
  // resumes where you left off — it does not re-assert the choice, does
  // not touch the version, and does not wipe anything.
  const continueSynthDisclaimer = useCallback(() => {
    setSynthDisclaimerDone(true);
  }, []);
  // The version the build starts from — the drop-down choice, or
  // Iteration 8 when nothing was recorded (choice predates the
  // drop-down, or explore was chosen).
  const storedSynthVersion = useSettingsStore(
    (s) => s.settings?.synthVersion,
  );
  const parsedStoredVersion = parseSynthVersion(storedSynthVersion);
  const buildVersionLabel =
    parsedStoredVersion !== null
      ? SYNTH_VERSION_LABELS[parsedStoredVersion]
      : 'Iteration 8';

  // The saved own build (Iteration 8) — the creation: blueprint +
  // modules + version + seed + colour + profile, from the creator
  // builder. Null = no own build created yet, so the builder shows
  // instead of a summary. Old builds (version+seed+colour only)
  // do NOT parse — the make-believe configurator's builds are not
  // carried forward.
  const storedOwnBuild = useSettingsStore(
    (s) => s.settings?.synthOwnBuild,
  );
  const ownBuild = parseCreatorBuild(storedOwnBuild);
  // The builder is open when the user is in build mode and has no
  // own build yet, or when they tap "Edit build" on a saved one.
  // Creating a build closes it (the summary takes its place).
  const [builderOpen, setBuilderOpen] = useState(false);
  const showBuilder =
    storedSynthDisclaimerChoice === 'build' &&
    (builderOpen || ownBuild === null);
  // Phase 3 — builder → mount wiring, Iteration 8 proper: the
  // builder already ran the machine to EMPTY_REPO_READY and handed
  // back the finished creation. The parent persists it and flips
  // the demo PERMANENTLY replaced — synthDemoReplaced FIRST, so
  // the directory gate is met — then rebuilds the directory and
  // mounts the embodiment (the mount's ping handshake is the
  // machine's NOOP grant, already earned by the build). The
  // builder set the seed when it loaded the blueprint; there is
  // nothing left to set here.
  const handleCreateBuild = useCallback(
    (build: CreatorBuild) => {
      // Defense in depth: the builder never renders for a guest, but
      // a guest must never be able to persist a creation or flip the
      // permanent-replacement flag — that would overwrite the
      // owner's creation. The mount call is left alone (the mount
      // coordinator owns mount logic); the guest simply never
      // reaches it.
      if (demoLocked) return;
      const store = useSettingsStore.getState();
      void store.updateSettings({
        synthDemoReplaced: true,
        synthOwnBuild: build,
        synthDisclaimerChoice: 'build',
        synthVersion: build.version,
        homunculusColor: build.color,
      });
      refreshDirectory();
      mountPlugin(activePluginId);
      setBuilderOpen(false);
    },
    [activePluginId, mountPlugin, refreshDirectory, demoLocked],
  );

  return (
    // No background here: the main screen is always splashscreen
    // misty black (Gary, 2026-11-07), so the App root's mist shows
    // through — the shell keeps its own dark canvas.
    <div className="relative flex-1 overflow-hidden">
      <div className="flex" style={synthScaleStyle(isMaximized)}>
      {/* Shell — the vendored v67 MATRIX SYNTH, with the thinker in the eye once mounted */}
      <div className="flex-1 overflow-hidden relative">
        <iframe
          ref={iframeRef}
          title="Lucid synth shell"
          src={spec?.shellSrc ?? './synth/matrix-synth-v67.html'}
          sandbox="allow-scripts"
          onLoad={handleIframeLoad}
          className="w-full h-full border-0 bg-black"
        />
        {/* Lucid's status chip — hidden for a shell that manages its
            own state: the shell's own HUD + validator strip show its
            state, and the chip would sit on top of its topbar. */}
        {!spec?.managesOwnState && (
          <div
            className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[11px] font-mono pointer-events-none"
            style={{ color: homunculusTheme.bright }}
          >
            boot={displayBoot} · build={displayBuild} · eye={eyeMode} · tile={selectedTileId}
            {mounted ? ` · ${mounted.name} mounted` : ' · shell empty'}
          </div>
        )}
        {/* Demo widgets — only after a permanent creation build (the widget gate, same as the Voxel Directory). */}
        <WidgetLayer />
      </div>

      {/* Inspector */}
      <div className="w-[300px] shrink-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col gap-3 p-3 text-sm">
        {/* Voice explanation (Gary, 2026-11-07 ~02:54 PST): plugins
            have voice recordings all throughout. */}
        <div className="flex items-center gap-2">
          <PluginVoiceButton
            voiceId="synth-main"
            title="Synth"
            src={pluginVoiceSrc('synth-main')}
          />
        </div>
        {/* Shell state */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Shell — {spec?.name ?? activePluginId}
          </h2>
          {/* Shell picker — one button per registered shell
              (PLUGIN_SHELLS). The demo (Lucifer) stays the default;
              Iteration 8 sits alongside it, selectable. */}
          <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Shell">
            {Object.values(PLUGIN_SHELLS).map((s) => (
              <button
                key={s.pluginId}
                onClick={() => setActivePlugin(s.pluginId)}
                aria-pressed={s.pluginId === activePluginId}
                className={`btn text-xs ${s.pluginId === activePluginId ? 'btn-primary' : 'btn-secondary'}`}
                title={s.name}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="font-mono text-xs space-y-1 text-[var(--text-primary)]">
            <div>boot: <span style={{ color: homunculusTheme.bright }}>{displayBoot}</span></div>
            <div>build: {displayBuild}</div>
            <div>seed: {sessionSeedHex ?? 'no creation loaded'}</div>
            <div>tile: {selectedTileId} (center)</div>
            <div>eye: {eyeMode}</div>
            <div>
              blueprint:{' '}
              {spec?.managesOwnState
                ? iframeShellState?.shellId
                  ? `${iframeShellState.shellId} · ${iframeShellState.routeTiles} route tiles · ${iframeShellState.mappedCount} mapped`
                  : 'none — load one in the shell (Upload Blueprint JSON, or the default octagon below)'
                : machine.shell
                  ? `${machine.shell.shellId} · ${machine.shell.pivotDirs.length} pivots · ${machine.shell.routeTiles.length} route tiles`
                  : 'none — load one in the shell (Upload Blueprint JSON)'}
            </div>
            {machine.fallbackUsed && (
              <div>
                fallback: default octagon loaded
                {machine.fallbackReason
                  ? ` (${machine.fallbackReason})`
                  : ''}
              </div>
            )}
            {displayBoot === 'SAFE_MODE' && (
              <div>
                SAFE_MODE
                {!spec?.managesOwnState && machine.safeModeReason
                  ? ` — ${machine.safeModeReason}`
                  : ''}
              </div>
            )}
            {/* "Build my own" (Iteration 8, the creator builder) —
                the choice's landing line: the saved own build when
                one exists, else the version the builder below it
                starts from. The "(coming soon)" is gone: the builder
                is real (Phase 2), and creating a build mounts it
                (Phase 3). Hidden for guests — a guest never sees the
                owner's build. */}
            {storedSynthDisclaimerChoice === 'build' &&
              !spec?.managesOwnState &&
              !demoLocked && (
              <div>
                {ownBuild ? (
                  <>
                    build: your own — {creatorBuildSummary(ownBuild)}
                    {mounted ? ' · mounted' : ' · not mounted'}
                  </>
                ) : (
                  <>
                    build: your own — {buildVersionLabel}, the creator
                    builder
                  </>
                )}
              </div>
            )}
            {demoLocked && (
              <div>Guest — synth locked to demo mode.</div>
            )}
          </div>
          {/* The thinker's seed is the demo shell's — a shell that
              manages its own state has its own seed box in the shell. */}
          {!spec?.managesOwnState && (
            <Tooltip content="Randomize the Neural Synth seed">
              <button
                onClick={reseed}
                className="btn btn-secondary mt-2 text-xs"
              >
                Reseed thinker
              </button>
            </Tooltip>
          )}
          {/* Demo users can boot without the builder: load the
              default octagon and run the machine on it. For a shell
              that manages its own state (Iteration 8) this loads the
              vendored defaults straight into the shell instead — the
              TS machine is not the shell. */}
          {(spec?.managesOwnState || !machine.shell) && (
            <Tooltip
              content={
                spec?.managesOwnState
                  ? 'Load the default octagon blueprint + modules into the shell'
                  : 'Load the default octagon blueprint and boot the shell'
              }
            >
              <button
                onClick={
                  spec?.managesOwnState
                    ? loadIteration8Defaults
                    : loadDefaultShellBlueprint
                }
                disabled={spec?.managesOwnState ? !iframeLoaded : false}
                data-testid="load-default-octagon"
                className="btn btn-secondary mt-2 ml-2 text-xs disabled:opacity-40"
              >
                Load the default octagon
              </button>
            </Tooltip>
          )}
        </section>

        {/* Embodiment — generic: renders whichever plugin is active */}
        <section className="border-t border-[var(--border)] pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Embodiment — plugin synth
          </h2>
          {embodiment ? (
            <>
              <div className="font-mono text-xs space-y-1 text-[var(--text-primary)]">
                <div>
                  {embodiment.name}{' '}
                  <span className="text-[var(--text-muted)]">
                    ({embodiment.classification})
                  </span>
                </div>
                <div>
                  role: {embodiment.role} · plugin: {embodiment.plugin}
                </div>
                <div>
                  condition:{' '}
                  <span
                    style={
                      displayCondition === 'AWAKE'
                        ? { color: homunculusTheme.bright }
                        : undefined
                    }
                  >
                    {displayCondition}
                  </span>
                </div>
              </div>
              {mounted ? (
                <>
                  {!spec?.managesOwnState && modelStatuses && (
                    <div className="font-mono text-xs mt-2 space-y-0.5 text-[var(--text-secondary)]">
                      {Object.entries(modelStatuses).map(([model, up]) => (
                        <div key={model}>
                          {model}: {up ? 'available' : 'unavailable'}
                        </div>
                      ))}
                    </div>
                  )}
                  {!spec?.managesOwnState && modelStatuses === null && statusAvailable && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Checking plugin backend…
                    </p>
                  )}
                  {!spec?.managesOwnState && !statusAvailable && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Plugin backend status unavailable in this build.
                    </p>
                  )}
                  <Tooltip content={`Unmount ${embodiment.name}`}>
                    <button
                      onClick={() => unmountEmbodiment(activePluginId)}
                      className="btn btn-secondary mt-2 text-xs"
                    >
                      Unmount {embodiment.name}
                    </button>
                  </Tooltip>
                </>
              ) : (
                <>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {spec?.managesOwnState ? (
                      <>
                        The shell is empty — no blueprint loaded. Load
                        the default octagon or upload a blueprint in
                        the shell; mount{' '}
                        {embodiment?.name ?? 'the embodiment'} once the
                        shell boots to READY.
                      </>
                    ) : (
                      <>
                        The shell is empty — the synth&apos;s neural
                        capabilities are out of action: no thinker in the
                        eye, no neural action through the synth. Mount the
                        embodiment to put them back in action. The brain
                        keeps working headless — inference can still
                        continue via daemons on the underlying brain.
                      </>
                    )}
                  </p>
                  <Tooltip content={`Mount ${embodiment.name}`}>
                    <button
                      onClick={() => mountPlugin(activePluginId)}
                      disabled={displayBoot !== 'READY'}
                      title={
                        displayBoot !== 'READY'
                          ? `The shell must boot to READY first (now ${displayBoot})`
                          : undefined
                      }
                      className="btn btn-primary mt-2 text-xs disabled:opacity-40"
                    >
                      Mount {embodiment.name}
                    </button>
                  </Tooltip>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              No embodiment registered for this plugin.
            </p>
          )}
        </section>

        {/* Voxel Directory (Iteration 8) — ON THE MAIN PANEL, where
            mount is (Gary, 2026-11-12 ~12:13 PST): alongside mount,
            in the main panel, NOT a separate overlay. The panel is
            clear blurry darkened glass (Gary, 2026-11-12 ~10:20
            PST). THE DIRECTORY IS GATED (Gary, 2026-11-12 ~12:23
            PST): it only exists AFTER the demo has been permanently
            replaced by the creation one. While the demo is still
            there the section says so instead of showing a directory.
            Reference: protosynth Iteration11 Voxel_Directory.html —
            "Voxel Icon view is the directory front". */}
        <section className="border-t border-[var(--border)] pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Voxel Directory — {spec?.name ?? activePluginId}
          </h2>
          {displayDirectory ? (
            <VoxelDirectoryPanelErrorBoundary>
              <VoxelDirectoryPanel
                directory={displayDirectory}
                pluginName={spec?.name ?? activePluginId}
              />
            </VoxelDirectoryPanelErrorBoundary>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              {spec?.managesOwnState ? (
                <>
                  {spec?.name ?? activePluginId} is a blueprint shell —
                  it has no Voxel Directory; its build lives in the
                  shell itself.
                </>
              ) : demoLocked ? (
                <>
                  Guests stay in demo mode — the Voxel Directory
                  belongs to the owner&apos;s creation. Switch shells
                  above to compare the demo synth with Iteration 8.
                </>
              ) : (
                <>
                  The Voxel Directory arrives when your creation
                  permanently replaces the demo — build your own with
                  Iteration 8.
                </>
              )}
            </p>
          )}
        </section>

        {/* Creator builder (Iteration 8, Phase 2) — "build my own"
            opens a REAL builder here, in the inspector. No own build
            yet: the builder. Own build saved: the summary + Edit.
            Guests never see it: their synth is demo-locked, no
            building, no permanent demo replacement. */}
        {storedSynthDisclaimerChoice === 'build' &&
          !spec?.managesOwnState &&
          !demoLocked && (
          <section className="border-t border-[var(--border)] pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
              Your own build — {buildVersionLabel}
            </h2>
            {showBuilder ? (
              <CreatorBuilderErrorBoundary>
                <CreatorBuilder
                  version={
                    parsedStoredVersion ?? 'iteration-8'
                  }
                  initialSeed={ownBuild?.seedHex ?? seedHex}
                  initialColor={chosenHomunculusColor}
                  initialBlueprint={ownBuild?.blueprint ?? null}
                  initialModules={ownBuild?.modules ?? null}
                  onCreate={handleCreateBuild}
                  onCancel={
                    ownBuild ? () => setBuilderOpen(false) : undefined
                  }
                />
              </CreatorBuilderErrorBoundary>
            ) : (
              ownBuild && (
                <>
                  <p className="text-xs text-[var(--text-primary)]">
                    {creatorBuildSummary(ownBuild)}
                    {mounted ? ' · mounted' : ' · not mounted'}
                  </p>
                  <button
                    onClick={() => setBuilderOpen(true)}
                    className="btn btn-secondary mt-2 text-xs"
                  >
                    Edit build
                  </button>
                </>
              )
            )}
          </section>
        )}

      </div>
      </div>
      {/* First entry, no colour chosen yet: the Homunculus colour
          picker. It overlays the view and never blocks it — a picker
          crash renders nothing (error boundary) and the face stays
          unformed (black, no eyes). */}
      {showHomunculusPicker && (
        <HomunculusPickerErrorBoundary>
          <HomunculusColorPicker onChoose={chooseHomunculusColor} />
        </HomunculusPickerErrorBoundary>
      )}
      {/* After the colour choice: the demo disclaimer. It shows on
          every entry — with the known mode and a quick confirm/switch
          when a choice is stored, and the full question only when it
          genuinely doesn't know — and never blocks the view (a
          disclaimer crash renders nothing, error boundary). */}
      {showSynthDisclaimer && (
        <SynthDemoDisclaimerErrorBoundary>
          <SynthDemoDisclaimer
            onChoose={chooseSynthDisclaimer}
            onContinue={continueSynthDisclaimer}
            knownChoice={knownSynthDisclaimerChoice}
            knownVersionLabel={buildVersionLabel}
          />
        </SynthDemoDisclaimerErrorBoundary>
      )}
    </div>
  );
}
