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

export function setupFileSystemHandlers(ipcMain: IpcMain): void {
  // Read directory contents. Depth 1 by default: the top level
  // only, children left undefined for lazy loading on expand.
  // The startup file-explorer load reads only the top level, so
  // it never descends into Desktop / Documents / Downloads and
  // never prompts. Deeper reads still skip the protected folders
  // below the root (defense in depth) — a caller that recurses
  // from the home directory must not silently walk into them.
  ipcMain.handle(
    'fs:readDir',
    async (_, dirPath: string, options?: ReadDirOptions): Promise<FileEntry[]> => {
      const depth = Math.max(1, Math.floor(options?.depth ?? 1));
      async function readDirRecursive(
        currentPath: string,
        remainingDepth: number,
      ): Promise<FileEntry[]> {
        try {
          const entries = await fs.readdir(currentPath, { withFileTypes: true });
          const results: FileEntry[] = [];

          for (const entry of entries) {
            try {
              const fullPath = path.join(currentPath, entry.name);
              const stats = await fs.stat(fullPath);
              const isDirectory = entry.isDirectory();

              let children: FileEntry[] | undefined;
              if (isDirectory && remainingDepth > 1) {
                // Limit recursion depth or ignore node_modules/git to prevent hanging.
                // Never descend into a TCC-protected folder below the
                // root — the root itself is always listed (the user
                // explicitly opened it), but its protected subfolders
                // are not walked into uninvited.
                const isProtected = TCC_PROTECTED_DIR_NAMES.includes(entry.name);
                const isRoot = fullPath === dirPath;
                if (
                  entry.name !== 'node_modules' &&
                  entry.name !== '.git' &&
                  entry.name !== '.DS_Store' &&
                  entry.name !== 'dist' &&
                  entry.name !== 'build' &&
                  !(isProtected && !isRoot)
                ) {
                  children = await readDirRecursive(fullPath, remainingDepth - 1);
                }
              }

              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory,
                isFile: entry.isFile(),
                size: stats.size,
                modified: stats.mtimeMs,
                children,
              });
            } catch {
              // Skip entries we can't access
            }
          }

          // Sort: directories first, then alphabetically
          return results.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });
        } catch (error) {
          throw new Error(`Failed to read directory: ${error}`);
        }
      }

      return await readDirRecursive(dirPath, depth);
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
