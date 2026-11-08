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
 * is DISABLED the status display renders NOTHING at all — not even
 * the grey offline dot, which is itself a LuciferAI trace — so the
 * flex row reflows and the prompt input stretches to fill the gap
 * the drop left (the send arrow stays attached to the input).
 *
 * The toggle (Gary, 2026-11-07 ~09:20 PST, clarified ~18:57 PST):
 * the drop next to the send arrow IS LuciferAI's quick disable.
 * It ALWAYS defaults darkened/off, and clicking it flips
 * LuciferAI on/off — it never opens a panel and never prints or
 * repeats the "awaiting commands" line (toggling only flips the
 * setting; the heartbeat is the plugin's own idle status line and
 * shows only while the plugin is on and idle). When ON the drop
 * is full brightness — never greyed. The ONE exception to the
 * renders-nothing rule: with a toggle handler the drop stays
 * rendered while disabled (darkened 🩸, clickable), because a
 * quick disable with no way back on is a trap — the drop is the
 * re-enable control.
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

  // The toggle (Gary, 2026-11-07): the drop next to the send arrow
  // is LuciferAI's quick disable. It stays rendered even while
  // disabled — darkened/off, clickable — so Gary can always turn
  // the plugin back on from the prompt. Lit (opacity-100) when
  // on, darkened (opacity-40) when off, never `disabled`, never
  // greyed-out unclickable.
  if (onToggleBloodDrop) {
    const glyph = !enabled ? '🩸' : status === 'checking' ? '⏳' : status === 'offline' ? '⚪' : '🩸';
    const color = !enabled
      ? 'text-gray-500'
      : status === 'checking'
        ? 'text-yellow-500 animate-pulse'
        : status === 'ready'
          ? 'text-green-500'
          : status === 'loaded-no-model'
            ? 'text-amber-500'
            : 'text-gray-500';
    const statusText = !enabled
      ? 'LuciferAI disabled — click to turn it on'
      : status === 'checking'
        ? 'Connecting to LuciferAI plugin...'
        : status === 'ready'
          ? `LuciferAI connected — model(s) ready: ${modelNames.join(', ')}`
          : status === 'loaded-no-model'
            ? 'LuciferAI plugin loaded — no model loaded'
            : 'LuciferAI plugin offline - terminal works in standalone mode';
    return (
      <Tooltip content={`${statusText} — click to toggle LuciferAI`}>
        <button
          type="button"
          onClick={onToggleBloodDrop}
          aria-label="Toggle LuciferAI"
          aria-pressed={toggleActive}
          className={`text-xs ${color} ${toggleActive ? 'opacity-100' : 'opacity-40'} hover:opacity-100 transition-opacity select-none`}
        >
          {glyph}
        </button>
      </Tooltip>
    );
  }

  if (status === 'hidden') return null;

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
