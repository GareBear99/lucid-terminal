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
 * anymore (Gary, 2026-11-06) — it opens the blood drop terminal,
 * from either view, instead of always opening the Synth view.
 * (Both blood drops go to the same creation place, Gary,
 * 2026-11-07 ~09:18 PST — the toolbar drop used to open Help.)
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

describe('sidebar blood-drop button opens the blood drop terminal', () => {
  const renderSidebar = (currentView: 'terminal' | 'synth') => {
    const onOpenBloodDrop = vi.fn();
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView={currentView}
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={() => {}}
        onOpenBloodDrop={onOpenBloodDrop}
      />,
    );
    return { onOpenBloodDrop, onViewChange };
  };

  test('press from terminal opens the blood drop terminal (not the Synth view)', () => {
    const { onOpenBloodDrop, onViewChange } = renderSidebar('terminal');
    fireEvent.click(screen.getByLabelText('Blood drop'));
    expect(onOpenBloodDrop).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('synth');
  });

  test('press from synth also opens the blood drop terminal (same action, either view)', () => {
    const { onOpenBloodDrop, onViewChange } = renderSidebar('synth');
    fireEvent.click(screen.getByLabelText('Blood drop'));
    expect(onOpenBloodDrop).toHaveBeenCalledTimes(1);
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
        onToggleSynth={onToggleSynth}
      />,
    );
    return { onToggleSynth, onViewChange };
  };

  test('press from terminal toggles the Synth view (separate from the blood drop)', () => {
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
