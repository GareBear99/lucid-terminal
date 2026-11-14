import { execFile } from 'child_process';
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

export function setupGitHandlers(ipcMain: IpcMain): void {
  // The unified diff against HEAD — the agent loop's
  // view_diff tool (steal #5 — Aider). Same read-only
  // rule as git:status (nothing writes); the renderer
  // only parses git output, it never runs git. Returns
  // null when the cwd is not a repo (or git is missing),
  // '' when there are no changes, the raw diff otherwise
  // (capped in the renderer — the raw text is the diff,
  // there is nothing to parse into).
  ipcMain.handle('git:diff', async (_, cwd: string, filepath?: string): Promise<string | null> => {
    if (typeof cwd !== 'string' || !cwd) return null;
    try {
      await runGit(['rev-parse', '--git-dir'], cwd);
    } catch {
      return null;
    }
    const diffArgs =
      typeof filepath === 'string' && filepath
        ? ['diff', 'HEAD', '--', filepath]
        : ['diff', 'HEAD'];
    const diff = await runGitDiff(diffArgs, cwd).catch(() => null);
    if (diff === null) return null;
    if (diff) return diff;
    // No diff vs HEAD — but an untracked file has no diff
    // at all. Show it as a new-file diff (`git diff
    // --no-index` against /dev/null) instead of reporting
    // "no changes" for a file the agent just created.
    if (typeof filepath === 'string' && filepath) {
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
}
