/**
 * The demo widget layer — renders the registered widgets over the
 * synth shell.
 *
 * THE GATE (Gary, 2026-11-12 ~16:50 PST): "widgets only show after
 * you started a permanent creation build". The layer renders nothing
 * in the demo state — no compass, no custom widgets, nothing. Once
 * the gate is met (synthDemoReplaced AND a valid saved creation —
 * the same gate as the Voxel Directory), the layer shows every
 * registered widget, in registration order, as an overlay in the
 * shell area's top-right corner, beside the status chip.
 *
 * The gate ALSO requires the session not be demo-locked
 * (2026-11-12 ~20:15 PST — the widgets wave FAILED live
 * verification as guest): a guest inherits the owner's persisted
 * flags, so the flag + saved creation alone would pass for a guest
 * and the widgets would render in demo state. demoLocked is
 * isGuestProfile(activeProfile) — the same signal SynthView's
 * demo-lock uses.
 *
 * THE SEED IS THE SESSION'S, NOT THE STORE'S. The context's seedHex
 * is the seed of the shell/blueprint actually loaded in THIS
 * session — the TS machine's loaded shell, or a manages-own-state
 * shell's reported state — or null when nothing is loaded. The
 * synth store's seedHex must never be handed to a widget as-is:
 * the store initializes to the shell's default seed, and the
 * Lucifer default IS the owner's creation seed, so a session with
 * nothing loaded would display the owner's seed. A demo-locked
 * session gets null whatever is loaded.
 *
 * The layer builds one SynthWidgetContext per render from the stores
 * and hands it to every widget. The direction the compass reads is
 * the eye direction (machine.shell.eyeDir) for the demo shell; a
 * shell that manages its own state reports no direction, so the
 * compass shows "No heading" there until the shell bridge reports
 * one (see src/lib/synthCompass.ts).
 *
 * A crashing widget must never take down the view — each widget
 * renders inside its own error boundary, so a bad custom widget
 * fails as one empty card and the rest keep working. This matters
 * most for user-registered widgets, which are arbitrary code.
 *
 * Native widgets register when this module loads (the compass);
 * custom widgets register when customWidgets.ts loads. Re-imports
 * are no-ops (the registry ignores the same definition twice).
 */

import { Component, type ReactNode } from 'react';
import {
  listSynthWidgets,
  registerBuiltInSynthWidget,
  widgetsGateMet,
  type SynthWidgetContext,
} from '../../../lib/synthWidgets';
import { COMPASS_WIDGET } from './CompassWidget';
import './customWidgets';
import { PLUGIN_SHELLS } from '../../../types/synth';
import {
  activeMount,
  useSynthStore,
} from '../../../stores/synthStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import {
  isGuestProfile,
  useProfileStore,
} from '../../../stores/profileStore';

// Native widgets register once, when the layer module loads.
registerBuiltInSynthWidget(COMPASS_WIDGET);

interface WidgetErrorBoundaryProps {
  widgetId: string;
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  failed: boolean;
}

/** One widget's crash stays one widget's crash — the layer survives. */
class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    // The card says so; the error itself goes nowhere — a widget
    // crash is a widget problem, not a view problem.
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div
          data-testid={`synth-widget-${this.props.widgetId}-failed`}
          className="pointer-events-auto rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-[var(--text-muted)]"
        >
          Widget “{this.props.widgetId}” failed to render.
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetLayer() {
  const activePluginId = useSynthStore((s) => s.activePluginId);
  const seedHex = useSynthStore((s) => s.seedHex);
  const selectedTileId = useSynthStore((s) => s.selectedTileId);
  const eyeMode = useSynthStore((s) => s.eyeMode);
  const machine = useSynthStore((s) => s.machine);
  const iframeShellState = useSynthStore((s) => s.iframeShellState);
  const mounted = useSynthStore(activeMount);
  const demoReplaced = useSettingsStore(
    (s) => s.settings.synthDemoReplaced,
  );
  const ownBuild = useSettingsStore((s) => s.settings.synthOwnBuild);
  // The session's demo-lock — the SAME signal SynthView uses: a
  // guest's synth stays in demo mode. The persisted flags say
  // nothing about the session (a guest inherits the owner's), so
  // the gate needs this half or it passes for a guest.
  const activeProfile = useProfileStore((s) =>
    s.profiles.find((p) => p.id === s.activeProfileId),
  );
  const demoLocked = isGuestProfile(activeProfile);

  // The gate: nothing renders in the demo state, and nothing
  // renders for a demo-locked (guest) session.
  if (!widgetsGateMet(demoReplaced, ownBuild, demoLocked)) return null;
  const widgets = listSynthWidgets();
  if (widgets.length === 0) return null;

  const spec = PLUGIN_SHELLS[activePluginId];
  // What the layer shows for boot/build: a shell that manages its own
  // state reports from the iframe — the TS machine is not the shell.
  // (Same display rule as SynthView.)
  const boot = spec?.managesOwnState
    ? (iframeShellState?.boot ?? 'WAIT_BLUEPRINT')
    : machine.boot;
  const build = spec?.managesOwnState
    ? (iframeShellState?.build ?? 'IDLE')
    : machine.build;
  const shellId = spec?.managesOwnState
    ? (iframeShellState?.shellId ?? null)
    : (machine.shell?.shellId ?? null);
  // The direction the compass reads: the eye direction, when the TS
  // layer knows it. A shell that manages its own state reports no
  // direction — null, never a guess.
  const direction = spec?.managesOwnState
    ? null
    : (machine.shell?.eyeDir ?? null);

  // The seed the widgets see: the SESSION's loaded creation, never
  // the store's seedHex as-is. The store initializes to the shell's
  // default seed — and the Lucifer default IS the owner's creation
  // seed — so handing it over whenever the gate is met would show
  // the owner's seed to a session with nothing loaded (the guest
  // leak, 2026-11-12 ~20:15 PST). A seed exists only once a
  // shell/blueprint is actually loaded in this session (the TS
  // machine's shell, or a manages-own-state shell's reported
  // state); a demo-locked session gets null whatever is loaded.
  // The Seed card renders "no creation loaded" for null.
  const sessionSeedHex =
    demoLocked || (machine.shell === null && iframeShellState === null)
      ? null
      : seedHex;

  const ctx: SynthWidgetContext = {
    activePluginId,
    seedHex: sessionSeedHex,
    selectedTileId,
    eyeMode,
    boot,
    build,
    mounted: !!mounted,
    shellId,
    direction,
  };

  return (
    <div
      data-testid="synth-widget-layer"
      className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2 pointer-events-none"
    >
      {widgets.map((def) => (
        <WidgetErrorBoundary key={def.id} widgetId={def.id}>
          <div
            data-testid={`synth-widget-${def.id}`}
            data-widget-id={def.id}
            className="pointer-events-auto"
          >
            <def.Component {...ctx} />
          </div>
        </WidgetErrorBoundary>
      ))}
    </div>
  );
}
