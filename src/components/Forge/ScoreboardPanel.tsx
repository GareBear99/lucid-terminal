/**
 * ScoreboardPanel — the model registry and scoreboard (right of the Forge).
 *
 * Every candidate, its Gate v2 weighted score, its decision
 * (promote / archive_only / reject), and its artifacts. From a
 * promoted row: Install as brain. Rollback re-installs the previous
 * incumbent for the selected Homunculus — promotion is append-only in
 * the scoreboard, so rollback is just re-pointing at the earlier GGUF.
 *
 * The registry slots (Flagship / Fallback / Eval) are read off the
 * scoreboard: the best promoted candidate is Flagship, the previous
 * incumbent is Fallback, the latest candidate is Eval. No rows yet
 * and the slots say so plainly.
 */

import { useForgeStore } from '../../stores/forgeStore';
import { gateDecisionLabel } from '../../lib/homunculi';

export function ScoreboardPanel() {
  const roster = useForgeStore((s) => s.roster);
  const selectedId = useForgeStore((s) => s.selectedId);
  const scoreboard = useForgeStore((s) => s.scoreboard);
  const installBrain = useForgeStore((s) => s.installBrain);
  const rollback = useForgeStore((s) => s.rollback);

  const selected = roster.find((h) => h.id === selectedId) ?? null;
  const promoted = scoreboard.filter((r) => r.decision === 'promote');
  const flagship =
    promoted.length > 0
      ? [...promoted].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0]
      : null;
  const latest = scoreboard[scoreboard.length - 1] ?? null;

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3">
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          Model registry
        </h3>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-muted)]">Flagship</dt>
            <dd className="text-right text-[var(--text-secondary)]">
              {flagship ? flagship.candidate : 'Not set yet'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-muted)]">Fallback</dt>
            <dd className="text-right text-[var(--text-secondary)]">
              {selected?.modelPath
                ? selected.modelPath.split('/').pop()
                : 'Not set yet'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-muted)]">Eval</dt>
            <dd className="text-right text-[var(--text-secondary)]">
              {latest ? latest.candidate : 'Not set yet'}
            </dd>
          </div>
        </dl>
        {selected && (
          <button
            type="button"
            onClick={() => void rollback(selected.id)}
            disabled={!selected.modelPath}
            title="Re-install the previous incumbent as this Homunculus's brain."
            className="mt-3 rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)] disabled:opacity-50"
          >
            Rollback {selected.name}&apos;s brain
          </button>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          Scoreboard
        </h3>
        {scoreboard.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            No candidates yet — run the demo proof or a training run and
            the scoreboard fills in here.
          </p>
        ) : (
          <ul className="space-y-3">
            {scoreboard.map((row) => (
              <li
                key={row.candidate}
                className="rounded border border-[var(--border)] p-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {row.candidate}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                    {row.score !== null ? `Score ${row.score}` : 'No score'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {gateDecisionLabel(row.decision)}
                </p>
                {row.artifacts.length > 0 && (
                  <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                    {row.artifacts.join(', ')}
                  </p>
                )}
                {row.decision === 'promote' && selected && (
                  <button
                    type="button"
                    onClick={() => void installBrain(selected.id, row.candidate)}
                    className="mt-2 rounded bg-[var(--accent)] px-3 py-1 text-xs text-white"
                  >
                    Install as {selected.name}&apos;s brain
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
