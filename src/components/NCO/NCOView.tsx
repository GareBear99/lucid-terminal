/**
 * NCO view — the NCO section's panel (Gary, 2026-11-19): the
 * toolbar NCO button opens this view, where the math, the
 * metrics and the containments live with the products portions.
 *
 * The status is read LIVE from the NCO controller's own state
 * file (~/Library/Application Support/NCOStage160A/
 * NCO_STAGE160A_CONTROLLER_STATUS.json) through
 * window.lucidAPI.fs — the same channel the file store uses —
 * on mount and on Refresh. Nothing here is hardcoded: if the
 * file cannot be read, or its shape is not recognised, the view
 * says so and shows no status at all (fail-closed, never a stale
 * or invented number).
 *
 * The one known-bad value is shown honestly, not hidden: the
 * controller's release-integrity check fails on the host file
 * (the D7-fix edit post-dates the manifest), so the view lists
 * the failing check with its expected vs actual hash.
 */
import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { ViewHeader } from '../Layout/ViewHeader';

const CONTROLLER_STATUS_RELATIVE_PATH =
  'Library/Application Support/NCOStage160A/NCO_STAGE160A_CONTROLLER_STATUS.json';

interface NcoIntegrityCheck {
  pass: boolean;
  expected?: string;
  actual?: string;
}

interface NcoControllerStatus {
  state?: string;
  controllerReady?: boolean;
  controllerPid?: number;
  nativeLogicalCpuCount?: number;
  authorityPass?: boolean;
  cleanChaosRulePass?: boolean;
  probe4Pass?: boolean;
  releaseIntegrityPass?: boolean;
  integrity?: { checks?: Record<string, NcoIntegrityCheck> };
  ipcHealthPass?: boolean;
  fabricActive?: boolean;
  preRegistrationReady?: boolean;
  staticSigilSubstrateReady?: boolean;
  physicalAuthority?: boolean;
  lastEvent?: string;
  timestampUtc?: string;
  claimBoundary?: { physicalAuthority?: boolean };
}

function shortHash(hash: string | undefined): string {
  if (!hash) return '—';
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

function PassFail({ pass, label }: { pass: boolean | undefined; label: string }) {
  if (pass === undefined) {
    return (
      <span className="text-[var(--text-muted)]">
        {label}: —
      </span>
    );
  }
  return (
    <span className={pass ? 'text-emerald-400' : 'text-red-400'}>
      {label}: {pass ? 'PASS' : 'FAIL'}
    </span>
  );
}

export function NCOView() {
  const [status, setStatus] = useState<NcoControllerStatus | null>(null);
  const [statusPath, setStatusPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = (typeof window !== 'undefined' ? window.lucidAPI?.fs : undefined) as
        | { getHomeDir: () => Promise<string>; readFile: (path: string) => Promise<string> }
        | undefined;
      if (!api) {
        throw new Error('NCO status is only available inside the Lucid app.');
      }
      const home = (await api.getHomeDir()).replace(/\/$/, '');
      const path = `${home}/${CONTROLLER_STATUS_RELATIVE_PATH}`;
      setStatusPath(path);
      const text = await api.readFile(path);
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || !('state' in parsed)) {
        throw new Error('The controller status file is not in a recognised format.');
      }
      setStatus(parsed as NcoControllerStatus);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'The NCO status could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const checks = status?.integrity?.checks ?? {};
  const checkEntries = Object.entries(checks);
  const passingChecks = checkEntries.filter(([, check]) => check.pass).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <ViewHeader title="NCO" icon={<Cpu size={20} />}>
        <p className="text-sm text-[var(--text-muted)]">
          Math, metrics and containments — the live NCO controller status, read from its own state file.
        </p>
      </ViewHeader>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => void loadStatus()}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <RefreshCw size={14} />
          {loading ? 'Reading…' : 'Refresh'}
        </button>
        {statusPath && (
          <span className="truncate text-xs text-[var(--text-muted)]">{statusPath}</span>
        )}
      </div>

      {loading && !status && !error && (
        <p className="text-sm text-[var(--text-muted)]">Reading the NCO controller status…</p>
      )}

      {error && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">NCO status unavailable</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{error}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            No status is shown rather than a stale or invented one. Start the NCO controller, then Refresh.
          </p>
        </div>
      )}

      {status && (
        <div className="flex flex-col gap-4 text-sm">
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Controller</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-[var(--text-muted)]">State</dt>
              <dd className="font-semibold text-[var(--text-primary)]">{status.state ?? '—'}</dd>
              <dt className="text-[var(--text-muted)]">Controller pid</dt>
              <dd>{status.controllerPid ?? '—'}</dd>
              <dt className="text-[var(--text-muted)]">CPU cores detected</dt>
              <dd>{status.nativeLogicalCpuCount ?? '—'}</dd>
              <dt className="text-[var(--text-muted)]">Last event</dt>
              <dd>{status.lastEvent ?? '—'}</dd>
              <dt className="text-[var(--text-muted)]">Updated</dt>
              <dd>{status.timestampUtc ?? '—'}</dd>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Checks</h2>
            <div className="flex flex-col gap-1">
              <PassFail pass={status.authorityPass} label="Authority" />
              <PassFail pass={status.cleanChaosRulePass} label="Clean chaos rule" />
              <PassFail pass={status.ipcHealthPass} label="IPC health" />
              <PassFail pass={status.probe4Pass} label="Probe 4" />
              <PassFail pass={status.releaseIntegrityPass} label="Release integrity" />
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
              Integrity — {passingChecks}/{checkEntries.length} checks pass
            </h2>
            <div className="flex flex-col gap-1">
              {checkEntries.map(([name, check]) => (
                <div key={name} className="flex flex-wrap items-baseline gap-x-2">
                  <PassFail pass={check.pass} label={name} />
                  {!check.pass && check.expected && check.actual && (
                    <span className="text-xs text-[var(--text-muted)]">
                      expected {shortHash(check.expected)}, actual {shortHash(check.actual)}
                    </span>
                  )}
                </div>
              ))}
              {checkEntries.length === 0 && (
                <p className="text-[var(--text-muted)]">No integrity checks in the status file.</p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Fabric</h2>
            <div className="flex flex-col gap-1">
              <span className="text-[var(--text-muted)]">
                Fabric active: {status.fabricActive === undefined ? '—' : status.fabricActive ? 'yes' : 'no'}
              </span>
              <span className="text-[var(--text-muted)]">
                Pre-registration ready: {status.preRegistrationReady === undefined ? '—' : status.preRegistrationReady ? 'yes' : 'no'}
              </span>
              <span className="text-[var(--text-muted)]">
                Sigil substrate ready: {status.staticSigilSubstrateReady === undefined ? '—' : status.staticSigilSubstrateReady ? 'yes' : 'no'}
              </span>
              <span className="text-[var(--text-muted)]">
                Physical authority: {status.physicalAuthority === undefined ? '—' : status.physicalAuthority ? 'yes' : 'no'}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Physical authority is a separate gate — nothing here claims it.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
