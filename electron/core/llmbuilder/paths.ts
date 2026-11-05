/**
 * Forge (LLMBuilder) paths — the paths contract for the Homunculi trainer.
 *
 * Two roots, kept separate on purpose:
 *
 * - builderDir — the vendored LLMBuilder tree. In dev it is the repo
 *   `LUCID-BUILDER/` directory; in the packaged app it is a writable
 *   working copy at `~/.lucid/llmbuilder/code/`, refreshed from
 *   `<resources>/LUCID-BUILDER/` on first run (see
 *   ensureBuilderWorkCopy — resourcesPath may be read-only, and the
 *   trainer writes under the tree). The trainer scripts compute their
 *   ROOT from the script location, so they read their corpus from
 *   `<builderDir>/datasets/...` and write candidate exports under
 *   `<builderDir>/exports/...` — the job runner stages the corpus
 *   there at run start and mirrors the outputs into the state dir.
 * - dataDir — runtime state in user data, `~/.lucid/llmbuilder/`:
 *   the venv, datasets/, exports/ (mirrored candidate outputs),
 *   results/, reports/, runs/ (one manifest per run), and the
 *   homunculi.json roster. State survives app updates; uninstalling
 *   the app does not delete trained models (same as ~/.lucid/models/).
 *
 * Models live in ~/.lucid/models/ — the dir llamafileManager already
 * scans — so a promoted GGUF installed as a brain is picked up with
 * no new serving code.
 */

import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface LlmbuilderPaths {
  /**
   * Vendored LLMBuilder tree (scripts live here). In dev it is the
   * repo `LUCID-BUILDER/` directory; in the packaged app it is
   * `<resources>/LUCID-BUILDER/`, resolved the same way local_ai.ts
   * resolves `LUCID-BACKEND/core` (app.isPackaged ? resourcesPath :
   * __dirname-relative). The trainer scripts compute their ROOT from
   * the script location, so they read their corpus from
   * `<builderDir>/datasets/...` and write candidate exports under
   * `<builderDir>/exports/...` — the job runner stages the corpus
   * there at run start and mirrors the outputs into the state dir.
   *
   * In the packaged app resourcesPath may be read-only, so
   * builderDir is NOT the resources copy — it is a writable working
   * copy under the state dir (see vendoredDir + ensureBuilderWorkCopy).
   * In dev builderDir and vendoredDir are the same repo dir.
   */
  builderDir: string;
  /**
   * The vendored tree as shipped: the repo dir in dev, the resources
   * copy in the packaged app. The working copy is refreshed from here.
   */
  vendoredDir: string;
  /** Runtime state dir (~/.lucid/llmbuilder/). */
  dataDir: string;
  /** Python venv for the Forge (~/.lucid/llmbuilder/.venv). */
  venvDir: string;
  /** Python inside the venv (or the system python3 when no venv). */
  venvPython: string;
  /** Imported datasets (~/.lucid/llmbuilder/datasets/). */
  datasetsDir: string;
  /** Mirrored candidate exports (~/.lucid/llmbuilder/exports/). */
  exportsDir: string;
  /** Benchmark + gate outputs (~/.lucid/llmbuilder/results/). */
  resultsDir: string;
  /** Promotion decisions + gate reports (~/.lucid/llmbuilder/reports/). */
  reportsDir: string;
  /** One run manifest per training run (~/.lucid/llmbuilder/runs/). */
  runsDir: string;
  /** Homunculi roster file (~/.lucid/llmbuilder/homunculi.json). */
  rosterPath: string;
  /** GGUF models dir (~/.lucid/models/) — scanned by llamafileManager. */
  modelsDir: string;
}

export interface LlmbuilderPathsOverrides {
  isPackaged?: boolean;
  resourcesPath?: string;
  repoRoot?: string;
  homeDir?: string;
  builderDir?: string;
  vendoredDir?: string;
  dataDir?: string;
  modelsDir?: string;
}

/** The trainer script a run needs — the Forge is not ready without it. */
export const TRAIN_SCRIPT_REL =
  'scripts/training/train_arc_native_candidate.py';

/** Free memory (MB) below which the Forge warns before a run. */
export const LOW_MEMORY_MB = 1024;

/**
 * Resolve the Forge paths. Overrides exist for tests (pass a tmp
 * home/builder instead of the real ones); production callers use the
 * defaults. The vendored dir resolves exactly the way local_ai.ts
 * resolves LUCID-BACKEND: packaged → process.resourcesPath, dev →
 * __dirname-relative to the repo root.
 */
export function resolveLlmbuilderPaths(
  overrides: LlmbuilderPathsOverrides = {},
): LlmbuilderPaths {
  const homeDir = overrides.homeDir ?? os.homedir();
  const isPackaged = overrides.isPackaged ?? app.isPackaged;
  const resourcesPath = overrides.resourcesPath ?? process.resourcesPath;
  const repoRoot =
    overrides.repoRoot ?? path.resolve(__dirname, '..', '..', '..');
  const dataDir =
    overrides.dataDir ?? path.join(homeDir, '.lucid', 'llmbuilder');
  // Packaged: the resources copy is read-only, so the trainer runs
  // from a writable working copy under the state dir
  // (~/.lucid/llmbuilder/code/). Dev: the repo tree is already
  // writable, so builderDir and vendoredDir are the same dir and no
  // copy ever happens.
  const vendoredDir =
    overrides.vendoredDir ??
    (isPackaged
      ? path.join(resourcesPath, 'LUCID-BUILDER')
      : overrides.builderDir ?? path.join(repoRoot, 'LUCID-BUILDER'));
  const builderDir =
    overrides.builderDir ??
    (isPackaged
      ? path.join(dataDir, 'code')
      : path.join(repoRoot, 'LUCID-BUILDER'));
  const modelsDir =
    overrides.modelsDir ?? path.join(homeDir, '.lucid', 'models');
  const venvDir = path.join(dataDir, '.venv');
  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python');
  return {
    builderDir,
    vendoredDir,
    dataDir,
    venvDir,
    venvPython,
    datasetsDir: path.join(dataDir, 'datasets'),
    exportsDir: path.join(dataDir, 'exports'),
    resultsDir: path.join(dataDir, 'results'),
    reportsDir: path.join(dataDir, 'reports'),
    runsDir: path.join(dataDir, 'runs'),
    rosterPath: path.join(dataDir, 'homunculi.json'),
    modelsDir,
  };
}

/** Marker for the working-copy fingerprint (see ensureBuilderWorkCopy). */
export const WORK_COPY_MARKER = '.forge-copy.json';

export interface BuilderWorkCopyFingerprint {
  /** Contents of the vendored VERSION file, or null when absent. */
  version: string | null;
  /** Trainer script mtime/size — catches a tree change with no VERSION bump. */
  scriptMtimeMs: number | null;
  scriptSize: number | null;
}

function readBuilderFingerprint(
  vendoredDir: string,
): BuilderWorkCopyFingerprint | null {
  let version: string | null = null;
  try {
    version = fs.readFileSync(path.join(vendoredDir, 'VERSION'), 'utf-8').trim();
  } catch {
    version = null;
  }
  let scriptMtimeMs: number | null = null;
  let scriptSize: number | null = null;
  try {
    const stat = fs.statSync(path.join(vendoredDir, TRAIN_SCRIPT_REL));
    if (!stat.isFile()) return null;
    scriptMtimeMs = stat.mtimeMs;
    scriptSize = stat.size;
  } catch {
    return null;
  }
  return { version, scriptMtimeMs, scriptSize };
}

/**
 * Make sure the writable working copy of the vendored tree exists and
 * is current — packaged app only. In dev builderDir IS the vendored
 * dir, so this is a no-op. When packaged, the trainer reads/writes
 * under builderDir (datasets staging, exports, reports), and the
 * resources copy may be read-only, so the tree is copied to
 * ~/.lucid/llmbuilder/code/ on first run and re-copied when the
 * vendored tree changes (VERSION contents or trainer script
 * mtime/size). The copy goes through a temp dir + rename, so a
 * failed copy never leaves a half-written builder dir behind.
 * Returns true when a copy was made.
 */
export function ensureBuilderWorkCopy(paths: LlmbuilderPaths): boolean {
  if (paths.builderDir === paths.vendoredDir) return false;
  const fingerprint = readBuilderFingerprint(paths.vendoredDir);
  if (!fingerprint) return false;
  const markerPath = path.join(paths.builderDir, WORK_COPY_MARKER);
  try {
    const stored: unknown = JSON.parse(
      fs.readFileSync(markerPath, 'utf-8'),
    );
    if (
      stored &&
      typeof stored === 'object' &&
      !Array.isArray(stored)
    ) {
      const s = stored as Record<string, unknown>;
      if (
        s.version === fingerprint.version &&
        s.scriptMtimeMs === fingerprint.scriptMtimeMs &&
        s.scriptSize === fingerprint.scriptSize &&
        builderReady(paths)
      ) {
        return false;
      }
    }
  } catch {
    // Missing or unreadable marker — copy below.
  }
  const tmp = `${paths.builderDir}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(paths.vendoredDir, tmp, { recursive: true });
  fs.writeFileSync(
    path.join(tmp, WORK_COPY_MARKER),
    JSON.stringify(fingerprint, null, 2) + '\n',
    'utf-8',
  );
  fs.rmSync(paths.builderDir, { recursive: true, force: true });
  fs.renameSync(tmp, paths.builderDir);
  return true;
}

/** Create the state-dir tree (mkdir -p, idempotent). */
export function ensureLlmbuilderDirs(paths: LlmbuilderPaths): void {
  for (const dir of [
    paths.dataDir,
    paths.datasetsDir,
    paths.exportsDir,
    paths.resultsDir,
    paths.reportsDir,
    paths.runsDir,
    paths.modelsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** True when the vendored trainer script is present and usable. */
export function builderReady(paths: LlmbuilderPaths): boolean {
  try {
    return fs
      .statSync(path.join(paths.builderDir, TRAIN_SCRIPT_REL))
      .isFile();
  } catch {
    return false;
  }
}

/** True when the Forge venv has a python in it. */
export function venvReady(paths: LlmbuilderPaths): boolean {
  try {
    return fs.statSync(paths.venvPython).isFile();
  } catch {
    return false;
  }
}

/**
 * True when torch is importable from the venv — checked by looking
 * for the torch package in the venv's site-packages, not by importing
 * it (importing torch just to answer "is it there" costs seconds).
 */
export function torchReady(paths: LlmbuilderPaths): boolean {
  try {
    const libDir = path.join(paths.venvDir, 'lib');
    const libEntries = fs.existsSync(libDir)
      ? fs.readdirSync(libDir)
      : [];
    const siteDirs: string[] = [];
    for (const entry of libEntries) {
      siteDirs.push(path.join(libDir, entry, 'site-packages'));
    }
    // Windows venvs use Lib/site-packages instead of lib/pythonX.Y/.
    siteDirs.push(path.join(paths.venvDir, 'Lib', 'site-packages'));
    for (const site of siteDirs) {
      try {
        if (fs.statSync(path.join(site, 'torch')).isDirectory()) {
          return true;
        }
      } catch {
        // Not in this site-packages — keep looking.
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Free system memory in whole MB. */
export function getFreeMemoryMb(): number {
  return Math.round(os.freemem() / (1024 * 1024));
}
