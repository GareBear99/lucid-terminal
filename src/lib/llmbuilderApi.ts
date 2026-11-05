/**
 * Renderer-side typed wrapper for `window.lucidAPI.llmbuilder`.
 *
 * This is the single place the renderer touches the Forge IPC. The
 * `lucidAPI` type lives in src/types/index.ts, which now carries the
 * `llmbuilder` member, so this file reads the API directly off the
 * global type — no cast.
 *
 * Contract (channels the Electron agent owns — see the design §3.1):
 * status, setup, startRun, cancelRun, listRuns, getScoreboard,
 * getPromotionDecision, installBrain, rollback, getRoster, saveRoster,
 * importDataset, askBrain, onProgress. Progress events carry
 * { runId, stage, status, message, manifest? }.
 *
 * The roster JSON is an opaque blob over IPC: the main process stores
 * it, the renderer owns its shape (see src/lib/homunculi.ts).
 */

import type {
  GateDecision,
  Homunculus,
  ScoreboardRow,
  StageStatus,
} from './homunculi';

export type RunTier = 'tiny' | 'small';

export type RunStageId = 'data' | 'train' | 'benchmark' | 'gate' | 'promote';

/** One stage's live state, streamed from the main process. */
export interface LlmbuilderProgressEvent {
  runId: string;
  stage: RunStageId;
  status: StageStatus;
  message: string;
  /** Stage manifest, when the stage wrote one (e.g. artifact_manifest.json). */
  manifest?: Record<string, unknown>;
}

export interface LlmbuilderStatus {
  /** The vendored LLMBuilder tree is present and usable. */
  ready: boolean;
  pythonAvailable: boolean;
  venvReady: boolean;
  torchInstalled: boolean;
  /** True when the Mac is low on free memory — the Forge warns, never auto-starts. */
  lowMemory: boolean;
  /** Human-readable reason when not ready, or null. */
  message: string | null;
}

export interface LlmbuilderRunInfo {
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: RunTier;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  /** Per-stage statuses from the run manifest (listRuns only). */
  stages?: Array<{ stage: RunStageId; status: StageStatus }>;
  /** Gate v2 decision, when the promote stage recorded one. */
  decision?: string;
  /** Gate v2 weighted score, when the promote stage recorded one. */
  score?: number | null;
  /** Per-check demo-proof results, when this was a demo-proof run. */
  demoChecks?: DemoCheckSummary;
  /** Records in the candidate's exemplar artifact (0 = fallback answers). */
  exemplarRecords?: number;
  /** Run-level failure reason, when the run failed. */
  error?: string;
}

/** One per-check result from a demo-proof run (see jobRunner.ts). */
export interface DemoCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface DemoCheckSummary {
  passed: number;
  failed: number;
  total: number;
  checks: DemoCheck[];
}

export interface StartRunParams {
  homunculusId: string;
  /** Candidate name, e.g. 'lucifer-1'. */
  candidate: string;
  tier: RunTier;
  steps: number;
  batchSize: number;
  /** Corpus id: 'repo-text' (default) or an imported dataset id. */
  corpus: string;
  /**
   * The Forge's self/lineage/capability knowledge records as JSONL
   * (see homunculusKnowledge.ts) — staged into the vendored tree's
   * datasets dir at run start so the trainer builds exemplar records
   * from them.
   */
  knowledgeRecordsJsonl: string;
  /** True for the demo-proof workflow (demo_proof_workflow.py, tiny, 20 steps). */
  demoProof?: boolean;
}

export interface PromotionDecision {
  candidate: string;
  decision: GateDecision;
  score: number | null;
  /** Scoreboard row the decision came from, when available. */
  scoreboardRow: ScoreboardRow | null;
  /** Receipt reference, when one was kept. */
  receiptRef: string | null;
  /** Raw decision file contents (reports/promotion_decision.json). */
  raw: Record<string, unknown> | null;
}

export interface InstallBrainResult {
  /** False when the install/rollback did not happen — check before trusting modelPath. */
  ok: boolean;
  /** The GGUF path now serving as the Homunculus's brain. */
  modelPath: string;
  /** The previous incumbent's path, kept on disk for rollback. */
  previousModelPath: string | null;
  /** Human-readable reason when ok is false. */
  error?: string;
}

export interface ImportDatasetResult {
  /** Dataset id to pass as `corpus` on a run. */
  datasetId: string;
  recordCount: number;
  /** Domains/tags found in the data (feeds the capability records). */
  domains: string[];
}

/**
 * The exemplar answer — verification only, NOT a chat surface. The brain
 * answers from its training records (top-k cosine match) and says so
 * when nothing matches.
 */
export interface BrainAnswer {
  answer: string;
  /** Capabilities the matched records came from. */
  matchedCapabilities: string[];
  /** The exemplar adapter's confidence line, or null when it gave none. */
  confidence: string | null;
  /** True when the brain had no strong match and fell back honestly. */
  noMatch: boolean;
}

export interface LlmbuilderApi {
  status: () => Promise<LlmbuilderStatus>;
  /** First-run setup: venv + requirements (+ torch on demand), with progress. */
  setup: () => Promise<{ ok: boolean; message: string }>;
  startRun: (params: StartRunParams) => Promise<LlmbuilderRunInfo>;
  cancelRun: (runId: string) => Promise<{ ok: boolean }>;
  listRuns: () => Promise<LlmbuilderRunInfo[]>;
  /**
   * The scoreboard rows. The main process attaches the raw scoreboard
   * JSON as `.raw` on the returned array (non-circular, JSON-safe) —
   * read it off the array when the file itself is needed.
   */
  getScoreboard: () => Promise<ScoreboardRow[] & { raw?: Record<string, unknown> }>;
  getPromotionDecision: (candidate: string) => Promise<PromotionDecision | null>;
  installBrain: (
    homunculusId: string,
    candidate: string,
  ) => Promise<InstallBrainResult>;
  rollback: (homunculusId: string) => Promise<InstallBrainResult>;
  getRoster: () => Promise<Homunculus[] | null>;
  saveRoster: (roster: Homunculus[]) => Promise<void>;
  importDataset: (
    name: string,
    jsonl: string,
  ) => Promise<ImportDatasetResult>;
  /** Ask the installed brain — verification only, not a chat surface. */
  askBrain: (
    homunculusId: string,
    prompt: string,
  ) => Promise<BrainAnswer | null>;
  /** Subscribe to run progress events; returns an unsubscribe function. */
  onProgress: (
    callback: (event: LlmbuilderProgressEvent) => void,
  ) => () => void;
}

/**
 * The renderer-side accessor. Returns null when the preload has not
 * exposed the Forge IPC yet (e.g. an older build) — callers treat that
 * as "Forge unavailable" rather than crashing.
 */
export function getLlmbuilderApi(): LlmbuilderApi | null {
  if (typeof window === 'undefined') return null;
  return window.lucidAPI?.llmbuilder ?? null;
}
