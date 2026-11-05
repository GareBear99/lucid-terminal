/**
 * Forge IPC tests — the llmbuilder: handlers as the renderer calls them.
 *
 * Electron's ipcMain is faked (handlers captured into a map and
 * invoked directly); child_process.spawn is faked so first-run setup
 * can be tested without a real venv or network. The tests use tmp
 * dirs for the builder tree, the state dir, and the models dir —
 * nothing touches the real ~/.lucid.
 *
 * Covered:
 * - status (ready / venv / torch / memory fields)
 * - setup: requirements install from plain PyPI FIRST, torch
 *   separately from the CPU index with --timeout 120 --retries 3,
 *   torch version reported; no python3 → the plain 'no python3' error
 * - importDataset (object form), roster round-trip, listRuns,
 *   scoreboard / promotion decision null when missing
 * - installBrain + rollback (including 'no previous incumbent')
 * - askBrain with no artifact: the honest error
 * - cancelRun on an unknown run id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());

const pythonMock = vi.hoisted(() => ({
  path: '/usr/bin/python3' as string | null,
}));

const spawnState = vi.hoisted(() => ({
  calls: [] as Array<{ command: string; args: string[]; cwd?: string }>,
  torchVersion: '2.15.0+cpu',
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    },
  },
}));

vi.mock('../electron/core/pythonPath', () => ({
  resolvePythonPath: () => pythonMock.path,
  getPythonCommand: () => pythonMock.path ?? 'python3',
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const { PassThrough } = require('stream');
  const { EventEmitter } = require('events');

  function mockSpawn(command: string, args: string[], options: any) {
    spawnState.calls.push({
      command,
      args: [...args],
      cwd: options?.cwd,
    });
    const proc: any = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = { write: () => true };
    proc.exitCode = null;
    proc.killed = false;
    proc.pid = 12345;
    proc.kill = () => {
      proc.killed = true;
      setTimeout(() => proc.emit('exit', null, 'SIGTERM'), 0);
      return true;
    };
    setTimeout(() => {
      if (args.includes('-c')) {
        proc.stdout.write(spawnState.torchVersion + '\n');
      }
      proc.exitCode = 0;
      proc.emit('exit', 0);
    }, 5);
    return proc;
  }

  return { ...actual, spawn: mockSpawn };
});

import { setupLlmbuilderHandlers } from '../electron/ipc/llmbuilder';
import { resolveLlmbuilderPaths } from '../electron/core/llmbuilder/paths';

function makeFixture(): {
  tmp: string;
  builderDir: string;
  dataDir: string;
  modelsDir: string;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llmbuilder-ipc-'));
  const builderDir = path.join(tmp, 'LUCID-BUILDER');
  const dataDir = path.join(tmp, 'llmbuilder');
  const modelsDir = path.join(tmp, 'models');
  const trainScript = path.join(
    builderDir,
    'scripts',
    'training',
    'train_arc_native_candidate.py',
  );
  fs.mkdirSync(path.dirname(trainScript), { recursive: true });
  fs.writeFileSync(trainScript, '# fake script\n', 'utf-8');
  fs.writeFileSync(
    path.join(builderDir, 'requirements.txt'),
    'PyYAML>=6.0\njsonschema>=4.0\nrequests>=2.31.0\nnumpy>=1.0\n',
    'utf-8',
  );
  handlers.clear();
  spawnState.calls = [];
  spawnState.torchVersion = '2.15.0+cpu';
  pythonMock.path = '/usr/bin/python3';
  const paths = resolveLlmbuilderPaths({
    builderDir,
    dataDir,
    modelsDir,
    homeDir: tmp,
  });
  setupLlmbuilderHandlers(
    { handle: (c: string, h: (...a: any[]) => any) => handlers.set(c, h) } as any,
    () => null,
    { builderDir, dataDir, modelsDir, homeDir: tmp },
  );
  void paths;
  return { tmp, builderDir, dataDir, modelsDir };
}

async function invoke(channel: string, ...args: any[]): Promise<any> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({}, ...args);
}

let fixture: ReturnType<typeof makeFixture>;

beforeEach(() => {
  fixture = makeFixture();
});

afterEach(() => {
  fs.rmSync(fixture.tmp, { recursive: true, force: true });
});

describe('status', () => {
  it('reports ready, venv/torch state, python, and memory', async () => {
    const status = await invoke('llmbuilder:status');
    expect(status.ready).toBe(true);
    expect(status.venvReady).toBe(false);
    expect(status.torchReady).toBe(false);
    expect(status.torchInstalled).toBe(false);
    expect(status.pythonPath).toBe('/usr/bin/python3');
    expect(status.pythonAvailable).toBe(true);
    expect(typeof status.freeMemMb).toBe('number');
    expect(typeof status.lowMemory).toBe('boolean');
    expect(status.message).toMatch(/venv not set up/);
    expect(status.builderDir).toBe(fixture.builderDir);
    expect(status.dataDir).toBe(fixture.dataDir);
  });

  it('reports not-ready when the vendored tree is missing', async () => {
    fs.rmSync(
      path.join(fixture.builderDir, 'scripts'),
      { recursive: true, force: true },
    );
    const status = await invoke('llmbuilder:status');
    expect(status.ready).toBe(false);
    expect(status.message).toMatch(/not vendored/);
  });
});

describe('setup', () => {
  it('installs requirements from plain PyPI first, torch separately from the CPU index', async () => {
    const result = await invoke('llmbuilder:setup', { withTorch: true });
    expect(result.ok).toBe(true);
    expect(result.torchVersion).toBe('2.15.0+cpu');
    expect(result.message).toMatch(/2\.15\.0\+cpu/);
    // Four spawns, in order: venv, pip -r, pip torch, version check.
    expect(spawnState.calls).toHaveLength(4);
    const [venv, reqs, torch, version] = spawnState.calls;
    expect(venv.args).toEqual(
      expect.arrayContaining(['-m', 'venv']),
    );
    // Requirements: plain PyPI — no custom index anywhere.
    expect(reqs.args).toEqual(
      expect.arrayContaining(['-m', 'pip', 'install', '-r']),
    );
    expect(reqs.args).not.toContain('--index-url');
    // Torch: separately, CPU index, long timeout, retries.
    expect(torch.args).toEqual([
      '-m',
      'pip',
      'install',
      'torch',
      '--index-url',
      'https://download.pytorch.org/whl/cpu',
      '--timeout',
      '120',
      '--retries',
      '3',
    ]);
    expect(version.args).toEqual(
      expect.arrayContaining(['-c']),
    );
  });

  it('without torch, skips the torch install but still reports the version when present', async () => {
    const result = await invoke('llmbuilder:setup', {});
    expect(result.ok).toBe(true);
    expect(result.torchVersion).toBe('2.15.0+cpu');
    expect(
      spawnState.calls.some((c) => c.args.includes('torch')),
    ).toBe(false);
    expect(result.message).toMatch(/Torch installs when training is set up/);
  });

  it('with no python3, returns the plain no-python3 error', async () => {
    pythonMock.path = null;
    const result = await invoke('llmbuilder:setup', { withTorch: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no python3');
    expect(spawnState.calls).toHaveLength(0);
  });
});

describe('importDataset', () => {
  it('accepts the object form, skips bad lines, lists them in errors', async () => {
    const result = await invoke('llmbuilder:importDataset', {
      homunculusId: 'lucifer',
      filename: 'chatgpt-v1.jsonl',
      content: [
        '{"input": "a", "target": "b"}',
        'broken line',
        '{"prompt": "c", "response": "d"}',
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
    expect(result.records).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/line 2/);
    expect(
      fs.readFileSync(
        path.join(
          fixture.dataDir,
          'datasets',
          'lucifer',
          'chatgpt-v1.jsonl',
        ),
        'utf-8',
      ).trim().split('\n'),
    ).toHaveLength(2);
  });

  it('rejects an empty file', async () => {
    const result = await invoke('llmbuilder:importDataset', {
      homunculusId: 'lucifer',
      filename: 'empty.jsonl',
      content: '\n',
    });
    expect(result.ok).toBe(false);
    expect(result.records).toBe(0);
  });

  it('accepts the positional (name, jsonl) form', async () => {
    const result = await invoke(
      'llmbuilder:importDataset',
      'lucifer-v1',
      '{"input": "a", "target": "b"}\n',
    );
    expect(result.ok).toBe(true);
    expect(result.datasetId).toBe('lucifer-v1');
    expect(
      fs.existsSync(
        path.join(fixture.dataDir, 'datasets', 'lucifer-v1.jsonl'),
      ),
    ).toBe(true);
  });
});

describe('roster and runs', () => {
  it('saveRoster/getRoster round-trips the opaque blob', async () => {
    const roster = [
      { id: 'lucifer', name: 'Lucifer', color: 'purple', lineage: [] },
    ];
    const saved = await invoke('llmbuilder:saveRoster', roster);
    expect(saved.ok).toBe(true);
    const got = await invoke('llmbuilder:getRoster');
    expect(Array.isArray(got)).toBe(true);
    expect(got).toEqual(roster);
  });

  it('getRoster is an empty array before any roster exists', async () => {
    const got = await invoke('llmbuilder:getRoster');
    expect(got).toEqual([]);
  });

  it('listRuns is an empty array at first', async () => {
    const runs = await invoke('llmbuilder:listRuns');
    expect(Array.isArray(runs)).toBe(true);
    expect(runs).toHaveLength(0);
  });

  it('getScoreboard and getPromotionDecision are null with no outputs', async () => {
    expect(await invoke('llmbuilder:getScoreboard')).toBeNull();
    expect(
      await invoke('llmbuilder:getPromotionDecision', 'lucifer-1'),
    ).toBeNull();
  });

  it('cancelRun on an unknown run id reports false', async () => {
    expect(await invoke('llmbuilder:cancelRun', 'run-nope')).toEqual({
      ok: false,
    });
    expect(
      await invoke('llmbuilder:cancelRun', { runId: 'run-nope' }),
    ).toEqual({ ok: false });
  });
});

describe('installBrain and rollback', () => {
  function writeGguf(candidate: string): string {
    const gguf = path.join(
      fixture.builderDir,
      'exports',
      'candidates',
      candidate,
      'lora_train',
      'checkpoint',
      `arc_native_${candidate}.gguf`,
    );
    fs.mkdirSync(path.dirname(gguf), { recursive: true });
    fs.writeFileSync(gguf, `gguf-${candidate}`, 'utf-8');
    return gguf;
  }

  it('installs the promoted GGUF and rolls back to the previous incumbent', async () => {
    writeGguf('lucifer-1');
    const first = await invoke('llmbuilder:installBrain', 'lucifer', 'lucifer-1');
    expect(first.ok).toBe(true);
    expect(first.modelPath).toBe(
      path.join(fixture.modelsDir, 'lucifer.gguf'),
    );
    expect(first.previousModelPath).toBeNull();
    expect(
      fs.readFileSync(first.modelPath, 'utf-8'),
    ).toBe('gguf-lucifer-1');

    writeGguf('lucifer-2');
    const second = await invoke('llmbuilder:installBrain', 'lucifer', 'lucifer-2');
    expect(second.ok).toBe(true);
    expect(second.previousModelPath).toBe(
      path.join(fixture.modelsDir, 'lucifer.gguf.prev'),
    );
    expect(
      fs.readFileSync(
        path.join(fixture.modelsDir, 'lucifer.gguf.prev'),
        'utf-8',
      ),
    ).toBe('gguf-lucifer-1');

    const rolled = await invoke('llmbuilder:rollback', 'lucifer');
    expect(rolled.ok).toBe(true);
    expect(
      fs.readFileSync(
        path.join(fixture.modelsDir, 'lucifer.gguf'),
        'utf-8',
      ),
    ).toBe('gguf-lucifer-1');
  });

  it('installBrain fails honestly with no promoted GGUF', async () => {
    const result = await invoke(
      'llmbuilder:installBrain',
      'lucifer',
      'lucifer-9',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no promoted GGUF/);
  });

  it('rollback with no previous incumbent says so plainly', async () => {
    const result = await invoke('llmbuilder:rollback', 'lucifer');
    expect(result).toEqual({ ok: false, error: 'no previous incumbent' });
  });
});

describe('askBrain', () => {
  it('with no artifact, returns the honest error', async () => {
    const result = await invoke('llmbuilder:askBrain', 'lucifer', 'hello?');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no brain installed yet');
    expect(result.text).toBe('');
  });
});
