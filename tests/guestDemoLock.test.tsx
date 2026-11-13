// @vitest-environment jsdom
// Guest demo-lock (Gary, 2026-11-12 ~16:41 PST): while the active
// profile is a guest, the synth stays in demo mode — no builder, no
// permanent demo replacement, no demo wipe, no owner creation loaded
// or shown. The shell picker still offers both shells, so the guest
// can compare the demo synth vs Iteration 8.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynthView } from '../src/components/Synth/SynthView';
import {
  createCreatorBuild,
  type CreatorBuild,
} from '../src/lib/synthDisclaimer';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
} from '../src/lib/synthBlueprint';
import { DEFAULT_SYNTH_SEED } from '../src/types/synth';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useSynthStore } from '../src/stores/synthStore';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

function validBuild(): CreatorBuild {
  // Positional args — createCreatorBuild takes (version, seedHex,
  // color, blueprint, modules, profileId, createdAt), not an options
  // object. An object form returns null.
  const build = createCreatorBuild(
    'iteration-8',
    DEFAULT_SYNTH_SEED,
    'pink',
    DEFAULT_SHELL_BLUEPRINT,
    DEFAULT_MODULES,
    'default',
    '2026-11-12T00:00:00.000Z',
  );
  if (!build) throw new Error('test fixture build must be valid');
  return build;
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
  });
}

describe('guest demo-lock — SynthView', () => {
  beforeEach(() => {
    (window as unknown as { lucidAPI: unknown }).lucidAPI = {
      settings: { set: vi.fn(), setMany: vi.fn() },
      ai: { clearSessions: vi.fn() },
    };
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
    });
    resetSynthStore();
    setSynthSettings({
      homunculusColor: 'purple',
      synthDisclaimerChoice: 'build',
      synthDemoReplaced: true,
      synthOwnBuild: validBuild(),
      synthVersion: 'iteration-8',
    });
  });

  afterEach(() => {
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  function enterAsGuest() {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
    return guest;
  }

  test('guest: no builder, no owner build, no directory, no owner creation loaded — but both shells still offered', () => {
    enterAsGuest();
    render(<SynthView />);

    // The lock, stated plainly.
    expect(
      screen.getByText(/Guest — synth locked to demo mode/),
    ).toBeTruthy();
    // No builder anywhere (the creator-builder testid lives inside
    // CreatorBuilder) and no "build: your own" landing line.
    expect(screen.queryByTestId('creator-builder')).toBeNull();
    expect(screen.queryByText(/build: your own/)).toBeNull();
    expect(screen.queryByText(/Edit build/)).toBeNull();
    // No Voxel Directory — it belongs to the owner's creation.
    expect(screen.queryByTestId('voxel-directory-panel')).toBeNull();
    expect(screen.getByText(/Guests stay in demo mode/)).toBeTruthy();
    // The owner's creation was NOT loaded into the machine.
    expect(useSynthStore.getState().machine.shell).toBeNull();
    // No disclaimer offering the build choice either.
    expect(screen.queryByText('This synth is a demo')).toBeNull();
    // The shell picker still offers BOTH shells — the lock is about
    // not building or replacing, not about hiding Iteration 8. The
    // saved guest profile is the test bed for comparing them.
    expect(screen.getByText('Lucifer')).toBeTruthy();
    expect(
      screen.getByText('Iteration 8 — Dynamic Modules Shell'),
    ).toBeTruthy();
  });

  test('guest: the owner directory stays hidden even when the store already holds it', () => {
    // Pre-build the owner's directory in the store (as if the owner
    // had just been here): the guest must still not see it.
    useSynthStore.getState().refreshDirectory();
    expect(
      useSynthStore.getState().directories['lucifer'],
    ).toBeDefined();
    enterAsGuest();
    render(<SynthView />);
    expect(screen.queryByTestId('voxel-directory-panel')).toBeNull();
    expect(screen.getByText(/Guests stay in demo mode/)).toBeTruthy();
  });

  test('owner (control): same settings, the creation restores, the builder and directory show', () => {
    render(<SynthView />);
    // The owner's creation loaded into the machine.
    expect(useSynthStore.getState().machine.shell).not.toBeNull();
    // The "build: your own" landing line + Edit build + directory.
    expect(screen.getByText(/build: your own/)).toBeTruthy();
    expect(screen.getByText('Edit build')).toBeTruthy();
    expect(screen.getByTestId('voxel-directory-panel')).toBeTruthy();
    // No guest lock line for the owner.
    expect(
      screen.queryByText(/Guest — synth locked to demo mode/),
    ).toBeNull();
  });

  test('guest: no disclaimer when the demo has not been replaced — the choice is never offered', () => {
    setSynthSettings({
      synthDisclaimerChoice: null,
      synthDemoReplaced: false,
      synthOwnBuild: null,
    });
    enterAsGuest();
    render(<SynthView />);
    expect(screen.queryByText('This synth is a demo')).toBeNull();
    expect(screen.queryByText(/Explore the demo still/)).toBeNull();
  });

  test('owner (control): the disclaimer shows when the demo has not been replaced', () => {
    setSynthSettings({
      synthDisclaimerChoice: null,
      synthDemoReplaced: false,
      synthOwnBuild: null,
    });
    render(<SynthView />);
    expect(screen.getByText('This synth is a demo')).toBeTruthy();
    expect(
      screen.getByText(/Commence building your own, or explore the demo still/),
    ).toBeTruthy();
  });
});

describe('guest demo-lock — inspector seed (2026-11-12 ~20:34 PST)', () => {
  // The widgets re-deploy wave fixed the Seed card as guest, but the
  // inspector's own SHELL block still showed the owner's creation
  // seed (seed: F1B49B1CB10D6FED) — SynthView read the persisted
  // store seed with no guest check. The inspector seed is the
  // SESSION's loaded creation now, never the store seed as-is:
  // guest → "no creation loaded", owner with nothing loaded →
  // "no creation loaded", owner with a creation loaded → the session
  // seed. Same rule as the widget layer (SeedWidget convention).
  beforeEach(() => {
    (window as unknown as { lucidAPI: unknown }).lucidAPI = {
      settings: { set: vi.fn(), setMany: vi.fn() },
      ai: {
        clearSessions: vi.fn(),
        // Leaving the guest reloads the owner's sessions — the mock
        // must answer, or the restore logs a (caught) load failure.
        getSessions: vi.fn().mockResolvedValue([]),
      },
    };
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
    });
    resetSynthStore();
    setSynthSettings({
      homunculusColor: 'purple',
      synthDisclaimerChoice: 'build',
      synthDemoReplaced: true,
      synthOwnBuild: validBuild(),
      synthVersion: 'iteration-8',
    });
  });

  afterEach(() => {
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  function enterAsGuest() {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
    return guest;
  }

  test('guest: the inspector shows no creation loaded — never the owner seed', () => {
    enterAsGuest();
    render(<SynthView />);
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(DEFAULT_SYNTH_SEED);
  });

  test('guest: a blueprint loaded in-session still shows no owner seed', () => {
    enterAsGuest();
    // The guest CAN load the demo blueprint in demo mode — a loaded
    // shell must not re-open the seed line.
    useSynthStore.getState().loadDefaultShellBlueprint();
    expect(useSynthStore.getState().machine.shell).not.toBeNull();
    render(<SynthView />);
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(DEFAULT_SYNTH_SEED);
  });

  test('guest: Iteration 8 reporting a shell seed still shows no creation loaded', () => {
    enterAsGuest();
    useSynthStore.setState({
      activePluginId: 'iteration8',
      iframeShellState: {
        boot: 'READY',
        build: 'EMPTY_REPO_READY',
        shellId: 'octagon',
        seed: '7F021AE4',
        routeTiles: 15,
        mappedCount: 15,
        receipts: 0,
      },
    });
    render(<SynthView />);
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(DEFAULT_SYNTH_SEED);
    expect(document.body.textContent).not.toContain('7F021AE4');
  });

  test('owner with a creation loaded: the inspector shows the session seed', () => {
    render(<SynthView />);
    // The owner's creation loaded into the machine; the inspector
    // (and the Seed card) show its seed.
    expect(useSynthStore.getState().machine.shell).not.toBeNull();
    expect(
      screen.getAllByText(/seed: F1B49B1CB10D6FED/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/seed: no creation loaded/)).toBeNull();
  });

  test('owner with nothing loaded: the inspector shows no creation loaded — never the store seed', () => {
    setSynthSettings({
      synthDisclaimerChoice: null,
      synthDemoReplaced: false,
      synthOwnBuild: null,
    });
    // The store STILL holds the owner's seed (the Lucifer default)
    // with nothing loaded — the inspector must not show it.
    expect(useSynthStore.getState().seedHex).toBe(DEFAULT_SYNTH_SEED);
    render(<SynthView />);
    expect(useSynthStore.getState().machine.shell).toBeNull();
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(DEFAULT_SYNTH_SEED);
  });

  test('owner, Iteration 8 with a blueprint loaded: the inspector shows the shell-reported seed', () => {
    useSynthStore.setState({
      activePluginId: 'iteration8',
      iframeShellState: {
        boot: 'READY',
        build: 'EMPTY_REPO_READY',
        shellId: 'octagon',
        seed: '7F021AE4',
        routeTiles: 15,
        mappedCount: 15,
        receipts: 0,
      },
    });
    render(<SynthView />);
    expect(screen.getByText(/seed: 7F021AE4/)).toBeTruthy();
  });

  test('owner, Iteration 8 with no blueprint loaded: the inspector shows no creation loaded', () => {
    useSynthStore.setState({
      activePluginId: 'iteration8',
      iframeShellState: {
        boot: 'WAIT_BLUEPRINT',
        build: 'IDLE',
        shellId: null,
        seed: '7F021AE4',
        routeTiles: 0,
        mappedCount: 0,
        receipts: 0,
      },
    });
    render(<SynthView />);
    // The shell reports its default seed with no blueprint — the
    // inspector must not show it (nothing is loaded in-session).
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('7F021AE4');
  });

  test('guest then owner: leaving the guest restores the owner seed in the inspector', () => {
    enterAsGuest();
    const { unmount } = render(<SynthView />);
    expect(screen.getByText(/seed: no creation loaded/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(DEFAULT_SYNTH_SEED);
    unmount();
    expect(
      useProfileStore.getState().selectProfile(DEFAULT_PROFILE_ID),
    ).toBe(true);
    render(<SynthView />);
    expect(useSynthStore.getState().machine.shell).not.toBeNull();
    expect(
      screen.getAllByText(/seed: F1B49B1CB10D6FED/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/seed: no creation loaded/)).toBeNull();
  });
});
