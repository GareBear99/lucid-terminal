/**
 * Homunculi — the data model for the Forge (LLMBuilder plugin).
 *
 * A Homunculus is a named identity with a brain: a face (the Sentinel
 * SVG) plus a colour, a biography, and one model. The colour is the
 * identity; the model is the brain. Training never changes the face
 * or the colour.
 *
 * A Homunculus is BORN when its first model promotes (Gary, decision D):
 * until then it is untrained, and its lineage is empty. The lineage
 * GROWS with every promotion — entries are appended, never overwritten —
 * so a Homunculus can answer "where did you come from?" from its own
 * records (see homunculusKnowledge.ts).
 *
 * This file is the contract for the roster JSON: the Electron main
 * process treats it as an opaque blob over IPC (llmbuilder:getRoster /
 * llmbuilder:saveRoster), so the shape here is what both sides agree on.
 * Pure helpers only — no window, no IPC, no store access.
 */

export type HomunculusColor = 'purple' | 'pink';

export type HomunculusStatus =
  | 'untrained'
  | 'training'
  | 'candidate'
  | 'promoted'
  | 'installed';

export type GateDecision = 'promote' | 'archive_only' | 'reject';

export type StageStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'scaffold'
  | 'cancelled';

/** One promotion in a Homunculus's history. Appended at each promotion. */
export interface HomunculusLineageEntry {
  /** Promotion number for this Homunculus (1 = its birth). */
  promotion: number;
  /** Candidate name that promoted, e.g. 'lucifer-1'. */
  candidate: string;
  /** Parent / base model the candidate trained from, e.g. 'arc_tiny'. */
  parentBase: string;
  /** Corpus the candidate trained on, e.g. 'chatgpt-jsonl:lucifer-v1'. */
  corpus: string;
  gateDecision: GateDecision;
  /** Gate v2 weighted score, or null when no score was recorded. */
  score: number | null;
  /** Where the scoreboard row lives, e.g. 'results/scoreboard.json#lucifer-1'. */
  scoreboardRef: string;
  /** Receipt reference, or null when none was kept. */
  receiptRef: string | null;
  /** ISO timestamp of the promotion decision. */
  timestamp: string;
}

/**
 * A Homunculus's biography — its knowledge of self, in its own words.
 * Set by Gary (or the Homunculus) at birth or afterwards, through the
 * Forge. Never auto-generated: a Homunculus with no biography has
 * `biography: null`, and the UI says so plainly instead of inventing one.
 */
export interface HomunculusBiography {
  /** What kind of being it is. */
  character: string;
  /** How it comes across. */
  vibe: string;
  /** How it thinks and talks — its soul / persona. */
  persona: string;
}

export interface Homunculus {
  /** Stable id, e.g. 'lucifer'. */
  id: string;
  name: string;
  color: HomunculusColor;
  /** Null until a biography is written — never invented. */
  biography: HomunculusBiography | null;
  /** GGUF in ~/.lucid/models/, or null = no brain installed yet. */
  modelPath: string | null;
  status: HomunculusStatus;
  /** Best Gate v2 weighted score, or null when nothing has promoted. */
  incumbentScore: number | null;
  /** Promotion history — grows with each promotion, never overwritten. */
  lineage: HomunculusLineageEntry[];
  createdAt: string;
}

/** One row of the LLMBuilder scoreboard (results/scoreboard.json). */
export interface ScoreboardRow {
  candidate: string;
  /** Gate v2 weighted score, or null when the row carries none. */
  score: number | null;
  decision: GateDecision;
  /** Artifact paths for the candidate (GGUF, checkpoint, manifest). */
  artifacts: string[];
}

/** The five pipeline stages, in order: Data → Train → Benchmark → Gate → Promote. */
export const PIPELINE_STAGES = [
  'data',
  'train',
  'benchmark',
  'gate',
  'promote',
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStageId, string> = {
  data: 'Data',
  train: 'Train',
  benchmark: 'Benchmark',
  gate: 'Gate',
  promote: 'Promote',
};

/**
 * Parse scoreboard JSON into rows. The scoreboard file is written by
 * LLMBuilder's promote_candidate.py; its shape is a list of entries, or
 * an object with a `candidates` / `rows` / `scoreboard` list. Anything
 * unparseable yields an empty list — never a crash, never invented rows.
 */
export function parseScoreboard(input: unknown): ScoreboardRow[] {
  let list: unknown = null;
  if (Array.isArray(input)) {
    list = input;
  } else if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    for (const key of ['candidates', 'rows', 'scoreboard', 'entries']) {
      if (Array.isArray(obj[key])) {
        list = obj[key];
        break;
      }
    }
  }
  if (!Array.isArray(list)) return [];
  const rows: ScoreboardRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const candidate = row.candidate ?? row.name ?? row.id;
    if (typeof candidate !== 'string' || candidate.length === 0) continue;
    const decisionRaw = row.decision ?? row.gate_decision ?? row.gateDecision;
    const decision: GateDecision =
      decisionRaw === 'promote' ||
      decisionRaw === 'archive_only' ||
      decisionRaw === 'reject'
        ? decisionRaw
        : 'reject';
    const scoreRaw = row.score ?? row.weighted_score ?? row.weightedScore;
    const score =
      typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
        ? scoreRaw
        : null;
    const artifactsRaw = row.artifacts ?? row.artifact_paths ?? [];
    const artifacts = Array.isArray(artifactsRaw)
      ? artifactsRaw.filter((a): a is string => typeof a === 'string')
      : [];
    rows.push({ candidate, score, decision, artifacts });
  }
  return rows;
}

/** Display text for a Gate v2 decision. */
export function gateDecisionLabel(decision: GateDecision): string {
  switch (decision) {
    case 'promote':
      return 'Promote — becomes the new incumbent';
    case 'archive_only':
      return 'Archive only — kept, not promoted';
    case 'reject':
      return 'Reject — does not meet the Gate';
  }
}

/**
 * Display text for a pipeline stage status.
 *
 * A 'scaffold' stage trained NOTHING — the LLMBuilder LoRA/external
 * chain writes a manifest saying so and still prints ok. It must never
 * render as green / success: it renders as "scaffold — trained nothing"
 * (amber/grey in the UI; see stageStatusTone).
 */
export function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'scaffold':
      return 'Scaffold — trained nothing';
    case 'cancelled':
      return 'Cancelled';
  }
}

/**
 * Visual tone for a stage status. 'scaffold' is deliberately NOT
 * 'success' — it is a placeholder that trained nothing, shown in amber.
 */
export function stageStatusTone(
  status: StageStatus,
): 'idle' | 'running' | 'success' | 'failed' | 'warning' {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'success';
    case 'failed':
      return 'failed';
    case 'scaffold':
      return 'warning';
    case 'cancelled':
      return 'idle';
  }
}

/** Display text for a Homunculus brain status. */
export function homunculusStatusLabel(status: HomunculusStatus): string {
  switch (status) {
    case 'untrained':
      return 'Untrained — no brain yet';
    case 'training':
      return 'Training';
    case 'candidate':
      return 'Candidate — awaiting the Gate';
    case 'promoted':
      return 'Promoted — ready to install';
    case 'installed':
      return 'Installed — brain live';
  }
}

/** A new, untrained Homunculus. Born only when its first model promotes. */
export function emptyHomunculus(
  id: string,
  name: string,
  color: HomunculusColor,
): Homunculus {
  return {
    id,
    name,
    color,
    biography: null,
    modelPath: null,
    status: 'untrained',
    incumbentScore: null,
    lineage: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Return a NEW Homunculus with the entry appended to its lineage.
 * Lineage grows — entries are never overwritten or dropped, so the
 * record of where a Homunculus came from only ever gets longer.
 */
export function appendLineageEntry(
  homunculus: Homunculus,
  entry: HomunculusLineageEntry,
): Homunculus {
  return { ...homunculus, lineage: [...homunculus.lineage, entry] };
}

/** Validate a stored colour value — only the two exact strings count. */
export function parseHomunculusColorValue(
  value: unknown,
): HomunculusColor | null {
  return value === 'purple' || value === 'pink' ? value : null;
}
