/**
 * FixNetStatus Component
 *
 * Status bar showing live FixNet (offline-first error fixing) stats.
 * Fetches from the main process via window.lucidAPI.lucid.getFixNetStats(),
 * which returns { success, fixes_count, scripts_count, last_sync,
 * offline_percentage } from LucidCore.getFixNetStats().
 *
 * Shows:
 * - Offline fixes stored in the dictionary
 * - Scripts stored for reuse
 * - Offline success rate (measured from real lookups, 0% when none yet)
 *
 * Refreshes every 30s so the bar tracks the dictionary as fixes are
 * stored. The row renders from the start — the dot shows grey
 * (unknown) until PTY state is known, instead of the whole line
 * hiding until the first successful fetch (Gary, 2026-11-09
 * ~03:58 PST). Until the first fetch lands, the left side shows a
 * muted placeholder.
 */

import { useEffect, useState } from 'react';
import { useTerminalStore, activeTerminalStatus } from '../../stores/terminalStore';
import { OnlineIndicator } from './OnlineIndicator';
import { DefconBadge } from './DefconBadge';

interface FixNetStats {
  success: boolean;
  fixes_count: number;
  scripts_count: number;
  last_sync: string | null;
  offline_percentage: number;
}

export function FixNetStatus() {
  const [stats, setStats] = useState<FixNetStats | null>(null);
  // Online indicator (Gary, 2026-11-09, refined ~03:58 PST): the
  // terminal's real PTY state in three states — green "online" while
  // the active tab's shell is alive, blackened "offline" when it is
  // not, GREY "unknown" while no PTY state is known yet. The
  // selector only flips when the status flips, so the 30 s stats
  // poll does not re-render the dot.
  const status = useTerminalStore(activeTerminalStatus);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      // Variable cadence: a hidden window has no visible bar to
      // update, so skip the IPC round-trip entirely.
      if (document.hidden) return;
      try {
        const api = (window as any).lucidAPI?.lucid;
        if (!api || typeof api.getFixNetStats !== 'function') return;
        const result = await api.getFixNetStats();
        if (!cancelled && result && result.success) {
          setStats(result as FixNetStats);
        }
      } catch {
        // FixNet stats are best-effort; a failed fetch leaves the placeholder up.
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!stats) {
    // No stats yet (Gary, 2026-11-09 ~03:58 PST): the row still
    // renders — the dot shows grey (unknown) instead of hiding —
    // with a muted placeholder where the stats will land.
    return (
      <div className="fixnet-status px-4 py-1 border-b border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600 font-mono">[FixNet: …]</div>
          <DefconBadge />
        </div>
        <OnlineIndicator status={status} />
      </div>
    );
  }

  return (
    // Same line, opposite side (Gary, 2026-11-09): FixNet stats on
    // the left, the online indicator on the right.
    <div className="fixnet-status px-4 py-1 border-b border-gray-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-500 font-mono">
          <span className="text-gray-600">[</span>
          <span className="text-purple-400">FixNet:</span>{' '}
          <span className="text-green-400">{stats.fixes_count}</span> fixes
          <span className="text-gray-600">, </span>
          <span className="text-blue-400">{stats.scripts_count}</span> scripts
          <span className="text-gray-600">, </span>
          <span className="text-cyan-400">{stats.offline_percentage}%</span> offline
          <span className="text-gray-600">]</span>
        </div>
        <DefconBadge />
      </div>
      <OnlineIndicator status={status} />
    </div>
  );
}
