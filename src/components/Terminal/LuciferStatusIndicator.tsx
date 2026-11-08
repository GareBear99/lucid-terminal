import { Tooltip } from '../Tooltip/Tooltip';
import { luciferStatusIndicator } from '../../lib/luciferAi';

interface LuciferStatusIndicatorProps {
  /** The LuciferAI plugin enabled state (settings key). */
  enabled: boolean;
  /** A plugin probe is in flight. */
  checking: boolean;
  /** A model is loaded and ready. */
  modelAvailable: boolean;
  /** Names of the loaded models, for the tooltip. */
  modelNames: string[];
  /** The plugin wrapper is up (loaded, with or without a model). */
  available: boolean;
  /** Whether the quick-disable toggle is ON (LuciferAI enabled).
   * Defaults off. */
  toggleActive?: boolean;
  /** Clicking the drop toggles LuciferAI itself (the quick disable,
   * Gary 2026-11-07). Omitted → the drop is a status display only. */
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
 * is DISABLED the indicator renders NOTHING at all — not even the
 * grey offline dot, which is itself a LuciferAI trace — so the
 * flex row reflows and the prompt input stretches to fill the gap
 * the drop left (the send arrow stays attached to the input).
 *
 * The toggle (Gary, 2026-11-07 ~09:20 PST, clarified ~18:57 PST,
 * CORRECTED 2026-11-07 ~20:17 PST): the drop next to the send
 * arrow IS LuciferAI's quick disable — but it exists ONLY while
 * the plugin is ON. Clicking it flips LuciferAI off, and the drop
 * goes away with everything else LuciferAI, leaving a plain
 * terminal: no drop, no heartbeat, no LuciferAI anything. A plain
 * terminal has no blood drop, so there is NO darkened/off drop
 * left behind as a re-enable control — that was the old design
 * (bd0ea6c), and Gary corrected it: when LuciferAI is off the
 * terminal must be no different than a terminal. Re-enable
 * LuciferAI from Settings → Plugins, not from a leftover drop.
 * While ON the drop is full brightness — never greyed, never
 * darkened — and clicking it never prints or repeats the
 * "awaiting commands" line (toggling only flips the setting; the
 * heartbeat is the plugin's own idle status line and shows only
 * while the plugin is on and idle).
 */
export function LuciferStatusIndicator({
  enabled,
  checking,
  modelAvailable,
  modelNames,
  available,
  toggleActive = false,
  onToggleBloodDrop,
}: LuciferStatusIndicatorProps) {
  const status = luciferStatusIndicator(enabled, checking, modelAvailable, available);

  // A plain terminal has no blood drop (Gary, 2026-11-07 ~20:17
  // PST): when LuciferAI is off the drop renders NOTHING — not
  // darkened, not clickable, not there — even with a toggle
  // handler. The old design kept a darkened drop behind as the
  // re-enable control; that left a LuciferAI trace in a terminal
  // that was supposed to be plain, so it is gone. The quick
  // disable exists only while the plugin is ON: the drop is lit,
  // clicking it turns the plugin off, and the drop disappears with
  // it. Re-enable from Settings → Plugins.
  if (!enabled) return null;

  // The toggle (Gary, 2026-11-07): the drop next to the send arrow
  // is LuciferAI's quick disable. It only renders while the plugin
  // is ON, so it is always lit (opacity-100) — never darkened,
  // never greyed-out unclickable. Clicking it flips the plugin off.
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
    return (
      <Tooltip content={`${statusText} — click to turn LuciferAI off`}>
        <button
          type="button"
          onClick={onToggleBloodDrop}
          aria-label="Toggle LuciferAI"
          aria-pressed={toggleActive}
          className={`text-xs ${color} opacity-100 hover:opacity-100 transition-opacity select-none`}
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
      <span className={`text-xs ${color}`}>{glyph}</span>
    </Tooltip>
  );
}
