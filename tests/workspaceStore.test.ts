// @vitest-environment jsdom
/**
 * Workspace persistence — store tests.
 * jsdom provides the localStorage the store persists into.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useWorkspaceStore,
  readSavedWorkspace,
  workspaceStorageKey,
  WORKSPACE_VERSION,
  type WorkspaceState,
} from '../src/stores/workspaceStore';
import { useFileStore } from '../src/stores/fileStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useEditorStatusStore } from '../src/stores/editorStatusStore';

const PROFILE_ID = 'test-profile';

function savedState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    projects: ['/home/test/proj'],
    openFiles: ['/home/test/proj/a.ts', '/home/test/proj/b.ts'],
    activeFile: '/home/test/proj/b.ts',
    cursors: { '/home/test/proj/b.ts': { line: 12, column: 5 } },
    terminalCwds: ['/home/test/proj'],
    currentDir: '/home/test/proj',
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('workspaceStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.getState().resetForTests();
    useFileStore.setState({ openFiles: [], activeFilePath: null, currentDir: '', error: null });
    useEditorStatusStore.getState().resetForTests();
    // The store keys on the active profile; pin the test profile.
    useProfileStore.setState({ activeProfileId: PROFILE_ID });
    // The file store reads through the bridge in this test.
    (window as unknown as { lucidAPI: unknown }).lucidAPI = {
      fs: {
        readFile: async (path: string) => `content of ${path}`,
        readDir: async () => [],
      },
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  it('addProject keeps most-recent-first, dedups, caps at 10', () => {
    const api = useWorkspaceStore.getState();
    for (let i = 0; i < 12; i++) api.addProject(`/proj/${i}`);
    const projects = useWorkspaceStore.getState().projects;
    expect(projects).toHaveLength(10);
    expect(projects[0]).toBe('/proj/11');
    expect(projects).not.toContain('/proj/0');
    expect(projects).not.toContain('/proj/1');
    api.addProject('/proj/5');
    expect(useWorkspaceStore.getState().projects[0]).toBe('/proj/5');
    expect(useWorkspaceStore.getState().projects).toHaveLength(10);
  });

  it('saveNow persists the capture under the active profile key', async () => {
    const files = useFileStore.getState();
    await files.openFile('/home/test/proj/a.ts');
    useWorkspaceStore.getState().addProject('/home/test/proj');
    useWorkspaceStore.getState().saveNow();
    const saved = readSavedWorkspace(PROFILE_ID);
    expect(saved?.openFiles).toEqual(['/home/test/proj/a.ts']);
    expect(saved?.activeFile).toBe('/home/test/proj/a.ts');
    expect(saved?.projects).toEqual(['/home/test/proj']);
    expect(saved?.version).toBe(WORKSPACE_VERSION);
    // A different profile reads nothing.
    expect(readSavedWorkspace('other-profile')).toBeNull();
  });

  it('restore reopens the saved files, activates the saved file, restores the dir', async () => {
    localStorage.setItem(
      workspaceStorageKey(PROFILE_ID),
      JSON.stringify(savedState()),
    );
    const result = await useWorkspaceStore.getState().restore();
    expect(result.restored).toBe(true);
    expect(result.files).toBe(2);
    expect(result.activeFile).toBe('/home/test/proj/b.ts');
    expect(useFileStore.getState().openFiles.map((f) => f.path)).toEqual([
      '/home/test/proj/a.ts',
      '/home/test/proj/b.ts',
    ]);
    expect(useFileStore.getState().activeFilePath).toBe('/home/test/proj/b.ts');
    expect(useFileStore.getState().currentDir).toBe('/home/test/proj');
    expect(useWorkspaceStore.getState().projects).toEqual(['/home/test/proj']);
  });

  it('restore skips a file that is gone and still restores the rest', async () => {
    (window as unknown as { lucidAPI: { fs: { readFile: unknown; readDir: unknown } } }).lucidAPI.fs.readFile = async (path: string) => {
      if (path.endsWith('b.ts')) throw new Error('ENOENT');
      return 'content';
    };
    localStorage.setItem(
      workspaceStorageKey(PROFILE_ID),
      JSON.stringify(savedState()),
    );
    const result = await useWorkspaceStore.getState().restore();
    expect(result.restored).toBe(true);
    expect(result.files).toBe(1);
    expect(useFileStore.getState().openFiles.map((f) => f.path)).toEqual([
      '/home/test/proj/a.ts',
    ]);
  });

  it('restore with no saved workspace is a quiet no-op (first launch)', async () => {
    const result = await useWorkspaceStore.getState().restore();
    expect(result).toEqual({ restored: false, reason: 'no-saved-workspace' });
    expect(useFileStore.getState().openFiles).toEqual([]);
  });

  it('restore runs once per session', async () => {
    localStorage.setItem(
      workspaceStorageKey(PROFILE_ID),
      JSON.stringify(savedState()),
    );
    await useWorkspaceStore.getState().restore();
    const second = await useWorkspaceStore.getState().restore();
    expect(second).toEqual({ restored: false, reason: 'already-restored' });
  });

  it('a malformed saved workspace reads as none', () => {
    localStorage.setItem(workspaceStorageKey(PROFILE_ID), '{"version": 99}');
    expect(readSavedWorkspace(PROFILE_ID)).toBeNull();
    localStorage.setItem(workspaceStorageKey(PROFILE_ID), 'not json{');
    expect(readSavedWorkspace(PROFILE_ID)).toBeNull();
  });

  it('the guest veil: entering flushes, clears projects, blocks saves; exiting restores', async () => {
    const files = useFileStore.getState();
    await files.openFile('/home/test/proj/a.ts');
    useWorkspaceStore.getState().addProject('/home/test/proj');
    useWorkspaceStore.getState().saveNow();
    expect(readSavedWorkspace(PROFILE_ID)?.openFiles).toEqual(['/home/test/proj/a.ts']);

    useWorkspaceStore.getState().enterGuestSession();
    expect(useWorkspaceStore.getState().projects).toEqual([]);
    expect(useWorkspaceStore.getState().guestVeiled).toBe(true);
    // A guest save is a no-op — the owner's key is untouched.
    useWorkspaceStore.getState().addProject('/guest/proj');
    useWorkspaceStore.getState().saveNow();
    expect(readSavedWorkspace(PROFILE_ID)?.projects).toEqual(['/home/test/proj']);
    expect(await useWorkspaceStore.getState().restore()).toEqual({
      restored: false,
      reason: 'guest',
    });

    useWorkspaceStore.getState().exitGuestSession();
    expect(useWorkspaceStore.getState().guestVeiled).toBe(false);
    expect(useWorkspaceStore.getState().projects).toEqual(['/home/test/proj']);
  });

  it('switchProfile flushes the outgoing profile and loads the incoming one', async () => {
    const files = useFileStore.getState();
    await files.openFile('/home/test/proj/a.ts');
    useWorkspaceStore.getState().addProject('/home/test/proj');
    // First load: profile A.
    useWorkspaceStore.getState().switchProfile(PROFILE_ID);
    expect(useWorkspaceStore.getState().projects).toEqual([]);
    // Save under A, then switch to B (which has a saved workspace).
    useWorkspaceStore.getState().addProject('/home/test/proj');
    localStorage.setItem(
      workspaceStorageKey('profile-b'),
      JSON.stringify(savedState({ projects: ['/home/test/b-proj'], openFiles: [] })),
    );
    useWorkspaceStore.getState().switchProfile('profile-b');
    expect(readSavedWorkspace(PROFILE_ID)?.projects).toEqual(['/home/test/proj']);
    expect(useWorkspaceStore.getState().projects).toEqual(['/home/test/b-proj']);
  });

  it('tracking records the cursor and schedules a debounced save', async () => {
    useWorkspaceStore.getState().startTracking();
    useEditorStatusStore.getState().publish({
      filePath: '/home/test/proj/a.ts',
      lineNumber: 7,
      column: 3,
    });
    expect(useWorkspaceStore.getState().cursors['/home/test/proj/a.ts']).toEqual({
      line: 7,
      column: 3,
    });
    // The save is debounced, not immediate.
    expect(readSavedWorkspace(PROFILE_ID)).toBeNull();
    vi.advanceTimersByTime(600);
    expect(readSavedWorkspace(PROFILE_ID)?.cursors['/home/test/proj/a.ts']).toEqual({
      line: 7,
      column: 3,
    });
  });
});
