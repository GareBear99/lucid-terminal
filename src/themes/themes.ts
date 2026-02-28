import { Theme, ThemeColors } from '../types';

// Dark theme (default)
const darkColors: ThemeColors = {
  bgPrimary: '#0d1117',
  bgSecondary: '#161b22',
  bgTertiary: '#21262d',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6e7681',
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
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff',
  },
};

// Light theme
const lightColors: ThemeColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f6f8fa',
  bgTertiary: '#eaeef2',
  textPrimary: '#1f2328',
  textSecondary: '#656d76',
  textMuted: '#8c959f',
  accent: '#0969da',
  accentHover: '#0550ae',
  border: '#d0d7de',
  success: '#1a7f37',
  warning: '#9a6700',
  error: '#cf222e',
  terminal: {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selection: 'rgba(9, 105, 218, 0.2)',
    black: '#24292f',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#2da44e',
    brightYellow: '#bf8700',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  },
};

// Midnight theme (deep blue/black with cyan accents)
const midnightColors: ThemeColors = {
  bgPrimary: '#0a0e14',
  bgSecondary: '#0d1117',
  bgTertiary: '#151b23',
  textPrimary: '#b3b1ad',
  textSecondary: '#6c7086',
  textMuted: '#4c566a',
  accent: '#39bae6',
  accentHover: '#59c8f0',
  border: '#1f2430',
  success: '#7fd962',
  warning: '#ffb454',
  error: '#ff6b6b',
  terminal: {
    background: '#0a0e14',
    foreground: '#b3b1ad',
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
    brightBlack: '#686868',
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
const oceanColors: ThemeColors = {
  bgPrimary: '#1b2838',
  bgSecondary: '#1e3a5f',
  bgTertiary: '#234e70',
  textPrimary: '#e0f2fe',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
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
    brightBlack: '#45475a',
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
const forestColors: ThemeColors = {
  bgPrimary: '#1a2f1a',
  bgSecondary: '#243524',
  bgTertiary: '#2e4a2e',
  textPrimary: '#d4edda',
  textSecondary: '#98c379',
  textMuted: '#6b8e6b',
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
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
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
    brightBlack: '#6f6f6f',
    brightRed: '#ff9eb8',
    brightGreen: '#6fdc8c',
    brightYellow: '#fddc69',
    brightBlue: '#a6c8ff',
    brightMagenta: '#d4bbff',
    brightCyan: '#08bdba',
    brightWhite: '#ffffff',
  },
};

export const themes: Theme[] = [
  { id: 'dark', name: 'Dark', colors: darkColors },
  { id: 'light', name: 'Light', colors: lightColors },
  { id: 'midnight', name: 'Midnight', colors: midnightColors },
  { id: 'ocean', name: 'Ocean', colors: oceanColors },
  { id: 'forest', name: 'Forest', colors: forestColors },
  { id: 'sunset', name: 'Sunset', colors: sunsetColors },
];

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) || themes[0];
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const { colors } = theme;

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
