/**
 * Forge job-runner tests — the Electron side of the Homunculi trainer.
 *
 * The Python children are MOCKED: the fake spawn below writes the
 * same files the real scripts write (stage manifests, GGUF,
 * exemplar artifact, scored outputs, gate report, promotion
 * decision, scoreboard) and emits the same stdout lines, so the
 * runner's stage sequencing, manifest-based status, cancellation,
 * serialization, and demo-proof check parsing are tested for real
 * without torch or a Python run. No test here needs a real venv.
 *
 * Covered:
 * - full staged run (data → train → benchmark → gate → promote)
 *   with corpus provenance (imported + knowledge records)
 * - a scaffold train manifest is 'scaffold', never green, and the
 *   run stops before benchmarking
 * - cancel kills the child; one job at a time (serialization)
 * - dataset validation (good lines, bad lines listed + skipped,
 *   empty file rejected) and the import write
 * - roster round-trip through the JSON file (atomic write)
 * - askBrain with no artifact: the honest error, never an
 *   invented answer
 * - demo-proof per-check results: the script exits 0 and prints
 *   "ok": true even when checks failed, so the run reads the
 *   ✓/✗ lines — 17/19 is a failed run, never a pass
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

const mockState = vi.hoisted(() => ({
  builderDir: '',
  dataDir: '',
  calls: [] as Array<{ command: string; args: string[]; cwd?: string }>,
  procs: [] as Array<{ killed: boolean }>,
  hangTrain: false,
  scaffoldTrain: false,
  exemplarRecords: 5,
  demoExemplarRecords: 0,
  demoCandidate: 'demo_20261105T150120Z',
  demoChecks: [] as string[],
  promoteDecision: 'promote',
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const mockFs = require('fs');
  const mockPath = require('path');
  const { PassThrough } = require('stream');
  const { EventEmitter } = require('events');

  function writeJson(file: string, obj: unknown): void {
    mockFs.mkdirSync(mockPath.dirname(file), { recursive: true });
    mockFs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
  }

  function mockSpawn(command: string, args: string[], options: any) {
    mockState.calls.push({
      command,
      args: [...args],
      cwd: options?.cwd,
    });
    const proc: any = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = { write: () => true };
    proc.exitCode = null;
    proc.killed = false;
    proc.pid = 12345;
    mockState.procs.push(proc);
    proc.kill = (_signal?: string) => {
      proc.killed = true;
      setTimeout(() => {
        proc.exitCode = null;
        proc.emit('exit', null, 'SIGTERM');
      }, 0);
      return true;
    };
    const script =
      args.find(
        (a: string) => typeof a === 'string' && a.endsWith('.py'),
      ) ?? '';
    const rel = script.replace(mockState.builderDir + mockPath.sep, '');
    const getArg = (flag: string): string | undefined => {
      const i = args.indexOf(flag);
      return i >= 0 ? (args[i + 1] as string) : undefined;
    };
    const builder = mockState.builderDir;
    const data = mockState.dataDir;
    setTimeout(() => {
      try {
        if (rel.includes('train_arc_native_candidate')) {
          const candidate = getArg('--candidate') ?? 'unknown';
          const base = mockPath.join(
            builder,
            'exports',
            'candidates',
            candidate,
          );
          if (mockState.scaffoldTrain) {
            writeJson(
              mockPath.join(base, 'lora_train', 'artifact_manifest.json'),
              {
                status: 'scaffold_ready',
                execution_mode: 'scaffold',
                notes: 'Training runner still requires real backend/trainer wiring',
              },
            );
          } else {
            writeJson(
              mockPath.join(base, 'lora_train', 'artifact_manifest.json'),
              {
                status: 'completed',
                execution_mode: 'arc_native',
                tier: getArg('--tier') ?? 'tiny',
                paths: {
                  gguf: `exports/candidates/${candidate}/lora_train/checkpoint/arc_native_${candidate}.gguf`,
                  exemplar: `exports/candidates/${candidate}/exemplar_train/exemplar_model.json`,
                },
              },
            );
            mockFs.mkdirSync(
              mockPath.join(base, 'lora_train', 'checkpoint'),
              { recursive: true },
            );
            mockFs.writeFileSync(
              mockPath.join(
                base,
                'lora_train',
                'checkpoint',
                `arc_native_${candidate}.gguf`,
              ),
              'fake-gguf-bytes',
              'utf-8',
            );
            writeJson(
              mockPath.join(base, 'exemplar_train', 'artifact_manifest.json'),
              {
                status: 'completed',
                execution_mode: 'arc_native_sidecar',
                metrics: { record_count: mockState.exemplarRecords },
              },
            );
            writeJson(
              mockPath.join(base, 'exemplar_train', 'exemplar_model.json'),
              { model_type: 'local_exemplar', candidate_id: candidate, records: [] },
            );
            writeJson(
              mockPath.join(
                builder,
                'reports',
                `arc_native_train_${candidate}.json`,
              ),
              { ok: true, candidate },
            );
          }
          proc.stdout.write('[arc-native] corpus 1,234 bytes\n');
        } else if (rel.includes('demo_proof_workflow')) {
          for (const line of mockState.demoChecks) {
            proc.stdout.write(line + '\n');
          }
          const candidate = mockState.demoCandidate;
          const base = mockPath.join(
            builder,
            'exports',
            'candidates',
            candidate,
          );
          writeJson(
            mockPath.join(base, 'lora_train', 'artifact_manifest.json'),
            {
              status: 'completed',
              execution_mode: 'arc_native',
              tier: 'tiny',
              paths: {
                gguf: `exports/candidates/${candidate}/lora_train/checkpoint/arc_native_${candidate}.gguf`,
              },
            },
          );
          mockFs.mkdirSync(
            mockPath.join(base, 'lora_train', 'checkpoint'),
            { recursive: true },
          );
          mockFs.writeFileSync(
            mockPath.join(
              base,
              'lora_train',
              'checkpoint',
              `arc_native_${candidate}.gguf`,
            ),
            'fake-gguf-bytes',
            'utf-8',
          );
          writeJson(
            mockPath.join(base, 'exemplar_train', 'artifact_manifest.json'),
            {
              status: 'completed',
              execution_mode: 'arc_native_sidecar',
              metrics: { record_count: mockState.demoExemplarRecords },
            },
          );
          writeJson(
            mockPath.join(base, 'exemplar_train', 'exemplar_model.json'),
            { model_type: 'local_exemplar', candidate_id: candidate, records: [] },
          );
          // The real script prints a final "ok": true even when
          // checks failed — the runner must NOT treat it as a pass.
          proc.stdout.write(JSON.stringify({ ok: true }) + '\n');
        } else if (rel.includes('run_model_benchmarks')) {
          const out = getArg('--output') ?? '';
          mockFs.mkdirSync(mockPath.dirname(out), { recursive: true });
          mockFs.writeFileSync(
            out,
            '{"prompt": "a", "response": "b"}\n{"prompt": "c", "response": "d"}\n',
            'utf-8',
          );
        } else if (rel.includes('score_benchmark_outputs')) {
          const out = getArg('--output') ?? '';
          writeJson(out, {
            results: [
              { prompt: 'a', score: 0.7 },
              { prompt: 'c', score: 0.72 },
            ],
            summary: { overall: 0.7136 },
          });
        } else if (rel.includes('run_full_candidate_gate')) {
          writeJson(
            mockPath.join(builder, 'reports', 'full_candidate_gate_report.json'),
            { ok: true, run_id: 'gate-1', model_name: getArg('--model-name') },
          );
        } else if (rel.includes('promote_candidate')) {
          const report = getArg('--report') ?? '';
          const scoreboard = getArg('--scoreboard') ?? '';
          const modelName = getArg('--model-name') ?? 'candidate';
          writeJson(report, {
            ok: true,
            decision: mockState.promoteDecision,
            candidate: {
              model_name: modelName,
              overall_weighted_score: 0.7136,
            },
          });
          writeJson(scoreboard, {
            models: [
              {
                model_name: modelName,
                overall_weighted_score: 0.7136,
                decision: mockState.promoteDecision,
              },
            ],
          });
        } else if (rel.includes('run_direct_candidate')) {
          proc.stdout.write(
            JSON.stringify({
              ok: true,
              text: 'An answer from the records.\nConfidence: bounded by retrieved exemplars.',
              meta: {
                matches: [{ score: 0.9, capability: 'repair', source_file: 'x.jsonl' }],
              },
            }) + '\n',
          );
        }
      } catch (err) {
        proc.stderr.write(String(err));
      }
      const hangs =
        mockState.hangTrain && rel.includes('train_arc_native_candidate');
      if (!hangs) {
        proc.exitCode = 0;
        proc.emit('exit', 0);
      }
    }, 5);
    return proc;
  }

  return { ...actual, spawn: mockSpawn };
});

import {
  LlmbuilderJobRunner,
  parseDemoCheckLine,
  readStageStatus,
  runAskBrain,
  summarizeDemoChecks,
  validateDatasetJsonl,
  importDatasetFile,
  readRoster,
  writeInstalledCandidate,
  writeRosterAtomic,
  type LlmbuilderPaths,
  type LlmbuilderProgressEvent,
  type SpawnFn,
} from '../electron/core/llmbuilder/jobRunner';
import { resolveLlmbuilderPaths } from '../electron/core/llmbuilder/paths';

const TRAIN_SCRIPT = 'scripts/training/train_arc_native_candidate.py';
const BENCH_SCRIPT = 'scripts/execution/run_model_benchmarks.py';
const SCORE_SCRIPT = 'scripts/execution/score_benchmark_outputs.py';
const GATE_SCRIPT = 'scripts/execution/run_full_candidate_gate.py';
const PROMOTE_SCRIPT = 'scripts/execution/promote_candidate.py';
const DEMO_SCRIPT = 'scripts/ops/demo_proof_workflow.py';
const DIRECT_SCRIPT = 'scripts/execution/run_direct_candidate.py';

function makeFixture(): {
  tmp: string;
  builderDir: string;
  dataDir: string;
  modelsDir: string;
  paths: LlmbuilderPaths;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llmbuilder-runner-'));
  const builderDir = path.join(tmp, 'LUCID-BUILDER');
  const dataDir = path.join(tmp, 'llmbuilder');
  const modelsDir = path.join(tmp, 'models');
  for (const rel of [
    TRAIN_SCRIPT,
    BENCH_SCRIPT,
    SCORE_SCRIPT,
    GATE_SCRIPT,
    PROMOTE_SCRIPT,
    DEMO_SCRIPT,
    DIRECT_SCRIPT,
  ]) {
    const file = path.join(builderDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# fake script\n', 'utf-8');
  }
  fs.mkdirSync(path.join(builderDir, 'datasets', 'distillation_sft'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(builderDir, 'requirements.txt'),
    'PyYAML>=6.0\njsonschema>=4.0\nrequests>=2.31.0\nnumpy>=1.0\n',
    'utf-8',
  );
  mockState.builderDir = builderDir;
  mockState.dataDir = dataDir;
  mockState.calls = [];
  mockState.procs = [];
  mockState.hangTrain = false;
  mockState.scaffoldTrain = false;
  mockState.exemplarRecords = 5;
  mockState.demoExemplarRecords = 0;
  mockState.demoCandidate = 'demo_20261105T150120Z';
  mockState.demoChecks = [];
  mockState.promoteDecision = 'promote';
  const paths = resolveLlmbuilderPaths({
    builderDir,
    dataDir,
    modelsDir,
    homeDir: tmp,
  });
  return { tmp, builderDir, dataDir, modelsDir, paths };
}

async function waitFor(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out waiting for condition');
}

function makeRunner(
  paths: LlmbuilderPaths,
  events: LlmbuilderProgressEvent[],
): LlmbuilderJobRunner {
  return new LlmbuilderJobRunner(paths, {
    spawnFn: spawn as unknown as SpawnFn,
    emit: (e) => events.push(e),
  });
}

let fixture: ReturnType<typeof makeFixture>;

beforeEach(() => {
  fixture = makeFixture();
});

afterEach(() => {
  fs.rmSync(fixture.tmp, { recursive: true, force: true });
});

describe('full staged run', () => {
  it('runs data → train → benchmark → gate → promote with provenance', async () => {
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    // Imported dataset + knowledge records (one invalid line).
    const datasetDir = path.join(fixture.dataDir, 'datasets', 'lucifer');
    fs.mkdirSync(datasetDir, { recursive: true });
    fs.writeFileSync(
      path.join(datasetDir, 'lucifer-v1.jsonl'),
      [
        '{"input": "a", "target": "b"}',
        '{"input": "c", "target": "d"}',
        '{"prompt": "e", "response": "f"}',
      ].join('\n') + '\n',
      'utf-8',
    );
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'lucifer-v1',
      knowledgeRecordsJsonl: [
        '{"input": "who are you", "target": "Lucifer"}',
        '{"input": "x", "target": "y"}',
        'not json at all',
      ].join('\n'),
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const manifest = runner.getRun(started.runId)!;
    expect(manifest.status).toBe('completed');
    expect(manifest.stages.map((s) => s.stage)).toEqual([
      'data',
      'train',
      'benchmark',
      'gate',
      'promote',
    ]);
    expect(manifest.stages.every((s) => s.status === 'completed')).toBe(true);
    expect(manifest.decision).toBe('promote');
    expect(manifest.score).toBeCloseTo(0.7136);
    expect(manifest.corpusProvenance?.importedRecords).toBe(3);
    expect(manifest.corpusProvenance?.knowledgeRecords).toBe(2);
    expect(manifest.corpusProvenance?.knowledgeInvalidLines).toBe(1);
    expect(manifest.corpusProvenance?.repoText).toBe(true);
    // The corpus was staged into the vendored tree (copy, not move).
    expect(
      fs.existsSync(
        path.join(
          fixture.builderDir,
          'datasets',
          'distillation_sft',
          'lucifer-lucifer-1-imported.jsonl',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          fixture.builderDir,
          'datasets',
          'distillation_sft',
          'lucifer-lucifer-1-knowledge.jsonl',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(datasetDir, 'lucifer-v1.jsonl')),
    ).toBe(true);
    // GGUF mirrored into the state dir.
    expect(
      fs.existsSync(
        path.join(
          fixture.dataDir,
          'exports',
          'candidates',
          'lucifer-1',
          'lora_train',
          'checkpoint',
          'arc_native_lucifer-1.gguf',
        ),
      ),
    ).toBe(true);
    // Progress events streamed in stage order.
    const completedStages = events
      .filter((e) => e.status === 'completed')
      .map((e) => e.stage);
    expect(completedStages).toEqual([
      'data',
      'train',
      'benchmark',
      'gate',
      'promote',
    ]);
    // The LoRA chain was never run.
    expect(
      mockState.calls.some((c) =>
        c.args.some((a) => a.includes('run_candidate_artifact_chain')),
      ),
    ).toBe(false);
  });

  it('fails the data stage when the imported dataset is missing', async () => {
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'no-such-dataset',
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const manifest = runner.getRun(started.runId)!;
    expect(manifest.status).toBe('failed');
    expect(manifest.stages[0].stage).toBe('data');
    expect(manifest.stages[0].status).toBe('failed');
    expect(mockState.calls.length).toBe(0);
  });
});

describe('manifest-based stage status', () => {
  it('a scaffold train manifest is scaffold, never green, and stops the run', async () => {
    mockState.scaffoldTrain = true;
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const manifest = runner.getRun(started.runId)!;
    expect(manifest.status).toBe('failed');
    const train = manifest.stages.find((s) => s.stage === 'train')!;
    expect(train.status).toBe('scaffold');
    expect(train.message).toMatch(/scaffold/i);
    // No benchmark ran after a scaffold train.
    expect(
      mockState.calls.some((c) =>
        c.args.some((a) => a.includes('run_model_benchmarks')),
      ),
    ).toBe(false);
  });

  it('readStageStatus maps manifest values honestly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmbuilder-status-'));
    try {
      const write = (name: string, obj: unknown): string => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, JSON.stringify(obj), 'utf-8');
        return file;
      };
      expect(
        readStageStatus(write('a.json', { status: 'completed' })).status,
      ).toBe('completed');
      expect(
        readStageStatus(write('b.json', { status: 'scaffold_ready' })).status,
      ).toBe('scaffold');
      expect(
        readStageStatus(write('c.json', { execution_mode: 'scaffold' })).status,
      ).toBe('scaffold');
      expect(readStageStatus(write('d.json', { ok: true })).status).toBe(
        'completed',
      );
      expect(readStageStatus(write('e.json', { ok: false })).status).toBe(
        'failed',
      );
      expect(
        readStageStatus(write('f.json', { status: 'mystery' })).status,
      ).toBe('failed');
      expect(readStageStatus(path.join(dir, 'missing.json')).status).toBe(
        'failed',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cancel and serialization', () => {
  it('cancel kills the child process', async () => {
    mockState.hangTrain = true;
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 300,
      batchSize: 4,
      corpus: 'repo',
    });
    await waitFor(() => mockState.calls.length > 0);
    const result = runner.cancelRun(started.runId);
    expect(result.ok).toBe(true);
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    expect(mockState.procs.some((p) => p.killed)).toBe(true);
    const manifest = runner.getRun(started.runId)!;
    expect(manifest.status).toBe('cancelled');
    expect(
      manifest.stages.some((s) => s.status === 'cancelled'),
    ).toBe(true);
  });

  it('cancelRun on an unknown run id reports false', () => {
    const runner = makeRunner(fixture.paths, []);
    expect(runner.cancelRun('run-does-not-exist')).toEqual({ ok: false });
  });

  it('runs one job at a time', async () => {
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const first = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
    });
    const second = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-2',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
    });
    await waitFor(() => {
      const a = runner.getRun(first.runId);
      const b = runner.getRun(second.runId);
      return !!a && !!b && a.status !== 'running' && b.status !== 'running';
    });
    expect(runner.getRun(first.runId)!.status).toBe('completed');
    expect(runner.getRun(second.runId)!.status).toBe('completed');
    const scriptOf = (call: (typeof mockState.calls)[number]): string => {
      const script = call.args.find((a) => a.endsWith('.py')) ?? '';
      return script.split('/').pop() ?? '';
    };
    const firstPromoteIdx = mockState.calls.findIndex(
      (c) =>
        scriptOf(c) === 'promote_candidate.py' &&
        c.args.includes('lucifer-1'),
    );
    const secondTrainIdx = mockState.calls.findIndex(
      (c) =>
        scriptOf(c) === 'train_arc_native_candidate.py' &&
        c.args.includes('lucifer-2'),
    );
    expect(firstPromoteIdx).toBeGreaterThan(-1);
    expect(secondTrainIdx).toBeGreaterThan(-1);
    expect(secondTrainIdx).toBeGreaterThan(firstPromoteIdx);
  });
});

describe('dataset validation', () => {
  it('accepts good lines, lists bad lines in errors, skips them', () => {
    const validated = validateDatasetJsonl(
      [
        '{"input": "a", "target": "b"}',
        'not json',
        '{"prompt": "c", "response": "d", "domain": "repair"}',
        '{"input": "only input"}',
        '{"messages": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]}',
        '',
      ].join('\n'),
    );
    expect(validated.records).toHaveLength(3);
    expect(validated.errors).toHaveLength(2);
    expect(validated.errors[0]).toMatch(/line 2/);
    expect(validated.errors[1]).toMatch(/line 4/);
    expect(validated.domains).toEqual(['repair']);
  });

  it('an empty file is rejected', () => {
    const validated = validateDatasetJsonl('\n  \n');
    expect(validated.records).toHaveLength(0);
    expect(validated.errors).toContain('empty file: no records');
  });

  it('importDatasetFile writes only the valid records', () => {
    const result = importDatasetFile(fixture.paths, {
      homunculusId: 'lucifer',
      filename: 'chatgpt-v1.jsonl',
      content: [
        '{"input": "a", "target": "b"}',
        'broken',
        '{"input": "c", "target": "d"}',
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
    expect(result.records).toBe(2);
    expect(result.recordCount).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.datasetId).toBe('lucifer/chatgpt-v1.jsonl');
    const written = fs.readFileSync(
      path.join(
        fixture.dataDir,
        'datasets',
        'lucifer',
        'chatgpt-v1.jsonl',
      ),
      'utf-8',
    );
    expect(written.trim().split('\n')).toHaveLength(2);
  });

  it('importDatasetFile rejects an empty file', () => {
    const result = importDatasetFile(fixture.paths, {
      homunculusId: 'lucifer',
      filename: 'empty.jsonl',
      content: '\n',
    });
    expect(result.ok).toBe(false);
    expect(result.records).toBe(0);
    expect(
      fs.existsSync(
        path.join(fixture.dataDir, 'datasets', 'lucifer', 'empty.jsonl'),
      ),
    ).toBe(false);
  });
});

describe('roster persistence', () => {
  it('round-trips through the JSON file with an atomic write', () => {
    const roster = [
      { id: 'lucifer', name: 'Lucifer', color: 'purple', lineage: [] },
    ];
    writeRosterAtomic(fixture.paths, roster);
    expect(readRoster(fixture.paths)).toEqual(roster);
    // No temp file left behind.
    const leftovers = fs
      .readdirSync(fixture.dataDir)
      .filter((f) => f.includes('.tmp-'));
    expect(leftovers).toHaveLength(0);
    expect(readRoster(fixture.paths)).toEqual(roster);
  });

  it('readRoster is null before any roster exists', () => {
    expect(readRoster(fixture.paths)).toBeNull();
  });
});

describe('askBrain', () => {
  it('with no artifact, returns the honest error, never an invented answer', async () => {
    const result = await runAskBrain(
      fixture.paths,
      { homunculusId: 'lucifer', prompt: 'who are you?' },
      { spawnFn: spawn as unknown as SpawnFn },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no brain installed yet');
    expect(result.text).toBe('');
    expect(result.answer).toBe('');
    expect(result.matches).toEqual([]);
  });

  it('with an exemplar artifact, returns the brain answer and matches', async () => {
    const base = path.join(
      fixture.builderDir,
      'exports',
      'candidates',
      'lucifer-1',
      'exemplar_train',
    );
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(
      path.join(base, 'exemplar_model.json'),
      JSON.stringify({ records: [] }),
      'utf-8',
    );
    // A run manifest naming the candidate, so the lookup finds it.
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const result = await runAskBrain(
      fixture.paths,
      { homunculusId: 'lucifer', prompt: 'how do I repair this?' },
      { spawnFn: spawn as unknown as SpawnFn },
    );
    expect(result.ok).toBe(true);
    expect(result.answer).toContain('An answer from the records.');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].capability).toBe('repair');
    expect(result.matchedCapabilities).toEqual(['repair']);
    expect(result.confidence).toMatch(/^Confidence:/);
    expect(result.noMatch).toBe(false);
    // The capability went into the prompt context (the script has
    // no capability flag) — the spawn args carry it in the prompt.
    const directCall = mockState.calls.find((c) =>
      c.args.some((a) => a.includes('run_direct_candidate')),
    );
    expect(directCall).toBeDefined();
    expect(directCall!.args).toContain('--system-prompt');
  });

  it('answers from the installed candidate, not the latest', async () => {
    // Two candidates with exemplars; the latest run names lucifer-2,
    // but the installed brain is lucifer-1. The brain IS the trained
    // model — it must answer from lucifer-1's records, never from the
    // newer, uninstalled candidate's.
    for (const candidate of ['lucifer-1', 'lucifer-2']) {
      const base = path.join(
        fixture.builderDir,
        'exports',
        'candidates',
        candidate,
        'exemplar_train',
      );
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(
        path.join(base, 'exemplar_model.json'),
        JSON.stringify({ records: [] }),
        'utf-8',
      );
    }
    // A run manifest naming lucifer-2 (the latest candidate).
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-2',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    // Install lucifer-1 as the brain.
    writeInstalledCandidate(
      fixture.paths,
      'lucifer',
      'lucifer-1',
      path.join(fixture.paths.modelsDir, 'lucifer.gguf'),
    );
    const result = await runAskBrain(
      fixture.paths,
      { homunculusId: 'lucifer', prompt: 'who are you?' },
      { spawnFn: spawn as unknown as SpawnFn },
    );
    expect(result.ok).toBe(true);
    const directCall = mockState.calls.find((c) =>
      c.args.some((a) => a.includes('run_direct_candidate')),
    );
    expect(directCall).toBeDefined();
    const artifactIdx = directCall!.args.indexOf('--artifact');
    expect(artifactIdx).toBeGreaterThan(-1);
    expect(directCall!.args[artifactIdx + 1]).toContain('lucifer-1');
    expect(directCall!.args[artifactIdx + 1]).not.toContain('lucifer-2');
  });
});

describe('demo-proof per-check results', () => {
  it('parses check lines and ignores the rest', () => {
    expect(parseDemoCheckLine("  ✓  Term stored  ['proof_cycle']")).toEqual({
      label: 'Term stored',
      ok: true,
      detail: "'proof_cycle'",
    });
    expect(parseDemoCheckLine('  ✗  SFT export wrote records')).toEqual({
      label: 'SFT export wrote records',
      ok: false,
      detail: undefined,
    });
    expect(parseDemoCheckLine('     FAIL: SFT export wrote records')).toBeNull();
    expect(parseDemoCheckLine('  → Decision: REJECT')).toBeNull();
    expect(parseDemoCheckLine('')).toBeNull();
    expect(
      summarizeDemoChecks([
        { label: 'a', ok: true },
        { label: 'b', ok: false },
      ]),
    ).toEqual({
      passed: 1,
      failed: 1,
      total: 2,
      checks: [
        { label: 'a', ok: true },
        { label: 'b', ok: false },
      ],
    });
  });

  it('17/19 checks is a FAILED run, never a pass — exit 0 and ok:true ignored', async () => {
    // The real demo-proof run: 17 passed, 2 failed (SFT export wrote
    // 0 records; 0 Arc-RAR bundles), Gate reject, scoreboard empty.
    const checks: string[] = [];
    for (let i = 1; i <= 17; i++) checks.push(`  ✓  Check ${i}`);
    checks.push('  ✗  SFT export wrote records');
    checks.push('  ✗  Arc-RAR bundles found');
    mockState.demoChecks = checks;
    mockState.demoExemplarRecords = 0;
    mockState.promoteDecision = 'reject';
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
      demoProof: true,
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const manifest = runner.getRun(started.runId)!;
    // The run is FAILED: 17/19 is not a pass.
    expect(manifest.status).toBe('failed');
    expect(manifest.error).toMatch(/17\/19/);
    expect(manifest.error).toMatch(/SFT export wrote records/);
    expect(manifest.error).toMatch(/Arc-RAR bundles found/);
    expect(manifest.demoChecks).toEqual({
      passed: 17,
      failed: 2,
      total: 19,
      checks: expect.any(Array),
    });
    expect(manifest.demoChecks!.checks).toHaveLength(19);
    // The stages themselves keep their true statuses: the candidate
    // really did train, benchmark, gate, and promote (reject is a
    // decision, not a stage failure).
    expect(manifest.stages.find((s) => s.stage === 'train')!.status).toBe(
      'completed',
    );
    expect(manifest.stages.find((s) => s.stage === 'promote')!.status).toBe(
      'completed',
    );
    expect(manifest.decision).toBe('reject');
    // 0 exemplar records: the train message says the benchmark score
    // came from the generic fallback, not the trained weights.
    expect(manifest.exemplarRecords).toBe(0);
    const trainStage = manifest.stages.find((s) => s.stage === 'train')!;
    expect(trainStage.message).toMatch(/generic fallback/);
    expect(trainStage.message).toMatch(/17\/19/);
    // Structured demo checks ride on the train stage's manifest, not
    // just the raw log text.
    const trainEvent = events.find(
      (e) => e.stage === 'train' && e.status === 'completed',
    );
    expect(trainEvent?.manifest).toMatchObject({
      demoChecks: { passed: 17, failed: 2, total: 19 },
    });
  });

  it('19/19 checks is a completed demo-proof run', async () => {
    const checks: string[] = [];
    for (let i = 1; i <= 19; i++) checks.push(`  ✓  Check ${i}`);
    mockState.demoChecks = checks;
    mockState.demoExemplarRecords = 3;
    mockState.promoteDecision = 'promote';
    const events: LlmbuilderProgressEvent[] = [];
    const runner = makeRunner(fixture.paths, events);
    const started = runner.startRun({
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo',
      demoProof: true,
    });
    await waitFor(() => {
      const m = runner.getRun(started.runId);
      return !!m && m.status !== 'running';
    });
    const manifest = runner.getRun(started.runId)!;
    expect(manifest.status).toBe('completed');
    expect(manifest.demoChecks).toMatchObject({
      passed: 19,
      failed: 0,
      total: 19,
    });
    expect(manifest.decision).toBe('promote');
  });
});
