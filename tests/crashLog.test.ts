// Advanced crash log tests (Gary, 2026-11-16: "should make
// an advanced crash log").
//
// Covers: the entry format (golden sample — the one
// formatter, pinned so it cannot drift silently); the
// writer (creates the per-run file + header + latest.log
// symlink, appends, fsyncs); rotation (newest 20 kept);
// forced-exit survival (a child that writes then dies at
// once still leaves the entry on disk — no buffering loss);
// the main-process fatal handlers (a child that throws /
// rejects writes the entry and exits non-zero); the IPC
// surface (fake ipcMain — list / read / report / context,
// invalid payloads rejected, path traversal refused); and
// the read tail cap.
//
// Run with: npx vitest run tests/crashLog.test.ts
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import type { IpcMain } from 'electron';
import {
  CRASH_LOG_MAX_FILES,
  CRASH_LOG_MAX_READ_BYTES,
  CrashLogWriter,
  createCrashEntry,
  createDefaultCrashContext,
  formatCrashEntry,
  formatCrashLogHeader,
  getCrashLogDir,
  installMainCrashHandlers,
  listCrashLogs,
  readCrashLog,
  setCrashContext,
} from '../electron/services/crashLog';
import {
  setupCrashLogHandlers,
  validateCrashContextUpdate,
  validateRendererCrashReport,
} from '../electron/ipc/crashLog';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-crashlog-'));
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function fixedContext() {
  return createDefaultCrashContext({
    sessionId: 'fixedsession',
    appVersion: '1.1.0',
    commit: 'c46ae9e',
    profile: 'Default',
    view: 'terminal',
    platform: 'darwin',
    arch: 'x64',
    electronVersion: '35.0.0',
    chromeVersion: '134.0.0',
    nodeVersion: '22.0.0',
  });
}

describe('crash log format', () => {
  test('formatCrashEntry pins the one format — timestamp, kind, context line, message, stack', () => {
    const entry = createCrashEntry({
      kind: 'main-uncaught-exception',
      message: 'Uncaught exception: boom',
      stack: 'Error: boom\n    at foo (bar.js:1:2)',
      detail: 'extra detail',
      at: Date.parse('2026-11-16T18:35:00.123Z'),
      context: fixedContext(),
    });
    const text = formatCrashEntry(entry);
    expect(text).toContain('[2026-11-16T18:35:00.123Z]');
    expect(text).toContain('[session fixedsession]');
    expect(text).toContain('[main-uncaught-exception]');
    expect(text).toContain('app lucid-terminal 1.1.0 (commit c46ae9e)');
    expect(text).toContain('darwin x64');
    expect(text).toContain('electron 35.0.0');
    expect(text).toContain('profile Default');
    expect(text).toContain('view terminal');
    expect(text).toContain('Uncaught exception: boom');
    expect(text).toContain('Error: boom\n    at foo (bar.js:1:2)');
    expect(text).toContain('detail: extra detail');
  });

  test('formatCrashLogHeader explains the file — session, version, location', () => {
    const header = formatCrashLogHeader(fixedContext(), Date.parse('2026-11-16T18:35:00.000Z'));
    expect(header).toContain('Lucid crash log');
    expect(header).toContain('session fixedsession');
    expect(header).toContain('app lucid-terminal 1.1.0 (commit c46ae9e)');
    expect(header).toContain(getCrashLogDir());
    expect(header).toContain('latest.log');
  });

  test('an unknown context field is the literal unknown, never invented', () => {
    const ctx = createDefaultCrashContext({ sessionId: 's1' });
    expect(ctx.profile).toBe('unknown');
    expect(ctx.view).toBe('unknown');
    expect(ctx.commit).toBe('unknown');
  });
});

describe('crash log writer', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => {
    removeDir(dir);
  });

  test('append creates the per-run file with a header, and latest.log points at it', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'run1' });
    // The context session matches the writer's — in
    // production main.ts wires the writer's session into the
    // context, so the file name, the header and the entries
    // all agree on the run.
    setCrashContext({ ...fixedContext(), sessionId: 'run1' });
    const ok = writer.append(
      createCrashEntry({ kind: 'startup', message: 'Lucid started — session run1.' }),
    );
    expect(ok).toBe(true);
    const files = listCrashLogs(writer.dir);
    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/^crash-.*-run1\.log$/);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('Lucid crash log');
    expect(text).toContain('Lucid started — session run1.');
    const link = fs.readlinkSync(path.join(writer.dir, 'latest.log'));
    expect(link).toBe(files[0].name);
  });

  test('a second append goes to the same run file', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'run2' });
    setCrashContext({ ...fixedContext(), sessionId: 'run2' });
    writer.append(createCrashEntry({ kind: 'startup', message: 'first' }));
    writer.append(
      createCrashEntry({ kind: 'renderer-error', message: 'second', stack: 'Error: x' }),
    );
    const files = listCrashLogs(writer.dir);
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('first');
    expect(text).toContain('second');
    expect(text).toContain('Error: x');
  });

  test('prune keeps the newest 20 runs and deletes the rest', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'prune-run' });
    writer.ensureDir();
    for (let i = 0; i < 25; i++) {
      const name = `crash-2026-11-16T00-00-${String(i).padStart(2, '0')}-old${i}.log`;
      const full = path.join(writer.dir, name);
      fs.writeFileSync(full, `old ${i}`);
      // Stagger mtimes so the order is deterministic.
      const t = new Date(Date.UTC(2026, 10, 16, 0, 0, i));
      fs.utimesSync(full, t, t);
    }
    expect(listCrashLogs(writer.dir)).toHaveLength(25);
    const removed = writer.prune();
    expect(removed).toBe(25 - CRASH_LOG_MAX_FILES);
    const kept = listCrashLogs(writer.dir);
    expect(kept).toHaveLength(CRASH_LOG_MAX_FILES);
    // The newest 5 (i=20..24) survive; the oldest is gone.
    expect(kept.map((f) => f.name)).not.toContain('crash-2026-11-16T00-00-00-old0.log');
    expect(kept.map((f) => f.name)).toContain('crash-2026-11-16T00-00-24-old24.log');
  });

  test('readCrashLog returns the tail when the file exceeds the cap', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'big-run' });
    writer.ensureDir();
    const name = 'crash-2026-11-16T00-00-00-big.log';
    const big = 'x'.repeat(CRASH_LOG_MAX_READ_BYTES + 5000) + 'THE-CRASH-IS-HERE';
    fs.writeFileSync(path.join(writer.dir, name), big);
    const read = readCrashLog(name, writer.dir);
    expect(read).not.toBeNull();
    expect(read!.truncated).toBe(true);
    expect(read!.text.length).toBeLessThanOrEqual(CRASH_LOG_MAX_READ_BYTES);
    // The tail — where the crash is — survives the cap.
    expect(read!.text).toContain('THE-CRASH-IS-HERE');
  });

  test('readCrashLog refuses a name that escapes the log dir', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'trav-run' });
    writer.ensureDir();
    expect(readCrashLog('../package.json', writer.dir)).toBeNull();
    expect(readCrashLog('/etc/passwd', writer.dir)).toBeNull();
    expect(readCrashLog('not-a-crash.txt', writer.dir)).toBeNull();
  });

  test('a forced exit right after a write still leaves the entry on disk', () => {
    // The child writes one entry, then process.exit(0) at
    // once — if the writer buffered, the entry would be lost.
    const childDir = makeTempDir();
    try {
      const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
      const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'crashLogChild.ts');
      const res = spawnSync(tsx, [fixture, 'append-exit', childDir], {
        encoding: 'utf8',
        timeout: 30000,
      });
      expect(res.status).toBe(0);
      const files = listCrashLogs(path.join(childDir, '.lucid', 'crash-log'));
      expect(files).toHaveLength(1);
      const text = fs.readFileSync(files[0].path, 'utf8');
      expect(text).toContain('child started — append-exit');
    } finally {
      removeDir(childDir);
    }
  });
});

describe('main-process fatal handlers', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => {
    removeDir(dir);
  });

  test('an uncaught exception writes the entry and exits non-zero', () => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'crashLogChild.ts');
    const res = spawnSync(tsx, [fixture, 'throw', dir], {
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(res.status).toBe(1);
    const files = listCrashLogs(path.join(dir, '.lucid', 'crash-log'));
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('[main-uncaught-exception]');
    expect(text).toContain('boom-child-uncaught');
  });

  test('an unhandled rejection writes the entry and exits non-zero', () => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'crashLogChild.ts');
    const res = spawnSync(tsx, [fixture, 'reject', dir], {
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(res.status).toBe(1);
    const files = listCrashLogs(path.join(dir, '.lucid', 'crash-log'));
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('[main-unhandled-rejection]');
    expect(text).toContain('boom-child-rejection');
  });

  test('install returns an uninstall that removes the handlers', () => {
    const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'uninstall-run' });
    const before = process.listenerCount('uncaughtException');
    const uninstall = installMainCrashHandlers(writer);
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
    uninstall();
    expect(process.listenerCount('uncaughtException')).toBe(before);
  });
});

describe('crash log IPC', () => {
  let dir: string;
  let writer: CrashLogWriter;
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let listeners: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    dir = makeTempDir();
    writer = new CrashLogWriter({ homeDir: dir, sessionId: 'ipc-run' });
    setCrashContext({ ...fixedContext(), sessionId: 'ipc-run' });
    handlers = new Map();
    listeners = new Map();
    const fakeIpcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      },
      on: (channel: string, fn: (...args: unknown[]) => unknown) => {
        listeners.set(channel, fn);
      },
    } as unknown as IpcMain;
    setupCrashLogHandlers(fakeIpcMain, writer);
  });
  afterEach(() => {
    removeDir(dir);
  });

  test('list + readLatest round-trip through the handlers', async () => {
    writer.append(createCrashEntry({ kind: 'startup', message: 'ipc test run' }));
    const list = (await (handlers.get('crashLog:list') as () => unknown)()) as {
      name: string;
    }[];
    expect(list).toHaveLength(1);
    const read = (await (handlers.get('crashLog:readLatest') as () => unknown)()) as {
      name: string | null;
      text: string;
    };
    expect(read.name).toBe(list[0].name);
    expect(read.text).toContain('ipc test run');
  });

  test('getPaths reports the log dir and latest.log', async () => {
    const paths = (await (handlers.get('crashLog:getPaths') as () => unknown)()) as {
      dir: string;
      latestPath: string;
    };
    expect(paths.dir).toBe(writer.dir);
    expect(paths.latestPath).toBe(path.join(writer.dir, 'latest.log'));
  });

  test('reportRendererError appends a renderer entry to the same file', async () => {
    const res = (await (handlers.get('crashLog:reportRendererError') as (
      _e: unknown,
      p: unknown,
    ) => unknown)(undefined, {
      kind: 'renderer-error',
      message: 'Cannot read properties of undefined',
      stack: 'TypeError: x\n    at y (z.js:1:1)',
      url: 'file:///dist/index.html',
      view: 'terminal',
      profile: 'Default',
    })) as { ok: boolean };
    expect(res.ok).toBe(true);
    const files = listCrashLogs(writer.dir);
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('[renderer-error]');
    expect(text).toContain('Cannot read properties of undefined');
    expect(text).toContain('TypeError: x');
    expect(text).toContain('url: file:///dist/index.html');
  });

  test('reportRendererError rejects invalid payloads and writes nothing', async () => {
    const report = handlers.get('crashLog:reportRendererError') as (
      _e: unknown,
      p: unknown,
    ) => unknown;
    for (const bad of [
      null,
      'nope',
      { kind: 'main-uncaught-exception', message: 'wrong side' },
      { kind: 'renderer-error' },
      { kind: 'renderer-error', message: '' },
      { kind: 'renderer-error', message: 42 },
    ]) {
      const res = (await report(undefined, bad)) as { ok: boolean };
      expect(res.ok).toBe(false);
    }
    expect(listCrashLogs(writer.dir)).toHaveLength(0);
  });

  test('readFile refuses traversal and unknown files', async () => {
    const read = handlers.get('crashLog:readFile') as (
      _e: unknown,
      name: unknown,
    ) => unknown;
    for (const bad of ['../package.json', '/etc/passwd', 'nope.txt', 42, null]) {
      const res = (await read(undefined, bad)) as { name: string | null; text: string };
      expect(res.name).toBeNull();
      expect(res.text).toBe('');
    }
  });

  test('setContext updates the profile + view main stamps on entries', async () => {
    const on = listeners.get('crashLog:setContext') as (
      _e: unknown,
      update: unknown,
    ) => unknown;
    on(undefined, { profile: 'Gary', view: 'settings' });
    writer.append(createCrashEntry({ kind: 'startup', message: 'context check' }));
    const files = listCrashLogs(writer.dir);
    const text = fs.readFileSync(files[0].path, 'utf8');
    expect(text).toContain('profile Gary');
    expect(text).toContain('view settings');
  });

  test('validateRendererCrashReport caps a huge message', () => {
    const big = 'x'.repeat(100_000);
    const valid = validateRendererCrashReport({
      kind: 'renderer-error',
      message: big,
      stack: big,
    });
    expect(valid).not.toBeNull();
    expect(valid!.message.length).toBeLessThanOrEqual(20_000);
    expect(valid!.stack!.length).toBeLessThanOrEqual(20_000);
  });

  test('validateCrashContextUpdate takes profile/view strings only', () => {
    expect(validateCrashContextUpdate({ profile: 'Gary', view: 'terminal' })).toEqual({
      profile: 'Gary',
      view: 'terminal',
    });
    expect(validateCrashContextUpdate({ profile: 42, view: null })).toBeNull();
    expect(validateCrashContextUpdate('nope')).toBeNull();
  });
});
