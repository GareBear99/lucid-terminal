/**
 * Git status parsing + formatting (heavy terminal work, 2026-11-13 —
 * Warp's block headers carry version/cwd/branch/change-counts/
 * duration + exit code; Lucid's carried cwd + duration only).
 *
 * The main process runs `git` in the block's cwd and hands the raw
 * command outputs here; this module turns them into a GitStatus.
 * Pure functions — no Electron, no shell — unit-testable on their
 * own. Nothing here ever guesses: a non-repo, a missing git, or a
 * failed command yields null, and the caller shows nothing (never
 * a faked branch or faked counts).
 */

import type { GitStatus } from '../types';

/** One `git status --porcelain=v1` line, parsed. */
export interface PorcelainEntry {
  /** The two-letter XY status (e.g. ' M', 'A ', '??'). */
  status: string;
  path: string;
}

/** Parse `git status --porcelain=v1` output into entries. Empty
 *  lines are skipped; a line shorter than 3 chars is not an entry. */
export function parsePorcelain(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    if (line.length < 3) continue;
    entries.push({ status: line.slice(0, 2), path: line.slice(3) });
  }
  return entries;
}

/** One `git diff --numstat` line, parsed: added / deleted / path.
 *  Binary files report '-' for the counts — they count as 0 lines
 *  (the file itself still counts in changedFiles, via porcelain). */
export interface NumstatEntry {
  added: number;
  deleted: number;
  path: string;
}

export function parseNumstat(output: string): NumstatEntry[] {
  const entries: NumstatEntry[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]);
    const deleted = parts[1] === '-' ? 0 : Number(parts[1]);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) continue;
    entries.push({ added, deleted, path: parts.slice(2).join('\t') });
  }
  return entries;
}

/** Build a GitStatus from the three raw git outputs. Returns null
 *  when the branch line is empty (not a repo / command failed) —
 *  the caller shows nothing. `ahead`/`behind` come from
 *  `git rev-list --left-right --count HEAD...@{upstream}` and are
 *  0 when there is no upstream (the main process passes 0,0 then). */
export function buildGitStatus(
  branchOutput: string,
  porcelainOutput: string,
  numstatOutput: string,
  aheadBehind?: { ahead: number; behind: number },
): GitStatus | null {
  const branch = branchOutput.trim();
  if (!branch) return null;
  const changedFiles = parsePorcelain(porcelainOutput).length;
  let addedLines = 0;
  let deletedLines = 0;
  for (const entry of parseNumstat(numstatOutput)) {
    addedLines += entry.added;
    deletedLines += entry.deleted;
  }
  return {
    branch,
    ahead: aheadBehind?.ahead ?? 0,
    behind: aheadBehind?.behind ?? 0,
    changedFiles,
    addedLines,
    deletedLines,
  };
}

/** Warp's counts shape: `36 • +1075 -2` — changed files, added
 *  lines, deleted lines. The branch itself is shown separately. */
export function formatGitCounts(status: GitStatus): string {
  return `${status.changedFiles} • +${status.addedLines} -${status.deletedLines}`;
}

/** The pill-row / header branch label: `master` plus an
 *  ahead/behind marker when the branch has an upstream
 *  (`master ↑2 ↓1`), plain when it does not. */
export function formatGitBranch(status: GitStatus): string {
  let label = status.branch;
  if (status.ahead > 0) label += ` ↑${status.ahead}`;
  if (status.behind > 0) label += ` ↓${status.behind}`;
  return label;
}

/** The raw git outputs the main process hands over IPC (see
 *  electron/ipc/git.ts): the branch line, `status --porcelain=v1`,
 *  `diff --numstat HEAD`, and the ahead/behind counts (0 when
 *  there is no upstream). The renderer builds the GitStatus from
 *  these (buildGitStatus above) — one parser, in the renderer,
 *  tested here. */
export interface RawGitStatus {
  branch: string;
  porcelain: string;
  numstat: string;
  ahead: number;
  behind: number;
}
