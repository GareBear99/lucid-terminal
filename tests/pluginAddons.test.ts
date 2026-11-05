/**
 * Anchored add-on data tests.
 *
 * The four add-ons Gary settled (2026-11-04), in order. Nothing is
 * pre-installed and there is no install flow yet, so every add-on
 * reads as not installed; the Android emulator is the only one that
 * must be removable once installed.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { PLUGIN_ADDONS } from '../src/data/pluginAddons';

describe('PLUGIN_ADDONS', () => {
  it('lists exactly the four anchored add-ons, in order', () => {
    expect(PLUGIN_ADDONS.map((a) => a.id)).toEqual([
      'persona-plex',
      'mcp-tools',
      'gh-ai-operator',
      'android-emulator',
    ]);
  });

  it('has no duplicate ids', () => {
    const ids = PLUGIN_ADDONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every add-on has a name and a one-line description', () => {
    for (const addon of PLUGIN_ADDONS) {
      expect(addon.name).toBeTruthy();
      expect(addon.description).toBeTruthy();
    }
  });

  it('nothing is installed — there is no install flow yet', () => {
    for (const addon of PLUGIN_ADDONS) {
      expect(addon.installed).toBe(false);
    }
  });

  it('only the Android emulator is removable once installed', () => {
    const byId = (id: string) => PLUGIN_ADDONS.find((a) => a.id === id)!;
    expect(byId('android-emulator').removable).toBe(true);
    expect(byId('persona-plex').removable).toBe(false);
    expect(byId('mcp-tools').removable).toBe(false);
    expect(byId('gh-ai-operator').removable).toBe(false);
  });
});
