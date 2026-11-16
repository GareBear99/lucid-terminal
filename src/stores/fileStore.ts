import { create } from 'zustand';
import { FileEntry } from '../types';
import { useEventLogStore } from './eventLogStore';
import { useToastStore } from './toastStore';
import { useSettingsStore } from './settingsStore';
import { applyWhitespaceOnSave } from '../lib/whitespace';

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

/**
 * Normalise a path once on open (2026-11-15, editor-freeze fix):
 * a `file://` URI (the DocsPanel route) and the Explorer's plain
 * path must dedupe to the same spelling, or the same file opens
 * in two tabs. Strips a `file://` prefix, percent-decodes it, and
 * collapses `.`, `..` and duplicate slashes. Pure strings — no
 * `node:path` (renderer) and no import from agentHost (it imports
 * this store, so importing it back would be a cycle).
 */
export function normalizeOpenPath(rawPath: string): string {
  let path = rawPath;
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length);
    try {
      path = decodeURIComponent(path);
    } catch {
      // Undecodable URI — keep the stripped spelling; the open
      // fails downstream with a real error instead of here.
    }
  }
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

/**
 * Batch form of withFileEntryChildren (files-section fix step 4):
 * apply several folders' children in ONE pass over the tree, so a
 * restore of N expanded dirs costs one rebuild + one set instead of
 * N rebuilds + N re-renders. A path missing from the tree is a
 * no-op; other branches are returned untouched (same object when
 * nothing under them changed). A replaced subtree is itself walked,
 * so a batch that loads both a folder and one of its children lands
 * both in the same pass.
 */
export function withFileEntryChildrenBatch(
  entries: FileEntry[],
  childrenByPath: Map<string, FileEntry[]>,
): FileEntry[] {
  if (childrenByPath.size === 0) return entries;
  return entries.map((entry) => {
    const replacement = childrenByPath.get(entry.path);
    if (replacement !== undefined) {
      return { ...entry, children: withFileEntryChildrenBatch(replacement, childrenByPath) };
    }
    if (entry.children) {
      return { ...entry, children: withFileEntryChildrenBatch(entry.children, childrenByPath) };
    }
    return entry;
  });
}

/**
 * File-open cap (files-section fix step 3): a file at or under
 * this size opens whole; a larger file opens as a read-only
 * preview of its first LARGE_FILE_PREVIEW_BYTES. 2 MB matches
 * the existing git-gutter skip (CodeEditor
 * MAX_GUTTER_BUFFER_BYTES) and the EOL-convert cap.
 */
export const MAX_OPEN_FILE_BYTES = 2 * 1024 * 1024;
/** How much of an over-cap file the read-only preview holds. */
export const LARGE_FILE_PREVIEW_BYTES = 1 * 1024 * 1024;
/** Line cap on the preview, on top of the byte cap — a 1 MB
 * single-line file must not hand Monaco one giant line. */
export const LARGE_FILE_PREVIEW_MAX_LINES = 10_000;

/** Human-readable byte count ('1.0 MB', '3.2 GB') for the
 * preview toast + banner. No src-level formatBytes existed;
 * the electron copies stay where they are. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  /** Read-only preview of a file over MAX_OPEN_FILE_BYTES:
   * content holds only the first LARGE_FILE_PREVIEW_BYTES
   * (capped to LARGE_FILE_PREVIEW_MAX_LINES lines), never the
   * whole file. Set only on truncated opens. */
  isTruncated?: boolean;
  /** The file's full size in bytes; set with isTruncated. */
  fullSize?: number;
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
  setCurrentDir: (dir: string, origin?: 'startup' | 'user' | 'workspace-restore') => Promise<void>;
  refreshDir: () => Promise<void>;
  toggleDir: (path: string) => Promise<void>;
  /** Load a directory's children (top level only) and merge them into the tree. */
  loadChildren: (path: string) => Promise<void>;
  /**
   * Batch form of loadChildren (step 4): fetch several folders'
   * children first, then merge them ALL in one set, so an
   * expanded-dir restore costs one rebuild + one re-render
   * instead of one per folder. A failed child behaves like
   * loadChildren's failure (toast, that folder stays unloaded)
   * and never drops the other folders' children.
   */
  loadChildrenBatch: (paths: string[]) => Promise<void>;
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
  // Guarded: the agent chain (Settings > Agent Permissions
  // imports the tool registry, which imports the file store)
  // must load in a node test environment too, where there is
  // no localStorage at all. Same guard the permission store
  // uses — a missing store reads as "no recent workspaces",
  // never a crash at import time.
  recentWorkspaces:
    typeof localStorage === 'undefined'
      ? []
      : JSON.parse(localStorage.getItem('recentWorkspaces') || '[]'),

  clearError: () => {
    set({ error: null });
  },

  setCurrentDir: async (dir, origin: 'startup' | 'user' | 'workspace-restore' = 'user') => {
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
      await get().loadChildrenBatch(expanded);
      // Track + diagnose the load: since the 4dd778a fix the
      // startup load reads the top level only (depth 1) — no
      // recursive walk, no TCC prompts. A user folder-open is a
      // session read. (Gary, 2026-11-08 — track when + why.)
      if (origin === 'user') {
        useEventLogStore.getState().logDirectoryRead(dir, 'completed');
      } else {
        // 'startup' and 'workspace-restore' are both startup reads.
        useEventLogStore.getState().logStartupFileExplorerWalk(dir, 'completed');
      }
      console.log('✅ FileStore: setCurrentDir completed successfully');
    } catch (error) {
      console.error('❌ FileStore: setCurrentDir failed:', error);
      const message = errorMessage(error);
      set({ error: message, isLoading: false });
      useToastStore.getState().error(`Could not open folder: ${message}`);
      if (origin === 'user') {
        useEventLogStore.getState().logDirectoryRead(dir, 'failed', message);
      } else {
        useEventLogStore.getState().logStartupFileExplorerWalk(dir, 'failed', message);
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

  loadChildrenBatch: async (paths) => {
    // Dedupe: the same expanded path must be read once, not once
    // per entry in expandedDirs (a Set already dedupes, but callers
    // may pass a plain list). An empty batch is a no-op — no read,
    // no set, no re-render.
    const unique = [...new Set(paths)];
    if (unique.length === 0) return;
    // Fetch everything FIRST, then apply it all in ONE set below.
    // A failed child behaves like loadChildren's failure (toast +
    // that folder stays unloaded) and never drops the others.
    const results = await Promise.allSettled(unique.map((p) => window.lucidAPI.fs.readDir(p)));
    const childrenByPath = new Map<string, FileEntry[]>();
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        childrenByPath.set(unique[i], result.value);
      } else {
        const message = errorMessage(result.reason);
        useToastStore.getState().error(`Could not open folder: ${message}`);
      }
    });
    if (childrenByPath.size > 0) {
      set((state) => ({ entries: withFileEntryChildrenBatch(state.entries, childrenByPath) }));
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

  openFile: async (rawPath) => {
    // Normalise once, up front, so every check, read and set below
    // — and every other funnel that calls openFile — uses the one
    // spelling for this file.
    const path = normalizeOpenPath(rawPath);
    const { openFiles } = get();

    // Check if file is already open
    const existing = openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activeFilePath: path });
      return true;
    }

    try {
      const name = path.split(/[\\/]/).pop() || path;

      // Resolve the size FIRST — the tree entry already knows
      // it when the file was listed; otherwise stat it. A stat
      // failure (or a bridge without getStats) falls back to
      // the old whole-read path below, never a refused open.
      let size: number | null = null;
      const entry = findFileEntry(get().entries, path);
      if (entry && entry.size > 0) size = entry.size;
      if (size === null) {
        try {
          const stats = await window.lucidAPI.fs.getStats(path);
          size = typeof stats?.size === 'number' ? stats.size : null;
        } catch {
          size = null;
        }
      }

      if (size !== null && size > MAX_OPEN_FILE_BYTES) {
        // Over the cap: a read-only preview of the head. The
        // whole file never crosses IPC and never reaches
        // Monaco — this is the choke point, so every funnel
        // (Explorer, Finder, terminal /open, FindReplacePanel)
        // is covered here and nowhere else.
        const head = await window.lucidAPI.fs.readFileHead(path, LARGE_FILE_PREVIEW_BYTES);
        // Race re-check (see below): a concurrent open may have
        // appended this file while the head read was in flight.
        if (get().openFiles.some((f) => f.path === path)) {
          set({ activeFilePath: path });
          return true;
        }
        const lines = head.content.split('\n');
        const preview =
          lines.length > LARGE_FILE_PREVIEW_MAX_LINES
            ? lines.slice(0, LARGE_FILE_PREVIEW_MAX_LINES).join('\n')
            : head.content;
        const newFile: OpenFile = {
          path,
          name,
          content: preview,
          originalContent: preview,
          isDirty: false,
          isTruncated: true,
          fullSize: head.fullSize,
        };
        set((state) => ({
          openFiles: [...state.openFiles, newFile],
          activeFilePath: path,
        }));
        useToastStore.getState().info(
          `Opened the first 1 MB of ${name} (${formatBytes(head.fullSize)}) — read-only preview`,
        );
        return true;
      }

      const content = await window.lucidAPI.fs.readFile(path);
      // Race re-check (2026-11-15): the dedupe above ran BEFORE
      // the awaited read, so a double-click opened the file twice.
      // A concurrent open may have appended it while this read was
      // in flight — activate the existing tab instead of appending
      // a duplicate. No await sits between this check and the set
      // below, so the pair is atomic.
      if (get().openFiles.some((f) => f.path === path)) {
        set({ activeFilePath: path });
        return true;
      }
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
          ? f.isTruncated
            ? f // A preview is read-only: never accept edits to it.
            : { ...f, content, isDirty: content !== f.originalContent }
          : f
      ),
    }));
  },

  saveFile: async (path) => {
    const { openFiles } = get();
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;
    if (file.isTruncated) {
      // The full file is not loaded — writing the preview
      // buffer would destroy it. Refuse, never write.
      useToastStore.getState().error(
        'Cannot save a read-only preview — the full file is not loaded',
      );
      return;
    }

    // Whitespace-on-save (Atom steal #20): the enabled
    // transforms run before the write, and the in-memory
    // content is updated to match — the editor shows the
    // trimmed text and the dirty flag clears against it.
    // Off by default; when off the content is untouched.
    const settings = useSettingsStore.getState().settings;
    const content = applyWhitespaceOnSave(file.content, file.path, {
      trimTrailingWhitespace: settings.editorTrimTrailingWhitespaceOnSave === true,
      ensureTrailingNewline: settings.editorEnsureTrailingNewlineOnSave === true,
    });
    if (content !== file.content) {
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === path ? { ...f, content, isDirty: content !== f.originalContent } : f
        ),
      }));
    }

    try {
      await window.lucidAPI.fs.writeFile(path, content);
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === path
            ? { ...f, content, originalContent: content, isDirty: false }
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
