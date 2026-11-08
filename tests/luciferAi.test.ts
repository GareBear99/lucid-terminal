/**
 * The LuciferAI enabled state — the disable rule's one source of
 * truth (Gary, 2026-11-05): when the plugin is off it is completely
 * gone. These tests pin the default (OFF, Gary 2026-11-07: the
 * prompt blood drop is the quick disable and defaults disabled;
 * corrected 2026-11-07 ~20:17 PST — the drop is gone entirely
 * when off, no leftover drop as a re-enable control; re-enable
 * from Settings → Plugins), the missing-key rule (older persisted
 * settings count as OFF), the persistence through the settings
 * store, and the five prompt-row indicator states.
 *
 * (The old refusal design — LUCIFER_AI_DISABLED_MESSAGE /
 * refusalForDisabledCommand, the terminal refusing LuciferAI
 * commands while off — is gone: when off, LuciferAI command
 * words go to the shell PTY instead. See
 * tests/terminalPlainTerminal.test.tsx.)
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLuciferAiEnabled,
  luciferStatusIndicator,
} from '../src/lib/luciferAi';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('isLuciferAiEnabled', () => {
  it('is ON when the key is true', () => {
    expect(isLuciferAiEnabled({ luciferAiEnabled: true })).toBe(true);
  });

  it('is OFF when the key is explicitly false', () => {
    expect(isLuciferAiEnabled({ luciferAiEnabled: false })).toBe(false);
  });

  it('a missing key (older persisted settings) counts as OFF', () => {
    expect(isLuciferAiEnabled({} as { luciferAiEnabled: boolean })).toBe(false);
    expect(isLuciferAiEnabled({ luciferAiEnabled: undefined as unknown as boolean })).toBe(false);
  });
});

describe('luciferStatusIndicator', () => {
  it('disabled renders nothing — hidden, not even the grey offline dot', () => {
    expect(luciferStatusIndicator(false, false, false, false)).toBe('hidden');
    expect(luciferStatusIndicator(false, true, true, true)).toBe('hidden');
  });

  it('checking beats everything else while enabled', () => {
    expect(luciferStatusIndicator(true, true, false, false)).toBe('checking');
  });

  it('a loaded model reads ready', () => {
    expect(luciferStatusIndicator(true, false, true, true)).toBe('ready');
  });

  it('a loaded wrapper with no model reads loaded-no-model', () => {
    expect(luciferStatusIndicator(true, false, false, true)).toBe('loaded-no-model');
  });

  it('a down plugin reads offline', () => {
    expect(luciferStatusIndicator(true, false, false, false)).toBe('offline');
  });
});

describe('luciferAiEnabled setting', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      lucidAPI: { settings: { set: vi.fn().mockResolvedValue(undefined) } },
    });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, luciferAiEnabled: false, customPlugins: {} },
    }));
  });

  it('defaults OFF and customPlugins defaults empty', () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.luciferAiEnabled).toBe(false);
    expect(settings.customPlugins).toEqual({});
    expect(isLuciferAiEnabled(settings)).toBe(false);
  });

  it('toggling on then off persists through updateSetting', async () => {
    await useSettingsStore.getState().updateSetting('luciferAiEnabled', true);
    expect(useSettingsStore.getState().settings.luciferAiEnabled).toBe(true);
    expect(isLuciferAiEnabled(useSettingsStore.getState().settings)).toBe(true);
    await useSettingsStore.getState().updateSetting('luciferAiEnabled', false);
    const { settings } = useSettingsStore.getState();
    expect(settings.luciferAiEnabled).toBe(false);
    expect(isLuciferAiEnabled(settings)).toBe(false);
  });
});
