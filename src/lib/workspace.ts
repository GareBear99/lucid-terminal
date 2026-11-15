/**
 * The open-file funnel (Atom steal #14 — 2026-11-14).
 *
 * Atom's workspace opens a file through a deliberate
 * cascade: if the file is already open, reveal it; else if
 * it is inside one of the open project paths, open it; else
 * if it has a path, add it to the project; else open it
 * untitled.
 *
 * Lucid's shape of that cascade (openFileInWorkspace):
 * 1. already open → reveal it (the file store activates),
 *    result 'revealed';
 * 2. inside a known project root → open it, 'opened';
 * 3. has a path but is outside every known project → open
 *    it, then add its directory as a project (most-recent-
 *    first, capped at 10), 'added-project';
 * 4. no path → null. Lucid has no untitled buffers — every
 *    open carries a path (see /new, which creates a real
 *    file) — so the untitled step is unreachable by
 *    construction, documented here rather than faked.
 *
 * A failed open returns null and adds no project: the file
 * was not there to be added. Pure except for the injected
 * deps (the live stores by default) — unit-tested without
 * the bridge.
 */
import { useFileStore } from '../stores/fileStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { dirnameOf } from './projectFileIndex';

export type OpenFileResult = 'revealed' | 'opened' | 'added-project';

export interface OpenFileDeps {
  getOpenFiles: () => string[];
  getProjects: () => string[];
  addProject: (dir: string) => void;
  openFile: (path: string) => Promise<boolean>;
}

function liveDeps(): OpenFileDeps {
  return {
    getOpenFiles: () => useFileStore.getState().openFiles.map((f) => f.path),
    getProjects: () => useWorkspaceStore.getState().projects,
    addProject: (dir) => useWorkspaceStore.getState().addProject(dir),
    openFile: (path) => useFileStore.getState().openFile(path),
  };
}

/** Segment-aware "inside": `/a/b` is inside `/a`, `/a/bc` is not. */
export function isPathInsideDir(dir: string, path: string): boolean {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const d = norm(dir);
  const p = norm(path);
  if (!d || !p) return false;
  return p === d || p.startsWith(`${d}/`);
}

export async function openFileInWorkspace(
  path: string,
  deps: OpenFileDeps = liveDeps(),
): Promise<{ result: OpenFileResult; path: string } | null> {
  if (!path) return null;
  const alreadyOpen = deps.getOpenFiles().includes(path);
  if (alreadyOpen) {
    const ok = await deps.openFile(path);
    return ok ? { result: 'revealed', path } : null;
  }
  const inProject = deps.getProjects().some((project) => isPathInsideDir(project, path));
  const ok = await deps.openFile(path);
  if (!ok) return null;
  if (inProject) return { result: 'opened', path };
  deps.addProject(dirnameOf(path));
  return { result: 'added-project', path };
}
