/**
 * Forge job runner — training runs as serialized subprocess jobs.
 *
 * One training job at a time (a single-worker TaskQueue with the new
 * task type 'llmbuilder'). Each run is five stages, in order:
 * Data → Train → Benchmark → Gate → Promote. Every stage is a Python
 * child spawned via getPythonCommand() with -u (unbuffered stdout, so
 * prints arrive live), its stdout streamed to the UI as a
 * human-readable log. Cancellation kills the child process — a run
 * that cannot be cancelled would feel like a hang.
 *
 * A stage's status comes from its manifest on disk, never from the
 * exit code alone. If a stage wrote a scaffold manifest
 * (status 'scaffold_ready'), its status is 'scaffold' — shown
 * honestly, never green. The LoRA chain
 * (run_candidate_artifact_chain.py) is NOT run: LoRA on a real base
 * model is out of scope for v1, and the chain prints ok even when
 * every stage was a scaffold that trained nothing.
 *
 * Data staging: the native trainer reads its corpus from ROOT
 * (the vendored tree) — collect_corpus walks the repo and
 * collect_sft_corpus reads ROOT/datasets/{arc_neuron_small,
 * arc_neuron_base, distillation_sft, runtime_mindshape} plus
 * ROOT/data/{plan, critique, repair, observe_infer}. The exemplar
 * sidecar reads ROOT/datasets/{distillation_sft, runtime_mindshape,
 * ...}. So the runner copies the Homunculus dataset JSONL and the
 * passed-in knowledge records into the vendored tree's
 * datasets/distillation_sft/ at run start (copy, never move — the
 * durable copies stay in the state dir) and records the corpus
 * provenance in the run manifest. datasets/distillation_sft is the
 * one SFT dir both the trainer and the exemplar builder read.
 *
 * Runs only start on the user's click; nothing here auto-starts.
 * Training is local-only: the children run on this machine.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskQueue, TaskCancelledError } from '../tasks/taskQueue';
import { getPythonCommand } from '../pythonPath';
import {
  LlmbuilderPaths,
  builderReady,
  ensureBuilderWorkCopy,
  ensureLlmbuilderDirs,
  venvReady,
} from './paths';

export type RunTier = 'tiny' | 'small';

export type RunStageId = 'data' | 'train' | 'benchmark' | 'gate' | 'promote';

export type StageStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'scaffold'
  | 'cancelled';

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** Progress event streamed to the renderer on llmbuilder:progress. */
export interface LlmbuilderProgressEvent {
  runId: string;
  stage: RunStageId;
  status: StageStatus;
  message: string;
  /** Stage manifest, when the stage wrote one. */
  manifest?: Record<string, unknown>;
}

export interface StartRunOptions {
  homunculusId: string;
  /** Candidate name, e.g. 'lucifer-1'. */
  candidate: string;
  tier: RunTier;
  steps: number;
  batchSize: number;
  /**
   * Corpus: 'repo' / 'repo-text' (repo text only, the quick demo
   * path), 'imported' (needs datasetFile), or an imported dataset id
   * (the id importDataset returned).
   */
  corpus: string;
  /** Imported dataset filename under datasets/<homunculusId>/. */
  datasetFile?: string;
  /** Knowledge records as JSONL (staged into the vendored tree). */
  knowledgeRecordsJsonl?: string;
  /** True for the demo-proof workflow (demo_proof_workflow.py). */
  demoProof?: boolean;
}

export interface CorpusFileProvenance {
  path: string;
  /** Record count, or null when it cannot be counted (repo text). */
  records: number | null;
  kind: 'imported' | 'knowledge' | 'repo';
}

export interface CorpusProvenance {
  files: CorpusFileProvenance[];
  importedRecords: number;
  knowledgeRecords: number;
  /** Knowledge lines that did not parse as JSON (skipped). */
  knowledgeInvalidLines: number;
  /** The trainer always includes repo text via collect_corpus. */
  repoText: boolean;
}

export interface RunStageRecord {
  stage: RunStageId;
  status: StageStatus;
  message?: string;
  manifest?: Record<string, unknown>;
}

/**
 * One per-check result from a demo-proof run. The demo script prints
 * one `✓` / `✗` line per check (step 1 teach, step 6 train, step 8
 * gate, …) and still exits 0 with a final `"ok": true` even when
 * checks failed — so the exit code and that final JSON are NOT a
 * pass signal. The per-check lines are the real result.
 */
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

export interface RunManifest {
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: RunTier;
  steps: number;
  batchSize: number;
  corpus: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  stages: RunStageRecord[];
  corpusProvenance?: CorpusProvenance;
  /** Gate v2 decision, when the promote stage recorded one. */
  decision?: string;
  /** Gate v2 weighted score, when the promote stage recorded one. */
  score?: number | null;
  /** Per-check demo-proof results, when this was a demo-proof run. */
  demoChecks?: DemoCheckSummary;
  /** Records in the candidate's exemplar artifact (0 = fallback answers). */
  exemplarRecords?: number;
  error?: string;
}

export interface StartedRun {
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: RunTier;
  status: 'running';
  startedAt: string;
}

/** A spawn function, injectable so tests can fake the child process. */
export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
) => ChildProcess;

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Polled while the child runs; true kills it. */
  isCancelled?: () => boolean;
  /** Kill the child after this long (0 = no timeout). */
  timeoutMs?: number;
  /** Receives a kill function for the live child (cancel path). */
  killHandle?: { kill: (() => void) | null };
  spawnFn?: SpawnFn;
}

export interface RunProcessResult {
  code: number | null;
  cancelled: boolean;
  timedOut: boolean;
  spawnError?: Error;
  stdout: string;
  stderr: string;
}

/** Keep the tail of a child's output (bounded, for error reports). */
const MAX_OUTPUT_TAIL = 200 * 1024;

function tail(text: string): string {
  return text.length > MAX_OUTPUT_TAIL
    ? text.slice(text.length - MAX_OUTPUT_TAIL)
    : text;
}

/**
 * Spawn a child and wait for it. Stdout/stderr stream line by line
 * to onLine; cancellation (isCancelled or killHandle) kills the child
 * with SIGTERM, then SIGKILL after a grace period. A failed spawn
 * (e.g. python3 ENOENT) is reported as spawnError, never thrown —
 * the caller turns it into a failed stage with an honest message.
 */
export function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const spawnFn: SpawnFn =
    options.spawnFn ??
    ((command, args, spawnOptions) =>
      spawn(command, args, {
        cwd: spawnOptions.cwd,
        env: spawnOptions.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killedByUs = false;
    let timer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    const finish = (result: RunProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (options.killHandle) options.killHandle.kill = null;
      resolve({ ...result, stdout: tail(stdout), stderr: tail(stderr) });
    };

    let proc: ChildProcess;
    try {
      proc = spawnFn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
      });
    } catch (err) {
      finish({
        code: null,
        cancelled: false,
        timedOut: false,
        spawnError: err instanceof Error ? err : new Error(String(err)),
        stdout: '',
        stderr: '',
      });
      return;
    }

    const killChild = (): void => {
      killedByUs = true;
      try {
        proc.kill('SIGTERM');
      } catch {
        // Already gone.
      }
      // Force after a grace period if it ignores SIGTERM.
      setTimeout(() => {
        try {
          if (proc.exitCode === null) proc.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }, 1000).unref?.();
    };
    if (options.killHandle) options.killHandle.kill = killChild;

    const feedLines = (
      chunk: Buffer | string,
      stream: 'stdout' | 'stderr',
    ): void => {
      const text = chunk.toString();
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      for (const line of text.split('\n')) {
        if (line.trim().length > 0) options.onLine?.(line, stream);
      }
    };
    proc.stdout?.on('data', (d: Buffer | string) => feedLines(d, 'stdout'));
    proc.stderr?.on('data', (d: Buffer | string) => feedLines(d, 'stderr'));

    // A failed spawn does NOT throw synchronously: Node emits it
    // async as an 'error' event, and with no listener that is an
    // uncaught exception in the main process. Handle it here and
    // report it as a failed stage instead of crashing.
    proc.on('error', (err: Error) => {
      finish({
        code: null,
        cancelled: false,
        timedOut: false,
        spawnError: err,
        stdout: '',
        stderr: '',
      });
    });
    proc.on('exit', (code: number | null) => {
      finish({
        code,
        cancelled: killedByUs,
        timedOut: false,
        stdout: '',
        stderr: '',
      });
    });

    timer = options.isCancelled
      ? setInterval(() => {
          if (!settled && options.isCancelled?.()) killChild();
        }, 150)
      : null;
    timeoutTimer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            killedByUs = true;
            try {
              proc.kill('SIGKILL');
            } catch {
              // Already gone.
            }
            finish({
              code: null,
              cancelled: false,
              timedOut: true,
              stdout: '',
              stderr: '',
            });
          }, options.timeoutMs)
        : null;
  });
}

/**
 * Read one stage's status from its manifest on disk. A scaffold
 * manifest (status 'scaffold_ready', or execution_mode/mode
 * 'scaffold') is 'scaffold' — never green. A manifest with
 * ok: true/false and no status field (e.g. the gate report) reads
 * from ok. Anything else present but unrecognised is 'failed' with
 * the reason named — an unknown manifest is never a pass.
 */
export function readStageStatus(manifestPath: string): {
  status: StageStatus;
  manifest: Record<string, unknown> | null;
  reason?: string;
} {
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch {
    return {
      status: 'failed',
      manifest: null,
      reason: `no manifest written at ${manifestPath}`,
    };
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return {
      status: 'failed',
      manifest: null,
      reason: `manifest at ${manifestPath} is not valid JSON`,
    };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      status: 'failed',
      manifest: null,
      reason: `manifest at ${manifestPath} is not a JSON object`,
    };
  }
  const m = manifest as Record<string, unknown>;
  const statusValue = m.status;
  if (typeof statusValue === 'string') {
    if (
      statusValue === 'completed' ||
      statusValue === 'external_completed' ||
      statusValue === 'ok'
    ) {
      return { status: 'completed', manifest: m };
    }
    if (
      statusValue === 'scaffold' ||
      statusValue === 'scaffold_ready' ||
      statusValue === 'scaffold_only'
    ) {
      return {
        status: 'scaffold',
        manifest: m,
        reason: `stage wrote a scaffold manifest (status '${statusValue}') — it trained nothing`,
      };
    }
    if (
      statusValue === 'failed' ||
      statusValue === 'error' ||
      statusValue === 'arc_native_failed'
    ) {
      return {
        status: 'failed',
        manifest: m,
        reason: `stage manifest reports status '${statusValue}'`,
      };
    }
    return {
      status: 'failed',
      manifest: m,
      reason: `stage manifest has unrecognised status '${statusValue}'`,
    };
  }
  const mode = m.execution_mode ?? m.mode;
  if (mode === 'scaffold') {
    return {
      status: 'scaffold',
      manifest: m,
      reason: 'stage ran in scaffold mode — it trained nothing',
    };
  }
  if (typeof m.ok === 'boolean') {
    return m.ok
      ? { status: 'completed', manifest: m }
      : {
          status: 'failed',
          manifest: m,
          reason: 'stage report says ok: false',
        };
  }
  return {
    status: 'failed',
    manifest: m,
    reason: `manifest at ${manifestPath} has no recognised status`,
  };
}

/**
 * Benchmark status: the scored outputs file is the manifest. It
 * must exist, parse, and hold at least one scored result — and the
 * raw model outputs must exist too. No scored results means the
 * benchmark produced nothing, however the script exited.
 */
export function readBenchmarkStatus(
  scoredPath: string,
  outputsPath: string,
): {
  status: StageStatus;
  manifest: Record<string, unknown> | null;
  reason?: string;
} {
  let raw: string;
  try {
    raw = fs.readFileSync(scoredPath, 'utf-8');
  } catch {
    return {
      status: 'failed',
      manifest: null,
      reason: `no scored outputs at ${scoredPath}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'failed',
      manifest: null,
      reason: `scored outputs at ${scoredPath} are not valid JSON`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'failed',
      manifest: null,
      reason: `scored outputs at ${scoredPath} are not a JSON object`,
    };
  }
  const m = parsed as Record<string, unknown>;
  const results = m.results;
  const count = Array.isArray(results) ? results.length : 0;
  if (!fs.existsSync(outputsPath)) {
    return {
      status: 'failed',
      manifest: m,
      reason: `no raw model outputs at ${outputsPath}`,
    };
  }
  if (count === 0) {
    return {
      status: 'failed',
      manifest: m,
      reason: 'benchmark scored zero results',
    };
  }
  return { status: 'completed', manifest: { ...m, resultCount: count } };
}

/**
 * Parse one demo-proof check line: `  ✓  Term stored  ['proof_cycle']`
 * or `  ✗  SFT export wrote records`. The `     FAIL: <label>` line
 * the script prints under a failure is not a check line (it repeats
 * the ✗ line) and returns null, as does any other log line.
 */
export function parseDemoCheckLine(line: string): DemoCheck | null {
  const match = /^\s*([✓✗])\s+(.+?)(?:\s+\[(.+)\])?\s*$/.exec(line);
  if (!match) return null;
  const label = match[2].trim();
  if (label === '') return null;
  const detail = match[3]?.trim();
  return {
    label,
    ok: match[1] === '✓',
    detail: detail !== undefined && detail !== '' ? detail : undefined,
  };
}

/** Tally parsed demo-proof check lines into a structured summary. */
export function summarizeDemoChecks(checks: DemoCheck[]): DemoCheckSummary {
  let passed = 0;
  for (const check of checks) {
    if (check.ok) passed += 1;
  }
  return {
    passed,
    failed: checks.length - passed,
    total: checks.length,
    checks,
  };
}

/**
 * Records in a candidate's exemplar artifact (from its
 * exemplar_train manifest). Null when the manifest is absent.
 * Zero records means the benchmark answers from the generic
 * fallback, not the trained weights — the score then reflects
 * fallback text matching rubric keywords, and the UI must say so.
 */
export function readExemplarRecordCount(
  paths: LlmbuilderPaths,
  candidate: string,
): number | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(
        path.join(
          paths.builderDir,
          'exports',
          'candidates',
          candidate,
          'exemplar_train',
          'artifact_manifest.json',
        ),
        'utf-8',
      ),
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const metrics = (parsed as Record<string, unknown>).metrics;
      if (metrics && typeof metrics === 'object' && !Array.isArray(metrics)) {
        const count = (metrics as Record<string, unknown>).record_count;
        if (typeof count === 'number') return count;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a promotion decision file, or null when it is absent/unreadable. */
export function readPromotionDecisionFile(
  decisionPath: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(decisionPath, 'utf-8'),
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a scoreboard file, or null when it is absent/unreadable. */
export function readScoreboardFile(
  scoreboardPath: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(scoreboardPath, 'utf-8'),
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dataset validation (JSONL import)
// ---------------------------------------------------------------------------

export interface DatasetLineResult {
  record?: Record<string, unknown>;
  error?: string;
}

const INPUT_KEYS = ['input', 'prompt', 'instruction'];
const TARGET_KEYS = ['target', 'response', 'output'];

/**
 * Validate one JSONL line. A record needs an input (input / prompt /
 * instruction) AND a target (target / response / output), or a
 * messages array with a user turn and an assistant turn. A bad line
 * is reported, never silently accepted.
 */
export function validateDatasetLine(
  line: string,
  lineNumber: number,
): DatasetLineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { error: `line ${lineNumber}: not valid JSON` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: `line ${lineNumber}: not a JSON object` };
  }
  const rec = parsed as Record<string, unknown>;
  const hasInput = INPUT_KEYS.some(
    (k) => typeof rec[k] === 'string' && (rec[k] as string).trim() !== '',
  );
  const hasTarget = TARGET_KEYS.some(
    (k) => typeof rec[k] === 'string' && (rec[k] as string).trim() !== '',
  );
  if (hasInput && hasTarget) return { record: rec };
  const messages = rec.messages;
  if (Array.isArray(messages)) {
    const roles = messages
      .filter(
        (m): m is Record<string, unknown> =>
          !!m && typeof m === 'object' && !Array.isArray(m),
      )
      .map((m) => m.role);
    const hasUser = roles.includes('user');
    const hasAssistant = roles.includes('assistant');
    if (hasUser && hasAssistant) return { record: rec };
    return {
      error: `line ${lineNumber}: messages array needs a user turn and an assistant turn`,
    };
  }
  return {
    error: `line ${lineNumber}: missing input/target (needs input/prompt/instruction and target/response/output, or messages with user+assistant)`,
  };
}

export interface ValidatedDataset {
  records: Array<Record<string, unknown>>;
  errors: string[];
  /** Distinct domain/capability values found in the valid records. */
  domains: string[];
}

/** Validate a whole JSONL document. Blank lines are skipped, not errors. */
export function validateDatasetJsonl(content: string): ValidatedDataset {
  const records: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const domains = new Set<string>();
  const lines = content.split('\n');
  let nonEmpty = 0;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line === '') return;
    nonEmpty += 1;
    const result = validateDatasetLine(line, idx + 1);
    if (result.record) {
      records.push(result.record);
      for (const key of ['domain', 'capability']) {
        const value = result.record[key];
        if (typeof value === 'string' && value.trim() !== '') {
          domains.add(value.trim());
        }
      }
    } else if (result.error) {
      errors.push(result.error);
    }
  });
  if (nonEmpty === 0) {
    errors.push('empty file: no records');
  }
  return { records, errors, domains: Array.from(domains).sort() };
}

export interface ImportDatasetResult {
  ok: boolean;
  records: number;
  recordCount: number;
  datasetId: string;
  domains: string[];
  errors: string[];
}

/** A safe dataset filename: basename only, no traversal, .jsonl suffix. */
export function sanitizeDatasetFilename(filename: string): string | null {
  const base = path.basename(filename.trim());
  if (base === '' || base === '.' || base === '..') return null;
  if (base.includes('\0')) return null;
  return base.endsWith('.jsonl') ? base : `${base}.jsonl`;
}

/**
 * Import a JSONL dataset: validate every line, write only the valid
 * records to datasets/<homunculusId>/<filename>. Bad lines are
 * listed in errors and skipped — never silently accepted, and never
 * a reason to reject the whole file for one bad line. An empty file
 * (no records at all) is rejected outright.
 */
export function importDatasetFile(
  paths: LlmbuilderPaths,
  args: { homunculusId: string; filename: string; content: string },
): ImportDatasetResult {
  const filename = sanitizeDatasetFilename(args.filename);
  const datasetId = `${args.homunculusId}/${filename ?? args.filename}`;
  const validated = validateDatasetJsonl(args.content);
  if (!filename) {
    return {
      ok: false,
      records: 0,
      recordCount: 0,
      datasetId,
      domains: [],
      errors: ['invalid filename'],
    };
  }
  if (validated.records.length === 0) {
    return {
      ok: false,
      records: 0,
      recordCount: 0,
      datasetId,
      domains: validated.domains,
      errors:
        validated.errors.length > 0
          ? validated.errors
          : ['empty file: no records'],
    };
  }
  ensureLlmbuilderDirs(paths);
  const dir = path.join(paths.datasetsDir, args.homunculusId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, filename);
  const body = validated.records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileAtomic(target, body);
  return {
    ok: true,
    records: validated.records.length,
    recordCount: validated.records.length,
    datasetId,
    domains: validated.domains,
    errors: validated.errors,
  };
}

/** Atomic write: temp file in the same dir, then rename. */
export function writeFileAtomic(target: string, content: string): void {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, target);
}

/** Copy a file, creating the parent dir. No-op when the source is missing. */
export function copyFileIfExists(source: string, target: string): boolean {
  try {
    if (!fs.statSync(source).isFile()) return false;
  } catch {
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

/** Recursive directory copy (for mirroring candidate exports). */
export function copyDirRecursive(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

// ---------------------------------------------------------------------------
// Roster persistence (the Homunculus JSON is an opaque blob here)
// ---------------------------------------------------------------------------

/** Read the roster, or null when no roster file exists yet. */
export function readRoster(paths: LlmbuilderPaths): unknown {
  try {
    return JSON.parse(fs.readFileSync(paths.rosterPath, 'utf-8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

/** Save the roster with an atomic write (temp + rename). */
export function writeRosterAtomic(
  paths: LlmbuilderPaths,
  homunculi: unknown,
): void {
  ensureLlmbuilderDirs(paths);
  writeFileAtomic(paths.rosterPath, JSON.stringify(homunculi, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Run manifests
// ---------------------------------------------------------------------------

export function runManifestPath(paths: LlmbuilderPaths, runId: string): string {
  return path.join(paths.runsDir, `${runId}.json`);
}

export function writeRunManifest(
  paths: LlmbuilderPaths,
  manifest: RunManifest,
): void {
  ensureLlmbuilderDirs(paths);
  writeFileAtomic(
    runManifestPath(paths, manifest.runId),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

export function readRunManifest(
  paths: LlmbuilderPaths,
  runId: string,
): RunManifest | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(runManifestPath(paths, runId), 'utf-8'),
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as RunManifest;
    }
    return null;
  } catch {
    return null;
  }
}

/** All run manifests, newest first. */
export function listRunManifests(paths: LlmbuilderPaths): RunManifest[] {
  try {
    const files = fs
      .readdirSync(paths.runsDir)
      .filter((f) => f.endsWith('.json'));
    const manifests: RunManifest[] = [];
    for (const file of files) {
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(path.join(paths.runsDir, file), 'utf-8'),
        );
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          manifests.push(parsed as RunManifest);
        }
      } catch {
        // A corrupt run file is skipped, not fatal to the list.
      }
    }
    manifests.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    return manifests;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Artifact resolution
// ---------------------------------------------------------------------------

/** The exemplar model the trainer builds as a sidecar for a candidate. */
export function exemplarArtifactPath(
  paths: LlmbuilderPaths,
  candidate: string,
): string | null {
  const rel = path.join(
    'exports',
    'candidates',
    candidate,
    'exemplar_train',
    'exemplar_model.json',
  );
  const inBuilder = path.join(paths.builderDir, rel);
  if (fs.existsSync(inBuilder)) return inBuilder;
  const inData = path.join(paths.dataDir, rel);
  if (fs.existsSync(inData)) return inData;
  return null;
}

/** The real GGUF a native-train run writes for a candidate. */
export function candidateGgufPath(
  paths: LlmbuilderPaths,
  candidate: string,
): string | null {
  const rel = path.join(
    'exports',
    'candidates',
    candidate,
    'lora_train',
    'checkpoint',
    `arc_native_${candidate}.gguf`,
  );
  const inBuilder = path.join(paths.builderDir, rel);
  if (fs.existsSync(inBuilder)) return inBuilder;
  const inData = path.join(paths.dataDir, rel);
  if (fs.existsSync(inData)) return inData;
  return null;
}

/**
 * Find the Homunculus's latest exemplar artifact: the latest run
 * manifest for the Homunculus names its candidate; fall back to the
 * newest candidate dir starting with `<homunculusId>-` that has an
 * exemplar model. Null when the Homunculus has no brain yet.
 *
 * This is the LATEST candidate, not necessarily the INSTALLED brain —
 * it is only the fallback for when no brain has been installed (no
 * install record). `runAskBrain` prefers the installed candidate's
 * exemplar (see installedCandidateFor) so the brain never answers
 * from a different model's records.
 */
export function findHomunculusExemplar(
  paths: LlmbuilderPaths,
  homunculusId: string,
): { candidate: string; artifact: string } | null {
  const runs = listRunManifests(paths).filter(
    (r) => r.homunculusId === homunculusId,
  );
  const candidates: string[] = [];
  for (const run of runs) {
    if (run.candidate && !candidates.includes(run.candidate)) {
      candidates.push(run.candidate);
    }
  }
  // Fall back to whatever candidate dirs exist on disk.
  try {
    const base = path.join(paths.builderDir, 'exports', 'candidates');
    const dirs = fs
      .readdirSync(base, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && d.name.startsWith(`${homunculusId}-`),
      )
      .map((d) => ({
        name: d.name,
        mtime: fs.statSync(path.join(base, d.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .map((d) => d.name);
    for (const dir of dirs) {
      if (!candidates.includes(dir)) candidates.push(dir);
    }
  } catch {
    // No candidate dirs — nothing to fall back to.
  }
  for (const candidate of candidates) {
    const artifact = exemplarArtifactPath(paths, candidate);
    if (artifact) return { candidate, artifact };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Installed-brain record — the brain IS the trained model (Gary:
// never let them conflict). When a promoted model is installed as a
// Homunculus's brain, the installed candidate is recorded in a
// sidecar next to the GGUF, so ask-the-brain resolves the exemplar
// from the INSTALLED candidate — never from the latest candidate,
// which may be a newer model that has not been installed. Rollback
// swaps the sidecars with the GGUFs, so the record always describes
// the model that is actually installed. A sidecar that named the
// wrong candidate would answer from another model's records — worse
// than none, so a stale one is removed, never kept.
// ---------------------------------------------------------------------------

export interface InstalledBrainRecord {
  candidate: string;
  modelPath: string;
  installedAt: string;
}

/** Sidecar path recording which candidate is installed as the brain. */
export function installedCandidatePath(
  paths: LlmbuilderPaths,
  homunculusId: string,
): string {
  return path.join(paths.modelsDir, `${homunculusId}.installed.json`);
}

/** Sidecar path for the previous incumbent's candidate. */
export function previousInstalledCandidatePath(
  paths: LlmbuilderPaths,
  homunculusId: string,
): string {
  return path.join(
    paths.modelsDir,
    `${homunculusId}.gguf.prev.installed.json`,
  );
}

/** The installed candidate, or null when no install has been recorded. */
export function installedCandidateFor(
  paths: LlmbuilderPaths,
  homunculusId: string,
): string | null {
  try {
    const raw = fs.readFileSync(
      installedCandidatePath(paths, homunculusId),
      'utf-8',
    );
    const rec = JSON.parse(raw) as Partial<InstalledBrainRecord>;
    return typeof rec.candidate === 'string' && rec.candidate !== ''
      ? rec.candidate
      : null;
  } catch {
    return null;
  }
}

/** Record that `candidate` is installed as the Homunculus's brain. */
export function writeInstalledCandidate(
  paths: LlmbuilderPaths,
  homunculusId: string,
  candidate: string,
  modelPath: string,
): void {
  ensureLlmbuilderDirs(paths);
  const rec: InstalledBrainRecord = {
    candidate,
    modelPath,
    installedAt: new Date().toISOString(),
  };
  writeFileAtomic(
    installedCandidatePath(paths, homunculusId),
    JSON.stringify(rec, null, 2) + '\n',
  );
}

/**
 * Swap two installed-candidate sidecars the way rollback swaps the
 * GGUFs: after the swap, the sidecar at `a` describes the model now
 * at `a` (the old model at `b`), and vice versa. When only one
 * exists, it moves to `a`; when only `a` exists, it is removed — it
 * described the model that was just displaced, and keeping it would
 * name the wrong brain.
 */
export function swapInstalledCandidateSidecars(a: string, b: string): void {
  const aHas = fs.existsSync(a);
  const bHas = fs.existsSync(b);
  if (aHas && bHas) {
    const tmp = `${a}.swap-${process.pid}-${Date.now()}`;
    fs.renameSync(a, tmp);
    fs.renameSync(b, a);
    fs.renameSync(tmp, b);
  } else if (bHas) {
    fs.renameSync(b, a);
  } else if (aHas) {
    fs.unlinkSync(a);
  }
}

// ---------------------------------------------------------------------------
// Corpus staging + the run
// ---------------------------------------------------------------------------

/** 'repo' / 'repo-text' → repo text only; anything else is a dataset id. */
export function normalizeCorpus(corpus: string | undefined): string {
  const value = (corpus ?? '').trim();
  if (value === '' || value === 'repo' || value === 'repo-text') return 'repo';
  return value;
}

/** Resolve an imported dataset file for a run (null when not found). */
export function resolveDatasetFile(
  paths: LlmbuilderPaths,
  homunculusId: string,
  corpus: string,
  datasetFile?: string,
): string | null {
  const names: string[] = [];
  if (datasetFile) names.push(datasetFile);
  if (corpus !== 'repo' && corpus !== 'imported') names.push(corpus);
  if (corpus === 'imported' && datasetFile) names.push(datasetFile);
  const tried = new Set<string>();
  for (const name of names) {
    for (const candidate of [
      path.join(paths.datasetsDir, homunculusId, name),
      path.join(paths.datasetsDir, homunculusId, `${name}.jsonl`),
      path.join(paths.datasetsDir, name),
      path.join(paths.datasetsDir, `${name}.jsonl`),
    ]) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Not this one.
      }
    }
  }
  return null;
}

function countJsonlRecords(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let count = 0;
    for (const line of content.split('\n')) {
      if (line.trim() !== '') count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Stage the corpus into the vendored tree's datasets dir, where the
 * trainer reads it (datasets/distillation_sft is read by both the
 * native trainer's collect_sft_corpus and the exemplar builder).
 * Copy, never move — the durable copies stay in the state dir.
 */
export function stageCorpus(
  paths: LlmbuilderPaths,
  opts: StartRunOptions,
): CorpusProvenance {
  ensureLlmbuilderDirs(paths);
  const corpus = normalizeCorpus(opts.corpus);
  const stagingDir = path.join(
    paths.builderDir,
    'datasets',
    'distillation_sft',
  );
  fs.mkdirSync(stagingDir, { recursive: true });
  const provenance: CorpusProvenance = {
    files: [
      {
        path: 'repo text (collect_corpus, 600 KB cap)',
        records: null,
        kind: 'repo',
      },
    ],
    importedRecords: 0,
    knowledgeRecords: 0,
    knowledgeInvalidLines: 0,
    repoText: true,
  };

  if (corpus !== 'repo') {
    const datasetPath = resolveDatasetFile(
      paths,
      opts.homunculusId,
      corpus,
      opts.datasetFile,
    );
    if (!datasetPath) {
      throw new Error(
        `Dataset file not found for corpus '${corpus}' — import a dataset in the Forge first.`,
      );
    }
    const stagedName = `${opts.homunculusId}-${opts.candidate}-imported.jsonl`;
    const staged = path.join(stagingDir, stagedName);
    fs.copyFileSync(datasetPath, staged);
    const records = countJsonlRecords(staged);
    provenance.importedRecords = records;
    provenance.files.push({
      path: staged,
      records,
      kind: 'imported',
    });
  }

  const knowledge = (opts.knowledgeRecordsJsonl ?? '').trim();
  if (knowledge !== '') {
    let valid = 0;
    let invalid = 0;
    const validLines: string[] = [];
    for (const raw of knowledge.split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      try {
        JSON.parse(line);
        valid += 1;
        validLines.push(line);
      } catch {
        invalid += 1;
      }
    }
    provenance.knowledgeRecords = valid;
    provenance.knowledgeInvalidLines = invalid;
    if (valid > 0) {
      const stagedName = `${opts.homunculusId}-${opts.candidate}-knowledge.jsonl`;
      const body = validLines.join('\n') + '\n';
      fs.writeFileSync(path.join(stagingDir, stagedName), body, 'utf-8');
      // Durable copy in the state dir, so the records survive the run.
      const durableDir = path.join(paths.datasetsDir, opts.homunculusId);
      fs.mkdirSync(durableDir, { recursive: true });
      fs.writeFileSync(
        path.join(durableDir, `${opts.candidate}-knowledge.jsonl`),
        body,
        'utf-8',
      );
      provenance.files.push({
        path: path.join(stagingDir, stagedName),
        records: valid,
        kind: 'knowledge',
      });
    }
  }

  return provenance;
}

/** Mirror a candidate's vendored outputs into the state dir. */
function mirrorCandidateOutputs(
  paths: LlmbuilderPaths,
  candidate: string,
): void {
  const from = path.join(paths.builderDir, 'exports', 'candidates', candidate);
  const to = path.join(paths.dataDir, 'exports', 'candidates', candidate);
  try {
    if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
  } catch {
    // Nothing to mirror.
  }
  copyFileIfExists(
    path.join(paths.builderDir, 'reports', `arc_native_train_${candidate}.json`),
    path.join(paths.reportsDir, `arc_native_train_${candidate}.json`),
  );
}

export interface JobRunnerDeps {
  spawnFn?: SpawnFn;
  emit?: (event: LlmbuilderProgressEvent) => void;
}

/**
 * One training job at a time. startRun enqueues on the shared queue
 * and returns immediately; the work runs on the queue worker.
 */
export class LlmbuilderJobRunner {
  private readonly paths: LlmbuilderPaths;
  private readonly spawnFn?: SpawnFn;
  private readonly emitFn?: (event: LlmbuilderProgressEvent) => void;
  private readonly queue = new TaskQueue(1);
  private readonly live = new Map<
    string,
    { taskId: string; kill: (() => void) | null }
  >();

  constructor(paths: LlmbuilderPaths, deps: JobRunnerDeps = {}) {
    this.paths = paths;
    this.spawnFn = deps.spawnFn;
    this.emitFn = deps.emit;
  }

  private emit(event: LlmbuilderProgressEvent): void {
    this.emitFn?.(event);
  }

  private pythonCommand(): string {
    return venvReady(this.paths)
      ? this.paths.venvPython
      : getPythonCommand();
  }

  startRun(opts: StartRunOptions): StartedRun {
    // Packaged app: refresh the writable working copy before the run
    // stages anything into the tree (no-op in dev, and a no-op when
    // the copy is already current).
    ensureBuilderWorkCopy(this.paths);
    if (!opts.homunculusId || !opts.candidate) {
      throw new Error('startRun needs a homunculusId and a candidate name');
    }
    if (opts.tier !== 'tiny' && opts.tier !== 'small') {
      throw new Error(`unknown tier '${opts.tier}' — expected 'tiny' or 'small'`);
    }
    if (!Number.isInteger(opts.steps) || opts.steps < 1) {
      throw new Error('startRun needs steps >= 1');
    }
    if (!Number.isInteger(opts.batchSize) || opts.batchSize < 1) {
      throw new Error('startRun needs batchSize >= 1');
    }
    const runId = `run-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const manifest: RunManifest = {
      runId,
      homunculusId: opts.homunculusId,
      candidate: opts.candidate,
      tier: opts.tier,
      steps: opts.steps,
      batchSize: opts.batchSize,
      corpus: normalizeCorpus(opts.corpus),
      startedAt,
      status: 'running',
      stages: [],
    };
    writeRunManifest(this.paths, manifest);
    // The queue worker starts synchronously inside enqueue, so the
    // live entry must exist BEFORE enqueueing — executeRun captures
    // it on entry to wire the kill handle cancelRun uses. (Setting
    // it after enqueue left the entry undefined and cancel could
    // never kill a running child.)
    this.live.set(runId, { taskId: '', kill: null });
    const { id: taskId, promise } = this.queue.enqueue<RunManifest>(
      'llmbuilder',
      { runId, homunculusId: opts.homunculusId, candidate: opts.candidate },
      (_task, isCancelled) => this.executeRun(opts, manifest, isCancelled),
    );
    // A run that fails synchronously in its first stage (e.g. a
    // missing dataset) already deleted its live entry by now — the
    // task id is moot for it.
    const liveEntry = this.live.get(runId);
    if (liveEntry) liveEntry.taskId = taskId;
    // The queue's promise already carries a no-op catch; this one is
    // for the runner's own bookkeeping only.
    promise.catch(() => undefined);
    return {
      runId,
      homunculusId: opts.homunculusId,
      candidate: opts.candidate,
      tier: opts.tier,
      status: 'running',
      startedAt,
    };
  }

  /**
   * Cancel a run. A queued run never starts; a running run has its
   * child process killed. Returns false when the run id is unknown
   * or already finished.
   */
  cancelRun(runId: string): { ok: boolean } {
    const entry = this.live.get(runId);
    if (!entry) {
      const manifest = readRunManifest(this.paths, runId);
      if (manifest && manifest.status === 'running') {
        // The runner restarted (or the map was dropped): the queue
        // still knows the task, but we cannot kill a child we never
        // held. Report it honestly.
        return { ok: false };
      }
      return { ok: false };
    }
    try {
      entry.kill?.();
    } catch {
      // The child is already gone.
    }
    const cancelled = this.queue.cancel(entry.taskId);
    if (cancelled) {
      // Mark the manifest cancelled so listRuns shows it at once,
      // even before the worker notices the flag.
      const manifest = readRunManifest(this.paths, runId);
      if (manifest && manifest.status === 'running') {
        manifest.status = 'cancelled';
        manifest.finishedAt = new Date().toISOString();
        const last = manifest.stages[manifest.stages.length - 1];
        if (last && last.status === 'running') last.status = 'cancelled';
        writeRunManifest(this.paths, manifest);
      }
    }
    return { ok: cancelled };
  }

  /** Run manifests, newest first. */
  listRuns(): RunManifest[] {
    return listRunManifests(this.paths);
  }

  getRun(runId: string): RunManifest | null {
    return readRunManifest(this.paths, runId);
  }

  /**
   * The actual run. Public so tests can drive it directly with a
   * mocked spawn; startRun is the queued entry point. Never throws
   * out of the queue worker — a failure is recorded in the manifest.
   */
  async executeRun(
    opts: StartRunOptions,
    manifest: RunManifest,
    isCancelled: () => boolean,
  ): Promise<RunManifest> {
    const paths = this.paths;
    const runId = manifest.runId;
    const liveEntry = this.live.get(runId);
    const killHandle: { kill: (() => void) | null } = { kill: null };
    if (liveEntry) liveEntry.kill = null;

    const setKill = (kill: (() => void) | null): void => {
      killHandle.kill = kill;
      if (liveEntry) liveEntry.kill = kill;
    };

    const recordStage = (
      stage: RunStageId,
      status: StageStatus,
      message: string,
      stageManifest?: Record<string, unknown>,
    ): void => {
      const existing = manifest.stages.find((s) => s.stage === stage);
      const record: RunStageRecord = { stage, status, message, manifest: stageManifest };
      if (existing) {
        existing.status = status;
        existing.message = message;
        existing.manifest = stageManifest;
      } else {
        manifest.stages.push(record);
      }
      writeRunManifest(paths, manifest);
      this.emit({ runId, stage, status, message, manifest: stageManifest });
    };

    const failRun = (message: string): RunManifest => {
      manifest.status = 'failed';
      manifest.finishedAt = new Date().toISOString();
      manifest.error = message;
      writeRunManifest(paths, manifest);
      this.live.delete(runId);
      return manifest;
    };

    const cancelRunNow = (stage: RunStageId, message: string): RunManifest => {
      recordStage(stage, 'cancelled', message);
      manifest.status = 'cancelled';
      manifest.finishedAt = new Date().toISOString();
      writeRunManifest(paths, manifest);
      this.live.delete(runId);
      return manifest;
    };

    // Spawn helper: streams the child's lines as progress on the
    // current stage, wires the kill handle so cancelRun can kill it
    // immediately, and reports a spawn failure as a failed stage.
    // captureLine, when given, also receives every stdout line
    // (the demo-proof branch uses it to parse per-check results).
    const runScript = async (
      stage: RunStageId,
      scriptRel: string,
      args: string[],
      captureLine?: (line: string) => void,
    ): Promise<{ ok: boolean; result: RunProcessResult }> => {
      const script = path.join(paths.builderDir, scriptRel);
      const handle: { kill: (() => void) | null } = { kill: null };
      // runProcess spawns synchronously inside its executor, so
      // handle.kill is live by the time this call returns — sync it
      // into the live map NOW, so cancelRun can kill the child while
      // it is still running (not only after it exits).
      const pending = runProcess({
        command: this.pythonCommand(),
        args: ['-u', script, ...args],
        cwd: paths.builderDir,
        env: { ...process.env },
        onLine: (line, stream) => {
          this.emit({ runId, stage, status: 'running', message: line });
          if (stream === 'stdout') captureLine?.(line);
        },
        isCancelled,
        killHandle: handle,
        spawnFn: this.spawnFn,
      });
      setKill(handle.kill);
      const result = await pending;
      setKill(null);
      if (result.spawnError) {
        recordStage(
          stage,
          'failed',
          `could not start python for ${scriptRel}: ${result.spawnError.message}`,
        );
        return { ok: false, result };
      }
      return { ok: true, result };
    };

    try {
      // ── Stage 1: data ──────────────────────────────────────────
      recordStage('data', 'running', 'Staging the training corpus…');
      if (isCancelled()) return cancelRunNow('data', 'Run cancelled.');
      if (!builderReady(paths)) {
        recordStage(
          'data',
          'failed',
          'LLMBuilder is not vendored yet — no LUCID-BUILDER tree found.',
        );
        return failRun('LLMBuilder is not vendored yet.');
      }
      if (!venvReady(paths)) {
        this.emit({
          runId,
          stage: 'data',
          status: 'running',
          message:
            'No Forge venv yet — using system python3. Run Forge setup first if training fails for missing packages.',
        });
      }
      let provenance: CorpusProvenance;
      try {
        provenance = stageCorpus(paths, opts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordStage('data', 'failed', message);
        return failRun(message);
      }
      manifest.corpusProvenance = provenance;
      const provenanceMessage =
        `Corpus staged: ${provenance.importedRecords} imported records, ` +
        `${provenance.knowledgeRecords} knowledge records, ` +
        `plus repo text.` +
        (provenance.knowledgeInvalidLines > 0
          ? ` (${provenance.knowledgeInvalidLines} knowledge lines did not parse and were skipped.)`
          : '');
      recordStage('data', 'completed', provenanceMessage);

      // ── Stage 2: train ─────────────────────────────────────────
      recordStage('train', 'running', 'Training the candidate…');
      if (isCancelled()) return cancelRunNow('train', 'Run cancelled.');
      let trainStatus: StageStatus;
      let trainManifest: Record<string, unknown> | null = null;
      let trainReason: string | undefined;
      let actualCandidate = opts.candidate;
      if (opts.demoProof) {
        // The demo script exits 0 and prints a final "ok": true even
        // when checks failed — neither is a pass signal. The real
        // result is the per-check ✓/✗ lines, parsed here into the
        // run manifest as structured results.
        const demoChecks: DemoCheck[] = [];
        const { result } = await runScript(
          'train',
          'scripts/ops/demo_proof_workflow.py',
          [],
          (line) => {
            const check = parseDemoCheckLine(line);
            if (check) demoChecks.push(check);
          },
        );
        manifest.demoChecks = summarizeDemoChecks(demoChecks);
        writeRunManifest(paths, manifest);
        if (isCancelled() || result.cancelled) {
          return cancelRunNow('train', 'Run cancelled.');
        }
        if (result.spawnError) return failRun(result.spawnError.message);
        // The demo names its own candidate (demo_<timestamp>).
        actualCandidate =
          this.findNewestDemoCandidate() ?? opts.candidate;
        manifest.candidate = actualCandidate;
        const read = this.readTrainManifest(actualCandidate);
        trainStatus = read.status;
        trainManifest = read.manifest;
        trainReason = read.reason;
      } else {
        const { result } = await runScript(
          'train',
          'scripts/training/train_arc_native_candidate.py',
          [
            '--candidate',
            opts.candidate,
            '--tier',
            opts.tier,
            '--steps',
            String(opts.steps),
            '--batch-size',
            String(opts.batchSize),
          ],
        );
        if (isCancelled() || result.cancelled) {
          return cancelRunNow('train', 'Run cancelled.');
        }
        if (result.spawnError) return failRun(result.spawnError.message);
        const read = this.readTrainManifest(opts.candidate);
        trainStatus = read.status;
        trainManifest = read.manifest;
        trainReason = read.reason;
      }
      // The demo-check tally, for the train-stage message and
      // manifest (demo-proof runs only).
      const demoTally =
        manifest.demoChecks && manifest.demoChecks.total > 0
          ? ` Demo proof checks: ${manifest.demoChecks.passed}/${manifest.demoChecks.total} passed.` +
            (manifest.demoChecks.failed > 0
              ? ` Failed: ${manifest.demoChecks.checks
                  .filter((c) => !c.ok)
                  .map((c) => c.label)
                  .join('; ')}.`
              : '')
          : '';
      // The train stage's manifest, with the structured demo checks
      // attached when this was a demo-proof run.
      const trainStageManifest: Record<string, unknown> | undefined =
        trainManifest || manifest.demoChecks
          ? {
              ...(trainManifest ?? {}),
              ...(manifest.demoChecks
                ? { demoChecks: manifest.demoChecks }
                : {}),
            }
          : undefined;
      if (trainStatus === 'completed') {
        mirrorCandidateOutputs(paths, actualCandidate);
        const exemplarRecords = readExemplarRecordCount(paths, actualCandidate);
        if (exemplarRecords !== null) {
          manifest.exemplarRecords = exemplarRecords;
        }
        let trainMessage =
          `Candidate ${actualCandidate} trained — GGUF + exemplar artifact written.` +
          demoTally;
        if (exemplarRecords === 0) {
          trainMessage +=
            ' Note: the exemplar has 0 records, so benchmark answers will be the generic fallback — the score will not reflect the trained weights.';
        }
        recordStage(
          'train',
          'completed',
          trainMessage,
          trainStageManifest,
        );
      } else if (trainStatus === 'scaffold') {
        recordStage(
          'train',
          'scaffold',
          (trainReason ?? 'Train stage wrote a scaffold manifest — it trained nothing.') +
            demoTally,
          trainStageManifest,
        );
        return failRun(
          'Train stage wrote a scaffold manifest — it trained nothing, so the run stops here.',
        );
      } else {
        recordStage(
          'train',
          'failed',
          (trainReason ??
            `Train script exited without writing a usable manifest for ${actualCandidate}.`) +
            demoTally,
          trainStageManifest,
        );
        return failRun('Train stage failed.');
      }

      // ── Stage 3: benchmark ─────────────────────────────────────
      recordStage('benchmark', 'running', 'Benchmarking the candidate…');
      if (isCancelled()) return cancelRunNow('benchmark', 'Run cancelled.');
      const exemplar = exemplarArtifactPath(paths, actualCandidate);
      if (!exemplar) {
        recordStage(
          'benchmark',
          'failed',
          `No exemplar artifact for ${actualCandidate} — nothing to benchmark.`,
        );
        return failRun('No exemplar artifact after training.');
      }
      const modelOutputs = path.join(paths.resultsDir, 'model_outputs.jsonl');
      const scoredOutputs = path.join(paths.resultsDir, 'scored_outputs.json');
      const benchRun = await runScript(
        'benchmark',
        'scripts/execution/run_model_benchmarks.py',
        [
          '--adapter',
          'exemplar',
          '--artifact',
          exemplar,
          '--output',
          modelOutputs,
        ],
      );
      if (isCancelled() || benchRun.result.cancelled) {
        return cancelRunNow('benchmark', 'Run cancelled.');
      }
      if (benchRun.result.spawnError) {
        return failRun(benchRun.result.spawnError.message);
      }
      const scoreRun = await runScript(
        'benchmark',
        'scripts/execution/score_benchmark_outputs.py',
        ['--input', modelOutputs, '--output', scoredOutputs],
      );
      if (isCancelled() || scoreRun.result.cancelled) {
        return cancelRunNow('benchmark', 'Run cancelled.');
      }
      if (scoreRun.result.spawnError) {
        return failRun(scoreRun.result.spawnError.message);
      }
      const benchRead = readBenchmarkStatus(scoredOutputs, modelOutputs);
      if (benchRead.status !== 'completed') {
        recordStage(
          'benchmark',
          'failed',
          benchRead.reason ?? 'Benchmark produced no scored outputs.',
          benchRead.manifest ?? undefined,
        );
        return failRun('Benchmark stage failed.');
      }
      recordStage(
        'benchmark',
        'completed',
        'Candidate benchmarked and scored.',
        benchRead.manifest ?? undefined,
      );

      // ── Stage 4: gate ──────────────────────────────────────────
      recordStage('gate', 'running', 'Running the Gate…');
      if (isCancelled()) return cancelRunNow('gate', 'Run cancelled.');
      const gateRun = await runScript(
        'gate',
        'scripts/execution/run_full_candidate_gate.py',
        [
          '--adapter',
          'exemplar',
          '--artifact',
          exemplar,
          '--model-name',
          actualCandidate,
          '--experiment-log',
          path.join(paths.resultsDir, 'experiments.jsonl'),
        ],
      );
      if (isCancelled() || gateRun.result.cancelled) {
        return cancelRunNow('gate', 'Run cancelled.');
      }
      if (gateRun.result.spawnError) {
        return failRun(gateRun.result.spawnError.message);
      }
      const gateReportPath = path.join(
        paths.builderDir,
        'reports',
        'full_candidate_gate_report.json',
      );
      const gateRead = readStageStatus(gateReportPath);
      copyFileIfExists(
        gateReportPath,
        path.join(paths.reportsDir, 'full_candidate_gate_report.json'),
      );
      if (gateRead.status !== 'completed') {
        recordStage(
          'gate',
          'failed',
          gateRead.reason ?? 'Gate wrote no usable report.',
          gateRead.manifest ?? undefined,
        );
        return failRun('Gate stage failed.');
      }
      recordStage(
        'gate',
        'completed',
        'Gate report written.',
        gateRead.manifest ?? undefined,
      );

      // ── Stage 5: promote ───────────────────────────────────────
      recordStage('promote', 'running', 'Promoting the candidate…');
      if (isCancelled()) return cancelRunNow('promote', 'Run cancelled.');
      const decisionPath = path.join(
        paths.reportsDir,
        'promotion_decision.json',
      );
      const scoreboardPath = path.join(paths.resultsDir, 'scoreboard.json');
      const promoteRun = await runScript(
        'promote',
        'scripts/execution/promote_candidate.py',
        [
          '--scored',
          scoredOutputs,
          '--scoreboard',
          scoreboardPath,
          '--model-name',
          actualCandidate,
          '--candidate',
          actualCandidate,
          '--report',
          decisionPath,
        ],
      );
      if (isCancelled() || promoteRun.result.cancelled) {
        return cancelRunNow('promote', 'Run cancelled.');
      }
      if (promoteRun.result.spawnError) {
        return failRun(promoteRun.result.spawnError.message);
      }
      let decision = readPromotionDecisionFile(decisionPath);
      if (!decision) {
        // The gate's internal promote writes to the vendored tree;
        // mirror it in before giving up.
        copyFileIfExists(
          path.join(paths.builderDir, 'reports', 'promotion_decision.json'),
          decisionPath,
        );
        decision = readPromotionDecisionFile(decisionPath);
      }
      if (!decision) {
        copyFileIfExists(
          path.join(paths.builderDir, 'results', 'scoreboard.json'),
          scoreboardPath,
        );
        recordStage(
          'promote',
          'failed',
          'Promote step wrote no promotion decision.',
        );
        return failRun('Promote stage failed.');
      }
      const decisionValue =
        typeof decision.decision === 'string' ? decision.decision : 'unknown';
      const candidateEntry =
        decision.candidate && typeof decision.candidate === 'object'
          ? (decision.candidate as Record<string, unknown>)
          : null;
      const scoreValue =
        candidateEntry &&
        typeof candidateEntry.overall_weighted_score === 'number'
          ? candidateEntry.overall_weighted_score
          : null;
      manifest.decision = decisionValue;
      manifest.score = scoreValue;
      recordStage(
        'promote',
        'completed',
        `Gate v2 decision: ${decisionValue}` +
          (scoreValue !== null ? ` (weighted score ${scoreValue})` : ''),
        decision,
      );

      // A demo-proof run is only a pass when every check passed.
      // The stages above keep their true statuses (the candidate
      // really did train, benchmark, gate, and promote) — but the
      // RUN is failed when the proof itself fell short, so the UI
      // shows "17/19" and not a green pass. The renderer reads the
      // run outcome from the manifest (listRuns), not from the last
      // progress event's stage status.
      if (manifest.demoChecks && manifest.demoChecks.failed > 0) {
        const dc = manifest.demoChecks;
        const failedLabels = dc.checks
          .filter((c) => !c.ok)
          .map((c) => c.label)
          .join('; ');
        manifest.status = 'failed';
        manifest.error =
          `Demo proof: ${dc.passed}/${dc.total} checks passed. ` +
          `Failed: ${failedLabels}.`;
        manifest.finishedAt = new Date().toISOString();
        writeRunManifest(paths, manifest);
        this.live.delete(runId);
        return manifest;
      }

      manifest.status = 'completed';
      manifest.finishedAt = new Date().toISOString();
      writeRunManifest(paths, manifest);
      this.live.delete(runId);
      return manifest;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof TaskCancelledError || isCancelled()) {
        const last = manifest.stages[manifest.stages.length - 1];
        return cancelRunNow(
          last ? last.stage : 'data',
          'Run cancelled.',
        );
      }
      return failRun(message);
    } finally {
      setKill(null);
    }
  }

  /** The lora_train manifest for a candidate — the train stage's receipt. */
  private readTrainManifest(candidate: string): {
    status: StageStatus;
    manifest: Record<string, unknown> | null;
    reason?: string;
  } {
    return readStageStatus(
      path.join(
        this.paths.builderDir,
        'exports',
        'candidates',
        candidate,
        'lora_train',
        'artifact_manifest.json',
      ),
    );
  }

  /** Newest demo_* candidate dir (the demo-proof run names its own). */
  private findNewestDemoCandidate(): string | null {
    try {
      const base = path.join(
        this.paths.builderDir,
        'exports',
        'candidates',
      );
      const dirs = fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('demo_'))
        .map((d) => ({
          name: d.name,
          mtime: fs.statSync(path.join(base, d.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);
      return dirs.length > 0 ? dirs[0].name : null;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// askBrain — verification only, NOT a chat surface
// ---------------------------------------------------------------------------

export interface AskBrainResult {
  ok: boolean;
  text: string;
  /** The exemplar adapter's top-k matches (score + capability). */
  matches: Array<{ score: number; capability: string }>;
  /** Same text under the renderer's field name. */
  answer: string;
  matchedCapabilities: string[];
  /** The adapter's confidence line, or null when it gave none. */
  confidence: string | null;
  /** True when the brain had no strong match and fell back honestly. */
  noMatch: boolean;
  error?: string;
}

function extractJsonPayload(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the substring search.
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ask the Homunculus's installed brain. Runs
 * run_direct_candidate.py --adapter exemplar --artifact <the
 * Homunculus's current exemplar_model.json>. The script takes a
 * --system-prompt but no capability flag, so the capability goes
 * into the prompt context instead — the vendored script is never
 * modified to add a flag. When no exemplar artifact exists, the
 * honest error 'no brain installed yet' is returned; an answer is
 * never invented.
 */
export async function runAskBrain(
  paths: LlmbuilderPaths,
  args: { homunculusId: string; prompt: string; capability?: string },
  deps: { spawnFn?: SpawnFn; timeoutMs?: number } = {},
): Promise<AskBrainResult> {
  // The brain IS the trained model: when a brain is installed, answer
  // from the INSTALLED candidate's exemplar — never from the latest
  // candidate, which may be a newer model that has not been installed.
  // No install record (legacy / test setups) falls back to the latest
  // candidate, the pre-existing behaviour.
  const installed = installedCandidateFor(paths, args.homunculusId);
  let found: { candidate: string; artifact: string } | null;
  if (installed) {
    const artifact = exemplarArtifactPath(paths, installed);
    if (!artifact) {
      return {
        ok: false,
        text: '',
        matches: [],
        answer: '',
        matchedCapabilities: [],
        confidence: null,
        noMatch: true,
        error: `installed brain ${installed} has no exemplar artifact — its records are missing`,
      };
    }
    found = { candidate: installed, artifact };
  } else {
    found = findHomunculusExemplar(paths, args.homunculusId);
  }
  if (!found) {
    return {
      ok: false,
      text: '',
      matches: [],
      answer: '',
      matchedCapabilities: [],
      confidence: null,
      noMatch: true,
      error: 'no brain installed yet',
    };
  }
  const prompt = args.capability
    ? `[Capability: ${args.capability}] ${args.prompt}`
    : args.prompt;
  const python = venvReady(paths) ? paths.venvPython : getPythonCommand();
  const result = await runProcess({
    command: python,
    args: [
      '-u',
      path.join(paths.builderDir, 'scripts', 'execution', 'run_direct_candidate.py'),
      '--adapter',
      'exemplar',
      '--artifact',
      found.artifact,
      '--prompt',
      prompt,
      '--system-prompt',
      'Plan, critique, repair, calibrate.',
    ],
    cwd: paths.builderDir,
    env: { ...process.env },
    timeoutMs: deps.timeoutMs ?? 120_000,
    spawnFn: deps.spawnFn,
  });
  if (result.spawnError) {
    return {
      ok: false,
      text: '',
      matches: [],
      answer: '',
      matchedCapabilities: [],
      confidence: null,
      noMatch: true,
      error: `could not start python: ${result.spawnError.message}`,
    };
  }
  if (result.timedOut) {
    return {
      ok: false,
      text: '',
      matches: [],
      answer: '',
      matchedCapabilities: [],
      confidence: null,
      noMatch: true,
      error: 'brain run timed out',
    };
  }
  const payload = extractJsonPayload(result.stdout);
  if (!payload) {
    return {
      ok: false,
      text: '',
      matches: [],
      answer: '',
      matchedCapabilities: [],
      confidence: null,
      noMatch: true,
      error: 'brain run produced no readable answer',
    };
  }
  const text = typeof payload.text === 'string' ? payload.text : '';
  const meta =
    payload.meta && typeof payload.meta === 'object'
      ? (payload.meta as Record<string, unknown>)
      : {};
  const rawMatches = Array.isArray(meta.matches) ? meta.matches : [];
  const matches: Array<{ score: number; capability: string }> = [];
  for (const m of rawMatches) {
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const entry = m as Record<string, unknown>;
      matches.push({
        score: typeof entry.score === 'number' ? entry.score : 0,
        capability:
          typeof entry.capability === 'string' ? entry.capability : 'generic',
      });
    }
  }
  const matchedCapabilities = Array.from(
    new Set(matches.map((m) => m.capability)),
  );
  const confidenceLine =
    text
      .split('\n')
      .find((line) => line.startsWith('Confidence:')) ?? null;
  const noMatch =
    matches.length === 0 || /No strong exemplar match/.test(text);
  if (payload.ok !== true) {
    return {
      ok: false,
      text,
      matches,
      answer: text,
      matchedCapabilities,
      confidence: confidenceLine,
      noMatch,
      error:
        typeof payload.error === 'string' && payload.error !== ''
          ? payload.error
          : 'brain run failed',
    };
  }
  return {
    ok: true,
    text,
    matches,
    answer: text,
    matchedCapabilities,
    confidence: confidenceLine,
    noMatch,
  };
}

/** Scratch-space helper (tests + temp dirs). Kept here to avoid an os import in callers. */
export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
