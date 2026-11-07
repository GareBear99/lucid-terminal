/**
 * Anchored add-ons — the five add-ons Gary settled (three on
 * 2026-11-04, Desktop Commander and Segments on 2026-11-06), in
 * order. Add-ons are NOT pre-installed — except where an ANCHOR
 * plugin installs one automatically (see below). An installable
 * add-on is installed from Settings > Plugins: the Install button
 * records the add-on's id in the persisted `installedAddons`
 * setting (see src/types/index.ts), and `isAddonInstalled` below
 * counts a listed id as installed. Persona Plex is installable now
 * (Gary, 2026-11-06) — one plex embodiment, personas inside, all
 * local, no servers. This file is data only — the install record
 * lives in the settings store, not here.
 *
 * ANCHOR INSTALL (Gary, 2026-11-05): Devices is an ANCHOR plugin,
 * and Android Connect (the android-emulator add-on) is an add-on OF
 * the Devices plugin, automatically anchor-installed with it. An
 * add-on with `anchor: 'devices'` is installed by virtue of the
 * anchor being present — not user-installed, not something the user
 * has to install from the Add-ons section. Its installed state
 * derives from the anchor (isAddonInstalled below), and the
 * Settings UI shows it as "Installed · Anchored with Devices".
 * The Android emulator add-on must be removable once installed; the
 * others have no removal story yet.
 *
 * ANCHOR INSTALL (Gary, 2026-11-06): Modules is an ANCHOR plugin,
 * and Segments is an add-on OF the Modules plugin, automatically
 * anchor-installed with it — an extension of Modules, with no
 * install step and no install action. Its installed state derives
 * from the anchor, and the Settings UI shows it as "Installed ·
 * Anchored with Modules". When a starship is detected, its Segments
 * show up in the Modules tab (see src/lib/starshipDetection.ts).
 */
export interface PluginAddon {
  /** Stable id, e.g. 'persona-plex'. */
  id: string;
  /** Display name, e.g. 'Persona Plex'. */
  name: string;
  /** One short line for the Settings list. */
  description: string;
  /** Whether the add-on is installed. Always false in this data
   *  file — a user install is recorded in the settings store's
   *  `installedAddons` list (see isAddonInstalled), not here — except
   *  for an anchored add-on, whose installed state comes from its
   *  anchor instead (see isAddonInstalled). */
  installed: boolean;
  /** Whether the add-on can be removed once installed. */
  removable: boolean;
  /** Anchor plugin id that installs this add-on automatically, e.g.
   *  'devices'. When set, the add-on is installed by virtue of the
   *  anchor — never user-installed. */
  anchor?: string;
  /** Why the add-on cannot be installed yet. Shown on the disabled
   *  Install button in Settings. Absent for anchored add-ons (they
   *  need no install) and for add-ons with a working install flow. */
  installBlockedReason?: string;
}

/** Plugin ids that anchor-install their add-ons. Devices and
 *  Modules are the anchors today; a future anchor plugin adds its
 *  id here and sets `anchor` on its add-ons. */
export const ANCHORED_PLUGIN_IDS: readonly string[] = ['devices', 'modules'];

/** Whether an add-on counts as installed: its own installed flag,
 *  OR its id is in the user-installed list (installed from
 *  Settings > Plugins — recorded in the settings store's
 *  `installedAddons`, passed here by the caller), OR its anchor is
 *  one of the anchored plugins (anchor-installed — installed by
 *  virtue of the anchor, not by the user). An anchor that is not in
 *  ANCHORED_PLUGIN_IDS installs nothing. */
export function isAddonInstalled(
  addon: PluginAddon,
  installedIds: readonly string[] = [],
): boolean {
  if (addon.installed) return true;
  if (installedIds.includes(addon.id)) return true;
  if (addon.anchor && ANCHORED_PLUGIN_IDS.includes(addon.anchor)) return true;
  return false;
}

/** The anchor label for an anchor-installed add-on, e.g.
 *  "Anchored with Devices". Null when the add-on is not
 *  anchor-installed (user-installed or not installed). */
export function addonAnchorLabel(addon: PluginAddon): string | null {
  if (!addon.anchor || !ANCHORED_PLUGIN_IDS.includes(addon.anchor)) return null;
  if (addon.installed) return null;
  const displayNames: Record<string, string> = { devices: 'Devices', modules: 'Modules' };
  return `Anchored with ${displayNames[addon.anchor] ?? addon.anchor}`;
}

export const PLUGIN_ADDONS: PluginAddon[] = [
  {
    id: 'persona-plex',
    name: 'Persona Plex',
    description: 'Personas for the AI chat — one plex embodiment, personas inside. Works locally, no servers.',
    installed: false,
    removable: true,
  },
  {
    id: 'gh-ai-operator',
    name: 'gh-ai-operator',
    description: 'Evidence-first GitHub scout + single-target code reviewer.',
    installed: false,
    removable: false,
  },
  {
    id: 'desktop-commander',
    name: 'Desktop Commander',
    description: 'Desktop control via MCP — an MCP server that gives an agent desktop access.',
    installed: false,
    removable: true,
  },
  {
    id: 'android-emulator',
    name: 'Android Connect',
    description: 'Android device detection via adb — phones and emulators, listed in the Devices tab.',
    installed: false,
    removable: true,
    anchor: 'devices',
  },
  {
    id: 'segments',
    name: 'Segments',
    description: 'The starship\u2019s Segments — shown in the Modules tab when a starship is detected. An extension of the Modules plugin.',
    installed: false,
    removable: false,
    anchor: 'modules',
  },
];
