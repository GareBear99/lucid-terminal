/**
 * SplashMist — the black portal splashscreen's mist, without the splash.
 *
 * Gary (2026-11-07): "the main screen should always be splashscreen
 * misty black". So the mist lives behind the dashboard permanently:
 * the App root is pure black #000 (the splash's own background) and
 * this layer carries the exact same seven drifting smoke puffs the
 * boot splash shows (SplashScreen.css: .splash-puff, puff 2 the cool-
 * blue accent) — same classes, same positions, same drift, no new
 * look invented.
 *
 * No wordmark, no fade, no click-to-skip: it is the backdrop, not an
 * overlay. It is always visible — the .splash-mist rule in
 * SplashScreen.css holds the smoke at opacity 1 on its own (the boot
 * splash gates its smoke on .splash-mounted instead). It never takes
 * input (pointer-events none in .splash-smoke) and it sits behind the
 * content (App renders it with -z-10 inside an isolated root).
 *
 * Variable cadence (zero-latency F3): the puffs used to animate
 * forever — 7 large radial-gradient layers compositing on every
 * frame behind every view, including while the window was hidden or
 * Gary was just typing (the splash measured 43.7 FPS / p95 33.4 ms
 * on CPU raster with the same puffs). Now the animation pauses
 * (`animation-play-state: paused`, same mechanism the splash's own
 * fade already uses) whenever the mist cannot be seen — window
 * hidden or blurred — or after 60 s with no pointer/keyboard
 * activity, and resumes on the next activity. Pausing freezes the
 * puffs mid-drift; the mist stays visible as a static backdrop, so
 * the screen never stops being misty black — it just stops paying
 * per-frame compositing for a backdrop nobody is watching.
 */
import { useEffect, useState } from 'react';
import { SPLASH_SMOKE_PUFF_COUNT } from './SplashScreen';

/** Idle time with no pointer/keyboard activity before the mist sleeps. */
export const SPLASH_MIST_IDLE_MS = 60_000;

export function SplashMist() {
  const puffs = Array.from({ length: SPLASH_SMOKE_PUFF_COUNT }, (_, i) => i);
  const [paused, setPaused] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );

  useEffect(() => {
    let idleTimer = 0;
    const scheduleIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setPaused(true), SPLASH_MIST_IDLE_MS);
    };
    // Activity resumes the drift (unless the window is hidden) and
    // restarts the idle countdown.
    const onActivity = () => {
      if (!document.hidden) setPaused(false);
      scheduleIdle();
    };
    const onVisibility = () => {
      setPaused(document.hidden);
      if (!document.hidden) scheduleIdle();
    };
    const onBlur = () => setPaused(true);
    const onFocus = () => {
      setPaused(document.hidden);
      scheduleIdle();
    };

    scheduleIdle();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pointermove', onActivity, { passive: true });
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      window.clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pointermove', onActivity);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, []);

  return (
    <div
      className={`splash-smoke splash-mist -z-10${paused ? ' splash-mist-paused' : ''}`}
      aria-hidden="true"
      data-testid="splash-mist"
      data-paused={paused ? 'true' : undefined}
    >
      {puffs.map((i) => (
        <div
          key={i}
          className={`splash-puff splash-puff-${i}${i === 2 ? ' splash-puff-accent' : ''}`}
          data-testid="smoke-puff"
        />
      ))}
    </div>
  );
}
