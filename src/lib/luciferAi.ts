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
 * persisted via updateSetting like toolbarPlugins). The prompt
 * blood drop is LuciferAI's SILENCER (Gary, 2026-11-08 ~02:28 PST
 * — CORRECTS the old "quick disable" reading): clicking it does
 * NOT turn the plugin off — it silences LuciferAI's voices, the
 * drop greys out, and the runtime keeps running (causal ticks
 * keep running, causal order is held). The drop exists ONLY while
 * the plugin is ON — it disappears ONLY when LuciferAI is turned
 * off via the Settings toggle (Settings → Plugins, Gary
 * 2026-11-08 ~02:29 PST: "off like in settings toggle"), leaving
 * a plain terminal. There is NO leftover drop as a re-enable
 * control when off; a plain terminal has no blood drop. Re-enable
 * from Settings → Plugins. Every consumer reads the enabled state
 * through isLuciferAiEnabled below — never by comparing the raw
 * field — because settings persisted before the key existed have
 * no value at all, and a missing key must count as OFF. The
 * silenced state is a SEPARATE key (`luciferAiSilenced`, read
 * through isLuciferAiSilenced) — it greys the drop, it never
 * turns the plugin off.
 */
import type { Settings } from '../types';

/** True only when the setting is explicitly true. Missing (older
 *  persisted settings) counts as OFF — when off the drop is gone
 *  entirely (corrected 2026-11-07 ~20:17 PST — no leftover drop
 *  as a re-enable control; re-enable from Settings → Plugins).
 *  OFF here means the Settings toggle (Settings → Plugins, Gary
 *  2026-11-08 ~02:29 PST) — that is the ONLY thing that makes
 *  the drop disappear. The blood drop toggle itself never turns
 *  the plugin off; it silences (see isLuciferAiSilenced). */
export function isLuciferAiEnabled(settings: Pick<Settings, 'luciferAiEnabled'>): boolean {
  return settings.luciferAiEnabled === true;
}

/** True only when LuciferAI is silenced — the blood drop toggle
 *  (Gary, 2026-11-08 ~02:28 PST). Silenced is NOT off: the
 *  runtime keeps running (causal ticks keep running, causal
 *  order is held), the drop only greys out and stays clickable
 *  so it can be un-silenced. Missing (older persisted settings)
 *  counts as NOT silenced — a fresh / old install speaks. */
export function isLuciferAiSilenced(settings: Pick<Settings, 'luciferAiSilenced'>): boolean {
  return settings.luciferAiSilenced === true;
}

/** Which LuciferAI status indicator the terminal prompt row shows.
 *  'hidden' is the disabled state: the blood drop renders NOTHING
 *  (not even the grey offline dot — that is itself a LuciferAI
 *  trace), so the flex row reflows and the input stretches to fill
 *  the gap. The drop exists only while the plugin is ON (Gary,
 *  2026-11-07 ~20:17 PST — the old "stays rendered while disabled
 *  as the re-enable control" design left a LuciferAI trace in a
 *  terminal that was supposed to be plain, so it is gone). The
 *  drop disappears ONLY when the plugin is off via the Settings
 *  toggle (Gary, 2026-11-08 ~02:29 PST: "off like in settings
 *  toggle") — the blood drop toggle itself never hides it; it
 *  silences, and a silenced drop greys out but stays rendered
 *  (see isLuciferAiSilenced). 'offline' is the
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
