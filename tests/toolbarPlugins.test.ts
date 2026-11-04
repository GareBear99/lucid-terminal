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
      expect(['synth', 'ai-chat']).toContain(plugin.action);
      expect(typeof plugin.defaultOnToolbar).toBe('boolean');
    }
  });

  it('the Synth plugin is on by default — it already has a toolbar button', () => {
    expect(byId('synth').defaultOnToolbar).toBe(true);
  });

  it('the AI Chat plugin is off by default — it has no toolbar button today', () => {
    expect(byId('ai-chat').defaultOnToolbar).toBe(false);
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
    // Defaults: Synth on, AI Chat off — the section has exactly one button.
    expect(enabledToolbarPlugins(undefined).map((p) => p.id)).toEqual(['synth']);
    expect(enabledToolbarPlugins({}).map((p) => p.id)).toEqual(['synth']);
    // Toggling AI Chat on grows the section to two buttons.
    expect(enabledToolbarPlugins({ 'ai-chat': true }).map((p) => p.id)).toEqual([
      'synth',
      'ai-chat',
    ]);
    // Toggling Synth off leaves only AI Chat.
    expect(enabledToolbarPlugins({ synth: false, 'ai-chat': true }).map((p) => p.id)).toEqual([
      'ai-chat',
    ]);
    // Everything off: the section is empty (no buttons, no divider).
    expect(enabledToolbarPlugins({ synth: false, 'ai-chat': false })).toEqual([]);
  });

  it('ignores unknown ids in the Settings map', () => {
    expect(enabledToolbarPlugins({ 'not-a-plugin': true }).map((p) => p.id)).toEqual([
      'synth',
    ]);
  });
});
