/**
 * Shared helper: make sure the compiled readDir worker exists and
 * reflects its sources before a test spawns it.
 *
 * The worker runs from the tsconfig.node build output
 * (`dist-electron/electron/workers/readDirWorker.js`), and a plain
 * `npm run build` does not emit the node project — so tests that
 * spawn the worker build it on demand when stale. Two test files
 * use this (readDirWorker + fileExplorerStartup) and vitest runs
 * test files in parallel, so the build is guarded by a lock dir:
 * two concurrent `tsc -p` runs on the same project would write
 * the same `.tsbuildinfo` + emit files and can corrupt each
 * other. The lock holder records its pid; a lock whose holder is
 * dead is treated as stale and removed.
 *
 * Freshness is a CONTENT hash of the sources (sidecar file), not
 * mtimes: tsc is incremental and does not re-emit (or update
 * mtimes of) files whose content did not change, so an
 * mtime comparison can never be satisfied after a bare `touch`
 * and the helper would rebuild in a loop until its deadline.
 *
 * tsc exits 2 on the repo's pre-existing node-project errors but
 * still emits — the exit code is ignored; the freshness check
 * below is the gate.
 */
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SOURCES = [
  'electron/workers/readDirWorker.ts',
  'electron/ipc/readDirTree.ts',
  'electron/ipc/fileSystem.ts',
  'src/lib/gitignore.ts',
];

export function compiledReadDirWorkerPath(repoRoot: string): string {
  return join(repoRoot, 'dist-electron/electron/workers/readDirWorker.js');
}

function sidecarPath(repoRoot: string): string {
  return join(repoRoot, 'dist-electron/.readDirWorker-sources.sha256');
}

function sourceHash(repoRoot: string): string {
  const hash = createHash('sha256');
  for (const s of SOURCES) {
    hash.update(s);
    hash.update(readFileSync(join(repoRoot, s)));
  }
  return hash.digest('hex');
}

function isFresh(repoRoot: string): boolean {
  const compiled = compiledReadDirWorkerPath(repoRoot);
  if (!existsSync(compiled)) return false;
  try {
    return readFileSync(sidecarPath(repoRoot), 'utf-8').trim() === sourceHash(repoRoot);
  } catch {
    return false;
  }
}

function holderIsAlive(lockDir: string): boolean {
  try {
    const pid = Number(readFileSync(join(lockDir, 'pid'), 'utf-8').trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function ensureReadDirWorkerBuilt(repoRoot: string): void {
  if (isFresh(repoRoot)) return;
  const outDir = join(repoRoot, 'dist-electron');
  mkdirSync(outDir, { recursive: true });
  const lockDir = join(outDir, '.readDirWorker-build.lock');
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (isFresh(repoRoot)) return;
    let acquired = false;
    try {
      mkdirSync(lockDir);
      acquired = true;
    } catch {
      acquired = false;
    }
    if (acquired) {
      try {
        writeFileSync(join(lockDir, 'pid'), String(process.pid));
        if (!isFresh(repoRoot)) {
          try {
            execFileSync(join(repoRoot, 'node_modules/.bin/tsc'), [
              '-p',
              'tsconfig.node.json',
            ], { cwd: repoRoot, timeout: 240_000, stdio: 'pipe' });
          } catch {
            // Ignore: tsc exits 2 on pre-existing errors but emits.
          }
          // Record that the artifact reflects these sources.
          // (Only meaningful when the emit produced the file.)
          if (existsSync(compiledReadDirWorkerPath(repoRoot))) {
            writeFileSync(sidecarPath(repoRoot), sourceHash(repoRoot));
          }
        }
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
      if (isFresh(repoRoot)) return;
      continue;
    }
    // Another test file is building: wait, then re-check. A lock
    // whose holder died is stale — remove it and try again.
    if (!holderIsAlive(lockDir)) {
      rmSync(lockDir, { recursive: true, force: true });
      continue;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  if (!isFresh(repoRoot)) {
    throw new Error(
      'timed out waiting for the compiled readDir worker (tsc -p tsconfig.node.json)',
    );
  }
}
