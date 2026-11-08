import { Theme, ThemeColors } from '../types';

// Dark theme (default)
// Text whitened (Gary, 2026-11-07): textMuted and terminal brightBlack
// were just under WCAG AA (4.12:1). Same neutral character, brighter
// (5.48:1). Primary/secondary were already fine and are untouched.
const darkColors: ThemeColors = {
  bgPrimary: '#0d1117',
  bgSecondary: '#161b22',
  bgTertiary: '#21262d',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#828b96',
  accent: '#58a6ff',
  accentHover: '#79c0ff',
  border: '#30363d',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  terminal: {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selection: 'rgba(88, 166, 255, 0.3)',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#828b96',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff',
  },
};

// Midnight theme (deep blue/black with cyan accents)
// Text whitened (Gary, 2026-11-07): the old text was too dim to read —
// textSecondary 3.96:1 and textMuted 2.62:1 both failed WCAG AA, and
// textPrimary was a warm grey-beige (9.03:1) that read dim next to the
// other themes' near-white primaries. New values keep Midnight's cool
// blue character, just brighter (primary 16.30:1, secondary 7.65:1,
// muted 5.55:1; terminal foreground follows the primary).
const midnightColors: ThemeColors = {
  bgPrimary: '#0a0e14',
  bgSecondary: '#0d1117',
  bgTertiary: '#151b23',
  textPrimary: '#e8ecf1',
  textSecondary: '#9aa3b8',
  textMuted: '#7e8aa0',
  accent: '#39bae6',
  accentHover: '#59c8f0',
  border: '#1f2430',
  success: '#7fd962',
  warning: '#ffb454',
  error: '#ff6b6b',
  terminal: {
    background: '#0a0e14',
    foreground: '#e8ecf1',
    cursor: '#39bae6',
    cursorAccent: '#0a0e14',
    selection: 'rgba(57, 186, 230, 0.3)',
    black: '#01060e',
    red: '#ea6c73',
    green: '#91b362',
    yellow: '#f9af4f',
    blue: '#53bdfa',
    magenta: '#fae994',
    cyan: '#90e1c6',
    white: '#c7c7c7',
    brightBlack: '#8a93a5',
    brightRed: '#f07178',
    brightGreen: '#c2d94c',
    brightYellow: '#ffb454',
    brightBlue: '#59c2ff',
    brightMagenta: '#ffee99',
    brightCyan: '#95e6cb',
    brightWhite: '#ffffff',
  },
};

// Ocean theme (navy blue with teal accents)
// Text whitened (Gary, 2026-11-07): textMuted failed WCAG AA
// (3.14:1 / 2.42:1) and textSecondary was marginal on panels (4.49:1);
// terminal brightBlack was invisible (1.64:1). Same slate-blue
// character, brighter (muted 6.15:1 / 4.74:1, secondary 6.91:1 / 5.33:1).
const oceanColors: ThemeColors = {
  bgPrimary: '#1b2838',
  bgSecondary: '#1e3a5f',
  bgTertiary: '#234e70',
  textPrimary: '#e0f2fe',
  textSecondary: '#a3b2c4',
  textMuted: '#93a9bd',
  accent: '#22d3ee',
  accentHover: '#67e8f9',
  border: '#2d4a6f',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  terminal: {
    background: '#1b2838',
    foreground: '#e0f2fe',
    cursor: '#22d3ee',
    cursorAccent: '#1b2838',
    selection: 'rgba(34, 211, 238, 0.3)',
    black: '#0c1824',
    red: '#ff6b6b',
    green: '#69db7c',
    yellow: '#ffd43b',
    blue: '#74c7ec',
    magenta: '#b4befe',
    cyan: '#22d3ee',
    white: '#cdd6f4',
    brightBlack: '#8492a8',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#fde047',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
};

// Forest theme (dark green with lime accents)
// Text whitened (Gary, 2026-11-07): textMuted was below WCAG AA
// (3.89:1), terminal red just under (4.48:1) and brightBlack nearly
// invisible (2.37:1). Same sage-green character, brighter (muted
// 6.15:1, red 5.14:1, brightBlack 4.82:1).
const forestColors: ThemeColors = {
  bgPrimary: '#1a2f1a',
  bgSecondary: '#243524',
  bgTertiary: '#2e4a2e',
  textPrimary: '#d4edda',
  textSecondary: '#98c379',
  textMuted: '#8fb38f',
  accent: '#a3e635',
  accentHover: '#bef264',
  border: '#3d5c3d',
  success: '#84cc16',
  warning: '#eab308',
  error: '#ef4444',
  terminal: {
    background: '#1a2f1a',
    foreground: '#d4edda',
    cursor: '#a3e635',
    cursorAccent: '#1a2f1a',
    selection: 'rgba(163, 230, 53, 0.3)',
    black: '#0f1f0f',
    red: '#e87a82',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#8a9a8a',
    brightRed: '#f87171',
    brightGreen: '#a3e635',
    brightYellow: '#facc15',
    brightBlue: '#74c7ec',
    brightMagenta: '#d4a6e8',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  },
};

// Sunset theme (warm dark with orange/pink accents)
// Text untouched (Gary, 2026-11-07 assessment): primary 15.37:1,
// secondary 9.96:1 and muted 4.81:1 already pass WCAG AA — the current
// theme reads well. Only terminal brightBlack was below AA (3.60:1),
// so only that is lifted (4.95:1).
const sunsetColors: ThemeColors = {
  bgPrimary: '#1f1315',
  bgSecondary: '#2a1a1d',
  bgTertiary: '#3d2429',
  textPrimary: '#fce7f3',
  textSecondary: '#f9a8d4',
  textMuted: '#9d7a8c',
  accent: '#fb923c',
  accentHover: '#fdba74',
  border: '#4c3339',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  terminal: {
    background: '#1f1315',
    foreground: '#fce7f3',
    cursor: '#fb923c',
    cursorAccent: '#1f1315',
    selection: 'rgba(251, 146, 60, 0.3)',
    black: '#140b0d',
    red: '#ff7eb6',
    green: '#42be65',
    yellow: '#ffe97b',
    blue: '#82cfff',
    magenta: '#be95ff',
    cyan: '#3ddbd9',
    white: '#f4f4f4',
    brightBlack: '#8a8580',
    brightRed: '#ff9eb8',
    brightGreen: '#6fdc8c',
    brightYellow: '#fddc69',
    brightBlue: '#a6c8ff',
    brightMagenta: '#d4bbff',
    brightCyan: '#08bdba',
    brightWhite: '#ffffff',
  },
};


// Full Glass theme — frosted glass throughout (Gary, 2026-11-07).
// The referral + active purchase tier reward theme. It is NOT in the
// regular `themes` list and is NOT freely selectable: it lives in its
// own section under the theme selection, gated by `unlock` (see
// isThemeUnlocked). The bg colors are translucent rgba so the misty
// black shows through, and `isGlass` makes applyTheme mark <html> with
// data-glass so index.css frosts every theme surface (backdrop blur).
// Text is near-white / light icy blue-grey and clears WCAG AAA against
// the effective dark background the translucency composites to
// (primary 18.46:1, secondary 13.00:1, muted 8.10:1 over black mist;
// muted stays AA, 4.82:1, even over a bright smoke puff).
const fullGlassColors: ThemeColors = {
  bgPrimary: 'rgba(10, 14, 20, 0.55)',
  bgSecondary: 'rgba(16, 22, 30, 0.65)',
  bgTertiary: 'rgba(28, 36, 48, 0.75)',
  textPrimary: '#f2f6fa',
  textSecondary: '#c3d2e0',
  textMuted: '#9db0c2',
  accent: '#7dd3fc',
  accentHover: '#bae6fd',
  border: 'rgba(125, 211, 252, 0.28)',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  terminal: {
    background: 'rgba(10, 14, 20, 0.55)',
    foreground: '#f2f6fa',
    cursor: '#7dd3fc',
    cursorAccent: '#0a0e14',
    selection: 'rgba(125, 211, 252, 0.3)',
    black: '#0a0e14',
    red: '#ff7b72',
    green: '#4ade80',
    yellow: '#fde047',
    blue: '#7dd3fc',
    magenta: '#d8b4fe',
    cyan: '#67e8f9',
    white: '#e2e8f0',
    brightBlack: '#9db0c2',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#bae6fd',
    brightMagenta: '#e9d5ff',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  },
};

/**
 * Full Glass, the referral + purchase tier reward theme (Gary,
 * 2026-11-07). Kept OUT of `themes` on purpose: the regular list is
 * the five freely selectable dark themes, and Full Glass gets its own
 * separate section under the theme selection. Resolve it with
 * getTheme('full-glass') and check isThemeUnlocked before selecting.
 *
 * Unlock rule (Gary, 2026-11-08 ~01:34 PST): '2 activated and
 * recognized temps linked to your refferals a year plus purchase
 * tier active seems fair for glass'. The referralsRequired count
 * is 2, and a referral only counts when it is an ACTIVATED and
 * RECOGNIZED temp linked to your referrals within a year - not just
 * any signup. There is no referral / purchase server in Lucid yet,
 * so the referralCount fed to isThemeUnlocked is the count of those
 * qualifying temps; when the referral system is built it must
 * enforce the activated + recognized + within-a-year definition,
 * not count raw signups.
 */
export const fullGlassTheme: Theme = {
  id: 'full-glass',
  name: 'Full Glass',
  colors: fullGlassColors,
  isGlass: true,
  unlock: {
    kind: 'referral-purchase-tier',
    referralsRequired: 2,
    requiresPurchaseTier: true,
  },
};


// All Black theme — the black backboard design as a proper theme
// (Gary, 2026-11-08 ~07:49 PST): "Keep that as the all black theme
// for first refferal". The full-black look from the reverted
// non-devmode backboard work (619bf49 / 9399206) is KEPT, but as a
// theme in the theme system — NOT as the default non-devmode look
// and NOT by forcing black over the theme system. Like Full Glass
// it is NOT in the regular `themes` list and is NOT freely
// selectable: it lives in its own section under the theme
// selection, gated by `unlock` (see isThemeUnlocked). It is NOT
// glass (opaque black throughout), so applyTheme clears
// data-glass for it like any other non-glass theme. Text is
// near-white / light grey and clears WCAG AA against black
// (primary ~19.6:1, secondary ~12.6:1, muted ~8.9:1, accent
// ~16.6:1); the accent is neutral light grey, NOT the LuciferAI
// purple, so the theme stays all-black.
const allBlackColors: ThemeColors = {
  bgPrimary: '#000000',
  bgSecondary: '#000000',
  bgTertiary: '#000000',
  textPrimary: '#f5f5f5',
  textSecondary: '#c9c9c9',
  textMuted: '#a8a8a8',
  accent: '#e5e5e5',
  accentHover: '#ffffff',
  border: '#2e2e2e',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  terminal: {
    background: '#000000',
    foreground: '#f5f5f5',
    cursor: '#e5e5e5',
    cursorAccent: '#000000',
    selection: 'rgba(229, 229, 229, 0.3)',
    black: '#000000',
    red: '#ff7b72',
    green: '#4ade80',
    yellow: '#fde047',
    blue: '#7dd3fc',
    magenta: '#d8b4fe',
    cyan: '#67e8f9',
    white: '#f5f5f5',
    brightBlack: '#a8a8a8',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#bae6fd',
    brightMagenta: '#e9d5ff',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  },
};

/**
 * All Black, the first-referral reward theme (Gary, 2026-11-08
 * ~07:49 PST). Kept OUT of `themes` on purpose, mirroring Full
 * Glass: the regular list is the six freely selectable dark
 * themes, and All Black gets its own separate section under the
 * theme selection. Resolve it with getTheme('all-black') and check
 * isThemeUnlocked before selecting.
 *
 * Unlock rule: 1st referral ONLY, NO purchase tier — that is what
 * distinguishes it from Full Glass (2 referrals + purchase tier).
 */
export const allBlackTheme: Theme = {
  id: 'all-black',
  name: 'All Black',
  colors: allBlackColors,
  unlock: {
    kind: 'referral-purchase-tier',
    referralsRequired: 1,
    requiresPurchaseTier: false,
  },
};


// LuciferAI theme (Gary, 2026-11-07) — THE default theme. Gary really
// likes LuciferAI's color scheme and wants it when Lucid loads up, so
// this is first in `themes` (themes[0] = the default everywhere:
// defaultSettings, getTheme's fallback, the locked-theme fallback).
// The colors are LuciferAI's own canonical palette, from
// LUCID-BACKEND/core/lucifer_colors.py: primary accent LUCIFER PURPLE
// (ANSI 95, the app's #d7a0ff heartbeat purple), blood red (the
// heartbeat's bright red #ff5555, ANSI 91; the dark blood #a4161a from
// src/components/Synth/blood.ts tints the near-black backgrounds),
// cyan info, green success, yellow warning. The banner is
// purple-bordered with a cyan tagline ("Forged in Silence, Born of
// Neon."). Text is readable by construction, same bar as the other
// themes: primary 17.61:1, secondary 10.45:1, muted 6.28:1, accent
// 9.90:1 (all AA or better). This is the LOOK only — the blood drop
// toggle still controls LuciferAI the AI (off by default = plain
// terminal, per the separate plain-terminal fix); the color scheme
// stays LuciferAI's whether the AI is on or off.
const luciferColors: ThemeColors = {
  bgPrimary: '#0d0608',
  bgSecondary: '#140a0e',
  bgTertiary: '#1f1016',
  textPrimary: '#f5eef5',
  textSecondary: '#c9b3d9',
  textMuted: '#9a8aa8',
  accent: '#d7a0ff',
  accentHover: '#e9c5ff',
  border: '#331c2b',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#ff5555',
  terminal: {
    background: '#0d0608',
    foreground: '#f5eef5',
    cursor: '#d7a0ff',
    cursorAccent: '#0d0608',
    selection: 'rgba(215, 160, 255, 0.3)',
    black: '#1a0f14',
    red: '#ff5555',
    green: '#4ade80',
    yellow: '#fde047',
    blue: '#7dd3fc',
    magenta: '#d7a0ff',
    cyan: '#67e8f9',
    white: '#e8dff0',
    brightBlack: '#9a8aa8',
    brightRed: '#ff8080',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#a5d8ff',
    brightMagenta: '#e9c5ff',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  },
};

export const themes: Theme[] = [
  // LuciferAI first: it is the default theme (Gary, 2026-11-07).
  { id: 'lucifer', name: 'LuciferAI', colors: luciferColors },
  { id: 'dark', name: 'Dark', colors: darkColors },
  { id: 'midnight', name: 'Midnight', colors: midnightColors },
  { id: 'ocean', name: 'Ocean', colors: oceanColors },
  { id: 'forest', name: 'Forest', colors: forestColors },
  { id: 'sunset', name: 'Sunset', colors: sunsetColors },
];

export function getTheme(id: string): Theme {
  if (id === fullGlassTheme.id) return fullGlassTheme;
  if (id === allBlackTheme.id) return allBlackTheme;
  return themes.find((t) => t.id === id) || themes[0];
}

/**
 * Whether a theme may be selected with this unlock state (Gary,
 * 2026-11-07). A theme with no `unlock` is freely selectable. Full
 * Glass needs `referralsRequired` referrals AND an active purchase
 * tier (when `requiresPurchaseTier`); either one missing keeps it
 * locked. The referrals are activated and recognized temps linked
 * to your referrals within a year (Gary, 2026-11-08), and the count
 * is 2 - not just any signup. The referral count and purchase tier live on Settings
 * (referralCount, purchaseTierActive) — there is no referral /
 * purchase server in Lucid yet, so the referral and purchase flows
 * set them when they exist; until then they default to 0 / false
 * and Full Glass stays locked. The theme picker and setTheme both
 * call this; a locked theme can never be applied through them.
 */
export function isThemeUnlocked(
  theme: Theme,
  unlockState: { referralCount: number; purchaseTierActive: boolean },
): boolean {
  if (!theme.unlock) return true;
  if (theme.unlock.kind !== 'referral-purchase-tier') return true;
  if (unlockState.referralCount < theme.unlock.referralsRequired) return false;
  if (theme.unlock.requiresPurchaseTier && !unlockState.purchaseTierActive) return false;
  return true;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const { colors } = theme;

  // Full Glass frosts every theme surface (see index.css [data-glass]).
  // Any other theme clears it so the frost never leaks across themes.
  if (theme.isGlass) {
    root.dataset.glass = 'true';
  } else {
    delete root.dataset.glass;
  }

  root.style.setProperty('--bg-primary', colors.bgPrimary);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--text-primary', colors.textPrimary);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-hover', colors.accentHover);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--success', colors.success);
  root.style.setProperty('--warning', colors.warning);
  root.style.setProperty('--error', colors.error);
}

export function createDefaultCustomTheme(): Theme {
  return {
    id: 'custom',
    name: 'Custom',
    colors: { ...darkColors },
    isCustom: true,
  };
}
