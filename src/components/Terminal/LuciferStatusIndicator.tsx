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
 */
export function LuciferStatusIndicator({
  enabled,
  checking,
  modelAvailable,
  modelNames,
  available,
}: LuciferStatusIndicatorProps) {
  const status = luciferStatusIndicator(enabled, checking, modelAvailable, available);
  if (status === 'hidden') return null;
  if (status === 'checking') {
    return (
      <Tooltip content="Connecting to LuciferAI plugin...">
        <span className="text-xs text-yellow-500 animate-pulse">
          ⏳
        </span>
      </Tooltip>
    );
  }
  if (status === 'ready') {
    return (
      <Tooltip content={`LuciferAI connected — model(s) ready: ${modelNames.join(', ')}`}>
        <span className="text-xs text-green-500">
          🩸
        </span>
      </Tooltip>
    );
  }
  if (status === 'loaded-no-model') {
    return (
      <Tooltip content="LuciferAI plugin loaded — no model loaded">
        <span className="text-xs text-amber-500">
          🩸
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content="LuciferAI plugin offline - terminal works in standalone mode">
      <span className="text-xs text-gray-500">
        ⚪
      </span>
    </Tooltip>
  );
}
