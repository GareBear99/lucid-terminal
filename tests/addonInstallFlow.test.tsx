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
 * ARC Server (Gary, 2026-11-14) is the one add-on fetched at
 * install time: Install downloads the repo tarball in the main
 * process (mocked here) and only then records the id; a failed
 * fetch records the error and installs nothing. Remove deletes
 * the fetched files first, then clears the state and the id.
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
import type {
  ArcServerInstallResult,
  ArcServerStatusResult,
} from '../src/lib/arcServerAddon';

const ARC_SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const ARC_PATH = `/Users/gary/.lucid/addons/arc-server/${ARC_SHA}`;

describe('Add-on install flow (Settings > Plugins)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  const mockArcInstall = vi.fn(
    async (): Promise<ArcServerInstallResult> => ({
      ok: true,
      version: ARC_SHA,
      path: ARC_PATH,
    }),
  );
  const mockArcUninstall = vi.fn(
    async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
  );
  const mockArcStatus = vi.fn(
    async (): Promise<ArcServerStatusResult> => ({
      installed: false,
      version: null,
      path: null,
    }),
  );
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
      arcServer: {
        install: mockArcInstall,
        uninstall: mockArcUninstall,
        getStatus: mockArcStatus,
      },
    };
    mockSet.mockClear();
    mockArcInstall.mockClear();
    mockArcUninstall.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, installedAddons: [], arcServerInstall: null },
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

  test('only installed add-ons WITH a settings surface have a Settings button (sweep item 18)', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        installedAddons: ['persona-plex', 'gh-ai-operator', 'desktop-commander', 'android-emulator', 'segments', 'arc-server'],
        arcServerInstall: { status: 'installed', version: ARC_SHA, path: ARC_PATH, error: null },
      },
    });
    renderPlugins();
    // A settings surface exists for these three: Persona Plex opens
    // its setup page; Android Connect and Segments open their anchor
    // plugin's tab (Devices / Modules).
    for (const id of ['persona-plex', 'android-emulator', 'segments']) {
      expect(settingsButton(id)).not.toBeNull();
    }
    // No surface for these three — no button, instead of one that
    // only toasts "No settings yet". ARC Server has no settings
    // page by design (Gary, 2026-11-14); gh-ai-operator and
    // desktop-commander have none yet.
    for (const id of ['gh-ai-operator', 'desktop-commander', 'arc-server']) {
      expect(settingsButton(id)).toBeNull();
    }
  });

  test('an uninstalled add-on has no Settings button', () => {
    renderPlugins();
    for (const id of ['persona-plex', 'gh-ai-operator', 'desktop-commander', 'arc-server']) {
      expect(settingsButton(id)).toBeNull();
    }
  });

  test('Install on ARC Server fetches from the repo, then records the install and shows the fetched version', async () => {
    renderPlugins();
    const button = installButton('arc-server');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    fireEvent.click(button!);
    await waitFor(() => {
      expect(mockArcInstall).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith('arcServerInstall', {
        status: 'installed',
        version: ARC_SHA,
        path: ARC_PATH,
        error: null,
      });
      expect(mockSet).toHaveBeenCalledWith('installedAddons', ['arc-server']);
    });
    // The store holds the fetched identity (what a reload reads).
    expect(useSettingsStore.getState().settings.arcServerInstall).toEqual({
      status: 'installed',
      version: ARC_SHA,
      path: ARC_PATH,
      error: null,
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([
      'arc-server',
    ]);
    // And the UI reflects it: the fetched SHA, no Install button,
    // a Remove button instead — and NO Settings button (sweep item
    // 18: ARC Server has no settings page by design).
    await waitFor(() => {
      expect(document.body.textContent).toContain('Fetched a1b2c3d');
      expect(installButton('arc-server')).toBeNull();
      expect(settingsButton('arc-server')).toBeNull();
      expect(removeButton('arc-server')).not.toBeNull();
    });
  });

  test('a failed ARC Server fetch records the error and installs nothing', async () => {
    mockArcInstall.mockResolvedValueOnce({ ok: false, error: 'Network down' });
    renderPlugins();
    const button = installButton('arc-server');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('arcServerInstall', {
        status: 'failed',
        version: null,
        path: null,
        error: 'Network down',
      });
    });
    // The id is NOT recorded — a failed fetch installs nothing.
    expect(
      mockSet.mock.calls.filter(([key]) => key === 'installedAddons'),
    ).toEqual([]);
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([]);
    // The error shows and Install is still there to retry.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Fetch failed: Network down');
      expect(installButton('arc-server')).not.toBeNull();
    });
  });

  test('Remove on an installed ARC Server removes the fetched files and un-installs it', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        installedAddons: ['arc-server'],
        arcServerInstall: { status: 'installed', version: ARC_SHA, path: ARC_PATH, error: null },
      },
    });
    renderPlugins();
    expect(installButton('arc-server')).toBeNull();
    const remove = removeButton('arc-server');
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);
    await waitFor(() => {
      expect(mockArcUninstall).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith('arcServerInstall', null);
      expect(mockSet).toHaveBeenCalledWith('installedAddons', []);
    });
    expect(useSettingsStore.getState().settings.installedAddons).toEqual([]);
    expect(useSettingsStore.getState().settings.arcServerInstall).toBeNull();
    await waitFor(() => {
      expect(installButton('arc-server')).not.toBeNull();
      expect(removeButton('arc-server')).toBeNull();
    });
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
