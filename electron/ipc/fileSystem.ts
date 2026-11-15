import { IpcMain, dialog, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  children?: FileEntry[];
}

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  created: number;
  modified: number;
  accessed: number;
}

export interface ReadDirOptions {
  /**
   * How many levels to include. 1 = the directory's own entries
   * only (children left undefined — the caller loads them lazily
   * on expand). Deeper levels recurse that far. Defaults to 1.
   */
  depth?: number;
  /**
   * Stop collecting once this many entries (files + directories)
   * have been gathered — bounds the walk and the IPC payload for
   * huge trees (the fuzzy finder's home-rooted walk used to walk
   * the whole home tree before the renderer capped it at 5,000
   * files). Omit for no cap (the file explorer's shallow reads).
   */
  maxEntries?: number;
  /**
   * Wall-clock deadline per recursive branch (see
   * readDirTree). Omit for the default
   * (READ_DIR_BRANCH_TIMEOUT_MS).
   */
  branchTimeoutMs?: number;
}


/**
 * Directories macOS protects with a per-folder prompt (TCC "Files
 * and Folders") plus Library, which holds the Full Disk Access
 * locations (Mail, Messages) and is enormous to walk. A recursive
 * read must never descend into one of these unless the user
 * explicitly opened that folder as the root — descending into all
 * three user folders at once is what asked Gary for his files
 * 3 times on startup (Gary, 2026-11-08 ~07:22 PST): the startup
 * file-explorer load walked the whole home directory, so macOS
 * prompted once for Desktop, once for Documents, once for
 * Downloads. The prompt is per folder, so three folders = three
 * prompts. Skipping them in recursion (and loading only the top
 * level by default) means startup touches no protected folder
 * and prompts zero times; a folder the user explicitly opens
 * still prompts once for that folder, which is correct.
 */
export const TCC_PROTECTED_DIR_NAMES: readonly string[] = [
  'Desktop',
  'Documents',
  'Downloads',
  'Library',
];

/**
 * Recursive directory read (the `fs:readDir` work, extracted so
 * tests can run it without Electron). Depth 1 by default: the top
 * level only, children left undefined for lazy loading on expand.
 * The startup file-explorer load reads only the top level, so it
 * never descends into Desktop / Documents / Downloads and never
 * prompts. Deeper reads still skip the protected folders below
 * the root (defense in depth) — a caller that recurses from the
 * home directory must not silently walk into them.
 */
/**
 * Per-branch wall-clock deadline for a recursive read. A single
 * hung filesystem call (a stat/readdir that never returns — a
 * symlink to a sleeping volume, a stale mount, an iCloud edge)
 * used to block the whole walk, so the finder's 30 s renderer
 * timeout fired and ⌘P settled on "No files in this project"
 * with an empty index (Atom rest live check, 2026-11-14). Each
 * subdirectory branch now races this deadline; a branch that
 * never settles is dropped (its entry stays, children
 * undefined — lazy-loadable like a depth-1 read) and the rest
 * of the tree still comes back. The renderer timeout is the
 * outer bound; this is the per-branch one, well inside it.
 */
export const READ_DIR_BRANCH_TIMEOUT_MS = 10_000;

/** The filesystem surface readDirTree needs — the real
 * `fs/promises` module in production, a fake in tests (a hung
 * branch is only testable with an injected readdir that never
 * resolves). */
export interface ReadDirTreeFS {
  readdir: (
    path: string,
    options: { withFileTypes: true },
  ) => Promise<
    Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  >;
  lstat: (path: string) => Promise<{ size: number; mtimeMs: number }>;
}

/**
 * Recursive directory read (the `fs:readDir` work, extracted so
 * tests can run it without Electron). Depth 1 by default: the top
 * level only, children left undefined for lazy loading on expand.
 * The startup file-explorer load reads only the top level, so it
 * never descends into Desktop / Documents / Downloads and never
 * prompts. Deeper reads still skip the protected folders below
 * the root (defense in depth) — a caller that recurses from the
 * home directory must not silently walk into them.
 *
 * Two hang classes are closed here (Item 0, sweep fixes):
 * symlinks are never followed (`lstat`, not `stat` — a symlink
 * to a sleeping volume used to block the whole walk on its
 * target), and a subdirectory branch that never settles is
 * dropped after READ_DIR_BRANCH_TIMEOUT_MS instead of bricking
 * the index — the rest of the tree still returns.
 */
export async function readDirTree(
  dirPath: string,
  options?: ReadDirOptions,
  io: ReadDirTreeFS = fs,
): Promise<FileEntry[]> {
  const depth = Math.max(1, Math.floor(options?.depth ?? 1));
  const maxEntries = options?.maxEntries;
  const branchTimeoutMs =
    options?.branchTimeoutMs ?? READ_DIR_BRANCH_TIMEOUT_MS;
  let collected = 0;

  // Race a branch against its deadline; undefined means the
  // branch never settled (or its readdir threw) and is dropped.
  // The dangling branch keeps running in the background but its
  // result is discarded — it can only touch `collected`, never
  // the returned tree (each level builds its own results array).
  function withBranchTimeout<T>(
    promise: Promise<T>,
    ms: number,
  ): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    });
    return Promise.race([
      promise.then(
        (value) => value,
        () => undefined,
      ),
      timeout,
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  // Never descend into these below the root — the root itself
  // is always listed (the user explicitly opened it), but its
  // protected subfolders are not walked into uninvited.
  function shouldDescend(name: string, fullPath: string): boolean {
    if (
      name === 'node_modules' ||
      name === '.git' ||
      name === '.DS_Store' ||
      name === 'dist' ||
      name === 'build'
    ) {
      return false;
    }
    const isProtected = TCC_PROTECTED_DIR_NAMES.includes(name);
    const isRoot = fullPath === dirPath;
    return !(isProtected && !isRoot);
  }

  async function readDirRecursive(
    currentPath: string,
    remainingDepth: number,
  ): Promise<FileEntry[]> {
    let entries;
    try {
      entries = await io.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Failed to read directory: ${error}`);
    }
    const results: FileEntry[] = [];
    const branches: Array<{
      entry: FileEntry;
      promise: Promise<FileEntry[] | undefined>;
    }> = [];
    for (const entry of entries) {
      // Budget hit — stop collecting at this level (branches
      // already spawned keep their own budget checks).
      if (maxEntries !== undefined && collected >= maxEntries) break;
      const fullPath = path.join(currentPath, entry.name);
      let stats;
      try {
        // lstat, never stat: a symlink's target is never
        // touched (a link to a sleeping volume used to block
        // the whole walk). Dirent already reports the link
        // itself as neither file nor directory.
        stats = await io.lstat(fullPath);
      } catch {
        // Skip entries we can't access
        continue;
      }
      const isDirectory = entry.isDirectory();
      const fileEntry: FileEntry = {
        name: entry.name,
        path: fullPath,
        isDirectory,
        isFile: entry.isFile(),
        size: stats.size,
        modified: stats.mtimeMs,
        children: undefined,
      };
      // Check + count + push in one synchronous stretch — no
      // await between them — so concurrent branches can never
      // push the total past maxEntries.
      if (maxEntries !== undefined && collected >= maxEntries) break;
      results.push(fileEntry);
      collected += 1;
      if (
        isDirectory &&
        remainingDepth > 1 &&
        shouldDescend(entry.name, fullPath) &&
        (maxEntries === undefined || collected < maxEntries)
      ) {
        branches.push({
          entry: fileEntry,
          promise: withBranchTimeout(
            readDirRecursive(fullPath, remainingDepth - 1),
            branchTimeoutMs,
          ),
        });
      }
    }
    // Branches run concurrently; a timed-out branch keeps its
    // entry with children undefined (lazy-loadable), like a
    // depth-1 read.
    const settled = await Promise.all(branches.map((b) => b.promise));
    branches.forEach((b, i) => {
      if (settled[i] !== undefined) b.entry.children = settled[i];
    });

    // Sort: directories first, then alphabetically
    return results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  return await readDirRecursive(dirPath, depth);
}


export function setupFileSystemHandlers(ipcMain: IpcMain): void {
  // Read directory contents. Depth 1 by default: the top level
  // only, children left undefined for lazy loading on expand.
  ipcMain.handle(
    'fs:readDir',
    async (_, dirPath: string, options?: ReadDirOptions): Promise<FileEntry[]> => {
      return readDirTree(dirPath, options);
    },
  );

  // Read file contents
  ipcMain.handle('fs:readFile', async (_, filePath: string): Promise<string> => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  // Write to existing file
  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string): Promise<void> => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  });

  // Create new file
  ipcMain.handle('fs:createFile', async (_, filePath: string, content?: string): Promise<void> => {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content || '', 'utf-8');
    } catch (error) {
      throw new Error(`Failed to create file: ${error}`);
    }
  });

  // Create directory
  ipcMain.handle('fs:createDir', async (_, dirPath: string): Promise<void> => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory: ${error}`);
    }
  });

  // Delete file or directory
  ipcMain.handle('fs:delete', async (_, targetPath: string): Promise<void> => {
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      throw new Error(`Failed to delete: ${error}`);
    }
  });

  // Rename file or directory
  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string): Promise<void> => {
    try {
      await fs.rename(oldPath, newPath);
    } catch (error) {
      throw new Error(`Failed to rename: ${error}`);
    }
  });

  // Check if path exists
  ipcMain.handle('fs:exists', async (_, targetPath: string): Promise<boolean> => {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  });

  // Get file/directory stats
  ipcMain.handle('fs:getStats', async (_, targetPath: string): Promise<FileStats> => {
    try {
      const stats = await fs.stat(targetPath);
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        created: stats.birthtimeMs,
        modified: stats.mtimeMs,
        accessed: stats.atimeMs,
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error}`);
    }
  });

  // Open in system file explorer
  ipcMain.handle('fs:openInExplorer', async (_, targetPath: string): Promise<void> => {
    try {
      shell.showItemInFolder(targetPath);
    } catch (error) {
      throw new Error(`Failed to open in explorer: ${error}`);
    }
  });

  // Select directory dialog
  ipcMain.handle('fs:selectDirectory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Select file dialog
  ipcMain.handle('fs:selectFile', async (_, filters?: { name: string; extensions: string[] }[]): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Get home directory
  ipcMain.handle('fs:getHomeDir', async (): Promise<string> => {
    return os.homedir();
  });
}
