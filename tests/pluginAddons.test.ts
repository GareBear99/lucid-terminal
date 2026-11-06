/**
 * Anchored add-on data tests.
 *
 * The four add-ons Gary settled (2026-11-04), in order. Nothing is
 * user-installed and there is no install flow yet — except Android
 * Connect, which is anchor-installed with the Devices plugin
 * (Gary, 2026-11-05): its installed state derives from the anchor,
 * not from the `installed` flag. The Android emulator is the only
 * one that must be removable once installed.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  PLUGIN_ADDONS,
  ANCHORED_PLUGIN_IDS,
  isAddonInstalled,
  addonAnchorLabel,
  type PluginAddon,
} from '../src/data/pluginAddons';

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

  it('no add-on is user-installed — there is no install flow yet', () => {
    // The flag is only half the story: Android Connect counts as
    // installed by virtue of its anchor (see the anchor tests
    // below), not by a user install.
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

describe('isAddonInstalled (anchor install)', () => {
  it('Android Connect is installed by virtue of the Devices anchor', () => {
    const android = PLUGIN_ADDONS.find((a) => a.id === 'android-emulator');
    expect(android).toBeDefined();
    expect(android?.anchor).toBe('devices');
    expect(isAddonInstalled(android!)).toBe(true);
  });

  it('a non-anchored add-on with installed:false is not installed', () => {
    const plex = PLUGIN_ADDONS.find((a) => a.id === 'persona-plex');
    expect(isAddonInstalled(plex!)).toBe(false);
  });

  it('an explicitly installed add-on counts as installed', () => {
    const addon: PluginAddon = {
      id: 'x',
      name: 'X',
      description: 'X.',
      installed: true,
      removable: false,
    };
    expect(isAddonInstalled(addon)).toBe(true);
  });

  it('an anchor that is not in ANCHORED_PLUGIN_IDS installs nothing', () => {
    const addon: PluginAddon = {
      id: 'y',
      name: 'Y',
      description: 'Y.',
      installed: false,
      removable: false,
      anchor: 'nope',
    };
    expect(isAddonInstalled(addon)).toBe(false);
  });

  it('Devices is the only anchor today', () => {
    expect(ANCHORED_PLUGIN_IDS).toEqual(['devices']);
  });
});

describe('addonAnchorLabel', () => {
  it('labels the anchor-installed add-on', () => {
    const android = PLUGIN_ADDONS.find((a) => a.id === 'android-emulator');
    expect(addonAnchorLabel(android!)).toBe('Anchored with Devices');
  });

  it('is null for non-anchored and user-installed add-ons', () => {
    const plex = PLUGIN_ADDONS.find((a) => a.id === 'persona-plex');
    expect(addonAnchorLabel(plex!)).toBeNull();
    expect(
      addonAnchorLabel({
        id: 'x',
        name: 'X',
        description: 'X.',
        installed: true,
        removable: false,
        anchor: 'devices',
      }),
    ).toBeNull();
  });
});

describe('install-blocked reasons', () => {
  it('every non-anchored add-on says why it cannot be installed', () => {
    for (const addon of PLUGIN_ADDONS) {
      if (addon.anchor) continue;
      expect(addon.installBlockedReason).toBeTruthy();
    }
  });
});
