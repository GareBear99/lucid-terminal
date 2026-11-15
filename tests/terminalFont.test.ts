// @vitest-environment jsdom
/**
 * Terminal font helpers (Gary, 2026-11-14 ~14:28 PST: Warp font
 * customizations in Settings > Customization, with a "Warp" preset).
 *
 * Covers the pure lib only — src/lib/terminalFont.ts:
 * - The ship-with defaults are exactly the terminal's old look
 *   (JetBrains Mono 13 / 1.5 / 0 / off / Normal), so wiring the
 *   settings in changes nothing until a control moves.
 * - The Warp preset is Warp's verified values (Hack, 13, 1.2,
 *   ligatures off, Normal).
 * - The font stack puts the chosen family first and never
 *   repeats it (picking JetBrains Mono lists it once).
 * - Clamps follow Warp's ranges (size 1–120, line height
 *   0.1–5.0, letter spacing 0–2) and fall back to the default
 *   on NaN instead of storing it.
 * - xterm takes the line height as a ratio; the composer takes
 *   it in absolute px — at the defaults (13 × 1.5) that is
 *   20px, exactly what the composer rendered before.
 * - Missing settings keys (older persisted settings) read as
 *   the defaults, never undefined.
 *
 * Run with: npx vitest run tests/terminalFont.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TERMINAL_FONT,
  WARP_PRESET,
  TERMINAL_FONT_FAMILIES,
  TERMINAL_FONT_WEIGHTS,
  terminalFontStack,
  clampTerminalFontSize,
  clampTerminalLineHeight,
  clampTerminalLetterSpacing,
  terminalFontFromSettings,
  buildXtermFontOptions,
  buildComposerFontOptions,
  warpPresetSettings,
} from '../src/lib/terminalFont';

describe('terminal font defaults + Warp preset', () => {
  it('defaults ship as the terminal\'s old look', () => {
    expect(DEFAULT_TERMINAL_FONT).toEqual({
      family: 'JetBrains Mono',
      size: 13,
      lineHeight: 1.5,
      letterSpacing: 0,
      ligatures: false,
      weight: '400',
    });
  });

  it('the Warp preset is Warp\'s verified values', () => {
    expect(WARP_PRESET).toEqual({
      family: 'Hack',
      size: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      ligatures: false,
      weight: '400',
    });
  });

  it('Hack is offered as a family', () => {
    expect(TERMINAL_FONT_FAMILIES).toContain('Hack');
    expect(TERMINAL_FONT_FAMILIES).toContain('JetBrains Mono');
  });

  it('weights are Normal / Medium / Semibold / Bold', () => {
    expect(TERMINAL_FONT_WEIGHTS.map((w) => w.value)).toEqual([
      '400',
      '500',
      '600',
      '700',
    ]);
    expect(TERMINAL_FONT_WEIGHTS[0].label).toBe('Normal');
  });

  it('the preset writes all six settings keys', () => {
    expect(warpPresetSettings()).toEqual({
      terminalFontFamily: 'Hack',
      terminalFontSize: 13,
      terminalLineHeight: 1.2,
      terminalLetterSpacing: 0,
      terminalLigatures: false,
      terminalFontWeight: '400',
    });
  });
});

describe('terminalFontStack', () => {
  it('puts the chosen family first, then the old stack', () => {
    expect(terminalFontStack('Hack')).toBe(
      "'Hack', 'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
    );
  });

  it('never repeats the family', () => {
    const stack = terminalFontStack('JetBrains Mono');
    expect(stack.split("'JetBrains Mono'").length - 1).toBe(1);
    expect(stack).toBe(
      "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
    );
  });
});

describe('clamps', () => {
  it('size clamps to Warp\'s 1–120 input range', () => {
    expect(clampTerminalFontSize(0)).toBe(1);
    expect(clampTerminalFontSize(200)).toBe(120);
    expect(clampTerminalFontSize(13)).toBe(13);
    expect(clampTerminalFontSize(13.7)).toBe(14);
  });

  it('size falls back to the default on NaN, never stores it', () => {
    expect(clampTerminalFontSize(NaN)).toBe(13);
  });

  it('line height clamps to Warp\'s 0.1–5.0', () => {
    expect(clampTerminalLineHeight(0)).toBe(0.1);
    expect(clampTerminalLineHeight(9)).toBe(5);
    expect(clampTerminalLineHeight(1.2)).toBe(1.2);
  });

  it('line height falls back to the default on NaN', () => {
    expect(clampTerminalLineHeight(NaN)).toBe(1.5);
  });

  it('letter spacing clamps to 0–2', () => {
    expect(clampTerminalLetterSpacing(-1)).toBe(0);
    expect(clampTerminalLetterSpacing(5)).toBe(2);
    expect(clampTerminalLetterSpacing(0.5)).toBe(0.5);
  });

  it('letter spacing falls back to the default on NaN', () => {
    expect(clampTerminalLetterSpacing(NaN)).toBe(0);
  });
});

describe('option builders', () => {
  it('xterm takes the line height as a ratio', () => {
    const opts = buildXtermFontOptions(DEFAULT_TERMINAL_FONT);
    expect(opts).toEqual({
      fontFamily:
        "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      letterSpacing: 0,
      fontWeight: '400',
    });
  });

  it('xterm takes the Warp preset as Hack / 1.2', () => {
    const opts = buildXtermFontOptions(WARP_PRESET);
    expect(opts.fontFamily.startsWith("'Hack'")).toBe(true);
    expect(opts.lineHeight).toBe(1.2);
  });

  it('the composer takes line height in px — 13 × 1.5 is 20, the old value', () => {
    const opts = buildComposerFontOptions(DEFAULT_TERMINAL_FONT);
    expect(opts.lineHeight).toBe(20);
    expect(opts.fontSize).toBe(13);
    expect(opts.fontLigatures).toBe(false);
  });

  it('the composer takes the Warp preset as 13 × 1.2 = 16px', () => {
    const opts = buildComposerFontOptions(WARP_PRESET);
    expect(opts.lineHeight).toBe(16);
    expect(opts.fontFamily.startsWith("'Hack'")).toBe(true);
  });

  it('clamping applies inside the builders too', () => {
    const opts = buildXtermFontOptions({
      ...DEFAULT_TERMINAL_FONT,
      size: 500,
      lineHeight: 99,
      letterSpacing: 99,
    });
    expect(opts.fontSize).toBe(120);
    expect(opts.lineHeight).toBe(5);
    expect(opts.letterSpacing).toBe(2);
  });
});

describe('terminalFontFromSettings', () => {
  it('missing keys read as the defaults (older persisted settings)', () => {
    const font = terminalFontFromSettings({} as never);
    expect(font).toEqual(DEFAULT_TERMINAL_FONT);
  });

  it('present keys pass through, clamped', () => {
    const font = terminalFontFromSettings({
      terminalFontFamily: 'Hack',
      terminalFontSize: 200,
      terminalLineHeight: 1.2,
      terminalLetterSpacing: 0,
      terminalLigatures: true,
      terminalFontWeight: '700',
    });
    expect(font).toEqual({
      family: 'Hack',
      size: 120,
      lineHeight: 1.2,
      letterSpacing: 0,
      ligatures: true,
      weight: '700',
    });
  });
});
