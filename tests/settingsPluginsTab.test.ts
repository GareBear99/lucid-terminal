/**
 * Settings Plugins-tab tests.
 *
 * The Plugins tab is the single home for plugin toggles: the
 * "Toolbar plugins" section moved out of the Customization tab into
 * the Plugins tab's Core plugins section, the LuciferAI row carries
 * its own disable toggle (default ON), and the Add-ons section
 * lists Android Connect as anchor-installed with the Devices
 * plugin while the other three read Not installed with disabled
 * Install buttons (no install flow exists yet).
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR, so the LuciferAI backend fetch does
 * not fire and the row reads "Built-in · Checking…"). The
 * component takes an optional initialTab prop so a tab's content
 * is renderable.
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

const switchCount = (html: string) =>
  (html.match(/role="switch"/g) || []).length;
const switchesOnCount = (html: string) =>
  (html.match(/aria-checked="true"/g) || []).length;
const disabledButtonCount = (html: string) =>
  (html.match(/<button[^>]*\bdisabled\b[^>]*>/g) || []).length;

describe('Plugins tab', () => {
  it('appears in the tab list', () => {
    const html = renderSettings();
    expect(html).toContain('Plugins');
  });

  it('renders the Core plugins section with the Synth, AI Chat, and Forge toolbar toggles', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Core plugins');
    expect(html).toContain('Synth');
    expect(html).toContain('AI Chat');
    expect(html).toContain('Forge');
    // Four switches on the tab: the three toolbar toggles plus the
    // LuciferAI disable toggle on its own row.
    expect(switchCount(html)).toBe(4);
    // The toggles keep their descriptions from the toolbar data.
    expect(html).toContain('LuciferAI plugin shell');
    expect(html).toContain('LuciferAI chat panel');
    expect(html).toContain('Train your Homunculi');
  });

  it('renders the LuciferAI row as built-in with its own disable toggle', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('LuciferAI');
    expect(html).toContain('Built-in');
    // No backend fetch runs under SSR, so the condition reads Checking…
    expect(html).toContain('Checking…');
    // The disable toggle is ON by default (Synth is the other ON
    // switch; AI Chat and Forge default off).
    expect(switchCount(html)).toBe(4);
    expect(switchesOnCount(html)).toBe(2);
    expect(html).toContain('turning it off removes the plugin entirely');
  });

  it('lists the add-ons: Android Connect anchor-installed, the other three Not installed with disabled Install buttons', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Add-ons');
    for (const name of ['Persona Plex', 'MCP Tools', 'gh-ai-operator', 'Android Connect']) {
      expect(html).toContain(name);
    }
    expect((html.match(/Not installed/g) || []).length).toBe(3);
    expect(html).toContain('Installed · Anchored with Devices');
    expect(disabledButtonCount(html)).toBe(3);
    expect(html).toContain('Install');
    expect(html).toContain('Install flow not built yet');
    expect(html).toContain('The install flow is not built yet');
  });

  it('notes Android Connect is removable once installed', () => {
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
