/**
 * VoxelFileBrowser — the Voxel Directory's Local tab (Iteration 8,
 * Gary 2026-11-12 ~10:43 PST): real local-file browsing inside the
 * glass overlay. Lists and navigates the local filesystem:
 * directories + files, into a directory, back up.
 *
 * Start: the terminal's current working directory (the active tab's
 * cwd — ~/lucid-terminal in Gary's screenshots), with navigation up
 * to home and never above it. A start outside home starts at home
 * instead, so the home bound always holds.
 *
 * File access follows Lucid's EXISTING pattern only (see
 * src/stores/fileStore.ts): window.lucidAPI.fs.readDir, depth 1
 * (top level — no recursive walk, so a protected folder is only
 * ever read when the user explicitly opens it), and every read is
 * logged to the event log (logDirectoryRead, completed/failed) so
 * the access is tracked with when + why, like the file explorer.
 * Nothing here invents privileged access: no new IPC channel, no
 * new permission, no write — listings only. The permission gate
 * (ask-every-time prompt) lives in the overlay, not here: this
 * component only ever mounts when access is already granted.
 *
 * Files are listed and selectable (name + size + modified); a file
 * click selects it — it does not open or edit it. That is the
 * overlay's job for now: going through local files.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry } from '../../types';
import { errorMessage } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useEventLogStore } from '../../stores/eventLogStore';
import {
  displayPath,
  formatFileSize,
  isWithinDir,
  normalizePath,
  parentDir,
} from '../../lib/voxelFileBrowser';

type LucidFs = {
  readDir: (dirPath: string, options?: { depth?: number; maxEntries?: number }) => Promise<FileEntry[]>;
  getHomeDir: () => Promise<string>;
};

function lucidFs(): LucidFs | null {
  const api = (
    window as unknown as {
      lucidAPI?: { fs?: Partial<LucidFs> };
    }
  ).lucidAPI?.fs;
  if (!api || typeof api.readDir !== 'function' || typeof api.getHomeDir !== 'function') {
    return null;
  }
  return api as LucidFs;
}

export function VoxelFileBrowser({ initialDir }: { initialDir?: string }) {
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Stale-response guard: a slow earlier read must never overwrite
  // a newer directory's listing.
  const requestId = useRef(0);
  const homeDirRef = useRef<string | null>(null);

  const loadDir = useCallback(async (dir: string) => {
    const fs = lucidFs();
    if (!fs) {
      setError('Local file browsing is unavailable here.');
      return;
    }
    // Never navigate above home — the Up button is disabled there,
    // but the guard holds for any caller.
    const home = homeDirRef.current;
    if (home && !isWithinDir(dir, home)) return;
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const list = await fs.readDir(dir);
      if (id !== requestId.current) return;
      setEntries(list);
      setCurrentDir(dir);
      setSelectedPath(null);
      useEventLogStore.getState().logDirectoryRead(dir, 'completed');
    } catch (e) {
      if (id !== requestId.current) return;
      const message = errorMessage(e);
      useEventLogStore.getState().logDirectoryRead(dir, 'failed', message);
      // Keep the previous listing: a failed read leaves the user
      // where they were, with the reason — never an empty list
      // that looks like an empty folder.
      setError(`Could not open folder: ${message}`);
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fs = lucidFs();
      if (!fs) {
        setError('Local file browsing is unavailable here.');
        return;
      }
      try {
        const home = await fs.getHomeDir();
        if (cancelled) return;
        homeDirRef.current = home;
        setHomeDir(home);
        // Start at the terminal's current working directory (the
        // active tab's cwd). No tab, or a cwd outside home, starts
        // at home — the home bound always holds.
        let start = initialDir ?? null;
        if (!start) {
          const tabs = useTerminalStore.getState().tabs;
          const active = tabs.find(
            (t) => t.id === useTerminalStore.getState().activeTabId,
          );
          start = active?.cwd ?? home;
        }
        if (!isWithinDir(start, home)) start = home;
        await loadDir(start);
      } catch (e) {
        if (cancelled) return;
        setError(`Could not open folder: ${errorMessage(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount only: the start directory is resolved once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atHome =
    currentDir !== null &&
    homeDir !== null &&
    normalizePath(currentDir) === normalizePath(homeDir);
  const selected = selectedPath
    ? entries.find((e) => e.path === selectedPath) ?? null
    : null;

  return (
    <div data-testid="voxel-file-browser" className="mt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentDir === null || atHome || isLoading}
          onClick={() => {
            if (currentDir) void loadDir(parentDir(currentDir));
          }}
          aria-label="Go up one folder"
          data-testid="voxel-file-up"
          className="rounded-md border border-white/10 px-2 py-1 font-mono text-xs text-[var(--text-primary)] hover:bg-white/10 disabled:opacity-40"
        >
          ↑ Up
        </button>
        <button
          type="button"
          disabled={currentDir === null || atHome || isLoading}
          onClick={() => {
            if (homeDir) void loadDir(homeDir);
          }}
          aria-label="Go to home folder"
          data-testid="voxel-file-home"
          className="rounded-md border border-white/10 px-2 py-1 font-mono text-xs text-[var(--text-primary)] hover:bg-white/10 disabled:opacity-40"
        >
          Home
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]">
          {currentDir === null ? '…' : displayPath(currentDir, homeDir)}
        </span>
      </div>
      {isLoading && (
        <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">Loading…</p>
      )}
      {error !== null && (
        <p
          data-testid="voxel-file-error"
          className="mt-2 font-mono text-xs text-red-300"
        >
          {error}
        </p>
      )}
      {currentDir !== null && !isLoading && entries.length === 0 && error === null && (
        <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
          Empty folder.
        </p>
      )}
      <ul className="mt-2 space-y-0.5 font-mono text-xs text-[var(--text-primary)]">
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => {
                if (entry.isDirectory) {
                  void loadDir(entry.path);
                } else {
                  setSelectedPath(entry.path);
                }
              }}
              aria-label={
                entry.isDirectory
                  ? `Open folder ${entry.name}`
                  : `Select file ${entry.name}`
              }
              data-testid="voxel-file-entry"
              data-path={entry.path}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10 ${
                selectedPath === entry.path ? 'bg-white/10' : ''
              }`}
            >
              <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">
                {entry.isDirectory ? '▸' : '·'}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {entry.name}
                {entry.isDirectory ? '/' : ''}
              </span>
              {!entry.isDirectory && (
                <span className="shrink-0 text-[var(--text-muted)]">
                  {formatFileSize(entry.size)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {selected !== null && (
        <p
          data-testid="voxel-file-selected"
          className="mt-2 truncate font-mono text-xs text-[var(--text-muted)]"
        >
          {selected.name} · {formatFileSize(selected.size)} ·{' '}
          {new Date(selected.modified).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
