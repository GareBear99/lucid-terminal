/**
 * Driving agents — the bases the LLMBuilder tab can pick from
 * (Gary, 2026-11-13 ~12:27 PST: "in AI settings where you can
 * input tier 5 and the ping server etc, i want another for adding
 * driving agent tabs which makes the llmbuilder tab allow picking
 * driving agent from lets say arc server input then the starship
 * detected as driving agent" — and ~13:04 PST: "the copilot tab
 * gets a dropdown to pick which copilot, and you add as many as
 * you want in the AI settings input, same input as the driving
 * agent tabs. No cap.").
 *
 * The catalogue is data, not behaviour — the loop
 * (src/lib/agentLoop.ts) decides what actually runs under
 * each agent. Keep in sync with `DrivingAgentId` /
 * `DrivingAgentTabConfig` in src/types/index.ts.
 *
 * Four agents in this slice:
 * - 'llmbuilder': the local base. Always here — the local
 *   planner brain runs today, no key, no network. The only
 *   agent that runs a turn in this slice.
 * - 'starship': a starship, when one is detected
 *   (src/lib/starshipDetection.ts). The detection mechanism
 *   is still OPEN (Gary's call) and the hook answers
 *   "not detected" today — this module never fakes a
 *   detection, it only reads the hook.
 * - 'tier5': your external API model (Settings > AI, Tier 5
 *   key + the model picked there). Detected when the key is
 *   saved. The key serves the AI chat today; there is no
 *   Tier 5 planning-brain client for the loop yet, so a
 *   picked Tier 5 agent shows as not connected yet.
 * - 'arc-server': a driving agent served from an ARC Server
 *   endpoint you enter (Gary's example: "from lets say arc
 *   server input"). Detected when the endpoint is entered.
 *   There is no ARC Server client yet, so a picked ARC
 *   Server agent shows as not connected yet.
 *
 * The rule, the same as the copilot slice's: an agent that
 * cannot run yet answers as not ready and runs NO tools —
 * never silently as another agent. The base is always
 * pickable, so there is always a working agent to fall
 * back to by picking it.
 */
import { detectStarship, type StarshipDetection } from './starshipDetection';
import type { DrivingAgentId, DrivingAgentTabConfig } from '../types';

export interface DrivingAgentInfo {
  id: DrivingAgentId;
  /** The label the picker and the pill show. */
  label: string;
  /** One line under the label, saying what it needs. */
  hint: string;
}

export const DRIVING_AGENTS: readonly DrivingAgentInfo[] = [
  {
    id: 'llmbuilder',
    label: 'LLMBuilder',
    hint: 'The local base. Runs on this machine. No key, no network.',
  },
  {
    id: 'starship',
    label: 'Starship',
    hint: 'A starship, when one is detected.',
  },
  {
    id: 'tier5',
    label: 'Tier 5 model',
    hint: 'Your external API model, configured in Settings > AI.',
  },
  {
    id: 'arc-server',
    label: 'ARC Server',
    hint: 'A driving agent served from an ARC Server endpoint you enter.',
  },
] as const;

export function drivingAgentLabel(agent: DrivingAgentId): string {
  return DRIVING_AGENTS.find((a) => a.id === agent)?.label ?? agent;
}

export function drivingAgentHint(agent: DrivingAgentId): string {
  return DRIVING_AGENTS.find((a) => a.id === agent)?.hint ?? '';
}

/** A stable id for a driving-agent tab added in Settings (same
 * shape as the copilot ids). */
export function newDrivingAgentTabId(): string {
  return `driving-agent-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** What detection reads. Local state only — detection never
 * makes a network call. */
export interface DrivingAgentDetectionInput {
  /** A Tier 5 API key is saved (Settings > AI). */
  hasApiKey: boolean;
  /** The Tier 5 model picked in Settings > AI. */
  aiModel: string;
  /** The starship hook's answer. */
  starship: StarshipDetection;
}

/** One agent's detection state — what the picker shows. */
export interface DrivingAgentState {
  id: DrivingAgentId;
  /** Detected / configured right now. */
  detected: boolean;
  /** Why not detected (or how it was detected). Shown in the UI. */
  detail: string;
  /** Whether a run under this agent can run a turn. Only the
   * base can in this slice — the other agents have no client
   * yet (starship build next; Tier 5 / ARC Server clients
   * later). */
  canRun: boolean;
  /** Why it cannot run yet, in the tab's own words — or null
   * when it can. Never an error in the user's face. */
  notReadyReason: string | null;
}

/**
 * Detect one agent. Pure — the starship answer comes from the
 * hook, the Tier 5 answer from the key, the ARC Server answer
 * from the endpoint on the tab. Nothing is invented: an agent
 * with no signal is not detected.
 */
export function detectDrivingAgent(
  id: DrivingAgentId,
  detection: DrivingAgentDetectionInput,
  endpoint?: string,
): DrivingAgentState {
  switch (id) {
    case 'llmbuilder':
      return {
        id,
        detected: true,
        detail: 'The local base — always here.',
        canRun: true,
        notReadyReason: null,
      };
    case 'starship':
      return {
        id,
        detected: detection.starship.detected,
        detail: detection.starship.detail,
        canRun: false,
        notReadyReason: detection.starship.detected
          ? 'The starship is detected, but the starship driving connection is not built yet.'
          : detection.starship.detail,
      };
    case 'tier5':
      return {
        id,
        detected: detection.hasApiKey,
        detail: detection.hasApiKey
          ? `Tier 5 model ${detection.aiModel || '(no model picked)'} — API key saved.`
          : 'No API key saved.',
        canRun: false,
        notReadyReason: detection.hasApiKey
          ? 'The Tier 5 model is not connected as a driving agent yet — the connection lands in a later build.'
          : 'Not configured — add your API key in Settings > AI (Tier 5).',
      };
    case 'arc-server': {
      const hasEndpoint = typeof endpoint === 'string' && endpoint.trim().length > 0;
      return {
        id,
        detected: hasEndpoint,
        detail: hasEndpoint
          ? `ARC Server at ${endpoint.trim()}.`
          : 'No endpoint entered.',
        canRun: false,
        notReadyReason: hasEndpoint
          ? 'This driving agent is not connected yet — the ARC Server connection lands in a later build.'
          : 'Not configured — enter an ARC Server endpoint in Settings > AI.',
      };
    }
  }
}

/** Detect every agent (the picker lists all four, with state). */
export function detectDrivingAgents(
  detection: DrivingAgentDetectionInput,
): DrivingAgentState[] {
  return DRIVING_AGENTS.map((a) => detectDrivingAgent(a.id, detection));
}

/** The picked driving agent, resolved for a run. */
export interface ResolvedDrivingAgent {
  /** The tab picked (null = the base — no tab picked). */
  tab: DrivingAgentTabConfig | null;
  agent: DrivingAgentId;
  label: string;
  canRun: boolean;
  notReadyReason: string | null;
}

/**
 * Resolve the active driving-agent tab from Settings. A null
 * active id, or a stale one (the tab was removed), resolves to
 * the base — the run keeps working, never an error. The caller
 * passes the detection input (read from the settings store +
 * the starship hook); tests pass it explicitly.
 */
export function resolveActiveDrivingAgent(
  tabs: DrivingAgentTabConfig[],
  activeTabId: string | null,
  detection: DrivingAgentDetectionInput,
): ResolvedDrivingAgent {
  const tab = activeTabId ? tabs.find((t) => t.id === activeTabId) ?? null : null;
  if (!tab) {
    return {
      tab: null,
      agent: 'llmbuilder',
      label: 'LLMBuilder',
      canRun: true,
      notReadyReason: null,
    };
  }
  const state = detectDrivingAgent(tab.agent, detection, tab.endpoint);
  return {
    tab,
    agent: tab.agent,
    label: drivingAgentLabel(tab.agent),
    canRun: state.canRun,
    notReadyReason: state.notReadyReason,
  };
}

/** The reply a run under an agent that cannot run yet answers
 * with — a state, never an error in the user's face. It names
 * the way back to a working agent (pick the base). */
export function drivingAgentNotReadyReply(resolved: ResolvedDrivingAgent): string {
  const name = resolved.tab ? `"${resolved.tab.name}" (${resolved.label})` : resolved.label;
  return `This driving agent ${name} is not ready yet — ${resolved.notReadyReason ?? 'it cannot run a turn.'} Pick LLMBuilder (base) in the picker to keep working.`;
}

/** One picker option — the base first, then the added tabs. */
export interface DrivingAgentPickerOption {
  /** '' = the base (no tab picked). */
  value: string;
  /** What the option shows. */
  label: string;
  /** The detection detail (the option's title). */
  title: string;
}

/**
 * The picker options for the LLMBuilder tab: the base, then
 * every driving-agent tab added in Settings, each with its
 * detection state in the label — a tab that cannot run yet
 * says so in the list, so picking it is never a surprise.
 */
export function drivingAgentPickerOptions(
  tabs: DrivingAgentTabConfig[],
  detection: DrivingAgentDetectionInput,
): DrivingAgentPickerOption[] {
  const options: DrivingAgentPickerOption[] = [
    {
      value: '',
      label: 'LLMBuilder (base)',
      title: 'The local base. Runs on this machine. No key, no network.',
    },
  ];
  for (const tab of tabs) {
    const state = detectDrivingAgent(tab.agent, detection, tab.endpoint);
    const suffix = !state.detected
      ? ' (not detected)'
      : !state.canRun
        ? ' (not connected yet)'
        : '';
    options.push({
      value: tab.id,
      label: `${tab.name} — ${drivingAgentLabel(tab.agent)}${suffix}`,
      title: state.detail,
    });
  }
  return options;
}

/** The detection input from the live stores (the runners'
 * path — tests pass the input explicitly instead). */
export function liveDrivingAgentDetection(
  hasApiKey: boolean,
  aiModel: string,
): DrivingAgentDetectionInput {
  return { hasApiKey, aiModel, starship: detectStarship() };
}
