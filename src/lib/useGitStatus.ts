/**
 * The live git status for a cwd (heavy terminal work, 2026-11-13
 * — Warp's pill row shows the branch + change counts live; Lucid
 * showed the cwd twice and no git state at all).
 *
 * Reads `window.lucidAPI.git.getStatus` (main process runs `git`
 * in the cwd) through a 5s per-cwd cache, so the pill row and a
 * block stamp in the same second share one lookup. Three states:
 * `undefined` = not looked up yet, `null` = not a repo / git
 * missing / lookup failed (the caller shows nothing — never a
 * faked branch), a GitStatus = the live state.
 *
 * The hook follows the src/lib convention (useDraggableInputHeight
 * lives in src/lib/inputHeight.ts): a hook in lib, not a store —
 * git state is derived, per-cwd, and never written by the UI.
 */

import { useEffect, useState } from 'react';
import type { GitStatus } from '../types';
import { buildGitStatus, type RawGitStatus } from './gitStatus';

/** A cwd's status is re-read at most every 5s. */
const GIT_STATUS_CACHE_TTL_MS = 5000;

const cache = new Map<string, { status: GitStatus | null; at: number }>();

type GitApi = {
  getStatus?: (cwd: string) => Promise<RawGitStatus | null>;
};

function gitApi(): GitApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const lucidAPI = (window as unknown as { lucidAPI?: { git?: GitApi } }).lucidAPI;
  return lucidAPI?.git;
}

/** One cached lookup: the raw IPC result built into a GitStatus
 *  (see src/lib/gitStatus.ts). Never throws — any failure is
 *  null (not a repo / git missing / timeout). */
export async function getCachedGitStatus(cwd: string): Promise<GitStatus | null> {
  const entry = cache.get(cwd);
  if (entry && Date.now() - entry.at < GIT_STATUS_CACHE_TTL_MS) return entry.status;
  let status: GitStatus | null = null;
  try {
    const getStatus = gitApi()?.getStatus;
    if (typeof getStatus === 'function') {
      const raw = await getStatus(cwd);
      status = raw ? buildGitStatus(raw.branch, raw.porcelain, raw.numstat, { ahead: raw.ahead, behind: raw.behind }) : null;
    }
  } catch {
    status = null;
  }
  cache.set(cwd, { status, at: Date.now() });
  return status;
}

/** Test-only: drop the cache (same precedent as
 *  terminalStore.resetForTests). */
export function resetGitStatusCacheForTests(): void {
  cache.clear();
}

/** The live git status for a cwd: undefined until the first
 *  lookup resolves, null when the cwd is not a repo (or git is
 *  unavailable), a GitStatus otherwise. */
export function useGitStatus(cwd: string | undefined): GitStatus | null | undefined {
  const [status, setStatus] = useState<GitStatus | null | undefined>(undefined);
  useEffect(() => {
    if (!cwd) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setStatus(undefined);
    void getCachedGitStatus(cwd).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);
  return status;
}
