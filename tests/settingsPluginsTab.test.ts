/**
 * Settings Plugins-tab tests.
 *
 * The Plugins tab is the single home for plugin toggles: the
 * "Toolbar plugins" section moved out of the Customization tab into
 * the Plugins tab's Core plugins section, and the Add-ons section
 * lists the four anchored add-ons as Not installed with disabled
 * Install buttons (no install flow exists yet).
 *
 * There is no @testing-library / jsdom in this repo, so these tests
 * render with react-dom/server's renderToStaticMarkup (effects never
 * run under SSR, so the LuciferAI backend fetch does not fire and the
 * row reads "Built-in · Checking…"). The component takes an
 * optional initialTab prop so a tab's content is renderable.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';

const renderSettings = (initialTab?: 'appearance' | 'customization' | 'plugins') =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      ...(initialTab ? { initialTab } : {}),
    }),
  );

const checkboxCount = (html: string) =>
  (html.match(/type="checkbox"/g) || []).length;
const disabledButtonCount = (html: string) =>
  (html.match(/<button[^>]*\bdisabled\b[^>]*>/g) || []).length;

describe('Plugins tab', () => {
  it('appears in the tab list', () => {
    const html = renderSettings();
    expect(html).toContain('Plugins');
  });

  it('renders the Core plugins section with the Synth and AI Chat toolbar toggles', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Core plugins');
    expect(html).toContain('Synth');
    expect(html).toContain('AI Chat');
    // The two toolbar toggles — and only those two checkboxes — live here.
    expect(checkboxCount(html)).toBe(2);
    // The toggles keep their descriptions from the toolbar data.
    expect(html).toContain('LuciferAI plugin shell');
    expect(html).toContain('LuciferAI chat panel');
  });

  it('renders the LuciferAI row as built-in with no toggle', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('LuciferAI');
    expect(html).toContain('Built-in');
    // No backend fetch runs under SSR, so the condition reads Checking…
    expect(html).toContain('Checking…');
    // LuciferAI has no checkbox: the only checkboxes are the two toggles.
    expect(checkboxCount(html)).toBe(2);
  });

  it('lists all four add-ons as Not installed with disabled Install buttons', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Add-ons');
    for (const name of ['Persona Plex', 'MCP Tools', 'gh-ai-operator', 'Android emulator']) {
      expect(html).toContain(name);
    }
    expect((html.match(/Not installed/g) || []).length).toBe(4);
    expect(disabledButtonCount(html)).toBe(4);
    expect(html).toContain('Install');
    expect(html).toContain('Install flow not built yet');
    expect(html).toContain('The install flow is not built yet');
  });

  it('notes the Android emulator is removable once installed', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Removable once installed.');
  });
});

describe('Customization tab', () => {
  it('no longer has a Toolbar plugins section', () => {
    const html = renderSettings('customization');
    expect(html).not.toContain('Toolbar plugins');
    expect(html).not.toContain('LuciferAI plugin shell');
    expect(html).not.toContain('LuciferAI chat panel');
    // The rest of the tab is untouched.
    expect(html).toContain('Processing Animation');
    expect(html).toContain('Gaze Sensitivity');
  });
});

describe('toolbar toggle settings keys', () => {
  it('toggling still writes the same toolbarPlugins keys', async () => {
    // updateSetting persists through window.lucidAPI; stub the call so
    // the local state update runs in this node environment.
    const g = globalThis as unknown as { window?: unknown };
    const prevWindow = g.window;
    g.window = {
      lucidAPI: { settings: { set: async () => undefined } },
    };
    try {
      const store = useSettingsStore.getState();
      const before = store.settings.toolbarPlugins;
      await store.updateSetting('toolbarPlugins', { synth: false, 'ai-chat': true });
      expect(useSettingsStore.getState().settings.toolbarPlugins).toEqual({
        synth: false,
        'ai-chat': true,
      });
      // Restore the prior value so later tests see the defaults.
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, toolbarPlugins: before },
      }));
      expect(useSettingsStore.getState().settings.toolbarPlugins).toEqual(before);
    } finally {
      if (prevWindow === undefined) delete g.window;
      else g.window = prevWindow;
    }
  });
});
