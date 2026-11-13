/**
 * Lucid boot splash — the high-tech intro Gary asked for (2026-11-05):
 * the app loads in, black smoke/mist drifts across the screen and fades
 * out, "Lucid" appears in clean high-tech lettering, then the splash
 * leaves — by cross-fade or by content fade, depending on what comes next.
 *
 * THE RULE (2026-11-13): the splash must NEVER fade onto the dashboard
 * when the next phase is profiles. The dashboard is always mounted
 * underneath, so a fade makes the terminal show through for ~1s before
 * profiles pops in — that is the bug Gary saw live ("opens lucid first
 * briefly"). So splash1 (into profiles) runs with fadeOut={false}: its
 * CONTENT (smoke + wordmark) fades out while the overlay's black
 * background stays opaque the whole time, and profiles then fades in
 * on black — a clean black-to-black handoff, never a hard cut (Gary,
 * 2026-11-11-13 ~02:19 PST: "thats not a clean transition to
 * spashcreen to screen") and never a dashboard flash. splash2 (into
 * Lucid) runs with fadeOut={true} and cross-fades into the dashboard,
 * which is correct there.
 *
 * Sequence (full motion, fadeOut={true}, ~3.2s total):
 *   smoke in (600ms) -> wordmark in (700ms) -> hold (900ms) ->
 *   fade out (1000ms) -> onDone() unmounts the splash.
 * With fadeOut={false} the sequence is ~2.8s: smoke in -> wordmark
 * in -> hold -> content fade out (600ms, background stays black) ->
 * onDone() unmounts the splash and profiles fades in.
 * Reduced motion: no smoke, brief wordmark, done in 900ms either way
 * (300ms fade / content fade). Click anywhere or any keypress skips:
 * fast fade (250ms) when fading, fast content fade (250ms) when
 * cutting to profiles — a skip is never a hard cut either.
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
/** How long the splash CONTENT (smoke + wordmark) takes to fade out
 *  on black when fadeOut={false} (splash1 into profiles). The overlay
 *  background stays opaque black throughout — only the content goes. */
export const SPLASH_CONTENT_FADE_MS = 600;
/** Total intro length: smoke in + wordmark in + hold + fade out. */
export const SPLASH_TOTAL_MS =
  SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS + SPLASH_FADE_OUT_MS;
/** Total intro length with fadeOut={false}: smoke in + wordmark in +
 *  hold + content fade out on black. */
export const SPLASH_NO_FADE_TOTAL_MS =
  SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS + SPLASH_CONTENT_FADE_MS;
/** How fast the splash disappears once skipped (click / keypress). */
export const SPLASH_SKIP_FADE_MS = 250;
/** Total length when the user prefers reduced motion: no smoke, brief wordmark. */
export const SPLASH_REDUCED_MOTION_MS = 900;
/** Fade length inside the reduced-motion total. */
export const SPLASH_REDUCED_MOTION_FADE_MS = 300;
/** Content-fade length inside the reduced-motion total (fadeOut={false}). */
export const SPLASH_REDUCED_MOTION_EXIT_MS = 300;
/** Number of smoke puffs. Kept modest so the 2018 Intel Mac mini stays smooth. */
export const SPLASH_SMOKE_PUFF_COUNT = 7;

type SplashPhase = 'smoke' | 'wordmark' | 'hold' | 'fade' | 'exit';

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
   * Whether the splash fades out (true) or fades its content out on
   * black (false) at the end. The full fade makes the overlay —
   * including its black background — go transparent, revealing the
   * dashboard mounted underneath. That is correct only when the
   * next phase IS the dashboard (splash2). When the next phase is
   * profiles (splash1), the content fade keeps the screen black
   * straight into profiles: the smoke and wordmark dissolve, the
   * background never goes transparent, so no terminal flash — and
   * no hard cut either.
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
  // The last phase is 'fade' when fading (the whole overlay, black
  // background included, goes transparent — correct only into the
  // dashboard) or 'exit' when not fading (only the smoke + wordmark
  // dissolve; the background stays opaque black — the clean handoff
  // into profiles). onDone fires at the end of that last phase.
  useEffect(() => {
    setMounted(true);
    const endAt = reducedMotion
      ? SPLASH_REDUCED_MOTION_MS -
        (fadeOut ? SPLASH_REDUCED_MOTION_FADE_MS : SPLASH_REDUCED_MOTION_EXIT_MS)
      : SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS;
    const total = reducedMotion
      ? SPLASH_REDUCED_MOTION_MS
      : fadeOut
        ? SPLASH_TOTAL_MS
        : SPLASH_NO_FADE_TOTAL_MS;
    const endPhase: SplashPhase = fadeOut ? 'fade' : 'exit';
    if (reducedMotion) {
      timersRef.current.push(window.setTimeout(() => setPhase(endPhase), endAt));
    } else {
      timersRef.current.push(
        window.setTimeout(() => setPhase('wordmark'), SPLASH_SMOKE_IN_MS),
        window.setTimeout(
          () => setPhase('hold'),
          SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS,
        ),
        window.setTimeout(() => setPhase(endPhase), endAt),
      );
    }
    timersRef.current.push(window.setTimeout(finish, total));
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [finish, reducedMotion, fadeOut]);

  // Skip: click anywhere on the splash, or any keypress. Clears the
  // schedule, then finishes — via a fast fade when fading, a fast
  // content fade when going to profiles. A skip is never a hard cut.
  const skip = useCallback(() => {
    if (doneRef.current || skipping) return;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setSkipping(true);
    setPhase(fadeOut ? 'fade' : 'exit');
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
   * phase is the dashboard (splash2). False: fade the CONTENT out on
   * black at the end of the hold — required when the next phase is
   * profiles (splash1), so the terminal never shows through and the
   * handoff is a clean black-to-black transition, not a hard cut.
   */
  fadeOut?: boolean;
}) {
  return (
    <SplashErrorBoundary>
      <SplashScreenInner onDone={onDone} fadeOut={fadeOut} />
    </SplashErrorBoundary>
  );
}
