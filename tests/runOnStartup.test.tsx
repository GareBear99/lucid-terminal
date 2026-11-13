// @vitest-environment jsdom
/**
 * Run on startup toggle tests (Gary, 2026-11-12) — Settings > General,
 * "Run on startup", like any other program.
 *
 * The rule under test:
 * - Default OFF: nothing auto-starts unless Gary flips it on.
 * - The macOS login-item state is the truth. The renderer only ever
 *   mirrors it: `syncRunOnStartup` reads it on app start (loadSettings)
 *   and every time Settings opens (the panel's mount effect), and
 *   `setRunOnStartup` stores the value main re-read from the OS — never
 *   the requested value. A flip in System Settings, or a main-process
 *   refusal, never leaves the toggle lying.
 * - An older preload without the IPC calls leaves the last known value
 *   instead of throwing.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';

type SettingsStub = Record<string, unknown>;

function stubLucidAPI(overrides: SettingsStub = {}): { settings: Record<string, ReturnType<typeof vi.fn>> } {
  const settings = {
    set: vi.fn(async (_key: string, _value: unknown) => undefined),
    getAll: vi.fn(async () => ({})),
    hasApiKey: vi.fn(async () => false),
    hasPingKey: vi.fn(async () => false),
    hasTelegramBotToken: vi.fn(async () => false),
    hasStripeApiKey: vi.fn(async () => false),
    hasKaggleApiKey: vi.fn(async () => false),
    hasTotpSecret: vi.fn(async () => false),
    getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
    getRunOnStartup: vi.fn(async () => false),
    setRunOnStartup: vi.fn(async (value: boolean) => value),
    ...overrides,
  };
  const win = window as unknown as Record<string, unknown>;
  win.lucidAPI = {
    settings,
    ai: { checkLocalBackend: vi.fn(async () => false) },
    lucid: { getModelStatuses: vi.fn(async () => ({})) },
  };
  return { settings };
}

describe('run on startup', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    useSettingsStore.setState({ runOnStartup: false, isLoading: false });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  test('default is OFF', () => {
    expect(useSettingsStore.getState().runOnStartup).toBe(false);
  });

  test('syncRunOnStartup mirrors what main reports', async () => {
    stubLucidAPI({ getRunOnStartup: vi.fn(async () => true) });
    await useSettingsStore.getState().syncRunOnStartup();
    expect(useSettingsStore.getState().runOnStartup).toBe(true);

    stubLucidAPI({ getRunOnStartup: vi.fn(async () => false) });
    await useSettingsStore.getState().syncRunOnStartup();
    expect(useSettingsStore.getState().runOnStartup).toBe(false);
  });

  test('setRunOnStartup stores the ACTUAL value main re-read, not the requested one', async () => {
    // Main was asked for on but reports off (refused / System Settings
    // disagrees) — the toggle must show off, not the request.
    const { settings } = stubLucidAPI({ setRunOnStartup: vi.fn(async () => false) });
    await useSettingsStore.getState().setRunOnStartup(true);
    expect(settings.setRunOnStartup).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().runOnStartup).toBe(false);

    const ok = stubLucidAPI({ setRunOnStartup: vi.fn(async () => true) });
    await useSettingsStore.getState().setRunOnStartup(true);
    expect(ok.settings.setRunOnStartup).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().runOnStartup).toBe(true);
  });

  test('setRunOnStartup failure re-reads the truth instead of keeping the request', async () => {
    const getRunOnStartup = vi.fn(async () => false);
    stubLucidAPI({
      getRunOnStartup,
      setRunOnStartup: vi.fn(async () => {
        throw new Error('ipc gone');
      }),
    });
    await useSettingsStore.getState().setRunOnStartup(true);
    expect(getRunOnStartup).toHaveBeenCalled();
    expect(useSettingsStore.getState().runOnStartup).toBe(false);
  });

  test('older preload without the IPC leaves the last known value', async () => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = { settings: { getAll: vi.fn(async () => ({})) } };
    useSettingsStore.setState({ runOnStartup: true });
    await useSettingsStore.getState().syncRunOnStartup();
    expect(useSettingsStore.getState().runOnStartup).toBe(true);
  });

  test('loadSettings syncs run on startup from the OS', async () => {
    stubLucidAPI({ getRunOnStartup: vi.fn(async () => true) });
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().runOnStartup).toBe(true);
    expect(useSettingsStore.getState().isLoading).toBe(false);
  });

  test('General tab shows the toggle, re-reads the OS state on open, and flips it', async () => {
    const { settings } = stubLucidAPI({ getRunOnStartup: vi.fn(async () => true) });
    render(<SettingsPanel onClose={() => undefined} initialTab="general" />);

    // Settings open re-reads the OS: main says on, so the toggle is on.
    const toggle = await waitFor(() => {
      const el = document.querySelector('[role="switch"][aria-label="Run on startup"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(settings.getRunOnStartup).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Lucid launches when you log in to your Mac.');

    // Flipping it off calls main with false and shows off.
    fireEvent.click(toggle);
    expect(settings.setRunOnStartup).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(document.body.textContent).toContain('Lucid only launches when you open it.');
  });

  test('General tab toggle is OFF by default', async () => {
    stubLucidAPI({ getRunOnStartup: vi.fn(async () => false) });
    render(<SettingsPanel onClose={() => undefined} initialTab="general" />);
    const toggle = await waitFor(() => {
      const el = document.querySelector('[role="switch"][aria-label="Run on startup"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(document.body.textContent).toContain('Lucid only launches when you open it.');
  });
});
