/**
 * Dual unison — the third type, the tail, and the stop (Gary, 2026-11-06).
 *
 * The binary model, as Gary put it:
 * - Binary 1 = two equal, separate states — pink and purple. Each
 *   single Homunculus is one state of binary 1.
 * - Binary 2 = the united state = DUAL UNISON, the required one, both
 *   together. Dual unison IS the third type: Type 1 = pink single,
 *   Type 2 = purple single, Type 3 = dual unison, the one whole.
 *
 * Dual unison is LOCKED until you create a pink AND a purple one —
 * creating the pair unlocks it. The dual one has red, orange, and
 * yellow outlines, specifically for the dual one, never for singles.
 *
 * The STOP is built INTO the dual unison type: once dual unison
 * unlocks, no more singles can be created until the FIRST STOP ACTION
 * is input (setting up the third type in the dual unison tab). The
 * stop action, once input, must be VERIFIED and DETECTED within the
 * unison detect — that verification + detection is what unlocks the
 * TAIL PAGE FULLY. The stop action's state is explicit
 * (not-input -> input -> verified -> detected), never a single
 * boolean.
 *
 * The TAIL GENERATOR is its own tab. Its requirement, shown on the
 * page, is "dual unison detected". It is FULLY unlocked only when the
 * stop action has been verified and detected. It roots united actions
 * in binary 2, cryptographically and causally, growing the tail —
 * the immutable DNA of your system. A tail is per-person (grown from
 * that person's own united actions) and append-only: entries are
 * never rewritten, never reordered, never dropped.
 *
 * TRI UNISON is a buff to acquire on the account with dual unison,
 * like live active achievements that indicate intelligence gauging.
 * What the buff does, and how intelligence is gauged, is OPEN — do
 * not invent it (see the note on `TriUnisonState`).
 *
 * A stop colour (for now): a colour can be assigned to a stop. When
 * the stop is hit, the action face colours to that stop's colour.
 * The colour shows for a chosen duration — 1–9 seconds, or until the
 * next action. If seconds are chosen, when they expire the state
 * REGRESSES to the last validated solid in the causal tick time flow
 * — the ritual ticks are the causal-order counters that track the
 * validated solid states, so the regression target is the solid with
 * the highest tick, never a wall-clock guess. LATER, explicitly out
 * of scope: the green action for completion on a stop, and the final
 * stop colours (which colours stops get — to be figured out later).
 *
 * Pure helpers only — no window, no IPC, no store access — so this
 * module is importable by tests in a node environment.
 */

import type { Homunculus, HomunculusColor } from './homunculi';

/** Binary 1 = the two separate states; Binary 2 = the united state. */
export type BinaryState = 1 | 2;

/**
 * The three types. Type 1 = pink single, Type 2 = purple single,
 * Type 3 = dual unison (the one whole). Dual unison IS the third
 * type — they are the same thing, not two things.
 */
export type HomunculusType = 1 | 2 | 3;

/**
 * The dual one's outlines — red, orange, yellow — specifically for
 * the dual one, never for the single pink or purple Homunculi.
 */
export const DUAL_UNISON_OUTLINES = ['red', 'orange', 'yellow'] as const;

export type DualUnisonOutline = (typeof DUAL_UNISON_OUTLINES)[number];

/** The outline colours as CSS values (for the tab's swatches). */
export const DUAL_UNISON_OUTLINE_COLORS: Record<DualUnisonOutline, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
};

/** What the unison detect found in the roster. */
export interface DualUnisonDetection {
  /** True when the roster holds one pink AND one purple Homunculus. */
  detected: boolean;
  pinkId: string | null;
  purpleId: string | null;
}

/**
 * The unison detect — the detection that gates the dual unison tab,
 * the stop, and the tail page. Dual unison is detected exactly when
 * the roster holds the opposite pair (one pink, one purple). Creating
 * the pair IS the unlock: before the second Homunculus of the pair is
 * created, the roster holds only one colour and nothing is detected.
 */
export function detectDualUnison(roster: Homunculus[]): DualUnisonDetection {
  const pink = roster.find((h) => h.color === 'pink') ?? null;
  const purple = roster.find((h) => h.color === 'purple') ?? null;
  return {
    detected: pink !== null && purple !== null,
    pinkId: pink?.id ?? null,
    purpleId: purple?.id ?? null,
  };
}

/**
 * The stop action's state — explicit, in order. The tail page is
 * FULLY unlocked only at 'detected'; nothing earlier unlocks it.
 */
export type StopActionState = 'not-input' | 'input' | 'verified' | 'detected';

/** The stop action's state, in causal order (for display + guards). */
export const STOP_ACTION_STATES: StopActionState[] = [
  'not-input',
  'input',
  'verified',
  'detected',
];

/** Display text for a stop action state. */
export function stopActionStateLabel(state: StopActionState): string {
  switch (state) {
    case 'not-input':
      return 'Not input yet';
    case 'input':
      return 'Input — awaiting verification';
    case 'verified':
      return 'Verified — awaiting detection';
    case 'detected':
      return 'Verified and detected';
  }
}

/** The stop action may be input only while it has never been input. */
export function canInputStopAction(state: StopActionState): boolean {
  return state === 'not-input';
}

/** Verification follows input, and only input. */
export function canVerifyStopAction(state: StopActionState): boolean {
  return state === 'input';
}

/** Detection follows verification, and only verification. */
export function canDetectStopAction(state: StopActionState): boolean {
  return state === 'verified';
}

/** The tail page is FULLY unlocked only once the stop action is detected. */
export function isTailPageFullyUnlocked(state: StopActionState): boolean {
  return state === 'detected';
}

/**
 * How long the stop colour shows on the action face: 1–9 seconds,
 * or until the next action (the colour stays until something else
 * happens — an activation, a creation, another stop).
 */
export type StopColorDuration =
  | { kind: 'seconds'; seconds: number }
  | { kind: 'until-next-action' };

/** A duration in seconds is valid only as an integer from 1 to 9. */
export function parseStopColorDurationSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 9 ? value : null;
}

/** Display text for a stop colour duration. */
export function stopColorDurationLabel(duration: StopColorDuration): string {
  return duration.kind === 'seconds'
    ? `${duration.seconds} second${duration.seconds === 1 ? '' : 's'}`
    : 'Until the next action';
}

/**
 * A validated solid face state — the face's normal colour, validated
 * at activation, ordered by ritual tick. The "last validated solid"
 * is the solid with the highest tick: when a stop colour's seconds
 * expire, the face regresses to it. Ticks are causal-order counters
 * (the ritual-tick rule: monotonically increasing, never re-numbered,
 * assigned in causal order); the timestamp is display only and never
 * orders anything.
 */
export interface FaceSolid {
  tick: number;
  color: HomunculusColor;
}

/**
 * One rooted united action — one entry in the tail. Append-only:
 * entries are never rewritten, reordered, or dropped, so the tail
 * only ever grows. The tick is the ritual tick (causal order); the
 * timestamp is display only.
 */
export interface TailEntry {
  /** Ritual tick — causal order of this entry in the tail. */
  tick: number;
  /** The united action, in the user's own words. */
  action: string;
  /** ISO timestamp the action was rooted. Display only. */
  at: string;
  /** Hash of the previous entry ('' for the first) — the chain link. */
  prevHash: string;
  /** Hash of this entry — see `tailEntryHash` (placeholder). */
  hash: string;
}

/**
 * The tail's hash — a PLACEHOLDER, explicitly not the final
 * cryptographic mechanism. It chains entries (each entry's hash
 * covers the previous hash, its tick, and its action) so the record
 * is append-only and tamper-evident in shape, but it is a plain
 * 32-bit FNV-1a checksum, NOT a cryptographic hash. OPEN design
 * decision (Gary): the exact mechanism — real hash chain vs
 * signature vs something else — is not decided. Do not treat this
 * as cryptographic proof; when the mechanism is decided, replace
 * this function and re-hash from the genesis entry.
 */
export function tailEntryHash(
  prevHash: string,
  tick: number,
  action: string,
): string {
  const input = `${prevHash}|${tick}|${action}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Append one united action to the tail. Returns a NEW tail (the input
 * is untouched) with the entry chained to the previous last entry.
 * The caller owns the tick (a monotonic causal counter, never
 * re-numbered) and passes it in.
 */
export function appendTailEntry(
  tail: TailEntry[],
  tick: number,
  action: string,
  at: string,
): TailEntry[] {
  const prevHash = tail.length > 0 ? tail[tail.length - 1].hash : '';
  const entry: TailEntry = {
    tick,
    action,
    at,
    prevHash,
    hash: tailEntryHash(prevHash, tick, action),
  };
  return [...tail, entry];
}

/**
 * Verify a tail's chain shape — every entry's prevHash matches the
 * previous entry's hash, and ticks strictly increase (causal order).
 * A broken chain means the record was rewritten, which the tail
 * must never allow. (With the placeholder hash this checks shape,
 * not cryptographic proof — see `tailEntryHash`.)
 */
export function isTailChainIntact(tail: TailEntry[]): boolean {
  for (let i = 0; i < tail.length; i++) {
    const entry = tail[i];
    const expectedPrev = i === 0 ? '' : tail[i - 1].hash;
    if (entry.prevHash !== expectedPrev) return false;
    if (i > 0 && entry.tick <= tail[i - 1].tick) return false;
    if (entry.hash !== tailEntryHash(entry.prevHash, entry.tick, entry.action)) {
      return false;
    }
  }
  return true;
}

/**
 * Tri unison — the account-level buff.
 *
 * OPEN, do not invent (Gary, 2026-11-06): tri unison becomes a buff
 * to acquire on the account with dual unison, like live active
 * achievements that indicate intelligence gauging. What the buff
 * DOES (its effect), and how intelligence is gauged, are undecided.
 * This state only records whether the buff is acquirable (dual
 * unison unlocked) and whether the account has acquired it. Nothing
 * here grants an effect, a bonus, or a gauge.
 */
export interface TriUnisonState {
  /** Acquirable once dual unison is unlocked. */
  acquirable: boolean;
  /** The account has acquired the buff. */
  acquired: boolean;
}

/** Tri unison becomes acquirable exactly when dual unison is detected. */
export function triUnisonFor(
  detected: boolean,
  acquired: boolean,
): TriUnisonState {
  return { acquirable: detected, acquired };
}

/**
 * The dual-unison state held in the Forge store. The stop action's
 * state, the stop's colour/duration/message, the face's validated
 * solid + causal tick, the tail, and the tri-unison acquisition.
 * `triUnisonAcquired` is stored; acquirable is DERIVED from the
 * roster (detectDualUnison) — never stored separately, so the two
 * can never disagree.
 */
export interface DualUnisonState {
  /** The stop action: not-input -> input -> verified -> detected. */
  stopAction: StopActionState;
  /** Colour assigned to the stop (for now). Null = none assigned. */
  stopColor: string | null;
  /** How long the stop colour shows on the action face. */
  stopDuration: StopColorDuration | null;
  /** Action message assigned to the stop from the face. */
  stopMessage: string | null;
  /** The stop colour is currently showing on the action face. */
  stopFaceColorActive: boolean;
  /** The last validated solid face colour, with its causal tick. */
  solidFace: FaceSolid | null;
  /** Monotonic causal counter for face-colour validations (the
   *  ritual-tick rule: never re-numbered, assigned in causal order). */
  faceTick: number;
  /** The tail — append-only rooted united actions. */
  tail: TailEntry[];
  /** Next ritual tick for tail entries. */
  tailNextTick: number;
  /** The account has acquired the tri unison buff. */
  triUnisonAcquired: boolean;
}

/** Fresh dual-unison state — nothing unlocked, nothing input. */
export function freshDualUnisonState(): DualUnisonState {
  return {
    stopAction: 'not-input',
    stopColor: null,
    stopDuration: null,
    stopMessage: null,
    stopFaceColorActive: false,
    solidFace: null,
    faceTick: 0,
    tail: [],
    tailNextTick: 1,
    triUnisonAcquired: false,
  };
}

/**
 * Which binary state a roster is in: binary 1 while it holds only
 * separate singles, binary 2 once the opposite pair is united.
 */
export function binaryStateOf(roster: Homunculus[]): BinaryState {
  return detectDualUnison(roster).detected ? 2 : 1;
}
