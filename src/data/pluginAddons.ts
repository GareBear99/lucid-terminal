/**
 * Anchored add-ons — the four add-ons Gary settled (2026-11-04), in
 * order. Add-ons are NOT pre-installed — except where an ANCHOR
 * plugin installs one automatically (see below). There is no
 * user-facing install flow yet (Persona Plex still needs Gary's six
 * decisions; the others have no install flow at all), so a
 * non-anchored add-on reads as not installed and the Settings UI
 * keeps its Install button disabled, with the reason on the button,
 * until a flow exists. This file is data only — no store, no install
 * logic.
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
 */
export interface PluginAddon {
  /** Stable id, e.g. 'persona-plex'. */
  id: string;
  /** Display name, e.g. 'Persona Plex'. */
  name: string;
  /** One short line for the Settings list. */
  description: string;
  /** Whether the add-on is installed. Always false until an install
   *  flow exists and records an install — except for an anchored
   *  add-on, whose installed state comes from its anchor instead
   *  (see isAddonInstalled). */
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

/** Plugin ids that anchor-install their add-ons. Devices is the
 *  only anchor today; a future anchor plugin adds its id here and
 *  sets `anchor` on its add-ons. */
export const ANCHORED_PLUGIN_IDS: readonly string[] = ['devices'];

/** Whether an add-on counts as installed: its own installed flag,
 *  OR its anchor is one of the anchored plugins (anchor-installed —
 *  installed by virtue of the anchor, not by the user). An anchor
 *  that is not in ANCHORED_PLUGIN_IDS installs nothing. */
export function isAddonInstalled(addon: PluginAddon): boolean {
  if (addon.installed) return true;
  if (addon.anchor && ANCHORED_PLUGIN_IDS.includes(addon.anchor)) return true;
  return false;
}

/** The anchor label for an anchor-installed add-on, e.g.
 *  "Anchored with Devices". Null when the add-on is not
 *  anchor-installed (user-installed or not installed). */
export function addonAnchorLabel(addon: PluginAddon): string | null {
  if (!addon.anchor || !ANCHORED_PLUGIN_IDS.includes(addon.anchor)) return null;
  if (addon.installed) return null;
  return `Anchored with ${addon.anchor === 'devices' ? 'Devices' : addon.anchor}`;
}

export const PLUGIN_ADDONS: PluginAddon[] = [
  {
    id: 'persona-plex',
    name: 'Persona Plex',
    description: 'Personas + MCP tools for the AI chat — one plex embodiment, personas inside.',
    installed: false,
    removable: false,
    installBlockedReason: 'Install flow not built yet — needs Gary\u2019s six decisions',
  },
  {
    id: 'mcp-tools',
    name: 'MCP Tools',
    description: 'Model Context Protocol tools — connect external tools to Lucid.',
    installed: false,
    removable: false,
    installBlockedReason: 'Install flow not built yet',
  },
  {
    id: 'gh-ai-operator',
    name: 'gh-ai-operator',
    description: 'Evidence-first GitHub scout + single-target code reviewer.',
    installed: false,
    removable: false,
    installBlockedReason: 'Install flow not built yet',
  },
  {
    id: 'android-emulator',
    name: 'Android Connect',
    description: 'Android device detection via adb — phones and emulators, listed in the Devices tab.',
    installed: false,
    removable: true,
    anchor: 'devices',
  },
];
