/**
 * Toolbar plugin tests.
 *
 * The plugins section in the icon bar (above Settings, below a
 * separation line) shows one button per plugin toggled on in Settings.
 * The toggle lives in `settings.toolbarPlugins` (a Record keyed by
 * plugin id); a missing key falls back to the plugin's default. The
 * pure helpers in `src/data/toolbarPlugins.ts` are tested here without
 * a React render environment (no @testing-library in this repo).
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  TOOLBAR_PLUGINS,
  isPluginOnToolbar,
  enabledToolbarPlugins,
} from '../src/data/toolbarPlugins';

const byId = (id: string) => TOOLBAR_PLUGINS.find((p) => p.id === id)!;

describe('TOOLBAR_PLUGINS', () => {
  it('has no duplicate ids', () => {
    const ids = TOOLBAR_PLUGINS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every plugin has a name, description, icon, action, and boolean default', () => {
    for (const plugin of TOOLBAR_PLUGINS) {
      expect(plugin.id).toBeTruthy();
      expect(plugin.name).toBeTruthy();
      expect(plugin.description).toBeTruthy();
      // Lucide icons are forwardRef exotic components (objects), not
      // plain functions — either way they are a valid React component.
      expect(plugin.icon).toBeTruthy();
      expect(['function', 'object']).toContain(typeof plugin.icon);
      expect(['synth', 'help', 'ai-chat', 'forge', 'mouse']).toContain(plugin.action);
      expect(typeof plugin.defaultOnToolbar).toBe('boolean');
    }
  });

  it('the Synth plugin is on by default — it already has a toolbar button', () => {
    expect(byId('synth').defaultOnToolbar).toBe(true);
  });

  it('the Help plugin is on by default — the blood drop already has a toolbar button', () => {
    expect(byId('help').defaultOnToolbar).toBe(true);
    expect(byId('help').action).toBe('help');
  });

  it('the AI Chat plugin is off by default — it has no toolbar button today', () => {
    expect(byId('ai-chat').defaultOnToolbar).toBe(false);
  });

  it('the Mouse plugin is on by default — its segment is pre-installed', () => {
    // The Mouse segment is pre-installed, so the plugin shows with
    // it (Gary, 2026-11-09). HONEST LIMIT, stated in the entry:
    // there is no segment-installed gate in the toolbar code yet,
    // so this defaults ON with the segment instead of being gated
    // on it. A real installed-gate is open, not built.
    expect(byId('mouse').defaultOnToolbar).toBe(true);
    expect(byId('mouse').action).toBe('mouse');
  });
});

describe('isPluginOnToolbar', () => {
  it('applies the default when there is no Settings map', () => {
    expect(isPluginOnToolbar(byId('synth'), undefined)).toBe(true);
    expect(isPluginOnToolbar(byId('ai-chat'), undefined)).toBe(false);
    expect(isPluginOnToolbar(byId('synth'), null)).toBe(true);
    expect(isPluginOnToolbar(byId('ai-chat'), null)).toBe(false);
  });

  it('applies the default when the map has no key for the plugin', () => {
    expect(isPluginOnToolbar(byId('synth'), {})).toBe(true);
    expect(isPluginOnToolbar(byId('ai-chat'), {})).toBe(false);
    expect(isPluginOnToolbar(byId('synth'), { 'ai-chat': true })).toBe(true);
  });

  it('a Settings override wins over the default, both ways', () => {
    // Synth off in Settings hides it even though it defaults on.
    expect(isPluginOnToolbar(byId('synth'), { synth: false })).toBe(false);
    // AI Chat on in Settings shows it even though it defaults off.
    expect(isPluginOnToolbar(byId('ai-chat'), { 'ai-chat': true })).toBe(true);
    // Explicitly confirming the default changes nothing.
    expect(isPluginOnToolbar(byId('synth'), { synth: true })).toBe(true);
    expect(isPluginOnToolbar(byId('ai-chat'), { 'ai-chat': false })).toBe(false);
  });
});

describe('enabledToolbarPlugins', () => {
  it('returns only the enabled plugins, in list order', () => {
    // Defaults: Synth, Help, and Mouse on, AI Chat off — the section has three buttons.
    expect(enabledToolbarPlugins(undefined).map((p) => p.id)).toEqual(['synth', 'help', 'mouse']);
    expect(enabledToolbarPlugins({}).map((p) => p.id)).toEqual(['synth', 'help', 'mouse']);
    // Toggling AI Chat on grows the section to four buttons.
    expect(enabledToolbarPlugins({ 'ai-chat': true }).map((p) => p.id)).toEqual([
      'synth',
      'help',
      'ai-chat',
      'mouse',
    ]);
    // Toggling Synth off leaves Help, AI Chat, and Mouse.
    expect(enabledToolbarPlugins({ synth: false, 'ai-chat': true }).map((p) => p.id)).toEqual([
      'help',
      'ai-chat',
      'mouse',
    ]);
    // Everything off: the section is empty (no buttons, no divider).
    expect(enabledToolbarPlugins({ synth: false, help: false, 'ai-chat': false, mouse: false })).toEqual([]);
  });

  it('ignores unknown ids in the Settings map', () => {
    expect(enabledToolbarPlugins({ 'not-a-plugin': true }).map((p) => p.id)).toEqual([
      'synth',
      'help',
      'mouse',
    ]);
  });
});
