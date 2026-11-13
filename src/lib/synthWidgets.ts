/**
 * Demo widget system (Gary, 2026-11-12 ~16:48 PST): "we also need to
 * make it so you can build to the demo in iterations so we will add
 * widgets and the first will be the compass i think is good and a way
 * to add your own custom widgets that dont come natively".
 *
 * The demo is built up in iterations by adding widgets. This module is
 * the registry — the analog of PLUGIN_SHELLS for widgets: a widget is
 * a self-contained unit (a definition: id + name + description + a
 * React component), registered once, rendered by the widget layer in
 * the synth view. Built-in (native) widgets ship with Lucid; custom
 * widgets register through registerSynthWidget from anywhere — the
 * sanctioned place is src/components/Synth/widgets/customWidgets.ts.
 *
 * Rules:
 * - Ids are unique and kebab-case. Re-registering the SAME definition
 *   is a no-op (module re-imports under HMR must not throw);
 *   a DIFFERENT definition claiming an existing id throws.
 * - Native widgets cannot be replaced or unregistered — a custom
 *   widget can never shadow the compass. registerSynthWidget always
 *   stores native: false, whatever the caller passes.
 * - A widget never reads the stores itself: it receives a
 *   SynthWidgetContext (the active shell, seed, tile, eye mode, boot/
 *   build, mount, and the direction the compass reads). Widgets stay
 *   pure functions of that context, so they are testable without the
 *   view and safe to render for any shell.
 *
 * THE GATE (Gary, 2026-11-12 ~16:50 PST): "widgets only show after
 * you started a permanent creation build". The widget layer appears
 * only once the demo has been permanently replaced by the user's own
 * build — the SAME gate as the Voxel Directory (Gary ~12:23 PST):
 * synthDemoReplaced AND a valid saved creation. In the demo state no
 * widgets show at all. widgetsGateMet is the pure form of that gate
 * (directoryGateMet in the synth store is the imperative form of the
 * same rule); the layer subscribes to the settings and applies it.
 *
 * THE GUEST HALF (2026-11-12 ~20:15 PST — the widgets wave FAILED
 * live verification as guest): the persisted flags alone do NOT
 * gate a guest out. The guest veil never touches synthStore or the
 * settings flags, so as guest the persisted synthDemoReplaced=true
 * + saved creation still pass the gate — and the layer rendered in
 * demo state, with the Seed card showing the owner's creation seed.
 * So the gate ALSO requires the session not be demo-locked
 * (isGuestProfile(activeProfile) — the same signal SynthView's
 * demo-lock uses). A demo-locked session never sees widgets,
 * whatever the persisted flags say.
 */

import type { ComponentType } from 'react';
import type {
  BootState,
  BuildState,
  EyeMode,
  Vec3,
} from '../types/synth';
import { parseCreatorBuild } from './synthDisclaimer';

/**
 * What a widget sees. Everything a widget may render comes from here
 * — never from the stores directly, never from the shell iframe.
 */
export interface SynthWidgetContext {
  /** Active shell's plugin id (e.g. 'lucifer', 'iteration8'). */
  activePluginId: string;
  /**
   * Seed hex of the SESSION's loaded creation — the seed of the
   * shell/blueprint actually loaded in this session, or null when
   * nothing is loaded. NEVER the synth store's seedHex as-is: the
   * store initializes to the shell's default seed, and the Lucifer
   * default (DEFAULT_SYNTH_SEED) IS the owner's creation seed — a
   * guest session with nothing loaded would otherwise display the
   * owner's seed. The layer derives this; widgets just render it.
   */
  seedHex: string | null;
  /** Selected tile on the canonical spine. */
  selectedTileId: string;
  eyeMode: EyeMode;
  /** Boot/build of the active shell (the iframe's own report for a
   * shell that manages its own state, the TS machine otherwise). */
  boot: BootState;
  build: BuildState;
  /** Whether an embodiment is mounted in the active shell. */
  mounted: boolean;
  /** Loaded blueprint's shell id, or null when no blueprint is loaded. */
  shellId: string | null;
  /**
   * The direction the compass reads. TODAY this is the eye direction
   * (machine.shell.eyeDir = norm(blueprint.origin)) when the TS layer
   * knows it — for the demo shell, once a blueprint is loaded. It is
   * null when the active shell reports no direction: no blueprint
   * loaded yet, or a shell that manages its own state (Iteration 8 —
   * its iframe state carries no direction). The shell's live reticle
   * direction would feed this instead, once the shell bridge posts it;
   * until then the compass shows "no heading" rather than a made-up
   * one. See src/lib/synthCompass.ts for the full note.
   */
  direction: Vec3 | null;
}

/** One widget: a self-contained unit in the demo's widget layer. */
export interface SynthWidgetDefinition {
  /** Unique kebab-case id, e.g. 'compass'. */
  id: string;
  /** Display name, e.g. 'Compass'. */
  name: string;
  /** One line on what the widget shows. */
  description: string;
  /**
   * True for widgets that ship with Lucid. Native widgets cannot be
   * replaced or unregistered. Custom widgets always register with
   * native: false — registerSynthWidget enforces it.
   */
  native: boolean;
  /** The widget's component — it receives the full widget context. */
  Component: ComponentType<SynthWidgetContext>;
}

const WIDGET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

const registry = new Map<string, SynthWidgetDefinition>();

function validateDefinition(
  def: Omit<SynthWidgetDefinition, 'native'>,
): void {
  if (!def || typeof def !== 'object') {
    throw new Error('Synth widget definition must be an object');
  }
  if (typeof def.id !== 'string' || !WIDGET_ID_RE.test(def.id)) {
    throw new Error(
      `Synth widget id must be kebab-case (e.g. 'compass'), got ${JSON.stringify(def.id)}`,
    );
  }
  if (typeof def.name !== 'string' || def.name.trim() === '') {
    throw new Error(
      `Synth widget "${def.id}" must have a non-empty name`,
    );
  }
  if (typeof def.Component !== 'function') {
    throw new Error(
      `Synth widget "${def.id}" must have a Component`,
    );
  }
}

function register(
  def: SynthWidgetDefinition,
): SynthWidgetDefinition {
  validateDefinition(def);
  const existing = registry.get(def.id);
  if (existing) {
    // Same definition re-registered (module re-import under HMR):
    // a no-op, never a throw. A DIFFERENT component claiming the
    // id is a conflict — natives especially must never be shadowed.
    if (existing.Component === def.Component) return existing;
    throw new Error(
      `Synth widget id "${def.id}" is already registered by "${existing.name}"`,
    );
  }
  registry.set(def.id, def);
  return def;
}

/**
 * Register a built-in (native) widget. Called by the widget layer /
 * barrel for widgets that ship with Lucid. Native widgets cannot be
 * replaced or unregistered.
 */
export function registerBuiltInSynthWidget(
  def: SynthWidgetDefinition,
): SynthWidgetDefinition {
  if (def.native !== true) {
    throw new Error(
      `Built-in synth widget "${def.id}" must be registered with native: true`,
    );
  }
  return register(def);
}

/**
 * Register your own widget — the custom-widget extension point
 * (Gary, 2026-11-12 ~16:48 PST: "a way to add your own custom
 * widgets that dont come natively"). The definition is {id, name,
 * description, Component}; native is always false, whatever is
 * passed. The sanctioned place to call this is
 * src/components/Synth/widgets/customWidgets.ts — import your widget
 * there and register it, and the layer picks it up. Throws when the
 * id is taken by a different widget.
 */
export function registerSynthWidget(
  def: Omit<SynthWidgetDefinition, 'native'>,
): SynthWidgetDefinition {
  return register({ ...def, native: false });
}

/** The widget registered under an id, or undefined. */
export function getSynthWidget(
  id: string,
): SynthWidgetDefinition | undefined {
  return registry.get(id);
}

/** True when an id is registered. */
export function hasSynthWidget(id: string): boolean {
  return registry.has(id);
}

/** All registered widgets, in registration order (natives first —
 * they register when the layer loads, before custom widgets). */
export function listSynthWidgets(): SynthWidgetDefinition[] {
  return [...registry.values()];
}

/**
 * Unregister a custom widget. Native widgets cannot be unregistered
 * (throws); an unknown id returns false.
 */
export function unregisterSynthWidget(id: string): boolean {
  const existing = registry.get(id);
  if (!existing) return false;
  if (existing.native) {
    throw new Error(
      `Synth widget "${id}" is native and cannot be unregistered`,
    );
  }
  return registry.delete(id);
}

/**
 * Test-only: empty the registry. Built-ins re-register when the layer
 * module loads (or when a test registers them explicitly).
 */
export function clearSynthWidgetRegistryForTests(): void {
  registry.clear();
}

/**
 * The widget gate (Gary, 2026-11-12 ~16:50 PST): widgets only show
 * after a permanent creation build has started — the same gate as the
 * Voxel Directory (Gary ~12:23 PST). demoReplaced is
 * settings.synthDemoReplaced; ownBuild is settings.synthOwnBuild.
 * Both halves are required: the flag alone (a build never saved) and
 * a saved build alone (the demo never permanently replaced) both
 * keep the widgets hidden.
 *
 * demoLocked is the session's demo-lock (isGuestProfile of the
 * active profile — the same signal SynthView's demo-lock uses) and
 * is REQUIRED: the persisted flags say nothing about the session.
 * A guest session inherits the owner's persisted synthDemoReplaced
 * + saved creation (the veil never touches them), so without this
 * half the gate passes for a guest and the widgets render in demo
 * state — leaking the owner's seed via the Seed card (2026-11-12
 * ~20:15 PST, widgets wave live verification). A demo-locked
 * session never sees widgets, whatever the persisted flags say.
 */
export function widgetsGateMet(
  demoReplaced: unknown,
  ownBuild: unknown,
  demoLocked: boolean,
): boolean {
  return (
    demoReplaced === true &&
    parseCreatorBuild(ownBuild) !== null &&
    demoLocked !== true
  );
}
