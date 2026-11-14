/**
 * Copilot models — the brains a copilot in the AI chat's copilot
 * tab can pick from (Gary, 2026-11-13: a dropdown to pick which
 * copilot; add as many as desired in the AI settings input).
 *
 * The catalogue is data, not behaviour: the runner
 * (src/lib/copilotRunner.ts) decides what actually runs for each
 * model. Keep in sync with `CopilotModelId` / `CopilotConfig` in
 * src/types/index.ts.
 *
 * Two models in this slice:
 * - 'local-planner': the deterministic local planner
 *   (src/lib/agentBrain.ts). Runs on this machine, no key, no
 *   network — the only brain that runs a turn in this slice.
 * - 'github-copilot': Gary's Copilot key, saved in Settings > AI
 *   (Secure Vault). The Copilot connection itself is NOT built in
 *   this slice (D9 is still open) — a Copilot copilot with a saved
 *   key shows as not-connected-yet, and never silently falls back
 *   to the local planner pretending to be Copilot.
 */
import type { CopilotConfig, CopilotModelId } from '../types';

export interface CopilotModelInfo {
  id: CopilotModelId;
  /** The label the dropdown and the tab show. */
  label: string;
  /** One line under the label, saying what it needs. */
  hint: string;
}

export const COPILOT_MODELS: readonly CopilotModelInfo[] = [
  {
    id: 'local-planner',
    label: 'Local planner',
    hint: 'Runs on this machine. No key, no network.',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    hint: 'Your Copilot key, saved in Settings > AI.',
  },
] as const;

export function copilotModelLabel(model: CopilotModelId): string {
  return COPILOT_MODELS.find((m) => m.id === model)?.label ?? model;
}

export function copilotModelHint(model: CopilotModelId): string {
  return COPILOT_MODELS.find((m) => m.id === model)?.hint ?? '';
}

/** Whether this copilot's model is ready to run a turn. */
export function isCopilotConfigured(
  copilot: CopilotConfig,
  hasCopilotKey: boolean,
): boolean {
  if (copilot.model === 'local-planner') return true;
  if (copilot.model === 'github-copilot') return hasCopilotKey;
  // An unknown model (a stale persisted value) is unconfigured,
  // never silently another model.
  return false;
}

/**
 * Why this copilot cannot run yet, in the tab's own words — or
 * null when it can. A copilot with no key configured shows that
 * it is unconfigured, never an error in the user's face.
 */
export function copilotUnconfiguredReason(
  copilot: CopilotConfig,
  hasCopilotKey: boolean,
): string | null {
  if (isCopilotConfigured(copilot, hasCopilotKey)) return null;
  if (copilot.model === 'github-copilot') {
    return 'Not configured — add your GitHub Copilot key in Settings > AI.';
  }
  return `The model "${copilot.model}" is not available.`;
}

/** A stable id for a copilot added in Settings (same shape as the
 * run/review ids elsewhere in the agent code). */
export function newCopilotId(): string {
  return `copilot-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
