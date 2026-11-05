/**
 * Commit tracking wiring — the Settings checkbox actually controls the
 * watcher (2026-11-05).
 *
 * Hand-checkable case, defined before running: toggle the setting on →
 * the daemon reports commit tracking on and the watcher is started with
 * --commit-tracking; toggle it off → the daemon reports it off and the
 * flag is not passed. The setting is written through the settings store,
 * so it survives a restart (same persistence path as the other daemon
 * settings).
 *
 * The spawn itself is not run here — buildWatcherArgs is the pure seam
 * where the flag is added, and getDaemonStatus / setCommitTracking are
 * exercised with a mocked settings store and a mocked pgrep (no watcher
 * process exists in the test env). The watcher side (a real commit
 * producing a real watch_commit event) is checked by hand against the
 * Python watcher, not in this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

const settingsStore = new Map<string, unknown>();

vi.mock('../electron/services/secureStorage', () => ({
  settings: {
    get: (key: string) => settingsStore.get(key),
    set: (key: string, value: unknown) => {
      settingsStore.set(key, value);
    },
    getAll: () => Object.fromEntries(settingsStore),
    delete: (key: string) => {
      settingsStore.delete(key);
    },
    reset: () => {
      settingsStore.clear();
    },
  },
}));

vi.mock('../electron/core/pythonPath', () => ({
  getPythonCommand: () => 'python3',
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('child_process', () => ({
  // pgrep finds no watcher: exit code 1, empty stdout.
  execFile: (_file: string, _args: string[], cb: (err: unknown, stdout: string, stderr: string) => void) =>
    cb(Object.assign(new Error('no match'), { code: 1 }), '', ''),
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

import {
  buildWatcherArgs,
  getDaemonStatus,
  setCommitTracking,
  setupDaemonHandlers,
} from '../electron/ipc/daemon';

type Handler = (...args: never[]) => Promise<unknown>;

let handlers: Record<string, Handler> = {};

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers[channel] = handler;
  }),
} as unknown as IpcMain;

beforeEach(() => {
  settingsStore.clear();
  handlers = {};
  vi.clearAllMocks();
  setupDaemonHandlers(mockIpcMain);
});

describe('buildWatcherArgs', () => {
  it('passes --commit-tracking only when the setting is on', () => {
    const on = buildWatcherArgs('/x/lucifer_watcher.py', ['/repo'], 'watch', true);
    expect(on).toEqual([
      '-u',
      '/x/lucifer_watcher.py',
      '--paths',
      '/repo',
      '--mode',
      'watch',
      '--commit-tracking',
    ]);

    const off = buildWatcherArgs('/x/lucifer_watcher.py', ['/repo'], 'watch', false);
    expect(off).not.toContain('--commit-tracking');
    expect(off).toEqual(['-u', '/x/lucifer_watcher.py', '--paths', '/repo', '--mode', 'watch']);
  });

  it('keeps the flag alongside autofix mode', () => {
    const args = buildWatcherArgs('/x/lucifer_watcher.py', ['/a', '/b'], 'autofix', true);
    expect(args).toContain('--mode');
    expect(args).toContain('autofix');
    expect(args).toContain('--commit-tracking');
  });
});

describe('getDaemonStatus commitTracking', () => {
  it('reports off when the setting is unset (default false)', async () => {
    const status = await getDaemonStatus();
    expect(status.running).toBe(false);
    expect(status.commitTracking).toBe(false);
  });

  it('reports on when the setting is true', async () => {
    settingsStore.set('daemonCommitTracking', true);
    const status = await getDaemonStatus();
    expect(status.commitTracking).toBe(true);
  });

  it('reports off when the setting is false', async () => {
    settingsStore.set('daemonCommitTracking', true);
    expect((await getDaemonStatus()).commitTracking).toBe(true);
    settingsStore.set('daemonCommitTracking', false);
    expect((await getDaemonStatus()).commitTracking).toBe(false);
  });
});

describe('daemon:setCommitTracking handler', () => {
  it('toggles on: writes the setting and reports tracking on, no restart while stopped', async () => {
    const result = (await handlers['daemon:setCommitTracking'](null, true)) as {
      commitTracking: boolean;
      restarted: boolean;
    };
    expect(result).toEqual({ commitTracking: true, restarted: false });
    expect(settingsStore.get('daemonCommitTracking')).toBe(true);
    // The stored value is what the next status read reports — the
    // setting survives (it is read back from the store, not held in memory).
    expect((await getDaemonStatus()).commitTracking).toBe(true);
  });

  it('toggles off: writes the setting and reports tracking off', async () => {
    await handlers['daemon:setCommitTracking'](null, true);
    expect((await getDaemonStatus()).commitTracking).toBe(true);

    const result = (await handlers['daemon:setCommitTracking'](null, false)) as {
      commitTracking: boolean;
      restarted: boolean;
    };
    expect(result).toEqual({ commitTracking: false, restarted: false });
    expect(settingsStore.get('daemonCommitTracking')).toBe(false);
    expect((await getDaemonStatus()).commitTracking).toBe(false);
  });

  it('setCommitTracking export agrees with the handler', async () => {
    const result = await setCommitTracking(true);
    expect(result).toEqual({ commitTracking: true, restarted: false });
    expect(settingsStore.get('daemonCommitTracking')).toBe(true);
  });
});
