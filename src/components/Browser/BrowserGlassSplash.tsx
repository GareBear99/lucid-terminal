/**
 * Glass splash on the browser tab (Phase B, Gary 2026-11-07):
 * "when its using browser the mini window has to be show full
 * screen while the browser tab is glass splashed."
 *
 * The splash loads first, then fades, then fullscreen — the boot
 * splash's rhythm (smoke → wordmark → hold → fade, ~3.2s — see
 * `src/components/Splash/SplashScreen.tsx`) with a glass
 * treatment: a frosted translucent panel over the browser tab
 * (backdrop blur, translucent white, hairline border) instead of
 * the boot splash's black smoke. Clicking it skips straight to a
 * fast fade, like the boot splash.
 *
 * Main drives the timing: it sets `splash` in the agent state
 * when a burst starts and clears it after ~3.2s, then goes
 * fullscreen. This component runs the same schedule on its own
 * timers so the phases animate even if an event is late; when
 * it finishes (or is skipped) it calls `onDone` so the parent
 * can drop the overlay.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BROWSER_GLASS_SPLASH_HOLD_MS,
  BROWSER_GLASS_SPLASH_SMOKE_MS,
  BROWSER_GLASS_SPLASH_TOTAL_MS,
  BROWSER_GLASS_SPLASH_WORDMARK_MS,
  type BrowserGlassSplashPhase,
} from '../../lib/browserAgent';
import './BrowserGlassSplash.css';

export const BROWSER_GLASS_SPLASH_SKIP_FADE_MS = 250;

export function BrowserGlassSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<BrowserGlassSplashPhase>('smoke');
  const [mounted, setMounted] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    setMounted(true);
    const smokeEnd = BROWSER_GLASS_SPLASH_SMOKE_MS;
    const wordmarkEnd = smokeEnd + BROWSER_GLASS_SPLASH_WORDMARK_MS;
    const holdEnd = wordmarkEnd + BROWSER_GLASS_SPLASH_HOLD_MS;
    timersRef.current.push(
      window.setTimeout(() => setPhase('wordmark'), smokeEnd),
      window.setTimeout(() => setPhase('hold'), wordmarkEnd),
      window.setTimeout(() => setPhase('fade'), holdEnd),
      window.setTimeout(finish, BROWSER_GLASS_SPLASH_TOTAL_MS),
    );
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [finish]);

  const skip = useCallback(() => {
    if (doneRef.current || skipping) return;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setSkipping(true);
    setPhase('fade');
    timersRef.current.push(
      window.setTimeout(finish, BROWSER_GLASS_SPLASH_SKIP_FADE_MS),
    );
  }, [finish, skipping]);

  useEffect(() => {
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [skip]);

  const puffs = Array.from({ length: 5 }, (_, i) => i);

  return (
    <div
      role="presentation"
      aria-label="Browser loading for the agent"
      data-testid="browser-glass-splash"
      data-phase={phase}
      className={[
        'browser-glass-splash',
        `browser-glass-splash-phase-${phase}`,
        mounted ? 'browser-glass-splash-mounted' : '',
        skipping ? 'browser-glass-splash-skipping' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={skip}
    >
      <div className="browser-glass-splash-smoke" aria-hidden="true">
        {puffs.map((i) => (
          <div
            key={i}
            className={`browser-glass-splash-puff browser-glass-splash-puff-${i}`}
          />
        ))}
      </div>
      <div className="browser-glass-splash-wordmark">
        <span className="browser-glass-splash-wordmark-text">
          {'Lucid'.split('').map((letter, i) => (
            <span
              key={i}
              className="browser-glass-splash-wordmark-letter"
              style={{ ['--i' as string]: i } as React.CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
        <span className="browser-glass-splash-wordmark-sub">
          Agent browsing
        </span>
      </div>
      <span className="browser-glass-splash-hint">
        Click to skip
      </span>
    </div>
  );
}
