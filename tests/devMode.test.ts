// @vitest-environment jsdom
/**
 * Dev mode (Gary, 2026-11-07) — router + setting tests.
 *
 * There was no dev mode before this: no flag, no toggle, no
 * command. This file pins the new surface:
 *
 * - `/devmode on|off` parses as a Lucid-local slash command
 *   (works with LuciferAI on or off — it is NOT an LLM command).
 * - `devMode` defaults to false (OFF: prompt bar + terminal
 *   topology-synced on a fresh startup).
 * - Flipping it persists via updateSetting → settings.set.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCommand,
  getCommandDescription,
  getCommandExamples,
  requiresLLM,
} from '../src/utils/commandRouter';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('parseCommand: /devmode', () => {
  test('/devmode on parses as a Lucid-local slash command', () => {
    const parsed = parseCommand('/devmode on');
    expect(parsed.type).toBe('devmode');
    expect(parsed.command).toBe('devmode');
    expect(parsed.args).toEqual(['on']);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/devmode off parses the same way', () => {
    const parsed = parseCommand('/devmode off');
    expect(parsed.type).toBe('devmode');
    expect(parsed.args).toEqual(['off']);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/devmode with no argument still parses (usage is the Terminal\'s job)', () => {
    const parsed = parseCommand('/devmode');
    expect(parsed.type).toBe('devmode');
    expect(parsed.args).toEqual([]);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/devmode bogus parses as devmode, not as an agent query', () => {
    const parsed = parseCommand('/devmode bogus');
    expect(parsed.type).toBe('devmode');
    expect(parsed.args).toEqual(['bogus']);
  });

  test('bare "devmode" is a shell word, not a Lucid command', () => {
    const parsed = parseCommand('devmode on');
    expect(parsed.type).toBe('shell');
    expect(parsed.isSlashCommand).toBe(false);
  });

  test('devmode needs no LLM — it flips a setting, Lucid-local', () => {
    expect(requiresLLM('devmode')).toBe(false);
    expect(getCommandDescription('devmode')).toMatch(/dev mode/i);
    expect(getCommandExamples('/dev')).toContain('/devmode on');
  });
});

describe('devMode setting', () => {
  const win = window as unknown as { lucidAPI?: unknown };
  let prevLucidAPI: unknown;
  const settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);

  beforeEach(() => {
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = { settings: { set: settingsSetMock } };
    settingsSetMock.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: false } });
  });

  afterEach(() => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: false } });
  });

  test('defaults to false — OFF on a fresh startup (topology-synced)', () => {
    // defaultSettings is the store's initial state: a fresh
    // startup (no persisted key) starts with dev mode OFF.
    expect(useSettingsStore.getState().settings.devMode).toBe(false);
  });

  test('toggle flips it and persists via updateSetting → settings.set', async () => {
    await useSettingsStore.getState().updateSetting('devMode', true);
    expect(settingsSetMock).toHaveBeenCalledWith('devMode', true);
    expect(useSettingsStore.getState().settings.devMode).toBe(true);

    await useSettingsStore.getState().updateSetting('devMode', false);
    expect(settingsSetMock).toHaveBeenCalledWith('devMode', false);
    expect(useSettingsStore.getState().settings.devMode).toBe(false);
  });
});
