/**
 * Zero-latency standard — F1 (health probe, not generation) and F5/F6
 * (AI stream coalescing), plus the LucidCore shared status cache.
 *
 * Hand-checkable cases (defined BEFORE running, per verify_generated_code):
 * 1. healthCheck() on a llamafile backend performs exactly one GET to
 *    <endpoint>/v1/models and NEVER posts to /v1/chat/completions —
 *    the old testConnection() ran a real generate() per backend per tick.
 * 2. healthCheck() passes an AbortSignal to fetch, and a hung endpoint
 *    resolves false when that signal aborts (~3 s timeout, not the OS
 *    TCP timeout).
 * 3. testAll() issues every backend's probe before ANY of them resolves
 *    (parallel Promise.all, not sequential await) and a dead backend
 *    does not block the others.
 * 4. createStreamCoalescer() sends nothing for small pushes until
 *    flush() or the 50 ms window, sends once with the concatenated
 *    chunks, and flushes immediately at the 512-char cap.
 * 5. LucidCore.getModelStatuses() returns the SAME Map object on a
 *    second call inside the TTL (one shared cached sweep, not one
 *    probe per caller).
 *
 * Run with: npm test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same service stubs as tests/aiChatRoute.test.ts: importing
// electron/ipc/ai pulls in the Electron main-process services,
// which need `app` and friends stubbed in a node test env.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {},
}));

vi.mock('../electron/services/openai', () => ({
  chat: vi.fn(),
  cancelStream: vi.fn(),
  hasApiKey: vi.fn(() => false),
}));

vi.mock('../electron/services/pingServer', () => ({
  chatPing: vi.fn(),
  cancelPingStream: vi.fn(),
  pingServerHealth: vi.fn(),
  isPingServerEnabled: vi.fn(() => false),
}));

vi.mock('../electron/services/local_ai', () => ({
  chatLocal: vi.fn(),
  checkLocalBackendHealth: vi.fn(),
  cancelLocalChat: vi.fn(),
  chatLocalWithBrowserTools: vi.fn(),
}));

vi.mock('../electron/services/historyManager', () => ({
  historyManager: { getSessions: vi.fn(), saveSession: vi.fn(), deleteSession: vi.fn(), clearSessions: vi.fn() },
}));

vi.mock('../electron/ipc/lucidWorkflow', () => ({
  isAnyModelAvailable: vi.fn(),
}));

import {
  ModelBackend,
  ModelBackendManager,
} from '../electron/core/llm/modelBackend';
import {
  createStreamCoalescer,
  AI_STREAM_FLUSH_CHARS,
} from '../electron/ipc/ai';
import { LucidCore } from '../electron/core/lucidCore';

const realFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: any) => Promise<any>) {
  const calls: Array<{ url: string; init?: any }> = [];
  const fn = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    return impl(url, init);
  });
  globalThis.fetch = fn as any;
  return { fn, calls };
}

const okResponse = { ok: true, status: 200, json: async () => ({}) };

describe('F1: healthCheck() is a cheap probe, never a generation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('llamafile: one GET to /v1/models, never a chat completion', async () => {
    const { fn, calls } = mockFetch(async () => okResponse);
    const backend = new ModelBackend({
      name: 'tinyllama',
      tier: 1,
      provider: 'llamafile',
      endpoint: 'http://localhost:8080',
    });
    await expect(backend.healthCheck()).resolves.toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('http://localhost:8080/v1/models');
    // GET: no method override, no body — a generation would be a POST
    // with a JSON body to /v1/chat/completions.
    expect(calls[0].init?.method).toBeUndefined();
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls.some((c) => c.url.includes('chat/completions'))).toBe(false);
  });

  it('ollama probes /api/tags; lmstudio probes /v1/models', async () => {
    const { calls } = mockFetch(async () => okResponse);
    const ollama = new ModelBackend({
      name: 'o',
      tier: 1,
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    });
    const lmstudio = new ModelBackend({
      name: 'l',
      tier: 1,
      provider: 'lmstudio',
      endpoint: 'http://localhost:1234',
    });
    await expect(ollama.healthCheck()).resolves.toBe(true);
    await expect(lmstudio.healthCheck()).resolves.toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      'http://localhost:11434/api/tags',
      'http://localhost:1234/v1/models',
    ]);
  });

  it('cloud backends without a key return false without fetching', async () => {
    const { fn } = mockFetch(async () => okResponse);
    const openai = new ModelBackend({
      name: 'gpt',
      tier: 1,
      provider: 'openai',
    });
    const anthropic = new ModelBackend({
      name: 'claude',
      tier: 1,
      provider: 'anthropic',
    });
    await expect(openai.healthCheck()).resolves.toBe(false);
    await expect(anthropic.healthCheck()).resolves.toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('testConnection() is the probe now (no generation on a timer)', async () => {
    const { calls } = mockFetch(async () => okResponse);
    const backend = new ModelBackend({
      name: 'tinyllama',
      tier: 1,
      provider: 'llamafile',
      endpoint: 'http://localhost:8080',
    });
    await expect(backend.testConnection()).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:8080/v1/models');
  });

  it('a hung endpoint aborts after the probe timeout and reads false', async () => {
    // The fetch never resolves on its own; it rejects when its
    // AbortSignal fires — exactly what a real fetch does on abort.
    // AbortSignal.timeout(3000) fires the signal, so this resolves
    // in ~3 s, not at the OS TCP timeout.
    mockFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const backend = new ModelBackend({
      name: 'tinyllama',
      tier: 1,
      provider: 'llamafile',
      endpoint: 'http://localhost:8080',
    });
    const started = Date.now();
    await expect(backend.healthCheck()).resolves.toBe(false);
    // ~3 s probe timeout, with generous slack for a loaded runner —
    // but far below an OS TCP timeout (minutes).
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 20_000);

  it('testAll() probes backends in parallel; a dead one blocks nothing', async () => {
    const resolvers: Array<() => void> = [];
    const { calls } = mockFetch(async (url: string) => {
      // Each probe waits until the test releases it.
      await new Promise<void>((resolve) => resolvers.push(resolve));
      if (url.includes('8080')) return okResponse;
      throw new Error('connection refused');
    });
    const manager = new ModelBackendManager();
    manager.register('a', {
      name: 'a',
      tier: 1,
      provider: 'llamafile',
      endpoint: 'http://localhost:8080',
    });
    manager.register('b', {
      name: 'b',
      tier: 1,
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    });
    const pending = manager.testAll();
    // Let both probe fetches start before releasing either.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.map((c) => c.url)).toEqual([
      'http://localhost:8080/v1/models',
      'http://localhost:11434/api/tags',
    ]);
    resolvers.forEach((r) => r());
    const results = await pending;
    expect(results.get('a')).toBe(true);
    expect(results.get('b')).toBe(false);
  });
});

describe('F5/F6: stream coalescer', () => {
  it('buffers small chunks; one send with the concatenation on flush', () => {
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const coalescer = createStreamCoalescer(sender as any);
    coalescer.push('Hello');
    coalescer.push(' ');
    coalescer.push('world');
    expect(sender.send).not.toHaveBeenCalled();
    coalescer.flush();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith('ai:stream', 'Hello world');
    // A second flush with an empty buffer sends nothing.
    coalescer.flush();
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately at the 512-char cap', () => {
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const coalescer = createStreamCoalescer(sender as any);
    coalescer.push('x'.repeat(AI_STREAM_FLUSH_CHARS));
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(
      'ai:stream',
      'x'.repeat(AI_STREAM_FLUSH_CHARS),
    );
  });

  it('flushes on the 50 ms window', () => {
    vi.useFakeTimers();
    try {
      const sender = {
        isDestroyed: () => false,
        send: vi.fn(),
      };
      const coalescer = createStreamCoalescer(sender as any);
      coalescer.push('tick');
      expect(sender.send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(49);
      expect(sender.send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(sender.send).toHaveBeenCalledWith('ai:stream', 'tick');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never sends to a destroyed sender', () => {
    const sender = {
      isDestroyed: () => true,
      send: vi.fn(),
    };
    const coalescer = createStreamCoalescer(sender as any);
    coalescer.push('lost');
    coalescer.flush();
    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe('F1: LucidCore.getModelStatuses() shares one cached sweep', () => {
  it('second call inside the TTL returns the same Map object', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-zero-latency-'));
    try {
      const lucidDir = path.join(tempHome, '.lucid');
      // Placeholder llamafile binary: initialize() only checks for
      // existence, and must not curl-download one (slow, network).
      fs.mkdirSync(path.join(lucidDir, 'llamafiles'), { recursive: true });
      fs.writeFileSync(
        path.join(lucidDir, 'llamafiles', 'llamafile'),
        'placeholder — never executed in this test',
      );
      const core = await LucidCore.initialize({
        userHomeDir: tempHome,
        workingDirectory: process.cwd(),
      });
      const first = await core.getModelStatuses();
      const second = await core.getModelStatuses();
      // Same object identity = the second call did no probe at all.
      expect(second).toBe(first);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  }, 20_000);
});
