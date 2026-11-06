/**
 * Synth demo disclaimer — the step after the Homunculus colour choice.
 *
 * Gary (2026-11-05): the Lucid synth is a demo — the demo of what it
 * can become — until you build your own, and you build your own with
 * Iteration 8, the creator builder. After the user picks a Homunculus
 * colour the disclaimer asks: commence building your own (with
 * Iteration 8), or explore the demo still?
 *
 * The choice is stored as the `synthDisclaimerChoice` setting (null =
 * not answered yet) and the disclaimer asks once — a stored choice,
 * either one, means it never asks again on later entries.
 *
 * Synth versions (Gary, 2026-11-05): starting a new build asks for a
 * synth version in a drop-down, starting with Iteration 8 for now —
 * Lucid is the demo, not a live working build yet. The selected
 * version is stored as the `synthVersion` setting alongside the
 * choice (build only). Iteration 8 is the only version for now; the
 * list grows as versions ship. Like the choice, only exact known
 * values count — anything else is unset.
 *
 * Iteration 8 itself does not exist yet as a built feature (2026-11-05):
 * "build my own" only records the choice and names Iteration 8 as the
 * creator builder — it does not fake a builder UI. Building Iteration 8
 * is the follow-up.
 */

export type SynthDisclaimerChoice = 'build' | 'explore';

export const SYNTH_DISCLAIMER_CHOICES: SynthDisclaimerChoice[] = [
  'build',
  'explore',
];

/** Synth versions a new build can start from. Iteration 8 only, for now. */
export type SynthVersion = 'iteration-8';

export const SYNTH_VERSIONS: SynthVersion[] = ['iteration-8'];

export const SYNTH_VERSION_LABELS: Record<SynthVersion, string> = {
  'iteration-8': 'Iteration 8',
};

export const DEFAULT_SYNTH_VERSION: SynthVersion = 'iteration-8';

/**
 * Validate a stored version. Only exact known values count — anything
 * else (null, undefined, a typo, a number, an object) is unset, and
 * the build falls back to the default version.
 */
export function parseSynthVersion(value: unknown): SynthVersion | null {
  return (SYNTH_VERSIONS as unknown[]).includes(value)
    ? (value as SynthVersion)
    : null;
}

/**
 * Validate a stored value. Only the two exact strings count — anything
 * else (null, undefined, a typo, a number, an object) is "not answered
 * yet" and the disclaimer shows again (once a colour is chosen).
 */
export function parseSynthDisclaimerChoice(
  value: unknown,
): SynthDisclaimerChoice | null {
  return value === 'build' || value === 'explore' ? value : null;
}

/**
 * True when no valid choice is stored — the disclaimer shows (after the
 * colour reveal, or at once on a later entry when a colour is already
 * stored).
 */
export function shouldShowSynthDisclaimer(stored: unknown): boolean {
  return parseSynthDisclaimerChoice(stored) === null;
}
