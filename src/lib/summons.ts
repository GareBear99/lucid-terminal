/**
 * Summons — the Summons section of the Forge (Gary, 2026-11-09).
 *
 * Summons are their own section in the Forge, SEPARATE from the
 * Homunculi roster (the roster is Lucifer + EVE; summons are not
 * Homunculi and are not stored in the roster file). A summon has
 * its own art: an animated GIF presentation and a still image as
 * the fallback / static presentation. The Homunculus model has no
 * image field (its face is the Sentinel SVG) — art lives here, on
 * the summon, not on the Homunculus.
 *
 * Unlock rules (Gary, 2026-11-09 ~10:39–10:40 PST): the FIRST
 * summon unlocks the first time WITH A LIVING GOLEM, free of any
 * referral requirement. The SECOND requires LIVING GOLEM AND HIGHER
 * TOPOLOGY (two active referrals in the last 90 days, verified by
 * the daily scrape). A Living Golem is a paid plan ($5/month or $1
 * every 72 hours of use), same later family as the $50 starship —
 * and NOBODY owns one yet, so every summon ships LOCKED.
 *
 * Living Golem detection / verification is NOT built here: that
 * mechanism is OPEN (Gary's call, same as starship detection).
 * isSummonUnlocked reads locked until detection exists — do not
 * invent a detection mechanism, and do not put a price anywhere
 * in the app (the $7 summons pack price is for the itch pack, not
 * a Lucid price).
 *
 * Art is OUR art only (the boss / siren art built for the summons
 * pack). The GandalfHardcore succubus pack Gary owns is for
 * TESTING summons on the desktop only — its license forbids
 * redistribution and AI training, so it must never ship in Lucid.
 *
 * Pure model only — no window, no IPC, no store access.
 */

/**
 * A summon's variant (Gary, 2026-11-09 ~11:01 PST): on EVERY summon
 * activation, ask clothed vs 18+ variant — ask every time until the
 * user checks "don't ask again" after selecting one, then the choice
 * is remembered and the prompt stops. The words are Gary's: the
 * options are "Clothed" and "18+".
 */
export type SummonVariant = 'clothed' | 'adult';

/** Display labels for the variant options — Gary's words. */
export const SUMMON_VARIANT_LABELS: Record<SummonVariant, string> = {
  clothed: 'Clothed',
  adult: '18+',
};

/** One summon in the Summons section. */
export interface Summon {
  /** Stable id, e.g. 'lily'. */
  id: string;
  /** Display name, Gary's spelling — e.g. 'Lily'. */
  name: string;
  /** Animated presentation (GIF). */
  gifSrc: string;
  /** Still presentation (PNG) — the fallback / static. */
  imageSrc: string;
  /** What unlocks this summon. */
  unlock: 'living-golem' | 'living-golem-and-higher-topology';
  /** Locked-state text, shown on the slot while locked. */
  lockedText: string;
}

/**
 * Lily, the LuciferAI siren — the intro summon, FIRST in the
 * Summons section. A NEW summon, not Lucifer renamed.
 */
export const LILY_SUMMON: Summon = {
  id: 'lily',
  name: 'Lily',
  gifSrc: './summons/lily/slave-boss-heart-playing.gif',
  imageSrc: './summons/lily/slave-boss-with-heart-clean.png',
  unlock: 'living-golem',
  lockedText: 'Requires Living Golem — coming soon',
};

/** The second summon slot has no named summon yet — it is a locked
 * placeholder (do not invent a second summon's name or art). Its
 * locked text states its unlock rule only. */
export const SECOND_SUMMON_LOCKED_TEXT =
  'Requires Living Golem and higher topology — coming soon';

/** The summons, in section order — Lily first. */
export const SUMMONS: Summon[] = [LILY_SUMMON];

/**
 * True when this summon is unlocked on this account. Today that is
 * always false: nobody owns a Living Golem yet, and Living Golem
 * detection / verification is OPEN (Gary's call) — no detection is
 * built, so no summon can read unlocked. When detection lands, this
 * is the one place that learns it.
 */
export function isSummonUnlocked(_summon: Summon): boolean {
  return false;
}
