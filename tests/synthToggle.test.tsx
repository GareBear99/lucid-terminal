// @vitest-environment jsdom
/**
 * Synth toggle + blood-drop tests.
 *
 * The toggle itself (pure function) must toggle: first press opens
 * the Synth view, a second press exits back to the terminal. That
 * is the face button's contract (the Terminal's onOpenSynth), and
 * it is unchanged.
 *
 * The sidebar blood-drop button does NOT toggle the Synth view
 * anymore (Gary, 2026-11-06) — it opens the Help modal, from
 * either view, instead of always opening the Synth view.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { toggleSynthView } from '../src/lib/synthToggle';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('toggleSynthView', () => {
  test('terminal -> synth (first press opens)', () => {
    expect(toggleSynthView('terminal')).toBe('synth');
  });

  test('synth -> terminal (second press exits)', () => {
    expect(toggleSynthView('synth')).toBe('terminal');
  });

  test('settings -> synth (any other view opens)', () => {
    expect(toggleSynthView('settings')).toBe('synth');
  });

  test('editor -> synth (any other view opens)', () => {
    expect(toggleSynthView('editor')).toBe('synth');
  });
});

describe('sidebar blood-drop button opens Help', () => {
  const renderSidebar = (currentView: 'terminal' | 'synth') => {
    const onOpenHelp = vi.fn();
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView={currentView}
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
        onOpenHelp={onOpenHelp}
      />,
    );
    return { onOpenHelp, onViewChange };
  };

  test('press from terminal opens Help (not the Synth view)', () => {
    const { onOpenHelp, onViewChange } = renderSidebar('terminal');
    fireEvent.click(screen.getByLabelText('Help'));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('synth');
  });

  test('press from synth also opens Help (same action, either view)', () => {
    const { onOpenHelp, onViewChange } = renderSidebar('synth');
    fireEvent.click(screen.getByLabelText('Help'));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('synth');
  });
});

describe('sidebar Synth button opens the Synth view', () => {
  const renderSidebar = (
    currentView: 'terminal' | 'synth',
    onToggleSynth = vi.fn(),
  ) => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView={currentView}
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
        onOpenHelp={() => {}}
        onToggleSynth={onToggleSynth}
      />,
    );
    return { onToggleSynth, onViewChange };
  };

  test('press from terminal toggles the Synth view (separate from Help)', () => {
    const { onToggleSynth, onViewChange } = renderSidebar('terminal');
    fireEvent.click(screen.getByLabelText('Synth'));
    expect(onToggleSynth).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  test('without onToggleSynth it falls back to opening the Synth view', () => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView="terminal"
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
        onOpenHelp={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Synth'));
    expect(onViewChange).toHaveBeenCalledWith('synth');
  });

  test('the Synth button is active while the Synth view is open', () => {
    renderSidebar('synth');
    const synth = screen.getByLabelText('Synth');
    expect(synth.className).toContain('bg-[var(--bg-tertiary)]');
  });

  test('while LuciferAI is disabled the Synth button is gone', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
    try {
      renderSidebar('terminal');
      expect(screen.queryByLabelText('Synth')).toBeNull();
      expect(document.querySelector('[data-toolbar-icon="synth"]')).toBeNull();
    } finally {
      useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: true } });
    }
  });
});
