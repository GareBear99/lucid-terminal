/**
 * Lucid boot splash — the high-tech intro Gary asked for (2026-11-05):
 * the app loads in, black smoke/mist drifts across the screen and fades
 * out, "Lucid" appears in clean high-tech lettering, then the whole
 * splash cross-fades back into the dashboard.
 *
 * Sequence (full motion, ~3.2s total):
 *   smoke in (600ms) -> wordmark in (700ms) -> hold (900ms) ->
 *   fade out (1000ms) -> onDone() unmounts the splash.
 * Reduced motion: no smoke, brief wordmark, done in 900ms.
 * Click anywhere or any keypress skips straight to a fast fade (250ms).
 *
 * Performance: the smoke is pure CSS — transform/opacity animations on
 * pre-blurred radial gradients, no per-frame JS, no layout thrash, no
 * filter: blur() at runtime. The dashboard is already mounted underneath
 * the overlay, so the fade-out is just the overlay going transparent.
 * If the splash itself throws, the error boundary renders nothing and the
 * dashboard is still there — a splash failure can never block the app.
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

function SplashScreenInner({ onDone }: { onDone: () => void }) {
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
  useEffect(() => {
    setMounted(true);
    const total = reducedMotion ? SPLASH_REDUCED_MOTION_MS : SPLASH_TOTAL_MS;
    if (reducedMotion) {
      timersRef.current.push(
        window.setTimeout(
          () => setPhase('fade'),
          SPLASH_REDUCED_MOTION_MS - SPLASH_REDUCED_MOTION_FADE_MS,
        ),
      );
    } else {
      timersRef.current.push(
        window.setTimeout(() => setPhase('wordmark'), SPLASH_SMOKE_IN_MS),
        window.setTimeout(
          () => setPhase('hold'),
          SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS,
        ),
        window.setTimeout(
          () => setPhase('fade'),
          SPLASH_SMOKE_IN_MS + SPLASH_WORDMARK_IN_MS + SPLASH_WORDMARK_HOLD_MS,
        ),
      );
    }
    timersRef.current.push(window.setTimeout(finish, total));
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [finish, reducedMotion]);

  // Skip: click anywhere on the splash, or any keypress. Clears the
  // schedule, jumps to a fast fade, then finishes.
  const skip = useCallback(() => {
    if (doneRef.current || skipping) return;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setSkipping(true);
    setPhase('fade');
    timersRef.current.push(window.setTimeout(finish, SPLASH_SKIP_FADE_MS));
  }, [finish, skipping]);

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

export function SplashScreen({ onDone }: { onDone: () => void }) {
  return (
    <SplashErrorBoundary>
      <SplashScreenInner onDone={onDone} />
    </SplashErrorBoundary>
  );
}
