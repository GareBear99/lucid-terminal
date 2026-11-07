/**
 * AI chat route tests — `resolveChatRoute` in `electron/ipc/ai.ts`,
 * the single decision for which route answers one reply.
 *
 * The rule under test (Gary's design, 2026-11-06): an explicit
 * per-chat model (the header dropdown) is authoritative WHEN its
 * route can answer — a local choice needs a loaded local model, an
 * OpenAI choice needs a key, a ping choice needs ping enabled. When
 * the chosen route cannot answer, the choice falls through to
 * today's fixed cascade (ping → local → OpenAI) instead of erroring,
 * so the user still gets a reply from another route. No choice
 * (Auto) IS the cascade, re-decided per reply, exactly as today.
 *
 * The service modules are stubbed — this tests only the pure
 * routing decision, not the routes themselves.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';

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

import { resolveChatRoute } from '../electron/ipc/ai';

describe('resolveChatRoute — Auto is the cascade, re-decided per reply', () => {
  it('ping wins while enabled', () => {
    expect(resolveChatRoute({ pingEnabled: true, localAvailable: true, hasApiKey: true })).toEqual({
      route: 'ping',
    });
  });

  it('local wins when ping is off and a model is loaded', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: true, hasApiKey: true })).toEqual({
      route: 'local',
    });
  });

  it('OpenAI wins when ping is off and no local model is loaded', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: false, hasApiKey: true })).toEqual({
      route: 'openai',
    });
  });

  it('none when nothing can answer', () => {
    expect(resolveChatRoute({ pingEnabled: false, localAvailable: false, hasApiKey: false })).toEqual({
      route: 'none',
    });
  });
});

describe('resolveChatRoute — an explicit model is authoritative when its route can answer', () => {
  it('a local choice routes local with that model', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'local', model: 'tinyllama' });
  });

  it('an OpenAI choice routes OpenAI with that model', () => {
    expect(
      resolveChatRoute({ model: 'gpt-4-turbo', modelSource: 'openai', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'openai', model: 'gpt-4-turbo' });
  });

  it('a ping choice routes ping while ping is enabled, carrying the model', () => {
    expect(
      resolveChatRoute({ model: '@cf/meta/llama-3.2-1b-instruct', modelSource: 'ping', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'ping', model: '@cf/meta/llama-3.2-1b-instruct' });
  });

  it('a ping choice with no model (Auto) routes ping with no model — the default applies', () => {
    expect(
      resolveChatRoute({ modelSource: 'ping', pingEnabled: true, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'ping', model: undefined });
  });
});

describe('resolveChatRoute — an unavailable choice falls through to the cascade, not an error', () => {
  it('a local choice with no local model falls back to ping when enabled', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: true, localAvailable: false, hasApiKey: true }),
    ).toEqual({ route: 'ping' });
  });

  it('a local choice with no local model and ping off falls back to OpenAI when a key is set', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: false, localAvailable: false, hasApiKey: true }),
    ).toEqual({ route: 'openai' });
  });

  it('an OpenAI choice with no key falls back to local when a model is loaded', () => {
    expect(
      resolveChatRoute({ model: 'gpt-4', modelSource: 'openai', pingEnabled: false, localAvailable: true, hasApiKey: false }),
    ).toEqual({ route: 'local' });
  });

  it('a ping choice with ping off falls back to local when a model is loaded', () => {
    expect(
      resolveChatRoute({ model: '@cf/meta/llama-3.2-1b-instruct', modelSource: 'ping', pingEnabled: false, localAvailable: true, hasApiKey: true }),
    ).toEqual({ route: 'local' });
  });

  it('an unavailable choice with nothing else available is none, not a crash', () => {
    expect(
      resolveChatRoute({ model: 'tinyllama', modelSource: 'local', pingEnabled: false, localAvailable: false, hasApiKey: false }),
    ).toEqual({ route: 'none' });
  });
});
