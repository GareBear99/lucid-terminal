/**
 * Starship detection — the hook that decides whether a starship is
 * present, so the Modules tab can show its Segments.
 *
 * PLACEHOLDER — the detection mechanism is OPEN (Gary's call, 2026-11-06).
 * How the starship is detected, and how its link proves a purchase,
 * is NOT settled. The earlier link-carries-purchase recommendation
 * was NOT accepted, so nothing here invents a detection or
 * verification mechanism: no link parsing, no purchase check, no
 * store, no checkout, no license server. This file is the EXPLICIT
 * HOOK where the detection mechanism plugs in once Gary settles it —
 * `detectStarship` is the single place the Modules tab asks, and it
 * currently always answers "not detected".
 *
 * The starship itself is Gary's product and is built by Gary — never
 * by this code. The Segments the starship carries are Gary's product
 * too; this hook only reports whether one is detected and, when it
 * is, the Segments it carries (as display descriptors — id + name —
 * so the container can list them). What a Segment is or does is the
 * starship's own content, not defined here.
 */

/** One Segment carried by a detected starship, as a display descriptor. */
export interface StarshipSegment {
  /** Stable id of the Segment. */
  id: string;
  /** Display name of the Segment. */
  name: string;
}

/** What the Modules tab needs to know about a starship. */
export interface StarshipDetection {
  /** Whether a starship is currently detected. */
  detected: boolean;
  /** Why not detected (or how it was detected). Shown in the UI. */
  detail: string;
  /** The Segments the detected starship carries. Empty when none. */
  segments: readonly StarshipSegment[];
}

/**
 * Is a starship detected right now?
 *
 * PLACEHOLDER: always "not detected" — no detection mechanism
 * exists yet. When Gary settles how the starship is detected (and
 * how its link proves a purchase), that mechanism plugs in here and
 * nowhere else: this function returns `detected: true` with the
 * Segments the starship carries, and the Modules tab shows them.
 * Until then, do NOT fake a detection here.
 */
export function detectStarship(): StarshipDetection {
  return {
    detected: false,
    detail:
      'No starship detected — the detection mechanism is not wired yet (Gary\u2019s call).',
    segments: [],
  };
}
