// @vitest-environment jsdom
/**
 * Homunculus colour picker tests.
 *
 * Expected behaviour (Gary, 2026-11-05): on first entry to the Synth
 * view the user chooses purple or pink for the Homunculus (the
 * Sentinel face). The picker is a small dark card with the two
 * swatches — pink is marked as the face's current variation; choosing
 * one calls onChoose with that colour and the parent persists it. A
 * picker crash must never block the Synth view — the error boundary
 * renders nothing and the face stays unformed (black, no eyes).
 *
 * These are DOM/state tests — colours are asserted through the
 * theme values and the store, not pixels.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  HomunculusColorPicker,
  HomunculusPickerErrorBoundary,
} from '../src/components/Synth/HomunculusColorPicker';
import { SynthView } from '../src/components/Synth/SynthView';
import { useSettingsStore } from '../src/stores/settingsStore';

// updateSetting persists through window.lucidAPI; stub just that call
// on the existing jsdom window so the local state update runs here.
// (Do NOT replace the whole window object — React needs the jsdom
// window's HTMLElement/document during commit.)
function stubSettingsIpc() {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  win.lucidAPI = { settings: { set: async () => undefined } };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

function seedHomunculusColor(value: unknown) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, homunculusColor: value as never },
  }));
}

function seedSynthDisclaimerChoice(value: unknown) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, synthDisclaimerChoice: value as never },
  }));
}

describe('HomunculusColorPicker', () => {
  test('offers exactly purple and pink', () => {
    render(<HomunculusColorPicker onChoose={() => undefined} />);
    // No jest-dom in this repo — assert on DOM properties, not matchers.
    expect(screen.getByRole('dialog').textContent).toContain('Homunculus');
    expect(screen.getByRole('button', { name: 'Choose purple' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose pink' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  test('pink is marked as the face’s current variation', () => {
    render(<HomunculusColorPicker onChoose={() => undefined} />);
    const pinkButton = screen.getByRole('button', { name: 'Choose pink' });
    const purpleButton = screen.getByRole('button', {
      name: 'Choose purple',
    });
    expect(pinkButton.textContent).toContain('current');
    expect(purpleButton.textContent).not.toContain('current');
  });

  test('choosing purple calls onChoose with purple', () => {
    const onChoose = vi.fn();
    render(<HomunculusColorPicker onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose purple' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('purple');
  });

  test('choosing pink calls onChoose with pink', () => {
    const onChoose = vi.fn();
    render(<HomunculusColorPicker onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pink' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('pink');
  });
});

describe('HomunculusPickerErrorBoundary', () => {
  test('a picker crash renders nothing — the view still opens', () => {
    function Boom(): never {
      throw new Error('picker exploded');
    }
    const { container } = render(
      <HomunculusPickerErrorBoundary>
        <Boom />
      </HomunculusPickerErrorBoundary>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('SynthView first-entry picker', () => {
  let restoreWindow: (() => void) | undefined;

  beforeEach(() => {
    restoreWindow = stubSettingsIpc();
    seedHomunculusColor(null);
    seedSynthDisclaimerChoice(null);
  });

  afterEach(() => {
    restoreWindow?.();
    restoreWindow = undefined;
    seedHomunculusColor(null);
    seedSynthDisclaimerChoice(null);
  });

  test('shows the picker on first entry with no stored colour', () => {
    render(<SynthView />);
    expect(
      screen.getByRole('dialog', { name: 'Choose your Homunculus colour' }),
    ).toBeTruthy();
    // The view itself is still there behind the picker.
    expect(screen.getByText(/Shell —/)).toBeTruthy();
  });

  test('shows the picker again for an invalid stored colour', () => {
    seedHomunculusColor('magenta');
    render(<SynthView />);
    expect(
      screen.getByRole('dialog', { name: 'Choose your Homunculus colour' }),
    ).toBeTruthy();
  });

  test('no picker on entry once a colour is stored', () => {
    seedHomunculusColor('pink');
    render(<SynthView />);
    expect(
      screen.queryByRole('dialog', { name: 'Choose your Homunculus colour' }),
    ).toBeNull();
  });

  test('choosing purple persists it and hides the picker', async () => {
    render(<SynthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose purple' }));
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.homunculusColor).toBe('purple'),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Choose your Homunculus colour' }),
    ).toBeNull();
  });

  test('choosing pink persists it and recolours the view accents', async () => {
    const { container } = render(<SynthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pink' }));
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.homunculusColor).toBe('pink'),
    );
    // The boot overlay wears the chosen colour's bright accent.
    // (jsdom normalises the inline hex to rgb.)
    const overlay = container.querySelector('.absolute.top-2.left-2');
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.color).toBe('rgb(255, 93, 177)');
  });

  test('a stored purple colours the view accents purple, not pink', () => {
    seedHomunculusColor('purple');
    const { container } = render(<SynthView />);
    const overlay = container.querySelector('.absolute.top-2.left-2');
    expect(overlay).not.toBeNull();
    // (jsdom normalises the inline hex to rgb.)
    expect((overlay as HTMLElement).style.color).toBe('rgb(192, 132, 252)');
  });
});
