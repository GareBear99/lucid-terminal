/**
 * fileFixer — apply a fix to a file and verify it by re-running.
 *
 * The only automatic file edit FixNet performs is inserting a single
 * import line (the deterministic pattern fix) into a Python file.
 * Anything else — an LLM-generated solution, a stored text solution —
 * is presented to the user, never written: an arbitrary text edit
 * cannot be verified, and claiming it worked would be a lie.
 *
 * Rules:
 *   - applyImportFix inserts the line after a leading shebang, else
 *     at the top of the file. If the import is already present, it
 *     reports "already present" and writes nothing.
 *   - verifyFile re-runs the file with its interpreter (python3 for
 *     .py, node for .js, bash for .sh) and reports the real outcome.
 *     Other extensions cannot be verified and report that plainly.
 *   - The caller keeps the original content and reverts on failure:
 *     the file on disk only changes when the fix is applied AND the
 *     re-run passes.
 */

import * as fs from 'fs';
import { spawn } from 'child_process';
import { getPythonCommand } from '../pythonPath';

export interface RunResult {
  /** True when the file ran with exit code 0. */
  ok: boolean;
  /** Combined stderr/stdout on failure (or the reason it could not run). */
  error: string;
  /** Captured stdout (usually empty for a fix verification). */
  output: string;
}

/** Interpreter for a file extension, or null when it cannot be run. */
export function interpreterFor(filePath: string): {
  command: string;
  args: string[];
} | null {
  if (filePath.endsWith('.py')) {
    // Resolved to an absolute path: Finder-launched apps get an empty
    // PATH from launchd, so a bare 'python3' spawn fails with ENOENT
    // even though python3 exists on disk (see core/pythonPath.ts).
    // Falls back to the bare command when nothing resolves; runFile's
    // 'error' handler degrades gracefully instead of crashing.
    return { command: getPythonCommand(), args: [filePath] };
  }
  if (filePath.endsWith('.js')) {
    return { command: 'node', args: [filePath] };
  }
  if (filePath.endsWith('.sh') || filePath.endsWith('.bash')) {
    return { command: 'bash', args: [filePath] };
  }
  return null;
}

/**
 * Run a file and report whether it exits cleanly. Times out (default
 * 10s) rather than hanging on a script that waits for input.
 */
export function runFile(
  filePath: string,
  timeoutMs = 10000
): Promise<RunResult> {
  const interpreter = interpreterFor(filePath);
  if (!interpreter) {
    return Promise.resolve({
      ok: false,
      error: `Cannot verify ${filePath}: no runner for this file type.`,
      output: '',
    });
  }
  return new Promise((resolve) => {
    const proc = spawn(interpreter.command, interpreter.args, {
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        ok: false,
        error: `Timed out after ${timeoutMs}ms while running ${filePath}.`,
        output: stdout,
      });
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      const error = (stderr || stdout || '').trim();
      resolve({
        ok: code === 0,
        error: code === 0 ? '' : error || `Exit code: ${code}`,
        output: stdout,
      });
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Failed to run ${filePath}: ${error.message}`,
        output: stdout,
      });
    });
  });
}

/**
 * True when `solution` is exactly one import statement (a plain
 * `import X` or `from ... import ...` line). Anything else is not an
 * automatic file edit.
 */
export function extractImportLine(solution: string): string | null {
  const line = (solution || '').trim();
  if (!line) return null;
  if (/^import\s+[A-Za-z_][\w.]*(\s+as\s+[A-Za-z_]\w*)?$/.test(line)) {
    return line;
  }
  if (
    /^from\s+[A-Za-z_][\w.]*\s+import\s+[A-Za-z_][\w\s,]*$/.test(line)
  ) {
    return line;
  }
  return null;
}

export interface ApplyResult {
  applied: boolean;
  /** Why it was not applied (or 'already present'). */
  reason?: string;
}

/**
 * Insert one import line into a Python file. Returns applied:false
 * when the import is already there (no write) or the file is not a
 * Python file. Writes the file on success.
 */
export function applyImportFix(
  filePath: string,
  importLine: string
): ApplyResult {
  if (!filePath.endsWith('.py')) {
    return {
      applied: false,
      reason: 'automatic file edits only apply to Python files',
    };
  }
  let original: string;
  try {
    original = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return {
      applied: false,
      reason: `could not read ${filePath}: ${(error as Error).message}`,
    };
  }
  const lines = original.split('\n');
  const normalized = lines.map((l) => l.trim());
  if (normalized.includes(importLine.trim())) {
    return { applied: false, reason: 'import is already present' };
  }
  // Insert after a leading shebang, else at the top.
  const insertAt = lines[0]?.startsWith('#!') ? 1 : 0;
  lines.splice(insertAt, 0, importLine);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return { applied: true };
}

/** Restore a file to its previous content (revert after a failed fix). */
export function revertFile(filePath: string, original: string): void {
  fs.writeFileSync(filePath, original, 'utf-8');
}
