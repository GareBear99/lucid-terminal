/**
 * The brain-alive indicator (Atom steal #16, Kite half —
 * 2026-11-14).
 *
 * The app status bar's engine health pill: a dot + "Brain:
 * ready" / "Brain: not started" / "Brain: not responding",
 * ticking once a second so the aliveness and the countdown
 * flip live. The dot is green while the engine completed
 * an operation in the last 5 seconds, amber while it has
 * never started, red while it is not responding or
 * unavailable.
 *
 * Clicking it probes the engine and toasts the full
 * check-status report (state, version, last activity) —
 * the retry: a down engine is warmed by the probe. The
 * `client` prop is the engine client, injectable for tests;
 * it defaults to the shared singleton.
 */
import { useEffect, useReducer } from 'react';
import { Brain } from 'lucide-react';
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

  return (
    <Tooltip content={`${status.detail} Click to check the brain's status.`}>
      <button
        data-testid="brain-alive-indicator"
        onClick={() => void checkBrainStatus(engine)}
        className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded px-1"
        aria-label={status.label}
      >
        <div className={`w-2 h-2 rounded-full ${DOT_BY_KIND[status.kind]}`} />
        <Brain size={12} />
        <span>{status.label}</span>
      </button>
    </Tooltip>
  );
}
