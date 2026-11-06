/**
 * Custom plugins — the user-registered plugin registry.
 *
 * A custom plugin is one Gary (or a user) registers here by hand:
 * an id, a name, a one-line description, an icon, and whether it
 * starts enabled. The Settings Plugins tab lists every entry with
 * its icon and a toggle; the toggle writes
 * `settings.customPlugins[id]` (see src/types/index.ts).
 *
 * The registry starts EMPTY on purpose. An empty registry is an
 * honest empty state — a plugin only appears here when someone
 * actually registers it. Nothing in this file is installed,
 * downloaded, or executed: registration is a listing, not an
 * install. A plugin that needs code behind it wires that code in
 * like the anchored plugins do (a first-class module, not a
 * manifest — there is no generic plugin loader).
 *
 * How to add one:
 *
 *   {
 *     id: 'my-plugin',
 *     name: 'My Plugin',
 *     description: 'What it does, in one line.',
 *     icon: { kind: 'lucide', icon: Puzzle },
 *     defaultEnabled: false,
 *   },
 *
 * Icons: a lucide component (`{ kind: 'lucide', icon: Puzzle }`),
 * an emoji (`{ kind: 'emoji', char: '🔌' }`), or an image
 * (`{ kind: 'image', src: '/path/to/icon.png' }`). Anything else
 * resolves to null and the row falls back to the Puzzle icon.
 */

import { Puzzle, type LucideIcon } from 'lucide-react';

export type CustomPluginIcon =
  | { kind: 'lucide'; icon: LucideIcon }
  | { kind: 'emoji'; char: string }
  | { kind: 'image'; src: string };

export interface CustomPlugin {
  /** Stable id, e.g. 'my-plugin'. Used as the Settings key. */
  id: string;
  /** Display name, e.g. 'My Plugin'. */
  name: string;
  /** One short line for the Settings list. */
  description: string;
  /** Icon for the Settings row. */
  icon: CustomPluginIcon;
  /** Whether the toggle starts on when Settings has no override. */
  defaultEnabled: boolean;
}

/** Registered custom plugins, in list order. Empty until someone
 * registers one — see the file header. */
export const CUSTOM_PLUGINS: CustomPlugin[] = [];

/** The icon a row should render, or null when the entry's icon is
 * unusable (missing, empty emoji, empty image path). The caller
 * falls back to the Puzzle icon on null — never a broken image. */
export function resolvePluginIcon(
  icon: CustomPluginIcon | undefined,
):
  | { type: 'lucide'; icon: LucideIcon }
  | { type: 'emoji'; char: string }
  | { type: 'image'; src: string }
  | null {
  if (!icon) return null;
  if (icon.kind === 'lucide') return { type: 'lucide', icon: icon.icon };
  if (icon.kind === 'emoji') {
    return icon.char.trim() ? { type: 'emoji', char: icon.char } : null;
  }
  if (icon.kind === 'image') {
    return icon.src.trim() ? { type: 'image', src: icon.src } : null;
  }
  return null;
}

/** Whether the plugin's toggle reads on. A Settings override wins;
 * with no override the plugin's default applies. */
export function isCustomPluginEnabled(
  plugin: CustomPlugin,
  customPlugins: Record<string, boolean> | null | undefined,
): boolean {
  const override = customPlugins?.[plugin.id];
  return override ?? plugin.defaultEnabled;
}

/** Validation errors for one registry entry, empty when it is
 * well-formed. Used by tests and by any future registry editor. */
export function validateCustomPlugin(plugin: CustomPlugin): string[] {
  const errors: string[] = [];
  if (!plugin.id.trim()) errors.push('custom plugin id is empty');
  if (!plugin.name.trim()) errors.push(`custom plugin '${plugin.id}' has no name`);
  if (!plugin.description.trim()) {
    errors.push(`custom plugin '${plugin.id}' has no description`);
  }
  if (resolvePluginIcon(plugin.icon) === null) {
    errors.push(`custom plugin '${plugin.id}' has an unusable icon`);
  }
  return errors;
}

/** Validation errors for the whole registry: per-entry errors plus
 * duplicate ids. Empty means the registry is well-formed. */
export function validateCustomPlugins(
  plugins: readonly CustomPlugin[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) {
      errors.push(`duplicate custom plugin id '${plugin.id}'`);
    }
    seen.add(plugin.id);
    errors.push(...validateCustomPlugin(plugin));
  }
  return errors;
}

/** The fallback icon for a row whose icon did not resolve. */
export const CUSTOM_PLUGIN_FALLBACK_ICON = Puzzle;
