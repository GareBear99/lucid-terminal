/**
 * Forge (LLMBuilder) IPC — the main-process side of the Homunculi trainer.
 *
 * Channels (the renderer consumes exactly these names):
 *   llmbuilder:status, llmbuilder:setup, llmbuilder:startRun,
 *   llmbuilder:cancelRun, llmbuilder:listRuns,
 *   llmbuilder:getScoreboard, llmbuilder:getPromotionDecision,
 *   llmbuilder:installBrain, llmbuilder:rollback,
 *   llmbuilder:getRoster, llmbuilder:saveRoster,
 *   llmbuilder:importDataset, llmbuilder:askBrain.
 * Progress streams back on llmbuilder:progress events.
 *
 * No new HTTP server: training is subprocess jobs through the job
 * runner, inference is the existing llamafile path. Runs only start
 * on the user's click — nothing here auto-starts a run, and the UI
 * warns when status says lowMemory.
 *
 * The Homunculus roster JSON is an OPAQUE blob here: the main
 * process stores it, the renderer owns its shape (src/lib/homunculi.ts).
 * No Homunculus type is defined in this file.
 */

import type { BrowserWindow, IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { resolvePythonPath } from '../core/pythonPath';
import {
  LlmbuilderPaths,
  LlmbuilderPathsOverrides,
  builderReady,
  ensureBuilderWorkCopy,
  ensureLlmbuilderDirs,
  getFreeMemoryMb,
  LOW_MEMORY_MB,
  resolveLlmbuilderPaths,
  torchReady,
  venvReady,
} from '../core/llmbuilder/paths';
import {
  AskBrainResult,
  ImportDatasetResult,
  LlmbuilderJobRunner,
  LlmbuilderProgressEvent,
  RunManifest,
  candidateGgufPath,
  importDatasetFile,
  installedCandidatePath,
  listRunManifests,
  previousInstalledCandidatePath,
  readPromotionDecisionFile,
  readRoster,
  readScoreboardFile,
  runAskBrain,
  runProcess,
  sanitizeDatasetFilename,
  swapInstalledCandidateSidecars,
  validateDatasetJsonl,
  writeFileAtomic,
  writeInstalledCandidate,
  writeRosterAtomic,
} from '../core/llmbuilder/jobRunner';

export interface LlmbuilderStatus {
  ready: boolean;
  venvReady: boolean;
  torchReady: boolean;
  /** Alias of torchReady, for the renderer's field name. */
  torchInstalled: boolean;
  pythonPath: string | null;
  /** True when a python3 was found at all. */
  pythonAvailable: boolean;
  builderDir: string;
  dataDir: string;
  freeMemMb: number;
  /** True when free memory is tight (under ~1 GB free). */
  lowMemory: boolean;
  /** Human-readable reason when not ready, or null. */
  message: string | null;
}

export function getLlmbuilderStatus(paths: LlmbuilderPaths): LlmbuilderStatus {
  const ready = builderReady(paths);
  const venv = venvReady(paths);
  const torch = torchReady(paths);
  const pythonPath = resolvePythonPath();
  const freeMemMb = getFreeMemoryMb();
  let message: string | null = null;
  if (!ready) {
    message =
      'LLMBuilder is not vendored yet — the LUCID-BUILDER tree is missing.';
  } else if (!pythonPath) {
    message = 'No python3 found on this machine.';
  } else if (!venv) {
    message = 'Forge venv not set up yet — run setup in the Forge.';
  }
  return {
    ready,
    venvReady: venv,
    torchReady: torch,
    torchInstalled: torch,
    pythonPath,
    pythonAvailable: pythonPath !== null,
    builderDir: paths.builderDir,
    dataDir: paths.dataDir,
    freeMemMb,
    lowMemory: freeMemMb < LOW_MEMORY_MB,
    message,
  };
}

export interface SetupOptions {
  /** Install torch too (a few hundred MB, once) — only when training is used. */
  withTorch?: boolean;
}

export interface SetupResult {
  ok: boolean;
  message: string;
  error?: string;
  /** Installed torch version (e.g. '2.15.0+cpu'), or null when absent. */
  torchVersion?: string | null;
}

/** The installed torch version, or null when torch is absent/broken. */
async function detectTorchVersion(venvPython: string): Promise<string | null> {
  const checked = await runProcess({
    command: venvPython,
    args: ['-c', 'import torch; print(torch.__version__)'],
    cwd: process.cwd(),
    env: { ...process.env },
  });
  if (checked.spawnError || checked.code !== 0) return null;
  const version = checked.stdout.trim().split('\n').pop()?.trim() ?? '';
  return version !== '' ? version : null;
}

/**
 * First-run setup: venv, then pip install -r requirements.txt
 * (PyYAML, jsonschema, requests, numpy — small) from plain PyPI,
 * then torch ONLY when withTorch is set, separately from the CPU
 * index. The order matters: --index-url REPLACES PyPI, so the small
 * deps are unfindable on the torch index — they must install from
 * PyPI first, and torch afterwards with a long timeout and retries
 * (the CPU index has read timeouts). Progress goes out on
 * llmbuilder:progress with runId 'setup'. When no python3 exists,
 * the plain error 'no python3' is returned — the Forge never
 * pretends to work.
 */
export async function runLlmbuilderSetup(
  paths: LlmbuilderPaths,
  opts: SetupOptions,
  emit: (event: LlmbuilderProgressEvent) => void,
): Promise<SetupResult> {
  const python = resolvePythonPath();
  if (!python) {
    return {
      ok: false,
      message: 'No python3 found on this machine.',
      error: 'no python3',
    };
  }
  // Packaged app: refresh the writable working copy before setup
  // touches the tree (no-op in dev, where the tree is the repo dir).
  ensureBuilderWorkCopy(paths);
  ensureLlmbuilderDirs(paths);
  const venvPython = paths.venvPython;
  const step = (message: string): void =>
    emit({ runId: 'setup', stage: 'data', status: 'running', message });
  const done = (ok: boolean, message: string): void =>
    emit({
      runId: 'setup',
      stage: 'data',
      status: ok ? 'completed' : 'failed',
      message,
    });

  if (!venvReady(paths)) {
    step('Creating the Forge virtual environment…');
    const created = await runProcess({
      command: python,
      args: ['-m', 'venv', paths.venvDir],
      cwd: paths.builderDir,
      env: { ...process.env },
    });
    if (created.spawnError || created.code !== 0) {
      const message = `Could not create the virtual environment: ${
        created.spawnError?.message ?? created.stderr.trim().split('\n').pop()
      }`;
      done(false, message);
      return { ok: false, message, error: message };
    }
  }

  const requirements = path.join(paths.builderDir, 'requirements.txt');
  if (fs.existsSync(requirements)) {
    step('Installing Forge requirements (PyYAML, jsonschema, requests, numpy)…');
    const installed = await runProcess({
      command: venvPython,
      args: ['-m', 'pip', 'install', '-r', requirements],
      cwd: paths.builderDir,
      env: { ...process.env },
    });
    if (installed.spawnError || installed.code !== 0) {
      const message = `Could not install requirements: ${
        installed.spawnError?.message ??
        installed.stderr.trim().split('\n').pop()
      }`;
      done(false, message);
      return { ok: false, message, error: message };
    }
  } else {
    step('No requirements.txt in the vendored tree — skipping that step.');
  }

  if (opts.withTorch) {
    // Torch installs SEPARATELY, from the CPU index, with a long
    // timeout and retries — never bundled with the requirements
    // install, and never with the CPU index applied to the small
    // deps (the index replaces PyPI, so they would be unfindable).
    step('Installing torch from the CPU index (a few hundred MB, once)…');
    const torched = await runProcess({
      command: venvPython,
      args: [
        '-m',
        'pip',
        'install',
        'torch',
        '--index-url',
        'https://download.pytorch.org/whl/cpu',
        '--timeout',
        '120',
        '--retries',
        '3',
      ],
      cwd: paths.builderDir,
      env: { ...process.env },
    });
    if (torched.spawnError || torched.code !== 0) {
      const message = `Could not install torch: ${
        torched.spawnError?.message ??
        torched.stderr.trim().split('\n').pop()
      }`;
      done(false, message);
      return { ok: false, message, error: message };
    }
    // Verify torch actually imports and report the version.
    const torchVersion = await detectTorchVersion(venvPython);
    if (torchVersion === null) {
      const message =
        'Torch installed but does not import — training would fail.';
      done(false, message);
      return { ok: false, message, error: message, torchVersion: null };
    }
    const message =
      `Forge setup complete — venv, requirements, and torch ${torchVersion} are installed.`;
    done(true, message);
    return { ok: true, message, torchVersion };
  }

  const torchVersion = await detectTorchVersion(venvPython);
  const message =
    'Forge setup complete — venv and requirements installed. Torch installs when training is set up.' +
    (torchVersion ? ` (torch ${torchVersion} already present.)` : '');
  done(true, message);
  return { ok: true, message, torchVersion };
}

// ---------------------------------------------------------------------------
// Install as brain / rollback
// ---------------------------------------------------------------------------

export interface InstallBrainResult {
  ok: boolean;
  /** The GGUF path now serving as the Homunculus's brain. */
  modelPath?: string;
  /** The previous incumbent's path, kept on disk for rollback. */
  previousModelPath?: string | null;
  error?: string;
}

/** Copy a file atomically (temp + rename in the target dir). */
function copyFileAtomic(source: string, target: string): void {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.copyFileSync(source, tmp);
  fs.renameSync(tmp, target);
}

/**
 * Install a promoted GGUF as the Homunculus's brain: copy it to
 * ~/.lucid/models/<homunculusId>.gguf, the dir llamafileManager
 * already scans. The previous incumbent is kept on disk as
 * <homunculusId>.gguf.prev, so rollback is re-pointing.
 *
 * The brain IS the trained model: the installed candidate is recorded
 * in a sidecar next to the GGUF, so ask-the-brain resolves the
 * exemplar from THIS candidate — never from the latest candidate.
 * The displaced incumbent's record moves with it, so rollback can
 * re-point at it by name.
 */
export function installBrainFor(
  paths: LlmbuilderPaths,
  homunculusId: string,
  candidate: string,
): InstallBrainResult {
  const gguf = candidateGgufPath(paths, candidate);
  if (!gguf) {
    return {
      ok: false,
      error: `no promoted GGUF found for candidate ${candidate}`,
    };
  }
  ensureLlmbuilderDirs(paths);
  const target = path.join(paths.modelsDir, `${homunculusId}.gguf`);
  const previous = path.join(paths.modelsDir, `${homunculusId}.gguf.prev`);
  let previousModelPath: string | null = null;
  try {
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, previous);
      previousModelPath = previous;
      const targetSidecar = installedCandidatePath(paths, homunculusId);
      const previousSidecar = previousInstalledCandidatePath(paths, homunculusId);
      if (fs.existsSync(targetSidecar)) {
        copyFileAtomic(targetSidecar, previousSidecar);
      }
    }
    copyFileAtomic(gguf, target);
    writeInstalledCandidate(paths, homunculusId, candidate, target);
    return { ok: true, modelPath: target, previousModelPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Roll back to the previous incumbent GGUF. The current brain and
 * the previous incumbent swap, so a second rollback returns to the
 * newer brain. When there is no previous incumbent, the honest
 * error 'no previous incumbent' is returned — never faked.
 *
 * The installed-candidate records swap with the GGUFs, so the brain's
 * records always describe the model that is actually installed — the
 * rolled-back brain answers from the previous incumbent's records,
 * not the newer model's.
 */
export function rollbackFor(
  paths: LlmbuilderPaths,
  homunculusId: string,
): InstallBrainResult {
  const target = path.join(paths.modelsDir, `${homunculusId}.gguf`);
  const previous = path.join(paths.modelsDir, `${homunculusId}.gguf.prev`);
  if (!fs.existsSync(previous)) {
    return { ok: false, error: 'no previous incumbent' };
  }
  const targetSidecar = installedCandidatePath(paths, homunculusId);
  const previousSidecar = previousInstalledCandidatePath(paths, homunculusId);
  try {
    if (fs.existsSync(target)) {
      // Swap: the displaced current brain becomes the new previous.
      const tmp = `${target}.swap-${process.pid}-${Date.now()}`;
      fs.renameSync(target, tmp);
      fs.renameSync(previous, target);
      fs.renameSync(tmp, previous);
      swapInstalledCandidateSidecars(targetSidecar, previousSidecar);
    } else {
      fs.copyFileSync(previous, target);
      // No swap — the previous incumbent stays put, so its record
      // copies to the target; a stale target record is dropped
      // rather than kept naming the wrong brain.
      if (fs.existsSync(previousSidecar)) {
        copyFileAtomic(previousSidecar, targetSidecar);
      } else if (fs.existsSync(targetSidecar)) {
        fs.unlinkSync(targetSidecar);
      }
    }
    return { ok: true, modelPath: target, previousModelPath: previous };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Scoreboard / promotion decision reads
// ---------------------------------------------------------------------------

export interface ScoreboardRowOut {
  candidate: string;
  score: number | null;
  decision: string;
  artifacts: string[];
}

function scoreboardEntries(
  paths: LlmbuilderPaths,
): Array<Record<string, unknown>> {
  const fromData = readScoreboardFile(path.join(paths.resultsDir, 'scoreboard.json'));
  const parsed =
    fromData ??
    readScoreboardFile(path.join(paths.builderDir, 'results', 'scoreboard.json'));
  if (!parsed) return [];
  const models = (parsed as Record<string, unknown>).models;
  if (!Array.isArray(models)) return [];
  return models.filter(
    (m): m is Record<string, unknown> =>
      !!m && typeof m === 'object' && !Array.isArray(m),
  );
}

function entryToRow(entry: Record<string, unknown>): ScoreboardRowOut | null {
  const candidateRaw =
    entry.model_name ?? entry.candidate ?? entry.name ?? entry.run_id;
  if (typeof candidateRaw !== 'string' || candidateRaw === '') return null;
  const scoreRaw =
    entry.overall_weighted_score ?? entry.score ?? entry.weighted_score;
  const decisionRaw = entry.decision;
  const artifacts: string[] = [];
  const pushStrings = (value: unknown): void => {
    if (typeof value === 'string' && value !== '') artifacts.push(value);
    else if (Array.isArray(value)) value.forEach(pushStrings);
    else if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(pushStrings);
    }
  };
  pushStrings(entry.paths);
  pushStrings(entry.artifacts);
  pushStrings(entry.artifact_paths);
  return {
    candidate: candidateRaw,
    score: typeof scoreRaw === 'number' ? scoreRaw : null,
    decision: typeof decisionRaw === 'string' ? decisionRaw : 'unknown',
    artifacts,
  };
}

/**
 * The scoreboard as rows (the renderer's shape), with the raw
 * scoreboard JSON attached as .raw for callers that want the file
 * itself. Null when no scoreboard exists yet.
 */
export function getScoreboardOut(
  paths: LlmbuilderPaths,
): (ScoreboardRowOut[] & { raw?: Record<string, unknown> }) | null {
  const fromData = readScoreboardFile(path.join(paths.resultsDir, 'scoreboard.json'));
  const raw =
    fromData ??
    readScoreboardFile(path.join(paths.builderDir, 'results', 'scoreboard.json'));
  if (!raw) return null;
  const rows: ScoreboardRowOut[] = [];
  for (const entry of scoreboardEntries(paths)) {
    const row = entryToRow(entry);
    if (row) rows.push(row);
  }
  return Object.assign(rows, { raw });
}

export interface PromotionDecisionOut {
  candidate: string;
  decision: string;
  score: number | null;
  scoreboardRow: ScoreboardRowOut | null;
  receiptRef: string | null;
  raw: Record<string, unknown>;
}

export function getPromotionDecisionOut(
  paths: LlmbuilderPaths,
  candidate: string,
): PromotionDecisionOut | null {
  let report =
    readPromotionDecisionFile(
      path.join(paths.reportsDir, 'promotion_decision.json'),
    ) ??
    readPromotionDecisionFile(
      path.join(paths.builderDir, 'reports', 'promotion_decision.json'),
    );
  if (!report) return null;
  // The report's candidate is the scoreboard entry object; the
  // requested candidate must match it when a name is recorded.
  const entry =
    report.candidate && typeof report.candidate === 'object'
      ? (report.candidate as Record<string, unknown>)
      : null;
  const entryName =
    entry &&
    (typeof entry.model_name === 'string'
      ? entry.model_name
      : typeof entry.candidate === 'string'
        ? entry.candidate
        : typeof entry.name === 'string'
          ? entry.name
          : null);
  if (entryName !== null && entryName !== candidate) return null;
  const decision =
    typeof report.decision === 'string' ? report.decision : 'unknown';
  const score =
    entry && typeof entry.overall_weighted_score === 'number'
      ? entry.overall_weighted_score
      : null;
  const scoreboardRow =
    scoreboardEntries(paths)
      .map(entryToRow)
      .find((row) => row !== null && row.candidate === candidate) ?? null;
  const receiptRef =
    typeof report.arc_rar_bundle === 'string' ? report.arc_rar_bundle : null;
  return {
    candidate,
    decision,
    score,
    scoreboardRow,
    receiptRef,
    raw: report,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

/** Accept a string id or an object carrying it. */
function idArg(value: unknown, key: string): string | null {
  if (typeof value === 'string') return value;
  const rec = asRecord(value);
  if (rec && typeof rec[key] === 'string') return rec[key] as string;
  return null;
}

export function setupLlmbuilderHandlers(
  ipcMain: IpcMain,
  getWindow?: () => BrowserWindow | null,
  pathsOverride?: LlmbuilderPathsOverrides,
): void {
  const paths = resolveLlmbuilderPaths(pathsOverride);
  // Packaged app: refresh the writable working copy at startup, so
  // status/training never run against a read-only resources tree. A
  // failed copy must not take main down — builderReady stays false
  // and status reports the tree as missing, honestly.
  try {
    ensureBuilderWorkCopy(paths);
  } catch {
    // Leave the tree missing; getLlmbuilderStatus says so.
  }
  const sendProgress = (event: LlmbuilderProgressEvent): void => {
    const win = getWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('llmbuilder:progress', event);
    }
  };
  const runner = new LlmbuilderJobRunner(paths, { emit: sendProgress });

  ipcMain.handle('llmbuilder:status', async (): Promise<LlmbuilderStatus> => {
    return getLlmbuilderStatus(paths);
  });

  ipcMain.handle(
    'llmbuilder:setup',
    async (_, opts?: SetupOptions): Promise<SetupResult> => {
      return runLlmbuilderSetup(paths, opts ?? {}, sendProgress);
    },
  );

  ipcMain.handle('llmbuilder:startRun', async (_, params: unknown) => {
    const rec = asRecord(params);
    if (!rec) throw new Error('startRun needs a params object');
    return runner.startRun({
      homunculusId: String(rec.homunculusId ?? ''),
      candidate: String(rec.candidate ?? ''),
      tier: (rec.tier as 'tiny' | 'small') ?? 'tiny',
      steps: Number(rec.steps ?? 300),
      batchSize: Number(rec.batchSize ?? 4),
      corpus: String(rec.corpus ?? 'repo'),
      datasetFile:
        typeof rec.datasetFile === 'string' ? rec.datasetFile : undefined,
      knowledgeRecordsJsonl:
        typeof rec.knowledgeRecordsJsonl === 'string'
          ? rec.knowledgeRecordsJsonl
          : '',
      demoProof: rec.demoProof === true,
    });
  });

  ipcMain.handle('llmbuilder:cancelRun', async (_, arg: unknown) => {
    const runId = idArg(arg, 'runId');
    if (!runId) return { ok: false };
    return runner.cancelRun(runId);
  });

  ipcMain.handle('llmbuilder:listRuns', async () => {
    const runs: RunManifest[] = listRunManifests(paths);
    // The bare array: the renderer's shape. (A self-referential
    // { runs } bridge was tried and dropped — a circular array
    // breaks JSON.stringify and deep-equal for every consumer.)
    return runs.map((r) => ({
      runId: r.runId,
      homunculusId: r.homunculusId,
      candidate: r.candidate,
      tier: r.tier,
      status: r.status,
      startedAt: r.startedAt,
      stages: r.stages.map((s) => ({ stage: s.stage, status: s.status })),
      decision: r.decision,
      score: r.score,
      demoChecks: r.demoChecks,
      exemplarRecords: r.exemplarRecords,
    }));
  });

  ipcMain.handle('llmbuilder:getScoreboard', async () => {
    return getScoreboardOut(paths);
  });

  ipcMain.handle('llmbuilder:getPromotionDecision', async (_, arg: unknown) => {
    const candidate = idArg(arg, 'candidate');
    if (!candidate) return null;
    return getPromotionDecisionOut(paths, candidate);
  });

  ipcMain.handle('llmbuilder:installBrain', async (_, a: unknown, b: unknown) => {
    const recA = asRecord(a);
    const homunculusId =
      typeof a === 'string'
        ? a
        : recA && typeof recA.homunculusId === 'string'
          ? recA.homunculusId
          : null;
    const candidate =
      typeof b === 'string'
        ? b
        : recA && typeof recA.candidate === 'string'
          ? recA.candidate
          : null;
    if (!homunculusId || !candidate) {
      return { ok: false, error: 'installBrain needs a homunculusId and a candidate' };
    }
    return installBrainFor(paths, homunculusId, candidate);
  });

  ipcMain.handle('llmbuilder:rollback', async (_, arg: unknown) => {
    const homunculusId = idArg(arg, 'homunculusId');
    if (!homunculusId) {
      return { ok: false, error: 'rollback needs a homunculusId' };
    }
    return rollbackFor(paths, homunculusId);
  });

  ipcMain.handle('llmbuilder:getRoster', async () => {
    const roster = readRoster(paths);
    // The bare array: the renderer's shape. (A self-referential
    // { homunculi } bridge was tried and dropped — a circular array
    // breaks JSON.stringify and deep-equal for every consumer.)
    return Array.isArray(roster) ? roster : [];
  });

  ipcMain.handle('llmbuilder:saveRoster', async (_, arg: unknown) => {
    const rec = asRecord(arg);
    const homunculi = Array.isArray(arg)
      ? arg
      : rec && Array.isArray(rec.homunculi)
        ? rec.homunculi
        : null;
    if (homunculi === null) {
      return { ok: false, error: 'saveRoster needs a homunculi array' };
    }
    writeRosterAtomic(paths, homunculi);
    return { ok: true };
  });

  ipcMain.handle(
    'llmbuilder:importDataset',
    async (_, a: unknown, b?: unknown): Promise<ImportDatasetResult> => {
      const recA = asRecord(a);
      if (recA && typeof recA.content === 'string') {
        // Object form: { homunculusId, filename, content }.
        return importDatasetFile(paths, {
          homunculusId: String(recA.homunculusId ?? ''),
          filename: String(recA.filename ?? ''),
          content: recA.content,
        });
      }
      if (typeof a === 'string' && typeof b === 'string') {
        // Positional form: importDataset(name, jsonl). The dataset
        // id is the name; the file lands in datasets/<name>.jsonl.
        const filename = sanitizeDatasetFilename(a);
        const validated = validateDatasetJsonl(b);
        if (!filename) {
          return {
            ok: false,
            records: 0,
            recordCount: 0,
            datasetId: a,
            domains: [],
            errors: ['invalid filename'],
          };
        }
        if (validated.records.length === 0) {
          return {
            ok: false,
            records: 0,
            recordCount: 0,
            datasetId: a,
            domains: validated.domains,
            errors:
              validated.errors.length > 0
                ? validated.errors
                : ['empty file: no records'],
          };
        }
        ensureLlmbuilderDirs(paths);
        const target = path.join(paths.datasetsDir, filename);
        const body =
          validated.records.map((r) => JSON.stringify(r)).join('\n') + '\n';
        writeFileAtomic(target, body);
        return {
          ok: true,
          records: validated.records.length,
          recordCount: validated.records.length,
          datasetId: a,
          domains: validated.domains,
          errors: validated.errors,
        };
      }
      return {
        ok: false,
        records: 0,
        recordCount: 0,
        datasetId: '',
        domains: [],
        errors: ['importDataset needs { homunculusId, filename, content }'],
      };
    },
  );

  ipcMain.handle('llmbuilder:askBrain', async (_, a: unknown, b?: unknown, c?: unknown): Promise<AskBrainResult> => {
    const recA = asRecord(a);
    const homunculusId =
      typeof a === 'string'
        ? a
        : recA && typeof recA.homunculusId === 'string'
          ? recA.homunculusId
          : null;
    const prompt =
      typeof b === 'string'
        ? b
        : recA && typeof recA.prompt === 'string'
          ? recA.prompt
          : null;
    const capability =
      typeof c === 'string'
        ? c
        : recA && typeof recA.capability === 'string'
          ? recA.capability
          : undefined;
    if (!homunculusId || !prompt) {
      return {
        ok: false,
        text: '',
        matches: [],
        answer: '',
        matchedCapabilities: [],
        confidence: null,
        noMatch: true,
        error: 'askBrain needs a homunculusId and a prompt',
      };
    }
    return runAskBrain(paths, { homunculusId, prompt, capability });
  });
}
