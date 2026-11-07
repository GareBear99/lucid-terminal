// @vitest-environment jsdom
/**
 * Forge view tests.
 *
 * Covers: the roster card shows the avatar + biography (or "not
 * written yet" when none is set), the pipeline shows all five stages,
 * the Ask-the-brain box shows the honest no-brain message when nothing
 * is installed, and the empty roster shows the choose-a-colour message.
 *
 * The llmbuilder IPC is mocked by patching window.lucidAPI.llmbuilder
 * in place — never by replacing the whole jsdom window.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ForgeView } from '../src/components/Forge/ForgeView';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { Homunculus } from '../src/lib/homunculi';

function installMock(roster: Homunculus[]) {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const mock = {
    status: vi.fn(async () => ({
      ready: true,
      pythonAvailable: true,
      venvReady: true,
      torchInstalled: true,
      lowMemory: false,
      message: null,
    })),
    setup: vi.fn(async () => ({ ok: true, message: 'ok' })),
    startRun: vi.fn(async () => ({
      runId: 'run-1',
      homunculusId: 'lucifer',
      candidate: 'lucifer-1',
      tier: 'tiny',
      status: 'running',
      startedAt: new Date().toISOString(),
    })),
    cancelRun: vi.fn(async () => ({ ok: true })),
    listRuns: vi.fn(async () => []),
    getScoreboard: vi.fn(async () => []),
    getPromotionDecision: vi.fn(async () => null),
    installBrain: vi.fn(async () => ({
      modelPath: '~/.lucid/models/lucifer.gguf',
      previousModelPath: null,
    })),
    rollback: vi.fn(async () => ({
      modelPath: '~/.lucid/models/lucifer.gguf',
      previousModelPath: null,
    })),
    getRoster: vi.fn(async () => [...roster]),
    saveRoster: vi.fn(async () => undefined),
    importDataset: vi.fn(async (name: string) => ({
      datasetId: name,
      recordCount: 1,
      domains: [],
    })),
    askBrain: vi.fn(async () => null),
    onProgress: vi.fn(() => () => undefined),
  };
  win.lucidAPI = {
    ...((prevLucidAPI as object) ?? {}),
    llmbuilder: mock,
    settings: { set: vi.fn(async () => undefined) },
  };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

const LUCIFER: Homunculus = {
  id: 'lucifer',
  name: 'Lucifer',
  color: 'pink',
  biography: null,
  modelPath: null,
  status: 'untrained',
  incumbentScore: null,
  lineage: [],
  createdAt: '2026-11-05T06:00:00.000Z',
};

describe('ForgeView', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'pink' as never },
    }));
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('roster card shows the avatar, the name, and "not written yet"', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    expect(screen.getByText('Biography not written yet')).toBeTruthy();
    // The avatar is the Sentinel face SVG.
    expect(document.querySelector('svg[aria-label="Sentinel face"]')).toBeTruthy();
    expect(screen.getByText(/Untrained/)).toBeTruthy();
  });

  test('roster card face wears the Homunculus own color, not the Settings color', async () => {
    // Settings says pink; this Homunculus is purple — the card's face
    // must be purple (#a855f7). Without the color prop the face would
    // wear the Settings color instead.
    const PURPLE_ONE: Homunculus = { ...LUCIFER, id: 'violet', name: 'Violet', color: 'purple' };
    restore = installMock([PURPLE_ONE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Violet')).toBeTruthy());
    const head = document.querySelector('[data-head="true"]');
    expect(head).not.toBeNull();
    expect(head?.getAttribute('stroke')).toBe('#a855f7');
  });

  test('pipeline shows all five stages', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Data — Waiting')).toBeTruthy());
    expect(screen.getByText('Train — Waiting')).toBeTruthy();
    expect(screen.getByText('Benchmark — Waiting')).toBeTruthy();
    expect(screen.getByText('Gate — Waiting')).toBeTruthy();
    expect(screen.getByText('Promote — Waiting')).toBeTruthy();
    expect(screen.getByText('Run demo proof')).toBeTruthy();
  });

  test('Ask the brain shows the honest no-brain message when nothing is installed', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Ask the brain')).toBeTruthy());
    expect(screen.getByText(/No brain installed/)).toBeTruthy();
  });

  test('empty roster shows the choose-a-colour message', async () => {
    restore = installMock([]);
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: null as never },
    }));
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('No Homunculi yet.')).toBeTruthy());
    expect(
      screen.getByText(/Choose your Homunculus color in the Synth view first/),
    ).toBeTruthy();
  });

  test('honest scale is stated in plain text', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Forge' })).toBeTruthy());
    expect(screen.getByText(/toy text completion/)).toBeTruthy();
    expect(screen.getByText(/not conversation/)).toBeTruthy();
  });

  test('Forge explanation audio is at the bottom of the page, not the header (Gary, 2026-11-06)', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Forge' })).toBeTruthy());
    const explanation = screen.getByText(/How does the Forge work\?/);
    expect(explanation).toBeTruthy();
    const audio = document.querySelector(
      'audio[aria-label="Forge explanation audio"]',
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe(
      './forge/forge-explanation.mp3',
    );
    expect(audio?.hasAttribute('controls')).toBe(true);
    // Not in the header any more.
    const header = document.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.contains(explanation)).toBe(false);
    // After the main Forge content: it follows "Ask the brain" in
    // document order, so it is the last thing on the page.
    const askBrain = screen.getByText('Ask the brain');
    expect(
      Boolean(
        askBrain.compareDocumentPosition(explanation) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  test('Forge main page voice message audio is present in the Forge tab', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Forge' })).toBeTruthy());
    const audio = document.querySelector(
      'audio[aria-label="Forge main page voice message"]',
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('./forge/forge-main.mp3');
    expect(audio?.hasAttribute('controls')).toBe(true);
  });
});

describe('ForgeView opposite-colour rule + EVE naming (Gary, 2026-11-06)', () => {
  let restore: () => void;

  const PURPLE_LUCIFER: Homunculus = {
    ...LUCIFER,
    color: 'purple',
  };

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'pink' as never },
    }));
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  function openCreation() {
    fireEvent.click(screen.getByText('+ New Homunculus'));
    return screen.getByLabelText('Colour') as HTMLSelectElement;
  }

  function colourOptions(select: HTMLSelectElement): string[] {
    return Array.from(select.querySelectorAll('option')).map(
      (o) => o.getAttribute('value') ?? '',
    );
  }

  test('picker offers only the opposite colour of the active Homunculus', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    const select = openCreation();
    // Lucifer is pink, so only Purple may be created.
    expect(colourOptions(select)).toEqual(['purple']);
    expect(select.value).toBe('purple');
    expect(
      screen.getByText(/Only Purple — a new Homunculus must be the opposite colour/),
    ).toBeTruthy();
  });

  test('picker offers both colours when the roster is empty', async () => {
    restore = installMock([]);
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: null as never },
    }));
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('No Homunculi yet.')).toBeTruthy());
    const select = openCreation();
    expect(colourOptions(select)).toEqual(['purple', 'pink']);
    expect(
      screen.queryByText(/must be the opposite colour/),
    ).toBeNull();
  });

  test('second Homunculus defaults to EVE when it is pink', async () => {
    // Lucifer is purple, so the second must be pink — and a pink
    // second is EVE.
    restore = installMock([PURPLE_LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    openCreation();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('EVE');
  });

  test('second Homunculus gets no name default when it is purple', async () => {
    // Lucifer is pink, so the second must be purple — and a purple
    // second has no name given. The name stays the user's own.
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    openCreation();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('');
  });
});

describe('ForgeView dual unison tabs (Gary, 2026-11-06)', () => {
  let restore: () => void;

  const PURPLE_ONE: Homunculus = {
    ...LUCIFER,
    id: 'violet',
    name: 'Violet',
    color: 'purple',
  };

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'pink' as never },
    }));
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  async function openTab(name: RegExp) {
    fireEvent.click(screen.getByRole('tab', { name }));
  }

  test('the three tabs render, Dual Unison locked until the pair exists', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    expect(screen.getByRole('tab', { name: 'Forge' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Dual Unison/ })).toBeTruthy();
    expect(screen.getByText(/Dual Unison \(Locked\)/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tail Generator' })).toBeTruthy();
  });

  test('Dual Unison tab is locked without the pair', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    await openTab(/Dual Unison/);
    expect(screen.getByText(/Not unlocked yet/)).toBeTruthy();
    expect(screen.getByText(/you have pink but no purple/)).toBeTruthy();
  });

  test('with the pair, the stop setup walks input -> verify -> detect', async () => {
    restore = installMock([LUCIFER, PURPLE_ONE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Violet')).toBeTruthy());
    await openTab(/Dual Unison/);
    expect(screen.getByText(/Dual unison — the third type/)).toBeTruthy();
    expect(screen.getByText(/the one whole/)).toBeTruthy();
    expect(
      screen.getByText('Input the first stop action'),
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Input the first stop action'));
    await waitFor(() =>
      expect(screen.getByText('Verify in the unison detect')).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Verify in the unison detect'));
    await waitFor(() =>
      expect(screen.getByText('Detect in the unison detect')).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Detect in the unison detect'));
    await waitFor(() =>
      expect(screen.getByText(/the tail page is fully unlocked/)).toBeTruthy(),
    );
  });

  test('the STOP gate shows in the Forge tab and blocks the new-Homunculus button', async () => {
    restore = installMock([LUCIFER, PURPLE_ONE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Violet')).toBeTruthy());
    expect(
      screen.getByText(/set up the third type in the Dual Unison tab first/),
    ).toBeTruthy();
    expect(
      (screen.getByText('+ New Homunculus') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test('Tail Generator tab shows its requirement, then unlocks fully', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    await openTab(/Tail Generator/);
    expect(screen.getByText(/Requirement: dual unison detected/)).toBeTruthy();
    expect(screen.getByText(/not yet detected/)).toBeTruthy();
    expect(screen.queryByText(/Root a united action/)).toBeNull();
  });

  test('once the stop action is detected, the tail page roots actions', async () => {
    restore = installMock([LUCIFER, PURPLE_ONE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Violet')).toBeTruthy());
    await openTab(/Dual Unison/);
    fireEvent.click(screen.getByText('Input the first stop action'));
    await waitFor(() =>
      expect(screen.getByText('Verify in the unison detect')).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Verify in the unison detect'));
    await waitFor(() =>
      expect(screen.getByText('Detect in the unison detect')).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Detect in the unison detect'));
    await waitFor(() =>
      expect(screen.getByText(/the tail page is fully unlocked/)).toBeTruthy(),
    );
    await openTab(/Tail Generator/);
    expect(screen.getByText(/Fully unlocked/)).toBeTruthy();
    const input = screen.getByLabelText(
      'United action to root',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'first united action' } });
    fireEvent.click(screen.getByText('Root in binary 2'));
    await waitFor(() =>
      expect(screen.getByText('first united action')).toBeTruthy(),
    );
    expect(screen.getByText(/tick 1/)).toBeTruthy();
  });

  test('double-clicking a Homunculus in the Forge activates it — green Online swaps', async () => {
    restore = installMock([LUCIFER, PURPLE_ONE]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Violet')).toBeTruthy());
    // Lucifer (roster[0]) is the active one at load.
    expect(screen.getAllByText('Online')).toHaveLength(1);
    expect(screen.getAllByText('Offline')).toHaveLength(1);
    const violetCard = screen.getByText('Violet').closest('button');
    expect(violetCard).not.toBeNull();
    fireEvent.doubleClick(violetCard as HTMLElement);
    await waitFor(() =>
      expect(useForgeStore.getState().selectedId).toBe('violet'),
    );
    // The Online indicator moved to Violet; Lucifer is Offline now.
    const cards = screen.getAllByText(/Online|Offline/);
    expect(cards).toHaveLength(2);
    const violetOnline = screen.getByText('Violet').closest('button');
    expect(violetOnline?.textContent).toContain('Online');
    const luciferCard = screen.getByText('Lucifer').closest('button');
    expect(luciferCard?.textContent).toContain('Offline');
  });

  test('Dual Unison voice message audio is present in the Dual Unison tab', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    await openTab(/Dual Unison/);
    const audio = document.querySelector(
      'audio[aria-label="Dual Unison voice message"]',
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('./forge/forge-dual-unison.mp3');
    expect(audio?.hasAttribute('controls')).toBe(true);
  });

  test('Tail Generator voice message audio is present in the Tail Generator tab', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    await openTab(/Tail Generator/);
    const audio = document.querySelector(
      'audio[aria-label="Tail Generator voice message"]',
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe(
      './forge/forge-tail-generator.mp3',
    );
    expect(audio?.hasAttribute('controls')).toBe(true);
  });
});
