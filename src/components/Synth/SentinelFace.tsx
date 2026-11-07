/**
 * SentinelFace — the Sentinel's face, standalone, now with horns.
 *
 * The simple emoji face from the synth: head circle, void eyes, fanged
 * maw. Its colour is the Homunculus colour — purple or pink, chosen on
 * first entry to the Synth view and stored as the `homunculusColor`
 * setting. No choice yet (or an invalid one) and the face is unformed —
 * black, with no eyes — until a colour is chosen, when the eyes fade
 * in and the head line draws itself (the wake-up reveal). The horns
 * are part of the face and wear the same colour.
 *
 * Horns (Gary, 2026-11-04): a pair of horns grows out of the top of the
 * head. They grow the more often you prompt and regress when your
 * prompting average is not being kept up — driven by the prompting pace
 * in promptPaceStore (an exponentially-decayed average, so a steady pace
 * settles at a stable horn length and the average nulls out instead of
 * growing forever). Horn length is the pace level, 0 (no horns) to 1
 * (full horns), scaled smoothly from the horn base with a CSS transition.
 * The horns wear the Homunculus colour, like the rest of the face.
 *
 * Blinks (Gary, 2026-11-04): the eyes blink every once in a while, on
 * a random interval — usually once, sometimes twice in quick succession.
 * Rarely a blink is offset: one eye leads and the other follows a short
 * delay later, and the offset can go either way (left first or right
 * first). The blink is a scaleY squash of each eye from its own centre,
 * driven by a small JS state machine — not a constant CSS animation loop,
 * so the blinks stay occasional and irregular.
 *
 * Blood (Gary, 2026-11-04): when LuciferAI is running a task, tiny
 * blood pixels drip from the fang tips: faintly visible, falling
 * downward until they fall off the face, then gone. A task is either
 * an AI-chat generation in flight (`useAIStore.isLoading`) or a
 * terminal command routed through the LuciferAI plugin (the
 * `loadingStore` 'lucifer-task' key, set by Terminal.runPluginCommand
 * around `lucid.command`). A plain shell command sets neither, so it
 * never starts the drip. The drip is irregular — an occasional drip,
 * not a pour — and only a handful of pixels are ever falling at once.
 * The signals are real task-running states, not timers.
 *
 * Gaze (Gary, 2026-11-04): the eyes look around and follow actions —
 * alive by default, not beamed on the user's cursor. They wander on
 * their own, glance at glows, and only lock on while an agent is
 * acting (a prompt just submitted, a glow, an agent cursor moving
 * right now). The user's cursor only pulls them by the gaze
 * sensitivity (Settings › Gaze sensitivity) — a glance, never a beam.
 * As the eyes look around they tilt a little in the direction of the
 * look. The gaze target is resolved by resolveGazeTarget (gaze.ts);
 * the follow target is the cursor registry in gazeStore, so later any
 * agent's cursor can be the one the eyes follow.
 *
 * Horn wiggle (Gary, 2026-11-04): when a task completes, the horns
 * wiggle inward a bit — each horn rotates a few degrees toward the
 * centre and back, ~450ms, via the `sentinel-horn-wiggle` keyframe.
 * The trigger is the hornWiggleStore sequence (bumped by aiStore's
 * completeStream / setLoading(false) and Terminal's handleSubmit
 * finally, debounced so one task wiggles once). The wiggle is an
 * extra rotation on top of the pace scale — it never changes the
 * horn length.
 *
 * Pure presentational component — no IPC. It subscribes to the pace
 * store and ticks it on a slow interval so idle horns regress visibly.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePromptPaceStore, hornScaleForLevel } from '../../stores/promptPaceStore';
import { useAIStore } from '../../stores/aiStore';
import { useLoadingStore } from '../../stores/loadingStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useForgeStore } from '../../stores/forgeStore';
import {
  HOMUNCULUS_EYE_FADE_MS,
  HOMUNCULUS_LINE_DRAW_MS,
  HOMUNCULUS_REVEAL_MS,
  HOMUNCULUS_THEMES,
  HOMUNCULUS_UNFORMED_THEME,
  parseHomunculusColor,
  stopColorTheme,
  type HomunculusColor,
} from '../../lib/homunculusColor';
import './SentinelFace.css';
import { useGazeStore, setCursor, getCursors } from '../../stores/gazeStore';
import { useHornWiggleStore, WIGGLE_DURATION_MS } from '../../stores/hornWiggleStore';
import {
  nextBlinkDelayMs,
  isDoubleBlink,
  isOffsetBlink,
  offsetDirection,
  offsetDelayMs,
  BLINK_CLOSED_MS,
  DOUBLE_BLINK_GAP_MS,
} from './blink';
import {
  resolveGazeTarget,
  tiltForDx,
  glowAnchorForKeys,
  nextWanderDelayMs,
  pickWanderTarget,
  focusTransitionMs,
  screenPointToClient,
  type GazeOffset,
} from './gaze';
import {
  BLOOD_COLOR,
  BLOOD_OPACITY,
  BLOOD_RADIUS,
  MAX_DRIPS,
  nextDripDelayMs,
  pickFang,
  dripFallMs,
  fangTip,
  shouldDrip,
} from './blood';

type EyeSide = 'left' | 'right';

/** Eye close/open transition — fast, so the blink reads as a blink. */
const EYE_BLINK_TRANSITION_MS = 90;

/** The head circle's radius (r = 17) and circumference (2 * pi * 17),
    the distance the wake-up line draw travels. */
const HOMUNCULUS_HEAD_RADIUS = 17;
const HOMUNCULUS_HEAD_CIRCUMFERENCE = 2 * Math.PI * HOMUNCULUS_HEAD_RADIUS;

/** Reduced motion (mirrors the splash screen's helper): the reveal
    animation is skipped and the final face shows at once. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function SentinelFace({
  size = 28,
  color,
}: {
  size?: number;
  /** The Homunculus colour to wear. When given, it overrides the
      colour stored in Settings — the Forge roster card passes each
      Homunculus's own colour, so two Homunculi of different colours
      show different faces. When omitted, the face reads the colour
      from Settings as before (the prompt-bar button and Synth view).
      An explicit `null` means unformed (black, no eyes). */
  color?: HomunculusColor | null;
}) {
  const level = usePromptPaceStore((s) => s.level);

  // Slow tick so the horns regress while the user is idle — the store's
  // tick only re-renders when the level visibly moved.
  useEffect(() => {
    const id = setInterval(() => usePromptPaceStore.getState().tick(), 5000);
    return () => clearInterval(id);
  }, []);

  // --- Blinks -----------------------------------------------------------
  // Each eye squashes to near-zero height briefly. The scheduler is a
  // timeout chain (not an interval): after each blink event it draws a
  // fresh random delay, so blinks are occasional and irregular. A blink
  // event is usually a single blink, sometimes a double; rarely it is
  // offset, with one eye leading and the other lagging by 60–150ms, and
  // the leading eye is picked at random each time so the offset can go
  // both ways. The lagging eye opens later too, so the offset is
  // preserved through the whole blink.
  const [leftClosed, setLeftClosed] = useState(false);
  const [rightClosed, setRightClosed] = useState(false);
  const blinkTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = blinkTimersRef.current;
    let cancelled = false;
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => later(resolve, ms));

    const setEye = (side: EyeSide, closed: boolean) => {
      if (cancelled) return;
      (side === 'left' ? setLeftClosed : setRightClosed)(closed);
    };

    const blinkOnce = async (offset: { side: EyeSide; delayMs: number } | null) => {
      const lead: EyeSide = offset ? offset.side : 'left';
      const lag: EyeSide = lead === 'left' ? 'right' : 'left';
      const lagDelay = offset ? offset.delayMs : 0;
      setEye(lead, true);
      if (lagDelay > 0) await sleep(lagDelay);
      setEye(lag, true);
      await sleep(BLINK_CLOSED_MS);
      setEye(lead, false);
      if (lagDelay > 0) await sleep(lagDelay);
      setEye(lag, false);
    };

    const runBlinkEvent = async () => {
      const offset = isOffsetBlink()
        ? { side: offsetDirection(), delayMs: offsetDelayMs() }
        : null;
      await blinkOnce(offset);
      if (isDoubleBlink()) {
        await sleep(DOUBLE_BLINK_GAP_MS);
        await blinkOnce(offset);
      }
    };

    const scheduleNext = () => {
      later(async () => {
        if (cancelled) return;
        await runBlinkEvent();
        if (!cancelled) scheduleNext();
      }, nextBlinkDelayMs());
    };
    scheduleNext();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };
  }, []);

  const eyeStyle = (closed: boolean): CSSProperties => ({
    transform: closed ? 'scaleY(0.08)' : 'scaleY(1)',
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transition: `transform ${EYE_BLINK_TRANSITION_MS}ms ease-in-out`,
  });

  // --- Blood drip -------------------------------------------------------
  // LuciferAI running a task = an AI-chat generation in flight, or a
  // terminal command routed through the LuciferAI plugin (the
  // 'lucifer-task' loading key — a dedicated key, because the
  // terminal's shared 'command' key covers plain shell commands too
  // and must not start the drip). While either is true, a timeout
  // chain spawns a tiny blood pixel at a random fang tip every
  // 350–900ms (irregular — a drip, not a pour). Each pixel falls 12
  // SVG units and fades out (the sentinel-blood-drip keyframe), then
  // removes itself on animation end. When the task ends the chain
  // stops: no new pixels spawn, and the ones already falling finish
  // their fall and vanish. At most MAX_DRIPS (6) are ever in flight
  // at once — if the cap is hit, that tick spawns nothing. The pixels
  // are pointer-events none, so they can never intercept a click on
  // the face button, and they live inside the SVG, so they cannot
  // affect layout. The SVG has overflow visible so a pixel can fall
  // past the SVG's bottom edge and off the face.
  const aiChatLoading = useAIStore((s) => s.isLoading);
  const pluginTaskActive = useLoadingStore((s) => s.active['lucifer-task'] > 0);
  const runningTask = shouldDrip(aiChatLoading, pluginTaskActive);
  interface Drip {
    id: number;
    x: number;
    y: number;
    durationMs: number;
  }
  const [drips, setDrips] = useState<Drip[]>([]);
  const dripIdRef = useRef(0);

  useEffect(() => {
    if (!runningTask) return;
    let cancelled = false;
    let timer = 0;
    const spawn = () => {
      if (cancelled) return;
      setDrips((prev) => {
        if (prev.length >= MAX_DRIPS) return prev;
        const tip = fangTip(pickFang());
        const id = ++dripIdRef.current;
        return [...prev, { id, x: tip.x, y: tip.y, durationMs: dripFallMs() }];
      });
      timer = window.setTimeout(spawn, nextDripDelayMs());
    };
    timer = window.setTimeout(spawn, nextDripDelayMs());
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runningTask]);

  const removeDrip = (id: number) => {
    setDrips((prev) => prev.filter((d) => d.id !== id));
  };

  // --- Gaze -------------------------------------------------------------
  // Alive by default: the eyes wander on their own and only lock on
  // while an agent is acting (a prompt just submitted, a glow, or an
  // agent cursor moving right now). The user's own cursor only pulls
  // them by the gaze sensitivity — a glance, never a beam. The target
  // is resolved by resolveGazeTarget (gaze.ts) on a rAF-throttled
  // update; the eye transform eases toward it, so focusing and
  // releasing are both smooth drifts, never snaps. The blink still
  // closes the eyes wherever they are looking — the blink scaleY is
  // on each eye, the gaze transforms are on ancestor groups.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wanderRef = useRef<GazeOffset>({ dx: 0, dy: 0 });
  const rafRef = useRef(0);
  const [gaze, setGaze] = useState<GazeOffset & { tiltDeg: number }>({ dx: 0, dy: 0, tiltDeg: 0 });
  const gazeRef = useRef(gaze);
  gazeRef.current = gaze;
  const attention = useGazeStore((s) => s.attention);
  const activeKeys = useLoadingStore((s) => s.activeKeys);
  const sensitivity = (useSettingsStore((s) => s.settings?.gazeSensitivity) ?? 50) / 100;

  // Homunculus colour — purple or pink, chosen on first entry to the
  // Synth view and stored as the `homunculusColor` setting. The whole
  // face wears it: horns, head outline, and eyes. No choice yet (or an
  // invalid one) and the face is unformed: black, with no eyes — the
  // unformed theme, and the eyes and maw are not rendered at all.
  // Pink is the face's current variation; purple is the new alternative.
  //
  // An explicit `color` prop wins over Settings — the Forge roster
  // card passes each Homunculus's own colour. `undefined` means "no
  // override, read Settings"; an explicit `null` means unformed.
  const settingsHomunculusColor = parseHomunculusColor(
    useSettingsStore((s) => s.settings?.homunculusColor),
  );
  const chosenHomunculusColor =
    color !== undefined ? color : settingsHomunculusColor;
  // Stop colour (Gary, 2026-11-06): when a stop is hit, the action
  // face colours to the stop's colour. The override applies only to
  // faces that read the setting (the main displayed face) — a face
  // with an explicit `color` prop (a Forge roster card) wears its own
  // Homunculus's colour and is never recoloured by a stop. The
  // override is theme-only: it never changes `chosenHomunculusColor`,
  // so the wake-up reveal and the eyes are untouched, and when the
  // colour expires the face regresses to the last validated solid
  // (the active Homunculus's colour) simply by the override clearing.
  const stopFaceColor = useForgeStore((s) =>
    s.unison.stopFaceColorActive && color === undefined
      ? s.unison.stopColor
      : null,
  );
  const homunculusTheme =
    stopFaceColor !== null
      ? stopColorTheme(stopFaceColor)
      : chosenHomunculusColor
        ? HOMUNCULUS_THEMES[chosenHomunculusColor]
        : HOMUNCULUS_UNFORMED_THEME;

  // --- Wake-up reveal ---------------------------------------------------
  // The face starts unformed (black, no eyes). The moment a colour is
  // chosen, the eyes fade in and the head line draws itself — the
  // Homunculus waking up. The reveal fires only on the null -> colour
  // transition: not on mount with a colour already stored, and not
  // when switching between pink and purple. Reduced motion skips the
  // animation and shows the final face at once.
  //
  // Two effects, not one timer effect: React StrictMode double-invokes
  // effects in dev, and a single effect that both sets and clears the
  // flag could leave `revealing` stuck true. The trigger effect only
  // ever sets it; the clearing effect only ever clears it.
  const [revealing, setRevealing] = useState(false);
  const prevChosenRef = useRef(chosenHomunculusColor);
  useEffect(() => {
    const prev = prevChosenRef.current;
    prevChosenRef.current = chosenHomunculusColor;
    if (
      prev === null &&
      chosenHomunculusColor !== null &&
      !prefersReducedMotion()
    ) {
      setRevealing(true);
    }
  }, [chosenHomunculusColor]);
  useEffect(() => {
    if (!revealing) return;
    const id = window.setTimeout(
      () => setRevealing(false),
      HOMUNCULUS_REVEAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [revealing]);
  const attentionRef = useRef(attention);
  attentionRef.current = attention;
  const activeKeysRef = useRef(activeKeys);
  activeKeysRef.current = activeKeys;
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;

  const updateGaze = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const faceCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const anchor = glowAnchorForKeys(activeKeysRef.current);
    let glowPoint: { x: number; y: number } | null = null;
    if (anchor) {
      const el = document.querySelector(`[data-glow-anchor="${anchor}"]`);
      const r = el?.getBoundingClientRect();
      if (r) glowPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const offset = resolveGazeTarget({
      faceCenter,
      attention: attentionRef.current,
      glowPoint,
      cursors: getCursors(),
      sensitivity: sensitivityRef.current,
      wander: wanderRef.current,
      now: Date.now(),
    });
    const next = { ...offset, tiltDeg: tiltForDx(offset.dx) };
    const prev = gazeRef.current;
    if (
      Math.abs(next.dx - prev.dx) < 0.01 &&
      Math.abs(next.dy - prev.dy) < 0.01 &&
      Math.abs(next.tiltDeg - prev.tiltDeg) < 0.05
    ) {
      return;
    }
    setGaze(next);
  }, []);

  // The user's pointer registers as the 'user' cursor — one entry in
  // the follow-target registry, not a special case. Later, any agent's
  // cursor registers the same way and the most recently moved one wins.
  //
  // Off-window cursor: pointer events only fire inside the app's
  // window, so the main process also polls the global cursor position
  // (screen coordinates, works anywhere on the desktop) and pushes it
  // over IPC. The point is converted to client coordinates with the
  // window's live screen position and fed into the SAME 'user' entry
  // the mousemove path writes — most recent write wins, and the
  // priority, sensitivity, idle timeout, and smoothing all apply
  // unchanged. No lucidAPI in tests/SSR: skip quietly.
  //
  // The listeners re-attach on every face switch (Gary, 2026-11-06):
  // the eyes followed the mouse on the first face and stopped on the
  // main face after switching faces. A face switch re-renders the
  // face with a new colour, and the gaze wiring must be re-established
  // fresh on that switch — depending on the chosen colour makes the
  // effect tear down and re-attach the listeners (and the global
  // cursor subscription) whenever the face swaps, so a dropped
  // listener or a stale subscription can never survive a switch.
  useEffect(() => {
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateGaze);
    };
    const onPointer = (e: PointerEvent) => {
      setCursor('user', e.clientX, e.clientY);
      schedule();
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    const onGlobalPoint = window.lucidAPI?.cursor?.onGlobalPoint;
    const unsubscribeGlobal = onGlobalPoint
      ? onGlobalPoint((sx, sy) => {
          const c = screenPointToClient(sx, sy, window.screenX, window.screenY);
          setCursor('user', c.x, c.y);
          schedule();
        })
      : undefined;
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      unsubscribeGlobal?.();
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateGaze, chosenHomunculusColor]);

  // Re-evaluate regularly: attention expires, the pointer goes idle,
  // and a glow's anchor can move — the eyes release back to wandering
  // on their own instead of waiting for the next pointer move.
  useEffect(() => {
    const id = window.setInterval(updateGaze, 500);
    return () => window.clearInterval(id);
  }, [updateGaze]);

  // Idle wander: every few seconds pick a new nearby drift target.
  // The target only applies while nothing is focusing the eyes.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const pick = () => {
      if (cancelled) return;
      wanderRef.current = pickWanderTarget();
      updateGaze();
      timer = window.setTimeout(pick, nextWanderDelayMs());
    };
    timer = window.setTimeout(pick, nextWanderDelayMs());
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [updateGaze]);

  // Attention, glow, and sensitivity changes take effect at once —
  // the eyes look at a fresh prompt / glow without waiting for the
  // next tick, and a slider change re-aims them live. A face switch
  // re-aims them too (Gary, 2026-11-06): the eyes must pick up the
  // cursor on the new face at once, not wait for the next pointer
  // move or the 500ms tick.
  useEffect(() => {
    updateGaze();
  }, [attention, activeKeys, sensitivity, chosenHomunculusColor, updateGaze]);

  const transitionMs = focusTransitionMs(sensitivity);
  const tiltStyle: CSSProperties = {
    transform: `rotate(${gaze.tiltDeg}deg)`,
    transformBox: 'view-box',
    transformOrigin: '60px 54px',
    transition: `transform ${transitionMs}ms ease-out`,
  };
  const gazeStyle: CSSProperties = {
    transform: `translate(${gaze.dx}px, ${gaze.dy}px)`,
    transformBox: 'view-box',
    transition: `transform ${transitionMs}ms ease-out`,
  };

  const scale = hornScaleForLevel(level);
  // Below ~2% the horns are invisible anyway — fade them out so a
  // collapsed path never renders as a speck.
  const opacity = scale > 0.02 ? 1 : 0;
  const hornStyle: CSSProperties = {
    transform: `scale(${Math.max(scale, 0.001)})`,
    transformBox: 'fill-box',
    transformOrigin: '50% 100%',
    transition: 'transform 1.2s ease, opacity 1.2s ease',
    opacity,
  };

  // --- Horn wiggle ------------------------------------------------------
  // When a task completes the horns wiggle inward once: each horn
  // rotates a few degrees toward the centre and back, ~450ms, via the
  // `sentinel-horn-wiggle` keyframe. The store's seq bumps once per
  // completion (debounced, so one task wiggles once); the face runs
  // the keyframe once per bump. The wiggle is an extra rotation on
  // top of the pace scale — it never changes the horn length, and the
  // 500ms debounce is longer than the 450ms wiggle, so a new bump
  // always restarts the animation cleanly.
  const wiggleSeq = useHornWiggleStore((s) => s.seq);
  const [wiggling, setWiggling] = useState(false);
  const wiggleTimerRef = useRef(0);
  useEffect(() => {
    if (wiggleSeq === 0) return;
    setWiggling(true);
    window.clearTimeout(wiggleTimerRef.current);
    wiggleTimerRef.current = window.setTimeout(
      () => setWiggling(false),
      WIGGLE_DURATION_MS,
    );
    return () => window.clearTimeout(wiggleTimerRef.current);
  }, [wiggleSeq]);

  // One horn's wiggle style: rotate about its own base (bottom centre
  // of its bounding box). --wiggle-dir is 1 for the left horn (its tip
  // moves right, inward) and -1 for the right horn (tip moves left).
  const hornWiggleStyle = (dir: 1 | -1): CSSProperties => {
    const style = {
      transformBox: 'fill-box',
      transformOrigin: '50% 100%',
      animation: wiggling
        ? `sentinel-horn-wiggle ${WIGGLE_DURATION_MS}ms ease-in-out`
        : undefined,
    } as CSSProperties & Record<string, string | number | undefined>;
    style['--wiggle-dir'] = dir;
    return style;
  };

  return (
    <svg
      ref={svgRef}
      viewBox="36 28 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="Sentinel face"
      style={{ overflow: 'visible' }}
    >
      {/* Horns — curved blades growing out of the top of the head, in the
          face's Homunculus colour. Scaled from the base (bottom centre of
          each horn) by the prompting pace, 0 = no horns, 1 = full.
          Each horn is its own group so a task completion can wiggle
          it inward (rotate toward the centre and back) on top of the
          pace scale, without changing the horn length. */}
      <g style={hornStyle}>
        <g data-horn="left" style={hornWiggleStyle(1)}>
          <path
            d="M50,45 C45,38 42,33 43,29 C47,34 51,39 54,43 Z"
            fill={homunculusTheme.primary}
            stroke={homunculusTheme.light}
            strokeWidth="0.75"
          />
        </g>
        <g data-horn="right" style={hornWiggleStyle(-1)}>
          <path
            d="M70,45 C75,38 78,33 77,29 C73,34 69,39 66,43 Z"
            fill={homunculusTheme.primary}
            stroke={homunculusTheme.light}
            strokeWidth="0.75"
          />
        </g>
      </g>
      {/* Head + void eyes + fanged maw. Before a colour is chosen the
          face is unformed: black, no eyes, no maw. Once chosen, the eyes
          fade in and the head line draws itself (the wake-up reveal).
          The head circle carries a dasharray of its own circumference
          so the draw can start from a fully hidden line. */}
      <circle
        data-head="true"
        cx="60"
        cy="56"
        r={HOMUNCULUS_HEAD_RADIUS}
        fill="#0a0208"
        stroke={homunculusTheme.primary}
        strokeWidth="1.5"
        strokeDasharray={HOMUNCULUS_HEAD_CIRCUMFERENCE}
        strokeDashoffset={revealing ? undefined : 0}
        style={
          revealing
            ? {
                animation: `homunculus-line-draw ${HOMUNCULUS_LINE_DRAW_MS}ms ease forwards`,
              }
            : undefined
        }
      />
      {/* Gaze — the eyes shift toward what they are looking at and tilt
          a little in the direction of the look. The blink scaleY is on
          each eye itself, so a blink still closes the eyes wherever
          they are looking. The eyes only exist once a colour is chosen
          — the unformed face has none. */}
      <g style={tiltStyle} data-gaze-tilt="true">
        <g style={gazeStyle} data-gaze="true">
          {chosenHomunculusColor !== null && (
            <g
              style={
                revealing
                  ? {
                      animation: `homunculus-eye-fade ${HOMUNCULUS_EYE_FADE_MS}ms ease forwards`,
                    }
                  : undefined
              }
            >
              <circle cx="53" cy="54" r="3" fill={homunculusTheme.light} data-eye="left" style={eyeStyle(leftClosed)} />
              <circle cx="67" cy="54" r="3" fill={homunculusTheme.light} data-eye="right" style={eyeStyle(rightClosed)} />
            </g>
          )}
        </g>
      </g>
      {/* The fanged maw appears with the formed face — it is part of
          the face once it has a colour, not part of the unformed
          placeholder. (It is not animated: the reveal is the eye fade
          and the head line draw.) */}
      {chosenHomunculusColor !== null && (
        <path data-maw="true" d="M54,66 l3,4 l3,-4 l3,4 l3,-4" stroke="#ffffff" strokeWidth="1" fill="none" />
      )}
      {/* Blood — tiny faint pixels dripping from the fang tips while
          LuciferAI is running a task. Each falls and fades (the
          sentinel-blood-drip keyframe), then removes itself. Pointer
          events none: they can never intercept a click on the face. */}
      {drips.map((drip) => (
        <circle
          key={drip.id}
          data-blood="true"
          cx={drip.x}
          cy={drip.y}
          r={BLOOD_RADIUS}
          fill={BLOOD_COLOR}
          opacity={BLOOD_OPACITY}
          pointerEvents="none"
          style={{ animation: `sentinel-blood-drip ${drip.durationMs}ms linear forwards` }}
          onAnimationEnd={() => removeDrip(drip.id)}
        />
      ))}
    </svg>
  );
}
