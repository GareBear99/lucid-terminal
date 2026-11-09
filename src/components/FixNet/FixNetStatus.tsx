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
 * stored. Renders nothing until the first successful fetch, and stays
 * hidden if the preload API is unavailable.
 */

import { useEffect, useState } from 'react';
import { useTerminalStore, isActiveTerminalOnline } from '../../stores/terminalStore';
import { OnlineIndicator } from './OnlineIndicator';

interface FixNetStats {
  success: boolean;
  fixes_count: number;
  scripts_count: number;
  last_sync: string | null;
  offline_percentage: number;
}

export function FixNetStatus() {
  const [stats, setStats] = useState<FixNetStats | null>(null);
  // Online indicator (Gary, 2026-11-09): the terminal's real PTY
  // state — green + "online" while the active tab's shell is alive,
  // blackened + "offline" when it is not. The selector only flips
  // when the boolean flips, so the 30 s stats poll does not
  // re-render the dot.
  const isOnline = useTerminalStore(isActiveTerminalOnline);

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
        // FixNet stats are best-effort; a failed fetch leaves the bar hidden.
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!stats) return null;

  return (
    // Same line, opposite side (Gary, 2026-11-09): FixNet stats on
    // the left, the online indicator on the right.
    <div className="fixnet-status px-4 py-1 border-b border-gray-800 flex items-center justify-between gap-3">
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
      <OnlineIndicator isOnline={isOnline} />
    </div>
  );
}
