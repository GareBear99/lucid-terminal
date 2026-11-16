// @vitest-environment jsdom
/**
 * Git panel store (the git panel's local
 * core): status splitting, diff annotation, and
 * the write actions through the mocked bridge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGitPanelStore } from '../src/stores/gitPanelStore';

const PORCELAIN = 'M  staged.ts\n M unstaged.ts\n?? new.ts\n';
const DIFF = `diff --git a/staged.ts b/staged.ts
--- a/staged.ts
+++ b/staged.ts
@@ -1,1 +1,2 @@
 one
+two
`;

function installBridge() {
  const git = {
    getStatus: vi.fn(async () => ({
      branch: 'master',
      porcelain: PORCELAIN,
      numstat: '',
      ahead: 1,
      behind: 0,
    })),
    getBranches: vi.fn(async () => ({ branches: ['master', 'feature'], current: 'master' })),
    getDiff: vi.fn(async (_cwd: string, _path: string, staged?: boolean) =>
      staged ? '' : DIFF,
    ),
    stage: vi.fn(async () => ({ ok: true })),
    unstage: vi.fn(async () => ({ ok: true })),
    commit: vi.fn(async () => ({ ok: true })),
    checkout: vi.fn(async () => ({ ok: true })),
    applyHunk: vi.fn(async () => ({ ok: true })),
  };
  (window as unknown as { lucidAPI?: { git?: unknown } }).lucidAPI = { git };
  return git;
}

describe('git panel store', () => {
  beforeEach(() => {
    useGitPanelStore.getState().resetForTests();
  });

  it('refresh splits porcelain into staged / unstaged / untracked and reads the branch', async () => {
    const git = installBridge();
    await useGitPanelStore.getState().refresh('/tmp/repo');
    const s = useGitPanelStore.getState();
    expect(s.isRepo).toBe(true);
    expect(s.branch).toBe('master');
    expect(s.ahead).toBe(1);
    expect(s.staged.map((e) => e.path)).toEqual(['staged.ts']);
    expect(s.unstaged.map((e) => e.path)).toEqual(['unstaged.ts']);
    expect(s.untracked.map((e) => e.path)).toEqual(['new.ts']);
    expect(s.branches).toEqual(['master', 'feature']);
    expect(git.getStatus).toHaveBeenCalledWith('/tmp/repo');
  });

  it('a null status means not a repo, never faked data', async () => {
    const git = installBridge();
    git.getStatus.mockResolvedValueOnce(null);
    await useGitPanelStore.getState().refresh('/tmp/not-a-repo');
    const s = useGitPanelStore.getState();
    expect(s.isRepo).toBe(false);
    expect(s.staged).toEqual([]);
  });

  it('selectFile loads and parses the diff, with staged annotation', async () => {
    installBridge();
    await useGitPanelStore.getState().refresh('/tmp/repo');
    await useGitPanelStore.getState().selectFile('staged.ts');
    const s = useGitPanelStore.getState();
    expect(s.selectedPath).toBe('staged.ts');
    expect(s.diff).not.toBeNull();
    expect(s.diff?.[0].path).toBe('staged.ts');
    expect(s.diff?.[0].hunks).toHaveLength(1);
    // No staged diff (the mock returns '') → the hunk is unstaged.
    expect(s.diff?.[0].hunks[0].staged).toBe(false);
  });

  it('stage / unstage / commit / checkout call the bridge and refresh', async () => {
    const git = installBridge();
    const api = useGitPanelStore.getState();
    await api.refresh('/tmp/repo');
    await api.stageFile('unstaged.ts');
    expect(git.stage).toHaveBeenCalledWith('/tmp/repo', ['unstaged.ts']);
    await api.unstageFile('staged.ts');
    expect(git.unstage).toHaveBeenCalledWith('/tmp/repo', ['staged.ts']);
    await api.checkoutBranch('feature');
    expect(git.checkout).toHaveBeenCalledWith('/tmp/repo', 'feature');
    api.setCommitMessage('test commit');
    await api.commit();
    expect(git.commit).toHaveBeenCalledWith('/tmp/repo', 'test commit');
    expect(useGitPanelStore.getState().commitMessage).toBe('');
  });

  it('commit with an empty message calls nothing', async () => {
    const git = installBridge();
    await useGitPanelStore.getState().refresh('/tmp/repo');
    useGitPanelStore.getState().setCommitMessage('   ');
    await useGitPanelStore.getState().commit();
    expect(git.commit).not.toHaveBeenCalled();
  });

  it('a failed write surfaces the error and does not refresh', async () => {
    const git = installBridge();
    git.stage.mockResolvedValueOnce({ ok: false, error: 'git add failed' });
    await useGitPanelStore.getState().refresh('/tmp/repo');
    const callsBefore = git.getStatus.mock.calls.length;
    await useGitPanelStore.getState().stageFile('unstaged.ts');
    expect(useGitPanelStore.getState().error).toBe('git add failed');
    expect(git.getStatus.mock.calls.length).toBe(callsBefore);
  });

  it('stageHunk applies the built patch (not reversed) and unstageHunk reverses it', async () => {
    const git = installBridge();
    await useGitPanelStore.getState().refresh('/tmp/repo');
    await useGitPanelStore.getState().selectFile('staged.ts');
    const file = useGitPanelStore.getState().diff![0];
    const hunk = file.hunks[0];
    await useGitPanelStore.getState().stageHunk(file, hunk);
    expect(git.applyHunk).toHaveBeenCalledWith(
      '/tmp/repo',
      expect.stringContaining('@@ -1,1 +1,2 @@'),
      false,
    );
    await useGitPanelStore.getState().unstageHunk(file, hunk);
    expect(git.applyHunk).toHaveBeenLastCalledWith(
      '/tmp/repo',
      expect.stringContaining('@@ -1,1 +1,2 @@'),
      true,
    );
  });
});
