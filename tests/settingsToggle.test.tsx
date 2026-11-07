// @vitest-environment jsdom
/**
 * Settings toggle tests.
 *
 * The toggle itself (pure function) must toggle: first press opens
 * the Settings view, a second press exits back to the terminal.
 * That is the Settings toolbar icon's contract (Gary, 2026-11-06):
 * clicking the Settings icon while Settings is open exits Settings.
 *
 * The sidebar Settings button calls the toggle (onToggleSettings)
 * when one is passed; without it, it falls back to opening
 * Settings via onViewChange, as the other toggle buttons do.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { toggleSettingsView } from '../src/lib/settingsView';
import Sidebar from '../src/components/Layout/Sidebar';

describe('toggleSettingsView', () => {
  test('terminal -> settings (first press opens)', () => {
    expect(toggleSettingsView('terminal')).toBe('settings');
  });

  test('settings -> terminal (second press exits)', () => {
    expect(toggleSettingsView('settings')).toBe('terminal');
  });

  test('forge -> settings (any other view opens)', () => {
    expect(toggleSettingsView('forge')).toBe('settings');
  });

  test('editor -> settings (any other view opens)', () => {
    expect(toggleSettingsView('editor')).toBe('settings');
  });
});

describe('sidebar Settings button toggles Settings', () => {
  const renderSidebar = (currentView: 'terminal' | 'settings', onToggleSettings?: () => void) => {
    const onToggleSettingsMock = onToggleSettings ?? vi.fn();
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView={currentView}
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
        onToggleSettings={onToggleSettingsMock}
      />,
    );
    return { onToggleSettings: onToggleSettingsMock, onViewChange };
  };

  test('press from terminal calls the toggle (opens Settings)', () => {
    const { onToggleSettings, onViewChange } = renderSidebar('terminal');
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('settings');
  });

  test('press from settings calls the toggle (exits Settings)', () => {
    const { onToggleSettings } = renderSidebar('settings');
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
  });

  test('without a toggle prop, press opens Settings via onViewChange', () => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView="terminal"
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onViewChange).toHaveBeenCalledWith('settings');
  });
});
