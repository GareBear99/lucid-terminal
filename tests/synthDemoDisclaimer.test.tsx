// @vitest-environment jsdom
/**
 * Synth demo disclaimer tests.
 *
 * Expected behaviour (Gary, 2026-11-05): the Lucid synth is a demo —
 * the demo of what it can become — until you build your own, and you
 * build your own with Iteration 8, the creator builder. After the
 * Homunculus colour choice the disclaimer asks: commence building
 * your own (with Iteration 8), or explore the demo still? The choice
 * is persisted, so the disclaimer asks once — a stored choice, either
 * one, means it never asks again on later entries. A disclaimer crash
 * must never block the Synth view.
 *
 * Iteration 8 itself does not exist yet: "build my own" only records
 * the choice and names Iteration 8 as the creator builder in the
 * inspector — it does not fake a builder UI.
 *
 * These are DOM/state tests — the flow is asserted through the store
 * and the dialogs, not pixels.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  SynthDemoDisclaimer,
  SynthDemoDisclaimerErrorBoundary,
} from '../src/components/Synth/SynthDemoDisclaimer';
import {
  parseSynthDisclaimerChoice,
  shouldShowSynthDisclaimer,
} from '../src/lib/synthDisclaimer';
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

function disclaimerDialog() {
  return screen.queryByRole('dialog', { name: 'The Lucid synth is a demo' });
}

describe('parseSynthDisclaimerChoice / shouldShowSynthDisclaimer', () => {
  test('accepts exactly build and explore', () => {
    expect(parseSynthDisclaimerChoice('build')).toBe('build');
    expect(parseSynthDisclaimerChoice('explore')).toBe('explore');
  });

  test('rejects everything else as not answered yet', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'demo',
      'Build',
      'EXPLORE',
      0,
      true,
      {},
      [],
    ]) {
      expect(parseSynthDisclaimerChoice(bad)).toBeNull();
      expect(shouldShowSynthDisclaimer(bad)).toBe(true);
    }
  });

  test('hides the disclaimer once a valid choice is stored', () => {
    expect(shouldShowSynthDisclaimer('build')).toBe(false);
    expect(shouldShowSynthDisclaimer('explore')).toBe(false);
  });
});

describe('SynthDemoDisclaimer', () => {
  test('states the demo and names Iteration 8 as the creator builder', () => {
    render(<SynthDemoDisclaimer onChoose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('demo of what it can become');
    expect(dialog.textContent).toContain('Iteration 8');
    expect(dialog.textContent).toContain('creator builder');
    expect(dialog.textContent).toContain('Build your own');
    expect(dialog.textContent).toContain('explore the demo');
  });

  test('offers exactly build-my-own and explore-the-demo', () => {
    render(<SynthDemoDisclaimer onChoose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Build my own' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Explore the demo still' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  test('choosing build my own calls onChoose with build', () => {
    const onChoose = vi.fn();
    render(<SynthDemoDisclaimer onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('build');
  });

  test('choosing explore the demo still calls onChoose with explore', () => {
    const onChoose = vi.fn();
    render(<SynthDemoDisclaimer onChoose={onChoose} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Explore the demo still' }),
    );
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('explore');
  });
});

describe('SynthDemoDisclaimerErrorBoundary', () => {
  test('a disclaimer crash renders nothing — the view still opens', () => {
    function Boom(): never {
      throw new Error('disclaimer exploded');
    }
    const { container } = render(
      <SynthDemoDisclaimerErrorBoundary>
        <Boom />
      </SynthDemoDisclaimerErrorBoundary>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('SynthView disclaimer flow', () => {
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

  test('after choosing a colour the disclaimer appears', async () => {
    render(<SynthView />);
    expect(disclaimerDialog()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose pink' }));
    // The disclaimer follows the wake-up reveal (~950ms), so wait.
    await waitFor(() => expect(disclaimerDialog()).not.toBeNull(), {
      timeout: 5000,
    });
  });

  test('choosing build my own persists it and never asks again', async () => {
    const { unmount } = render(<SynthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pink' }));
    await waitFor(() => expect(disclaimerDialog()).not.toBeNull(), {
      timeout: 5000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    await waitFor(() =>
      expect(
        useSettingsStore.getState().settings.synthDisclaimerChoice,
      ).toBe('build'),
    );
    expect(disclaimerDialog()).toBeNull();
    // The inspector names Iteration 8 as the creator builder — the
    // landing for the choice, not a faked builder.
    expect(screen.getByText(/build: your own/)).toBeTruthy();
    expect(screen.getByText(/Iteration 8, the creator builder/)).toBeTruthy();
    // A later entry does not ask again.
    unmount();
    render(<SynthView />);
    expect(disclaimerDialog()).toBeNull();
    expect(screen.getByText(/build: your own/)).toBeTruthy();
  });

  test('choosing explore the demo still persists it and never asks again', async () => {
    const { unmount } = render(<SynthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose purple' }));
    await waitFor(() => expect(disclaimerDialog()).not.toBeNull(), {
      timeout: 5000,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Explore the demo still' }),
    );
    await waitFor(() =>
      expect(
        useSettingsStore.getState().settings.synthDisclaimerChoice,
      ).toBe('explore'),
    );
    expect(disclaimerDialog()).toBeNull();
    // No build landing for the explore choice.
    expect(screen.queryByText(/build: your own/)).toBeNull();
    // A later entry does not ask again.
    unmount();
    render(<SynthView />);
    expect(disclaimerDialog()).toBeNull();
  });

  test('a stored colour with no disclaimer answer shows it on entry', () => {
    seedHomunculusColor('pink');
    render(<SynthView />);
    // No reveal to wait for on a later entry — it shows at once.
    expect(disclaimerDialog()).not.toBeNull();
  });

  test('a stored choice, either one, means no disclaimer on later entries', () => {
    seedHomunculusColor('pink');
    seedSynthDisclaimerChoice('build');
    const { unmount } = render(<SynthView />);
    expect(disclaimerDialog()).toBeNull();
    unmount();
    seedSynthDisclaimerChoice('explore');
    render(<SynthView />);
    expect(disclaimerDialog()).toBeNull();
  });
});
