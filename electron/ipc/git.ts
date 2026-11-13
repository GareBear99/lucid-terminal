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

export function setupGitHandlers(ipcMain: IpcMain): void {
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
