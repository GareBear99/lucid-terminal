import { execFile, spawn } from 'child_process';
import pathModule from 'path';
import { IpcMain } from 'electron';
import type { RawGitStatus } from '../../src/lib/gitStatus';

// Git status for the terminal (heavy terminal work, 2026-11-13 —
// Warp's block headers + pill row carry the branch and change
// counts; Lucid had no git state anywhere).
//
// The main process runs `git` in the cwd and hands the RAW
// outputs over IPC; the renderer builds the GitStatus from them
// (src/lib/gitStatus.ts — one parser, in the renderer, tested
// there). Any failure — not a repo, git missing, timeout —
// returns null, and the renderer shows nothing (never faked).
// No new privilege: the renderer already has unrestricted PTY
// shell access, and `git` here is read-only (rev-parse / status
// / diff / rev-list — nothing writes).

/** One `git` invocation, timed out fast so a hung git can never
 *  hang the terminal. Rejects on any failure (non-zero exit). */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 3000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

/**
 * One `git diff` invocation. `git diff` exits 1 when
 * there ARE differences (that is the normal case — the
 * diff is in stdout), 0 when there are none, and 128+
 * on a real error (not a repo, bad path). Only the error
 * codes reject; 0 and 1 both resolve with the output.
 */
function runGitDiff(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 3000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error && (error as NodeJS.ErrnoException).code !== 1) reject(error);
        else resolve(stdout);
      },
    );
  });
}

/**
 * Local-git writes (Atom steal #21 — the git panel, local
 * core only, 2026-11-14). The read-only handlers above shell
 * out to the `git` CLI; these do the same for writes — no new
 * privilege (the renderer already has unrestricted PTY shell
 * access). Every write:
 * - runs in the passed cwd, which must be a git repo
 *   (rev-parse first — a non-repo returns { ok: false });
 * - takes paths only under that cwd (resolved + checked
 *   against the cwd, like the search IPC's root containment);
 * - passes everything as argv to execFile (no shell), with
 *   `--` before paths so a `-`-leading name cannot become
 *   an option;
 * - returns { ok, error? } — the panel shows the error, it
 *   never fakes a success.
 * Skipped, per the steal: everything GitHub-remote (login,
 * PRs, issues, reviews, checks) — there is no remote half.
 */
function isRepo(cwd: string): Promise<boolean> {
  return runGit(['rev-parse', '--git-dir'], cwd)
    .then(() => true)
    .catch(() => false);
}

function containedPath(cwd: string, path: string): string | null {
  if (typeof path !== 'string' || !path) return null;
  if (path.startsWith('-')) return null;
  // Resolve against the cwd and check containment the way the
  // search IPC does (path.relative — '..' escapes the root).
  const resolved = pathModule.resolve(cwd, path);
  const rel = pathModule.relative(pathModule.resolve(cwd), resolved);
  if (rel.startsWith('..') || pathModule.isAbsolute(rel)) return null;
  return resolved;
}

function validatePaths(cwd: string, paths: unknown): string[] | null {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) return null;
  const out: string[] = [];
  for (const p of paths) {
    const contained = containedPath(cwd, p as string);
    if (contained === null) return null;
    out.push(contained);
  }
  return out;
}

/**
 * `git apply --cached [--reverse]` with the patch on stdin.
 * Written on `spawn`, not `execFile`'s `input` option: on this
 * Node build (v24.22.1) `execFile` + `input` never delivers
 * stdin — the child waits forever, even for `cat` (verified
 * 2026-11-14). `spawn` + `stdin.end(patch)` closes stdin and
 * the child exits. A non-zero exit (a hunk that no longer
 * applies) rejects with git's stderr.
 */
function applyPatch(cwd: string, patch: string, reverse: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = reverse ? ['apply', '--cached', '--reverse'] : ['apply', '--cached'];
    const child = spawn('git', args, { cwd, timeout: 5000 });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git apply exited ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(patch);
  });
}

export function setupGitHandlers(ipcMain: IpcMain): void {
  // The unified diff against HEAD — the agent loop's
  // view_diff tool (steal #5 — Aider). Same read-only
  // rule as git:status (nothing writes); the renderer
  // only parses git output, it never runs git. Returns
  // null when the cwd is not a repo (or git is missing),
  // '' when there are no changes, the raw diff otherwise
  // (capped in the renderer — the raw text is the diff,
  // there is nothing to parse into).
  ipcMain.handle(
    'git:diff',
    async (_, cwd: string, filepath?: string, staged?: boolean): Promise<string | null> => {
    if (typeof cwd !== 'string' || !cwd) return null;
    try {
      await runGit(['rev-parse', '--git-dir'], cwd);
    } catch {
      return null;
    }
    // staged = the index only (`git diff --cached`) — the
    // panel uses it to tell staged hunks from unstaged ones
    // in the combined vs-HEAD diff. An untracked file has no
    // staged diff (empty); its vs-HEAD diff is the --no-index
    // one below.
    const diffArgs =
      staged === true
        ? typeof filepath === 'string' && filepath
          ? ['diff', '--cached', '--', filepath]
          : ['diff', '--cached']
        : typeof filepath === 'string' && filepath
          ? ['diff', 'HEAD', '--', filepath]
          : ['diff', 'HEAD'];
    const diff = await runGitDiff(diffArgs, cwd).catch(() => null);
    if (diff === null) return null;
    if (diff) return diff;
    // No diff vs HEAD — but an untracked file has no diff
    // at all. Show it as a new-file diff (`git diff
    // --no-index` against /dev/null) instead of reporting
    // "no changes" for a file the agent just created.
    // (Not for a staged query: an untracked file has no staged
    // diff, and the --no-index text would wrongly mark its
    // hunks as staged.)
    if (staged !== true && typeof filepath === 'string' && filepath) {
      const tracked = await runGit(['ls-files', '--error-unmatch', '--', filepath], cwd)
        .then(() => true)
        .catch(() => false);
      if (!tracked) {
        return runGitDiff(['diff', '--no-index', '--', '/dev/null', filepath], cwd).catch(() => '');
      }
    }
    return '';
  });

  ipcMain.handle('git:status', async (_, cwd: string): Promise<RawGitStatus | null> => {
    if (typeof cwd !== 'string' || !cwd) return null;
    try {
      const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim();
      if (!branch) return null;
      // Porcelain (file counts) + numstat vs HEAD (line counts,
      // staged + unstaged together; untracked files have no lines
      // and count only in changedFiles). Each is best-effort on
      // its own — a failure is empty output, not a failed lookup.
      const porcelain = await runGit(['status', '--porcelain=v1'], cwd).catch(() => '');
      const numstat = await runGit(['diff', '--numstat', 'HEAD'], cwd).catch(() => '');
      // Ahead/behind vs the upstream: 0/0 when there is none.
      let ahead = 0;
      let behind = 0;
      try {
        const counts = await runGit(
          ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
          cwd,
        );
        const [a, b] = counts.trim().split(/\s+/);
        ahead = Number(a) || 0;
        behind = Number(b) || 0;
      } catch {
        // No upstream — 0/0 stands.
      }
      return { branch, porcelain, numstat, ahead, behind };
    } catch {
      // Not a repo, git missing, timeout — null, never faked.
      return null;
    }
  });

  // ---- Local-git writes (Atom steal #21) ----

  ipcMain.handle(
    'git:stage',
    async (_, cwd: string, paths: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof cwd !== 'string' || !cwd) return { ok: false, error: 'No working directory' };
      if (!(await isRepo(cwd))) return { ok: false, error: 'Not a git repository' };
      const contained = validatePaths(cwd, paths);
      if (contained === null) return { ok: false, error: 'Invalid paths' };
      try {
        await runGit(['add', '--', ...contained], cwd);
        return { ok: true };
      } catch {
        return { ok: false, error: 'git add failed' };
      }
    },
  );

  ipcMain.handle(
    'git:unstage',
    async (_, cwd: string, paths: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof cwd !== 'string' || !cwd) return { ok: false, error: 'No working directory' };
      if (!(await isRepo(cwd))) return { ok: false, error: 'Not a git repository' };
      const contained = validatePaths(cwd, paths);
      if (contained === null) return { ok: false, error: 'Invalid paths' };
      try {
        await runGit(['restore', '--staged', '--', ...contained], cwd);
        return { ok: true };
      } catch {
        return { ok: false, error: 'git restore --staged failed' };
      }
    },
  );

  ipcMain.handle(
    'git:commit',
    async (_, cwd: string, message: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof cwd !== 'string' || !cwd) return { ok: false, error: 'No working directory' };
      if (!(await isRepo(cwd))) return { ok: false, error: 'Not a git repository' };
      if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
        return { ok: false, error: 'A commit message is required (up to 2000 characters)' };
      }
      try {
        await runGit(['commit', '-m', message], cwd);
        return { ok: true };
      } catch {
        return { ok: false, error: 'git commit failed (nothing staged, or a hook refused it)' };
      }
    },
  );

  ipcMain.handle(
    'git:branches',
    async (_, cwd: string): Promise<{ branches: string[]; current: string } | null> => {
      if (typeof cwd !== 'string' || !cwd) return null;
      if (!(await isRepo(cwd))) return null;
      try {
        const [list, current] = await Promise.all([
          runGit(['branch', '--format=%(refname:short)'], cwd),
          runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
        ]);
        const branches = list
          .split('\n')
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
        return { branches, current: current.trim() };
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(
    'git:checkout',
    async (_, cwd: string, branch: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof cwd !== 'string' || !cwd) return { ok: false, error: 'No working directory' };
      if (!(await isRepo(cwd))) return { ok: false, error: 'Not a git repository' };
      if (typeof branch !== 'string' || !branch || branch.startsWith('-') || /[\s\x00-\x1f]/.test(branch)) {
        return { ok: false, error: 'Invalid branch name' };
      }
      // The branch must exist — checked against the live list,
      // so a stale renderer list cannot check out thin air.
      try {
        const list = await runGit(['branch', '--format=%(refname:short)'], cwd);
        const branches = list.split('\n').map((b) => b.trim());
        if (!branches.includes(branch)) return { ok: false, error: 'No such branch' };
        await runGit(['checkout', branch], cwd);
        return { ok: true };
      } catch {
        return { ok: false, error: 'git checkout failed (uncommitted changes may block it)' };
      }
    },
  );

  ipcMain.handle(
    'git:apply-hunk',
    async (
      _,
      cwd: string,
      patch: unknown,
      reverse: unknown,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (typeof cwd !== 'string' || !cwd) return { ok: false, error: 'No working directory' };
      if (!(await isRepo(cwd))) return { ok: false, error: 'Not a git repository' };
      if (typeof patch !== 'string' || !patch || patch.length > 1024 * 1024) {
        return { ok: false, error: 'Invalid patch' };
      }
      try {
        await applyPatch(cwd, patch, reverse === true);
        return { ok: true };
      } catch {
        return { ok: false, error: 'The hunk no longer applies cleanly — refresh and retry' };
      }
    },
  );
}
