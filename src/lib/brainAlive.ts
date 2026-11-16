/**
 * The brain-alive indicator.
 *
 * Kite's status-bar component measures the engine's
 * aliveness by tracking how recently the engine completed
 * its last successful operation — `alive = lastSuccess > 0
 * && (now - lastSuccess) < 5000` — plus a countdown of the
 * remaining time, with messages such as "Kite: engine not
 * started" or "Kite: engine not responding" for failures.
 * Atom's `kite:check-status` command reports the full set:
 * state, version, and last activity.
 *
 * Lucid's shape: the engine client (engineClient.ts)
 * records `lastSuccessAt` on every successful operation
 * (its `call()` wrapper is the choke point) and the last
 * error; this module turns that pair + the engine state
 * into a status, and formats the check-status report.
 * The indicator component (Layout/BrainAliveIndicator)
 * renders it in the app status bar and ticks once a
 * second, so the countdown and the aliveness flip live.
 *
 * Pure, except for checkBrainStatus (the probe + toast the
 * indicator and the `lucid:brain-status` command share).
 */
import type { EngineState, EngineClient } from './engineClient';
import { useToastStore } from '../stores/toastStore';

/** Atom's aliveness window: 5 seconds since the last success. */
export const BRAIN_ALIVE_WINDOW_MS = 5000;

export type BrainStatusKind = 'not-started' | 'ready' | 'not-responding' | 'unavailable';

export interface BrainStatus {
  kind: BrainStatusKind;
  /** The status-bar label ("Brain: ready"). */
  label: string;
  /** The tooltip line (the state + the last activity). */
  detail: string;
  /** Seconds of aliveness remaining (ready only), or null. */
  aliveForSeconds: number | null;
}

function secondsAgo(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds === 0 ? 'just now' : `${seconds}s ago`;
}

export function brainStatus(
  state: EngineState,
  lastSuccessAt: number | null,
  now: number,
): BrainStatus {
  switch (state) {
    case 'uninstalled':
      return {
        kind: 'unavailable',
        label: 'Brain: not installed',
        detail: 'The language engine is not installed — completions, hover and signature help are unavailable.',
        aliveForSeconds: null,
      };
    case 'unsupported':
      return {
        kind: 'unavailable',
        label: 'Brain: unsupported',
        detail: 'The language engine is not supported on this system.',
        aliveForSeconds: null,
      };
    case 'unreachable':
      return {
        kind: 'not-responding',
        label: 'Brain: not responding',
        detail:
          lastSuccessAt !== null
            ? `The engine cannot be reached — last success ${secondsAgo(lastSuccessAt, now)}.`
            : 'The engine cannot be reached — it never completed an operation.',
        aliveForSeconds: null,
      };
    case 'not-running':
      if (lastSuccessAt === null) {
        return {
          kind: 'not-started',
          label: 'Brain: not started',
          detail: 'The engine has not started yet — it warms up when you open a file.',
          aliveForSeconds: null,
        };
      }
      return {
        kind: 'not-responding',
        label: 'Brain: not responding',
        detail: `The engine stopped — last success ${secondsAgo(lastSuccessAt, now)}.`,
        aliveForSeconds: null,
      };
    case 'ready': {
      if (lastSuccessAt !== null && now - lastSuccessAt < BRAIN_ALIVE_WINDOW_MS) {
        const aliveForSeconds = Math.max(
          1,
          Math.ceil((lastSuccessAt + BRAIN_ALIVE_WINDOW_MS - now) / 1000),
        );
        return {
          kind: 'ready',
          label: 'Brain: ready',
          detail: `Last success ${secondsAgo(lastSuccessAt, now)} — alive for ${aliveForSeconds}s more.`,
          aliveForSeconds,
        };
      }
      return {
        kind: 'not-responding',
        label: 'Brain: not responding',
        detail:
          lastSuccessAt !== null
            ? `The engine is ready but silent — last success ${secondsAgo(lastSuccessAt, now)}.`
            : 'The engine is ready but has not completed an operation yet.',
        aliveForSeconds: null,
      };
    }
  }
}

/** The check-status report (Kite's `kite:check-status`): state, version, last activity. */
export function formatBrainStatusReport(input: {
  state: EngineState;
  transportName: string;
  version: string | null;
  lastSuccessAt: number | null;
  lastError: { at: number; message: string } | null;
  now: number;
}): string {
  const status = brainStatus(input.state, input.lastSuccessAt, input.now);
  const lines = [
    `${status.label} — state: ${input.state} (${input.transportName})`,
    `Version: ${input.version ?? 'unknown'} (TypeScript)`,
    input.lastSuccessAt !== null
      ? `Last success: ${secondsAgo(input.lastSuccessAt, input.now)}`
      : 'Last success: none yet',
  ];
  if (input.lastError) {
    lines.push(`Last error: ${secondsAgo(input.lastError.at, input.now)} — ${input.lastError.message}`);
  }
  return lines.join('\n');
}

/**
 * Probe the engine and report the result (the indicator's
 * click and the `lucid:brain-status` command share this):
 * re-checks health (which warms the engine when it is down
 * — the retry), then toasts the full report.
 */
export async function checkBrainStatus(
  client: Pick<EngineClient, 'checkHealth' | 'getState' | 'getEngineVersion' | 'getLastSuccessAt' | 'getLastError' | 'transportName'>,
): Promise<string> {
  const state = await client.checkHealth();
  const report = formatBrainStatusReport({
    state,
    transportName: client.transportName,
    version: client.getEngineVersion(),
    lastSuccessAt: client.getLastSuccessAt(),
    lastError: client.getLastError(),
    now: Date.now(),
  });
  useToastStore.getState().info(report);
  return report;
}
