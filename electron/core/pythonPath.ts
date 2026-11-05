/**
 * Resolve python3 to an absolute path for `child_process.spawn()`.
 *
 * Why this exists: GUI apps launched via Finder / `open` get NO PATH
 * from launchd — `launchctl getenv PATH` returns empty on Gary's Mac
 * (verified 2026-11-04) — so a bare `python3` spawn cannot resolve and
 * fails with ENOENT, even though python3 exists at /usr/bin/python3
 * (3.9.6) and /usr/local/bin/python3 (3.13.7). That ENOENT surfaced as
 * the "A JavaScript error occurred in the main process" dialog on
 * launch, and left the daemon + AI chat non-functional. Resolving to
 * an absolute path at spawn time makes the daemon and AI-chat spawns
 * work regardless of the launch environment.
 *
 * Resolution order:
 *   1. The user's PATH (via /usr/bin/which) when PATH is set — respects
 *      the user's preferred python.
 *   2. Well-known absolute locations, newest install first:
 *      /usr/local/bin/python3, /opt/homebrew/bin/python3, /usr/bin/python3.
 *   3. null when nothing exists — callers fall back to the bare command
 *      and rely on the spawn 'error' handler to degrade gracefully.
 *
 * The `candidates` / `pathEnv` parameters exist for tests (pass fake
 * values to force the not-found path); production callers use the
 * defaults.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';

const PYTHON_CANDIDATES: readonly string[] =
  process.platform === 'win32'
    ? []
    : ['/usr/local/bin/python3', '/opt/homebrew/bin/python3', '/usr/bin/python3'];

/** Absolute path to python3, or null when none can be found. */
export function resolvePythonPath(
  candidates: readonly string[] = PYTHON_CANDIDATES,
  pathEnv: string | undefined = process.env.PATH
): string | null {
  const bare = process.platform === 'win32' ? 'python' : 'python3';

  // 1. PATH lookup — only meaningful when PATH is actually set. (A
  // Finder-launched app has an empty PATH, so this step is skipped
  // there and the absolute candidates below do the work.)
  if (pathEnv) {
    try {
      const which = process.platform === 'win32' ? 'where' : '/usr/bin/which';
      const found = execFileSync(which, [bare], { encoding: 'utf-8' })
        .trim()
        .split('\n')[0]
        ?.trim();
      if (found && fs.existsSync(found)) return found;
    } catch {
      // `which` failed (or is itself unresolvable) — fall through to
      // the absolute candidates.
    }
  }

  // 2. Well-known absolute locations.
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // A broken candidate is the same as a missing one.
    }
  }

  // 3. Nothing found.
  return null;
}

/**
 * The command to spawn: the resolved absolute path when one exists,
 * else the bare command. The bare fallback keeps the old behaviour on
 * machines with no python at these locations — the spawn 'error'
 * handler in the caller then degrades gracefully instead of crashing.
 * The parameters exist for tests (pass fake values to force the
 * not-found path); production callers use the defaults.
 */
export function getPythonCommand(
  candidates: readonly string[] = PYTHON_CANDIDATES,
  pathEnv: string | undefined = process.env.PATH
): string {
  if (process.platform === 'win32') return 'python';
  const resolved = resolvePythonPath(candidates, pathEnv);
  if (!resolved) {
    console.warn(
      '[python] No python3 found (PATH empty and no well-known location exists); spawning bare "python3" — expect an ENOENT handled gracefully.'
    );
  }
  return resolved ?? 'python3';
}
