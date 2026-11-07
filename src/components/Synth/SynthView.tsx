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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NEURAL_CATEGORIES,
  PLUGIN_SHELLS,
  buildNeuralScene,
} from '../../types/synth';
import {
  activeMount,
  useSynthStore,
} from '../../stores/synthStore';
import { useWindowMaximized } from '../../hooks/useWindowMaximized';
import { synthScaleStyle } from './windowedScale';
import { Tooltip } from '../Tooltip/Tooltip';
import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';
import { useSettingsStore } from '../../stores/settingsStore';
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
  parseSynthVersion,
  shouldShowSynthDisclaimer,
  type SynthDisclaimerChoice,
  type SynthVersion,
} from '../../lib/synthDisclaimer';
import {
  HomunculusColorPicker,
  HomunculusPickerErrorBoundary,
} from './HomunculusColorPicker';
import {
  SynthDemoDisclaimer,
  SynthDemoDisclaimerErrorBoundary,
} from './SynthDemoDisclaimer';

export function SynthView() {
  const activePluginId = useSynthStore((s) => s.activePluginId);
  const seedHex = useSynthStore((s) => s.seedHex);
  const selectedTileId = useSynthStore((s) => s.selectedTileId);
  const eyeMode = useSynthStore((s) => s.eyeMode);
  const shellLoaded = useSynthStore((s) => s.shellLoaded);
  const bootState = useSynthStore((s) => s.bootState);
  const mounted = useSynthStore(activeMount);
  const mountPlugin = useSynthStore((s) => s.mountPlugin);
  const unmountEmbodiment = useSynthStore((s) => s.unmountEmbodiment);
  const reseed = useSynthStore((s) => s.reseed);

  const spec = PLUGIN_SHELLS[activePluginId];
  const embodiment = spec?.embodiment;
  const scene = useMemo(() => buildNeuralScene(seedHex), [seedHex]);

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

  useEffect(() => {
    postMount();
  }, [postMount]);

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
  // creator builder. The disclaimer asks once: commence building your
  // own (Iteration 8), or explore the demo still? A stored choice,
  // either one, means it never asks again.
  const storedSynthDisclaimerChoice = useSettingsStore(
    (s) => s.settings?.synthDisclaimerChoice,
  );
  const [synthDisclaimerDone, setSynthDisclaimerDone] = useState(false);
  const showSynthDisclaimer =
    shouldShowSynthDisclaimer(storedSynthDisclaimerChoice) &&
    !synthDisclaimerDone &&
    chosenHomunculusColor !== null &&
    synthDisclaimerDelayDone;
  const chooseSynthDisclaimer = useCallback(
    (choice: SynthDisclaimerChoice, version?: SynthVersion) => {
      const store = useSettingsStore.getState();
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
    [],
  );
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
          onLoad={postMount}
          className="w-full h-full border-0 bg-black"
        />
        <div
          className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[11px] font-mono pointer-events-none"
          style={{ color: homunculusTheme.bright }}
        >
          boot={bootState} · eye={eyeMode} · tile={selectedTileId}
          {mounted ? ` · ${mounted.name} mounted` : ' · shell empty'}
        </div>
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
          <div className="font-mono text-xs space-y-1 text-[var(--text-primary)]">
            <div>boot: <span style={{ color: homunculusTheme.bright }}>{bootState}</span></div>
            <div>seed: {seedHex}</div>
            <div>tile: {selectedTileId} (center)</div>
            <div>eye: {eyeMode}</div>
            <div>blueprint: {shellLoaded ? 'loaded' : 'none — load one in the shell (Upload Blueprint JSON)'}</div>
            {/* "Build my own" (Iteration 8, the creator builder) — the
                choice and the drop-down version are recorded;
                Iteration 8 itself is not built yet, so this names it
                rather than faking a builder. */}
            {storedSynthDisclaimerChoice === 'build' && (
              <div>build: your own — {buildVersionLabel}, the creator builder (coming soon)</div>
            )}
          </div>
          <Tooltip content="Randomize the Neural Synth seed">
            <button
              onClick={reseed}
              className="btn btn-secondary mt-2 text-xs"
            >
              Reseed thinker
            </button>
          </Tooltip>
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
                      condition === 'AWAKE'
                        ? { color: homunculusTheme.bright }
                        : undefined
                    }
                  >
                    {condition}
                  </span>
                </div>
              </div>
              {mounted ? (
                <>
                  {modelStatuses && (
                    <div className="font-mono text-xs mt-2 space-y-0.5 text-[var(--text-secondary)]">
                      {Object.entries(modelStatuses).map(([model, up]) => (
                        <div key={model}>
                          {model}: {up ? 'available' : 'unavailable'}
                        </div>
                      ))}
                    </div>
                  )}
                  {modelStatuses === null && statusAvailable && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Checking plugin backend…
                    </p>
                  )}
                  {!statusAvailable && (
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
                    The shell is empty — no synth mounted. Mount the
                    embodiment to wake the synth: the thinker appears in the
                    eye and the Sentinel sits at the heart.
                  </p>
                  <Tooltip content={`Mount ${embodiment.name}`}>
                    <button
                      onClick={() => mountPlugin(activePluginId)}
                      className="btn btn-primary mt-2 text-xs"
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

        {/* Neural Synth categories — seed-bound colours */}
        <section className="border-t border-[var(--border)] pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Neural Synth — 8 categories
          </h2>
          <div className="grid grid-cols-2 gap-1">
            {NEURAL_CATEGORIES.map((cat) => (
              <div
                key={cat}
                className="flex items-center gap-2 font-mono text-xs text-[var(--text-primary)]"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: scene.categoryColors[cat] }}
                />
                {cat}
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Colours are seed-bound. The thinker (22 nodes, 900 voxels, 14
            rings) renders in the eye once an embodiment is mounted.
          </p>
        </section>

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
      {/* After the colour choice: the demo disclaimer. It asks once —
          build your own with Iteration 8, the creator builder, or
          explore the demo still — and never blocks the view (a
          disclaimer crash renders nothing, error boundary). */}
      {showSynthDisclaimer && (
        <SynthDemoDisclaimerErrorBoundary>
          <SynthDemoDisclaimer onChoose={chooseSynthDisclaimer} />
        </SynthDemoDisclaimerErrorBoundary>
      )}
    </div>
  );
}
