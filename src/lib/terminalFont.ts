/**
 * Terminal font customizations (Gary, 2026-11-14 ~14:28 PST:
 * Warp font customizations in a Terminal customizations section
 * in Settings > Customization, with a "Warp" preset).
 *
 * The terminal (xterm + the Monaco composer + the feed blocks)
 * used to be hardcoded — JetBrains Mono 13 / line-height 1.5 —
 * while the Settings Font control only drove the editor. These
 * helpers are the single place that turns the terminal font
 * settings into the options each surface takes, so the three
 * surfaces can never disagree again.
 *
 * Defaults ship as Lucid's current look (JetBrains Mono 13 /
 * 1.5 / 0 / off / Normal) — the preset is a choice, not a
 * silent face change. Warp's verified values (Hack, 13, 1.2
 * ratio, ligatures off, Normal) live in WARP_PRESET.
 *
 * Hack is bundled with Lucid (src/assets/fonts/hack/ — the exact
 * TTFs Warp ships, OFL, LICENSE.md alongside), so the Warp
 * preset renders Hack on every machine, not only where it is
 * installed as a system font.
 */
import type { Settings } from '../types';

/** Families offered for the terminal — Lucid's existing six plus Hack. */
export const TERMINAL_FONT_FAMILIES = [
  'Consolas',
  'Monaco',
  'Fira Code',
  'JetBrains Mono',
  'Source Code Pro',
  'Cascadia Code',
  'Hack',
] as const;

/** Weights offered — Warp's nine trimmed to four (the doc's call). */
export const TERMINAL_FONT_WEIGHTS = [
  { label: 'Normal', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semibold', value: '600' },
  { label: 'Bold', value: '700' },
] as const;

/** Warp's settings-page ranges (verified in the research doc). */
export const TERMINAL_FONT_SIZE_MIN = 1;
export const TERMINAL_FONT_SIZE_MAX = 120;
export const TERMINAL_LINE_HEIGHT_MIN = 0.1;
export const TERMINAL_LINE_HEIGHT_MAX = 5.0;
export const TERMINAL_LETTER_SPACING_MIN = 0;
export const TERMINAL_LETTER_SPACING_MAX = 2;

export interface TerminalFontSettings {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  ligatures: boolean;
  /** Narrowed to the four offered weights — xterm's FontWeight
   *  type is a literal union, so a plain string does not
   *  type-check there. */
  weight: TerminalFontWeight;
}

/** The four offered weights (Warp's nine trimmed to four). */
export type TerminalFontWeight = '400' | '500' | '600' | '700';

const TERMINAL_FONT_WEIGHT_VALUES: readonly TerminalFontWeight[] = [
  '400',
  '500',
  '600',
  '700',
];

function isTerminalFontWeight(value: string): value is TerminalFontWeight {
  return (TERMINAL_FONT_WEIGHT_VALUES as readonly string[]).includes(value);
}

/** What the terminal renders today — the ship-with defaults. */
export const DEFAULT_TERMINAL_FONT: TerminalFontSettings = {
  family: 'JetBrains Mono',
  size: 13,
  lineHeight: 1.5,
  letterSpacing: 0,
  ligatures: false,
  weight: '400',
};

/** Warp's verified defaults — the preset, not the default. */
export const WARP_PRESET: TerminalFontSettings = {
  family: 'Hack',
  size: 13,
  lineHeight: 1.2,
  letterSpacing: 0,
  ligatures: false,
  weight: '400',
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Size input bounds (Warp's settings-page input: 1–120). */
export function clampTerminalFontSize(size: number): number {
  const v = finiteOr(size, DEFAULT_TERMINAL_FONT.size);
  return Math.min(
    TERMINAL_FONT_SIZE_MAX,
    Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(v)),
  );
}

/** Line-height ratio bounds (Warp: 0.1–5.0). */
export function clampTerminalLineHeight(ratio: number): number {
  const v = finiteOr(ratio, DEFAULT_TERMINAL_FONT.lineHeight);
  return Math.min(
    TERMINAL_LINE_HEIGHT_MAX,
    Math.max(TERMINAL_LINE_HEIGHT_MIN, Math.round(v * 100) / 100),
  );
}

/** Letter-spacing bounds — a Lucid addition (Warp sets none). */
export function clampTerminalLetterSpacing(px: number): number {
  const v = finiteOr(px, DEFAULT_TERMINAL_FONT.letterSpacing);
  return Math.min(
    TERMINAL_LETTER_SPACING_MAX,
    Math.max(TERMINAL_LETTER_SPACING_MIN, Math.round(v * 2) / 2),
  );
}

/** The fallback stack the terminal has always used, with the
 *  chosen family first (deduped, so picking JetBrains Mono
 *  does not repeat it). A missing family falls back
 *  gracefully instead of rendering nothing. */
const TERMINAL_FALLBACK_STACK = [
  'JetBrains Mono',
  'SF Mono',
  'Monaco',
  'Menlo',
  'monospace',
];

export function terminalFontStack(family: string): string {
  const seen = new Set<string>();
  return [family, ...TERMINAL_FALLBACK_STACK]
    .filter((f) => {
      if (seen.has(f)) return false;
      seen.add(f);
      return true;
    })
    .map((f) => (f === 'monospace' ? f : `'${f}'`))
    .join(', ');
}

export type TerminalFontSettingsSlice = Pick<
  Settings,
  | 'terminalFontFamily'
  | 'terminalFontSize'
  | 'terminalLineHeight'
  | 'terminalLetterSpacing'
  | 'terminalLigatures'
  | 'terminalFontWeight'
>;

/** The wide input the builders take — the store's raw values
 *  (strings, possibly stale or hand-edited). The builders
 *  normalize: clamps + the weight guard. */
export interface TerminalFontInput {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  ligatures: boolean;
  weight: string;
}

/** Normalize a wide input into the validated settings shape. */
export function normalizeTerminalFont(
  input: TerminalFontInput,
): TerminalFontSettings {
  return {
    family: input.family || DEFAULT_TERMINAL_FONT.family,
    size: clampTerminalFontSize(input.size),
    lineHeight: clampTerminalLineHeight(input.lineHeight),
    letterSpacing: clampTerminalLetterSpacing(input.letterSpacing),
    ligatures: input.ligatures ?? DEFAULT_TERMINAL_FONT.ligatures,
    // A weight outside the four offered values (a stale or
    // hand-edited persisted setting) falls back to Normal.
    weight: isTerminalFontWeight(input.weight)
      ? input.weight
      : DEFAULT_TERMINAL_FONT.weight,
  };
}

/** Read the six settings with the ship-with defaults filling
 *  any missing key (older persisted settings predate them). */
export function terminalFontFromSettings(
  settings: TerminalFontSettingsSlice,
): TerminalFontSettings {
  return normalizeTerminalFont({
    family: settings.terminalFontFamily ?? DEFAULT_TERMINAL_FONT.family,
    size: settings.terminalFontSize ?? DEFAULT_TERMINAL_FONT.size,
    lineHeight:
      settings.terminalLineHeight ?? DEFAULT_TERMINAL_FONT.lineHeight,
    letterSpacing:
      settings.terminalLetterSpacing ?? DEFAULT_TERMINAL_FONT.letterSpacing,
    ligatures:
      settings.terminalLigatures ?? DEFAULT_TERMINAL_FONT.ligatures,
    weight:
      settings.terminalFontWeight ?? DEFAULT_TERMINAL_FONT.weight,
  });
}

export interface XtermFontOptions {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: TerminalFontWeight;
}

/** xterm takes the line height as a ratio, like Warp. */
export function buildXtermFontOptions(
  input: TerminalFontInput,
): XtermFontOptions {
  const font = normalizeTerminalFont(input);
  return {
    fontFamily: terminalFontStack(font.family),
    fontSize: font.size,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing,
    fontWeight: font.weight,
  };
}

export interface ComposerFontOptions {
  fontFamily: string;
  fontSize: number;
  fontWeight: TerminalFontWeight;
  /** Monaco takes line height in absolute px, not a ratio —
   *  so the ratio is multiplied out here. At the defaults
   *  (13 × 1.5) that is 20px — exactly what the composer
   *  rendered before this wiring. */
  lineHeight: number;
  letterSpacing: number;
  fontLigatures: boolean;
}

export function buildComposerFontOptions(
  input: TerminalFontInput,
): ComposerFontOptions {
  const font = normalizeTerminalFont(input);
  const size = font.size;
  const ratio = font.lineHeight;
  return {
    fontFamily: terminalFontStack(font.family),
    fontSize: size,
    fontWeight: font.weight,
    lineHeight: Math.round(size * ratio),
    letterSpacing: font.letterSpacing,
    fontLigatures: font.ligatures,
  };
}

/** The six settings keys the Warp preset writes, as one
 *  updateSettings call. */
export function warpPresetSettings(): TerminalFontSettingsSlice {
  return {
    terminalFontFamily: WARP_PRESET.family,
    terminalFontSize: WARP_PRESET.size,
    terminalLineHeight: WARP_PRESET.lineHeight,
    terminalLetterSpacing: WARP_PRESET.letterSpacing,
    terminalLigatures: WARP_PRESET.ligatures,
    terminalFontWeight: WARP_PRESET.weight,
  };
}
