/**
 * AI-chat queue tests (2026-11-04, task-manager step).
 *
 * `chatLocal()` used to throw "Backend is busy processing another
 * request" on a concurrent call (single-slot mutex, in front of a
 * declared-but-never-used `requestQueue`). It now enqueues on the
 * task queue's single worker, so concurrent calls wait their turn
 * instead of failing.
 *
 * The stdio backend is faked, not spawned: `child_process.spawn` is
 * mocked to return a fake process whose stdout is a PassThrough
 * stream, so the test drives the backend by pushing JSON lines into
 * it — no real Python, no real model, deterministic. `electron` is
 * mocked so `startBackend()` can run in vitest (it only reads
 * `app.isPackaged`).
 *
 * SAFETY NOTE: no temp dirs, no deletes of any kind in this file.
 */

import { vi } from 'vitest';

const spawnCalls = vi.hoisted(() => ({ procs: [] as any[] }));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('child_process', () => ({
  spawn: (..._args: any[]) => {
    const { PassThrough } = require('stream');
    const proc: any = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: {
        write: (data: string) => {
          proc.writes.push(data);
          return true;
        },
      },
      writes: [] as string[],
      on: () => proc,
      kill: () => true,
    };
    spawnCalls.procs.push(proc);
    return proc;
  },
}));

import {
  startBackend,
  stopBackend,
  checkLocalBackendHealth,
  chatLocal,
  cancelLocalChat,
} from '../electron/services/local_ai';
import { TaskCancelledError } from '../electron/core/tasks/taskQueue';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeProc(): any {
  const proc = spawnCalls.procs[spawnCalls.procs.length - 1];
  if (!proc) throw new Error('no fake backend process spawned');
  return proc;
}

/** Push a JSON line into the fake backend's stdout (as the real agent would). */
async function backendReply(proc: any, payload: unknown): Promise<void> {
  proc.stdout.write(`${JSON.stringify(payload)}\n`);
  await sleep(10);
}

describe('chatLocal queueing (fake stdio backend)', () => {
  beforeEach(async () => {
    spawnCalls.procs.length = 0;
    startBackend();
    await backendReply(fakeProc(), { type: 'ready' });
    expect(await checkLocalBackendHealth()).toBe(true);
  });

  afterEach(() => {
    stopBackend();
    // Tear down the fake streams so the readline interface does not
    // keep the worker alive between test files.
    for (const proc of spawnCalls.procs) {
      try {
        proc.stdout.destroy();
      } catch {
        /* already gone */
      }
      try {
        proc.stderr.destroy();
      } catch {
        /* already gone */
      }
    }
    spawnCalls.procs.length = 0;
  });

  test('concurrent chat calls queue instead of throwing "Backend is busy"', async () => {
    const proc = fakeProc();
    const first = chatLocal([{ role: 'user', content: 'hello one' }]);
    const second = chatLocal([{ role: 'user', content: 'hello two' }]);

    // The second call must NOT throw "Backend is busy" — it queues.
    // Only the first payload has been written so far.
    await sleep(10);
    expect(proc.writes.length).toBe(1);
    expect(proc.writes[0]).toContain('hello one');

    // Answer the first; the second then runs and writes its payload.
    await backendReply(proc, { status: 'success', response: 'reply one' });
    expect(await first).toBe('reply one');
    await sleep(10);
    expect(proc.writes.length).toBe(2);
    expect(proc.writes[1]).toContain('hello two');

    await backendReply(proc, { status: 'success', response: 'reply two' });
    expect(await second).toBe('reply two');
  });

  test('a backend error rejects only that call and the queue continues', async () => {
    const proc = fakeProc();
    const failing = chatLocal([{ role: 'user', content: 'fail me' }]);
    const after = chatLocal([{ role: 'user', content: 'after me' }]);
    await backendReply(proc, { status: 'error', error: 'bad prompt' });
    await expect(failing).rejects.toThrow('bad prompt');
    await sleep(10);
    expect(proc.writes.length).toBe(2);
    await backendReply(proc, { status: 'success', response: 'after reply' });
    await expect(after).resolves.toBe('after reply');
  });

  test('cancelLocalChat drops the queued chat and the running one resolves', async () => {
    const proc = fakeProc();
    const running = chatLocal([{ role: 'user', content: 'running' }]);
    const queued = chatLocal([{ role: 'user', content: 'queued' }]);
    await sleep(10);
    expect(proc.writes.length).toBe(1);

    expect(cancelLocalChat()).toBe(true);
    // Queued chat never runs: its promise rejects as cancelled.
    await expect(queued).rejects.toBeInstanceOf(TaskCancelledError);
    // Running chat is best-effort cancelled: its reply is dropped.
    await backendReply(proc, { status: 'success', response: 'too late' });
    await expect(running).rejects.toBeInstanceOf(TaskCancelledError);
    // The queued payload was never written.
    expect(proc.writes.length).toBe(1);
  });

  test('chatLocal fails fast when the backend is down, not queued', async () => {
    stopBackend();
    expect(await checkLocalBackendHealth()).toBe(false);
    await expect(
      chatLocal([{ role: 'user', content: 'nobody home' }])
    ).rejects.toThrow('Local backend is not running');
  });
});
