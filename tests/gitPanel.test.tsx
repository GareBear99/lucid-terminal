// @vitest-environment jsdom
/**
 * The Git panel (Atom steal #21 — the git panel's local core,
 * 2026-11-14): lists, commit box gating, and the diff view
 * with per-hunk actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitPanel } from '../src/components/Git/GitPanel';
import { useGitPanelStore } from '../src/stores/gitPanelStore';
import { useFileStore } from '../src/stores/fileStore';

const DIFF = [
  {
    path: 'unstaged.ts',
    oldPath: 'unstaged.ts',
    isNew: false,
    isDeleted: false,
    oldHeader: 'a/unstaged.ts',
    newHeader: 'b/unstaged.ts',
    hunks: [
      {
        header: '@@ -1,1 +1,2 @@',
        oldStart: 1,
        oldCount: 1,
        newStart: 1,
        newCount: 2,
        lines: [
          { type: ' ', text: 'one' },
          { type: '+', text: 'two' },
        ],
        staged: false,
      },
    ],
  },
];

function seed() {
  useFileStore.setState({ currentDir: '' });
  useGitPanelStore.setState({
    cwd: '/tmp/repo',
    loading: false,
    error: null,
    isRepo: true,
    branch: 'master',
    ahead: 0,
    behind: 0,
    staged: [{ status: 'M ', path: 'staged.ts' }],
    unstaged: [{ status: ' M', path: 'unstaged.ts' }],
    untracked: [{ status: '??', path: 'new.ts' }],
    branches: ['master'],
    selectedPath: 'unstaged.ts',
    diff: DIFF as never,
    diffLoading: false,
    commitMessage: '',
    committing: false,
  });
}

describe('GitPanel', () => {
  beforeEach(() => {
    useGitPanelStore.getState().resetForTests();
    seed();
  });

  it('shows the branch and the three lists with their files', () => {
    render(<GitPanel />);
    expect(screen.getByText('Git')).not.toBeNull();
    expect(screen.getByText('master')).not.toBeNull();
    expect(screen.getByText('Staged (1)')).not.toBeNull();
    expect(screen.getByText('Unstaged (1)')).not.toBeNull();
    expect(screen.getByText('Untracked (1)')).not.toBeNull();
    expect(screen.getByTestId('git-file-staged.ts')).not.toBeNull();
    expect(screen.getByTestId('git-file-new.ts')).not.toBeNull();
  });

  it('the commit button is disabled with an empty message and enabled with one', () => {
    const { rerender } = render(<GitPanel />);
    const button = screen.getByText('Commit') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    useGitPanelStore.setState({ commitMessage: 'fix the thing' });
    rerender(<GitPanel />);
    expect((screen.getByText('Commit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('the diff view shows the hunk lines and a Stage hunk button for an unstaged hunk', () => {
    render(<GitPanel />);
    expect(screen.getByText('@@ -1,1 +1,2 @@')).not.toBeNull();
    expect(screen.getByText('two', { exact: false })).not.toBeNull();
    expect(screen.getByText('Stage hunk')).not.toBeNull();
  });

  it('clicking a file row selects it for the diff view', () => {
    const selectFile = vi.spyOn(useGitPanelStore.getState(), 'selectFile');
    render(<GitPanel />);
    fireEvent.click(screen.getByTestId('git-file-staged.ts'));
    expect(selectFile).toHaveBeenCalledWith('staged.ts');
    selectFile.mockRestore();
  });

  it('a non-repo shows the empty state, never faked data', () => {
    useGitPanelStore.setState({ isRepo: false, staged: [], unstaged: [], untracked: [] });
    render(<GitPanel />);
    expect(screen.getByText(/Not a git repository/)).not.toBeNull();
    expect(screen.queryByTestId('git-file-staged.ts')).toBeNull();
  });
});
