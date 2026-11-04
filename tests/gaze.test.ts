/**
 * Gaze logic tests.
 *
 * The Sentinel face's eyes follow a cursor, tilt a little in the
 * direction of the look, notice glows, and wander when idle. The
 * follow target is whichever cursor moved most recently — today the
 * user's pointer, later any agent's cursor too.
 *
 * Run with: npm test
 */

import {
  GAZE_MAX_DX,
  GAZE_MAX_DY,
  GAZE_MAX_TILT_DEG,
  GAZE_REACH_PX,
  WANDER_MIN_DELAY_MS,
  WANDER_MAX_DELAY_MS,
  WANDER_MAX_DX,
  WANDER_MAX_DY,
  POINTER_IDLE_MS,
  AGENT_ACTING_WINDOW_MS,
  gazeForPoint,
  tiltForDx,
  nextWanderDelayMs,
  pickWanderTarget,
  glowAnchorForKeys,
  pickFollowTarget,
  focusTransitionMs,
  resolveGazeTarget,
  type FollowCursor,
  type GazeContext,
} from '../src/components/Synth/gaze';
import {
  ATTENTION_DURATION_MS,
  useGazeStore,
  isAttentionActive,
  setCursor,
  getCursors,
  removeCursor,
} from '../src/stores/gazeStore';

describe('gazeForPoint', () => {
  const cx = 1000;
  const cy = 500;

  test('at the face centre the eyes stay forward', () => {
    expect(gazeForPoint(cx, cy, cx, cy)).toEqual({ dx: 0, dy: 0 });
  });

  test('far right shifts the eyes fully right, no vertical shift', () => {
    const g = gazeForPoint(cx + 1000, cy, cx, cy);
    expect(g.dx).toBeCloseTo(GAZE_MAX_DX, 6);
    expect(g.dy).toBeCloseTo(0, 6);
  });

  test('far left shifts the eyes fully left', () => {
    const g = gazeForPoint(cx - 1000, cy, cx, cy);
    expect(g.dx).toBeCloseTo(-GAZE_MAX_DX, 6);
    expect(g.dy).toBeCloseTo(0, 6);
  });

  test('far above shifts the eyes fully up', () => {
    const g = gazeForPoint(cx, cy - 1000, cx, cy);
    expect(g.dx).toBeCloseTo(0, 6);
    expect(g.dy).toBeCloseTo(-GAZE_MAX_DY, 6);
  });

  test('a near point shifts the eyes proportionally less', () => {
    const g = gazeForPoint(cx + GAZE_REACH_PX / 2, cy, cx, cy);
    expect(g.dx).toBeCloseTo(GAZE_MAX_DX / 2, 6);
  });

  test('diagonal target shifts both axes, each within its cap', () => {
    const g = gazeForPoint(cx + 1000, cy + 1000, cx, cy);
    expect(Math.abs(g.dx)).toBeLessThanOrEqual(GAZE_MAX_DX);
    expect(Math.abs(g.dy)).toBeLessThanOrEqual(GAZE_MAX_DY);
    expect(g.dx).toBeGreaterThan(0);
    expect(g.dy).toBeGreaterThan(0);
  });
});

describe('tiltForDx', () => {
  test('forward gaze is untilted', () => {
    expect(tiltForDx(0)).toBe(0);
  });

  test('full right look tilts clockwise to the cap', () => {
    expect(tiltForDx(GAZE_MAX_DX)).toBeCloseTo(GAZE_MAX_TILT_DEG, 6);
  });

  test('full left look tilts counter-clockwise to the cap', () => {
    expect(tiltForDx(-GAZE_MAX_DX)).toBeCloseTo(-GAZE_MAX_TILT_DEG, 6);
  });

  test('tilt is proportional and clamps beyond full deflection', () => {
    expect(tiltForDx(GAZE_MAX_DX / 2)).toBeCloseTo(GAZE_MAX_TILT_DEG / 2, 6);
    expect(tiltForDx(GAZE_MAX_DX * 10)).toBeCloseTo(GAZE_MAX_TILT_DEG, 6);
    expect(tiltForDx(-GAZE_MAX_DX * 10)).toBeCloseTo(-GAZE_MAX_TILT_DEG, 6);
  });
});

describe('idle wander', () => {
  test('wander delay stays in range', () => {
    for (let i = 0; i < 50; i++) {
      const d = nextWanderDelayMs();
      expect(d).toBeGreaterThanOrEqual(WANDER_MIN_DELAY_MS);
      expect(d).toBeLessThanOrEqual(WANDER_MAX_DELAY_MS);
    }
  });

  test('wander target stays small — a drift, not a stare', () => {
    for (let i = 0; i < 50; i++) {
      const t = pickWanderTarget();
      expect(Math.abs(t.dx)).toBeLessThanOrEqual(WANDER_MAX_DX);
      expect(Math.abs(t.dy)).toBeLessThanOrEqual(WANDER_MAX_DY);
    }
  });

  test('wander is deterministic with an injected random source', () => {
    expect(pickWanderTarget(() => 0)).toEqual({ dx: -WANDER_MAX_DX, dy: -WANDER_MAX_DY });
    expect(pickWanderTarget(() => 1)).toEqual({ dx: WANDER_MAX_DX, dy: WANDER_MAX_DY });
  });
});

describe('glowAnchorForKeys', () => {
  test('no glow, no anchor', () => {
    expect(glowAnchorForKeys([])).toBeNull();
  });

  test('command glow points at the prompt input', () => {
    expect(glowAnchorForKeys(['command'])).toBe('prompt-input');
  });

  test('install / probe glow points at the top-left dot', () => {
    expect(glowAnchorForKeys(['model-install'])).toBe('titlebar-dot');
    expect(glowAnchorForKeys(['lucifer-check'])).toBe('titlebar-dot');
  });

  test('command glow wins over the dot glow', () => {
    expect(glowAnchorForKeys(['lucifer-check', 'command'])).toBe('prompt-input');
  });
});

describe('pickFollowTarget', () => {
  const now = 1_000_000;
  const cursor = (id: string, at: number): FollowCursor => ({ id, x: 0, y: 0, at });

  test('no cursors, no target', () => {
    expect(pickFollowTarget([], now)).toBeNull();
  });

  test('a single fresh cursor is the target', () => {
    expect(pickFollowTarget([cursor('user', now - 100)], now)).toEqual(
      expect.objectContaining({ id: 'user' }),
    );
  });

  test('the most recently moved cursor wins — later agents included', () => {
    const target = pickFollowTarget(
      [cursor('user', now - 500), cursor('agent:claw', now - 100)],
      now,
    );
    expect(target?.id).toBe('agent:claw');
    const target2 = pickFollowTarget(
      [cursor('agent:claw', now - 500), cursor('user', now - 50)],
      now,
    );
    expect(target2?.id).toBe('user');
  });

  test('a stale cursor is not followed', () => {
    expect(
      pickFollowTarget([cursor('user', now - POINTER_IDLE_MS - 1)], now),
    ).toBeNull();
  });

  test('a stale cursor loses to a fresh one', () => {
    const target = pickFollowTarget(
      [cursor('agent:old', now - POINTER_IDLE_MS - 1000), cursor('user', now - 10)],
      now,
    );
    expect(target?.id).toBe('user');
  });
});

describe('focusTransitionMs', () => {
  test('low sensitivity drifts slowly, high sensitivity locks on fast', () => {
    expect(focusTransitionMs(0)).toBe(500);
    expect(focusTransitionMs(1)).toBe(150);
    expect(focusTransitionMs(0.5)).toBe(325);
  });

  test('clamps outside 0..1', () => {
    expect(focusTransitionMs(-1)).toBe(500);
    expect(focusTransitionMs(2)).toBe(150);
  });
});

describe('resolveGazeTarget — alive by default, focus only when needed', () => {
  const now = 1_000_000;
  const faceCenter = { x: 1000, y: 500 };
  const wander = { dx: 0.5, dy: -0.3 };
  const base: GazeContext = {
    faceCenter,
    attention: null,
    glowPoint: null,
    cursors: [],
    sensitivity: 0.5,
    wander,
    now,
  };

  test('no action, no glow, no cursor: the eyes wander (alive)', () => {
    expect(resolveGazeTarget(base)).toEqual(wander);
  });

  test('the user cursor only pulls a sensitivity-scaled glance, never a beam', () => {
    const ctx: GazeContext = {
      ...base,
      cursors: [{ id: 'user', x: 2000, y: 500, at: now - 100 }],
    };
    const half = resolveGazeTarget(ctx);
    expect(half.dx).toBeCloseTo(GAZE_MAX_DX * 0.5, 6);
    expect(half.dy).toBeCloseTo(0, 6);
    // At sensitivity 0 the user cursor is ignored entirely.
    expect(resolveGazeTarget({ ...ctx, sensitivity: 0 })).toEqual(wander);
    // At sensitivity 1 the eyes track it fully.
    expect(resolveGazeTarget({ ...ctx, sensitivity: 1 }).dx).toBeCloseTo(GAZE_MAX_DX, 6);
  });

  test('a stale user cursor is ignored — the eyes go back to wandering', () => {
    const ctx: GazeContext = {
      ...base,
      cursors: [{ id: 'user', x: 2000, y: 500, at: now - POINTER_IDLE_MS - 1 }],
    };
    expect(resolveGazeTarget(ctx)).toEqual(wander);
  });

  test('an agent cursor acting right now focuses the eyes fully', () => {
    const ctx: GazeContext = {
      ...base,
      cursors: [
        { id: 'user', x: 2000, y: 500, at: now - 100 },
        { id: 'agent:claw', x: 0, y: 500, at: now - 100 },
      ],
    };
    // The acting agent wins over the user's cursor — full look left.
    expect(resolveGazeTarget(ctx).dx).toBeCloseTo(-GAZE_MAX_DX, 6);
  });

  test('an agent cursor that stopped acting releases the eyes', () => {
    const ctx: GazeContext = {
      ...base,
      cursors: [{ id: 'agent:claw', x: 0, y: 500, at: now - AGENT_ACTING_WINDOW_MS - 1 }],
    };
    expect(resolveGazeTarget(ctx)).toEqual(wander);
  });

  test('a glow beats the user cursor — the eyes notice it', () => {
    const ctx: GazeContext = {
      ...base,
      glowPoint: { x: 0, y: 500 },
      cursors: [{ id: 'user', x: 2000, y: 500, at: now - 100 }],
    };
    expect(resolveGazeTarget(ctx).dx).toBeCloseTo(-GAZE_MAX_DX, 6);
  });

  test('attention beats glow and cursors — a prompt just submitted', () => {
    const ctx: GazeContext = {
      ...base,
      attention: { x: 2000, y: 500, until: now + 1000 },
      glowPoint: { x: 0, y: 500 },
      cursors: [{ id: 'agent:claw', x: 0, y: 500, at: now - 100 }],
    };
    expect(resolveGazeTarget(ctx).dx).toBeCloseTo(GAZE_MAX_DX, 6);
  });

  test('expired attention releases — the eyes go back to wandering', () => {
    const ctx: GazeContext = {
      ...base,
      attention: { x: 2000, y: 500, until: now - 1 },
    };
    expect(resolveGazeTarget(ctx)).toEqual(wander);
  });
});

describe('useGazeStore attention', () => {
  beforeEach(() => {
    useGazeStore.setState({ attention: null });
  });

  test('starts with no attention', () => {
    expect(useGazeStore.getState().attention).toBeNull();
  });

  test('setAttention holds a point until its expiry', () => {
    const api = useGazeStore.getState();
    api.setAttention(10, 20, ATTENTION_DURATION_MS);
    const att = useGazeStore.getState().attention;
    expect(att).not.toBeNull();
    expect(att!.x).toBe(10);
    expect(att!.y).toBe(20);
    expect(isAttentionActive(att, Date.now())).toBe(true);
    expect(isAttentionActive(att, Date.now() + ATTENTION_DURATION_MS + 1)).toBe(false);
  });

  test('clearAttention drops it', () => {
    const api = useGazeStore.getState();
    api.setAttention(10, 20);
    api.clearAttention();
    expect(useGazeStore.getState().attention).toBeNull();
  });
});

describe('cursor registry', () => {
  beforeEach(() => {
    for (const c of getCursors()) removeCursor(c.id);
  });

  test('registers the user cursor and reads it back', () => {
    setCursor('user', 100, 200, 5000);
    expect(getCursors()).toEqual([{ id: 'user', x: 100, y: 200, at: 5000 }]);
  });

  test('a later agent cursor registers alongside the user cursor', () => {
    setCursor('user', 100, 200, 5000);
    setCursor('agent:claw', 300, 400, 6000);
    expect(getCursors()).toHaveLength(2);
    expect(pickFollowTarget(getCursors(), 6000)?.id).toBe('agent:claw');
  });

  test('updating a cursor replaces its position, it does not duplicate', () => {
    setCursor('user', 100, 200, 5000);
    setCursor('user', 150, 250, 6000);
    expect(getCursors()).toEqual([{ id: 'user', x: 150, y: 250, at: 6000 }]);
  });

  test('removeCursor forgets it', () => {
    setCursor('user', 100, 200, 5000);
    removeCursor('user');
    expect(getCursors()).toEqual([]);
  });
});
