/**
 * MiniLoadingMist — the detached window's loading screen (Gary,
 * 2026-11-13: "when their loading should fade to splash mist").
 *
 * A detached tab/file window opens with `show: false` + a dark
 * backgroundColor, so the OS never flashes white — but the
 * renderer then mounts MiniTerminal/MiniFiles directly, which is
 * an instant cut to a (possibly empty) terminal. Instead the
 * window loads INTO the splash mist: pure black #000 (the
 * splash's own background) with the exact same seven drifting
 * smoke puffs the boot splash shows (SplashScreen.css:
 * .splash-puff, puff 2 the cool-blue accent) — same classes,
 * same positions, same drift, no new look invented.
 *
 * While `ready` is false the mist is opaque and covers the
 * window. When `ready` flips true the overlay fades out
 * (700 ms, the mist's own smoke-in duration) and unmounts, so
 * the terminal/editor is revealed — never an instant cut, never
 * a blank window. `ready` is the mini's own "loading settled"
 * flag (its detach-state fetch resolved); the mist never blocks
 * input once it starts fading (pointer-events none then).
 */
import { useEffect, useRef, useState } from 'react';
import { SPLASH_SMOKE_PUFF_COUNT } from './SplashScreen';
import './SplashScreen.css';

/** Fade-out duration for the mist (ms) — matches the smoke-in. */
export const MINI_LOADING_MIST_FADE_MS = 700;

export function MiniLoadingMist({ ready }: { ready: boolean }) {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    // Start the fade, then unmount once it has finished.
    setFading(true);
    timerRef.current = setTimeout(() => setGone(true), MINI_LOADING_MIST_FADE_MS + 50);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready]);

  if (gone) return null;

  const puffs = Array.from({ length: SPLASH_SMOKE_PUFF_COUNT }, (_, i) => i);
  return (
    <div
      className={`mini-loading-mist${fading ? ' mini-loading-mist-fading' : ''}`}
      aria-hidden="true"
      data-testid="mini-loading-mist"
      data-ready={ready ? 'true' : undefined}
    >
      <div className="splash-smoke" aria-hidden="true">
        {puffs.map((i) => (
          <div
            key={i}
            className={`splash-puff splash-puff-${i}${i === 2 ? ' splash-puff-accent' : ''}`}
            data-testid="smoke-puff"
          />
        ))}
      </div>
    </div>
  );
}
