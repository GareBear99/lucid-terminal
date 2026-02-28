import { create } from 'zustand';
import { TerminalTab } from '../types';

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;

  // Actions
  createTab: (cwd?: string) => Promise<string>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabCwd: (id: string, cwd: string) => void;
}

let tabCounter = 0;

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  createTab: async (cwd?: string) => {
    const id = `terminal-${++tabCounter}`;
    const workingDir = cwd || await window.lucidAPI.fs.getHomeDir();

    const newTab: TerminalTab = {
      id,
      title: `Terminal ${tabCounter}`,
      cwd: workingDir,
      isActive: true,
    };

    // Create the PTY process (fail gracefully if terminal can't be created)
    try {
      await window.lucidAPI.terminal.create(id, workingDir);
    } catch (error) {
      console.error(`Failed to create terminal ${id}:`, error);
      // Continue anyway - terminal will show error in UI
    }

    set((state) => ({
      tabs: [...state.tabs.map(t => ({ ...t, isActive: false })), newTab],
      activeTabId: id,
    }));

    return id;
  },

  closeTab: (id) => {
    // Destroy the PTY process
    window.lucidAPI.terminal.destroy(id);

    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        // Activate the previous tab or the next one
        const closedIndex = state.tabs.findIndex((t) => t.id === id);
        if (newTabs.length > 0) {
          const newIndex = Math.max(0, closedIndex - 1);
          newActiveId = newTabs[newIndex].id;
          newTabs[newIndex].isActive = true;
        } else {
          newActiveId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === id })),
      activeTabId: id,
    }));
  },

  updateTabTitle: (id, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  updateTabCwd: (id, cwd) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, cwd } : t)),
    }));
  },
}));
