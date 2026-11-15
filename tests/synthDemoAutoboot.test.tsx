// @vitest-environment jsdom
/**
 * Synth demo auto-boot + windowed scale structure (2026-11-15).
 *
 * Gary (2026-11-15 ~05:08 PST): "synth screen completely fucked" —
 * the synth presented an empty shell in demo mode, and the windowed
 * view ended ~73% down with a dead black band below it.
 *
 * Defect 1 (scale): the scale wrapper used to carry `flex flex-1
 * min-h-0`, and in the column flex parent `flex: 1` (flex-basis 0%)
 * made its main size the flex share, ignoring the 133% height — the
 * wrapper laid out at 100%, scale(0.75) rendered 75%, dead band at
 * the bottom. The wrapper now carries NO flex sizing: it sits inside
 * a plain sizing parent that IS the remaining pane space (flex-1
 * min-h-0, overflow hidden), and lays out at 133% of that parent.
 *
 * Defect 2 (demo never boots): in DEMO mode only — a guest
 * (demo-locked), or the owner with the demo disclaimer choice
 * ('explore') and no creation — the demo boots itself on entry: the
 * default octagon loads into the machine once, and once the machine
 * is READY with the NOOP grant, Lucifer auto-mounts once. NEVER for
 * the owner in build mode, NEVER flips synthDemoReplaced, NEVER loads
 * the owner's creation for a guest.
 *
 * These are DOM/state tests — layout is asserted through the
 * wrapper's classes and inline style, not pixels (jsdom has no
 * layout); the no-black-band check itself is a live deploy check.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SynthView } from '../src/components/Synth/SynthView';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useSynthStore } from '../src/stores/synthStore';
import { DEFAULT_SYNTH_SEED } from '../src/types/synth';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

function stubWindowApi() {
  (window as unknown as { lucidAPI: unknown }).lucidAPI = {
    settings: { set: vi.fn(), setMany: vi.fn() },
    ai: { clearSessions: vi.fn(), getSessions: vi.fn().mockResolvedValue([]) },
  };
}

function setSynthSettings(patch: Record<string, unknown>) {
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, ...patch },
  });
}

function resetSynthStore() {
  useSynthStore.getState().resetShell();
  useSynthStore.setState({
    seedHex: DEFAULT_SYNTH_SEED,
    activePluginId: 'lucifer',
    selectedTileId: 'center',
    eyeMode: 'center',
    mounts: {},
  });
}

function seedDemoSettings(choice: unknown) {
  setSynthSettings({
    homunculusColor: 'purple',
    synthDisclaimerChoice: choice,
    synthDemoReplaced: false,
    synthOwnBuild: null,
    synthVersion: null,
  });
}

function enterAsGuest() {
  const guest = useProfileStore.getState().createGuestProfile();
  expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
  return guest;
}

function shellIframe(container: HTMLElement) {
  const iframe = container.querySelector('iframe');
  if (!iframe || !iframe.contentWindow) {
    throw new Error('synth shell iframe missing');
  }
  return iframe;
}

describe('windowed scale structure (dead black band)', () => {
  beforeEach(() => {
    stubWindowApi();
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
    });
    resetSynthStore();
    seedDemoSettings(null);
  });

  afterEach(() => {
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  test('the scale wrapper carries no flex sizing — it lays out at 133% inside a sizing parent that is the remaining pane space', () => {
    const { container } = render(<SynthView />);
    const iframe = shellIframe(container);
    // Structure: sizing parent > scale wrapper > shell div > iframe.
    const shellDiv = iframe.parentElement as HTMLElement;
    const wrapper = shellDiv.parentElement as HTMLElement;
    const sizingParent = wrapper.parentElement as HTMLElement;

    // The wrapper lays out at 100%/0.75 and scales back to 100%.
    // (jsdom serializes the calc division: calc(100% / 0.75) reads
    // back as calc(133.333%). The style function's own unit test
    // pins the authored form.)
    expect(wrapper.style.width).toBe('calc(133.333%)');
    expect(wrapper.style.height).toBe('calc(133.333%)');
    expect(wrapper.style.transform).toBe('scale(0.75)');
    expect(wrapper.style.transformOrigin).toBe('top left');
    // And NOTHING flex-sizes it: no flex-1 / min-h-0 on the wrapper
    // itself — that was the bug (flex-basis 0% ignored the height).
    expect(wrapper.className).not.toContain('flex-1');
    expect(wrapper.className).not.toContain('min-h-0');
    // The sizing parent IS the remaining pane space, and clips the
    // 133% layout box.
    expect(sizingParent.className).toContain('flex-1');
    expect(sizingParent.className).toContain('min-h-0');
    expect(sizingParent.className).toContain('overflow-hidden');
  });
});

describe('demo auto-boot + auto-mount', () => {
  beforeEach(() => {
    stubWindowApi();
    vi.useFakeTimers();
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
    });
    resetSynthStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  function bootMachineToReady(container: HTMLElement) {
    const iframe = shellIframe(container);
    const postMessage = vi.spyOn(iframe.contentWindow, 'postMessage');
    fireEvent.load(iframe);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    return postMessage;
  }

  test('guest: the default octagon auto-loads on entry and Lucifer auto-mounts once the machine is READY', () => {
    seedDemoSettings('explore');
    enterAsGuest();
    const { container } = render(<SynthView />);

    // Auto-boot on entry: the demo shell is loaded, the demo default.
    expect(useSynthStore.getState().machine.shell?.shellId).toBe(
      'SHELL_OCTAGON_ALPHA',
    );
    // Still waiting on the shell iframe to load.
    expect(useSynthStore.getState().machine.boot).toBe('WAIT_BLUEPRINT');

    const postMessage = bootMachineToReady(container);
    // The machine booted to READY and the demo embodiment mounted.
    expect(useSynthStore.getState().machine.boot).toBe('READY');
    expect(useSynthStore.getState().mounts['lucifer']).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Unmount Lucifer the Sentinel' }),
    ).toBeTruthy();
    // The mount was posted into the shell iframe, so the thinker
    // renders in the eye.
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lucid-synth-mount',
        mounted: true,
      }),
      '*',
    );
    // Nothing about the demo was permanently replaced or persisted:
    // the guest still has no creation and the demo is still the demo.
    const settings = useSettingsStore.getState().settings;
    expect(settings.synthDemoReplaced).toBe(false);
    expect(settings.synthOwnBuild).toBeNull();
  });

  test('guest: the demo boots under the Homunculus colour picker — it does not wait for the colour choice', () => {
    setSynthSettings({
      homunculusColor: null,
      synthDisclaimerChoice: 'explore',
      synthDemoReplaced: false,
      synthOwnBuild: null,
      synthVersion: null,
    });
    enterAsGuest();
    render(<SynthView />);
    // The picker is showing (first entry, no colour stored) AND the
    // demo shell is already loaded behind it.
    expect(
      screen.getByRole('dialog', { name: 'Choose your Homunculus colour' }),
    ).toBeTruthy();
    expect(useSynthStore.getState().machine.shell?.shellId).toBe(
      'SHELL_OCTAGON_ALPHA',
    );
  });

  test('owner in demo mode (disclaimer choice explore, no creation): same auto-boot + auto-mount', () => {
    seedDemoSettings('explore');
    const { container } = render(<SynthView />);
    expect(useSynthStore.getState().machine.shell?.shellId).toBe(
      'SHELL_OCTAGON_ALPHA',
    );
    bootMachineToReady(container);
    expect(useSynthStore.getState().machine.boot).toBe('READY');
    expect(useSynthStore.getState().mounts['lucifer']).not.toBeNull();
    const settings = useSettingsStore.getState().settings;
    expect(settings.synthDemoReplaced).toBe(false);
    expect(settings.synthOwnBuild).toBeNull();
  });

  test('owner in build mode: NO auto-boot — the machine stays empty until the builder loads a blueprint', () => {
    seedDemoSettings('build');
    render(<SynthView />);
    expect(useSynthStore.getState().machine.shell).toBeNull();
    expect(useSynthStore.getState().mounts['lucifer'] ?? null).toBeNull();
  });

  test('owner with no disclaimer answer yet: NO auto-boot — the mode is not chosen', () => {
    seedDemoSettings(null);
    render(<SynthView />);
    expect(useSynthStore.getState().machine.shell).toBeNull();
  });

  test('guest on Iteration 8: NO TS-machine auto-boot — that shell manages its own state', () => {
    seedDemoSettings('explore');
    enterAsGuest();
    useSynthStore.setState({ activePluginId: 'iteration8' });
    render(<SynthView />);
    expect(useSynthStore.getState().machine.shell).toBeNull();
    // Its own "Load the default octagon" button is still there.
    expect(screen.getByTestId('load-default-octagon')).toBeTruthy();
  });

  test('a manual unmount after the auto-mount is respected — it never re-mounts over the user', () => {
    seedDemoSettings('explore');
    enterAsGuest();
    const { container } = render(<SynthView />);
    bootMachineToReady(container);
    expect(useSynthStore.getState().mounts['lucifer']).not.toBeNull();
    act(() => {
      useSynthStore.getState().unmountEmbodiment('lucifer');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useSynthStore.getState().mounts['lucifer'] ?? null).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Mount Lucifer the Sentinel' }),
    ).toBeTruthy();
  });
});
