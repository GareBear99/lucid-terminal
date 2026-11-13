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

/** The blood drop's fills. Red while speaking (the 🩸 emoji's
 * red); grey while silenced. The fill — not a CSS filter — is
 * what makes it grey, see BloodDropIcon. */
export const BLOOD_DROP_RED = '#ef4444';
export const BLOOD_DROP_GREY = '#6b7280';

/**
 * The blood drop as an inline SVG droplet (12px, the text-xs
 * size), NOT the 🩸 emoji.
 *
 * WHY NOT THE EMOJI (Gary, 2026-11-08 ~06:15 PST — the silencer
 * was still broken: the drop DISAPPEARED on click instead of
 * greying): the silenced state used Tailwind `opacity-40
 * grayscale` on the 🩸 emoji. The state was correct
 * (luciferAiEnabled stayed true, luciferAiSilenced became true —
 * verified live in lucid-settings.json), but the drop rendered
 * NOTHING. The `grayscale` CSS filter blanks a color-emoji glyph
 * in this app's Electron 28 / Chromium — the emoji is drawn via a
 * color-font bitmap path the filter pipeline drops, so the drop
 * vanished instead of greying, and with no visible drop there was
 * nothing to click to un-silence it (Gary: "its gone now you cant
 * reproduce it thats your tell"). An SVG with an explicit fill has
 * no filter anywhere on it, so it cannot blank: red while
 * speaking, grey while silenced, always visible, always clickable.
 * Never put a CSS filter (grayscale / saturate / blur) on the
 * drop again — that is the bug. The jsdom unit tests could not
 * catch it: they assert class names, and a class name renders
 * fine in jsdom; only real pixels showed the drop was gone.
 */
export function BloodDropIcon({ fill }: { fill: string }) {
  return (
    <svg
      data-testid="blood-drop-svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={fill}
      aria-hidden="true"
      className="inline-block align-[-1px]"
    >
      <path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z" />
    </svg>
  );
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
 * LuciferAI's voices — the drop GREYS OUT (grey SVG fill, always
 * visible) but stays visible and clickable, so clicking it
 * again un-silences. It does NOT turn the plugin off and does
 * NOT stop the runtime: SILENCED = POTENTIAL DAEMON ONLY (Gary,
 * 2026-11-08 ~06:41 PST) — while silenced LuciferAI does nothing
 * active (no bubbles on its inputs, no terminal link, no awaiting
 * commands) and its causal ticks FREEZE, never reset or
 * re-numbered, resuming from the frozen count on un-silence. The
 * drop disappears ONLY when LuciferAI is turned off via the Settings
 * toggle (Gary, 2026-11-08 ~02:29 PST: "off like in settings
 * toggle") — that is the plain-terminal rule: when LuciferAI is
 * off the terminal must be no different than a terminal, so
 * there is no drop left behind as a re-enable control. Re-enable
 * LuciferAI from Settings → Plugins, not from a leftover drop.
 * While ON and not silenced the drop is full brightness red;
 * while silenced it is grey. Clicking it never prints or repeats
 * the "awaiting commands" line (toggling only flips the silenced
 * setting; the heartbeat is the plugin's own idle status line
 * and shows only while the plugin is on, idle, and speaking).
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

  // The drop glyph. Silenced dominates: whenever silenced the
  // drop is the grey SVG droplet (always visible, always
  // clickable) — the status glyphs (⏳ / ⚪) only show while
  // speaking. The grey is a fill, never a CSS filter (see
  // BloodDropIcon — a filter on the emoji blanked the drop
  // entirely in Electron 28, Gary 2026-11-08 ~06:15 PST).
  const dropGlyph = silenced ? (
    <BloodDropIcon fill={BLOOD_DROP_GREY} />
  ) : status === 'ready' || status === 'loaded-no-model' ? (
    <BloodDropIcon fill={BLOOD_DROP_RED} />
  ) : status === 'checking' ? (
    '⏳'
  ) : (
    '⚪'
  );

  // The toggle (Gary, 2026-11-08 ~02:28 PST): the drop next to
  // the send arrow is LuciferAI's silencer. While ON and speaking
  // it is lit red; while silenced it is GREY (grey SVG fill) but
  // stays visible and clickable, so clicking it un-silences. It
  // never turns the plugin off and never hides the drop — only
  // the Settings toggle does that.
  if (onToggleBloodDrop) {
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
          data-testid="blood-drop"
          onClick={onToggleBloodDrop}
          aria-label="Toggle LuciferAI"
          aria-pressed={active}
          className={`text-xs ${color} opacity-100 hover:opacity-100 transition-opacity select-none`}
        >
          {dropGlyph}
        </button>
      </Tooltip>
    );
  }

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
      <span data-testid="blood-drop" className={`text-xs ${color}`}>{dropGlyph}</span>
    </Tooltip>
  );
}
