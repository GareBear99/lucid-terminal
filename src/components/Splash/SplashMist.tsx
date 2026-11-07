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
 */
import { SPLASH_SMOKE_PUFF_COUNT } from './SplashScreen';

export function SplashMist() {
  const puffs = Array.from({ length: SPLASH_SMOKE_PUFF_COUNT }, (_, i) => i);
  return (
    <div
      className="splash-smoke splash-mist -z-10"
      aria-hidden="true"
      data-testid="splash-mist"
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
