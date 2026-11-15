/**
 * Workspace persistence (Atom steal #14 — 2026-11-14).
 *
 * Atom's workspace (workspace.coffee, 1,148 lines) remembers
 * which projects, which panes, which files are open and the
 * cursor position, between restarts. Lucid's shape of that:
 * one WorkspaceState per profile, persisted in localStorage
 * (the file store's recentWorkspaces already persists this
 * way), captured live from the file / terminal / editor-status
 * stores and restored on startup.
 *
 * What restores today: the project list, the open files (in
 * order, missing files skipped silently), the active file,
 * its saved cursor (via the sticky editor-jump bus), and the
 * current directory. What is CAPTURED but not yet restored:
 * the terminal tab cwds — panes need the PaneAxis tree +
 * PTY creation ordering, their own pass; the data is already
 * in the saved state for it. The startup tab stays the
 * landing: restore never switches the view to the editor.
 *
 * Guest veil (the planStore pattern): entering a guest
 * session flushes the owner's workspace first, then stashes
 * the projects and stops all saves — a guest never reads the
 * owner's workspace and never persists over it. Exiting
 * restores the stash. Profiles are segregated by key
 * (`lucid.workspace.v1:<profileId>`); switching profiles
 * flushes the outgoing profile's state and loads the
 * incoming profile's projects.
 *
 * Known limit, documented not hidden: the editor's open
 * files are global (the file store does not switch per
 * profile), so a mid-session profile switch followed by
 * edits saves the shared file list under the new profile.
 * The projects list is the part that truly switches.
 */
import { create } from 'zustand';
import { useFileStore } from './fileStore';
import { useTerminalStore } from './terminalStore';
import { useEditorStatusStore } from './editorStatusStore';
import { useProfileStore } from './profileStore';
import { requestEditorJump } from '../lib/editorJump';

/** The saved-workspace format version (a mismatch reads as "no workspace"). */
export const WORKSPACE_VERSION = 1;

export interface WorkspaceCursor {
  line: number;
  column: number;
}

/** Everything Atom's workspace remembers, in Lucid's shape. */
export interface WorkspaceState {
  version: typeof WORKSPACE_VERSION;
  /** Project roots, most-recent-first, capped at 10. */
  projects: string[];
  /** Open file paths, in open order. */
  openFiles: string[];
  /** The active file path, or null. */
  activeFile: string | null;
  /** Last-known cursor per open file. */
  cursors: Record<string, WorkspaceCursor>;
  /** Terminal tab cwds, in tab order — captured, restore deferred (see the header). */
  terminalCwds: string[];
  /** The file explorer's current directory. */
  currentDir: string;
  /** When this state was saved (ISO). */
  savedAt: string;
}

export const WORKSPACE_MAX_PROJECTS = 10;
/** Debounce on the live-capture save (a cursor move must not write on every keystroke). */
export const WORKSPACE_SAVE_DEBOUNCE_MS = 500;

const WORKSPACE_STORAGE_PREFIX = 'lucid.workspace.v1';

export function workspaceStorageKey(profileId: string): string {
  return `${WORKSPACE_STORAGE_PREFIX}:${profileId}`;
}

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Read + validate a saved workspace; anything malformed reads as "none". */
export function readSavedWorkspace(profileId: string): WorkspaceState | null {
  if (!storageAvailable() || !profileId) return null;
  try {
    const raw = localStorage.getItem(workspaceStorageKey(profileId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const state = parsed as Partial<WorkspaceState>;
    if (state.version !== WORKSPACE_VERSION) return null;
    if (!Array.isArray(state.projects) || !Array.isArray(state.openFiles)) return null;
    if (!Array.isArray(state.terminalCwds) || typeof state.currentDir !== 'string') return null;
    return {
      version: WORKSPACE_VERSION,
      projects: state.projects.filter((p): p is string => typeof p === 'string'),
      openFiles: state.openFiles.filter((p): p is string => typeof p === 'string'),
      activeFile: typeof state.activeFile === 'string' ? state.activeFile : null,
      cursors:
        typeof state.cursors === 'object' && state.cursors !== null
          ? (state.cursors as Record<string, WorkspaceCursor>)
          : {},
      terminalCwds: state.terminalCwds.filter((p): p is string => typeof p === 'string'),
      currentDir: state.currentDir,
      savedAt: typeof state.savedAt === 'string' ? state.savedAt : '',
    };
  } catch {
    return null;
  }
}

function writeSavedWorkspace(profileId: string, state: WorkspaceState): void {
  if (!storageAvailable() || !profileId) return;
  try {
    localStorage.setItem(workspaceStorageKey(profileId), JSON.stringify(state));
  } catch {
    // A full or unavailable store never breaks the session.
  }
}

export interface WorkspaceRestoreResult {
  restored: boolean;
  reason: 'ok' | 'guest' | 'already-restored' | 'no-saved-workspace' | 'error';
  files?: number;
  activeFile?: string | null;
}

interface WorkspaceStoreState {
  /** The project roots for the loaded profile, most-recent-first. */
  projects: string[];
  /** Last-known cursor per open file (in-memory; persisted with the state). */
  cursors: Record<string, WorkspaceCursor>;
  /** The profile whose workspace is loaded ('' until restore/switchProfile). */
  profileId: string;
  loaded: boolean;
  /** True once restore() has run this session (StrictMode-safe guard). */
  restored: boolean;
  /** True while a guest session is veiling the owner's workspace. */
  guestVeiled: boolean;
  /** The owner's projects, stashed while veiled. */
  guestStash: string[] | null;
  /** True once startTracking() has subscribed (idempotent). */
  tracking: boolean;

  /** Add a project root, most-recent-first, capped at 10. */
  addProject: (dir: string) => void;
  /** Drop a project root. */
  removeProject: (dir: string) => void;
  /** Snapshot the live stores into a WorkspaceState (null while veiled). */
  capture: () => WorkspaceState | null;
  /** Persist the capture now (no-op while veiled). */
  saveNow: () => void;
  /** Persist the capture after the debounce (no-op while veiled). */
  scheduleSave: () => void;
  /** Restore the active profile's saved workspace (startup). */
  restore: () => Promise<WorkspaceRestoreResult>;
  /** Subscribe to the file/terminal/editor-status stores; idempotent. */
  startTracking: () => void;
  /** The planStore guest-veil trio, same shape. */
  enterGuestSession: () => void;
  exitGuestSession: () => void;
  switchProfile: (nextProfileId: string) => void;
  /** Test-only reset. */
  resetForTests: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  projects: [],
  cursors: {},
  profileId: '',
  loaded: false,
  restored: false,
  guestVeiled: false,
  guestStash: null,
  tracking: false,

  addProject: (dir) => {
    if (!dir) return;
    // A guest's projects land in the in-memory list only —
    // scheduleSave is a no-op while veiled, so they never persist.
    set((state) => ({
      projects: [dir, ...state.projects.filter((p) => p !== dir)].slice(0, WORKSPACE_MAX_PROJECTS),
    }));
    get().scheduleSave();
  },

  removeProject: (dir) => {
    set((state) => ({ projects: state.projects.filter((p) => p !== dir) }));
    get().scheduleSave();
  },

  capture: () => {
    if (get().guestVeiled) return null;
    const files = useFileStore.getState();
    const terminal = useTerminalStore.getState();
    return {
      version: WORKSPACE_VERSION,
      projects: get().projects,
      openFiles: files.openFiles.map((f) => f.path),
      activeFile: files.activeFilePath,
      cursors: get().cursors,
      terminalCwds: [...new Set(terminal.tabs.map((t) => t.cwd).filter(Boolean))],
      currentDir: files.currentDir,
      savedAt: new Date().toISOString(),
    };
  },

  saveNow: () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (get().guestVeiled) return;
    const captured = get().capture();
    if (!captured) return;
    const profileId = get().profileId || useProfileStore.getState().activeProfileId;
    if (!profileId) return;
    writeSavedWorkspace(profileId, captured);
  },

  scheduleSave: () => {
    if (get().guestVeiled) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      get().saveNow();
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  },

  restore: async () => {
    if (get().guestVeiled) return { restored: false, reason: 'guest' };
    if (get().restored) return { restored: false, reason: 'already-restored' };
    set({ restored: true });
    const profileId = useProfileStore.getState().activeProfileId;
    if (!profileId) return { restored: false, reason: 'no-saved-workspace' };
    const saved = readSavedWorkspace(profileId);
    if (!saved) return { restored: false, reason: 'no-saved-workspace' };
    set({ projects: saved.projects, cursors: saved.cursors, profileId, loaded: true });
    try {
      const files = useFileStore.getState();
      let opened = 0;
      for (const path of saved.openFiles) {
        // A missing file is skipped, never fatal — the file
        // may have moved or been deleted since the save.
        if (await files.openFile(path)) opened += 1;
      }
      if (saved.activeFile) {
        await files.openFile(saved.activeFile);
        const cursor = saved.cursors[saved.activeFile];
        if (cursor) {
          // Sticky: waits for the editor mount / active file.
          requestEditorJump({
            path: saved.activeFile,
            lineNumber: cursor.line,
            column: cursor.column,
          });
        }
      }
      if (saved.currentDir) {
        await files.setCurrentDir(saved.currentDir, 'workspace-restore');
      }
      return { restored: true, reason: 'ok', files: opened, activeFile: saved.activeFile };
    } catch {
      return { restored: false, reason: 'error' };
    }
  },

  startTracking: () => {
    if (get().tracking) return;
    set({ tracking: true });
    // The snapshot the tracking compares: anything in it
    // changing schedules a debounced save. The editor-status
    // store publishes on every cursor move (debounced 150 ms
    // upstream), so the cursor map updates here and the
    // persist stays debounced.
    let lastSnapshot = '';
    const snapshot = (): string => {
      const files = useFileStore.getState();
      const terminal = useTerminalStore.getState();
      return JSON.stringify({
        files: files.openFiles.map((f) => f.path),
        active: files.activeFilePath,
        dir: files.currentDir,
        tabs: terminal.tabs.map((t) => t.cwd),
      });
    };
    const check = () => {
      const next = snapshot();
      if (next === lastSnapshot) return;
      lastSnapshot = next;
      get().scheduleSave();
    };
    useFileStore.subscribe(check);
    useTerminalStore.subscribe(check);
    useEditorStatusStore.subscribe((status) => {
      if (!status.filePath) return;
      const filePath = status.filePath;
      const cursor = { line: status.lineNumber, column: status.column };
      const prev = get().cursors[filePath];
      if (prev && prev.line === cursor.line && prev.column === cursor.column) return;
      set((state) => ({
        cursors: { ...state.cursors, [filePath]: cursor },
      }));
      get().scheduleSave();
    });
    lastSnapshot = snapshot();
  },

  enterGuestSession: () => {
    const state = get();
    if (state.guestVeiled) return;
    // Flush the owner's workspace BEFORE veiling: a write
    // pending from an action seconds ago must land now — the
    // guest guard would drop it, and quitting during the guest
    // session would otherwise lose it.
    state.saveNow();
    set({
      guestVeiled: true,
      guestStash: state.projects,
      projects: [],
    });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestVeiled) return;
    set({
      guestVeiled: false,
      guestStash: null,
      projects: state.guestStash ?? [],
    });
  },

  switchProfile: (nextProfileId) => {
    const state = get();
    if (state.guestVeiled) return;
    if (state.loaded && state.profileId === nextProfileId) return;
    // Flush the outgoing profile's workspace first (the
    // first load has nothing to flush).
    if (state.loaded && state.profileId) {
      state.saveNow();
    }
    const saved = readSavedWorkspace(nextProfileId);
    set({
      projects: saved?.projects ?? [],
      cursors: saved?.cursors ?? {},
      profileId: nextProfileId,
      loaded: true,
    });
  },

  resetForTests: () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({
      projects: [],
      cursors: {},
      profileId: '',
      loaded: false,
      restored: false,
      guestVeiled: false,
      guestStash: null,
      tracking: false,
    });
  },
}));
