/**
 * File explorer startup — no more 3 file prompts (Gary, 2026-11-08).
 *
 * The startup file-explorer load used to read the whole home
 * directory RECURSIVELY (`fs:readDir` walked the entire tree), so
 * macOS prompted once for Desktop, once for Documents, once for
 * Downloads — three prompts, one per TCC-protected folder, on
 * every startup. These tests pin the fix:
 *
 * - `fs:readDir` defaults to depth 1 (top level only) — the startup
 *   load never descends into a protected folder, so it prompts
 *   zero times.
 * - Deeper reads still skip Desktop / Documents / Downloads /
 *   Library below the root (defense in depth) — a recursive read
 *   from the home directory must not silently walk into them.
 * - A folder the user explicitly opens AS the root is still listed
 *   and recursed — one prompt for that folder, which is correct.
 * - The explorer lazy-loads children on expand (toggleDir fetches
 *   them), and setCurrentDir restores expanded dirs' children.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

/** Fake directory tree, keyed by absolute path. */
const FAKE_TREE: Record<string, { name: string; isDir: boolean }[]> = {
  '/home/testuser': [
    { name: 'Desktop', isDir: true },
    { name: 'Documents', isDir: true },
    { name: 'Downloads', isDir: true },
    { name: 'Library', isDir: true },
    { name: 'Projects', isDir: true },
    { name: 'notes.txt', isDir: false },
  ],
  '/home/testuser/Desktop': [{ name: 'notes.txt', isDir: false }],
  '/home/testuser/Documents': [{ name: 'resume.pdf', isDir: false }],
  '/home/testuser/Downloads': [{ name: 'installer.dmg', isDir: false }],
  '/home/testuser/Library': [{ name: 'Mail', isDir: true }],
  '/home/testuser/Library/Mail': [{ name: 'inbox.mbox', isDir: false }],
  '/home/testuser/Projects': [
    { name: 'app', isDir: true },
    { name: 'README.md', isDir: false },
  ],
  '/home/testuser/Projects/app': [{ name: 'main.ts', isDir: false }],
};

const readdirCalls: string[] = [];

vi.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    readdir: vi.fn(async (dirPath: string) => {
      readdirCalls.push(dirPath);
      const entries = FAKE_TREE[dirPath];
      if (!entries) {
        const err = new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDir,
        isFile: () => !e.isDir,
      }));
    }),
    stat: vi.fn(async () => ({ size: 100, mtimeMs: 1000 })),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
  },
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
}));

import { setupFileSystemHandlers, TCC_PROTECTED_DIR_NAMES } from '../electron/ipc/fileSystem';

/**
 * The file store reads `localStorage` at module scope (its initial
 * state restores recent workspaces), so the stub must exist before
 * any dynamic import of the store — a per-test stub is too late.
 */
const storedLocalStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storedLocalStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storedLocalStorage.set(key, value);
  },
  removeItem: (key: string) => {
    storedLocalStorage.delete(key);
  },
});

type Handler = (...args: unknown[]) => Promise<unknown>;

let handlers: Record<string, Handler> = {};

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers[channel] = handler;
  }),
} as unknown as IpcMain;

const HOME = '/home/testuser';
const PROTECTED = ['Desktop', 'Documents', 'Downloads', 'Library'].map((n) => `${HOME}/${n}`);

beforeEach(() => {
  handlers = {};
  readdirCalls.length = 0;
  vi.clearAllMocks();
  setupFileSystemHandlers(mockIpcMain);
});

describe('fs:readDir — the 3 startup prompts', () => {
  it('defaults to depth 1: top level only, no protected folder is ever read', async () => {
    const readDir = handlers['fs:readDir'];
    const entries = (await readDir({}, HOME)) as { name: string; isDirectory: boolean; children?: unknown[] }[];

    expect(entries.map((e) => e.name)).toEqual([
      'Desktop',
      'Documents',
      'Downloads',
      'Library',
      'Projects',
      'notes.txt',
    ]);
    // Directories carry no children at depth 1 — they load on expand.
    for (const entry of entries.filter((e) => e.isDirectory)) {
      expect(entry.children).toBeUndefined();
    }
    // The startup load touched ONLY the home dir itself.
    expect(readdirCalls).toEqual([HOME]);
    for (const protectedPath of PROTECTED) {
      expect(readdirCalls).not.toContain(protectedPath);
    }
  });

  it('deeper reads still skip the protected folders below the root', async () => {
    const readDir = handlers['fs:readDir'];
    const entries = (await readDir({}, HOME, { depth: 10 })) as {
      name: string;
      path: string;
      isDirectory: boolean;
      children?: { name: string }[];
    }[];

    // A normal subdir IS recursed into.
    const projects = entries.find((e) => e.name === 'Projects');
    expect(projects?.children?.map((c) => c.name)).toEqual(['app', 'README.md']);
    expect(readdirCalls).toContain(`${HOME}/Projects`);
    expect(readdirCalls).toContain(`${HOME}/Projects/app`);
    // The protected folders are listed but never descended into.
    for (const name of ['Desktop', 'Documents', 'Downloads', 'Library']) {
      const entry = entries.find((e) => e.name === name);
      expect(entry).toBeDefined();
      expect(entry?.children).toBeUndefined();
    }
    for (const protectedPath of PROTECTED) {
      expect(readdirCalls).not.toContain(protectedPath);
    }
    expect(readdirCalls).not.toContain(`${HOME}/Library/Mail`);
  });

  it('a protected folder opened as the root IS listed and recursed', async () => {
    const readDir = handlers['fs:readDir'];
    const entries = (await readDir({}, `${HOME}/Desktop`, { depth: 10 })) as {
      name: string;
      children?: unknown[];
    }[];

    expect(entries.map((e) => e.name)).toEqual(['notes.txt']);
    // The root itself was read (the user explicitly opened it).
    expect(readdirCalls).toContain(`${HOME}/Desktop`);
  });

  it('names the four protected folders', () => {
    expect([...TCC_PROTECTED_DIR_NAMES]).toEqual([
      'Desktop',
      'Documents',
      'Downloads',
      'Library',
    ]);
  });
});

describe('file tree helpers', () => {
  it('findFileEntry finds a nested entry and returns null when missing', async () => {
    const { findFileEntry } = await import('../src/stores/fileStore');
    const tree = [
      {
        name: 'Projects',
        path: '/home/testuser/Projects',
        isDirectory: true,
        isFile: false,
        size: 0,
        modified: 0,
        children: [
          {
            name: 'app',
            path: '/home/testuser/Projects/app',
            isDirectory: true,
            isFile: false,
            size: 0,
            modified: 0,
            children: [
              {
                name: 'main.ts',
                path: '/home/testuser/Projects/app/main.ts',
                isDirectory: false,
                isFile: true,
                size: 0,
                modified: 0,
              },
            ],
          },
        ],
      },
    ];
    expect(findFileEntry(tree, '/home/testuser/Projects/app/main.ts')?.name).toBe('main.ts');
    expect(findFileEntry(tree, '/home/testuser/Projects/app')).toBeTruthy();
    expect(findFileEntry(tree, '/home/testuser/nope')).toBeNull();
  });

  it('withFileEntryChildren sets children on the right node without mutating the tree', async () => {
    const { withFileEntryChildren } = await import('../src/stores/fileStore');
    const tree = [
      {
        name: 'Projects',
        path: '/home/testuser/Projects',
        isDirectory: true,
        isFile: false,
        size: 0,
        modified: 0,
        children: undefined as never,
      },
    ];
    const children = [
      {
        name: 'README.md',
        path: '/home/testuser/Projects/README.md',
        isDirectory: false,
        isFile: true,
        size: 0,
        modified: 0,
      },
    ];
    const next = withFileEntryChildren(tree, '/home/testuser/Projects', children);
    expect(next[0].children).toEqual(children);
    // The original tree is untouched.
    expect(tree[0].children).toBeUndefined();
    expect(next).not.toBe(tree);
  });
});

describe('file store — lazy loading on expand', () => {
  const readDirMock = vi.fn();

  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    });
    readDirMock.mockReset();
    vi.stubGlobal('window', {
      lucidAPI: { fs: { readDir: readDirMock } },
    });
  });

  it('setCurrentDir reads only the top level (one call, no depth)', async () => {
    const { useFileStore } = await import('../src/stores/fileStore');
    const topLevel = [
      { name: 'Desktop', path: `${HOME}/Desktop`, isDirectory: true, isFile: false, size: 0, modified: 0 },
      { name: 'notes.txt', path: `${HOME}/notes.txt`, isDirectory: false, isFile: true, size: 0, modified: 0 },
    ];
    readDirMock.mockResolvedValueOnce(topLevel);
    useFileStore.setState({ currentDir: '', entries: [], expandedDirs: new Set() });

    await useFileStore.getState().setCurrentDir(HOME);

    expect(readDirMock).toHaveBeenCalledTimes(1);
    expect(readDirMock).toHaveBeenCalledWith(HOME);
    expect(useFileStore.getState().entries).toEqual(topLevel);
    // No descent into the protected folders at startup.
    for (const protectedPath of PROTECTED) {
      expect(readDirMock).not.toHaveBeenCalledWith(protectedPath);
    }
  });

  it('toggleDir fetches children on first expand and not on collapse', async () => {
    const { useFileStore } = await import('../src/stores/fileStore');
    const desktopChildren = [
      { name: 'notes.txt', path: `${HOME}/Desktop/notes.txt`, isDirectory: false, isFile: true, size: 0, modified: 0 },
    ];
    readDirMock.mockResolvedValueOnce(desktopChildren);
    useFileStore.setState({
      currentDir: HOME,
      entries: [
        { name: 'Desktop', path: `${HOME}/Desktop`, isDirectory: true, isFile: false, size: 0, modified: 0, children: undefined },
      ],
      expandedDirs: new Set(),
    });

    await useFileStore.getState().toggleDir(`${HOME}/Desktop`);

    expect(readDirMock).toHaveBeenCalledTimes(1);
    expect(readDirMock).toHaveBeenCalledWith(`${HOME}/Desktop`);
    expect(useFileStore.getState().expandedDirs.has(`${HOME}/Desktop`)).toBe(true);
    expect(
      useFileStore.getState().entries[0].children,
    ).toEqual(desktopChildren);

    // Collapse: no fetch.
    await useFileStore.getState().toggleDir(`${HOME}/Desktop`);
    expect(readDirMock).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().expandedDirs.has(`${HOME}/Desktop`)).toBe(false);
  });

  it('toggleDir collapses back and reports when the folder cannot be read', async () => {
    const { useFileStore } = await import('../src/stores/fileStore');
    readDirMock.mockRejectedValueOnce(new Error('Failed to read directory: Error: EPERM'));
    useFileStore.setState({
      currentDir: HOME,
      entries: [
        { name: 'Desktop', path: `${HOME}/Desktop`, isDirectory: true, isFile: false, size: 0, modified: 0, children: undefined },
      ],
      expandedDirs: new Set(),
    });

    await useFileStore.getState().toggleDir(`${HOME}/Desktop`);

    // The dir does not sit open and empty after a failed load.
    expect(useFileStore.getState().expandedDirs.has(`${HOME}/Desktop`)).toBe(false);
  });
});
