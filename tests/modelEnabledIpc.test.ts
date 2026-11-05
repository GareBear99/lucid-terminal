/**
 * IPC enable/disable — the handlers report the REAL result (2026-11-05).
 *
 * The old `lucid:llmSetEnabled` handler returned { success: true }
 * unconditionally after calling an empty stub, and `lucid:llmList`
 * surfaced "server answering" as `enabled`. These tests pin the new
 * contract with a mocked LucidCore (the real one would initialize
 * against the real ~/.lucid — side effects these tests must not have):
 *
 * - before init → { success: false, error: 'LucidCore not initialized' }
 * - core reports success → handler reports success (with the real
 *   enabled flag); core reports failure → handler reports failure
 *   with the core's message, never a fake success
 * - llmList passes through getModelList(), whose `enabled` is the
 *   real enable flag
 * - empty model name is rejected without touching the core
 *
 * Tests in this file run in order on purpose: the module-level
 * lucidCore in lucidWorkflow.ts persists across tests, so the
 * "before init" checks must come first.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';
import { setupLucidWorkflowHandlers } from '../electron/ipc/lucidWorkflow';

const mockCore: any = {
  getModelList: vi.fn(() => []),
  setModelEnabled: vi.fn((model: string, enabled: boolean) => ({
    success: true,
    model,
    enabled,
    message: enabled ? `✅ Enabled ${model}` : `✅ Disabled ${model}`,
  })),
};

vi.mock('../electron/core/lucidCore', () => ({
  __esModule: true,
  default: class MockLucidCore {
    static async initialize() {
      return mockCore;
    }
  },
}));

type Handler = (...args: any[]) => Promise<any>;

let handlers: Record<string, Handler> = {};

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers[channel] = handler;
  }),
} as unknown as IpcMain;

beforeEach(() => {
  handlers = {};
  vi.clearAllMocks();
  setupLucidWorkflowHandlers(mockIpcMain);
});

describe('lucid:llmSetEnabled / lucid:llmList (IPC)', () => {
  test('before init, both handlers report "not initialized"', async () => {
    const setResult = await handlers['lucid:llmSetEnabled'](
      undefined,
      'tinyllama',
      false
    );
    expect(setResult.success).toBe(false);
    expect(setResult.error).toMatch(/not initialized/);

    const listResult = await handlers['lucid:llmList']();
    expect(listResult.success).toBe(false);
    expect(listResult.error).toMatch(/not initialized/);
  });

  test('lucid:init succeeds, then a disable reports the real success', async () => {
    expect(await handlers['lucid:init']()).toEqual({ success: true });

    const result = await handlers['lucid:llmSetEnabled'](
      undefined,
      'tinyllama',
      false
    );
    expect(result).toEqual({
      success: true,
      model: 'tinyllama',
      enabled: false,
      message: '✅ Disabled tinyllama',
    });
    expect(mockCore.setModelEnabled).toHaveBeenCalledWith(
      'tinyllama',
      false
    );
  });

  test('a core failure is reported as a failure — never a fake success', async () => {
    await handlers['lucid:init']();
    mockCore.setModelEnabled.mockImplementationOnce(
      (model: string, enabled: boolean) => ({
        success: false,
        model,
        enabled: true,
        message: `Unknown model: ${model}`,
      })
    );

    const result = await handlers['lucid:llmSetEnabled'](
      undefined,
      'no-such-model',
      false
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown model: no-such-model/);
    expect(result.enabled).toBe(true);
  });

  test('an empty model name is rejected without touching the core', async () => {
    await handlers['lucid:init']();
    const result = await handlers['lucid:llmSetEnabled'](
      undefined,
      '   ',
      false
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No model name/);
    expect(mockCore.setModelEnabled).not.toHaveBeenCalled();
  });

  test('llmList returns the real enabled flag from getModelList', async () => {
    await handlers['lucid:init']();
    mockCore.getModelList.mockReturnValue([
      {
        name: 'tinyllama',
        tier: 0,
        enabled: false,
        running: true,
        installed: true,
        corrupted: false,
      },
      {
        name: 'mistral',
        tier: 2,
        enabled: true,
        running: false,
        installed: false,
        corrupted: false,
      },
    ]);

    const result = await handlers['lucid:llmList']();
    expect(result.success).toBe(true);
    // The old handler would have reported tinyllama enabled:true
    // here (running:true) — the real flag is false.
    expect(result.models[0]).toMatchObject({
      name: 'tinyllama',
      enabled: false,
      running: true,
    });
    expect(result.models[1]).toMatchObject({
      name: 'mistral',
      enabled: true,
      running: false,
    });
  });
});
