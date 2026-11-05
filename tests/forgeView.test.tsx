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
import { render, screen, waitFor } from '@testing-library/react';
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
  win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), llmbuilder: mock };
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
    await waitFor(() => expect(screen.getByText('Forge')).toBeTruthy());
    expect(screen.getByText(/toy text completion/)).toBeTruthy();
    expect(screen.getByText(/not conversation/)).toBeTruthy();
  });
});
