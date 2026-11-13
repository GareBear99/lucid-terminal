/**
 * Lucid boot splash — the high-tech intro Gary asked for (2026-11-05):
 * the app loads in, black smoke/mist drifts across the screen and fades
 * out, "Lucid" appears in clean high-tech lettering, then the splash
 * leaves — by cross-fade or by hard cut, depending on what comes next.
 *
 * THE RULE (2026-11-13): the splash must NEVER fade onto the dashboard
 * when the next phase is profiles. The dashboard is always mounted
 * underneath, so a fade makes the terminal show through for ~1s before
 * profiles pops in — that is the bug Gary saw live ("opens lucid first
 * briefly"). So: splash1 (into profiles) runs with fadeOut={false} and
 * cuts hard at the end of the hold; splash2 (into Lucid) runs with
 * fadeOut={true} and cross-fades into the dashboard, which is correct
 * there. Both screens are black, so the cut is seamless.
 *
 * Sequence (full motion, fadeOut={true}, ~3.2s total):
 *   smoke in (600ms) -> wordmark in (700ms) -> hold (900ms) ->
 *   fade out (1000ms) -> onDone() unmounts the splash.
 * With fadeOut={false} there is no fade phase at all: onDone() fires
 * at the end of the hold (2200ms), a hard cut to the next phase.
 * Reduced motion: no smoke, brief wordmark, done in 900ms with a fade,
 * 600ms with a cut. Click anywhere or any keypress skips: fast fade
 * (250ms) when fading, immediate onDone() when cutting.
 *
 * Performance: the smoke is pure CSS — transform/opacity animations on
 * pre-blurred radial gradients, no per-frame JS, no layout thrash, no
 * filter: blur() at runtime. When it fades, the dashboard is already
 * mounted underneath the overlay, so the fade-out is just the overlay
 * going transparent. If the splash itself throws, the error boundary
 * renders nothing and the dashboard is still there — a splash failure
 * can never block the app.
 *
 * Tuning: change the SPLASH_*_MS constants below (and the matching
 * durations noted in SplashScreen.css). A "don't show again" setting is
 * a one-line follow-up — App renders this on every launch for now.
 */
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './SplashScreen.css';

/** Tunable timing for the boot splash (all milliseconds). */
export const SPLASH_SMOKE_IN_MS = 600;
export const SPLASH_WORDMARK_IN_MS = 700;
export const SPLASH_WORDMARK_HOLD_MS = 900;
export const SPLASH_FADE_OUT_MS = 1000;
/** Total intro length: smoke in + wordmark in + hold + fade out. */
export const SPLASH_TOTAL_MS =
  SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS + SPLASH_FADE_OUT_MS;
/** How fast the splash disappears once skipped (click / keypress). */
export const SPLASH_SKIP_FADE_MS = 250;
/** Total length when the user prefers reduced motion: no smoke, brief wordmark. */
export const SPLASH_REDUCED_MOTION_MS = 900;
/** Fade length inside the reduced-motion total. */
export const SPLASH_REDUCED_MOTION_FADE_MS = 300;
/** Number of smoke puffs. Kept modest so the 2018 Intel Mac mini stays smooth. */
export const SPLASH_SMOKE_PUFF_COUNT = 7;

type SplashPhase = 'smoke' | 'wordmark' | 'hold' | 'fade';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * If the splash itself fails to render, show nothing — the dashboard is
 * already mounted underneath, so the app still works.
 */
class SplashErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('[Splash] failed, showing dashboard instead:', error);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}

function SplashScreenInner({
  onDone,
  fadeOut,
}: {
  onDone: () => void;
  /**
   * Whether the splash fades out (true) or cuts hard (false) at the
   * end. The fade makes the overlay — including its black background
   * — go transparent, revealing the dashboard mounted underneath.
   * That is correct only when the next phase IS the dashboard
   * (splash2). When the next phase is profiles (splash1), the cut
   * keeps the screen black straight into profiles: no terminal
   * flash, no visible jump.
   */
  fadeOut: boolean;
}) {
  const reducedMotion = useRef(prefersReducedMotion()).current;
  const [phase, setPhase] = useState<SplashPhase>(reducedMotion ? 'wordmark' : 'smoke');
  const [mounted, setMounted] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Phase schedule + the final onDone timer. Everything is cleared on
  // unmount, so React StrictMode's double-effect in dev is harmless.
  // With fadeOut={false} there is no fade phase: onDone fires at the
  // moment the fade would have started (end of the hold / 600ms
  // reduced motion), a hard cut to the next phase.
  useEffect(() => {
    setMounted(true);
    const fadeAt = reducedMotion
      ? SPLASH_REDUCED_MOTION_MS - SPLASH_REDUCED_MOTION_FADE_MS
      : SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS;
    const total = reducedMotion ? SPLASH_REDUCED_MOTION_MS : SPLASH_TOTAL_MS;
    if (reducedMotion) {
      if (fadeOut) {
        timersRef.current.push(window.setTimeout(() => setPhase('fade'), fadeAt));
      }
    } else {
      timersRef.current.push(
        window.setTimeout(() => setPhase('wordmark'), SPLASH_SMOKE_IN_MS),
        window.setTimeout(
          () => setPhase('hold'),
          SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS,
        ),
      );
      if (fadeOut) {
        timersRef.current.push(window.setTimeout(() => setPhase('fade'), fadeAt));
      }
    }
    timersRef.current.push(window.setTimeout(finish, fadeOut ? total : fadeAt));
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [finish, reducedMotion, fadeOut]);

  // Skip: click anywhere on the splash, or any keypress. Clears the
  // schedule, then finishes — via a fast fade when fading, immediately
  // when cutting (no fade phase exists to show).
  const skip = useCallback(() => {
    if (doneRef.current || skipping) return;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (!fadeOut) {
      finish();
      return;
    }
    setSkipping(true);
    setPhase('fade');
    timersRef.current.push(window.setTimeout(finish, SPLASH_SKIP_FADE_MS));
  }, [finish, skipping, fadeOut]);

  useEffect(() => {
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [skip]);

  const puffs = Array.from({ length: SPLASH_SMOKE_PUFF_COUNT }, (_, i) => i);

  return (
    <div
      role="presentation"
      aria-label="Lucid loading"
      data-testid="splash-screen"
      data-phase={phase}
      className={[
        'splash-screen',
        `splash-phase-${phase}`,
        mounted ? 'splash-mounted' : '',
        skipping ? 'splash-skipping' : '',
        reducedMotion ? 'splash-reduced-motion' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={skip}
    >
      {!reducedMotion && (
        <div className="splash-smoke" aria-hidden="true" data-testid="splash-smoke">
          {puffs.map((i) => (
            <div
              key={i}
              className={`splash-puff splash-puff-${i}${i === 2 ? ' splash-puff-accent' : ''}`}
              data-testid="smoke-puff"
            />
          ))}
        </div>
      )}
      <div className="splash-wordmark" data-testid="splash-wordmark">
        <div className="splash-wordmark-glow" aria-hidden="true" />
        <span className="splash-wordmark-text lucid-color-shift-text">
          {'Lucid'.split('').map((letter, i) => (
            <span
              key={i}
              className="splash-wordmark-letter"
              style={{ ['--i' as string]: i } as React.CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
        <span className="splash-wordmark-line" aria-hidden="true" />
      </div>
    </div>
  );
}

export function SplashScreen({
  onDone,
  fadeOut = true,
}: {
  onDone: () => void;
  /**
   * True (default): fade out at the end — correct only when the next
   * phase is the dashboard (splash2). False: cut hard at the end of
   * the hold — required when the next phase is profiles (splash1),
   * so the terminal never shows through.
   */
  fadeOut?: boolean;
}) {
  return (
    <SplashErrorBoundary>
      <SplashScreenInner onDone={onDone} fadeOut={fadeOut} />
    </SplashErrorBoundary>
  );
}
