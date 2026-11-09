// @vitest-environment jsdom
/**
 * Summons tests (Gary, 2026-11-09).
 *
 * Covers: the Summons section shows in the Forge when LuciferAI is
 * enabled and is ABSENT when it is off (same zero-residue rule as
 * the other LuciferAI surfaces; silenced does NOT hide it — silenced
 * is dormant, not off); Lilly, the LuciferAI siren, is the first
 * summon, locked with "Requires Living Golem — coming soon"; the
 * slot renders the GIF and falls back to the still on error, with
 * fixed-aspect sizing that can't fail (aspect-square, no overflow,
 * no distortion); selecting / activating follow the roster's
 * click / double-click pattern, with activation rejected while
 * locked; the top-bar scroll request makes the Forge view scroll
 * to the section; and the second slot is a locked placeholder with
 * no invented name or art.
 *
 * The llmbuilder IPC is mocked by patching window.lucidAPI.llmbuilder
 * in place — never by replacing the whole jsdom window. Same harness
 * as tests/forgeView.test.tsx.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ForgeView } from '../src/components/Forge/ForgeView';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  LILLY_SUMMON,
  SECOND_SUMMON_LOCKED_TEXT,
  SUMMONS,
  isSummonUnlocked,
} from '../src/lib/summons';
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

/** Set the LuciferAI gates explicitly — the settings store persists
 * across tests in the file, so never leave them to a previous test. */
function setLuciferAi(enabled: boolean, silenced = false) {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      luciferAiEnabled: enabled as never,
      luciferAiSilenced: silenced as never,
    },
  }));
}

describe('Summons model (Gary, 2026-11-09)', () => {
  test('Lilly is the first summon — new, not Lucifer renamed', () => {
    expect(SUMMONS[0]).toBe(LILLY_SUMMON);
    expect(LILLY_SUMMON.id).toBe('lilly');
    expect(LILLY_SUMMON.name).toBe('Lilly');
    expect(LILLY_SUMMON.id).not.toBe('lucifer');
  });

  test('Lilly wires the pack art — GIF animated, still as fallback', () => {
    expect(LILLY_SUMMON.gifSrc).toBe(
      './summons/lilly/slave-boss-heart-playing.gif',
    );
    expect(LILLY_SUMMON.imageSrc).toBe(
      './summons/lilly/slave-boss-with-heart-clean.png',
    );
    expect(LILLY_SUMMON.gifSrc).not.toBe(LILLY_SUMMON.imageSrc);
  });

  test('Lilly unlocks with a Living Golem, free of any referral requirement', () => {
    expect(LILLY_SUMMON.unlock).toBe('living-golem');
    expect(LILLY_SUMMON.lockedText).toBe(
      'Requires Living Golem — coming soon',
    );
  });

  test('no summon is unlocked today — nobody owns a Living Golem yet', () => {
    // Detection is open (Gary's call); until it lands, every summon
    // reads locked. The second slot's rule is stated, not detected.
    expect(isSummonUnlocked(LILLY_SUMMON)).toBe(false);
    expect(SECOND_SUMMON_LOCKED_TEXT).toBe(
      'Requires Living Golem and higher topology — coming soon',
    );
  });
});

describe('Summons section gating', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('section is ABSENT when LuciferAI is off', async () => {
    setLuciferAi(false);
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() => expect(screen.getByText('Lucifer')).toBeTruthy());
    expect(screen.queryByTestId('summons-section')).toBeNull();
    expect(screen.queryByText('Lilly')).toBeNull();
    expect(screen.queryByText('Summons')).toBeNull();
  });

  test('section SHOWS when LuciferAI is enabled, Lilly first and locked', async () => {
    setLuciferAi(true);
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() =>
      expect(screen.getByTestId('summons-section')).toBeTruthy(),
    );
    expect(screen.getByText('Lilly')).toBeTruthy();
    expect(
      screen.getByText('Requires Living Golem — coming soon'),
    ).toBeTruthy();
    // The section is its own section, separate from the roster.
    expect(screen.getByRole('heading', { name: 'Summons' })).toBeTruthy();
    expect(
      screen.getByText(/separate from the Homunculi roster/),
    ).toBeTruthy();
  });

  test('silenced does NOT hide the section — silenced is dormant, not off', async () => {
    setLuciferAi(true, true);
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() =>
      expect(screen.getByTestId('summons-section')).toBeTruthy(),
    );
    expect(screen.getByText('Lilly')).toBeTruthy();
  });

  test('section sits after the columns and before Ask the brain', async () => {
    setLuciferAi(true);
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() =>
      expect(screen.getByTestId('summons-section')).toBeTruthy(),
    );
    const section = screen.getByTestId('summons-section');
    const columns = document.querySelector('[data-testid="forge-columns"]');
    const askBrain = screen.getByText('Ask the brain');
    expect(columns).not.toBeNull();
    expect(
      Boolean(
        columns!.compareDocumentPosition(section) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        section.compareDocumentPosition(askBrain) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });
});

describe('Lilly slot — art, sizing, select / activate', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    setLuciferAi(true);
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  async function renderEnabled() {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() =>
      expect(screen.getByTestId('summons-section')).toBeTruthy(),
    );
    return screen.getByTestId('summon-slot-lilly') as HTMLButtonElement;
  }

  test('slot renders the GIF as the animated presentation', async () => {
    const slot = await renderEnabled();
    const img = slot.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain(
      'slave-boss-heart-playing.gif',
    );
    expect(img?.getAttribute('alt')).toBe('Lilly — animated');
  });

  test('GIF failure falls back to the still image', async () => {
    const slot = await renderEnabled();
    const img = slot.querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    expect(img.getAttribute('src')).toContain(
      'slave-boss-with-heart-clean.png',
    );
  });

  test('slot sizing cannot fail — fixed square, no overflow, no distortion', async () => {
    const slot = await renderEnabled();
    const media = screen.getByTestId('summon-media-lilly');
    // Fixed aspect: the box is a square whatever the asset is.
    expect(media.className).toContain('aspect-square');
    // No overflow: the asset cannot spill out of the box.
    expect(media.className).toContain('overflow-hidden');
    const img = slot.querySelector('img') as HTMLImageElement;
    // No distortion: the image keeps its own aspect inside the box.
    expect(img.className).toContain('object-contain');
    // And it fills the box it sits in.
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('w-full');
  });

  test('single click selects Lilly (selection works while locked)', async () => {
    const slot = await renderEnabled();
    fireEvent.click(slot);
    expect(useForgeStore.getState().selectedSummonId).toBe('lilly');
    expect(slot.getAttribute('aria-pressed')).toBe('true');
  });

  test('double-click activation is rejected while locked — nobody is active', async () => {
    const slot = await renderEnabled();
    fireEvent.click(slot);
    fireEvent.doubleClick(slot);
    expect(useForgeStore.getState().activeSummonId).toBeNull();
    expect(useForgeStore.getState().lastError).toMatch(/locked/);
    expect(useForgeStore.getState().lastError).toContain('Lilly');
    // The slot still shows Offline — locked summons are never active.
    expect(slot.textContent).toContain('Offline');
  });

  test('second slot is a locked placeholder — no invented name or art', async () => {
    await renderEnabled();
    const placeholder = screen.getByTestId(
      'summon-slot-second-placeholder',
    );
    expect(placeholder.textContent).toContain('Second summon');
    expect(placeholder.textContent).toContain(
      'Requires Living Golem and higher topology — coming soon',
    );
    // No art invented for it: the section holds exactly one image —
    // Lilly's. The placeholder's media box is empty.
    const images = screen
      .getByTestId('summons-section')
      .querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(placeholder.querySelector('img')).toBeNull();
  });
});

describe('Summons store', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    useForgeStore.getState().resetForTests();
  });

  test('activateSummon rejects an unknown id without changing state', () => {
    useForgeStore.getState().activateSummon('no-such-summon');
    expect(useForgeStore.getState().activeSummonId).toBeNull();
    expect(useForgeStore.getState().lastError).toMatch(/No such summon/);
  });

  test('activateSummon rejects Lilly while locked', () => {
    useForgeStore.getState().activateSummon('lilly');
    expect(useForgeStore.getState().activeSummonId).toBeNull();
    expect(useForgeStore.getState().lastError).toBe(
      'Lilly is locked: Requires Living Golem — coming soon',
    );
  });

  test('requestSummonsScroll bumps the scroll request', () => {
    const store = useForgeStore.getState();
    expect(store.summonsScrollRequest).toBe(0);
    store.requestSummonsScroll();
    expect(useForgeStore.getState().summonsScrollRequest).toBe(1);
    useForgeStore.getState().requestSummonsScroll();
    expect(useForgeStore.getState().summonsScrollRequest).toBe(2);
  });

  test('resetForTests clears the summons state', () => {
    useForgeStore.getState().selectSummon('lilly');
    useForgeStore.getState().requestSummonsScroll();
    useForgeStore.getState().resetForTests();
    const state = useForgeStore.getState();
    expect(state.selectedSummonId).toBeNull();
    expect(state.activeSummonId).toBeNull();
    expect(state.summonsScrollRequest).toBe(0);
  });
});

describe('Top-bar scroll request reaches the Summons section', () => {
  let restore: () => void;
  let scrollSpy: ReturnType<typeof vi.fn>;
  let prevScrollIntoView: unknown;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    setLuciferAi(true);
    // jsdom has no scrollIntoView — stub it on the prototype and
    // watch which element it is called on.
    prevScrollIntoView = (
      Element.prototype as unknown as Record<string, unknown>
    ).scrollIntoView;
    scrollSpy = vi.fn();
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView =
      scrollSpy;
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView =
      prevScrollIntoView;
  });

  test('bumping the request scrolls to the Summons section', async () => {
    restore = installMock([LUCIFER]);
    render(<ForgeView />);
    await waitFor(() =>
      expect(screen.getByTestId('summons-section')).toBeTruthy(),
    );
    // No scroll on mount — the request starts at 0.
    expect(scrollSpy).not.toHaveBeenCalled();
    act(() => {
      useForgeStore.getState().requestSummonsScroll();
    });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    // It scrolled to the section itself, not some other element.
    const section = screen.getByTestId('summons-section');
    expect(scrollSpy.mock.instances[0]).toBe(section);
  });
});
