import { IpcMain, dialog, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// Imported (not just re-exported) because the fs:readDir
// handler below uses these names in this file's scope.
import {
  readDirTreeViaWorker,
  type FileEntry,
  type ReadDirOptions,
} from './readDirTree';

// The directory walk lives in ./readDirTree (moved step 5,
// files-section fix): the worker thread runs the same
// implementation as the main process, so there is exactly one
// walk. This module re-exports it so existing importers
// (tests, main) keep working, and keeps the readFileHead
// large-file preview below. Do not move readFileHead.
export {
  readDirTree,
  readDirTreeViaWorker,
  READ_DIR_BRANCH_TIMEOUT_MS,
  READ_DIR_WORKER_TIMEOUT_MS,
  TCC_PROTECTED_DIR_NAMES,
  SKIP_DESCEND_DIR_NAMES,
  resolveReadDirWorkerPath,
} from './readDirTree';
export type { FileEntry, ReadDirOptions, ReadDirTreeFS } from './readDirTree';

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  created: number;
  modified: number;
  accessed: number;
}

export interface FileHeadResult {
  content: string;
  /** True when the file is longer than the bytes returned. */
  truncated: boolean;
  /** The file's full size in bytes (fstat). */
  fullSize: number;
}

/**
 * Read the head of a file without materialising the whole file
 * in main (the large-file preview behind `fs:readFileHead`).
 * Opens the file, stats it, and reads at most maxBytes from
 * offset 0 — a 100 MB file costs a 1 MB buffer, never a 100 MB
 * string. The content is cut to the last '\n' when the file was
 * truncated, so the preview never ends mid-line; a file with no
 * newline in the head keeps at least its first line. A trailing
 * U+FFFD left by a cut through a multi-byte character is dropped.
 */
export async function readFileHead(
  filePath: string,
  maxBytes: number,
): Promise<FileHeadResult> {
  const limit = Math.max(0, Math.floor(maxBytes));
  const handle = await fs.open(filePath, 'r');
  try {
    const { size: fullSize } = await handle.stat();
    const toRead = Math.min(limit, fullSize);
    const buffer = Buffer.alloc(toRead);
    let bytesRead = 0;
    if (toRead > 0) {
      const { bytesRead: n } = await handle.read(buffer, 0, toRead, 0);
      bytesRead = n;
    }
    const truncated = fullSize > bytesRead;
    let content = buffer.subarray(0, bytesRead).toString('utf-8');
    if (truncated) {
      const lastNewline = content.lastIndexOf('\n');
      if (lastNewline > 0) {
        content = content.slice(0, lastNewline + 1);
      } else if (content.endsWith('\uFFFD')) {
        content = content.slice(0, -1);
      }
    }
    return { content, truncated, fullSize };
  } finally {
    await handle.close();
  }
}


export function setupFileSystemHandlers(ipcMain: IpcMain): void {
  // Read directory contents. Depth 1 by default: the top level
  // only, children left undefined for lazy loading on expand.
  ipcMain.handle(
    'fs:readDir',
    async (_, dirPath: string, options?: ReadDirOptions): Promise<FileEntry[]> => {
      // Recursive walks run in a worker thread (step 5); depth-1
      // reads stay in-process inside readDirTreeViaWorker.
      return readDirTreeViaWorker(dirPath, options);
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

  // Read the head of a file (large-file preview): the first
  // maxBytes bytes, cut to the last newline, without ever
  // materialising the whole file in main. See readFileHead.
  ipcMain.handle(
    'fs:readFileHead',
    async (_, filePath: string, maxBytes: number): Promise<FileHeadResult> => {
      try {
        return await readFileHead(filePath, maxBytes);
      } catch (error) {
        throw new Error(`Failed to read file head: ${error}`);
      }
    },
  );

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
