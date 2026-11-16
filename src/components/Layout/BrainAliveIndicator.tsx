/**
 * The brain-alive indicator.
 *
 * The app status bar's engine health pill: a DOT ONLY, no
 * text (global presentation fix, 2026-11-15). It used to
 * print "Brain: ready" / "Brain: not started" / "Brain: not
 * responding" permanently in the bar — and the label
 * oscillates while the backend is alive (the engine only
 * records a success when an operation completes, so an idle
 * engine ages past the 5s aliveness window and flips to
 * "not responding" until its next operation). That flicker
 * presented as a dead backend; the dot still flips green /
 * amber / red on the same rule, but quietly, and the full
 * state lives in the tooltip + the click-to-probe toast, not
 * in permanent bar text.
 *
 * The dot is green while the engine completed an operation
 * in the last 5 seconds, amber while it has never started,
 * red while it is not responding or unavailable.
 *
 * Clicking it probes the engine and toasts the full
 * check-status report (state, version, last activity) —
 * the retry: a down engine is warmed by the probe. The
 * `client` prop is the engine client, injectable for tests;
 * it defaults to the shared singleton.
 */
import { useEffect, useReducer } from 'react';
import { getEngineClient, type EngineClient } from '../../lib/engineClient';
import { brainStatus, checkBrainStatus } from '../../lib/brainAlive';
import { Tooltip } from '../Tooltip/Tooltip';

type BrainClient = Pick<
  EngineClient,
  'checkHealth' | 'getState' | 'getEngineVersion' | 'getLastSuccessAt' | 'getLastError' | 'transportName'
>;

interface BrainAliveIndicatorProps {
  client?: BrainClient;
}

const DOT_BY_KIND = {
  ready: 'bg-green-500',
  'not-started': 'bg-amber-500',
  'not-responding': 'bg-red-500',
  unavailable: 'bg-red-500',
} as const;

export function BrainAliveIndicator({ client }: BrainAliveIndicatorProps) {
  const engine = client ?? getEngineClient();
  // A 1s tick re-reads the client: the aliveness flips and
  // the countdown counts down without any engine event.
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const status = brainStatus(engine.getState(), engine.getLastSuccessAt(), Date.now());

  // Dot only — the label is the tooltip + aria-label, never
  // permanent bar text (see the header comment).
  return (
    <Tooltip content={`${status.detail} Click to check the brain's status.`}>
      <button
        data-testid="brain-alive-indicator"
        onClick={() => void checkBrainStatus(engine)}
        className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded px-1"
        aria-label={status.label}
      >
        <div className={`w-2 h-2 rounded-full ${DOT_BY_KIND[status.kind]}`} />
      </button>
    </Tooltip>
  );
}
