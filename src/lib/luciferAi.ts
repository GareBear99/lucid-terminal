/**
 * The LuciferAI enabled state — one source of truth for the disable
 * rule (Gary, 2026-11-05): when LuciferAI is DISABLED it must be
 * COMPLETELY gone. The blood drop is gone, and the "Idle • Awaiting
 * Commands..." heartbeat line is gone with it. No trace of LuciferAI
 * may be accessible or activatable anywhere in the app — including
 * the Help screen, which is bound to LuciferAI — and the plugin's
 * command words are not intercepted at all while off: they go to
 * the shell PTY, so the terminal is a plain terminal (Gary,
 * 2026-11-07 ~20:17 PST — the old design had the terminal refuse
 * them with a LuciferAI message, which was itself a LuciferAI
 * trace).
 *
 * CONSEQUENCE (stated plainly, per Gary's ask): Synth is a surface
 * of the LuciferAI plugin (src/data/toolbarPlugins.ts header), so
 * disabling LuciferAI removes the Synth surface with it. The
 * terminal itself keeps working (shell commands, fix/fixnet local
 * workflow); only the plugin is gone.
 *
 * AI Chat is NOT a LuciferAI surface any more (Gary, 2026-11-07):
 * it is Lucid AI, its own plugin, unmounted from LuciferAI — so
 * disabling LuciferAI does NOT remove the AI panel. The panel works
 * on every view with the plugin on or off; its model is the ping
 * server, an API key, or a local model. Nothing that gates the
 * panel may read this setting, or the panel disappears with the
 * plugin again.
 *
 * The state is the `luciferAiEnabled` settings key (default OFF,
 * persisted via updateSetting like toolbarPlugins — Gary,
 * 2026-11-07: the prompt blood drop is LuciferAI's QUICK DISABLE
 * and it defaults disabled. CORRECTED 2026-11-07 ~20:17 PST: the
 * drop exists ONLY while the plugin is ON — clicking it turns the
 * plugin off and the drop disappears with it, leaving a plain
 * terminal. There is NO leftover drop as a re-enable control; a
 * plain terminal has no blood drop. Re-enable from Settings →
 * Plugins. Every consumer reads it through isLuciferAiEnabled
 * below — never by comparing the raw field — because settings
 * persisted before the key existed have no value at all, and a
 * missing key must count as OFF.
 */
import type { Settings } from '../types';

/** True only when the setting is explicitly true. Missing (older
 *  persisted settings) counts as OFF — the prompt blood drop is
 *  LuciferAI's quick disable and defaults disabled (Gary,
 *  2026-11-07); when off the drop is gone entirely (corrected
 *  2026-11-07 ~20:17 PST — no leftover drop as a re-enable
 *  control; re-enable from Settings → Plugins). */
export function isLuciferAiEnabled(settings: Pick<Settings, 'luciferAiEnabled'>): boolean {
  return settings.luciferAiEnabled === true;
}

/** Which LuciferAI status indicator the terminal prompt row shows.
 *  'hidden' is the disabled state: the blood drop renders NOTHING
 *  (not even the grey offline dot — that is itself a LuciferAI
 *  trace), so the flex row reflows and the input stretches to fill
 *  the gap. There is no exception for the quick-disable toggle:
 *  the drop exists only while the plugin is ON (Gary, 2026-11-07
 *  ~20:17 PST — the old "stays rendered while disabled as the
 *  re-enable control" design left a LuciferAI trace in a terminal
 *  that was supposed to be plain, so it is gone). 'offline' is the
 *  plugin-down-but-enabled state. */
export type LuciferStatus = 'hidden' | 'checking' | 'ready' | 'loaded-no-model' | 'offline';

export function luciferStatusIndicator(
  enabled: boolean,
  checking: boolean,
  modelAvailable: boolean,
  pluginAvailable: boolean,
): LuciferStatus {
  if (!enabled) return 'hidden';
  if (checking) return 'checking';
  if (modelAvailable) return 'ready';
  if (pluginAvailable) return 'loaded-no-model';
  return 'offline';
}
