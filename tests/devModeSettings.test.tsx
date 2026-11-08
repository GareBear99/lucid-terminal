// @vitest-environment jsdom
/**
 * Dev mode toggle in Settings → General (Gary, 2026-11-07).
 *
 * The General tab gains a "Dev mode" section: an iPhone-style
 * Toggle plus a one-line explanation of each state. OFF =
 * topology-synced (prompt bar + terminal are one input system);
 * ON = the bar is delinked (detached command bar + dev console).
 * Flipping it persists via updateSetting → settings.set.
 *
 * Interactive render (same pattern as
 * tests/settingsTabsDrag.test.tsx).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('Settings → General → Dev mode', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    mockSet.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: false } });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: false } });
  });

  function renderGeneral() {
    render(<SettingsPanel onClose={() => {}} initialTab="general" />);
  }

  test('the Dev mode section renders in General, OFF with the synced explanation', () => {
    renderGeneral();
    expect(screen.getByText('Dev mode')).not.toBeNull();
    const toggle = screen.getByRole('switch', { name: 'Dev mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/topology-synced/)).not.toBeNull();
  });

  test('flipping the toggle on persists devMode=true and shows the delinked explanation', async () => {
    renderGeneral();
    const toggle = screen.getByRole('switch', { name: 'Dev mode' });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('devMode', true);
    });
    expect(useSettingsStore.getState().settings.devMode).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/delinked/)).not.toBeNull();
  });

  test('flipping it back off persists devMode=false', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: true } });
    renderGeneral();
    const toggle = screen.getByRole('switch', { name: 'Dev mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('devMode', false);
    });
    expect(useSettingsStore.getState().settings.devMode).toBe(false);
  });
});
