/**
 * The agent host — the contract the loop core talks to
 * (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue's `IDE` interface
 * (`core/index.d.ts:831`): the single most directly
 * portable abstraction in the whole Continue clone. The
 * agent core (loop, tools, index) never touches host APIs
 * directly — it talks only to this interface, and the
 * Electron main/renderer boundary lives behind it. In
 * Lucid the implementation is the renderer host below
 * (`window.lucidAPI.fs` + the file store); the test host
 * is an in-memory fake in tests/agentTestHost.ts.
 *
 * Path rules, stated once here so every tool and the
 * policy gate agree on them:
 * - Paths are absolute POSIX-style paths (the Mac). A tool
 *   argument may be relative — it resolves against the
 *   tab's cwd first, then the workspace root.
 * - `isWithinWorkspace` is a normalized prefix check. A
 *   tool that would touch a path outside the workspace is
 *   blocked by the policy gate AND refused here (defense
 *   in depth — the gate can be wrong, the host cannot).
 * - The host never follows a path that escapes the
 *   workspace through `..` — resolvePath normalizes
 *   `.`/`..` segments in pure strings, so `a/../../etc`
 *   collapses before any check runs.
 */

import type { FileEntry, FileStats } from '../types';
import { useFileStore } from '../stores/fileStore';

/** One open file, as the host sees it. */
export interface AgentOpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
}

export interface AgentHost {
  readDir(dir: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  /** Create a directory (parents included). */
  createDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getStats(path: string): Promise<FileStats>;
  /** The editor's open files (content as edited, not disk). */
  getOpenFiles(): AgentOpenFile[];
  /** The active file's path, or null. */
  getActiveFilePath(): string | null;
  /** The unified diff of the workspace against HEAD (or
   *  of one file when given) — the `git diff` runner in
   *  main (electron/ipc/git.ts). Null when the workspace
   *  is not a git repository (or git is unavailable);
   *  '' when there are no changes. */
  getDiff(cwd: string, filepath?: string): Promise<string | null>;
  /** Open a file in the editor (no-op when already open). */
  openFile(path: string): Promise<boolean>;
  /** Replace an open file's content in the editor store. */
  updateOpenFileContent(path: string, content: string): void;
  /** Save an open file to disk (clears its dirty flag). */
  saveOpenFile(path: string): Promise<void>;
}

/** Normalize a POSIX path in pure strings: collapse `.`,
 *  resolve `..` against the segments before it, drop empty
 *  segments and duplicate slashes. Never escapes the root
 *  — a leading `..` past the root is dropped. */
export function normalizePosixPath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return (absolute ? '/' : '') + parts.join('/');
}

/**
 * Resolve a tool argument to an absolute path: absolute
 * stays; anything else resolves against the tab's cwd
 * first, then the workspace root. `~` expands to the home
 * dir when given (the IPC getHomeDir is the source — the
 * caller passes it in; without it `~` resolves against
 * the workspace root, never against a guessed home).
 */
export function resolveAgentPath(
  candidate: string,
  cwd: string | undefined,
  workspaceRoot: string,
  homeDir?: string,
): string {
  let raw = candidate.trim();
  if (raw.startsWith('~/') && homeDir) {
    raw = `${homeDir}/${raw.slice(2)}`;
  }
  if (raw.startsWith('/')) return normalizePosixPath(raw);
  const base = cwd ? normalizePosixPath(cwd) : normalizePosixPath(workspaceRoot);
  return normalizePosixPath(`${base}/${raw}`);
}

/** True when path is the workspace root or inside it
 *  (normalized prefix check — `/Users/gary2` is NOT inside
 *  `/Users/gary`). */
export function isWithinWorkspace(workspaceRoot: string, path: string): boolean {
  const root = normalizePosixPath(workspaceRoot);
  const target = normalizePosixPath(path);
  if (target === root) return true;
  return target.startsWith(`${root}/`);
}

/** The renderer host: `window.lucidAPI.fs` for disk, the
 *  file store for open files. Every method degrades to a
 *  thrown error when the IPC bridge is absent (tests run
 *  without Electron) — the tool dispatcher turns that into
 *  an error result, never a crash. */
export const electronAgentHost: AgentHost = {
  async readDir(dir: string): Promise<FileEntry[]> {
    return window.lucidAPI.fs.readDir(dir);
  },
  async readFile(path: string): Promise<string> {
    return window.lucidAPI.fs.readFile(path);
  },
  async writeFile(path: string, content: string): Promise<void> {
    await window.lucidAPI.fs.writeFile(path, content);
  },
  async createFile(path: string, content = ''): Promise<void> {
    // Through the file store, not raw IPC: the created file
    // opens in the editor (and the tree refreshes) the same
    // way a user-created file does.
    await useFileStore.getState().createFile(path, content);
  },
  async createDir(path: string): Promise<void> {
    await window.lucidAPI.fs.createDir(path);
  },
  async exists(path: string): Promise<boolean> {
    return window.lucidAPI.fs.exists(path);
  },
  async getStats(path: string): Promise<FileStats> {
    return window.lucidAPI.fs.getStats(path);
  },
  getOpenFiles(): AgentOpenFile[] {
    return useFileStore.getState().openFiles.map((f) => ({
      path: f.path,
      name: f.name,
      content: f.content,
      isDirty: f.isDirty,
    }));
  },
  getActiveFilePath(): string | null {
    return useFileStore.getState().activeFilePath;
  },
  async openFile(path: string): Promise<boolean> {
    return useFileStore.getState().openFile(path);
  },
  updateOpenFileContent(path: string, content: string): void {
    useFileStore.getState().updateFileContent(path, content);
  },
  async saveOpenFile(path: string): Promise<void> {
    await useFileStore.getState().saveFile(path);
  },
  async getDiff(cwd: string, filepath?: string): Promise<string | null> {
    return window.lucidAPI.git.getDiff(cwd, filepath);
  },
};
