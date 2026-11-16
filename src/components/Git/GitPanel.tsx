/**
 * The Git panel (the git panel's local core).
 *
 * Atom's Git tab is a staging area you live in: changed files
 * with stage/unstage, per-hunk stage/unstage, a diff view, and
 * a commit box. This is that shape rebuilt natively — the
 * local-git core only. No GitHub tab: the remote half (login,
 * PRs, issues, reviews, checks) is skipped by design.
 *
 * Mounted in the bottom dock (App.tsx); the palette command
 * `Git: Open Git Panel` shows it, the dock chevron toggles it,
 * the X hides it. The repo is the project root (the file
 * store's current directory); a non-repo shows an empty state,
 * never faked data. Every write refreshes, so the panel never
 * shows a state the repo is not in.
 */
import { useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useGitPanelStore } from '../../stores/gitPanelStore';
import { useFileStore } from '../../stores/fileStore';
import { useDockStore } from '../../stores/dockStore';
import type { PorcelainEntry } from '../../lib/gitStatus';

function FileRow({
  entry,
  selected,
  actionLabel,
  onAction,
  onSelect,
}: {
  entry: PorcelainEntry;
  selected: boolean;
  actionLabel: string;
  onAction: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      data-testid={`git-file-${entry.path}`}
      className={`flex items-center gap-2 px-2 py-1 text-xs cursor-pointer ${
        selected ? 'bg-white/10 text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'
      }`}
      onClick={onSelect}
    >
      <span className="w-6 shrink-0 font-mono text-[10px] text-[var(--text-secondary)]">
        {entry.status}
      </span>
      <span className="flex-1 min-w-0 truncate">{entry.path}</span>
      <button
        data-testid={`git-file-action-${entry.path}`}
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        className="shrink-0 px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function FileSection({
  title,
  entries,
  selectedPath,
  actionLabel,
  onAction,
  onSelect,
}: {
  title: string;
  entries: PorcelainEntry[];
  selectedPath: string | null;
  actionLabel: string;
  onAction: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
        {title} ({entries.length})
      </div>
      {entries.map((entry) => (
        <FileRow
          key={entry.path}
          entry={entry}
          selected={selectedPath === entry.path}
          actionLabel={actionLabel}
          onAction={() => onAction(entry.path)}
          onSelect={() => onSelect(entry.path)}
        />
      ))}
    </div>
  );
}

export function GitPanel() {
  const cwd = useFileStore((s) => s.currentDir);
  const {
    refresh,
    loading,
    error,
    isRepo,
    branch,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    branches,
    selectedPath,
    diff,
    diffLoading,
    commitMessage,
    committing,
    selectFile,
    setCommitMessage,
    stageFile,
    unstageFile,
    stageHunk,
    unstageHunk,
    commit,
    checkoutBranch,
  } = useGitPanelStore();

  useEffect(() => {
    if (cwd) void refresh(cwd);
  }, [cwd, refresh]);

  const isUntrackedSelected =
    selectedPath !== null && untracked.some((e) => e.path === selectedPath);
  const canCommit = commitMessage.trim().length > 0 && staged.length > 0 && !committing;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)]" data-testid="git-panel">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
        <span className="text-sm font-semibold">Git</span>
        {isRepo && (
          <>
            <span className="text-xs text-[var(--text-muted)] font-mono">{branch}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="text-xs text-[var(--text-muted)]">
                ↑{ahead} ↓{behind}
              </span>
            )}
            {branches.length > 1 && (
              <select
                value={branch}
                onChange={(e) => void checkoutBranch(e.target.value)}
                aria-label="Switch branch"
                className="bg-transparent border border-[var(--border)] rounded px-1 py-0.5 text-xs text-[var(--text-muted)] outline-none"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <span className="flex-1" />
        <button
          onClick={() => cwd && void refresh(cwd)}
          title="Refresh git status"
          aria-label="Refresh git status"
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => useDockStore.getState().hideDock('bottom')}
          title="Close Git panel"
          aria-label="Close Git panel"
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-400 border-b border-[var(--border)] shrink-0">
          {error}
        </div>
      )}

      {loading && <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Loading git status…</p>}

      {!loading && !isRepo && (
        <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
          Not a git repository{cwd ? ` — ${cwd}` : ''}. Open a git project to stage, diff, and commit here.
        </p>
      )}

      {!loading && isRepo && (
        <div className="flex flex-1 min-h-0">
          {/* Lists + commit box */}
          <div className="w-80 shrink-0 border-r border-[var(--border)] flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto py-1">
              <FileSection
                title="Staged"
                entries={staged}
                selectedPath={selectedPath}
                actionLabel="Unstage"
                onAction={(path) => void unstageFile(path)}
                onSelect={(path) => void selectFile(path)}
              />
              <FileSection
                title="Unstaged"
                entries={unstaged}
                selectedPath={selectedPath}
                actionLabel="Stage"
                onAction={(path) => void stageFile(path)}
                onSelect={(path) => void selectFile(path)}
              />
              <FileSection
                title="Untracked"
                entries={untracked}
                selectedPath={selectedPath}
                actionLabel="Stage"
                onAction={(path) => void stageFile(path)}
                onSelect={(path) => void selectFile(path)}
              />
              {staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  Working tree clean — nothing to stage.
                </p>
              )}
            </div>
            <div className="border-t border-[var(--border)] p-2 shrink-0">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message…"
                aria-label="Commit message"
                rows={2}
                className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)]"
              />
              <button
                onClick={() => void commit()}
                disabled={!canCommit}
                className="mt-2 w-full px-2 py-1 rounded bg-[var(--accent)] text-white text-xs font-medium disabled:opacity-40"
              >
                {committing ? 'Committing…' : 'Commit'}
              </button>
              {staged.length === 0 && (
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  Stage changes first — a commit needs something staged.
                </p>
              )}
            </div>
          </div>

          {/* Diff view */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {!selectedPath && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
                Select a changed file to see its diff.
              </p>
            )}
            {selectedPath && diffLoading && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)]">Loading diff…</p>
            )}
            {selectedPath && !diffLoading && diff !== null && diff.length === 0 && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
                No changes in {selectedPath} (it may have been staged or reverted — refresh to check).
              </p>
            )}
            {selectedPath && !diffLoading && diff !== null && diff.length > 0 && (
              <div className="py-1">
                {diff.map((file) => (
                  <div key={file.path} className="mb-2">
                    <div className="px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                      {file.path}
                      {file.isNew ? ' (new file)' : ''}
                      {file.isDeleted ? ' (deleted)' : ''}
                    </div>
                    {file.hunks.length === 0 && (
                      <p className="px-3 text-xs text-[var(--text-muted)]">
                        Binary file — stage it file-level only.
                      </p>
                    )}
                    {file.hunks.map((hunk, hi) => (
                      <div key={`${file.path}-${hi}`} className="mb-1">
                        <div className="flex items-center gap-2 px-3 py-0.5 bg-white/5">
                          <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-[var(--text-muted)]">
                            {hunk.header}
                          </span>
                          {!isUntrackedSelected && (
                            <button
                              data-testid={`git-hunk-${hunk.staged ? 'unstage' : 'stage'}-${hi}`}
                              onClick={() =>
                                void (hunk.staged
                                  ? unstageHunk(file, hunk)
                                  : stageHunk(file, hunk))
                              }
                              className="shrink-0 px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
                            >
                              {hunk.staged ? 'Unstage hunk' : 'Stage hunk'}
                            </button>
                          )}
                        </div>
                        {hunk.lines.map((line, li) => (
                          <div
                            key={li}
                            className={`px-3 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all ${
                              line.type === '+'
                                ? 'bg-green-500/10 text-green-300'
                                : line.type === '-'
                                  ? 'bg-red-500/10 text-red-300'
                                  : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {line.type}
                            {line.text}
                            {line.noNewline ? ' ↵ No newline at end of file' : ''}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                {isUntrackedSelected && (
                  <p className="px-3 py-1 text-[11px] text-[var(--text-muted)]">
                    Untracked file — stage the whole file to add it; per-hunk staging needs the file in the index first.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
