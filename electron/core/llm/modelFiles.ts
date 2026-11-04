/**
 * Model files on disk — the single source of truth for "is a model installed".
 *
 * Two directories hold model files, and the two stacks do NOT agree about
 * them (this is the mismatch the final read found, documented here rather
 * than left silent):
 *
 *   - `~/.lucid/models/` — where the TypeScript LlamafileManager looks
 *     (electron/core/llm/llamafileManager.ts). The terminal command path
 *     serves models from here, via llamafile servers on ports 8080-8085.
 *   - `<app>/LUCID-BACKEND/models/` — where the Python backend loads from
 *     (LUCID-BACKEND/core/lucifer_paths.py is the canonical layout:
 *     `<project>/models/*.gguf`). The AI-chat path (stdio_agent.py) serves
 *     models from here.
 *
 * "Installed" here means a model FILE is present on disk: a non-empty,
 * readable `.gguf` or `.llamafile`. That is a different question from
 * "a model server is answering" (what getModelStatuses / the LuciferAI dot
 * report) — a file can be installed with no server up, and a server entry
 * can exist with no file behind it. The startup disclaimer asks the file
 * question; the dot asks the server question. Both are honest; neither
 * substitutes for the other.
 *
 * Every function in this module is defensive: a missing directory, an
 * unreadable directory, or a corrupt entry degrades to "not installed"
 * with the reason recorded — it never throws, so a startup check can never
 * crash the app open.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const TINYLLAMA_FILENAME = 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf';

/** A model file found on disk. */
export interface InstalledModelFile {
  /** File name, e.g. "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf". */
  name: string;
  /** Absolute path to the file. */
  path: string;
  /** Size in bytes (> 0 — empty files are not models). */
  sizeBytes: number;
  /** The model directory this file was found in. */
  dir: string;
}

/** Result of scanning the model directories. Never throws. */
export interface ModelFileScan {
  /** True when at least one non-empty, readable model file exists. */
  installed: boolean;
  files: InstalledModelFile[];
  /** Every directory that was looked at (including ones that did not exist). */
  dirsChecked: string[];
  /** Non-fatal problems encountered while scanning (missing/unreadable dir, skipped file). */
  errors: string[];
}

const MODEL_EXTENSIONS = new Set(['.gguf', '.llamafile']);

/**
 * Scan the given directories for installed model files.
 * Pure filesystem work — no Electron, no network — so it is unit-testable.
 * A directory that does not exist or cannot be read is recorded in
 * `errors` and skipped; it is not a failure.
 */
export function scanModelDirectories(dirs: string[]): ModelFileScan {
  const files: InstalledModelFile[] = [];
  const errors: string[] = [];
  const dirsChecked: string[] = [];

  for (const dir of dirs) {
    dirsChecked.push(dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch (error: any) {
      // Missing directory is the normal "nothing installed yet" state,
      // not an error worth surfacing — record it and move on.
      errors.push(`Could not read ${dir}: ${error?.message ?? String(error)}`);
      continue;
    }

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!MODEL_EXTENSIONS.has(ext)) continue;
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile() || stat.size === 0) {
          errors.push(`Skipped ${fullPath}: empty or not a file`);
          continue;
        }
        fs.accessSync(fullPath, fs.constants.R_OK);
        files.push({ name: entry, path: fullPath, sizeBytes: stat.size, dir });
      } catch (error: any) {
        errors.push(`Skipped ${fullPath}: ${error?.message ?? String(error)}`);
      }
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name));
  return { installed: files.length > 0, files, dirsChecked, errors };
}

/**
 * True when the file starts with the GGUF magic bytes ("GGUF").
 * A truncated or HTML-error-page download is not a model.
 */
export function isValidGguf(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(4);
      const read = fs.readSync(fd, buf, 0, 4, 0);
      return read === 4 && buf.toString('ascii') === 'GGUF';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * Locate the LUCID-BACKEND directory (the Python backend's project root).
 *
 * An explicit app root overrides everything: callers that know where the
 * app lives (tests, or a future explicit setting) get exactly
 * `<root>/LUCID-BACKEND` or null — no silent fall-through to some other
 * checkout. Without one, the runtime candidates are tried in order:
 * the Electron app path, the packaged resources path, the process
 * working directory, and the repo layout relative to this file. Returns
 * null when no candidate exists — the caller must say so, not guess.
 */
export function resolveBackendDir(explicitAppRoot?: string): string | null {
  if (explicitAppRoot) {
    const candidate = path.join(explicitAppRoot, 'LUCID-BACKEND');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore — an explicit root that is not there means "no backend".
    }
    return null;
  }

  const candidates: string[] = [];

  // Electron app path (main process only — lazy require so this module
  // stays importable from plain Node, e.g. unit tests).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getAppPath?: () => string } };
    const appPath = electron?.app?.getAppPath?.();
    if (appPath) candidates.push(path.join(appPath, 'LUCID-BACKEND'));
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) candidates.push(path.join(resourcesPath, 'LUCID-BACKEND'));
  } catch {
    // Not running under Electron — fall through to the cwd/layout guesses.
  }

  candidates.push(path.join(process.cwd(), 'LUCID-BACKEND'));
  candidates.push(path.join(__dirname, '..', '..', '..', 'LUCID-BACKEND'));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore — try the next candidate.
    }
  }
  return null;
}

/**
 * Every directory a model file may live in: the TypeScript side
 * (`~/.lucid/models`) and the Python backend side
 * (`<app>/LUCID-BACKEND/models`), when the backend folder can be found.
 * The home directory is always included, even when it does not exist yet
 * — the scan treats a missing directory as "nothing installed", not as
 * an error.
 */
export function getModelDirectories(explicitAppRoot?: string): string[] {
  const dirs = [path.join(os.homedir(), '.lucid', 'models')];
  const backendDir = resolveBackendDir(explicitAppRoot);
  if (backendDir) dirs.push(path.join(backendDir, 'models'));
  return dirs;
}

/** Scan every model directory the code actually uses. Never throws. */
export function findInstalledModelFiles(explicitAppRoot?: string): ModelFileScan {
  return scanModelDirectories(getModelDirectories(explicitAppRoot));
}

/** True when at least one model file is installed anywhere. Never throws. */
export function isAnyModelInstalled(explicitAppRoot?: string): boolean {
  try {
    return findInstalledModelFiles(explicitAppRoot).installed;
  } catch {
    return false;
  }
}

/**
 * Verify the bundled TinyLlama model is actually on disk in the backend
 * models directory and is a real GGUF. This is what the install flow
 * checks after the setup script runs — success is only claimed when this
 * passes.
 */
export function verifyTinyLlamaInstalled(
  backendModelsDir: string
): { installed: boolean; path: string; reason?: string } {
  const modelPath = path.join(backendModelsDir, TINYLLAMA_FILENAME);
  if (!fs.existsSync(modelPath)) {
    return { installed: false, path: modelPath, reason: 'model file not found' };
  }
  try {
    const stat = fs.statSync(modelPath);
    if (!stat.isFile() || stat.size === 0) {
      return { installed: false, path: modelPath, reason: 'model file is empty' };
    }
  } catch (error: any) {
    return { installed: false, path: modelPath, reason: error?.message ?? String(error) };
  }
  if (!isValidGguf(modelPath)) {
    return { installed: false, path: modelPath, reason: 'file is not a valid GGUF (bad download?)' };
  }
  return { installed: true, path: modelPath };
}
