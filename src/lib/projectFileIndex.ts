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
 * Project-root awareness (Atom rest, 2026-11-14): the wave-1
 * index rooted at the home dir with depth 4, so files 5 levels
 * deep from /Users/gary — every file under
 * src/components/Settings/ — were invisible to ⌘P
 * ("PermissionsTab" matched nothing, "SecurityTab" only its
 * test). The refresh now seeds from the active file's
 * directory and walks up to the nearest project marker
 * (package.json / .git / …), so the index roots at the
 * project and the depth is measured from there. Depth is 6
 * from the project root (Settings files sit at depth 4);
 * from the home root (no project detected) the same depth
 * applies, still capped at 5,000 files.
 *
 * In-memory and session-scoped only — nothing persists, so the
 * guest rule holds (the guest's index dies with the session).
 * The readDir call is the only Electron touch; the flattening,
 * the last-opened hoist, and the project-root detection are
 * pure and unit-tested.
 */

import type { FileEntry } from '../types';

/** How deep the recursive read goes (readDir's depth option),
 *  measured from the project root. */
export const PROJECT_INDEX_DEPTH = 6;
/** Hard cap on indexed files — a huge tree stops here. */
export const PROJECT_INDEX_MAX_FILES = 5000;

/** Directory entries that mark a project root (Atom: the
 *  added folder). The first ancestor containing one of these
 *  is the index root. */
export const PROJECT_ROOT_MARKERS = [
  'package.json',
  '.git',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'Gemfile',
  'pom.xml',
  'composer.json',
];

/** How far up detectProjectRoot walks from the seed. */
export const PROJECT_ROOT_MAX_UP = 8;

/** The parent directory of a path ('/a/b/c.ts' → '/a/b';
 *  '/c.ts' → '/'). */
export function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/');
  if (index <= 0) return '/';
  return path.slice(0, index);
}

/** Lists the entry names of a directory (one shallow read).
 *  Injected in tests; the default reads through the preload
 *  bridge. A failed read is an empty directory. */
export type ProjectRootLister = (dir: string) => Promise<string[]>;

export async function listDirectoryNames(dir: string): Promise<string[]> {
  try {
    const api = window.lucidAPI?.fs;
    if (!api || typeof api.readDir !== 'function') return [];
    const entries = await api.readDir(dir, { depth: 0 });
    return entries.map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Walk up from a directory to the nearest project root — the
 * first ancestor (the seed itself first) containing a project
 * marker. Returns the seed itself when no marker is found
 * within PROJECT_ROOT_MAX_UP levels (the home-rooted index,
 * as before). Never walks above the filesystem root.
 */
export async function detectProjectRoot(
  seedDir: string,
  listNames: ProjectRootLister = listDirectoryNames,
  maxUp: number = PROJECT_ROOT_MAX_UP,
): Promise<string> {
  let dir = seedDir || '/';
  for (let level = 0; level <= maxUp; level++) {
    let names: string[] = [];
    try {
      names = await listNames(dir);
    } catch {
      // A failed read is an empty directory — keep walking.
      names = [];
    }
    if (names.some((name) => PROJECT_ROOT_MARKERS.includes(name))) {
      return dir;
    }
    const parent = dirnameOf(dir);
    if (parent === dir) return seedDir;
    dir = parent;
  }
  return seedDir;
}

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
 * (Re)build the index for a seed directory. The seed is
 * usually the active file's directory (or the file store's
 * current directory at startup); the index roots at the
 * project detected from it (see detectProjectRoot), so ⌘P
 * reaches files 5 levels deep from home that the wave-1
 * home-rooted index could not. A refresh for the project
 * already indexed is a no-op, so the finder can call this
 * on every open. Best-effort: a failed read leaves the
 * previous index in place and clears the indexing flag — the
 * finder shows the stale list, never an error in the user's
 * face. No-op when the seed is empty or a refresh is in
 * flight.
 */
export async function refreshProjectFileIndex(
  root: string,
  listNames?: ProjectRootLister,
): Promise<void> {
  if (!root || state.indexing) return;
  state = { ...state, indexing: true };
  emit();
  const projectRoot = await detectProjectRoot(root, listNames);
  // Already warm for this project — a re-open is a no-op.
  if (state.root === projectRoot && state.files.length > 0) {
    state = { ...state, indexing: false };
    emit();
    return;
  }
  state = { ...state, root: projectRoot };
  emit();
  try {
    const api = window.lucidAPI?.fs;
    if (!api || typeof api.readDir !== 'function') {
      state = { ...state, indexing: false };
      emit();
      return;
    }
    const entries = await api.readDir(projectRoot, { depth: PROJECT_INDEX_DEPTH });
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
