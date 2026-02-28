import { create } from 'zustand';
import { FileEntry } from '../types';

interface OpenFile {
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
  setCurrentDir: (dir: string) => Promise<void>;
  refreshDir: () => Promise<void>;
  toggleDir: (path: string) => void;
  selectPath: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
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

  setCurrentDir: async (dir) => {
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
      console.log('✅ FileStore: setCurrentDir completed successfully');
    } catch (error) {
      console.error('❌ FileStore: setCurrentDir failed:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  refreshDir: async () => {
    const { currentDir } = get();
    if (currentDir) {
      await get().setCurrentDir(currentDir);
    }
  },

  toggleDir: (path) => {
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedDirs: newExpanded };
    });
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
      return;
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
    } catch (error) {
      set({ error: String(error) });
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
      set({ error: String(error) });
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
      set({ error: String(error) });
    }
  },

  createFolder: async (path) => {
    try {
      await window.lucidAPI.fs.createDir(path);
      await get().refreshDir();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteItem: async (path) => {
    try {
      await window.lucidAPI.fs.delete(path);
      // Close file if it's open
      get().closeFile(path);
      await get().refreshDir();
    } catch (error) {
      set({ error: String(error) });
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
      await get().refreshDir();
    } catch (error) {
      set({ error: String(error) });
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
