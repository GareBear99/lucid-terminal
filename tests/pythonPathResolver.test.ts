/**
 * Resolver tests for the three remaining bare-`python3` call sites
 * (2026-11-05, python-path fix wave 1 follow-up).
 *
 * The bug: scriptExecutor, fileFixer and commandTools spawned a bare
 * `python3`. GUI apps launched via Finder / `open` get NO PATH from
 * launchd, so that spawn fails with ENOENT even though python3 exists
 * on disk. local_ai.ts and daemon.ts already resolved it to an
 * absolute path via core/pythonPath.ts; these three now do the same.
 *
 * Expected behaviour (checked before running):
 *   - With a normal PATH, every python spawn in all three call sites
 *     uses the resolved absolute path (the independent oracle below),
 *     never the bare string 'python3'.
 *   - With a GUI-launch PATH (process.env.PATH = ''), the spawns
 *     STILL resolve via the well-known locations — no ENOENT.
 *   - runPythonCode with no python anywhere (resolver forced to
 *     null) fails honestly without spawning anything.
 *
 * The spawn/exec fakes capture the command instead of running it, so
 * these tests never execute real Python. The oracle is computed
 * without calling the resolver (PATH lookup via /usr/bin/which, then
 * the well-known locations newest-first — the documented order in
 * pythonPath.ts), so the test passes in this VM (/usr/bin/python3)
 * and on Gary's Mac (/usr/local/bin/python3).
 *
 * SAFETY: temp dirs only under os.tmpdir(), cleanup guarded to that
 * prefix — nothing outside os.tmpdir() is ever deleted.
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const spawnCalls = vi.hoisted(() => ({ calls: [] as { command: string; args: string[] }[] }));
const execCalls = vi.hoisted(() => ({ commands: [] as string[] }));
const pythonPathMock = vi.hoisted(() => ({ forceNull: false }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => {
      const { PassThrough } = require('stream');
      const handlers: Record<string, Function[]> = {};
      const proc: any = {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        on: (event: string, fn: Function) => {
          (handlers[event] ??= []).push(fn);
          return proc;
        },
        kill: () => true,
      };
      spawnCalls.calls.push({ command: args[0], args: args[1] ?? [] });
      // Succeed immediately, like a script that exits 0.
      setImmediate(() => {
        for (const fn of handlers['close'] ?? []) fn(0);
      });
      return proc;
    },
    exec: (...args: any[]) => {
      const cmd = args[0] as string;
      const cb = typeof args[1] === 'function' ? args[1] : args[2];
      execCalls.commands.push(cmd);
      // commandTools promisifies exec. The real exec carries
      // promisify.customPromisifyArgs = ['stdout', 'stderr'], so the
      // promisified call resolves to { stdout, stderr }; this fake
      // has no such marker, so pass that object as the single
      // success value to get the same resolved shape.
      cb(null, { stdout: '', stderr: '' });
    },
  };
});

vi.mock('../electron/core/pythonPath', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../electron/core/pythonPath')>();
  return {
    ...actual,
    resolvePythonPath: (...args: any[]) =>
      pythonPathMock.forceNull
        ? null
        : (actual.resolvePythonPath as any)(...args),
    getPythonCommand: (...args: any[]) =>
      pythonPathMock.forceNull
        ? 'python3'
        : (actual.getPythonCommand as any)(...args),
  };
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptExecutor } from '../electron/core/executor/scriptExecutor';
import { interpreterFor, runFile } from '../electron/core/fixnet/fileFixer';
import { runPythonCode, runScript } from '../electron/core/tools/commandTools';

/** Independent oracle for the resolver — see the file header. */
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

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'py-resolver-test-'));
}

/** Delete a temp dir, but ONLY if it lives under os.tmpdir(). */
function safeRemoveDir(dir: string): void {
  const tmp = fs.realpathSync(os.tmpdir());
  const real = fs.realpathSync(dir);
  if (real !== tmp && real.startsWith(tmp + path.sep)) {
    fs.rmSync(real, { recursive: true, force: true });
  }
}

describe('python resolver in the three remaining call sites', () => {
  const savedPath = process.env.PATH;
  let tmp: string;

  beforeEach(() => {
    spawnCalls.calls.length = 0;
    execCalls.commands.length = 0;
    pythonPathMock.forceNull = false;
    tmp = makeTempDir();
  });

  afterEach(() => {
    process.env.PATH = savedPath;
    pythonPathMock.forceNull = false;
    safeRemoveDir(tmp);
  });

  it('scriptExecutor spawns the resolved python, not bare python3', async () => {
    const expected = expectedPythonPath();
    const executor = new ScriptExecutor({} as any);
    const result = await executor.executeScriptBuild({
      code: 'print("ok")\n',
      filename: 'hello.py',
      directory: tmp,
      language: 'python',
      shouldTest: true,
    });
    expect(result.success).toBe(true);
    // Two python spawns: py_compile validation + test execution.
    const pythonSpawns = spawnCalls.calls.filter(
      (c) => c.command !== 'node' && c.command !== 'bash'
    );
    expect(pythonSpawns.length).toBe(2);
    for (const spawn of pythonSpawns) {
      expect(spawn.command).toBe(expected);
      expect(spawn.command).not.toBe('python3');
    }
  });

  it('scriptExecutor still resolves with a GUI-launch PATH (empty PATH)', async () => {
    process.env.PATH = '';
    const expected = expectedPythonPath();
    const executor = new ScriptExecutor({} as any);
    const result = await executor.executeScriptBuild({
      code: 'print("ok")\n',
      filename: 'hello.py',
      directory: tmp,
      language: 'python',
      shouldTest: true,
    });
    expect(result.success).toBe(true);
    const pythonSpawns = spawnCalls.calls;
    expect(pythonSpawns.length).toBe(2);
    for (const spawn of pythonSpawns) {
      expect(spawn.command).toBe(expected);
    }
  });

  it('fileFixer interpreterFor returns the resolved python', () => {
    const expected = expectedPythonPath();
    const interp = interpreterFor(path.join(tmp, 'fix.py'));
    expect(interp).not.toBeNull();
    expect(interp!.command).toBe(expected);
    expect(interp!.command).not.toBe('python3');
    // Other interpreters are untouched.
    expect(interpreterFor(path.join(tmp, 'fix.js'))!.command).toBe('node');
    expect(interpreterFor(path.join(tmp, 'fix.sh'))!.command).toBe('bash');
  });

  it('fileFixer still resolves with a GUI-launch PATH (empty PATH)', () => {
    process.env.PATH = '';
    expect(interpreterFor(path.join(tmp, 'fix.py'))!.command).toBe(
      expectedPythonPath()
    );
  });

  it('fileFixer runFile spawns the resolved python', async () => {
    const file = path.join(tmp, 'good.py');
    fs.writeFileSync(file, 'print("ok")\n');
    const result = await runFile(file);
    expect(result.ok).toBe(true);
    expect(spawnCalls.calls.length).toBe(1);
    expect(spawnCalls.calls[0].command).toBe(expectedPythonPath());
  });

  it('runPythonCode runs the resolved python, not bare python3', async () => {
    const expected = expectedPythonPath();
    const result = await runPythonCode('print("ok")');
    expect(result.success).toBe(true);
    expect(execCalls.commands.length).toBe(1);
    expect(execCalls.commands[0]).toBe(
      `"${expected}" -c "print(\\"ok\\")"`
    );
    expect(execCalls.commands[0]).not.toMatch(/^python3 /);
  });

  it('runPythonCode still resolves with a GUI-launch PATH (empty PATH)', async () => {
    process.env.PATH = '';
    const expected = expectedPythonPath();
    const result = await runPythonCode('print("ok")');
    expect(result.success).toBe(true);
    expect(execCalls.commands[0]).toContain(`"${expected}" -c`);
  });

  it('runPythonCode fails honestly when no python exists anywhere', async () => {
    pythonPathMock.forceNull = true;
    const result = await runPythonCode('print("ok")');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Python 3 not found');
    // Nothing was spawned — the failure happens before any exec.
    expect(execCalls.commands.length).toBe(0);
  });

  it('runScript runs a .py file with the resolved python', async () => {
    const expected = expectedPythonPath();
    const script = path.join(tmp, 'job.py');
    fs.writeFileSync(script, 'print("ok")\n');
    const result = await runScript(script, ['--flag']);
    expect(result.success).toBe(true);
    expect(execCalls.commands.length).toBe(1);
    expect(execCalls.commands[0]).toBe(
      `"${expected}" ${script} --flag`
    );
    expect(execCalls.commands[0]).not.toMatch(/^python3 /);
  });

  it('runScript still resolves with a GUI-launch PATH (empty PATH)', async () => {
    process.env.PATH = '';
    const expected = expectedPythonPath();
    const script = path.join(tmp, 'job.py');
    fs.writeFileSync(script, 'print("ok")\n');
    const result = await runScript(script);
    expect(result.success).toBe(true);
    expect(execCalls.commands[0]).toContain(`"${expected}" ${script}`);
  });
});
