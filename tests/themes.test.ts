/**
 * Theme options — Light is removed (Gary, 2026-11-07); LuciferAI is the
 * default (Gary, 2026-11-07); text whitened to WCAG AA (Gary, 2026-11-07);
 * Full Glass is the gated referral + purchase tier reward (Gary, 2026-11-07).
 *
 * Gary: "light needs to be taken out of the options." The terminal is now
 * pure black in every theme (66ca165: the main screen is always splashscreen
 * misty black), and Light's dark text (#1f2328) on the black mist was
 * unreadable. Light is not recoloured — it is gone from the options.
 *
 * Gary: LuciferAI's color scheme is the one he wants when Lucid loads up
 * (blood-red / dark, the canonical palette from
 * LUCID-BACKEND/core/lucifer_colors.py: Lucifer purple #d7a0ff, blood
 * red #ff5555 / #a4161a, cyan). So LuciferAI is first in `themes`
 * (themes[0] = the default everywhere: defaultSettings, getTheme's
 * fallback, the locked-theme fallback) and the default theme.
 *
 * Gary: "midnight and everyone needs their text whitened to see better."
 * Assessed per theme by WCAG contrast (not blindly whitened): Midnight
 * was the worst (textSecondary 3.96:1, textMuted 2.62:1 — both failed
 * AA); textMuted was below AA in Dark (4.12), Ocean (3.14) and Forest
 * (3.89); Sunset's UI text already passed and is untouched. The tests
 * below pin the new minimums so the text cannot go dim again.
 *
 * Gary: Full Glass is the referral + active purchase tier reward — it is
 * NOT a regular theme entry and is NOT freely selectable. It lives in
 * its own section under the theme selection, gated by `unlock`.
 */
import { themes, fullGlassTheme, getTheme, isThemeUnlocked } from '../src/themes/themes';

/** Relative luminance of a hex color (WCAG 2.x). */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** A theme color composited over the black mist it sits on. Opaque hex
 * passes through; translucent rgba (Full Glass) blends over black. */
function effectiveHex(color: string): string {
  const rgba = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\)/);
  if (!rgba) return color;
  const alpha = rgba[4] === undefined ? 1 : parseFloat(rgba[4]);
  const blend = (c: number) => Math.round(alpha * c + (1 - alpha) * 0);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(blend(+rgba[1]))}${toHex(blend(+rgba[2]))}${toHex(blend(+rgba[3]))}`;
}

/** WCAG contrast ratio of two theme colors. */
function contrast(fg: string, bg: string): number {
  const l1 = luminance(effectiveHex(fg));
  const l2 = luminance(effectiveHex(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('Theme options — Light removed, LuciferAI default', () => {
  it('does not offer a Light theme', () => {
    expect(themes.some((t) => t.id === 'light')).toBe(false);
    expect(themes.some((t) => t.name === 'Light')).toBe(false);
  });

  it('offers exactly the six freely selectable themes, LuciferAI first', () => {
    expect(themes.map((t) => t.id)).toEqual([
      'lucifer',
      'dark',
      'midnight',
      'ocean',
      'forest',
      'sunset',
    ]);
  });

  it('LuciferAI is the default theme (themes[0])', () => {
    expect(themes[0].id).toBe('lucifer');
    expect(getTheme('lucifer').id).toBe('lucifer');
  });

  it('Sunset is still available', () => {
    expect(getTheme('sunset').id).toBe('sunset');
  });

  it('a removed id falls back to the first theme (LuciferAI)', () => {
    expect(getTheme('light').id).toBe('lucifer');
    expect(getTheme('no-such-theme').id).toBe('lucifer');
  });
});

describe('Text readability — WCAG AA minimums (Gary, 2026-11-07)', () => {
  it.each(themes.map((t) => [t.id, t] as const))(
    '%s: UI text clears AA on the primary background',
    (_id, theme) => {
      const { colors } = theme;
      expect(contrast(colors.textPrimary, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.textSecondary, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.textMuted, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(themes.map((t) => [t.id, t] as const))(
    '%s: terminal text clears AA on the terminal background',
    (_id, theme) => {
      const { terminal } = theme.colors;
      expect(contrast(terminal.foreground, terminal.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(terminal.white, terminal.background)).toBeGreaterThanOrEqual(4.5);
      // Bright-black is the dim terminal grey programs use for secondary
      // text — it must read, not vanish (it was 1.64–4.12:1 before).
      expect(contrast(terminal.brightBlack, terminal.background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('Midnight is no longer the dim one (the reported problem)', () => {
    const midnight = getTheme('midnight');
    // Was: primary 9.03 (grey-beige), secondary 3.96, muted 2.62.
    expect(contrast(midnight.colors.textPrimary, midnight.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(midnight.colors.textSecondary, midnight.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(midnight.colors.textMuted, midnight.colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("Sunset's UI text is untouched and still passes (it was already fine)", () => {
    const sunset = getTheme('sunset');
    expect(sunset.colors.textPrimary).toBe('#fce7f3');
    expect(sunset.colors.textSecondary).toBe('#f9a8d4');
    expect(sunset.colors.textMuted).toBe('#9d7a8c');
    expect(contrast(sunset.colors.textPrimary, sunset.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(sunset.colors.textSecondary, sunset.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(sunset.colors.textMuted, sunset.colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("LuciferAI's text clears AA (it is the startup default)", () => {
    const lucifer = getTheme('lucifer');
    expect(contrast(lucifer.colors.textPrimary, lucifer.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(lucifer.colors.textSecondary, lucifer.colors.bgPrimary)).toBeGreaterThanOrEqual(7);
    expect(contrast(lucifer.colors.textMuted, lucifer.colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lucifer.colors.accent, lucifer.colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lucifer.colors.terminal.foreground, lucifer.colors.terminal.background)).toBeGreaterThanOrEqual(7);
  });
});

describe('Full Glass — gated reward theme (Gary, 2026-11-07)', () => {
  it('is NOT in the regular theme list', () => {
    expect(themes.some((t) => t.id === 'full-glass')).toBe(false);
  });

  it('resolves through getTheme and is a glass theme', () => {
    expect(getTheme('full-glass')).toBe(fullGlassTheme);
    expect(fullGlassTheme.isGlass).toBe(true);
    expect(fullGlassTheme.name).toBe('Full Glass');
  });

  it('carries the referral + purchase tier unlock', () => {
    expect(fullGlassTheme.unlock).toEqual({
      kind: 'referral-purchase-tier',
      referralsRequired: 1,
      requiresPurchaseTier: true,
    });
  });

  it('is locked with no referrals and no purchase tier', () => {
    expect(isThemeUnlocked(fullGlassTheme, { referralCount: 0, purchaseTierActive: false })).toBe(false);
  });

  it('is locked with referrals but no purchase tier', () => {
    expect(isThemeUnlocked(fullGlassTheme, { referralCount: 1, purchaseTierActive: false })).toBe(false);
  });

  it('is locked with a purchase tier but no referrals', () => {
    expect(isThemeUnlocked(fullGlassTheme, { referralCount: 0, purchaseTierActive: true })).toBe(false);
  });

  it('unlocks with referrals AND an active purchase tier', () => {
    expect(isThemeUnlocked(fullGlassTheme, { referralCount: 1, purchaseTierActive: true })).toBe(true);
    expect(isThemeUnlocked(fullGlassTheme, { referralCount: 5, purchaseTierActive: true })).toBe(true);
  });

  it('a regular theme is freely selectable with no referrals and no tier', () => {
    expect(isThemeUnlocked(getTheme('dark'), { referralCount: 0, purchaseTierActive: false })).toBe(true);
    expect(isThemeUnlocked(getTheme('lucifer'), { referralCount: 0, purchaseTierActive: false })).toBe(true);
  });

  it('its text clears AA on the effective (mist-composited) backgrounds', () => {
    const { colors } = fullGlassTheme;
    expect(contrast(colors.textPrimary, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textMuted, colors.bgPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.terminal.foreground, colors.terminal.background)).toBeGreaterThanOrEqual(4.5);
  });
});
