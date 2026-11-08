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
  isLuciferAiSilenced,
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

describe('isLuciferAiSilenced — the blood drop toggle is JUST a silencer (Gary, 2026-11-08 ~02:28 PST)', () => {
  // Silenced is NOT off: the runtime keeps running, the drop only
  // greys out. The drop disappears ONLY when LuciferAI is off via
  // the Settings toggle (Gary, 2026-11-08 ~02:29 PST: "off like in
  // settings toggle"). Silenced is a SEPARATE key from enabled.
  it('is silenced when the key is true', () => {
    expect(isLuciferAiSilenced({ luciferAiSilenced: true })).toBe(true);
  });

  it('is NOT silenced when the key is explicitly false', () => {
    expect(isLuciferAiSilenced({ luciferAiSilenced: false })).toBe(false);
  });

  it('a missing key (older persisted settings) counts as NOT silenced — a fresh / old install speaks', () => {
    expect(isLuciferAiSilenced({} as { luciferAiSilenced: boolean })).toBe(false);
    expect(isLuciferAiSilenced({ luciferAiSilenced: undefined as unknown as boolean })).toBe(false);
  });

  it('silenced and enabled are independent — silenced does not turn the plugin off', () => {
    // Silenced + enabled: the plugin is ON, the drop greys.
    expect(isLuciferAiEnabled({ luciferAiEnabled: true })).toBe(true);
    expect(isLuciferAiSilenced({ luciferAiSilenced: true })).toBe(true);
    // Not silenced + disabled: the plugin is OFF, the drop is gone.
    expect(isLuciferAiEnabled({ luciferAiEnabled: false })).toBe(false);
    expect(isLuciferAiSilenced({ luciferAiSilenced: false })).toBe(false);
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

describe('luciferAiSilenced setting — persists like the other settings, never touches enabled', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      lucidAPI: { settings: { set: vi.fn().mockResolvedValue(undefined) } },
    });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, luciferAiEnabled: true, luciferAiSilenced: false },
    }));
  });

  it('defaults NOT silenced and silencing does not change enabled', async () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.luciferAiSilenced).toBe(false);
    expect(isLuciferAiSilenced(settings)).toBe(false);
    await useSettingsStore.getState().updateSetting('luciferAiSilenced', true);
    const after = useSettingsStore.getState().settings;
    expect(after.luciferAiSilenced).toBe(true);
    expect(isLuciferAiSilenced(after)).toBe(true);
    // Silencing is NOT turning off: enabled is untouched.
    expect(after.luciferAiEnabled).toBe(true);
    expect(isLuciferAiEnabled(after)).toBe(true);
    await useSettingsStore.getState().updateSetting('luciferAiSilenced', false);
    const back = useSettingsStore.getState().settings;
    expect(back.luciferAiSilenced).toBe(false);
    expect(back.luciferAiEnabled).toBe(true);
  });
});
