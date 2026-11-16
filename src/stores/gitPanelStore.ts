/**
 * Git panel store (the git panel's local
 * core).
 *
 * The state for the Git panel (bottom dock): the branch and
 * ahead/behind, the staged / unstaged / untracked file lists
 * (split from `git status --porcelain=v1`'s XY codes: X is the
 * staged half, Y the unstaged half, `??` is untracked), the
 * branch list, the selected file's parsed diff, and the commit
 * message. Every write goes through the main process's git
 * IPC (argv-only, repo-checked, path-contained — see
 * electron/ipc/git.ts) and refreshes afterwards, so the panel
 * never shows a state the repo is not in. No bridge (web
 * build, tests) means an error state, never faked data.
 */
import { create } from 'zustand';
import { parsePorcelain, type PorcelainEntry } from '../lib/gitStatus';
import {
  parseUnifiedDiff,
  buildHunkPatch,
  annotateStagedHunks,
  type DiffFile,
  type DiffHunk,
} from '../lib/gitPatch';

export interface GitPanelState {
  /** The repo root the panel is showing (the project root). */
  cwd: string | null;
  loading: boolean;
  /** The last failure, shown in the panel (null = no error). */
  error: string | null;
  /** False when the cwd is not a git repo. */
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: PorcelainEntry[];
  unstaged: PorcelainEntry[];
  untracked: PorcelainEntry[];
  branches: string[];
  /** The file whose diff is shown (null = none selected). */
  selectedPath: string | null;
  /** The selected file's parsed diff (null = not loaded). */
  diff: DiffFile[] | null;
  diffLoading: boolean;
  commitMessage: string;
  committing: boolean;

  refresh: (cwd: string) => Promise<void>;
  selectFile: (path: string | null) => Promise<void>;
  setCommitMessage: (message: string) => void;
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  stageHunk: (file: DiffFile, hunk: DiffHunk) => Promise<void>;
  unstageHunk: (file: DiffFile, hunk: DiffHunk) => Promise<void>;
  commit: () => Promise<void>;
  checkoutBranch: (branch: string) => Promise<void>;
  resetForTests: () => void;
}

const initial = {
  cwd: null as string | null,
  loading: false,
  error: null as string | null,
  isRepo: false,
  branch: '',
  ahead: 0,
  behind: 0,
  staged: [] as PorcelainEntry[],
  unstaged: [] as PorcelainEntry[],
  untracked: [] as PorcelainEntry[],
  branches: [] as string[],
  selectedPath: null as string | null,
  diff: null as DiffFile[] | null,
  diffLoading: false,
  commitMessage: '',
  committing: false,
};

function gitBridge() {
  return (window as unknown as { lucidAPI?: { git?: Record<string, (...args: unknown[]) => Promise<unknown>> } })
    .lucidAPI?.git;
}

export const useGitPanelStore = create<GitPanelState>()((set, get) => ({
  ...initial,

  refresh: async (cwd) => {
    const git = gitBridge();
    set({ cwd, loading: true, error: null });
    if (!git?.getStatus || !git?.getBranches) {
      set({ loading: false, isRepo: false, error: 'Git is unavailable in this build.' });
      return;
    }
    try {
      const [status, branches] = await Promise.all([
        git.getStatus(cwd) as Promise<{
          branch: string;
          porcelain: string;
          ahead: number;
          behind: number;
        } | null>,
        git.getBranches(cwd) as Promise<{ branches: string[]; current: string } | null>,
      ]);
      if (!status) {
        set({
          loading: false,
          isRepo: false,
          branch: '',
          staged: [],
          unstaged: [],
          untracked: [],
          branches: [],
          diff: null,
          selectedPath: null,
          error: null,
        });
        return;
      }
      const staged: PorcelainEntry[] = [];
      const unstaged: PorcelainEntry[] = [];
      const untracked: PorcelainEntry[] = [];
      for (const entry of parsePorcelain(status.porcelain)) {
        if (entry.status === '??') untracked.push(entry);
        else {
          if (entry.status[0] !== ' ' && entry.status[0] !== '?') staged.push(entry);
          if (entry.status[1] !== ' ') unstaged.push(entry);
        }
      }
      set({
        loading: false,
        isRepo: true,
        branch: status.branch,
        ahead: status.ahead,
        behind: status.behind,
        staged,
        unstaged,
        untracked,
        branches: branches?.branches ?? [],
        error: null,
      });
      // The selection may have been staged away — reload its diff.
      const selected = get().selectedPath;
      if (selected) await get().selectFile(selected);
    } catch {
      set({ loading: false, error: 'Could not read the git status.' });
    }
  },

  selectFile: async (path) => {
    const { cwd } = get();
    set({ selectedPath: path, diff: null, diffLoading: path !== null });
    if (!path || !cwd) return;
    const git = gitBridge();
    if (!git?.getDiff) {
      set({ diffLoading: false });
      return;
    }
    try {
      // Two diffs: vs HEAD (every change in the file) and
      // --cached (the staged ones). A hunk is staged when
      // its header appears in the cached diff — the panel's
      // per-hunk button follows the hunk, not the list the
      // file was picked from (a partially staged file is in
      // both lists). Untracked files have no staged diff, so
      // every hunk reads unstaged — and the panel hides the
      // per-hunk buttons for them (only `git add` stages a
      // file git has never seen).
      const [headRaw, stagedRaw] = await Promise.all([
        git.getDiff(cwd, path) as Promise<string | null>,
        git.getDiff(cwd, path, true) as Promise<string | null>,
      ]);
      const headFiles = headRaw ? parseUnifiedDiff(headRaw) : [];
      const stagedFiles = stagedRaw ? parseUnifiedDiff(stagedRaw) : [];
      set({ diff: annotateStagedHunks(headFiles, stagedFiles), diffLoading: false });
    } catch {
      set({ diff: [], diffLoading: false });
    }
  },

  setCommitMessage: (message) => set({ commitMessage: message }),

  stageFile: async (path) => {
    const { cwd, refresh } = get();
    if (!cwd) return;
    const git = gitBridge();
    if (!git?.stage) return;
    const result = (await git.stage(cwd, [path])) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ error: result.error ?? 'Could not stage the file.' });
      return;
    }
    await refresh(cwd);
  },

  unstageFile: async (path) => {
    const { cwd, refresh } = get();
    if (!cwd) return;
    const git = gitBridge();
    if (!git?.unstage) return;
    const result = (await git.unstage(cwd, [path])) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ error: result.error ?? 'Could not unstage the file.' });
      return;
    }
    await refresh(cwd);
  },

  stageHunk: async (file, hunk) => {
    const { cwd, refresh, selectFile } = get();
    if (!cwd) return;
    const git = gitBridge();
    if (!git?.applyHunk) return;
    const patch = buildHunkPatch(file, hunk);
    const result = (await git.applyHunk(cwd, patch, false)) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ error: result.error ?? 'Could not stage the hunk.' });
      return;
    }
    await refresh(cwd);
    await selectFile(file.path);
  },

  unstageHunk: async (file, hunk) => {
    const { cwd, refresh, selectFile } = get();
    if (!cwd) return;
    const git = gitBridge();
    if (!git?.applyHunk) return;
    const patch = buildHunkPatch(file, hunk);
    const result = (await git.applyHunk(cwd, patch, true)) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ error: result.error ?? 'Could not unstage the hunk.' });
      return;
    }
    await refresh(cwd);
    await selectFile(file.path);
  },

  commit: async () => {
    const { cwd, commitMessage, refresh } = get();
    if (!cwd || !commitMessage.trim()) return;
    const git = gitBridge();
    if (!git?.commit) return;
    set({ committing: true, error: null });
    const result = (await git.commit(cwd, commitMessage)) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ committing: false, error: result.error ?? 'Could not commit.' });
      return;
    }
    set({ committing: false, commitMessage: '' });
    await refresh(cwd);
  },

  checkoutBranch: async (branch) => {
    const { cwd, refresh } = get();
    if (!cwd) return;
    const git = gitBridge();
    if (!git?.checkout) return;
    const result = (await git.checkout(cwd, branch)) as { ok: boolean; error?: string };
    if (!result.ok) {
      set({ error: result.error ?? 'Could not switch branch.' });
      return;
    }
    await refresh(cwd);
  },

  resetForTests: () => set({ ...initial }),
}));
