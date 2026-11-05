/**
 * Task queue — the one real queue in lucid-terminal (2026-11-04,
 * task-manager step of the finishing sequence).
 *
 * Before this file, there was no task queue anywhere: the only queue
 * in the codebase was a declared-but-never-used array in
 * `electron/services/local_ai.ts` (`requestQueue` /
 * `isProcessingQueue`), and `chatLocal()` instead threw
 * "Backend is busy processing another request" on concurrent calls.
 * Commands ran synchronously, one at a time per terminal tab, with
 * no cancellation and no handoff point for the router or FixNet.
 *
 * What this is: a small FIFO queue (one worker by default) that any
 * routed/LLM work can hand tasks to. Each task carries an id, a type
 * (`command` | `ai-chat` | `fixnet`), a payload, a tier hint, and a
 * status (`queued` | `running` | `done` | `failed` | `cancelled`).
 * Enqueue returns `{ id, promise }` — the promise resolves with the
 * runner's result, or rejects with the runner's error (or
 * `TaskCancelledError` when the task is cancelled).
 *
 * Priority is optional and trivial: a higher `priority` runs first
 * among queued tasks; FIFO within the same priority. Default 0.
 *
 * Cancellation: a task cancelled while queued never runs (its
 * promise rejects immediately). A task cancelled while running is
 * best-effort — the runner sees `isCancelled() === true` and may
 * stop early; if it finishes anyway, its result is dropped and the
 * promise rejects with `TaskCancelledError`.
 *
 * What this is NOT: it does not touch plain shell (PTY) commands.
 * The terminal's direct shell path stays synchronous and never
 * enters the queue — the queue is for routed/LLM work only
 * (router decisions, AI chat, and later FixNet consensus calls).
 */

export type TaskType = 'command' | 'ai-chat' | 'fixnet' | 'llmbuilder';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was cancelled`);
    this.name = 'TaskCancelledError';
  }
}

export interface Task<T = unknown> {
  id: string;
  type: TaskType;
  /** Opaque payload for the runner (e.g. `{ operationType }`). */
  payload: unknown;
  /** Tier the task would prefer, when the runner routes by tier. */
  tierHint?: number;
  /** Higher runs first among queued tasks; FIFO within a priority. */
  priority: number;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: T;
  error?: Error;
}

/**
 * A unit of work. Receives its task and an `isCancelled` check the
 * runner should consult when it can stop early. The queue, not the
 * runner, owns the task's status transitions.
 */
export type TaskRunner<T> = (
  task: Task<T>,
  isCancelled: () => boolean
) => Promise<T>;

export interface EnqueueOptions {
  /** Higher runs first among queued tasks (default 0). */
  priority?: number;
  /** Tier the task would prefer, when the runner routes by tier. */
  tierHint?: number;
}

export interface QueuedTask<T> {
  id: string;
  promise: Promise<T>;
}

interface Entry<T = unknown> {
  task: Task<T>;
  runner: TaskRunner<T>;
  cancelled: boolean;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

export class TaskQueue {
  private readonly concurrency: number;
  /** FIFO within a priority; kept sorted by priority desc on insert. */
  private queue: Array<Entry<unknown>> = [];
  private readonly runningEntries = new Map<string, Entry<unknown>>();
  private readonly tasks = new Map<string, Task>();
  private runningCount = 0;
  private nextId = 1;

  constructor(concurrency = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('TaskQueue concurrency must be an integer >= 1');
    }
    this.concurrency = concurrency;
  }

  /**
   * Enqueue work and get back `{ id, promise }`. The promise resolves
   * with the runner's result, rejects with its error, or rejects with
   * `TaskCancelledError` when the task is cancelled.
   */
  enqueue<T>(
    type: TaskType,
    payload: unknown,
    runner: TaskRunner<T>,
    options: EnqueueOptions = {}
  ): QueuedTask<T> {
    const id = `task-${this.nextId++}`;
    const task: Task<T> = {
      id,
      type,
      payload,
      tierHint: options.tierHint,
      priority: options.priority ?? 0,
      status: 'queued',
      createdAt: Date.now(),
    };

    let resolve!: (value: T) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // A cancelled task whose caller dropped the handle must not
    // surface as an unhandled rejection; the original promise still
    // rejects for anyone who does await it.
    promise.catch(() => {});

    const entry: Entry<T> = { task, runner, cancelled: false, resolve, reject };

    // Insert after all queued tasks with equal-or-higher priority, so
    // higher priority runs first and same priority stays FIFO.
    const idx = this.queue.findIndex((e) => e.task.priority < task.priority);
    if (idx === -1) {
      this.queue.push(entry as Entry<unknown>);
    } else {
      this.queue.splice(idx, 0, entry as Entry<unknown>);
    }
    this.tasks.set(id, task);

    this._pump();
    return { id, promise };
  }

  /**
   * Cancel a task. Queued: removed immediately, never runs, promise
   * rejects with `TaskCancelledError`. Running: flagged best-effort —
   * the runner sees `isCancelled() === true` and the result is
   * dropped when it settles. Returns false when the id is unknown or
   * the task already finished (done / failed / cancelled).
   */
  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.status === 'queued') {
      const idx = this.queue.findIndex((e) => e.task.id === id);
      if (idx === -1) return false;
      const [entry] = this.queue.splice(idx, 1);
      entry.cancelled = true;
      task.status = 'cancelled';
      task.finishedAt = Date.now();
      entry.reject(new TaskCancelledError(id));
      return true;
    }

    if (task.status === 'running') {
      const entry = this.runningEntries.get(id);
      if (!entry) return false;
      entry.cancelled = true;
      return true;
    }

    return false;
  }

  /** Snapshot of a task by id, or undefined when unknown. */
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** All tasks ever enqueued, in enqueue order. */
  list(): Task[] {
    return [...this.tasks.values()];
  }

  /** Tasks still waiting for a worker. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Tasks currently executing. */
  get activeCount(): number {
    return this.runningCount;
  }

  private _pump(): void {
    while (this.runningCount < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.runningCount++;
      this.runningEntries.set(entry.task.id, entry);
      entry.task.status = 'running';
      entry.task.startedAt = Date.now();

      const isCancelled = () => entry.cancelled;
      let result: Promise<unknown>;
      try {
        result = Promise.resolve(entry.runner(entry.task, isCancelled));
      } catch (err) {
        result = Promise.reject(
          err instanceof Error ? err : new Error(String(err))
        );
      }
      result.then(
        (value) => this._finish(entry, null, value),
        (err) =>
          this._finish(
            entry,
            err instanceof Error ? err : new Error(String(err)),
            undefined
          )
      );
    }
  }

  private _finish(
    entry: Entry<unknown>,
    err: Error | null,
    value: unknown
  ): void {
    this.runningCount--;
    this.runningEntries.delete(entry.task.id);
    const task = entry.task;
    task.finishedAt = Date.now();

    if (entry.cancelled) {
      // Best-effort cancel: the work may have finished, but the
      // caller asked to drop it — report cancelled, not the result.
      task.status = 'cancelled';
      entry.reject(new TaskCancelledError(task.id));
    } else if (err) {
      task.status = 'failed';
      task.error = err;
      entry.reject(err);
    } else {
      task.status = 'done';
      task.result = value;
      entry.resolve(value);
    }

    this._pump();
  }
}
