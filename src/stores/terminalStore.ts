import { create } from 'zustand';
import { TerminalTab } from '../types';
import { useToastStore } from './toastStore';
import { useHistoryStore } from './historyStore';

/**
 * Clean a spawn error for display. IPC errors wrap the underlying error
 * ("Error invoking remote method 'terminal:create': Error: spawn ENOTDIR");
 * drop the boilerplate so the UI reads cleanly.
 */
function cleanSpawnError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Error:\s*/g, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .trim();
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  // Synchronous spawn failures (bad cwd): spawn() throws before any
  // terminal exists, so there is no onData/onExit event to surface. The
  // message is recorded here so the Terminal can show it.
  createErrors: Record<string, string>;

  // Actions
  createTab: (cwd?: string) => Promise<string>;
  closeTab: (id: string) => void;
  clearCreateError: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabCwd: (id: string, cwd: string) => void;
}

let tabCounter = 0;

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,
  createErrors: {},

  createTab: async (cwd?: string) => {
    const id = `terminal-${++tabCounter}`;
    const workingDir = cwd || await window.lucidAPI.fs.getHomeDir();

    const newTab: TerminalTab = {
      id,
      title: `Terminal ${tabCounter}`,
      cwd: workingDir,
      isActive: true,
    };

    // Create the PTY process (fail gracefully if terminal can't be created).
    // A synchronous spawn throw (bad cwd) rejects here with no onData /
    // onExit event, so record it for the Terminal to display.
    try {
      await window.lucidAPI.terminal.create(id, workingDir);
    } catch (error) {
      console.error(`Failed to create terminal ${id}:`, error);
      const message = cleanSpawnError(error);
      set((state) => ({ createErrors: { ...state.createErrors, [id]: message } }));
      useToastStore.getState().error(`Terminal failed to start: ${message}`);
    }

    set((state) => ({
      tabs: [...state.tabs.map(t => ({ ...t, isActive: false })), newTab],
      activeTabId: id,
    }));

    return id;
  },

  clearCreateError: (id) => {
    set((state) => {
      const createErrors = { ...state.createErrors };
      delete createErrors[id];
      return { createErrors };
    });
  },

  closeTab: (id) => {
    // Destroy the PTY process
    window.lucidAPI.terminal.destroy(id);
    // Drop the tab's chats too — its blocks must not linger in the
    // Sidebar's History after the tab is gone.
    useHistoryStore.getState().removeTab(id);

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

      const createErrors = { ...state.createErrors };
      delete createErrors[id];
      return { tabs: newTabs, activeTabId: newActiveId, createErrors };
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
