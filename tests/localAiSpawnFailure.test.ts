/**
 * Spawn-failure tests (2026-11-04, python3 ENOENT fix).
 *
 * The bug: `startBackend()` spawned bare `python3` with no 'error'
 * listener. A failed spawn (ENOENT — python3 not found) does NOT throw
 * synchronously, so the try/catch never saw it; Node emitted it async
 * as an 'error' event, and with no listener that is an uncaught
 * exception — Electron's "A JavaScript error occurred in the main
 * process" dialog (Gary hit this on the Mac, 2026-11-04). The real
 * cause on the Mac turned out to be an EMPTY launchd PATH for
 * Finder-launched apps, not a missing python3 — so the fix is two
 * parts: resolve python3 to an absolute path first
 * (`core/pythonPath.ts`), and handle the spawn 'error' event so a
 * failure still degrades gracefully instead of crashing.
 *
 * The fake spawn below replicates Node's EventEmitter 'error'
 * semantics: emitting 'error' with no listener THROWS the error.
 * That makes these tests fail on the old code (proving the bug) and
 * pass on the fixed code. `electron` is mocked so `startBackend()`
 * can run in vitest (it only reads `app.isPackaged`).
 *
 * Expected behaviour (checked before running):
 *   - startBackend() does not throw when the process emits ENOENT.
 *   - After the error: health is false, chatLocal rejects with
 *     "Local backend is not running" (fails fast, never queued).
 *   - An error AFTER the backend was ready clears the live state.
 *   - resolvePythonPath() returns the real python3 in this environment
 *     (hand-checked: `which python3` is /usr/bin/python3 in this VM,
 *     /usr/local/bin/python3 on Gary's Mac — the test asserts against
 *     an independent lookup, never a hard-coded path).
 *   - resolvePythonPath() returns null when PATH is empty and no
 *     candidate exists (forced via the injected parameters).
 *
 * SAFETY NOTE: no temp dirs, no deletes of any kind in this file.
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

const spawnCalls = vi.hoisted(() => ({ procs: [] as any[] }));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (..._args: any[]) => {
      const { PassThrough } = require('stream');
      const handlers: Record<string, Function[]> = {};
      const proc: any = {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        stdin: { write: () => true },
        on: (event: string, fn: Function) => {
          (handlers[event] ??= []).push(fn);
          return proc;
        },
        emit: (event: string, ...args: any[]) => {
          const fns = handlers[event] ?? [];
          if (event === 'error' && fns.length === 0) {
            // Node's EventEmitter throws when 'error' is emitted with
            // no listener — this is the crash the fix prevents.
            throw args[0];
          }
          for (const fn of fns) fn(...args);
          return true;
        },
        kill: () => true,
      };
      spawnCalls.procs.push(proc);
      return proc;
    },
  };
});

import {
  startBackend,
  stopBackend,
  checkLocalBackendHealth,
  chatLocal,
} from '../electron/services/local_ai';
import {
  resolvePythonPath,
  getPythonCommand,
} from '../electron/core/pythonPath';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeProc(): any {
  const proc = spawnCalls.procs[spawnCalls.procs.length - 1];
  if (!proc) throw new Error('no fake backend process spawned');
  return proc;
}

/** The exact failure Gary saw: spawn python3 ENOENT. */
function enoentError(): Error {
  const err = new Error('spawn python3 ENOENT');
  (err as unknown as { code: string }).code = 'ENOENT';
  return err;
}

/** Independent oracle for the resolver: the PATH lookup first, then
 * the well-known locations newest-first — the documented order in
 * pythonPath.ts, computed here without calling the resolver. On the
 * Mac this is /usr/local/bin/python3; in this VM /usr/bin/python3. */
function expectedPythonPath(): string {
  try {
    const found = execFileSync('/usr/bin/which', ['python3'], {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')[0]
      ?.trim();
    if (found && fs.existsSync(found)) return found;
  } catch {
    // `which` failed — fall through to the absolute candidates.
  }
  for (const candidate of [
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('no python3 found in this environment');
}

describe('startBackend spawn failure (python3 ENOENT)', () => {
  beforeEach(() => {
    spawnCalls.procs.length = 0;
  });

  afterEach(() => {
    try {
      stopBackend();
    } catch {
      // Already down.
    }
    for (const proc of spawnCalls.procs) {
      try {
        proc.stdout.destroy();
      } catch {
        // Already gone.
      }
      try {
        proc.stderr.destroy();
      } catch {
        // Already gone.
      }
    }
    spawnCalls.procs.length = 0;
  });

  test('a spawn ENOENT does not crash: backend is marked down, chat fails fast', async () => {
    expect(() => startBackend()).not.toThrow();
    const proc = fakeProc();
    // No uncaught exception: emitting 'error' with the handler
    // attached must not throw (the fake throws when no listener
    // exists — the old code fails here).
    expect(() => proc.emit('error', enoentError())).not.toThrow();
    expect(await checkLocalBackendHealth()).toBe(false);
    await expect(
      chatLocal([{ role: 'user', content: 'hello' }])
    ).rejects.toThrow('Local backend is not running');
  });

  test('a spawn error after the backend was ready clears the live state', async () => {
    startBackend();
    const proc = fakeProc();
    proc.stdout.write(`${JSON.stringify({ type: 'ready' })}\n`);
    await sleep(10);
    expect(await checkLocalBackendHealth()).toBe(true);

    expect(() => proc.emit('error', enoentError())).not.toThrow();
    expect(await checkLocalBackendHealth()).toBe(false);
    await expect(
      chatLocal([{ role: 'user', content: 'hello' }])
    ).rejects.toThrow('Local backend is not running');
  });
});

describe('resolvePythonPath / getPythonCommand', () => {
  test('resolves to the real python3 in this environment', () => {
    const resolved = resolvePythonPath();
    expect(resolved).not.toBeNull();
    expect(resolved!.endsWith('python3')).toBe(true);
    expect(fs.existsSync(resolved!)).toBe(true);
    // Asserted against the independent lookup, not a hard-coded
    // path — /usr/bin/python3 here, /usr/local/bin/python3 on the Mac.
    expect(resolved).toBe(expectedPythonPath());
  });

  test('returns null when PATH is empty and no candidate exists', () => {
    expect(resolvePythonPath(['/nonexistent/python3'], '')).toBeNull();
  });

  test('getPythonCommand returns the resolved absolute path', () => {
    expect(getPythonCommand()).toBe(expectedPythonPath());
  });

  test('getPythonCommand falls back to the bare command when nothing resolves', () => {
    expect(getPythonCommand(['/nonexistent/python3'], '')).toBe('python3');
  });
});
