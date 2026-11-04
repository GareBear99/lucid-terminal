/**
 * Gaze for the Sentinel face's eyes.
 *
 * ALIVE BY DEFAULT. The eyes are NOT beamed onto the user's cursor —
 * most of the time they wander and look around on their own (a slow
 * idle drift), glance at glows, and only lock on when an agent needs
 * attention. The eyes feel alive until they need to be on an agent.
 *
 * Focus is temporary and only happens while an agent is acting:
 * - a prompt is submitted (the eyes look at the prompt input for a beat)
 * - something glows (the eyes notice the glow and look at it while it lasts)
 * - an agent's cursor is actively moving right now (the eyes lock on it)
 * When the action ends the eyes release and drift back to wandering.
 * The transition is smooth — the eye transform eases toward the new
 * target, never snaps — because the focus target is just a point the
 * eyes drift toward, not a lock.
 *
 * The gaze is built around a FOLLOW TARGET — a cursor position the eyes
 * track (see `FollowCursor` / `pickFollowTarget`). Today that target is
 * the user's pointer, fed through the cursor registry in gazeStore.
 * It is deliberately NOT hard-coded to the user's mouse: later, when
 * other agents are moving cursors too, any agent's cursor registers in
 * the same registry and the most recently moved one wins, so the eyes
 * follow the cursor that is acting. The eyes never follow two cursors
 * at once and never get stuck on a stale one.
 *
 * The user's own cursor never beams the eyes: it only pulls them by
 * the gaze sensitivity (Settings › Gaze sensitivity, default 50%) —
 * a glance, not a lock. At 0 the eyes ignore the user's cursor
 * entirely; at 100 they track it closely. Sensitivity also sets how
 * fast the eyes lock on (slow drift at low sensitivity, quick at high).
 * Sensitivity controls ONLY the cursor focus — not the blink, horns,
 * blood drip, or glow-noticing.
 *
 * Pure functions with an injectable randomness source so tests can drive
 * them deterministically; the component passes Math.random in production.
 *
 * The eyes are the `#d7a0ff` void-eye circles in SentinelFace (centres
 * SVG (53, 54) and (67, 54), radius 3). The gaze shifts them within a
 * few SVG units of centre — far less than the eye radius, so they never
 * leave the face — and tilts the eye group a few degrees at most.
 */

/** Maximum eye shift, in SVG user units (eye radius is 3). */
export const GAZE_MAX_DX = 2.2;
export const GAZE_MAX_DY = 1.6;

/** Maximum tilt of the eye group, in degrees — subtle, a few at most. */
export const GAZE_MAX_TILT_DEG = 4;

/**
 * Pointer distance (px) at which the gaze reaches full deflection.
 * A pointer closer than this shifts the eyes proportionally less.
 */
export const GAZE_REACH_PX = 220;

/** Pointer idle time after which the eyes stop following it and wander. */
export const POINTER_IDLE_MS = 4000;

/**
 * How recently an agent's cursor must have moved to count as acting.
 * An agent cursor moving right now focuses the eyes; one that moved
 * a second ago does not — the eyes release and go back to feeling alive.
 */
export const AGENT_ACTING_WINDOW_MS = 800;

/** Delay between idle wander picks: 2.5–4.5s, irregular. */
export const WANDER_MIN_DELAY_MS = 2500;
export const WANDER_MAX_DELAY_MS = 4500;

/** Idle wander stays small — a drift, not a stare across the room. */
export const WANDER_MAX_DX = 1.4;
export const WANDER_MAX_DY = 1.0;

export interface GazeOffset {
  dx: number;
  dy: number;
}

/** One cursor that could be followed — the user's, or later an agent's. */
export interface FollowCursor {
  /** Who owns this cursor: 'user' today, an agent id later. */
  id: string;
  /** Client-pixel position. */
  x: number;
  y: number;
  /** Epoch ms this cursor last moved. */
  at: number;
}

/**
 * Which cursor the eyes follow: the most recently moved one that is
 * still fresh. Today there is only the user's cursor, but the decision
 * is the latest active cursor, not "the mouse" — later, when other
 * agents are moving cursors too, the one currently acting wins and the
 * eyes follow it instead, without ever trying to follow two at once or
 * getting stuck on a stale one. A cursor older than `maxAgeMs` is not
 * followed (the eyes fall back to idle wander).
 */
export function pickFollowTarget(
  cursors: readonly FollowCursor[],
  now: number = Date.now(),
  maxAgeMs: number = POINTER_IDLE_MS,
): FollowCursor | null {
  let best: FollowCursor | null = null;
  for (const c of cursors) {
    if (now - c.at > maxAgeMs) continue;
    if (best === null || c.at > best.at) best = c;
  }
  return best;
}

/**
 * How fast the eyes lock on, from the gaze sensitivity (0..1):
 * low sensitivity drifts slowly (500ms), high sensitivity locks on
 * quickly (150ms). The transition is always an ease, never a snap.
 */
export function focusTransitionMs(sensitivity: number): number {
  return Math.round(500 - 350 * clamp(sensitivity, 0, 1));
}

/** Everything the gaze decision needs, in one place (testable). */
export interface GazeContext {
  /** Face centre, client pixels. */
  faceCenter: { x: number; y: number };
  /** A prompt-submit attention, if one is set (may be expired). */
  attention: { x: number; y: number; until: number } | null;
  /** Centre of the glowing element, if a glow is active. */
  glowPoint: { x: number; y: number } | null;
  /** All registered cursors (user + agents). */
  cursors: readonly FollowCursor[];
  /** Gaze sensitivity, 0..1 — how strongly the user's cursor pulls. */
  sensitivity: number;
  /** Current idle-wander target (the alive state). */
  wander: GazeOffset;
  now: number;
}

/**
 * Resolve the eye shift for one gaze update. Priority — focus is
 * temporary, the alive state is the default:
 * 1. Attention (a prompt just submitted): full look at the input.
 * 2. Glow (something is glowing): full look at the glowing element —
 *    noticing, part of feeling alive, released when the glow ends.
 * 3. An agent's cursor acting right now (moved within
 *    AGENT_ACTING_WINDOW_MS): full look at that agent.
 * 4. The user's cursor (moved recently): a glance, scaled by the gaze
 *    sensitivity — never a beam. At sensitivity 0 the user cursor is
 *    ignored entirely.
 * 5. Otherwise the idle wander target — the eyes look around on their own.
 */
export function resolveGazeTarget(ctx: GazeContext): GazeOffset {
  const { faceCenter } = ctx;
  if (ctx.attention && ctx.now < ctx.attention.until) {
    return gazeForPoint(ctx.attention.x, ctx.attention.y, faceCenter.x, faceCenter.y);
  }
  if (ctx.glowPoint) {
    return gazeForPoint(ctx.glowPoint.x, ctx.glowPoint.y, faceCenter.x, faceCenter.y);
  }
  const agent = pickFollowTarget(
    ctx.cursors.filter((c) => c.id !== 'user'),
    ctx.now,
    AGENT_ACTING_WINDOW_MS,
  );
  if (agent) {
    return gazeForPoint(agent.x, agent.y, faceCenter.x, faceCenter.y);
  }
  const user = pickFollowTarget(
    ctx.cursors.filter((c) => c.id === 'user'),
    ctx.now,
    POINTER_IDLE_MS,
  );
  if (user) {
    const s = clamp(ctx.sensitivity, 0, 1);
    if (s > 0) {
      const g = gazeForPoint(user.x, user.y, faceCenter.x, faceCenter.y);
      return { dx: g.dx * s, dy: g.dy * s };
    }
    // Sensitivity 0: the user cursor is ignored entirely — fall
    // through to the wander target instead of staring forward.
  }
  return ctx.wander;
}

/** Clamp a value into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Eye shift for a target point, given the face centre (both in client
 * pixels). The shift points from the face centre toward the target, at
 * full deflection once the target is GAZE_REACH_PX away or more, and
 * proportionally less for nearer targets. At the centre the shift is 0.
 */
export function gazeForPoint(
  px: number,
  py: number,
  faceCx: number,
  faceCy: number,
): GazeOffset {
  const vx = px - faceCx;
  const vy = py - faceCy;
  const dist = Math.hypot(vx, vy);
  if (dist < 1) return { dx: 0, dy: 0 };
  const strength = Math.min(1, dist / GAZE_REACH_PX);
  return {
    dx: (vx / dist) * strength * GAZE_MAX_DX,
    dy: (vy / dist) * strength * GAZE_MAX_DY,
  };
}

/**
 * Tilt for a horizontal eye shift: looking left tilts the eyes slightly
 * counter-clockwise, looking right slightly clockwise, capped at
 * GAZE_MAX_TILT_DEG either way. Forward gaze (dx = 0) is untilted.
 */
export function tiltForDx(dx: number): number {
  return clamp(dx / GAZE_MAX_DX, -1, 1) * GAZE_MAX_TILT_DEG;
}

/** Random delay until the next idle wander pick, in [2500, 4500] ms. */
export function nextWanderDelayMs(rand: () => number = Math.random): number {
  return WANDER_MIN_DELAY_MS + rand() * (WANDER_MAX_DELAY_MS - WANDER_MIN_DELAY_MS);
}

/** A random nearby wander target — a small drift, never a full look. */
export function pickWanderTarget(rand: () => number = Math.random): GazeOffset {
  return {
    dx: (rand() * 2 - 1) * WANDER_MAX_DX,
    dy: (rand() * 2 - 1) * WANDER_MAX_DY,
  };
}

/** Which glowing element the eyes should notice, if any. */
export type GlowAnchor = 'prompt-input' | 'titlebar-dot';

/**
 * Which glow the eyes notice, from the loading store's active keys.
 * The command processing glow (the rainbow border around the prompt
 * input) wins — it is the closest glow and the one the user just made.
 * Otherwise the top-left dot's swirl (model install / LuciferAI probe)
 * is the glow. No active glow means no anchor.
 */
export function glowAnchorForKeys(activeKeys: readonly string[]): GlowAnchor | null {
  if (activeKeys.includes('command')) return 'prompt-input';
  if (activeKeys.includes('model-install') || activeKeys.includes('lucifer-check')) {
    return 'titlebar-dot';
  }
  return null;
}
