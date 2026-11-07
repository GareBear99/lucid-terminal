/**
 * Anchored add-on data tests.
 *
 * The five add-ons Gary settled (three on 2026-11-04, Desktop
 * Commander and Segments on 2026-11-06), in order. MCP Tools was
 * removed (Gary, 2026-11-06) — it named no specific tools and had
 * no install flow. User installs are recorded in the settings
 * store's `installedAddons` list, not in this data file (the
 * `installed` flag stays false here); Android Connect is
 * anchor-installed with the Devices plugin (Gary, 2026-11-05) and
 * Segments with the Modules plugin (Gary, 2026-11-06) — their
 * installed state derives from the anchor. Persona Plex is
 * installable now (Gary, 2026-11-06) — one plex embodiment,
 * personas inside, all local, no servers. Segments has no install
 * action at all.
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
  it('lists exactly the five anchored add-ons, in order', () => {
    expect(PLUGIN_ADDONS.map((a) => a.id)).toEqual([
      'persona-plex',
      'gh-ai-operator',
      'desktop-commander',
      'android-emulator',
      'segments',
    ]);
  });

  it('MCP Tools is gone — removed, not renamed', () => {
    expect(PLUGIN_ADDONS.find((a) => a.id === 'mcp-tools')).toBeUndefined();
    expect(PLUGIN_ADDONS.find((a) => a.name === 'MCP Tools')).toBeUndefined();
  });

  it('Desktop Commander is an installable add-on (no anchor, removable)', () => {
    const dc = PLUGIN_ADDONS.find((a) => a.id === 'desktop-commander');
    expect(dc).toBeDefined();
    expect(dc?.name).toBe('Desktop Commander');
    expect(dc?.description).toBeTruthy();
    expect(dc?.anchor).toBeUndefined();
    expect(dc?.installBlockedReason).toBeUndefined();
    expect(dc?.installed).toBe(false);
    expect(dc?.removable).toBe(true);
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

  it('no add-on is user-installed in the data file — installs live in settings', () => {
    // The static `installed` flag stays false for every entry: a
    // user install is recorded in the settings store's
    // `installedAddons` list (see isAddonInstalled), not here.
    // Android Connect counts as installed by virtue of its anchor
    // (see the anchor tests below), not by a user install.
    for (const addon of PLUGIN_ADDONS) {
      expect(addon.installed).toBe(false);
    }
  });

  it('Persona Plex, the Android emulator and Desktop Commander are removable once installed', () => {
    const byId = (id: string) => PLUGIN_ADDONS.find((a) => a.id === id)!;
    expect(byId('android-emulator').removable).toBe(true);
    expect(byId('desktop-commander').removable).toBe(true);
    // Persona Plex is installable now (Gary, 2026-11-06) and
    // removable like Desktop Commander.
    expect(byId('persona-plex').removable).toBe(true);
    expect(byId('gh-ai-operator').removable).toBe(false);
    expect(byId('segments').removable).toBe(false);
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

  it('Segments is installed by virtue of the Modules anchor', () => {
    const segments = PLUGIN_ADDONS.find((a) => a.id === 'segments');
    expect(segments).toBeDefined();
    expect(segments?.anchor).toBe('modules');
    expect(isAddonInstalled(segments!)).toBe(true);
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

  it('Devices and Modules are the anchors', () => {
    expect(ANCHORED_PLUGIN_IDS).toEqual(['devices', 'modules']);
  });
});

describe('addonAnchorLabel', () => {
  it('labels the anchor-installed add-on', () => {
    const android = PLUGIN_ADDONS.find((a) => a.id === 'android-emulator');
    expect(addonAnchorLabel(android!)).toBe('Anchored with Devices');
  });

  it('labels Segments as anchored with Modules', () => {
    const segments = PLUGIN_ADDONS.find((a) => a.id === 'segments');
    expect(addonAnchorLabel(segments!)).toBe('Anchored with Modules');
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
  it('no add-on is blocked now — Persona Plex is installable (Gary, 2026-11-06)', () => {
    const plex = PLUGIN_ADDONS.find((a) => a.id === 'persona-plex');
    expect(plex?.installBlockedReason).toBeUndefined();
    for (const addon of PLUGIN_ADDONS) {
      expect(addon.installBlockedReason).toBeUndefined();
    }
  });

  it('gh-ai-operator and Desktop Commander are installable (no blocked reason)', () => {
    for (const id of ['gh-ai-operator', 'desktop-commander']) {
      const addon = PLUGIN_ADDONS.find((a) => a.id === id)!;
      expect(addon.anchor).toBeUndefined();
      expect(addon.installBlockedReason).toBeUndefined();
    }
  });
});

describe('isAddonInstalled (user installs)', () => {
  it('an id in the installed list counts as installed', () => {
    const dc = PLUGIN_ADDONS.find((a) => a.id === 'desktop-commander')!;
    expect(isAddonInstalled(dc, [])).toBe(false);
    expect(isAddonInstalled(dc, ['desktop-commander'])).toBe(true);
  });

  it('an id not in the installed list is not installed', () => {
    const gh = PLUGIN_ADDONS.find((a) => a.id === 'gh-ai-operator')!;
    expect(isAddonInstalled(gh, ['desktop-commander'])).toBe(false);
  });

  it('an anchor-installed add-on stays installed even with an empty list', () => {
    const android = PLUGIN_ADDONS.find((a) => a.id === 'android-emulator')!;
    expect(isAddonInstalled(android, [])).toBe(true);
  });
});
