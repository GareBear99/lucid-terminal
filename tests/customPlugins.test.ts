/**
 * Custom plugins — the registry Settings reads (src/data/customPlugins.ts).
 * The registry is empty on purpose: a plugin appears only when
 * someone registers one. These tests pin the icon resolution, the
 * enabled-state rule and the validation, so a bad registry entry
 * fails loudly instead of rendering a broken row.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { Puzzle, Hammer } from 'lucide-react';
import {
  CUSTOM_PLUGINS,
  CUSTOM_PLUGIN_FALLBACK_ICON,
  resolvePluginIcon,
  isCustomPluginEnabled,
  validateCustomPlugin,
  validateCustomPlugins,
  type CustomPlugin,
} from '../src/data/customPlugins';

const lucidePlugin: CustomPlugin = {
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'Does a thing.',
  icon: { kind: 'lucide', icon: Hammer },
  defaultEnabled: false,
};

describe('resolvePluginIcon', () => {
  it('resolves a lucide icon', () => {
    expect(resolvePluginIcon({ kind: 'lucide', icon: Hammer })).toEqual({
      type: 'lucide',
      icon: Hammer,
    });
  });

  it('resolves an emoji icon', () => {
    expect(resolvePluginIcon({ kind: 'emoji', char: '🎛️' })).toEqual({
      type: 'emoji',
      char: '🎛️',
    });
  });

  it('rejects a blank emoji', () => {
    expect(resolvePluginIcon({ kind: 'emoji', char: '   ' })).toBeNull();
  });

  it('resolves an image path', () => {
    expect(resolvePluginIcon({ kind: 'image', src: '/icons/my-plugin.png' })).toEqual({
      type: 'image',
      src: '/icons/my-plugin.png',
    });
  });

  it('rejects a blank image path and a missing icon', () => {
    expect(resolvePluginIcon({ kind: 'image', src: '' })).toBeNull();
    expect(resolvePluginIcon(undefined)).toBeNull();
  });
});

describe('isCustomPluginEnabled', () => {
  it('falls back to the plugin default with no override', () => {
    expect(isCustomPluginEnabled(lucidePlugin, undefined)).toBe(false);
    expect(isCustomPluginEnabled({ ...lucidePlugin, defaultEnabled: true }, {})).toBe(true);
  });

  it('a Settings override wins over the default', () => {
    expect(isCustomPluginEnabled(lucidePlugin, { 'my-plugin': true })).toBe(true);
    expect(isCustomPluginEnabled({ ...lucidePlugin, defaultEnabled: true }, { 'my-plugin': false })).toBe(false);
  });
});

describe('validateCustomPlugins', () => {
  it('the shipped registry is empty and valid', () => {
    expect(CUSTOM_PLUGINS).toEqual([]);
    expect(validateCustomPlugins(CUSTOM_PLUGINS)).toEqual([]);
  });

  it('flags duplicate ids', () => {
    const errors = validateCustomPlugins([lucidePlugin, { ...lucidePlugin, name: 'Copy' }]);
    expect(errors.some((e) => e.includes("duplicate custom plugin id 'my-plugin'"))).toBe(true);
  });

  it('flags an entry with no name and an unusable icon', () => {
    expect(validateCustomPlugin({ ...lucidePlugin, name: '' }).length).toBeGreaterThan(0);
    expect(validateCustomPlugin({ ...lucidePlugin, icon: { kind: 'emoji', char: '' } }).some((e) =>
      e.includes('unusable icon'),
    )).toBe(true);
  });

  it('a well-formed entry validates clean', () => {
    expect(validateCustomPlugin(lucidePlugin)).toEqual([]);
  });

  it('the fallback icon is the Puzzle icon', () => {
    expect(CUSTOM_PLUGIN_FALLBACK_ICON).toBe(Puzzle);
  });
});
