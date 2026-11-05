/**
 * Anchored add-ons — the four add-ons Gary settled (2026-11-04), in
 * order. Add-ons are NOT pre-installed: each one is installed on
 * demand via a dashboard install button + in-app setup. There is no
 * install flow yet (Persona Plex still needs Gary's six decisions;
 * the others have no install flow at all), so every add-on here reads
 * as not installed and the Settings UI keeps its Install buttons
 * disabled until a flow exists. This file is data only — no store,
 * no install logic.
 *
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
   *  flow exists and records an install. */
  installed: boolean;
  /** Whether the add-on can be removed once installed. */
  removable: boolean;
}

export const PLUGIN_ADDONS: PluginAddon[] = [
  {
    id: 'persona-plex',
    name: 'Persona Plex',
    description: 'Personas + MCP tools for the AI chat — one plex embodiment, personas inside.',
    installed: false,
    removable: false,
  },
  {
    id: 'mcp-tools',
    name: 'MCP Tools',
    description: 'Model Context Protocol tools — connect external tools to Lucid.',
    installed: false,
    removable: false,
  },
  {
    id: 'gh-ai-operator',
    name: 'gh-ai-operator',
    description: 'Evidence-first GitHub scout + single-target code reviewer.',
    installed: false,
    removable: false,
  },
  {
    id: 'android-emulator',
    name: 'Android emulator',
    description: 'Run and control Android devices from Lucid — up to 99 connected.',
    installed: false,
    removable: true,
  },
];
