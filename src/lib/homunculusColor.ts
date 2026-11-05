/**
 * Homunculus colour — the Sentinel face's theme.
 *
 * Gary (2026-11-05): on first entry to the Synth view the user chooses
 * the Homunculus's colour — purple or pink, just those two. The choice
 * is stored as the `homunculusColor` setting (null = no choice yet) and
 * the face wears it everywhere it appears: the prompt-bar face button
 * and the Synth view.
 *
 * Pink is the face's CURRENT variation — the palette it already wears
 * today (hot-pink horns, lavender eyes). Purple is the new alternative
 * being added. There is no fallback colour: before a choice is made
 * the face is unformed — black, with no eyes (HOMUNCULUS_UNFORMED_THEME)
 * — and once a colour is chosen the face wakes up: the eyes fade in
 * and the head line draws itself (HOMUNCULUS_EYE_FADE_MS /
 * HOMUNCULUS_LINE_DRAW_MS).
 *
 * Only the face and its accents take the colour — never the whole app.
 */

export type HomunculusColor = 'purple' | 'pink';

export const HOMUNCULUS_COLORS: HomunculusColor[] = ['purple', 'pink'];

export interface HomunculusTheme {
  /** Horn fill + head outline — the face's main colour. */
  primary: string;
  /** Horn outline + eye fill — the light companion colour. */
  light: string;
  /** Bright accent for face-related text in the Synth view. */
  bright: string;
  /** Soft glow behind the face / on the picker swatch. */
  glow: string;
}

export const HOMUNCULUS_THEMES: Record<HomunculusColor, HomunculusTheme> = {
  purple: {
    primary: '#a855f7',
    light: '#d8b4fe',
    bright: '#c084fc',
    glow: 'rgba(168, 85, 247, 0.45)',
  },
  pink: {
    primary: '#ff2d95',
    light: '#d7a0ff',
    bright: '#ff5db1',
    glow: 'rgba(255, 45, 149, 0.45)',
  },
};

/**
 * The unformed face — before any colour is chosen. The face shape and
 * horns are still there, but black: the horns and head outline are a
 * dark grey (visible as a faint edge against black, clearly black),
 * the face-related text accents are a neutral grey, and there is no
 * glow. The eyes (and the fanged maw) are not rendered at all in this
 * state — the face is blank, not broken.
 */
export const HOMUNCULUS_UNFORMED_THEME: HomunculusTheme = {
  primary: '#262626',
  light: '#262626',
  bright: '#8a8a8a',
  glow: 'rgba(0, 0, 0, 0)',
};

/** How long the eyes take to fade in once a colour is chosen. */
export const HOMUNCULUS_EYE_FADE_MS = 700;

/** How long the head line takes to draw itself once a colour is chosen. */
export const HOMUNCULUS_LINE_DRAW_MS = 900;

/**
 * How long the whole wake-up reveal lasts — slightly longer than the
 * line draw, so the reveal is fully finished before anything that
 * follows it (the demo disclaimer) shows up.
 */
export const HOMUNCULUS_REVEAL_MS = 950;

/**
 * Validate a stored value. Only the two exact strings count — anything
 * else (null, undefined, a typo, a number, an object) is "no choice yet"
 * and the picker shows again on next entry.
 */
export function parseHomunculusColor(value: unknown): HomunculusColor | null {
  return value === 'purple' || value === 'pink' ? value : null;
}

/** True when no valid choice is stored — the picker shows on entry. */
export function shouldShowHomunculusPicker(stored: unknown): boolean {
  return parseHomunculusColor(stored) === null;
}
