/**
 * The project file index for the fuzzy finder (Atom steal #2 —
 * 2026-11-14).
 *
 * Atom's fuzzy finder builds its index in a background task at
 * activation so the list is warm before first use, reloads on
 * window focus / path change, and hoists the last-opened file to
 * the top (`fuzzy-finder/lib/main.js`, `path-loader.js`,
 * `project-view.js:131-137`). Lucid's shape: the index is a
 * recursive `fs:readDir` from the file store's current directory
 * (which already skips node_modules / .git / dist / build and
 * TCC-protected folders below the root), flattened to file paths,
 * capped so a huge home directory never blocks the UI.
 *
 * In-memory and session-scoped only — nothing persists, so the
 * guest rule holds (the guest's index dies with the session).
 * The readDir call is the only Electron touch; the flattening
 * and the last-opened hoist are pure and unit-tested.
 */

import type { FileEntry } from '../types';

/** How deep the recursive read goes (readDir's depth option). */
export const PROJECT_INDEX_DEPTH = 4;
/** Hard cap on indexed files — a huge tree stops here. */
export const PROJECT_INDEX_MAX_FILES = 5000;

export interface ProjectFileIndexState {
  root: string;
  files: string[];
  indexing: boolean;
  lastOpenedPath: string | null;
}

/** Flatten a readDir tree to file paths, depth-first, in the
 *  order readDir returned them (directories first, then
 *  alphabetical — the order the tree shows). Directories
 *  contribute nothing themselves; only files are indexed. */
export function flattenFileEntries(
  entries: readonly FileEntry[],
  maxFiles: number = PROJECT_INDEX_MAX_FILES,
): string[] {
  const out: string[] = [];
  const walk = (list: readonly FileEntry[]): void => {
    for (const entry of list) {
      if (out.length >= maxFiles) return;
      if (entry.isFile) {
        out.push(entry.path);
      } else if (entry.isDirectory && entry.children) {
        walk(entry.children);
      }
    }
  };
  walk(entries);
  return out;
}

/** The last-opened file goes first (Atom hoists it); the rest
 *  keep their order. A no-op when the path is not indexed. */
export function hoistLastOpened(
  files: readonly string[],
  lastOpenedPath: string | null,
): string[] {
  if (!lastOpenedPath) return [...files];
  const index = files.indexOf(lastOpenedPath);
  if (index <= 0) return [...files];
  return [lastOpenedPath, ...files.slice(0, index), ...files.slice(index + 1)];
}

type Listener = (state: ProjectFileIndexState) => void;

const listeners = new Set<Listener>();

let state: ProjectFileIndexState = {
  root: '',
  files: [],
  indexing: false,
  lastOpenedPath: null,
};

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener({ ...state, files: [...state.files] });
    } catch {
      // A failing subscriber must never break the index.
    }
  }
}

/** The current index state (a copy — callers never mutate it). */
export function getProjectFileIndex(): ProjectFileIndexState {
  return { ...state, files: [...state.files] };
}

/** Subscribe to index changes. Returns an unsubscribe. */
export function subscribeProjectFileIndex(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * (Re)build the index for a root directory. Best-effort: a
 * failed read leaves the previous index in place and clears
 * the indexing flag — the finder shows the stale list, never
 * an error in the user's face. No-op when the root is empty.
 */
export async function refreshProjectFileIndex(root: string): Promise<void> {
  if (!root || state.indexing) return;
  state = { ...state, root, indexing: true };
  emit();
  try {
    const api = window.lucidAPI?.fs;
    if (!api || typeof api.readDir !== 'function') return;
    const entries = await api.readDir(root, { depth: PROJECT_INDEX_DEPTH });
    const files = flattenFileEntries(entries);
    state = {
      ...state,
      files: hoistLastOpened(files, state.lastOpenedPath),
      indexing: false,
    };
  } catch {
    // A failed read keeps the previous list (see above).
    state = { ...state, indexing: false };
  }
  emit();
}

/** Remember a file as last-opened and hoist it to the top. */
export function markProjectFileOpened(path: string): void {
  state = {
    ...state,
    lastOpenedPath: path,
    files: hoistLastOpened(state.files, path),
  };
  emit();
}

/** Test seam: reset the index and the subscribers. */
export function resetProjectFileIndexForTests(): void {
  state = { root: '', files: [], indexing: false, lastOpenedPath: null };
  listeners.clear();
}
