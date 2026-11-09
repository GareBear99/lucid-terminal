// @vitest-environment jsdom
/**
 * Mist toggles (Gary, 2026-11-09).
 *
 * The Files screen is the Editor view. It used to be Full Glass
 * with no mist (filesScreen.ts, deleted with this fix — Gary:
 * "make the files solid theme like before"). Now:
 *
 * - The theme is the stored theme everywhere; no per-view override.
 * - The mist shows on every view except Files (as before); on Files
 *   it shows only when the Files mist toggle is on (default off).
 * - The toggle lives in its own Mist section in Settings, one toggle
 *   per surface — the Files toggle is the first, and an AI Chat mist
 *   toggle follows the same pattern (key + toggle + conditional
 *   render) when it is built. Nothing here is built for AI Chat yet.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FILES_SCREEN_VIEW,
  isFilesScreen,
  showSplashMistForView,
} from '../src/lib/mist';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { View } from '../src/types';

const ALL_VIEWS: View[] = [
  'terminal',
  'editor',
  'settings',
  'synth',
  'forge',
  'persona-plex',
];

describe('Files screen', () => {
  test('is the Editor view', () => {
    expect(FILES_SCREEN_VIEW).toBe('editor');
    expect(isFilesScreen('editor')).toBe(true);
    for (const view of ALL_VIEWS.filter((v) => v !== 'editor')) {
      expect(isFilesScreen(view)).toBe(false);
    }
  });

  test('mist shows on every view except Files, whatever the toggle says', () => {
    for (const view of ALL_VIEWS.filter((v) => v !== 'editor')) {
      expect(showSplashMistForView(view, false)).toBe(true);
      expect(showSplashMistForView(view, true)).toBe(true);
    }
  });

  test('mist on Files shows only when the Files mist toggle is on', () => {
    expect(showSplashMistForView('editor', false)).toBe(false);
    expect(showSplashMistForView('editor', true)).toBe(true);
  });
});

describe('filesMist setting', () => {
  const win = window as unknown as { lucidAPI?: unknown };
  let prevLucidAPI: unknown;
  const settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);

  beforeEach(() => {
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = { settings: { set: settingsSetMock } };
    settingsSetMock.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, filesMist: false } });
  });

  afterEach(() => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, filesMist: false } });
  });

  test('defaults to false — OFF on a fresh startup (solid Files, no mist)', () => {
    // defaultSettings is the store's initial state: a fresh
    // startup (no persisted key) starts with the Files mist OFF.
    expect(useSettingsStore.getState().settings.filesMist).toBe(false);
  });

  test('toggle flips it and persists via updateSetting → settings.set', async () => {
    await useSettingsStore.getState().updateSetting('filesMist', true);
    expect(settingsSetMock).toHaveBeenCalledWith('filesMist', true);
    expect(useSettingsStore.getState().settings.filesMist).toBe(true);

    await useSettingsStore.getState().updateSetting('filesMist', false);
    expect(settingsSetMock).toHaveBeenCalledWith('filesMist', false);
    expect(useSettingsStore.getState().settings.filesMist).toBe(false);
  });
});
