/**
 * PipelinePanel — the training pipeline (centre of the Forge).
 *
 * The five stages as a visible chain (Data → Train → Benchmark → Gate
 * → Promote) with live state from the progress events, the run log
 * streaming underneath, tier / steps / batch-size / corpus pickers, a
 * real Cancel button, and a low-memory warning when the status says so.
 *
 * A 'scaffold' stage trained NOTHING — it renders amber ("Scaffold —
 * trained nothing"), never green. See stageStatusTone in homunculi.ts.
 */

import { useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  stageStatusLabel,
  stageStatusTone,
} from '../../lib/homunculi';
import type { RunTier } from '../../lib/llmbuilderApi';
import { DatasetImport } from './DatasetImport';

const toneClass: Record<string, string> = {
  idle: 'border-[var(--border)] text-[var(--text-muted)]',
  running:
    'border-[var(--accent)] text-[var(--accent)]',
  success: 'border-green-500/60 text-green-400',
  failed: 'border-red-500/60 text-red-400',
  warning: 'border-amber-500/60 text-amber-400',
};

export function PipelinePanel() {
  const roster = useForgeStore((s) => s.roster);
  const selectedId = useForgeStore((s) => s.selectedId);
  const currentRun = useForgeStore((s) => s.currentRun);
  const lowMemory = useForgeStore((s) => s.lowMemory);
  const datasets = useForgeStore((s) => s.datasets);
  const startRun = useForgeStore((s) => s.startRun);
  const cancelRun = useForgeStore((s) => s.cancelRun);
  const importDataset = useForgeStore((s) => s.importDataset);
  const refreshPromotionDecision = useForgeStore(
    (s) => s.refreshPromotionDecision,
  );

  const [tier, setTier] = useState<RunTier>('tiny');
  const [steps, setSteps] = useState(300);
  const [batchSize, setBatchSize] = useState(4);
  const [corpus, setCorpus] = useState('repo-text');
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);

  const selected = roster.find((h) => h.id === selectedId) ?? null;
  const running = currentRun !== null && !currentRun.done;

  const handleStart = (demoProof: boolean) => {
    if (!selected || running) return;
    void startRun(selected.id, {
      tier: demoProof ? 'tiny' : tier,
      steps: demoProof ? 20 : steps,
      batchSize: demoProof ? 4 : batchSize,
      corpus: demoProof ? 'repo-text' : corpus,
      demoProof,
    });
  };

  const handleReadDecision = async () => {
    if (!selected || !currentRun) return;
    const decision = await refreshPromotionDecision(
      selected.id,
      currentRun.candidate,
    );
    setDecisionMessage(
      decision
        ? `Gate v2: ${decision.candidate} — ${decision.decision}${
            decision.score !== null ? ` (score ${decision.score})` : ''
          }.`
        : 'No promotion decision was written for this candidate.',
    );
  };

  return (
    // min-w-72 (not min-w-0): the pipeline keeps a usable width and the
    // Forge row WRAPS it to its own line instead of crushing it to a
    // ~100px strip in the narrower Settings mount (Gary, 2026-11-07 —
    // the Forge settings page was unreadable there).
    <div className="flex min-w-72 flex-1 flex-col gap-3" data-testid="forge-pipeline">
      {lowMemory && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          Low memory on this Mac — a training run adds a real footprint.
          Close what you can first; a run only ever starts on your click.
        </p>
      )}

      {/* Run controls */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Training run
          {selected ? ` — ${selected.name}` : ''}
        </h3>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Tier
            </span>
            <select
              className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              value={tier}
              onChange={(e) => setTier(e.target.value as RunTier)}
              disabled={running}
              aria-label="Tier"
            >
              <option value="tiny">tiny — ~100k params, block 64</option>
              <option value="small">small — ~100k params, block 128</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Steps
            </span>
            <input
              type="number"
              min={1}
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value) || 1)}
              disabled={running}
              aria-label="Steps"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Batch size
            </span>
            <input
              type="number"
              min={1}
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value) || 1)}
              disabled={running}
              aria-label="Batch size"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Corpus
            </span>
            <select
              className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              value={corpus}
              onChange={(e) => setCorpus(e.target.value)}
              disabled={running}
              aria-label="Corpus"
            >
              <option value="repo-text">Repo text (default demo)</option>
              {datasets.map((d) => (
                <option key={d.datasetId} value={d.datasetId}>
                  {d.datasetId} ({d.recordCount} records)
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleStart(false)}
            disabled={!selected || running}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Start training run
          </button>
          <button
            type="button"
            onClick={() => handleStart(true)}
            disabled={!selected || running}
            title="Runs demo_proof_workflow.py — tiny, 20 steps, ~2 minutes — to prove the whole loop before any real training."
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-50"
          >
            Run demo proof
          </button>
          {running && (
            <button
              type="button"
              onClick={() => void cancelRun()}
              className="rounded border border-red-500/60 px-3 py-1.5 text-sm text-red-400"
            >
              Cancel run
            </button>
          )}
        </div>
        {!selected && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Select a Homunculus from the roster to train it.
          </p>
        )}
      </div>

      {/* Stage chain */}
      <div
        className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
        aria-label="Pipeline stages"
      >
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const state = currentRun?.stages[stage];
            const status = state?.status ?? 'pending';
            const tone =
              status === 'pending'
                ? toneClass.idle
                : toneClass[stageStatusTone(status as never)] ?? toneClass.idle;
            return (
              <span key={stage} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    →
                  </span>
                )}
                <span
                  className={`rounded border px-2 py-1 text-xs ${tone}`}
                  title={state?.message || stageStatusLabel(status as never)}
                >
                  {PIPELINE_STAGE_LABELS[stage]} —{' '}
                  {status === 'pending'
                    ? 'Waiting'
                    : stageStatusLabel(status as never)}
                </span>
              </span>
            );
          })}
        </div>
        {currentRun?.done && currentRun.outcome && (
          <div className="mt-3 rounded border border-[var(--border)] p-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            {/* The verdict comes from the run manifest (listRuns), not
                from the last progress event — a demo-proof run can
                have every stage done and still be a failed run. */}
            <p>
              Run {currentRun.outcome.status}
              {currentRun.outcome.decision
                ? ` — Gate v2: ${currentRun.outcome.decision}`
                : ''}
              {currentRun.outcome.score !== null &&
              currentRun.outcome.score !== undefined
                ? ` (score ${currentRun.outcome.score})`
                : ''}
              .
            </p>
            {currentRun.outcome.demoChecks && (
              <p className="mt-1">
                Demo proof: {currentRun.outcome.demoChecks.passed}/
                {currentRun.outcome.demoChecks.total} checks passed.
                {currentRun.outcome.demoChecks.failed > 0 &&
                  ` Failed: ${currentRun.outcome.demoChecks.checks
                    .filter((c) => !c.ok)
                    .map((c) => c.label)
                    .join('; ')}.`}
              </p>
            )}
            {currentRun.outcome.error && (
              <p className="mt-1 text-red-300">{currentRun.outcome.error}</p>
            )}
          </div>
        )}
        {currentRun?.done && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void handleReadDecision()}
              className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"
            >
              Read Gate decision
            </button>
            {decisionMessage && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {decisionMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Run log */}
      <div className="min-h-32 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          Run log
        </h3>
        {currentRun ? (
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
            {currentRun.logLines.join('\n')}
          </pre>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            No run yet. The demo proof runs first — tiny, 20 steps — to
            prove the loop before any real training.
          </p>
        )}
      </div>

      <DatasetImport datasets={datasets} onImport={importDataset} />
    </div>
  );
}
