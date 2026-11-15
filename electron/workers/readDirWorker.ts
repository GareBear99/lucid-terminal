/**
 * Worker-thread entry for the recursive directory walk (step 5 of
 * the files-section fix, 2026-11-15).
 *
 * The walk used to run in the Electron main process with a serial
 * `lstat` per entry — a home walk is a stat storm that queues
 * every other `fs:*` IPC call behind it. This worker runs the
 * SAME `readDirTree` implementation (imported from
 * `../ipc/readDirTree`, not a copy) in a `worker_threads` thread,
 * so the stat storm no longer runs on the main process at all.
 * It receives `{ dirPath, options }` and posts back
 * `{ ok: true, tree }` or `{ ok: false, error }`.
 *
 * Packaging: compiled by the tsconfig.node build to
 * `dist-electron/electron/workers/readDirWorker.js` (tsconfig.node
 * emits CommonJS — the .js is a plain CJS file `worker_threads`
 * can load from the repo, from dev, and from inside the asar,
 * where electron-builder's `dist-electron/**` files glob puts
 * it). The handler resolves it via `resolveReadDirWorkerPath`
 * and falls back to the in-process walk when the file is absent
 * or cannot spawn, so the worker is never a correctness
 * dependency. It imports only node builtins, the pure walk
 * module, and minimatch (via the .gitignore matcher) — never
 * `electron`, which has no meaning in a worker thread.
 */
import { parentPort } from 'worker_threads';
import { readDirTree, type ReadDirOptions } from '../ipc/readDirTree';

if (!parentPort) {
  throw new Error(
    'readDirWorker must run as a worker thread (new Worker(...))',
  );
}
const port = parentPort;

port.on('message', (msg: { dirPath: string; options?: ReadDirOptions }) => {
  readDirTree(msg.dirPath, msg.options).then(
    (tree) => port.postMessage({ ok: true, tree }),
    (error: unknown) =>
      port.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});
