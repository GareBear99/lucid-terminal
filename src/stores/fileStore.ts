import { create } from 'zustand';
import { FileEntry } from '../types';
import { useEventLogStore } from './eventLogStore';
import { useToastStore } from './toastStore';

/**
 * Clean an error for display. IPC errors wrap the underlying Node error
 * ("Failed to read directory: Error: ENOENT: ..."); drop the redundant
 * "Error: " markers so the UI reads cleanly. Exported: the Voxel
 * Directory's Local tab (VoxelFileBrowser) shows read failures the
 * same way — one cleaner, not a copy.
 */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Error:\s*/g, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .trim();
}

/**
 * Find an entry by path in a (possibly nested) file tree, or null.
 * `children === undefined` means the directory's children have not
 * been loaded yet (lazy); `children === []` means loaded and empty.
 */
export function findFileEntry(entries: FileEntry[], path: string): FileEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.children) {
      const found = findFileEntry(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** Return a new tree with `children` set on the entry at `path`. */
export function withFileEntryChildren(
  entries: FileEntry[],
  path: string,
  children: FileEntry[],
): FileEntry[] {
  return entries.map((entry) => {
    if (entry.path === path) return { ...entry, children };
    if (entry.children) {
      return { ...entry, children: withFileEntryChildren(entry.children, path, children) };
    }
    return entry;
  });
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface FileState {
  currentDir: string;
  entries: FileEntry[];
  expandedDirs: Set<string>;
  selectedPath: string | null;
  openFiles: OpenFile[];
  activeFilePath: string | null;
  isLoading: boolean;
  error: string | null;
  recentWorkspaces: string[];
  addRecentWorkspace: (path: string) => void;
  removeRecentWorkspace: (path: string) => void;

  // Actions
  clearError: () => void;
  setCurrentDir: (dir: string, origin?: 'startup' | 'user') => Promise<void>;
  refreshDir: () => Promise<void>;
  toggleDir: (path: string) => Promise<void>;
  /** Load a directory's children (top level only) and merge them into the tree. */
  loadChildren: (path: string) => Promise<void>;
  selectPath: (path: string) => void;
  openFile: (path: string) => Promise<boolean>;
  closeFile: (path: string) => void;
  /**
   * Close a file from the UI: if it has unsaved changes, ask first
   * (Discard / Cancel) instead of silently dropping them. Clean files
   * close immediately. Conservative default — a Save / Discard / Cancel
   * prompt is Gary's call (Files scope Q3); until then the confirm
   * tells the user to save first if they want to keep the edits.
   * Internal callers that already handled the content (deleteItem —
   * the file is gone; detachFile — the content moved) use closeFile
   * directly and never go through this.
   */
  closeFileWithConfirm: (path: string) => void;
  /**
   * Detach (Gary, 2026-11-09): drop the file from THIS window's
   * editor WITHOUT touching disk — the file's content (including
   * unsaved edits) transfers to a detached window. The opposite
   * of closeFile only in that the content is handed over, not
   * dropped: closeFile drops dirty content, so the
   * detach caller must move the snapshot first — and the tab X
   * must use closeFileWithConfirm, never closeFile directly.
   */
  detachFile: (path: string) => void;
  /**
   * Add a file that already has content (detach / pop-in):
   * insert it WITHOUT reading disk. Idempotent — adding a file
   * that is already open is a no-op, so a push + a pending fetch
   * delivering the same file twice lands once.
   */
  addDetachedFile: (file: OpenFile) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  renameItem: (oldPath: string, newPath: string) => Promise<void>;
}

export const useFileStore = create<FileState>((set, get) => ({
  currentDir: '',
  entries: [],
  expandedDirs: new Set<string>(),
  selectedPath: null,
  openFiles: [],
  activeFilePath: null,
  isLoading: false,
  error: null,
  recentWorkspaces: JSON.parse(localStorage.getItem('recentWorkspaces') || '[]'),

  clearError: () => {
    set({ error: null });
  },

  setCurrentDir: async (dir, origin: 'startup' | 'user' = 'user') => {
    console.log('💾 FileStore: setCurrentDir called with:', dir);
    set({ isLoading: true, error: null });
    try {
      console.log('💾 FileStore: Reading directory...');
      const entries = await window.lucidAPI.fs.readDir(dir);
      console.log('💾 FileStore: Got', entries.length, 'entries');
      set((state) => {
        // Add to recent workspaces
        const newRecent = [dir, ...state.recentWorkspaces.filter(p => p !== dir)].slice(0, 10);
        localStorage.setItem('recentWorkspaces', JSON.stringify(newRecent));

        console.log('💾 FileStore: Setting state - currentDir:', dir);
        return {
          currentDir: dir,
          entries,
          isLoading: false,
          recentWorkspaces: newRecent
        };
      });
      // Restore children for dirs the user had expanded — the
      // top-level reload replaced the entries, so their loaded
      // children were lost. Re-fetch them (each is one top-level
      // read of that folder; a folder the user explicitly opened
      // prompts once for itself, which is correct).
      const expanded = [...get().expandedDirs];
      await Promise.allSettled(expanded.map((p) => get().loadChildren(p)));
      // Track + diagnose the load: since the 4dd778a fix the
      // startup load reads the top level only (depth 1) — no
      // recursive walk, no TCC prompts. A user folder-open is a
      // session read. (Gary, 2026-11-08 — track when + why.)
      if (origin === 'startup') {
        useEventLogStore.getState().logStartupFileExplorerWalk(dir, 'completed');
      } else {
        useEventLogStore.getState().logDirectoryRead(dir, 'completed');
      }
      console.log('✅ FileStore: setCurrentDir completed successfully');
    } catch (error) {
      console.error('❌ FileStore: setCurrentDir failed:', error);
      const message = errorMessage(error);
      set({ error: message, isLoading: false });
      useToastStore.getState().error(`Could not open folder: ${message}`);
      if (origin === 'startup') {
        useEventLogStore.getState().logStartupFileExplorerWalk(dir, 'failed', message);
      } else {
        useEventLogStore.getState().logDirectoryRead(dir, 'failed', message);
      }
    }
  },

  refreshDir: async () => {
    const { currentDir } = get();
    if (currentDir) {
      await get().setCurrentDir(currentDir);
    }
  },

  loadChildren: async (path) => {
    try {
      const children = await window.lucidAPI.fs.readDir(path);
      set((state) => ({ entries: withFileEntryChildren(state.entries, path, children) }));
    } catch (error) {
      const message = errorMessage(error);
      useToastStore.getState().error(`Could not open folder: ${message}`);
      throw error;
    }
  },

  toggleDir: async (path) => {
    const state = get();
    if (state.expandedDirs.has(path)) {
      // Collapse — no fetch needed.
      const next = new Set(state.expandedDirs);
      next.delete(path);
      set({ expandedDirs: next });
      return;
    }
    // Expand: mark expanded immediately so the chevron responds,
    // then lazily load the children if they were never loaded.
    // The startup load reads only the top level, so a protected
    // folder (Desktop / Documents / Downloads) is only read when
    // the user explicitly expands it — one prompt for that folder,
    // which is correct, instead of three prompts at startup.
    set({ expandedDirs: new Set(state.expandedDirs).add(path) });
    const entry = findFileEntry(get().entries, path);
    if (entry && entry.isDirectory && entry.children === undefined) {
      try {
        await get().loadChildren(path);
      } catch {
        // Loading failed (e.g. access denied) — collapse back so
        // the dir does not sit open and empty. loadChildren already
        // told the user why.
        const next = new Set(get().expandedDirs);
        next.delete(path);
        set({ expandedDirs: next });
      }
    }
  },

  selectPath: (path) => {
    set({ selectedPath: path });
  },

  openFile: async (path) => {
    const { openFiles } = get();

    // Check if file is already open
    const existing = openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activeFilePath: path });
      return true;
    }

    try {
      const content = await window.lucidAPI.fs.readFile(path);
      const name = path.split(/[\\/]/).pop() || path;

      const newFile: OpenFile = {
        path,
        name,
        content,
        originalContent: content,
        isDirty: false,
      };

      set((state) => ({
        openFiles: [...state.openFiles, newFile],
        activeFilePath: path,
      }));
      return true;
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(`Could not open file: ${message}`);
      return false;
    }
  },

  closeFile: (path) => {
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
      let newActivePath = state.activeFilePath;

      if (state.activeFilePath === path) {
        const closedIndex = state.openFiles.findIndex((f) => f.path === path);
        if (newOpenFiles.length > 0) {
          const newIndex = Math.max(0, closedIndex - 1);
          newActivePath = newOpenFiles[newIndex].path;
        } else {
          newActivePath = null;
        }
      }

      return { openFiles: newOpenFiles, activeFilePath: newActivePath };
    });
  },

  closeFileWithConfirm: (path) => {
    const file = get().openFiles.find((f) => f.path === path);
    if (!file) return;
    if (file.isDirty) {
      const discard = window.confirm(
        `"${file.name}" has unsaved changes. Discard them?\n\nSave the file first if you want to keep your changes.`
      );
      if (!discard) return;
    }
    get().closeFile(path);
  },

  detachFile: (path) => {
    // Same removal as closeFile, but the content is handed to a
    // detached window by the caller (files:detach) — nothing is
    // written, nothing is dropped from disk.
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
      let newActivePath = state.activeFilePath;

      if (state.activeFilePath === path) {
        const closedIndex = state.openFiles.findIndex((f) => f.path === path);
        if (newOpenFiles.length > 0) {
          const newIndex = Math.max(0, closedIndex - 1);
          newActivePath = newOpenFiles[newIndex].path;
        } else {
          newActivePath = null;
        }
      }

      return { openFiles: newOpenFiles, activeFilePath: newActivePath };
    });
  },

  addDetachedFile: (file) => {
    set((state) => {
      if (state.openFiles.some((f) => f.path === file.path)) return state;
      return {
        openFiles: [...state.openFiles, { ...file }],
        activeFilePath: file.path,
      };
    });
  },

  setActiveFile: (path) => {
    set({ activeFilePath: path });
  },

  updateFileContent: (path, content) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path
          ? { ...f, content, isDirty: content !== f.originalContent }
          : f
      ),
    }));
  },

  saveFile: async (path) => {
    const { openFiles } = get();
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;

    try {
      await window.lucidAPI.fs.writeFile(path, file.content);
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === path
            ? { ...f, originalContent: f.content, isDirty: false }
            : f
        ),
      }));
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(`Could not save file: ${message}`);
    }
  },

  saveAllFiles: async () => {
    const { openFiles, saveFile } = get();
    const dirtyFiles = openFiles.filter((f) => f.isDirty);
    for (const file of dirtyFiles) {
      await saveFile(file.path);
    }
  },

  createFile: async (path, content = '') => {
    try {
      await window.lucidAPI.fs.createFile(path, content);
      await get().refreshDir();
      await get().openFile(path);
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(message);
    }
  },

  createFolder: async (path) => {
    try {
      await window.lucidAPI.fs.createDir(path);
      await get().refreshDir();
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(message);
    }
  },

  deleteItem: async (path) => {
    try {
      await window.lucidAPI.fs.delete(path);
      // Close file if it's open
      get().closeFile(path);
      // Prune expanded dirs: the deleted folder (and anything inside
      // it) no longer exists. Leaving it in expandedDirs makes the
      // post-delete refresh re-read the dead path and fire a spurious
      // "Could not open folder" toast (live-verified 2026-11-13:
      // deleting an expanded folder flashed the error even though the
      // delete itself worked).
      set((state) => {
        const next = new Set(state.expandedDirs);
        next.delete(path);
        for (const p of [...next]) {
          if (p.startsWith(`${path}/`)) next.delete(p);
        }
        return { expandedDirs: next };
      });
      await get().refreshDir();
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(message);
    }
  },

  renameItem: async (oldPath, newPath) => {
    try {
      await window.lucidAPI.fs.rename(oldPath, newPath);
      // Update open file if it exists
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === oldPath
            ? { ...f, path: newPath, name: newPath.split(/[\\/]/).pop() || newPath }
            : f
        ),
        activeFilePath: state.activeFilePath === oldPath ? newPath : state.activeFilePath,
      }));
      // Remap expanded dirs onto the new path: a renamed folder keeps
      // its expansion — otherwise the refresh re-reads the old (dead)
      // path and fires the same spurious "Could not open folder" toast.
      set((state) => {
        const next = new Set<string>();
        for (const p of state.expandedDirs) {
          if (p === oldPath) next.add(newPath);
          else if (p.startsWith(`${oldPath}/`)) next.add(newPath + p.slice(oldPath.length));
          else next.add(p);
        }
        return { expandedDirs: next };
      });
      await get().refreshDir();
    } catch (error) {
      const message = errorMessage(error);
      set({ error: message });
      useToastStore.getState().error(message);
    }
  },

  addRecentWorkspace: (path) => {
    set((state) => {
      const newRecent = [path, ...state.recentWorkspaces.filter((p) => p !== path)].slice(0, 10);
      localStorage.setItem('recentWorkspaces', JSON.stringify(newRecent));
      return { recentWorkspaces: newRecent };
    });
  },

  removeRecentWorkspace: (path) => {
    set((state) => {
      const newRecent = state.recentWorkspaces.filter((p) => p !== path);
      localStorage.setItem('recentWorkspaces', JSON.stringify(newRecent));
      return { recentWorkspaces: newRecent };
    });
  },
}));
