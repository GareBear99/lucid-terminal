/**
 * The LuciferAI enabled state — one source of truth for the disable
 * rule (Gary, 2026-11-05): when LuciferAI is DISABLED it must be
 * COMPLETELY gone. The blood drop is gone, and the "Idle • Awaiting
 * Commands..." heartbeat line is gone with it. No trace of LuciferAI
 * may be accessible or activatable anywhere in the app — including
 * the Help screen, which is bound to LuciferAI — and the plugin's
 * commands must refuse while off.
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
 * and it defaults disabled; the drop itself stays visible as the
 * re-enable control, so off-by-default can never strand the
 * plugin off). Every consumer reads it through
 * isLuciferAiEnabled below — never by comparing the raw field —
 * because settings persisted before the key existed have no value
 * at all, and a missing key must count as OFF.
 */
import type { Settings } from '../types';

/** True only when the setting is explicitly true. Missing (older
 *  persisted settings) counts as OFF — the prompt blood drop is
 *  LuciferAI's quick disable and defaults disabled (Gary,
 *  2026-11-07); the drop stays visible to turn it back on. */
export function isLuciferAiEnabled(settings: Pick<Settings, 'luciferAiEnabled'>): boolean {
  return settings.luciferAiEnabled === true;
}

/** Refusal text for anything that would activate the plugin while
 *  it is off — terminal plugin commands, the `help` command, the
 *  LLM-command path. It names where to turn it back on. */
export const LUCIFER_AI_DISABLED_MESSAGE =
  'LuciferAI is disabled — enable it in Settings → Plugins to use AI commands.';

/** The refusal a terminal block shows for a plugin command while the
 *  plugin is off. Every refusal site (the `llm` branches, `tokens`,
 *  the default branch) builds it through here so the text cannot
 *  drift between commands. `help` gets the extra line naming that
 *  Help is part of LuciferAI. */
export function refusalForDisabledCommand(commandType: string): string {
  return (
    LUCIFER_AI_DISABLED_MESSAGE +
    (commandType === 'help'
      ? '\n\nHelp is part of LuciferAI and is unavailable while the plugin is disabled.'
      : '')
  );
}

/** Which LuciferAI status indicator the terminal prompt row shows.
 *  'hidden' is the disabled state for the STATUS DISPLAY: the blood
 *  drop renders NOTHING (not even the grey offline dot — that is
 *  itself a LuciferAI trace), so the flex row reflows and the input
 *  stretches to fill the gap. The QUICK-DISABLE TOGGLE is the one
 *  exception (Gary, 2026-11-07): when a toggle handler is passed,
 *  the drop stays rendered while disabled — darkened, clickable —
 *  because a quick disable with no way back on is a trap. 'offline'
 *  is the plugin-down-but-enabled state. */
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
