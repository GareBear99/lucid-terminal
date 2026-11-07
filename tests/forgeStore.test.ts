// @vitest-environment jsdom
/**
 * Forge store tests.
 *
 * Covers: roster seeding from a stored colour (correct key first,
 * misspelled key as fallback), empty state with no colour stored,
 * biography edit persisting, lineage append on promotion, startRun
 * staging the knowledge records, and askBrain refusing with no brain
 * installed.
 *
 * The llmbuilder IPC is mocked by patching window.lucidAPI.llmbuilder
 * in place — never by replacing the whole jsdom window.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  activeHomunculusColor,
  useForgeStore,
} from '../src/stores/forgeStore';
import {
  allowedNewHomunculusColors,
  oppositeHomunculusColor,
} from '../src/lib/homunculusColor';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { Homunculus } from '../src/lib/homunculi';

function seedSettingsColor(value: unknown, misspelled?: unknown) {
  // Always set BOTH keys explicitly — the misspelled key persists on
  // the settings object across tests in this file, and the store's
  // fallback would (correctly) read it if it were left behind.
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      homunculusColor: value as never,
      hommunculusColor: (misspelled ?? null) as never,
    } as never,
  }));
}

function installMock(roster: Homunculus[]) {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const calls = {
    saveRoster: [] as Homunculus[][],
    startRun: [] as Record<string, unknown>[],
  };
  const captured = {
    progress: null as
      | ((event: {
          runId: string;
          stage: string;
          status: string;
          message: string;
        }) => void)
      | null,
  };
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
    startRun: vi.fn(async (params: Record<string, unknown>) => {
      calls.startRun.push(params);
      return {
        runId: 'run-1',
        homunculusId: params.homunculusId,
        candidate: params.candidate,
        tier: params.tier,
        status: 'running',
        startedAt: new Date().toISOString(),
      };
    }),
    cancelRun: vi.fn(async () => ({ ok: true })),
    listRuns: vi.fn(async () => []),
    getScoreboard: vi.fn(async () => []),
    getPromotionDecision: vi.fn(async () => null),
    installBrain: vi.fn(async (homunculusId: string) => ({
      ok: true,
      modelPath: `~/.lucid/models/${homunculusId}.gguf`,
      previousModelPath: null,
    })),
    rollback: vi.fn(async () => ({
      ok: true,
      modelPath: '~/.lucid/models/lucifer.gguf',
      previousModelPath: null,
    })),
    getRoster: vi.fn(async () => [...roster]),
    saveRoster: vi.fn(async (r: Homunculus[]) => {
      calls.saveRoster.push(r);
    }),
    importDataset: vi.fn(async (name: string) => ({
      datasetId: name,
      recordCount: 3,
      domains: ['violin'],
    })),
    askBrain: vi.fn(async () => ({
      answer: 'I am Lucifer.',
      matchedCapabilities: ['self_knowledge'],
      confidence: 'high',
      noMatch: false,
    })),
    onProgress: vi.fn((cb) => {
      captured.progress = cb as never;
      return () => undefined;
    }),
  };
  win.lucidAPI = {
    ...((prevLucidAPI as object) ?? {}),
    llmbuilder: mock,
    // Activation swaps the face by updating the `homunculusColor`
    // setting — the settings IPC needs a stub so updateSetting
    // succeeds (and updates local state) in tests.
    settings: { set: vi.fn(async () => undefined) },
  };
  return {
    mock,
    calls,
    captured,
    restore: () => {
      if (prevLucidAPI === undefined) delete win.lucidAPI;
      else win.lucidAPI = prevLucidAPI;
    },
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

describe('forgeStore roster seeding', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('seeds one Homunculus from the stored colour', async () => {
    const m = installMock([]);
    restore = m.restore;
    seedSettingsColor('pink');
    await useForgeStore.getState().loadRoster();
    const { roster, selectedId } = useForgeStore.getState();
    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe('lucifer');
    expect(roster[0].name).toBe('Lucifer');
    expect(roster[0].color).toBe('pink');
    expect(roster[0].status).toBe('untrained');
    expect(selectedId).toBe('lucifer');
    expect(m.calls.saveRoster).toHaveLength(1);
  });

  test('falls back to the misspelled hommunculusColor key', async () => {
    const m = installMock([]);
    restore = m.restore;
    seedSettingsColor(null, 'purple');
    await useForgeStore.getState().loadRoster();
    expect(useForgeStore.getState().roster[0]?.color).toBe('purple');
  });

  test('no colour stored seeds NOTHING — the roster starts empty', async () => {
    const m = installMock([]);
    restore = m.restore;
    seedSettingsColor(null);
    await useForgeStore.getState().loadRoster();
    expect(useForgeStore.getState().roster).toEqual([]);
    expect(useForgeStore.getState().selectedId).toBeNull();
    expect(m.calls.saveRoster).toHaveLength(0);
  });

  test('a stored roster loads as-is and is not reseeded', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    seedSettingsColor('purple');
    await useForgeStore.getState().loadRoster();
    expect(useForgeStore.getState().roster).toHaveLength(1);
    expect(useForgeStore.getState().roster[0].color).toBe('pink');
    expect(m.calls.saveRoster).toHaveLength(0);
  });
});

describe('forgeStore biography + promotion', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('biography edit persists through saveRoster', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    await useForgeStore.getState().updateBiography('lucifer', {
      name: 'Lucifer',
      biography: {
        character: 'Part siren, part magic succubus.',
        vibe: 'Sharp and warm.',
        persona: 'Direct — I show the work.',
      },
    });
    const h = useForgeStore.getState().roster[0];
    expect(h.biography?.character).toContain('siren');
    expect(h.biography?.vibe).toContain('Sharp');
    expect(m.calls.saveRoster).toHaveLength(1);
    expect(m.calls.saveRoster[0][0].biography?.persona).toContain('Direct');
  });

  test('lineage appends on promotion — and grows on a second promotion', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    const store = useForgeStore.getState();
    await store.applyPromotionDecision('lucifer', {
      candidate: 'lucifer-1',
      decision: 'promote',
      score: 0.72,
      scoreboardRow: null,
      receiptRef: null,
      raw: null,
    });
    let h = useForgeStore.getState().roster[0];
    expect(h.lineage).toHaveLength(1);
    expect(h.lineage[0].candidate).toBe('lucifer-1');
    expect(h.status).toBe('promoted');
    expect(h.incumbentScore).toBe(0.72);
    await useForgeStore.getState().applyPromotionDecision('lucifer', {
      candidate: 'lucifer-2',
      decision: 'promote',
      score: 0.81,
      scoreboardRow: null,
      receiptRef: null,
      raw: null,
    });
    h = useForgeStore.getState().roster[0];
    expect(h.lineage).toHaveLength(2);
    expect(h.lineage[1].candidate).toBe('lucifer-2');
    expect(h.incumbentScore).toBe(0.81);
  });

  test('archive_only grows NO lineage entry', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    await useForgeStore.getState().applyPromotionDecision('lucifer', {
      candidate: 'lucifer-1',
      decision: 'archive_only',
      score: 0.4,
      scoreboardRow: null,
      receiptRef: null,
      raw: null,
    });
    const h = useForgeStore.getState().roster[0];
    expect(h.lineage).toHaveLength(0);
    expect(h.status).toBe('untrained');
  });

  test('startRun stages the knowledge records into the run', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    const runId = await useForgeStore.getState().startRun('lucifer', {
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo-text',
      demoProof: true,
    });
    expect(runId).toBe('run-1');
    expect(m.calls.startRun).toHaveLength(1);
    const params = m.calls.startRun[0];
    expect(params.candidate).toBe('lucifer-1');
    expect(params.demoProof).toBe(true);
    const jsonl = String(params.knowledgeRecordsJsonl);
    const lines = jsonl.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((r) => r.input === 'Who are you?')).toBe(true);
    expect(
      lines.some((r) =>
        String(r.target).includes('biography has not been written yet'),
      ),
    ).toBe(true);
  });

  test('askBrain with no brain installed says so plainly', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    const answer = await useForgeStore.getState().askBrain('lucifer', 'Who are you?');
    expect(answer).toBeNull();
    expect(useForgeStore.getState().askError).toContain('No brain installed');
    expect(m.mock.askBrain).not.toHaveBeenCalled();
  });
});

describe('forgeStore Electron contract', () => {
  let restore: () => void;

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  test('a failed install (ok:false) never renders as installed', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    m.mock.installBrain.mockResolvedValueOnce({
      ok: false,
      error: 'no promoted GGUF found for candidate lucifer-1',
    });
    await useForgeStore.getState().installBrain('lucifer', 'lucifer-1');
    const h = useForgeStore.getState().roster[0];
    expect(h.modelPath).toBeNull();
    expect(h.status).toBe('untrained');
    expect(useForgeStore.getState().lastError).toContain('no promoted GGUF');
    expect(m.calls.saveRoster).toHaveLength(0);
  });

  test('a failed rollback (ok:false) leaves the brain alone', async () => {
    const installed: Homunculus = {
      ...LUCIFER,
      modelPath: '~/.lucid/models/lucifer.gguf',
      status: 'installed',
    };
    const m = installMock([installed]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    m.mock.rollback.mockResolvedValueOnce({
      ok: false,
      error: 'no previous incumbent',
    });
    await useForgeStore.getState().rollback('lucifer');
    const h = useForgeStore.getState().roster[0];
    expect(h.modelPath).toBe('~/.lucid/models/lucifer.gguf');
    expect(h.status).toBe('installed');
    expect(useForgeStore.getState().lastError).toContain('no previous incumbent');
  });

  test('a successful install still lands the brain', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    await useForgeStore.getState().installBrain('lucifer', 'lucifer-1');
    const h = useForgeStore.getState().roster[0];
    expect(h.modelPath).toBe('~/.lucid/models/lucifer.gguf');
    expect(h.status).toBe('installed');
    expect(useForgeStore.getState().lastError).toBeNull();
  });

  test('setup progress (runId setup) lands in setupProgress, not the run', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    useForgeStore.getState().subscribeProgress();
    expect(m.captured.progress).not.toBeNull();
    m.captured.progress!({
      runId: 'setup',
      stage: 'data',
      status: 'running',
      message: 'Installing Forge requirements…',
    });
    expect(useForgeStore.getState().setupProgress).toEqual({
      status: 'running',
      message: 'Installing Forge requirements…',
    });
    expect(useForgeStore.getState().currentRun).toBeNull();
  });

  test('the run verdict comes from the manifest, not the last progress event', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    // The demo-proof shape: every stage completed, but the RUN
    // failed — 17/19 checks. The progress event alone would call
    // this a pass; the manifest says failed.
    m.mock.listRuns.mockResolvedValue([
      {
        runId: 'run-1',
        homunculusId: 'lucifer',
        candidate: 'lucifer-1',
        tier: 'tiny',
        status: 'failed',
        startedAt: new Date().toISOString(),
        decision: 'reject',
        score: 0.7136,
        demoChecks: {
          passed: 17,
          failed: 2,
          total: 19,
          checks: [
            { label: 'SFT export wrote records', ok: false },
            { label: 'Bundles exist', ok: false },
          ],
        },
        error: 'Demo proof: 17/19 checks passed.',
      },
    ]);
    await useForgeStore.getState().startRun('lucifer', {
      tier: 'tiny',
      steps: 20,
      batchSize: 4,
      corpus: 'repo-text',
      demoProof: true,
    });
    expect(useForgeStore.getState().roster[0].status).toBe('training');
    useForgeStore.getState().subscribeProgress();
    m.captured.progress!({
      runId: 'run-1',
      stage: 'promote',
      status: 'completed',
      message: 'Gate v2 decision: reject (weighted score 0.7136)',
    });
    // refreshRunOutcome is async — flush the microtask queue.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const run = useForgeStore.getState().currentRun;
    expect(run?.done).toBe(true);
    expect(run?.outcome?.status).toBe('failed');
    expect(run?.outcome?.decision).toBe('reject');
    expect(run?.outcome?.score).toBe(0.7136);
    expect(run?.outcome?.demoChecks?.passed).toBe(17);
    expect(run?.outcome?.demoChecks?.total).toBe(19);
    // The failed run leaves the Homunculus untrained again.
    expect(useForgeStore.getState().roster[0].status).toBe('untrained');
    expect(m.mock.listRuns).toHaveBeenCalled();
  });

  test('scoreboard .raw is kept on the store', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    await useForgeStore.getState().loadRoster();
    const rows = Object.assign(
      [
        {
          candidate: 'lucifer-1',
          score: 0.71,
          decision: 'promote',
          artifacts: [],
        },
      ],
      { raw: { models: [{ model_name: 'lucifer-1' }] } },
    );
    m.mock.getScoreboard.mockResolvedValue(rows);
    await useForgeStore.getState().loadScoreboard();
    expect(useForgeStore.getState().scoreboard).toHaveLength(1);
    expect(useForgeStore.getState().scoreboardRaw).toEqual({
      models: [{ model_name: 'lucifer-1' }],
    });
  });
});

describe('forgeStore opposite-colour rule (Gary, 2026-11-06)', () => {
  let restore: () => void;

  const PURPLE_ONE: Homunculus = {
    ...LUCIFER,
    id: 'violet',
    name: 'Violet',
    color: 'purple',
  };

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  function setRoster(roster: Homunculus[], selectedId: string | null) {
    useForgeStore.setState({ roster: [...roster], selectedId });
  }

  test('rejects the same colour as the active Homunculus', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    setRoster([LUCIFER], 'lucifer');
    await expect(
      useForgeStore.getState().createHomunculus('Violet', 'pink'),
    ).rejects.toThrow('opposite colour');
    expect(useForgeStore.getState().roster).toHaveLength(1);
    expect(useForgeStore.getState().lastError).toContain('opposite colour');
    expect(m.calls.saveRoster).toHaveLength(0);
  });

  test('allows the opposite colour and selects the new Homunculus', async () => {
    const m = installMock([LUCIFER]);
    restore = m.restore;
    setRoster([LUCIFER], 'lucifer');
    const created = await useForgeStore
      .getState()
      .createHomunculus('Violet', 'purple');
    expect(created.color).toBe('purple');
    expect(useForgeStore.getState().roster).toHaveLength(2);
    expect(useForgeStore.getState().selectedId).toBe('violet');
    expect(m.calls.saveRoster).toHaveLength(1);
  });

  test('free choice when the roster is empty (black / unformed)', async () => {
    const m = installMock([]);
    restore = m.restore;
    setRoster([], null);
    const pink = await useForgeStore
      .getState()
      .createHomunculus('First', 'pink');
    expect(pink.color).toBe('pink');
    // Reset to empty and prove purple is equally allowed as a first.
    setRoster([], null);
    const purple = await useForgeStore
      .getState()
      .createHomunculus('First', 'purple');
    expect(purple.color).toBe('purple');
    expect(m.calls.saveRoster).toHaveLength(2);
  });

  test('roster[0] is the active colour when nothing is selected', async () => {
    const m = installMock([PURPLE_ONE]);
    restore = m.restore;
    setRoster([PURPLE_ONE], null);
    await expect(
      useForgeStore.getState().createHomunculus('Second', 'purple'),
    ).rejects.toThrow('opposite colour');
    const created = await useForgeStore
      .getState()
      .createHomunculus('Second', 'pink');
    expect(created.color).toBe('pink');
    expect(useForgeStore.getState().roster).toHaveLength(2);
  });

  test('colours alternate across creations', async () => {
    const m = installMock([]);
    restore = m.restore;
    setRoster([], null);
    await useForgeStore.getState().createHomunculus('A', 'purple');
    await expect(
      useForgeStore.getState().createHomunculus('B', 'purple'),
    ).rejects.toThrow('opposite colour');
    await useForgeStore.getState().createHomunculus('B', 'pink');
    await expect(
      useForgeStore.getState().createHomunculus('C', 'pink'),
    ).rejects.toThrow('opposite colour');
    // The pair is formed — dual unison is unlocked — so the STOP
    // blocks more singles until the first stop action is input.
    await expect(
      useForgeStore.getState().createHomunculus('C', 'purple'),
    ).rejects.toThrow('first stop action');
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 3,
    });
    await useForgeStore.getState().createHomunculus('C', 'purple');
    expect(
      useForgeStore.getState().roster.map((h) => h.color),
    ).toEqual(['purple', 'pink', 'purple']);
    expect(m.calls.saveRoster).toHaveLength(3);
  });

  test('activeHomunculusColor: selected wins, else roster[0], else null', () => {
    expect(activeHomunculusColor([LUCIFER, PURPLE_ONE], 'violet')).toBe(
      'purple',
    );
    expect(activeHomunculusColor([LUCIFER, PURPLE_ONE], 'lucifer')).toBe(
      'pink',
    );
    expect(activeHomunculusColor([PURPLE_ONE], null)).toBe('purple');
    expect(activeHomunculusColor([], null)).toBeNull();
  });

  test('opposite / allowed colours: null means free choice', () => {
    expect(oppositeHomunculusColor('pink')).toBe('purple');
    expect(oppositeHomunculusColor('purple')).toBe('pink');
    expect(allowedNewHomunculusColors(null)).toEqual(['purple', 'pink']);
    expect(allowedNewHomunculusColors('pink')).toEqual(['purple']);
    expect(allowedNewHomunculusColors('purple')).toEqual(['pink']);
  });
});

describe('forgeStore dual unison (Gary, 2026-11-06)', () => {
  let restore: () => void;

  const PURPLE_ONE: Homunculus = {
    ...LUCIFER,
    id: 'violet',
    name: 'Violet',
    color: 'purple',
  };

  beforeEach(() => {
    useForgeStore.getState().resetForTests();
  });

  afterEach(() => {
    restore?.();
    useForgeStore.getState().resetForTests();
  });

  function setRoster(roster: Homunculus[], selectedId: string | null) {
    useForgeStore.setState({ roster: [...roster], selectedId });
  }

  /** The pair (pink + purple) in the roster — dual unison detected. */
  function setPair() {
    setRoster([LUCIFER, PURPLE_ONE], 'lucifer');
  }

  /** Walk the stop action all the way to detected. */
  function unlockTail() {
    const s = useForgeStore.getState();
    s.inputStopAction('#ef4444', { kind: 'seconds', seconds: 3 });
    s.verifyStopAction();
    s.detectStopAction();
  }

  test('the STOP blocks a third single until the first stop action is input', async () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    // The active Homunculus is pink (lucifer), so the third single
    // must be purple to pass the opposite-colour rule — and then it
    // hits the STOP instead.
    await expect(
      useForgeStore.getState().createHomunculus('Third', 'purple'),
    ).rejects.toThrow('first stop action');
    expect(useForgeStore.getState().roster).toHaveLength(2);
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 3,
    });
    const created = await useForgeStore
      .getState()
      .createHomunculus('Third', 'purple');
    expect(created.color).toBe('purple');
    expect(useForgeStore.getState().roster).toHaveLength(3);
    expect(m.calls.saveRoster).toHaveLength(1);
  });

  test('inputStopAction rejects without the pair, twice, or with a bad setup', () => {
    const m = installMock([]);
    restore = m.restore;
    setRoster([LUCIFER], 'lucifer');
    expect(() =>
      useForgeStore.getState().inputStopAction('#ef4444', {
        kind: 'seconds',
        seconds: 3,
      }),
    ).toThrow('not unlocked yet');
    setPair();
    expect(() =>
      useForgeStore.getState().inputStopAction('', {
        kind: 'seconds',
        seconds: 3,
      }),
    ).toThrow('Assign a colour');
    expect(() =>
      useForgeStore.getState().inputStopAction('#ef4444', {
        kind: 'seconds',
        seconds: 0,
      }),
    ).toThrow('1–9 seconds');
    expect(() =>
      useForgeStore.getState().inputStopAction('#ef4444', {
        kind: 'seconds',
        seconds: 10,
      }),
    ).toThrow('1–9 seconds');
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 3,
    });
    expect(() =>
      useForgeStore.getState().inputStopAction('#f97316', {
        kind: 'until-next-action',
      }),
    ).toThrow('already been input');
    expect(useForgeStore.getState().unison.stopAction).toBe('input');
    expect(useForgeStore.getState().unison.stopColor).toBe('#ef4444');
  });

  test('verify then detect, in order — the tail page unlocks only at detected', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    expect(() => useForgeStore.getState().verifyStopAction()).toThrow(
      'input the first stop action',
    );
    expect(() => useForgeStore.getState().detectStopAction()).toThrow(
      'verify the stop action',
    );
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'until-next-action',
    });
    expect(() => useForgeStore.getState().detectStopAction()).toThrow(
      'verify the stop action',
    );
    useForgeStore.getState().verifyStopAction();
    expect(useForgeStore.getState().unison.stopAction).toBe('verified');
    useForgeStore.getState().detectStopAction();
    expect(useForgeStore.getState().unison.stopAction).toBe('detected');
    expect(() => useForgeStore.getState().verifyStopAction()).toThrow(
      'input the first stop action',
    );
  });

  test('hitStop colours the action face; regress returns it to the solid', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    expect(() => useForgeStore.getState().hitStop()).toThrow(
      'No stop to hit',
    );
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'until-next-action',
    });
    useForgeStore.getState().hitStop();
    expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(true);
    useForgeStore.getState().regressStopFaceColor();
    expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(false);
  });

  test('a seconds stop colour expires and regresses on its own', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 2,
    });
    vi.useFakeTimers();
    try {
      useForgeStore.getState().hitStop();
      expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(true);
      vi.advanceTimersByTime(1999);
      expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(true);
      vi.advanceTimersByTime(1);
      expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an until-next-action stop colour clears on the next action', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'until-next-action',
    });
    useForgeStore.getState().hitStop();
    expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(true);
    // Activating a Homunculus IS an action — the colour clears.
    useForgeStore.getState().activateHomunculus('violet');
    expect(useForgeStore.getState().unison.stopFaceColorActive).toBe(false);
  });

  test('an action message is assigned to the stop from the face', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    expect(() =>
      useForgeStore.getState().assignStopActionMessage('held the line'),
    ).toThrow('Input the first stop action');
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 3,
    });
    expect(() =>
      useForgeStore.getState().assignStopActionMessage('   '),
    ).toThrow('empty');
    useForgeStore.getState().assignStopActionMessage('held the line');
    expect(useForgeStore.getState().unison.stopMessage).toBe('held the line');
  });

  test('rootUnitedAction needs the tail page fully unlocked, then appends', async () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    expect(() =>
      useForgeStore.getState().rootUnitedAction('did the thing'),
    ).toThrow('not fully unlocked');
    useForgeStore.getState().inputStopAction('#ef4444', {
      kind: 'seconds',
      seconds: 3,
    });
    expect(() =>
      useForgeStore.getState().rootUnitedAction('did the thing'),
    ).toThrow('not fully unlocked');
    // The stop action was already input above — verify and detect it
    // (unlockTail() would input it again).
    useForgeStore.getState().verifyStopAction();
    useForgeStore.getState().detectStopAction();
    useForgeStore.getState().rootUnitedAction('first united action');
    useForgeStore.getState().rootUnitedAction('second united action');
    const { tail } = useForgeStore.getState().unison;
    expect(tail).toHaveLength(2);
    expect(tail[0].tick).toBe(1);
    expect(tail[1].tick).toBe(2);
    expect(tail[0].action).toBe('first united action');
    expect(tail[1].prevHash).toBe(tail[0].hash);
    expect(tail[1].action).toBe('second united action');
    expect(() => useForgeStore.getState().rootUnitedAction('   ')).toThrow(
      'empty',
    );
  });

  test('tri unison is acquirable with dual unison, and only then', () => {
    const m = installMock([]);
    restore = m.restore;
    setRoster([LUCIFER], 'lucifer');
    expect(() => useForgeStore.getState().acquireTriUnison()).toThrow(
      'not acquirable',
    );
    setPair();
    useForgeStore.getState().acquireTriUnison();
    expect(useForgeStore.getState().unison.triUnisonAcquired).toBe(true);
  });

  test('activateHomunculus swaps the face and validates a solid', async () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    useForgeStore.getState().activateHomunculus('violet');
    expect(useForgeStore.getState().selectedId).toBe('violet');
    // The face swaps: the `homunculusColor` setting becomes purple.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      useSettingsStore.getState().settings?.homunculusColor,
    ).toBe('purple');
    const { solidFace, faceTick } = useForgeStore.getState().unison;
    expect(faceTick).toBe(1);
    expect(solidFace).toEqual({ tick: 1, color: 'purple' });
    // A second activation validates a newer solid, at a higher tick.
    useForgeStore.getState().activateHomunculus('lucifer');
    expect(useForgeStore.getState().unison.faceTick).toBe(2);
    expect(useForgeStore.getState().unison.solidFace).toEqual({
      tick: 2,
      color: 'pink',
    });
  });

  test('activateHomunculus refuses an unknown id', () => {
    const m = installMock([]);
    restore = m.restore;
    setPair();
    useForgeStore.getState().activateHomunculus('nope');
    expect(useForgeStore.getState().lastError).toContain('No such Homunculus');
    expect(useForgeStore.getState().selectedId).toBe('lucifer');
  });
});
