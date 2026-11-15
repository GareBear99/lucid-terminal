/**
 * The renderer-side Copilot transport (D9, 2026-11-15) — the
 * IPC client the Copilot brain talks through. The key never
 * crosses this bridge: main reads it from the OS keychain.
 *
 * The bridge is faked here (window.lucidAPI.copilot) — no IPC,
 * no Electron, no network. The tests pin the routing: one
 * shared delta listener for the process dispatches to the
 * right in-flight request by requestId, a foreign request's
 * delta is ignored, a late delta for a finished request is
 * ignored, and an absent bridge reports unavailable instead
 * of throwing. The module is re-imported per test
 * (vi.resetModules) because the shared listener is module
 * state — one test's registration must not answer the next.
 *
 * Run with: npx vitest run tests/copilotApi.test.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

type DeltaCallback = (event: { requestId: string; text: string }) => void;
type TransportModule = typeof import('../src/lib/copilotApi');

describe('copilotApi — the renderer-side Copilot transport', () => {
  let transport: TransportModule['realCopilotTransport'];
  let capturedDelta: DeltaCallback | null = null;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let mockChat: ReturnType<typeof vi.fn>;
  let mockList: ReturnType<typeof vi.fn>;
  let mockAbort: ReturnType<typeof vi.fn>;
  let mockOnChatDelta: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    capturedDelta = null;
    unsubscribe = vi.fn();
    mockChat = vi.fn(async () => ({ ok: true, content: 'done', toolCalls: [], model: 'gpt-4o' }));
    mockList = vi.fn(async () => ({ ok: true, models: ['gpt-4o'] }));
    mockAbort = vi.fn();
    mockOnChatDelta = vi.fn((callback: DeltaCallback) => {
      capturedDelta = callback;
      return unsubscribe as unknown as () => void;
    });
    (globalThis as { window?: unknown }).window = {
      lucidAPI: {
        copilot: {
          listModels: mockList,
          chatCompletions: mockChat,
          onChatDelta: mockOnChatDelta,
          abortChatCompletions: mockAbort,
        },
      },
    };
    const mod: TransportModule = await import('../src/lib/copilotApi');
    transport = mod.realCopilotTransport;
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('routes deltas to the request by requestId, and ignores a late delta once the call is done', async () => {
    const seen: string[] = [];
    const promise = transport.chatCompletions(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      },
      (text) => seen.push(text),
    );
    const requestId = mockChat.mock.calls[0][0].requestId as string;
    expect(requestId).toMatch(/\S/);
    expect(capturedDelta).not.toBeNull();
    capturedDelta!({ requestId, text: 'Hel' });
    capturedDelta!({ requestId, text: 'lo' });
    // A delta for a different request never reaches this one.
    capturedDelta!({ requestId: 'someone-else', text: 'NOPE' });
    const result = await promise;
    expect(result).toEqual({ ok: true, content: 'done', toolCalls: [], model: 'gpt-4o' });
    expect(seen).toEqual(['Hel', 'lo']);
    // The call is done — its entry is gone, so a late delta is dropped.
    capturedDelta!({ requestId, text: 'too-late' });
    expect(seen).toEqual(['Hel', 'lo']);
  });

  it('two requests in flight share one listener and each get only their own deltas', async () => {
    const seenA: string[] = [];
    const seenB: string[] = [];
    const promiseA = transport.chatCompletions(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'a' }], tools: [] },
      (text) => seenA.push(text),
    );
    const promiseB = transport.chatCompletions(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'b' }], tools: [] },
      (text) => seenB.push(text),
    );
    const idA = mockChat.mock.calls[0][0].requestId as string;
    const idB = mockChat.mock.calls[1][0].requestId as string;
    expect(idA).not.toBe(idB);
    // One shared listener for the process — the second call
    // does not register another one.
    expect(mockOnChatDelta).toHaveBeenCalledTimes(1);
    capturedDelta!({ requestId: idA, text: 'for-A' });
    capturedDelta!({ requestId: idB, text: 'for-B' });
    await promiseA;
    await promiseB;
    expect(seenA).toEqual(['for-A']);
    expect(seenB).toEqual(['for-B']);
  });

  it('listModels delegates to the bridge', async () => {
    const result = await transport.listModels();
    expect(result).toEqual({ ok: true, models: ['gpt-4o'] });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('an absent bridge reports unavailable instead of throwing', async () => {
    delete (globalThis as { window?: unknown }).window;
    const result = await transport.chatCompletions(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      () => {},
    );
    expect(result).toEqual({ ok: false, code: 'unavailable', message: expect.any(String) });
    const listed = await transport.listModels();
    expect(listed).toEqual({ ok: false, code: 'unavailable', message: expect.any(String) });
  });

  it('an abort signal aborts the in-flight call through the bridge', async () => {
    const controller = new AbortController();
    const promise = transport.chatCompletions(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      () => {},
      controller.signal,
    );
    const requestId = mockChat.mock.calls[0][0].requestId as string;
    controller.abort();
    await promise;
    expect(mockAbort).toHaveBeenCalledWith(requestId);
  });
});
