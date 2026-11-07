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
  /** Whether the blood drop terminal is shown — the toggle's on state. Defaults off. */
  bloodDropActive?: boolean;
  /** Clicking the drop toggles the blood drop terminal. Omitted → the drop is a status display only. */
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
 * is DISABLED this renders NOTHING at all — not even the grey
 * offline dot, which is itself a LuciferAI trace — so the flex row
 * reflows and the prompt input stretches to fill the gap the drop
 * left (the send arrow stays attached to the input).
 *
 * The toggle (Gary, 2026-11-07 ~09:20 PST): the drop next to the
 * send arrow is a clickable toggle for the blood drop terminal. It
 * ALWAYS defaults darkened/off, so no blood drop terminal is
 * awaiting commands until it is turned on — darkened = off, full
 * brightness = on. The status stays in the tooltip.
 */
export function LuciferStatusIndicator({
  enabled,
  checking,
  modelAvailable,
  modelNames,
  available,
  bloodDropActive = false,
  onToggleBloodDrop,
}: LuciferStatusIndicatorProps) {
  const status = luciferStatusIndicator(enabled, checking, modelAvailable, available);
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

  // The toggle (Gary, 2026-11-07 ~09:20 PST): the drop next to the
  // send arrow is a clickable toggle for the blood drop terminal.
  // It ALWAYS defaults darkened/off (bloodDropActive defaults false),
  // so no blood drop terminal is awaiting commands until it is turned
  // on. Darkened = off, full brightness = on.
  if (onToggleBloodDrop) {
    return (
      <Tooltip content={`${statusText} — click to toggle the blood drop terminal`}>
        <button
          type="button"
          onClick={onToggleBloodDrop}
          aria-label="Toggle blood drop terminal"
          aria-pressed={bloodDropActive}
          className={`text-xs ${color} ${bloodDropActive ? 'opacity-100' : 'opacity-40'} hover:opacity-100 transition-opacity select-none`}
        >
          {glyph}
        </button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={statusText}>
      <span className={`text-xs ${color}`}>{glyph}</span>
    </Tooltip>
  );
}
