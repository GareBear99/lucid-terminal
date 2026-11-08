// @vitest-environment jsdom
/**
 * Synth demo disclaimer tests.
 *
 * Expected behaviour (Gary, 2026-11-05): the Lucid synth is a demo —
 * the demo of what it can become — until you build your own, and you
 * build your own with Iteration 8, the creator builder. After the
 * Homunculus colour choice the disclaimer asks: commence building
 * your own (with Iteration 8), or explore the demo still? The choice
 * is persisted.
 *
 * Gary (2026-11-08 ~00:20 PST): it should know in most cases. The
 * prompt shows on every entry, but when a valid choice is stored it
 * shows the known mode with a quick confirm/switch — it only asks the
 * full "which mode?" question when it genuinely doesn't know (first
 * time, no saved preference, missing/ambiguous). In most cases it
 * knows, so going in is frictionless. A disclaimer crash must never
 * block the Synth view.
 *
 * Iteration 8 itself does not exist yet: "build my own" only records
 * the choice and names Iteration 8 as the creator builder in the
 * inspector — it does not fake a builder UI.
 *
 * Synth versions (Gary, 2026-11-05): starting a new build asks for a
 * synth version in a drop-down, starting with Iteration 8 for now —
 * Lucid is the demo, not a live working build yet. Choosing "Build my
 * own" opens the version step (Iteration 8 selected); confirming
 * records the choice and the version together. "Explore the demo
 * still" is unchanged and records no version.
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
  DEFAULT_SYNTH_VERSION,
  parseSynthDisclaimerChoice,
  parseSynthVersion,
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

function seedSynthVersion(value: unknown) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, synthVersion: value as never },
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

  test('a valid stored choice means the full question is not needed', () => {
    expect(shouldShowSynthDisclaimer('build')).toBe(false);
    expect(shouldShowSynthDisclaimer('explore')).toBe(false);
  });
});

describe('parseSynthVersion', () => {
  test('accepts exactly the known versions, Iteration 8 for now', () => {
    expect(parseSynthVersion('iteration-8')).toBe('iteration-8');
    expect(DEFAULT_SYNTH_VERSION).toBe('iteration-8');
  });

  test('rejects everything else as unset', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'Iteration 8',
      'iteration-9',
      'lucid',
      8,
      true,
      {},
      [],
    ]) {
      expect(parseSynthVersion(bad)).toBeNull();
    }
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

  test('choosing build my own opens the version step, not the choice', () => {
    const onChoose = vi.fn();
    render(<SynthDemoDisclaimer onChoose={onChoose} />);
    // No version drop-down on the first step.
    expect(screen.queryByLabelText('Synth version')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    // Choosing build does not record anything yet — it opens the
    // version step, Iteration 8 selected.
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Synth version')).toBeTruthy();
    expect(
      (screen.getByLabelText('Synth version') as HTMLSelectElement).value,
    ).toBe('iteration-8');
  });

  test('confirming the version step records build with Iteration 8', () => {
    const onChoose = vi.fn();
    render(<SynthDemoDisclaimer onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Start with Iteration 8' }),
    );
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('build', 'iteration-8');
  });

  test('back from the version step returns to the choice, recording nothing', () => {
    const onChoose = vi.fn();
    render(<SynthDemoDisclaimer onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    expect(screen.getByLabelText('Synth version')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Synth version')).toBeNull();
    expect(screen.getByRole('button', { name: 'Build my own' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Explore the demo still' }),
    ).toBeTruthy();
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

  test('known explore mode shows the saved mode with confirm/switch', () => {
    const onChoose = vi.fn();
    render(
      <SynthDemoDisclaimer onChoose={onChoose} knownChoice="explore" />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain("You're exploring the demo");
    expect(
      screen.getByRole('button', { name: 'Continue in the demo' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Build my own instead' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // Confirm re-affirms the saved choice, no version step.
    fireEvent.click(screen.getByRole('button', { name: 'Continue in the demo' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('explore');
  });

  test('switching from known explore mode opens the version step', () => {
    const onChoose = vi.fn();
    render(
      <SynthDemoDisclaimer onChoose={onChoose} knownChoice="explore" />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Build my own instead' }),
    );
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Synth version')).toBeTruthy();
    expect(
      (screen.getByLabelText('Synth version') as HTMLSelectElement).value,
    ).toBe('iteration-8');
    fireEvent.click(
      screen.getByRole('button', { name: 'Start with Iteration 8' }),
    );
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('build', 'iteration-8');
  });

  test('known build mode shows the saved mode with confirm/switch', () => {
    const onChoose = vi.fn();
    render(
      <SynthDemoDisclaimer
        onChoose={onChoose}
        knownChoice="build"
        knownVersionLabel="Iteration 8"
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(
      "You're building your own with Iteration 8",
    );
    expect(
      screen.getByRole('button', { name: 'Continue building' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Explore the demo instead' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // Continue re-affirms the build choice, no version step.
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue building' }),
    );
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('build');
  });

  test('switching from known build mode records explore at once', () => {
    const onChoose = vi.fn();
    render(
      <SynthDemoDisclaimer onChoose={onChoose} knownChoice="build" />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Explore the demo instead' }),
    );
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('explore');
  });

  test('no known choice asks the full question, not confirm/switch', () => {
    render(<SynthDemoDisclaimer onChoose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(
      'Commence building your own, or explore the demo still?',
    );
    expect(
      screen.queryByRole('button', { name: 'Continue in the demo' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Continue building' }),
    ).toBeNull();
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
    seedSynthVersion(null);
  });

  afterEach(() => {
    restoreWindow?.();
    restoreWindow = undefined;
    seedHomunculusColor(null);
    seedSynthDisclaimerChoice(null);
    seedSynthVersion(null);
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

  test('choosing build my own persists choice and version; a later entry confirms the known mode', async () => {
    const { unmount } = render(<SynthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pink' }));
    await waitFor(() => expect(disclaimerDialog()).not.toBeNull(), {
      timeout: 5000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build my own' }));
    // The version step appears, Iteration 8 selected — nothing is
    // persisted until the version is confirmed.
    expect(screen.getByLabelText('Synth version')).toBeTruthy();
    expect(
      useSettingsStore.getState().settings.synthDisclaimerChoice,
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Start with Iteration 8' }),
    );
    await waitFor(() =>
      expect(
        useSettingsStore.getState().settings.synthDisclaimerChoice,
      ).toBe('build'),
    );
    expect(useSettingsStore.getState().settings.synthVersion).toBe(
      'iteration-8',
    );
    expect(disclaimerDialog()).toBeNull();
    // The inspector names Iteration 8 as the creator builder — the
    // landing for the choice, not a faked builder.
    expect(screen.getByText(/build: your own/)).toBeTruthy();
    expect(screen.getByText(/Iteration 8, the creator builder/)).toBeTruthy();
    // A later entry shows the known mode with confirm/switch — it
    // knows you're building, so it doesn't ask from scratch.
    unmount();
    render(<SynthView />);
    expect(disclaimerDialog()).not.toBeNull();
    expect(disclaimerDialog()?.textContent).toContain(
      "You're building your own with Iteration 8",
    );
    expect(
      screen.getByRole('button', { name: 'Continue building' }),
    ).toBeTruthy();
    expect(screen.getByText(/build: your own/)).toBeTruthy();
  });

  test('choosing explore the demo still persists it; a later entry confirms the known mode', async () => {
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
    // Explore records no version.
    expect(useSettingsStore.getState().settings.synthVersion).toBeNull();
    expect(disclaimerDialog()).toBeNull();
    // No build landing for the explore choice.
    expect(screen.queryByText(/build: your own/)).toBeNull();
    // A later entry shows the known mode with confirm/switch.
    unmount();
    render(<SynthView />);
    expect(disclaimerDialog()).not.toBeNull();
    expect(disclaimerDialog()?.textContent).toContain(
      "You're exploring the demo",
    );
    expect(
      screen.getByRole('button', { name: 'Continue in the demo' }),
    ).toBeTruthy();
  });

  test('a stored colour with no disclaimer answer shows it on entry', () => {
    seedHomunculusColor('pink');
    render(<SynthView />);
    // No reveal to wait for on a later entry — it shows at once.
    expect(disclaimerDialog()).not.toBeNull();
  });

  test('a stored choice shows the known mode with confirm/switch on later entries', () => {
    seedHomunculusColor('pink');
    seedSynthDisclaimerChoice('build');
    const { unmount } = render(<SynthView />);
    expect(disclaimerDialog()).not.toBeNull();
    expect(disclaimerDialog()?.textContent).toContain(
      "You're building your own with Iteration 8",
    );
    unmount();
    seedSynthDisclaimerChoice('explore');
    render(<SynthView />);
    expect(disclaimerDialog()).not.toBeNull();
    expect(disclaimerDialog()?.textContent).toContain(
      "You're exploring the demo",
    );
  });
});
