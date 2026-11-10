/**
 * Toolbar plugins — the plugins that can show as buttons in the main
 * sidebar's icon bar, in the plugins section above Settings.
 *
 * The plugin system today is the PLUGIN_SHELLS registry
 * (src/types/synth.ts): LuciferAI is the only shelled plugin,
 * embodied as Lucifer the Sentinel in the synth shell. It has two
 * surfaces a toolbar button can open: the Synth view (its shell) and
 * the blood drop terminal (the creation place, on the blood drop —
 * Gary, 2026-11-07 ~09:18 PST — both blood drops go to the same
 * creation place). Each surface is one toolbar-plugin entry below.
 *
 * AI Chat is NOT a LuciferAI surface any more (Gary, 2026-11-07):
 * it is Lucid AI, its own plugin, unmounted from LuciferAI and
 * mounted as a top-level panel. Its model is the ping server (Llama
 * 3.2 1B via Cloudflare), an API key, or a local model — never
 * LuciferAI — so it works with the plugin on or off, on every view.
 * Its dependencies are the chat routes, which the chat verifies
 * before answering and reports honestly when none can answer.
 * Never re-couple it to LuciferAI: no gate on the panel may read
 * the plugin, or the panel disappears with it again.
 *
 * A future plugin adds one entry here (and, for a shell, one entry in
 * PLUGIN_SHELLS). The Sidebar renders one button per entry that is
 * toggled on in Settings; the section grows taller per enabled plugin.
 */
import { MousePointer2, Orbit, Sparkles, Hammer } from 'lucide-react';
import type { ComponentType } from 'react';
import { BloodDropIcon } from '../components/Layout/BloodDropIcon';

/** An icon a toolbar button can render — a lucide icon or a custom one. */
export type ToolbarIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface ToolbarPlugin {
  /** Stable id, e.g. 'synth' | 'ai-chat'. Used as the Settings key. */
  id: string;
  /** Display name, e.g. 'Synth'. Shown in Settings and as the tooltip. */
  name: string;
  /** One short line for the Settings list. */
  description: string;
  /** Icon for the toolbar button and the Settings row. */
  icon: ToolbarIcon;
  /** What clicking the toolbar button does. */
  action: 'synth' | 'ai-chat' | 'forge' | 'help' | 'mouse';
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
    id: 'help',
    name: 'Blood drop',
    description: 'Blood drop terminal — the creation place.',
    icon: BloodDropIcon,
    action: 'help',
    // The blood drop opens the blood drop terminal (Gary, 2026-11-07
    // ~09:18 PST — both blood drops go to the same creation place) —
    // it is a toolbar button of its own, so it stays on.
    defaultOnToolbar: true,
  },
  {
    id: 'ai-chat',
    name: 'AI Chat',
    description: 'Lucid AI chat panel — talk to Lucid AI. Runs on the ping server, your API key, or a local model. Its own plugin, independent of LuciferAI.',
    icon: Sparkles,
    action: 'ai-chat',
    // No toolbar button today (it lives on the StatusBar), so it starts
    // off — turning it on is Gary's explicit choice.
    defaultOnToolbar: false,
  },
  {
    id: 'llmbuilder',
    name: 'Forge',
    description: 'Train your Homunculi — build, benchmark, and promote small models.',
    icon: Hammer,
    action: 'forge',
    // New surface — no toolbar button until Gary turns it on.
    defaultOnToolbar: false,
  },
  {
    id: 'mouse',
    name: 'Mouse',
    description: 'The Mouse — every pointer Lucid has, mice and finger pointers alike. Opens the Mouse segment in Settings → Modules.',
    icon: MousePointer2,
    action: 'mouse',
    // Pre-installed segment, so the plugin shows with it (Gary,
    // 2026-11-09 — the Mouse is a segment AND a plugin, following
    // the Portal Deck pattern). HONEST LIMIT: there is no
    // segment-installed gate in the toolbar code yet — no plugin
    // here checks whether its segment is installed — so this
    // defaults ON with the segment instead of being gated on it.
    // A real installed-gate is open, not built.
    defaultOnToolbar: true,
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
