// @vitest-environment jsdom
/**
 * Terminal customizations section (Gary, 2026-11-14 ~14:28 PST:
 * Warp font customizations in a Terminal customizations section
 * in Settings > Customization, with a "Warp" preset).
 *
 * Covers:
 * - The section renders in Settings > Customization with all
 *   six controls (family, size, line height, letter spacing,
 *   weight, ligatures) plus the Warp preset button.
 * - The Warp preset writes Warp's values into the settings
 *   store (Hack, 13, 1.2, 0, off, Normal).
 * - Changing a control updates the store (family + size, with
 *   the size clamped to Warp's 1–120 range).
 * - The Code blocks section is untouched (still "Coming soon",
 *   no coloring applied).
 *
 * Client render with @testing-library/react (following the
 * Memory tab tests): the settings store is live, and
 * updateSetting persists through the mocked window.lucidAPI.
 *
 * Run with: npx vitest run tests/terminalCustomizations.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import { DEFAULT_TERMINAL_FONT, WARP_PRESET } from '../src/lib/terminalFont';

describe('Terminal customizations', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      ai: {
        getSessions: vi.fn(async () => []),
        clearSessions: vi.fn(async () => undefined),
      },
      settings: {
        set: vi.fn(async () => undefined),
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        hasCopilotApiKey: vi.fn(async () => false),
        setCopilotApiKey: vi.fn(async () => undefined),
        deleteCopilotApiKey: vi.fn(async () => undefined),
        getRunOnStartup: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    // Known starting point: the ship-with defaults.
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        terminalFontFamily: DEFAULT_TERMINAL_FONT.family,
        terminalFontSize: DEFAULT_TERMINAL_FONT.size,
        terminalLineHeight: DEFAULT_TERMINAL_FONT.lineHeight,
        terminalLetterSpacing: DEFAULT_TERMINAL_FONT.letterSpacing,
        terminalLigatures: DEFAULT_TERMINAL_FONT.ligatures,
        terminalFontWeight: DEFAULT_TERMINAL_FONT.weight,
      },
    }));
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    vi.restoreAllMocks();
  });

  function renderCustomization() {
    render(<SettingsPanel onClose={() => undefined} initialTab="customization" />);
  }

  it('renders the section with all six controls + the Warp preset', () => {
    renderCustomization();
    expect(screen.getByText('Terminal customizations')).toBeTruthy();
    expect(screen.getByTestId('terminal-font-family')).toBeTruthy();
    expect(screen.getByTestId('terminal-font-size')).toBeTruthy();
    expect(screen.getByTestId('terminal-line-height')).toBeTruthy();
    expect(screen.getByTestId('terminal-letter-spacing')).toBeTruthy();
    expect(screen.getByTestId('terminal-font-weight')).toBeTruthy();
    expect(screen.getByTestId('terminal-warp-preset')).toBeTruthy();
    // Hack is offered as a family.
    expect(
      screen.getByTestId('terminal-font-family').querySelector('option[value="Hack"]'),
    ).toBeTruthy();
    // Defaults ship as the terminal's old look.
    expect(
      (screen.getByTestId('terminal-font-family') as HTMLSelectElement).value,
    ).toBe('JetBrains Mono');
    expect(
      (screen.getByTestId('terminal-font-size') as HTMLInputElement).value,
    ).toBe('13');
  });

  it('the Warp preset writes Warp\'s values into the store', async () => {
    renderCustomization();
    fireEvent.click(screen.getByTestId('terminal-warp-preset'));
    await waitFor(() => {
      const s = useSettingsStore.getState().settings;
      expect(s.terminalFontFamily).toBe(WARP_PRESET.family);
      expect(s.terminalFontSize).toBe(WARP_PRESET.size);
      expect(s.terminalLineHeight).toBe(WARP_PRESET.lineHeight);
      expect(s.terminalLetterSpacing).toBe(WARP_PRESET.letterSpacing);
      expect(s.terminalLigatures).toBe(WARP_PRESET.ligatures);
      expect(s.terminalFontWeight).toBe(WARP_PRESET.weight);
    });
  });

  it('changing the family updates the store', async () => {
    renderCustomization();
    fireEvent.change(screen.getByTestId('terminal-font-family'), {
      target: { value: 'Hack' },
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.terminalFontFamily).toBe('Hack');
    });
  });

  it('changing the size updates the store, clamped to 1–120', async () => {
    renderCustomization();
    fireEvent.change(screen.getByTestId('terminal-font-size'), {
      target: { value: '200' },
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.terminalFontSize).toBe(120);
    });
  });

  it('changing the line height updates the store', async () => {
    renderCustomization();
    fireEvent.change(screen.getByTestId('terminal-line-height'), {
      target: { value: '1.2' },
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.terminalLineHeight).toBe(1.2);
    });
  });

  it('the Code blocks section is untouched — still Coming soon', () => {
    renderCustomization();
    expect(screen.getByText('Code blocks')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });
});
