import { Tooltip } from '../Tooltip/Tooltip';
import { luciferStatusIndicator } from '../../lib/luciferAi';

interface LuciferStatusIndicatorProps {
  /** The LuciferAI plugin enabled state (the Settings toggle,
   * Settings → Plugins — the ONLY thing that makes the drop
   * disappear, Gary 2026-11-08 ~02:29 PST). */
  enabled: boolean;
  /** A plugin probe is in flight. */
  checking: boolean;
  /** A model is loaded and ready. */
  modelAvailable: boolean;
  /** Names of the loaded models, for the tooltip. */
  modelNames: string[];
  /** The plugin wrapper is up (loaded, with or without a model). */
  available: boolean;
  /** Whether LuciferAI is silenced (the blood drop toggle, Gary
   * 2026-11-08 ~02:28 PST). Silenced = the drop greys out but
   * stays visible and clickable (clicking un-silences). Defaults
   * to false (speaking). */
  silenced?: boolean;
  /** Whether the toggle reads as ON (LuciferAI speaking, not
   * silenced). Defaults to !silenced. */
  toggleActive?: boolean;
  /** Clicking the drop silences / un-silences LuciferAI (the
   * silencer, Gary 2026-11-08 ~02:28 PST) — it does NOT turn the
   * plugin off. Omitted → the drop is a status display only. */
  onToggleBloodDrop?: () => void;
}

/**
 * The LuciferAI status indicator in the terminal prompt row — the
 * blood drop 🩸. Extracted from Terminal so the disabled state is
 * unit-testable (render it with enabled={false} and assert nothing
 * is in the document).
 *
 * Honest states: the wrapper being up is NOT "connected" — only a
 * loaded model is. A wrapper with no model says so. When the plugin
 * is DISABLED (the Settings toggle, Settings → Plugins) the
 * indicator renders NOTHING at all — not even the grey offline dot,
 * which is itself a LuciferAI trace — so the flex row reflows and
 * the prompt input stretches to fill the gap the drop left (the
 * send arrow stays attached to the input).
 *
 * The toggle (Gary, 2026-11-08 ~02:28 PST — CORRECTS the old
 * "quick disable" reading, 2026-11-07 ~20:17 PST): the drop next
 * to the send arrow is JUST A SILENCER. Clicking it silences
 * LuciferAI's voices — the drop GREYS OUT (opacity-40 +
 * grayscale) but stays visible and clickable, so clicking it
 * again un-silences. It does NOT turn the plugin off and does
 * NOT stop the runtime: the causal ticks keep running and the
 * causal order is held, never reset or re-numbered. The drop
 * disappears ONLY when LuciferAI is turned off via the Settings
 * toggle (Gary, 2026-11-08 ~02:29 PST: "off like in settings
 * toggle") — that is the plain-terminal rule: when LuciferAI is
 * off the terminal must be no different than a terminal, so
 * there is no drop left behind as a re-enable control. Re-enable
 * LuciferAI from Settings → Plugins, not from a leftover drop.
 * While ON and not silenced the drop is full brightness; while
 * silenced it is greyed. Clicking it never prints or repeats the
 * "awaiting commands" line (toggling only flips the silenced
 * setting; the heartbeat is the plugin's own idle status line
 * and shows only while the plugin is on and idle).
 */
export function LuciferStatusIndicator({
  enabled,
  checking,
  modelAvailable,
  modelNames,
  available,
  silenced = false,
  toggleActive,
  onToggleBloodDrop,
}: LuciferStatusIndicatorProps) {
  const status = luciferStatusIndicator(enabled, checking, modelAvailable, available);
  // The toggle reads as ON when LuciferAI is speaking (not
  // silenced). Callers may pass toggleActive explicitly; when
  // omitted it is !silenced.
  const active = toggleActive ?? !silenced;

  // A plain terminal has no blood drop (Gary, 2026-11-07 ~20:17
  // PST, confirmed 2026-11-08 ~02:29 PST): when LuciferAI is off
  // via the Settings toggle the drop renders NOTHING — not
  // darkened, not clickable, not there — even with a toggle
  // handler, even when silenced. The silencer never hides the
  // drop; only the Settings toggle does. Re-enable from
  // Settings → Plugins.
  if (!enabled) return null;

  // The toggle (Gary, 2026-11-08 ~02:28 PST): the drop next to
  // the send arrow is LuciferAI's silencer. While ON and speaking
  // it is lit (opacity-100); while silenced it is GREYED OUT
  // (opacity-40 + grayscale) but stays visible and clickable, so
  // clicking it un-silences. It never turns the plugin off and
  // never hides the drop — only the Settings toggle does that.
  if (onToggleBloodDrop) {
    const glyph = status === 'checking' ? '⏳' : status === 'offline' ? '⚪' : '🩸';
    const color =
      status === 'checking'
        ? 'text-yellow-500 animate-pulse'
        : status === 'ready'
          ? 'text-green-500'
          : status === 'loaded-no-model'
            ? 'text-amber-500'
            : 'text-gray-500';
    const statusText =
      status === 'checking'
        ? 'Connecting to LuciferAI plugin...'
        : status === 'ready'
          ? `LuciferAI connected — model(s) ready: ${modelNames.join(', ')}`
          : status === 'loaded-no-model'
            ? 'LuciferAI plugin loaded — no model loaded'
            : 'LuciferAI plugin offline - terminal works in standalone mode';
    const silenceText = silenced
      ? 'LuciferAI silenced — click to un-silence'
      : 'Click to silence LuciferAI';
    return (
      <Tooltip content={`${statusText} — ${silenceText}`}>
        <button
          type="button"
          onClick={onToggleBloodDrop}
          aria-label="Toggle LuciferAI"
          aria-pressed={active}
          className={`text-xs ${color} ${silenced ? 'opacity-40 grayscale' : 'opacity-100'} hover:opacity-100 transition-opacity select-none`}
        >
          {glyph}
        </button>
      </Tooltip>
    );
  }

  const glyph =
    status === 'checking'
      ? '⏳'
      : status === 'ready' || status === 'loaded-no-model'
        ? '🩸'
        : '⚪';
  const color =
    status === 'checking'
      ? 'text-yellow-500 animate-pulse'
      : status === 'ready'
        ? 'text-green-500'
        : status === 'loaded-no-model'
          ? 'text-amber-500'
          : 'text-gray-500';
  const statusText =
    status === 'checking'
      ? 'Connecting to LuciferAI plugin...'
      : status === 'ready'
        ? `LuciferAI connected — model(s) ready: ${modelNames.join(', ')}`
        : status === 'loaded-no-model'
          ? 'LuciferAI plugin loaded — no model loaded'
          : 'LuciferAI plugin offline - terminal works in standalone mode';

  return (
    <Tooltip content={statusText}>
      <span className={`text-xs ${color} ${silenced ? 'opacity-40 grayscale' : ''}`}>{glyph}</span>
    </Tooltip>
  );
}
