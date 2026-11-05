/**
 * Bypass-router fix tests (2026-11-04).
 *
 * Three bugs, each pinned by a test:
 *
 * 1. STALE EMPTY MODEL LIST — the router snapshotted `availableModels`
 *    at construction (every model `validated: false`) and never
 *    refreshed, so it could never pick a model. Refresh now scans the
 *    model directories (modelFiles.ts) with a GGUF magic-byte check and
 *    re-validates before every routing decision. Tests: a router built
 *    against the real TinyLlama file picks `tinyllama`; a temp backend
 *    dir with a fake GGUF picks that model and rejects a bad-magic
 *    file; an empty install picks nothing.
 *
 * 2. NONEXISTENT `recordUsage()` ON THE SUCCESS PATH — every successful
 *    generation threw `TypeError` inside the try block and was recorded
 *    as a bypass failure. Success now records via the real
 *    `trackUsage` API. Tests: a resolving operation returns
 *    `route.success === true` and the tracker's session gains an entry
 *    with the result's real token stats (and a zero-count entry when
 *    the result carries no stats).
 *
 * 3. FLAT 30s WALL CLOCK — replaced by a stall watchdog (90s loading /
 *    45s inactivity / 600s absolute, the `llm_backend.py` shape).
 *    Tests: slow-but-flowing output succeeds; a quiet attempt stalls
 *    out (loading window, then inactivity window); constant activity
 *    still hits the absolute ceiling.
 *
 * SAFETY NOTE: temp directories are the ONLY things tests delete.
 * `makeFixture` cleans up only the temp tracking dir it created. A
 * test that creates a temp app root deletes that temp dir itself in
 * its own finally block. The app root is NEVER passed to a recursive
 * delete — an earlier draft of this file did exactly that with the
 * repo root as appRoot and wiped the checkout.
 *
 * Run with: npm test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BypassRouter,
  matchFileToRegisteredModel,
  extractTokenStats,
  DEFAULT_BYPASS_TIMEOUTS,
} from '../electron/core/llm/bypassRouter';
import { ModelBackendManager } from '../electron/core/llm/modelBackend';
import { ModelTierRegistry } from '../electron/core/models/modelTiers';
import { TokenTracker } from '../electron/core/tracking/tokenTracker';
import { TaskCancelledError } from '../electron/core/tasks/taskQueue';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Best-effort recursive delete of a TEMP dir only. Never call on an app root. */
function rmTempDir(dir: string): void {
  // Guard: only delete inside the OS temp area.
  const tmpRoot = path.resolve(os.tmpdir());
  if (!path.resolve(dir).startsWith(tmpRoot)) {
    throw new Error(`refusing to delete non-temp dir: ${dir}`);
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort temp cleanup.
  }
}

function writeGguf(dir: string, name: string, size = 1024): string {
  const file = path.join(dir, name);
  const buf = Buffer.alloc(size);
  buf.write('GGUF', 0, 'ascii');
  fs.writeFileSync(file, buf);
  return file;
}

function writeBadGguf(dir: string, name: string, size = 1024): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.alloc(size, 0x41)); // 'AAAA...' — no GGUF magic
  return file;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backend dir layout the router scans: <appRoot>/LUCID-BACKEND/models */
function makeBackendModelsDir(appRoot: string): string {
  const dir = path.join(appRoot, 'LUCID-BACKEND', 'models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeBackend(): ModelBackendManager {
  const backend = new ModelBackendManager();
  backend.register('tinyllama', {
    name: 'tinyllama',
    tier: 0,
    provider: 'llamafile',
    endpoint: 'http://localhost:8080',
  });
  backend.register('mistral', {
    name: 'mistral',
    tier: 2,
    provider: 'llamafile',
    endpoint: 'http://localhost:8082',
  });
  backend.register('llama3.1:8b', {
    name: 'llama3.1:8b',
    tier: 2,
    provider: 'llamafile',
    endpoint: 'http://localhost:8083',
  });
  backend.register('deepseek-coder:33b', {
    name: 'deepseek-coder:33b',
    tier: 3,
    provider: 'llamafile',
    endpoint: 'http://localhost:8084',
  });
  backend.register('llama3.1:70b', {
    name: 'llama3.1:70b',
    tier: 4,
    provider: 'llamafile',
    endpoint: 'http://localhost:8085',
  });
  return backend;
}

interface Fixture {
  router: BypassRouter;
  backend: ModelBackendManager;
  tracker: TokenTracker;
  /** Temp tracking dir — the ONLY thing cleanup() deletes. */
  trackingDir: string;
}

function makeFixture(appRoot: string): Fixture {
  const backend = makeBackend();
  const trackingDir = makeTempDir('lucid-bypass-tracker-');
  const tracker = new TokenTracker(trackingDir);
  const router = new BypassRouter(new ModelTierRegistry(), tracker, backend, {
    appRoot,
  });
  return { router, backend, tracker, trackingDir };
}

function cleanup(fixture: Fixture): void {
  rmTempDir(fixture.trackingDir);
}

describe('matchFileToRegisteredModel', () => {
  const registered = [
    'tinyllama',
    'mistral',
    'llama3.1:8b',
    'deepseek-coder:33b',
    'llama3.1:70b',
  ];

  test('bundled TinyLlama file maps to tinyllama', () => {
    expect(
      matchFileToRegisteredModel(
        'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        registered
      )
    ).toBe('tinyllama');
  });

  test('llama 8B file maps to llama3.1:8b, not llama3.1:70b', () => {
    expect(
      matchFileToRegisteredModel(
        'llama-3.1-8b-instruct-Q4_K_M.gguf',
        registered
      )
    ).toBe('llama3.1:8b');
  });

  test('llama 70B file maps to llama3.1:70b (longest name wins)', () => {
    expect(
      matchFileToRegisteredModel(
        'llama-3.1-70b-instruct-Q4_K_M.gguf',
        registered
      )
    ).toBe('llama3.1:70b');
  });

  test('mistral file maps to mistral', () => {
    expect(
      matchFileToRegisteredModel(
        'mistral-7b-instruct-v0.3.Q4_K_M.gguf',
        registered
      )
    ).toBe('mistral');
  });

  test('deepseek-coder 33B file maps to deepseek-coder:33b', () => {
    expect(
      matchFileToRegisteredModel(
        'deepseek-coder-33b-instruct.Q4_K_M.gguf',
        registered
      )
    ).toBe('deepseek-coder:33b');
  });

  test('unknown file maps to nothing', () => {
    expect(
      matchFileToRegisteredModel('qwen2.5-7b-instruct.Q4_K_M.gguf', registered)
    ).toBeNull();
  });
});

describe('extractTokenStats', () => {
  test('pulls stats off a GenerationResponse-like result', () => {
    expect(
      extractTokenStats({
        text: 'hello',
        tokenStats: {
          prompt_tokens: 10,
          generated_tokens: 5,
          total_tokens: 15,
        },
      })
    ).toEqual({ prompt_tokens: 10, generated_tokens: 5, total_tokens: 15 });
  });

  test('null when the result carries no token stats', () => {
    expect(extractTokenStats({ text: 'hello' })).toBeNull();
    expect(extractTokenStats('plain string')).toBeNull();
    expect(extractTokenStats(null)).toBeNull();
  });

  test('null when token stats are not numeric', () => {
    expect(
      extractTokenStats({
        tokenStats: {
          prompt_tokens: '10',
          generated_tokens: 5,
          total_tokens: 15,
        },
      })
    ).toBeNull();
  });
});

describe('refreshAvailableModels', () => {
  // The TinyLlama GGUF is gitignored: it exists in the VM checkout but
  // not on a fresh checkout or on the Mac (where no model is installed
  // by design, so the model banner is expected). Skip instead of failing
  // when it is absent — the temp-dir tests below cover the mapping.
  const repoRoot = process.cwd();
  const tinyllamaPath = path.join(
    repoRoot,
    'LUCID-BACKEND',
    'models',
    'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
  );

  test.skipIf(!fs.existsSync(tinyllamaPath))(
    'picks the real TinyLlama file on disk (repo checkout)',
    () => {
      const fixture = makeFixture(repoRoot);
      try {
        expect(fixture.router.getBestAvailableModel()).toBe('tinyllama');
        const status = fixture.router.getModelStatus('tinyllama');
        expect(status.installed).toBe(true);
        expect(status.corrupted).toBe(false);
        // No file for mistral on this checkout — it must not be picked.
        expect(fixture.router.getModelStatus('mistral').installed).toBe(false);
        expect(fixture.router.isReady()).toBe(true);
        expect(fixture.router.getValidationMessage()).toBe('Router ready');
      } finally {
        // Only the temp tracking dir is cleaned. The repo root is never
        // deleted — it is the app root under test, not temp data.
        cleanup(fixture);
      }
    }
  );

  test('picks a model from a temp backend dir, rejects a bad-magic file', () => {
    const appRoot = makeTempDir('lucid-bypass-app-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'mistral-7b-instruct-v0.3.Q4_K_M.gguf');
    // Bad magic: a truncated / HTML-error-page download is not a model.
    writeBadGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');

    const fixture = makeFixture(appRoot);
    try {
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
      expect(fixture.router.getModelStatus('mistral').installed).toBe(true);
      expect(fixture.router.getModelStatus('tinyllama').installed).toBe(false);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('empty install picks nothing and says so', () => {
    const appRoot = makeTempDir('lucid-bypass-empty-');
    const fixture = makeFixture(appRoot);
    try {
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      expect(fixture.router.isReady()).toBe(false);
      expect(fixture.router.getValidationMessage()).toMatch(
        /No models installed/
      );
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('a model installed after construction becomes pickable', () => {
    const appRoot = makeTempDir('lucid-bypass-late-');
    const fixture = makeFixture(appRoot);
    try {
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      const modelsDir = makeBackendModelsDir(appRoot);
      writeGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
      // No restart, no manual refresh call: the routing decision itself
      // re-validates against disk.
      expect(fixture.router.getBestAvailableModel()).toBe('tinyllama');
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('router-level disable survives a refresh', () => {
    const appRoot = makeTempDir('lucid-bypass-disable-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'mistral-7b-instruct-v0.3.Q4_K_M.gguf');
    const fixture = makeFixture(appRoot);
    try {
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
      expect(fixture.router.disableModel('mistral').success).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      fixture.router.refreshAvailableModels();
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      expect(fixture.router.enableModel('mistral').success).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });
});

describe('executeWithBypass — success path records usage', () => {
  function successFixture(): { fixture: Fixture; appRoot: string } {
    const appRoot = makeTempDir('lucid-bypass-success-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    const fixture = makeFixture(appRoot);
    // The file is validated by the refresh; the server is "up" for the
    // test so the attempt reaches the operation instead of throwing
    // "not running" (live servers are out of scope in the VM).
    fixture.backend.setModelRunning('tinyllama', true);
    return { fixture, appRoot };
  }

  test('successful generation returns success and records real token stats', async () => {
    const { fixture, appRoot } = successFixture();
    try {
      // Regression anchor: the method the old code called does not
      // exist on TokenTracker — that is why every success became a
      // bypass failure. The router must never call it.
      expect((fixture.tracker as any).recordUsage).toBeUndefined();

      const { result, route } = await fixture.router.executeWithBypass(
        async () => ({
          text: 'fixed it',
          tokenStats: {
            prompt_tokens: 10,
            generated_tokens: 5,
            total_tokens: 15,
          },
        }),
        'fix_generation'
      );

      expect(result).toEqual({
        text: 'fixed it',
        tokenStats: {
          prompt_tokens: 10,
          generated_tokens: 5,
          total_tokens: 15,
        },
      });
      expect(route.success).toBe(true);
      expect(route.selected_model).toBe('tinyllama');
      expect(route.selected_tier).toBe(0);

      const stats = fixture.tracker.getSessionStats();
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0].model).toBe('tinyllama');
      expect(stats.entries[0].operation).toBe('fix_generation');
      expect(stats.entries[0].stats.total_tokens).toBe(15);
      expect(stats.entries[0].stats.prompt_tokens).toBe(10);
      expect(stats.entries[0].stats.generated_tokens).toBe(5);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('result without token stats still succeeds (zero-count entry)', async () => {
    const { fixture, appRoot } = successFixture();
    try {
      const { result, route } = await fixture.router.executeWithBypass(
        async () => ({ text: 'hello' }),
        'conversational_query'
      );

      expect(result).toEqual({ text: 'hello' });
      expect(route.success).toBe(true);
      const stats = fixture.tracker.getSessionStats();
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0].stats.total_tokens).toBe(0);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('model not running is bypassed with reason failed, not a crash', async () => {
    const appRoot = makeTempDir('lucid-bypass-notrunning-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    const fixture = makeFixture(appRoot);
    try {
      // running stays false: no server up, no testAll() in the VM.
      const { result, route } = await fixture.router.executeWithBypass(
        async () => ({ text: 'never reached' }),
        'conversational_query'
      );
      expect(result).toBeNull();
      expect(route.success).toBe(false);
      expect(route.bypassed_models).toHaveLength(1);
      expect(route.bypassed_models[0].model).toBe('tinyllama');
      expect(route.bypassed_models[0].reason).toBe('failed');
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });
});

describe('executeWithBypass — stall timeout', () => {
  // Small windows so the tests run in milliseconds; the production
  // defaults (90s / 45s / 600s) are asserted separately below.
  const SMALL = { inactivityMs: 100, loadingMs: 100, absoluteMs: 5000 };

  function stallFixture(): { fixture: Fixture; appRoot: string } {
    const appRoot = makeTempDir('lucid-bypass-stall-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    const fixture = makeFixture(appRoot);
    fixture.backend.setModelRunning('tinyllama', true);
    return { fixture, appRoot };
  }

  test('slow-but-flowing output does NOT time out', async () => {
    const { fixture, appRoot } = stallFixture();
    try {
      const { result, route } = await fixture.router.executeWithBypass(
        async (_model, reportActivity) => {
          const iv = setInterval(reportActivity, 15);
          try {
            // ~250ms of generation, activity every 15ms — far inside
            // the 100ms inactivity window at every instant.
            await sleep(250);
            return { text: 'slow but alive' };
          } finally {
            clearInterval(iv);
          }
        },
        'conversational_query',
        SMALL
      );
      expect(result).toEqual({ text: 'slow but alive' });
      expect(route.success).toBe(true);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('quiet attempt stalls out on the loading window (no first activity)', async () => {
    const { fixture, appRoot } = stallFixture();
    try {
      const started = Date.now();
      const { result, route } = await fixture.router.executeWithBypass(
        // Never reports activity, never resolves.
        () => new Promise(() => {}),
        'conversational_query',
        { inactivityMs: 100, loadingMs: 100, absoluteMs: 5000 }
      );
      const elapsed = Date.now() - started;
      expect(result).toBeNull();
      expect(route.success).toBe(false);
      expect(route.bypassed_models).toHaveLength(1);
      expect(route.bypassed_models[0].reason).toBe('timeout');
      // Fired on the ~100ms loading window — not the old 30s wall clock.
      expect(elapsed).toBeLessThan(2000);
      expect(elapsed).toBeGreaterThanOrEqual(80);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('quiet after first activity stalls out on the inactivity window', async () => {
    const { fixture, appRoot } = stallFixture();
    try {
      const started = Date.now();
      const { result, route } = await fixture.router.executeWithBypass(
        async (_model, reportActivity) => {
          reportActivity(); // first token arrives, then silence
          return new Promise(() => {});
        },
        'conversational_query',
        // Loading window is huge on purpose: only the 100ms inactivity
        // window can fire this attempt.
        { inactivityMs: 100, loadingMs: 5000, absoluteMs: 5000 }
      );
      const elapsed = Date.now() - started;
      expect(result).toBeNull();
      expect(route.success).toBe(false);
      expect(route.bypassed_models[0].reason).toBe('timeout');
      expect(elapsed).toBeLessThan(2000);
      expect(elapsed).toBeGreaterThanOrEqual(80);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('absolute ceiling fires despite constant activity', async () => {
    const { fixture, appRoot } = stallFixture();
    try {
      const started = Date.now();
      const { result, route } = await fixture.router.executeWithBypass(
        async (_model, reportActivity) => {
          const iv = setInterval(reportActivity, 15);
          try {
            // Activity flows; the op itself gives up after 1s so
            // nothing is left dangling. The watchdog's 200ms ceiling
            // must fire first.
            await sleep(1000);
            return { text: 'too late' };
          } finally {
            clearInterval(iv);
          }
        },
        'conversational_query',
        { inactivityMs: 5000, loadingMs: 5000, absoluteMs: 200 }
      );
      const elapsed = Date.now() - started;
      expect(result).toBeNull();
      expect(route.success).toBe(false);
      expect(route.bypassed_models[0].reason).toBe('timeout');
      // Fired on the ~200ms ceiling, not on quiet (there was none).
      expect(elapsed).toBeLessThan(2000);
      expect(elapsed).toBeGreaterThanOrEqual(150);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('production defaults match the llm_backend.py shape', () => {
    expect(DEFAULT_BYPASS_TIMEOUTS).toEqual({
      inactivityMs: 45_000,
      loadingMs: 90_000,
      absoluteMs: 600_000,
    });
  });
});

describe('executeQueued — router hands off to the task queue', () => {
  function queuedFixture(): { fixture: Fixture; appRoot: string } {
    const appRoot = makeTempDir('lucid-bypass-queued-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    const fixture = makeFixture(appRoot);
    fixture.backend.setModelRunning('tinyllama', true);
    return { fixture, appRoot };
  }

  test('returns the same shape as executeWithBypass', async () => {
    const { fixture, appRoot } = queuedFixture();
    try {
      const { result, route } = await fixture.router.executeQueued(
        async () => ({ text: 'queued it' }),
        'conversational_query'
      );
      expect(result).toEqual({ text: 'queued it' });
      expect(route.success).toBe(true);
      expect(route.selected_model).toBe('tinyllama');
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('concurrent routing decisions serialize through the queue', async () => {
    const { fixture, appRoot } = queuedFixture();
    try {
      const events: string[] = [];
      const first = fixture.router.executeQueued(async () => {
        events.push('start-1');
        await sleep(30);
        events.push('end-1');
        return { text: 'one' };
      }, 'conversational_query');
      const second = fixture.router.executeQueued(async () => {
        events.push('start-2');
        events.push('end-2');
        return { text: 'two' };
      }, 'conversational_query');
      const [r1, r2] = await Promise.all([first, second]);
      expect(r1.result).toEqual({ text: 'one' });
      expect(r2.result).toEqual({ text: 'two' });
      // Single worker: the second attempt starts only after the first ends.
      expect(events).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('cancelling a queued routing task never touches a model', async () => {
    const { fixture, appRoot } = queuedFixture();
    try {
      const ran: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((res) => {
        release = res;
      });
      const first = fixture.router.executeQueued(async () => {
        await gate;
        return { text: 'first' };
      }, 'conversational_query');
      // The queue holds the second behind the first; cancel it by id.
      const queue = fixture.router.getTaskQueue();
      const secondPromise = fixture.router.executeQueued(async () => {
        ran.push('second');
        return { text: 'second' };
      }, 'conversational_query');
      const secondTask = queue.list().find((t) => t.status === 'queued');
      expect(secondTask).toBeDefined();
      expect(fixture.router.cancelTask(secondTask!.id)).toBe(true);
      await expect(secondPromise).rejects.toBeInstanceOf(TaskCancelledError);
      release();
      const r1 = await first;
      expect(r1.result).toEqual({ text: 'first' });
      await sleep(10);
      expect(ran).toEqual([]);
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });

  test('queue is visible for inspection', async () => {
    const { fixture, appRoot } = queuedFixture();
    try {
      const queue = fixture.router.getTaskQueue();
      expect(queue.pendingCount).toBe(0);
      expect(queue.activeCount).toBe(0);
      const { result } = await fixture.router.executeQueued(
        async () => ({ text: 'x' }),
        'conversational_query'
      );
      expect(result).toEqual({ text: 'x' });
      expect(queue.list()).toHaveLength(1);
      expect(queue.list()[0].type).toBe('command');
      expect(queue.list()[0].status).toBe('done');
    } finally {
      cleanup(fixture);
      rmTempDir(appRoot);
    }
  });
});
