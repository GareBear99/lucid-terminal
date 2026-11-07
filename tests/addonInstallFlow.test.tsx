// @vitest-environment jsdom
/**
 * Add-on install-flow tests (Gary, 2026-11-06).
 *
 * The Settings > Plugins Install button actually installs an
 * installable add-on: it records the add-on's id in the persisted
 * `installedAddons` setting (updated AND stored, not updated-only)
 * and the UI flips to Installed. Persona Plex is installable now
 * (Gary, 2026-11-06) and removable like Desktop Commander.
 * Anchor-installed add-ons (Android Connect, Segments) show
 * Installed via their anchor and have no Install button. A
 * user-installed add-on that is removable can be removed again.
 * Every installed add-on gets a Settings button (Persona Plex
 * opens its setup page; the others open their settings entry
 * point or a toast when they have no settings page yet).
 *
 * These tests render SettingsPanel with @testing-library/react and
 * click the real buttons (found by data-addon-install/remove).
 * Only what's needed is tested here — no exhaustive suite pass.
 *
 * Run with: npx vitest run tests/addonInstallFlow.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('Add-on install flow (Settings > Plugins)', () => {
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
    useSettingsStore.setState({
      settings: { ...base, installedAddons: [] },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderPlugins() {
    return render(
      <SettingsPanel onClose={() => undefined} initialTab="plugins" />,
    );
  }

  function installButton(id: string) {
    return document.querySelector(
      `[data-addon-install="${id}"]`,
    ) as HTMLButtonElement | null;
  }

  function removeButton(id: string) {
    return document.querySelector(
      `[data-addon-remove="${id}"]`,
    ) as HTMLButtonElement | null;
  }

  function settingsButton(id: string) {
    return document.querySelector(
      `[data-addon-settings="${id}"]`,
    ) as HTMLButtonElement | null;
  }

  test('Install on Desktop Commander records the install (updated AND stored) and shows Installed', async () => {
    renderPlugins();
    const button = installButton('desktop-commander');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    fireEvent.click(button!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('installedAddons', ['desktop-commander']);
    });
    // The store holds the install (what a reload reads).
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([
      'desktop-commander',
    ]);
    // And the UI reflects it: no Install button, a Remove button instead.
    await waitFor(() => {
      expect(installButton('desktop-commander')).toBeNull();
      expect(removeButton('desktop-commander')).not.toBeNull();
    });
  });

  test('Install on gh-ai-operator records the install too', async () => {
    renderPlugins();
    const button = installButton('gh-ai-operator');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    fireEvent.click(button!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('installedAddons', ['gh-ai-operator']);
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([
      'gh-ai-operator',
    ]);
  });

  test('Install on Persona Plex records the install (updated AND stored) and shows Installed', async () => {
    renderPlugins();
    const button = installButton('persona-plex');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    fireEvent.click(button!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('installedAddons', ['persona-plex']);
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([
      'persona-plex',
    ]);
    // And the UI reflects it: no Install button, a Settings button
    // and (Persona Plex is removable) a Remove button instead.
    await waitFor(() => {
      expect(installButton('persona-plex')).toBeNull();
      expect(settingsButton('persona-plex')).not.toBeNull();
      expect(removeButton('persona-plex')).not.toBeNull();
    });
  });

  test('Remove on an installed Persona Plex un-installs it', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, installedAddons: ['persona-plex'] },
    });
    renderPlugins();
    expect(installButton('persona-plex')).toBeNull();
    const remove = removeButton('persona-plex');
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('installedAddons', []);
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([]);
    await waitFor(() => {
      expect(installButton('persona-plex')).not.toBeNull();
      expect(removeButton('persona-plex')).toBeNull();
    });
  });

  test('every installed add-on has a Settings button; uninstalled ones do not', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        installedAddons: ['persona-plex', 'gh-ai-operator', 'desktop-commander', 'android-emulator', 'segments'],
      },
    });
    renderPlugins();
    for (const id of ['persona-plex', 'gh-ai-operator', 'desktop-commander', 'android-emulator', 'segments']) {
      expect(settingsButton(id)).not.toBeNull();
    }
  });

  test('an uninstalled add-on has no Settings button', () => {
    renderPlugins();
    for (const id of ['persona-plex', 'gh-ai-operator', 'desktop-commander']) {
      expect(settingsButton(id)).toBeNull();
    }
  });

  test('Remove on an installed Desktop Commander un-installs it', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, installedAddons: ['desktop-commander'] },
    });
    renderPlugins();
    // Installed already: no Install button, a Remove button.
    expect(installButton('desktop-commander')).toBeNull();
    const remove = removeButton('desktop-commander');
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('installedAddons', []);
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([]);
    await waitFor(() => {
      expect(installButton('desktop-commander')).not.toBeNull();
      expect(removeButton('desktop-commander')).toBeNull();
    });
  });

  test('anchor-installed add-ons show Installed with no Install button', () => {
    renderPlugins();
    expect(installButton('android-emulator')).toBeNull();
    expect(installButton('segments')).toBeNull();
    expect(document.body.textContent).toContain('Anchored with Devices');
    expect(document.body.textContent).toContain('Anchored with Modules');
  });

  test('MCP Tools is not listed at all', () => {
    renderPlugins();
    expect(document.body.textContent).not.toContain('MCP Tools');
    expect(installButton('mcp-tools')).toBeNull();
  });
});
