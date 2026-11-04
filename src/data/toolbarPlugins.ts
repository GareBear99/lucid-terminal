/**
 * Toolbar plugins — the plugins that can show as buttons in the main
 * sidebar's icon bar, in the plugins section above Settings.
 *
 * The plugin system today is the PLUGIN_SHELLS registry
 * (src/types/synth.ts): LuciferAI is the only plugin, embodied as
 * Lucifer the Sentinel in the synth shell. It has two surfaces a toolbar
 * button can open: the Synth view (its shell) and the AI chat panel
 * (its chat). Each surface is one toolbar-plugin entry below — they are
 * two buttons for the same plugin, not two plugins.
 *
 * A future plugin adds one entry here (and, for a shell, one entry in
 * PLUGIN_SHELLS). The Sidebar renders one button per entry that is
 * toggled on in Settings; the section grows taller per enabled plugin.
 */
import { Orbit, Sparkles, type LucideIcon } from 'lucide-react';

export interface ToolbarPlugin {
  /** Stable id, e.g. 'synth' | 'ai-chat'. Used as the Settings key. */
  id: string;
  /** Display name, e.g. 'Synth'. Shown in Settings and as the tooltip. */
  name: string;
  /** One short line for the Settings list. */
  description: string;
  /** Icon for the toolbar button and the Settings row. */
  icon: LucideIcon;
  /** What clicking the toolbar button does. */
  action: 'synth' | 'ai-chat';
  /** Whether the button shows when Settings has no override for it.
   *  Plugins that already have a toolbar presence default ON; a plugin
   *  with no toolbar presence defaults OFF, so toggling it on is an
   *  explicit choice and no button appears unasked-for. */
  defaultOnToolbar: boolean;
}

export const TOOLBAR_PLUGINS: ToolbarPlugin[] = [
  {
    id: 'synth',
    name: 'Synth',
    description: 'LuciferAI plugin shell — the Sentinel synth view.',
    icon: Orbit,
    action: 'synth',
    // Already has a toolbar button (the Orbit button), so it stays on.
    defaultOnToolbar: true,
  },
  {
    id: 'ai-chat',
    name: 'AI Chat',
    description: 'LuciferAI chat panel — talk to the plugin.',
    icon: Sparkles,
    action: 'ai-chat',
    // No toolbar button today (it lives on the StatusBar), so it starts
    // off — turning it on is Gary's explicit choice.
    defaultOnToolbar: false,
  },
];

/**
 * Whether a plugin's toolbar button shows. A Settings override wins;
 * with no override the plugin's default applies. A null/undefined
 * Settings map means all defaults.
 */
export function isPluginOnToolbar(
  plugin: ToolbarPlugin,
  toolbarPlugins: Record<string, boolean> | null | undefined,
): boolean {
  const override = toolbarPlugins?.[plugin.id];
  return override ?? plugin.defaultOnToolbar;
}

/** The enabled plugins, in list order — what the toolbar renders. */
export function enabledToolbarPlugins(
  toolbarPlugins: Record<string, boolean> | null | undefined,
): ToolbarPlugin[] {
  return TOOLBAR_PLUGINS.filter((p) => isPluginOnToolbar(p, toolbarPlugins));
}
