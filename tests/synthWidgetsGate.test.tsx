// @vitest-environment jsdom
/**
 * Widget gate tests — the widget layer (Gary, 2026-11-12 ~16:50 PST):
 * "widgets only show after you started a permanent creation build".
 * The layer renders NOTHING in the demo state — no compass, no custom
 * widgets — and shows the registered widgets once the demo has been
 * permanently replaced by a valid saved creation (the same gate as
 * the Voxel Directory).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WidgetLayer } from '../src/components/Synth/widgets/WidgetLayer';
import { useSynthStore } from '../src/stores/synthStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';
import { createMachine } from '../src/lib/synthBoot';
import { createCreatorBuild } from '../src/lib/synthDisclaimer';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
} from '../src/lib/synthBlueprint';

function setGate(demoReplaced: boolean, ownBuild: unknown) {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      synthDemoReplaced: demoReplaced,
      synthOwnBuild: ownBuild as never,
    },
  }));
}

function validOwnBuild() {
  const build = createCreatorBuild(
    'iteration-8',
    'F1B49B1CB10D6FED',
    'pink',
    DEFAULT_SHELL_BLUEPRINT,
    DEFAULT_MODULES,
    'default',
  );
  expect(build).not.toBeNull();
  return build;
}

function setOwnerProfile() {
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
  });
}

function setGuestProfile() {
  const guest = useProfileStore.getState().createGuestProfile();
  expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
}

beforeEach(() => {
  setOwnerProfile();
  setGate(false, null);
  useSynthStore.setState({
    activePluginId: 'lucifer',
    machine: createMachine(),
    mounts: {},
    iframeShellState: null,
  });
});

describe('WidgetLayer — the permanent-creation gate', () => {
  test('in the demo state the layer renders nothing at all', () => {
    render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
    expect(screen.queryByTestId('compass-widget')).toBeNull();
    expect(screen.queryByTestId('seed-widget')).toBeNull();
  });

  test('the flag alone, without a saved build, still renders nothing', () => {
    setGate(true, null);
    render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
  });

  test('a saved build alone, without the flag, still renders nothing', () => {
    setGate(false, validOwnBuild());
    render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
  });

  test('flag AND a valid saved creation shows the compass and the custom widget', () => {
    setGate(true, validOwnBuild());
    render(<WidgetLayer />);
    expect(screen.getByTestId('synth-widget-layer')).toBeTruthy();
    expect(screen.getByTestId('compass-widget')).toBeTruthy();
    expect(screen.getByTestId('seed-widget')).toBeTruthy();
  });

  test('with the gate met but no blueprint loaded, the compass shows no heading', () => {
    setGate(true, validOwnBuild());
    render(<WidgetLayer />);
    expect(screen.getByTestId('compass-widget')).toBeTruthy();
    expect(screen.getByText(/No heading/)).toBeTruthy();
  });

  test('with the gate met and the default blueprint loaded, the compass shows the eye heading', () => {
    setGate(true, validOwnBuild());
    useSynthStore.getState().loadDefaultShellBlueprint();
    render(<WidgetLayer />);
    const compass = screen.getByTestId('compass-widget');
    expect(compass).toBeTruthy();
    // The default octagon eye: hdg=78.7° E, pole +Z, LOCK.
    expect(compass.getAttribute('data-heading')).toBe('78.7');
    expect(compass.getAttribute('data-pole')).toBe('+Z');
    expect(screen.getByText(/hdg=78\.7° E/)).toBeTruthy();
    expect(screen.getByText(/pole \+Z · LOCK/)).toBeTruthy();
  });

  test('with the gate met and the default blueprint loaded, the seed card shows the session seed', () => {
    setGate(true, validOwnBuild());
    useSynthStore.getState().loadDefaultShellBlueprint();
    render(<WidgetLayer />);
    expect(screen.getByTestId('seed-widget')).toBeTruthy();
    expect(screen.getByText(/seed: F1B49B1CB10D6FED/)).toBeTruthy();
  });

  test('with the gate met but no blueprint loaded, the seed card shows no creation loaded — never the store seed', () => {
    setGate(true, validOwnBuild());
    // The synth store STILL holds the owner's seed (the Lucifer
    // default) with nothing loaded — the card must not show it.
    expect(useSynthStore.getState().seedHex).toBe('F1B49B1CB10D6FED');
    render(<WidgetLayer />);
    expect(screen.getByTestId('seed-widget')).toBeTruthy();
    expect(screen.getByText(/no creation loaded/)).toBeTruthy();
    expect(screen.queryByText(/seed: F1B49B1CB10D6FED/)).toBeNull();
  });
});

describe('WidgetLayer — the guest demo-lock (2026-11-12 ~20:15 PST)', () => {
  test('a guest with the gate met renders nothing — the failed live-verification case', () => {
    // The persisted flags pass for a guest (the veil never touches
    // them): flag + valid saved creation, owner seed in the store.
    setGuestProfile();
    setGate(true, validOwnBuild());
    expect(useSynthStore.getState().seedHex).toBe('F1B49B1CB10D6FED');
    render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
    expect(screen.queryByTestId('compass-widget')).toBeNull();
    expect(screen.queryByTestId('seed-widget')).toBeNull();
    // No owner seed anywhere in the rendered output.
    expect(document.body.textContent).not.toContain('F1B49B1CB10D6FED');
  });

  test('a guest with the gate met AND a blueprint loaded still renders nothing', () => {
    // The guest CAN load the demo blueprint in demo mode — a loaded
    // shell must not re-open the gate, and the session seed stays null.
    setGuestProfile();
    setGate(true, validOwnBuild());
    useSynthStore.getState().loadDefaultShellBlueprint();
    render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
    expect(screen.queryByTestId('seed-widget')).toBeNull();
    expect(document.body.textContent).not.toContain('F1B49B1CB10D6FED');
  });

  test('leaving the guest session restores the widgets for the owner', () => {
    setGuestProfile();
    setGate(true, validOwnBuild());
    const { unmount } = render(<WidgetLayer />);
    expect(screen.queryByTestId('synth-widget-layer')).toBeNull();
    unmount();
    setOwnerProfile();
    render(<WidgetLayer />);
    expect(screen.getByTestId('synth-widget-layer')).toBeTruthy();
    expect(screen.getByTestId('compass-widget')).toBeTruthy();
    expect(screen.getByTestId('seed-widget')).toBeTruthy();
  });
});
