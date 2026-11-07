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

/**
 * Forge rules — Gary's design, 2026-11-06 (main chat).
 *
 * IMPLEMENTED — the opposite-colour rule (09:37 PST). When making a
 * new Homunculus, only the OPPOSITE colour of the active one is
 * allowed. The exception: no colour chosen anywhere yet (the face is
 * still black / unformed — no active Homunculus) means free choice of
 * either colour. Because a new Homunculus becomes the selected one,
 * colours alternate with each creation. Enforced in
 * forgeStore.createHomunculus and offered in the ForgeView picker;
 * the helpers below are the single source of truth for the rule.
 *
 * NAMING (09:57 PST) — background lore. The FIRST Homunculus is
 * Lucifer (already the seed behaviour in forgeStore.loadRoster). The
 * SECOND is EVE, if pink — implemented as a pre-filled name default
 * in the ForgeView creation form, which the user can still change.
 * The second Homunculus's name if it is purple is NOT given — do not
 * invent one; leave it to Gary / the user's own name. OPEN: the
 * purple-second name.
 *
 * IMPLEMENTED — dual unison, the third type, the stop, and the tail
 * (11:00–11:28 PST; see src/lib/dualUnison.ts for the model). Binary
 * 1 is the two equal, separate states (pink and purple); binary 2 is
 * the united state — dual unison, the third type, the one whole —
 * unlocked by creating the pair. The stop is built into the dual
 * unison type: no more singles until the first stop action is input,
 * verified, and detected in the unison detect, which fully unlocks
 * the tail page. The tail is the immutable DNA, rooted cryptographically
 * and causally; its exact cryptographic mechanism is still an OPEN
 * placeholder (see tailEntryHash in dualUnison.ts).
 *
 * OPEN — not built, do not guess:
 * - The final STOP COLOURS (which colours stops get) are to be
 *   figured out later. For now a colour is assigned to a stop by the
 *   user (see `stopColorTheme`); that assignment is the placeholder.
 * - The GREEN ACTION for completion on a stop is LATER — do not add
 *   it. (It is distinct from the green "online" indicator on the
 *   active Homunculus.)
 * - TRI UNISON's effect, and how intelligence is gauged, are open
 *   (see TriUnisonState in dualUnison.ts). Only the acquirable /
 *   acquired state is implemented.
 * - The DISPLAY MESSAGES the active Homunculus will report as a live
 *   reporting buddy are not finished — do not invent them. The
 *   reporting hook is a placeholder (see forgeStore).
 */

/** The opposite of a colour — the two colours are each other's opposite. */
export function oppositeHomunculusColor(color: HomunculusColor): HomunculusColor {
  return color === 'purple' ? 'pink' : 'purple';
}

/**
 * Which colours a new Homunculus may take, given the active one's
 * colour. Null active colour = no colour chosen anywhere (black /
 * unformed face) — free choice of either. Otherwise only the
 * opposite.
 */
export function allowedNewHomunculusColors(
  activeColor: HomunculusColor | null,
): HomunculusColor[] {
  return activeColor === null
    ? [...HOMUNCULUS_COLORS]
    : [oppositeHomunculusColor(activeColor)];
}

/**
 * A face theme from an arbitrary stop colour (Gary, 2026-11-06:
 * for now a colour is assigned to a stop, and when the stop is hit
 * the action face colours to that stop's colour). The stop colour is
 * a free CSS colour — the final stop colours are still to be figured
 * out later, so this takes any string and wears it as-is. Primary,
 * light, and bright all take the colour (the face's horns, head
 * outline, and eyes all colour to the stop); the glow is the colour
 * at 45% alpha when it parses as hex, otherwise transparent — a
 * named or functional colour has no safe alpha to derive, and a
 * wrong glow is worse than none.
 */
export function stopColorTheme(color: string): HomunculusTheme {
  return {
    primary: color,
    light: color,
    bright: color,
    glow: hexToRgba(color, 0.45) ?? 'rgba(0, 0, 0, 0)',
  };
}

/** Parse #rgb / #rrggbb to rgba; anything else returns null. */
export function hexToRgba(hex: string, alpha: number): string | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const raw = match[1];
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
