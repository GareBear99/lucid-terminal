/**
 * Computer-control segment — the pre-installed, agent-only segment
 * in the Segments panel (Gary, 2026-11-06 ~11:45 PST): "then thats
 * probably the next important lucid segment that comes pre installed
 * without the ship but just no way to use it without a fairly
 * advance or heavily trained and directed agent".
 *
 * Pre-installed: no starship, no install step, no server, fully
 * local. The driver lives in Electron's main process; every action
 * crosses one IPC bridge (window.lucidAPI.computerControl) so it
 * can be logged, locked, and audited in one place.
 *
 * The panel shows:
 * - The segment lock (kill-switch). When locked, every action is
 *   refused BEFORE anything runs (423-style); observing still
 *   works. The toggle itself is never disabled — it is always the
 *   way back out. Default unlocked (the phone finger's pattern: a
 *   finger starts enabled, Gary locks it explicitly).
 * - Availability (macOS Accessibility + Screen Recording). When
 *   either is missing the segment reports itself unavailable and
 *   says so — it never silently degrades into acting blind.
 * - The loop: observe → plan → act → read back → decide. Every
 *   action is verified by reading the screen back; unchanged means
 *   it did not land.
 * - The action log (recent actions + their read-back verdicts) and
 *   any watchdog faults.
 * - Protected targets (Gary's ChatGPT tab is built in: never
 *   navigated, closed, or typed into).
 * - The agent-only gate note: how "advanced / heavily trained /
 *   directed" is enforced in code is OPEN (Gary's call) — an
 *   allowlist, a capability check, or user-directed-only. None of
 *   those is presented here as decided. The local entry point is
 *   lucidAPI.computerControl (an agent inside Lucid); an EXTERNAL
 *   agent (a local MCP server / local API on the Mac) is the open
 *   connection step, not built.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lock, MousePointerClick, RefreshCw, ShieldCheck, Unlock } from 'lucide-react';
import type { ComputerControlSegmentState } from '../../lib/computerControl';
import { useSettingsStore } from '../../stores/settingsStore';

export function ComputerControlSegment() {
  const locked = useSettingsStore((s) => s.settings.computerControlLocked ?? false);
  const protectedTargets = useSettingsStore(
    (s) => s.settings.computerControlProtectedTargets ?? [],
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [segmentState, setSegmentState] = useState<ComputerControlSegmentState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    const api = (window as unknown as { lucidAPI?: { computerControl?: { getState: () => Promise<ComputerControlSegmentState> } } }).lucidAPI?.computerControl;
    if (!api) {
      setStateError('Segment state is not available in this view.');
      return;
    }
    try {
      setSegmentState(await api.getState());
      setStateError(null);
    } catch (e) {
      setStateError(e instanceof Error ? e.message : 'Could not read the segment state.');
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const toggleLock = async () => {
    await updateSetting('computerControlLocked', !locked);
    await refreshState();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <MousePointerClick size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Computer control</span>
          <span className="block text-xs text-[var(--text-muted)]">
            Pre-installed, agent-only — no starship, no server, fully local. A trained,
            user-directed agent drives the Mac one verified action at a time.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* The lock — the kill-switch. Always available, never disabled:
          it is always the way back out. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={!locked}
          aria-label={locked ? 'Unlock the computer-control segment' : 'Lock the computer-control segment'}
          onClick={toggleLock}
          className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg-tertiary)]"
        >
          {locked ? <Lock size={14} /> : <Unlock size={14} />}
          <span>{locked ? 'Locked' : 'Unlocked'}</span>
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-7 rounded-full p-0.5 ${locked ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent)]'}`}
          >
            <span
              className={`block h-3 w-3 rounded-full bg-white transition-transform ${locked ? 'translate-x-0' : 'translate-x-3'}`}
            />
          </span>
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {locked
            ? 'Locked — every action is refused before anything runs. Observing still works.'
            : 'Unlocked — a trained agent can drive. Lock it to refuse all actions instantly.'}
        </span>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Observe → plan → act → read back → decide. Every action is verified by reading the
        screen back afterwards; unchanged means it did not land. One action at a time, with
        a timeout that always frees the slot and a watchdog that force-releases a stuck
        action. Focus is re-checked immediately before typing. No passwords are ever typed.
      </p>

      {/* Availability — the macOS permissions gate. */}
      <div className="flex items-center gap-2 text-xs">
        <ShieldCheck size={14} className="text-[var(--text-muted)] shrink-0" />
        {segmentState ? (
          segmentState.available ? (
            <span className="text-[var(--text-muted)]">Available — Accessibility + Screen Recording granted.</span>
          ) : (
            <span className="text-[var(--text-muted)]">
              Unavailable — {segmentState.availabilityReason ?? 'macOS permissions missing.'}
            </span>
          )
        ) : (
          <span className="text-[var(--text-muted)]">
            {stateError ?? 'Checking availability…'}
          </span>
        )}
        <button
          type="button"
          onClick={refreshState}
          aria-label="Refresh computer-control state"
          className="ml-auto rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Protected targets. */}
      <div className="text-xs text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Protected targets — </span>
        {protectedTargets.length > 0 ? (
          <span>
            never navigated, closed, or typed into: {protectedTargets.join(', ')}.
          </span>
        ) : (
          <span>none set.</span>
        )}
      </div>

      {/* Agent-only gate — open decision, stated as open. */}
      <p className="text-xs text-[var(--text-muted)]">
        Agent-only: only a fairly advanced, heavily trained, user-directed agent can drive
        this — it must observe, plan, act, read back, and stop on failure. How the gate is
        enforced in code (allowlist, capability check, or user-directed-only) is Gary&apos;s
        call, not decided yet. Local entry point: lucidAPI.computerControl (an agent inside
        Lucid). An external agent (a local MCP server / local API on the Mac) is the open
        connection step, not built.
      </p>

      {/* Action log + faults. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Recent actions</h4>
        {segmentState && segmentState.faults.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Watchdog trips: {segmentState.watchdogTrips} — latest fault:{' '}
            {segmentState.faults[0]?.detail ?? ''}
          </p>
        )}
        {segmentState ? (
          segmentState.log.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No actions yet.</p>
          ) : (
            <ul className="space-y-1">
              {segmentState.log.slice(0, 10).map((entry) => (
                <li key={entry.sequence} className="text-xs text-[var(--text-muted)]">
                  #{entry.sequence} {entry.kind}
                  {entry.targetId ? ` on ${entry.targetId}` : ''} — {entry.outcome}
                  {entry.verified ? ' · verified' : ''}
                  {entry.changed === true ? ' · screen changed' : ''}
                  {entry.changed === false ? ' · screen unchanged' : ''}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            {stateError ?? 'Loading the action log…'}
          </p>
        )}
      </div>
    </div>
  );
}
