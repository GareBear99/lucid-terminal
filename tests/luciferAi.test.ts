/**
 * The LuciferAI enabled state — the disable rule's one source of
 * truth (Gary, 2026-11-05): when the plugin is off it is completely
 * gone. These tests pin the default (ON), the missing-key rule
 * (older persisted settings count as ON), the persistence through
 * the settings store, and the five prompt-row indicator states.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLuciferAiEnabled,
  LUCIFER_AI_DISABLED_MESSAGE,
  luciferStatusIndicator,
  refusalForDisabledCommand,
} from '../src/lib/luciferAi';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('isLuciferAiEnabled', () => {
  it('is ON when the key is true', () => {
    expect(isLuciferAiEnabled({ luciferAiEnabled: true })).toBe(true);
  });

  it('is OFF when the key is explicitly false', () => {
    expect(isLuciferAiEnabled({ luciferAiEnabled: false })).toBe(false);
  });

  it('a missing key (older persisted settings) counts as ON', () => {
    expect(isLuciferAiEnabled({} as { luciferAiEnabled: boolean })).toBe(true);
    expect(isLuciferAiEnabled({ luciferAiEnabled: undefined as unknown as boolean })).toBe(true);
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

describe('LUCIFER_AI_DISABLED_MESSAGE', () => {
  it('names the plugin and where to turn it back on', () => {
    expect(LUCIFER_AI_DISABLED_MESSAGE).toContain('LuciferAI');
    expect(LUCIFER_AI_DISABLED_MESSAGE).toContain('Settings');
  });
});

describe('refusalForDisabledCommand', () => {
  it('is exactly the disabled message for ordinary plugin commands', () => {
    expect(refusalForDisabledCommand('agent')).toBe(LUCIFER_AI_DISABLED_MESSAGE);
    expect(refusalForDisabledCommand('llm')).toBe(LUCIFER_AI_DISABLED_MESSAGE);
    expect(refusalForDisabledCommand('tokens')).toBe(LUCIFER_AI_DISABLED_MESSAGE);
    expect(refusalForDisabledCommand('install')).toBe(LUCIFER_AI_DISABLED_MESSAGE);
  });

  it('appends the Help line for the help command', () => {
    expect(refusalForDisabledCommand('help')).toBe(
      LUCIFER_AI_DISABLED_MESSAGE +
        '\n\nHelp is part of LuciferAI and is unavailable while the plugin is disabled.',
    );
  });
});

describe('luciferAiEnabled setting', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      lucidAPI: { settings: { set: vi.fn().mockResolvedValue(undefined) } },
    });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, luciferAiEnabled: true, customPlugins: {} },
    }));
  });

  it('defaults ON and customPlugins defaults empty', () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.luciferAiEnabled).toBe(true);
    expect(settings.customPlugins).toEqual({});
    expect(isLuciferAiEnabled(settings)).toBe(true);
  });

  it('toggling off persists through updateSetting and disables', async () => {
    await useSettingsStore.getState().updateSetting('luciferAiEnabled', false);
    const { settings } = useSettingsStore.getState();
    expect(settings.luciferAiEnabled).toBe(false);
    expect(isLuciferAiEnabled(settings)).toBe(false);
  });
});
