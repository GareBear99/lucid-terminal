// @vitest-environment jsdom
/**
 * Modules inventory live-state tests — `src/components/Modules/ModulesTab.tsx`.
 *
 * The inventory statuses are read from live state, never hardcoded:
 * the Forge bridge row follows whether Persona Plex is installed.
 * Under SSR (renderToStaticMarkup) zustand 4.5.7 passes
 * getInitialState as the server snapshot, so setState is invisible
 * there — the hidden branch is covered by tests/modulesTab.test.tsx
 * (SSR) and the live branch is covered HERE, in jsdom, where the
 * store subscribes and setState is seen. If this test fails while
 * the SSR one passes, the inventory is reading a stale snapshot
 * instead of live state.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, waitFor } from '@testing-library/react';
import { ModulesTab } from '../src/components/Modules/ModulesTab';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useForgeStore } from '../src/stores/forgeStore';
import { emptyHomunculus } from '../src/lib/homunculi';

describe('Modules inventory live state', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: vi.fn(async () => undefined),
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      fs: {
        getHomeDir: vi.fn(async () => '/Users/gary'),
        readFile: vi.fn(async () => JSON.stringify({ user1: { souls: [] } })),
      },
    };
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        personaPlexConfig: {},
        personaPlexCustomPersonas: [],
        personaPlexActiveId: null,
        personaPlexSpeakEnabled: true,
        installedAddons: [],
      },
    });
    useForgeStore.setState({
      roster: [emptyHomunculus('lucifer', 'Lucifer', 'purple')],
      selectedId: 'lucifer',
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, installedAddons: [] } });
  });

  it('shows the Forge bridge hidden when Persona Plex is not installed', () => {
    render(<ModulesTab />);
    expect(document.body.textContent).toContain('Hidden — install Persona Plex to show it');
    expect(document.querySelector('[data-forge-persona-plex-segment]')).toBeNull();
  });

  it('shows the Forge bridge live once Persona Plex is installed', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, installedAddons: ['persona-plex'] } });
    render(<ModulesTab />);
    expect(document.body.textContent).toContain('Live · Persona Plex installed');
    await waitFor(() =>
      expect(document.querySelector('[data-forge-persona-plex-segment]')).not.toBeNull(),
    );
  });

  it('the inventory still lists every group in the live render', () => {
    render(<ModulesTab />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('What lives here');
    expect(text).toContain('Segments');
    expect(text).toContain('Computer control');
    expect(text).toContain('Starship segments');
    expect(text).toContain('Forge ↔ Persona Plex bridge');
    expect(text).toContain('How a segment gets here');
  });
});
