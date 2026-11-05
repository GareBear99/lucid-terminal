/**
 * Task-queue tests (2026-11-04, task-manager step).
 *
 * The queue is the handoff point for routed/LLM work: the bypass
 * router enqueues routing decisions (`executeQueued`) and AI chat
 * enqueues stdio round-trips (`chatLocal`) instead of failing
 * concurrent callers. Tests pin:
 *
 * 1. FIFO order within a priority; higher priority runs first.
 * 2. One worker: a second task starts only after the first finishes.
 * 3. Cancel while queued: never runs, promise rejects TaskCancelledError.
 * 4. Cancel while running: best-effort — the work may finish, but the
 *    result is dropped and the promise rejects TaskCancelledError.
 * 5. A runner failure rejects with that error and the queue continues.
 * 6. Status transitions and getTask/list snapshots.
 *
 * The queue is pure TypeScript (no electron, no fs), so these tests
 * need no mocks and no temp dirs.
 */

import { TaskQueue, TaskCancelledError } from '../electron/core/tasks/taskQueue';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TaskQueue FIFO order', () => {
  test('tasks run in enqueue order', async () => {
    const q = new TaskQueue(1);
    const order: number[] = [];
    const p1 = q.enqueue('command', { n: 1 }, async () => {
      await sleep(10);
      order.push(1);
      return 1;
    }).promise;
    const p2 = q.enqueue('command', { n: 2 }, async () => {
      order.push(2);
      return 2;
    }).promise;
    const p3 = q.enqueue('command', { n: 3 }, async () => {
      order.push(3);
      return 3;
    }).promise;
    expect(await Promise.all([p1, p2, p3])).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('higher priority runs first among queued tasks, FIFO within a priority', async () => {
    const q = new TaskQueue(1);
    const order: string[] = [];
    // Block the worker so the next three all queue up.
    let release!: () => void;
    const blocker = new Promise<void>((res) => {
      release = res;
    });
    const block = q.enqueue('command', {}, () => blocker).promise;
    const a = q.enqueue('command', { name: 'A' }, async () => {
      order.push('A');
      return 'A';
    }, { priority: 0 }).promise;
    const b = q.enqueue('command', { name: 'B' }, async () => {
      order.push('B');
      return 'B';
    }, { priority: 10 }).promise;
    const c = q.enqueue('command', { name: 'C' }, async () => {
      order.push('C');
      return 'C';
    }, { priority: 5 }).promise;
    const d = q.enqueue('command', { name: 'D' }, async () => {
      order.push('D');
      return 'D';
    }, { priority: 10 }).promise;
    release();
    await block;
    expect(await Promise.all([a, b, c, d])).toEqual(['A', 'B', 'C', 'D']);
    // B and D share priority 10: B enqueued first, runs first.
    expect(order).toEqual(['B', 'D', 'C', 'A']);
  });

  test('one worker: the second task starts only after the first finishes', async () => {
    const q = new TaskQueue(1);
    const events: string[] = [];
    const p1 = q.enqueue('command', {}, async () => {
      events.push('start-1');
      await sleep(20);
      events.push('end-1');
      return 1;
    }).promise;
    const p2 = q.enqueue('command', {}, async () => {
      events.push('start-2');
      events.push('end-2');
      return 2;
    }).promise;
    await Promise.all([p1, p2]);
    expect(events).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  test('payload, tierHint and priority are carried on the task', async () => {
    const q = new TaskQueue(1);
    const { id, promise } = q.enqueue(
      'fixnet',
      { error: 'boom' },
      async (task) => task,
      { priority: 3, tierHint: 2 }
    );
    const task = await promise;
    expect(task.type).toBe('fixnet');
    expect(task.payload).toEqual({ error: 'boom' });
    expect(task.tierHint).toBe(2);
    expect(task.priority).toBe(3);
    expect(q.getTask(id)).toBe(task);
    expect(task.status).toBe('done');
  });
});

describe('TaskQueue cancellation', () => {
  test('cancel while queued: never runs, rejects TaskCancelledError', async () => {
    const q = new TaskQueue(1);
    const ran: string[] = [];
    let release!: () => void;
    const blocker = new Promise<void>((res) => {
      release = res;
    });
    const block = q.enqueue('command', {}, () => blocker).promise;
    const queued = q.enqueue('command', {}, async () => {
      ran.push('queued-task');
      return 'should-not-run';
    });
    expect(q.pendingCount).toBe(1);
    expect(q.cancel(queued.id)).toBe(true);
    expect(q.getTask(queued.id)?.status).toBe('cancelled');
    await expect(queued.promise).rejects.toBeInstanceOf(TaskCancelledError);
    release();
    await block;
    await sleep(10);
    expect(ran).toEqual([]);
    expect(q.pendingCount).toBe(0);
  });

  test('cancel while running: work may finish but the result is dropped', async () => {
    const q = new TaskQueue(1);
    let finished = false;
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const running = q.enqueue('command', {}, async () => {
      await gate;
      finished = true;
      return 'dropped-result';
    });
    // Wait until the runner has started before cancelling.
    await sleep(10);
    expect(q.getTask(running.id)?.status).toBe('running');
    expect(q.cancel(running.id)).toBe(true);
    release();
    await expect(running.promise).rejects.toBeInstanceOf(TaskCancelledError);
    expect(finished).toBe(true);
    expect(q.getTask(running.id)?.status).toBe('cancelled');
    expect(q.getTask(running.id)?.result).toBeUndefined();
  });

  test('cancel returns false for unknown ids and finished tasks', async () => {
    const q = new TaskQueue(1);
    expect(q.cancel('task-nope')).toBe(false);
    const { id, promise } = q.enqueue('command', {}, async () => 42);
    await promise;
    expect(q.getTask(id)?.status).toBe('done');
    expect(q.cancel(id)).toBe(false);
  });

  test('cancelled tasks do not block the queue', async () => {
    const q = new TaskQueue(1);
    let release!: () => void;
    const blocker = new Promise<void>((res) => {
      release = res;
    });
    const block = q.enqueue('command', {}, () => blocker).promise;
    const cancelled = q.enqueue('command', {}, async () => 'nope');
    const after = q.enqueue('command', {}, async () => 'yes');
    expect(q.cancel(cancelled.id)).toBe(true);
    await expect(cancelled.promise).rejects.toBeInstanceOf(TaskCancelledError);
    release();
    await block;
    await expect(after.promise).resolves.toBe('yes');
  });
});

describe('TaskQueue failures and status', () => {
  test('a runner failure rejects with that error and the queue continues', async () => {
    const q = new TaskQueue(1);
    const boom = new Error('boom');
    const failing = q.enqueue('command', {}, async () => {
      throw boom;
    });
    const after = q.enqueue('command', {}, async () => 'still-runs');
    await expect(failing.promise).rejects.toBe(boom);
    expect(q.getTask(failing.id)?.status).toBe('failed');
    expect(q.getTask(failing.id)?.error).toBe(boom);
    await expect(after.promise).resolves.toBe('still-runs');
  });

  test('a synchronously throwing runner is treated as a failure, not a crash', async () => {
    const q = new TaskQueue(1);
    const failing = q.enqueue('command', {}, (() => {
      throw new Error('sync boom');
    }) as never);
    await expect(failing.promise).rejects.toThrow('sync boom');
    expect(q.getTask(failing.id)?.status).toBe('failed');
  });

  test('status transitions queued -> running -> done with timestamps', async () => {
    const q = new TaskQueue(1);
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const { id, promise } = q.enqueue('ai-chat', {}, async () => {
      await gate;
      return 'reply';
    });
    // The runner starts on the next microtask; give it a tick.
    await sleep(5);
    const running = q.getTask(id)!;
    expect(running.status).toBe('running');
    expect(running.startedAt).toBeGreaterThanOrEqual(running.createdAt);
    expect(running.finishedAt).toBeUndefined();
    release();
    await promise;
    const done = q.getTask(id)!;
    expect(done.status).toBe('done');
    expect(done.result).toBe('reply');
    expect(done.finishedAt).toBeGreaterThanOrEqual(done.startedAt!);
  });

  test('list returns tasks in enqueue order', async () => {
    const q = new TaskQueue(1);
    const a = q.enqueue('command', {}, async () => 1);
    const b = q.enqueue('ai-chat', {}, async () => 2);
    await Promise.all([a.promise, b.promise]);
    expect(q.list().map((t) => t.id)).toEqual([a.id, b.id]);
    expect(q.list().map((t) => t.type)).toEqual(['command', 'ai-chat']);
    expect(q.activeCount).toBe(0);
    expect(q.pendingCount).toBe(0);
  });

  test('constructor rejects concurrency below 1', () => {
    expect(() => new TaskQueue(0)).toThrow();
    expect(() => new TaskQueue(-1)).toThrow();
  });
});
