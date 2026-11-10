/**
 * Settings Plugins-tab tests.
 *
 * The Plugins tab is the single home for plugin toggles: the
 * "Toolbar plugins" section moved out of the Customization tab into
 * the Plugins tab's Core plugins section, the LuciferAI row carries
 * its own disable toggle, and the Add-ons section
 * lists Android Connect as anchor-installed with the Devices
 * plugin and Segments as anchor-installed with the Modules plugin,
 * while Persona Plex reads Not installed with an enabled Install
 * button (it is installable now, Gary 2026-11-06) and gh-ai-operator and
 * Desktop Commander read Not installed with enabled Install
 * buttons (the install flow exists now; MCP Tools was removed).
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
  // NOTE: these tests render with renderToStaticMarkup, and under
  // SSR zustand reads the store's INITIAL state — a beforeEach
  // setState cannot change what renders. So these tests pin the
  // DEFAULT state: LuciferAI OFF (Gary, 2026-11-07 — the prompt
  // blood drop is the quick disable and defaults disabled).
  it('appears in the tab list', () => {
    const html = renderSettings();
    expect(html).toContain('Plugins');
  });

  it('renders the Core plugins section with the Synth, Blood drop, AI Chat, Forge, and Mouse toolbar toggles', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Core plugins');
    expect(html).toContain('Synth');
    expect(html).toContain('Blood drop');
    expect(html).toContain('AI Chat');
    expect(html).toContain('Forge');
    expect(html).toContain('Mouse');
    // Six switches on the tab: the five toolbar toggles plus the
    // LuciferAI disable toggle on its own row.
    expect(switchCount(html)).toBe(6);
    // The toggles keep their descriptions from the toolbar data.
    // (AI Chat is Lucid AI, its own plugin — Gary, 2026-11-07 — not a
    // LuciferAI surface, so its description says so. The blood drop
    // entry is the creation place, not Help — Gary, 2026-11-07.)
    expect(html).toContain('LuciferAI plugin shell');
    expect(html).toContain('Blood drop terminal');
    expect(html).toContain('Lucid AI chat panel');
    expect(html).toContain('Train your Homunculi');
    expect(html).toContain('every pointer Lucid has');
  });

  it('renders the LuciferAI row as built-in with its own disable toggle', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('LuciferAI');
    expect(html).toContain('Built-in');
    // LuciferAI defaults OFF, so the row reads Disabled (not
    // Checking… — that is the enabled-and-probing state, which no
    // backend fetch runs under SSR to reach).
    expect(html).toContain('Built-in · Disabled');
    expect(html).toContain('Disabled — the plugin is completely gone');
    // The disable toggle is OFF by default; Synth, Blood drop, and
    // Mouse are the other ON switches (Synth and Blood drop checked
    // but disabled while the plugin is off; Mouse is not a
    // LuciferAI surface, so its switch is checked and enabled);
    // AI Chat and Forge default off.
    expect(switchCount(html)).toBe(6);
    expect(switchesOnCount(html)).toBe(3);
  });

  it('lists the add-ons: Android Connect and Segments anchor-installed, Persona Plex, gh-ai-operator and Desktop Commander installable', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Add-ons');
    for (const name of ['Persona Plex', 'gh-ai-operator', 'Desktop Commander', 'Android Connect', 'Segments']) {
      expect(html).toContain(name);
    }
    expect(html).not.toContain('MCP Tools');
    // Persona Plex, gh-ai-operator and Desktop Commander are all
    // not installed (but installable).
    expect((html.match(/Not installed/g) || []).length).toBe(3);
    expect(html).toContain('Installed · Anchored with Devices');
    expect(html).toContain('Installed · Anchored with Modules');
    // The LuciferAI-surface switches (Synth, Blood drop) are
    // disabled while the plugin is off — two disabled buttons;
    // no add-on Install button is blocked.
    expect(disabledButtonCount(html)).toBe(2);
    expect(html).toContain('Install');
    expect(html).not.toContain('six decisions');
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
