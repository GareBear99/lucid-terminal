// @vitest-environment jsdom
/**
 * Sidebar worldmap toggle tests — React error #311 REGRESSION
 * (Gary, 2026-11-16).
 *
 * Clicking Remove AND Install on the Offline Worldmap add-on
 * (Settings > Plugins) crashed Lucid's renderer with minified
 * React error #311 — "Should have a queue. This is likely a bug
 * in React." (React 18.2/18.3 codes.json: #311 is NOT "Objects
 * are not valid as a React child" — that is #31.)
 *
 * Root cause (src/components/Layout/Sidebar.tsx): the
 * `useSettingsStore((s) => s.settings.customPlugins)` hook was
 * called inside the `&&` chain that computes `worldmapVisible`,
 * behind `isAddonInstalled(worldmapAddon, installedAddons)`.
 * `&&` short-circuits, so the hook ran only while the worldmap
 * was installed: installing the add-on ADDED a hook to the
 * Sidebar's hook list mid-life, removing it REMOVED one. Every
 * hook below it shifted by one slot, and the `useState` hooks
 * landed on slots previously held by non-state hooks (queue
 * null) — React's updateReducer throws #311 "Should have a
 * queue" there. The operations themselves still completed (the
 * settings writes landed); only the renderer died.
 *
 * These tests toggle `installedAddons` on a MOUNTED Sidebar —
 * the existing toolbarOrder tests unmount between states, which
 * is why they never caught it: a fresh mount builds a
 * consistent hook list, so only a live install/remove transition
 * crashes.
 *
 * Run with: npx vitest run tests/sidebarWorldmapToggle.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('Sidebar worldmap toggle (React #311 regression)', () => {
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
      settings: {
        ...base,
        toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true, mouse: true },
        luciferAiEnabled: true,
        toolbarOrder: [],
        installedAddons: [],
        customPlugins: {},
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderSidebar() {
    return render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView="terminal"
        onViewChange={vi.fn()}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={vi.fn()}
        onToggleForge={vi.fn()}
      />,
    );
  }

  function setInstalledAddons(ids: string[]) {
    const base = useSettingsStore.getState().settings;
    act(() => {
      useSettingsStore.setState({ settings: { ...base, installedAddons: ids } });
    });
  }

  test('installing then removing Offline Worldmap on a mounted Sidebar does not crash (#311)', () => {
    renderSidebar();
    expect(document.querySelector('[data-toolbar-icon="worldmap"]')).toBeNull();

    // Install: the icon appears — pre-fix this re-render threw
    // "Minified React error #311" (Should have a queue).
    expect(() => setInstalledAddons(['offline-worldmap'])).not.toThrow();
    expect(document.querySelector('[data-toolbar-icon="worldmap"]')).not.toBeNull();

    // Remove: the icon leaves — pre-fix this re-render threw too.
    expect(() => setInstalledAddons([])).not.toThrow();
    expect(document.querySelector('[data-toolbar-icon="worldmap"]')).toBeNull();
  });

  test('the worldmap icon survives repeated install/remove cycles on the same mount', () => {
    renderSidebar();
    for (let i = 0; i < 3; i++) {
      expect(() => setInstalledAddons(['offline-worldmap'])).not.toThrow();
      expect(document.querySelector('[data-toolbar-icon="worldmap"]')).not.toBeNull();
      expect(() => setInstalledAddons([])).not.toThrow();
      expect(document.querySelector('[data-toolbar-icon="worldmap"]')).toBeNull();
    }
  });
});
