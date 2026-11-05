// @vitest-environment jsdom
/**
 * Synth-button toggle tests.
 *
 * The Synth button must toggle: first press opens the Synth view,
 * a second press exits back to the terminal. That is the whole
 * contract — the state transition itself (pure function) and the
 * wiring (the sidebar Synth button calls the toggle handler on
 * every press, from either view, instead of always opening).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { toggleSynthView } from '../src/lib/synthToggle';
import Sidebar from '../src/components/Layout/Sidebar';

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

describe('sidebar Synth button calls the toggle', () => {
  const renderSidebar = (currentView: 'terminal' | 'synth') => {
    const onToggleSynth = vi.fn();
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

  test('press from terminal calls the toggle (opens)', () => {
    const { onToggleSynth, onViewChange } = renderSidebar('terminal');
    fireEvent.click(screen.getByLabelText('Synth'));
    expect(onToggleSynth).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('synth');
  });

  test('press again from synth calls the toggle again (exits)', () => {
    const { onToggleSynth, onViewChange } = renderSidebar('synth');
    fireEvent.click(screen.getByLabelText('Synth'));
    expect(onToggleSynth).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalledWith('synth');
  });
});
