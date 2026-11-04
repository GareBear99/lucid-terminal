/**
 * Prompting-pace store tests.
 *
 * The Sentinel face's horns grow with the prompting average and regress
 * when prompting slows. The pace is an exponentially-decayed level: each
 * submitted prompt adds a step, silence decays it toward zero, and a
 * steady pace settles at a stable level (the average nulling out).
 *
 * Run with: npm test
 */

import {
  usePromptPaceStore,
  decayedLevel,
  levelAfterPrompt,
  equilibriumLevel,
  hornScaleForLevel,
  PROMPT_PACE_STEP,
  PROMPT_PACE_TAU_MS,
} from '../src/stores/promptPaceStore';

const HALF_LIFE_MS = PROMPT_PACE_TAU_MS * Math.LN2; // ~166s

function reset(now: number) {
  usePromptPaceStore.setState({ level: 0, lastUpdatedAt: now, promptCount: 0 });
}

describe('decayedLevel', () => {
  test('no elapsed time leaves the level unchanged', () => {
    expect(decayedLevel(0.6, 0)).toBeCloseTo(0.6);
  });

  test('one half-life halves the level', () => {
    expect(decayedLevel(0.8, HALF_LIFE_MS)).toBeCloseTo(0.4, 5);
  });

  test('a long silence regresses the horns to ~nothing', () => {
    expect(decayedLevel(1, 10 * PROMPT_PACE_TAU_MS)).toBeLessThan(0.001);
  });
});

describe('levelAfterPrompt', () => {
  test('adds one step', () => {
    expect(levelAfterPrompt(0.2)).toBeCloseTo(0.2 + PROMPT_PACE_STEP);
  });

  test('never exceeds 1 — horns cannot grow forever', () => {
    expect(levelAfterPrompt(0.95)).toBe(1);
    expect(levelAfterPrompt(1)).toBe(1);
  });
});

describe('equilibriumLevel', () => {
  test('a steady pace settles instead of growing forever (the average nulls out)', () => {
    // 1 prompt/min settles at STEP * (1/60) * TAU = 0.6.
    expect(equilibriumLevel(1)).toBeCloseTo(0.6);
    // 1 prompt every 2 min settles at 0.3.
    expect(equilibriumLevel(0.5)).toBeCloseTo(0.3);
  });

  test('no prompting settles at zero', () => {
    expect(equilibriumLevel(0)).toBe(0);
  });

  test('a very fast steady pace pins at 1', () => {
    expect(equilibriumLevel(10)).toBe(1);
  });
});

describe('hornScaleForLevel', () => {
  test('clamps to 0..1', () => {
    expect(hornScaleForLevel(0.5)).toBe(0.5);
    expect(hornScaleForLevel(-0.5)).toBe(0);
    expect(hornScaleForLevel(1.5)).toBe(1);
  });
});

describe('usePromptPaceStore', () => {
  let now = 1_700_000_000_000;
  let nowSpy: { mockRestore: () => void };

  beforeEach(() => {
    now = 1_700_000_000_000;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    reset(now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('starts with no horns', () => {
    expect(usePromptPaceStore.getState().level).toBe(0);
  });

  test('frequent prompts grow the horns', () => {
    const api = usePromptPaceStore.getState();
    for (let i = 0; i < 7; i++) {
      now += 1000; // one prompt per second
      api.recordPrompt();
    }
    expect(usePromptPaceStore.getState().level).toBe(1);
    expect(usePromptPaceStore.getState().promptCount).toBe(7);
  });

  test('a gap in prompting regresses the horns', () => {
    const api = usePromptPaceStore.getState();
    api.recordPrompt();
    api.recordPrompt();
    expect(usePromptPaceStore.getState().level).toBeCloseTo(0.3);
    // Ten minutes of silence.
    now += 10 * 60 * 1000;
    api.tick();
    expect(usePromptPaceStore.getState().level).toBeLessThan(0.03);
  });

  test('a prompt after a gap decays first, then adds — no free growth', () => {
    const api = usePromptPaceStore.getState();
    api.recordPrompt();
    api.recordPrompt();
    // Ten minutes of silence, then one prompt: decayed ~0.024 + 0.15.
    now += 10 * 60 * 1000;
    api.recordPrompt();
    expect(usePromptPaceStore.getState().level).toBeCloseTo(0.174, 2);
  });

  test('tick is a no-op when the level barely moved', () => {
    const api = usePromptPaceStore.getState();
    api.recordPrompt();
    const before = usePromptPaceStore.getState().lastUpdatedAt;
    now += 1000; // 1s — decay is ~0.0006, under the 0.004 threshold
    api.tick();
    expect(usePromptPaceStore.getState().lastUpdatedAt).toBe(before);
  });

  test('levelNow reads the decayed level without changing state', () => {
    const api = usePromptPaceStore.getState();
    api.recordPrompt();
    now += HALF_LIFE_MS;
    expect(api.levelNow()).toBeCloseTo(PROMPT_PACE_STEP / 2, 5);
    // State itself is untouched by the read.
    expect(usePromptPaceStore.getState().level).toBeCloseTo(PROMPT_PACE_STEP);
  });

  test('persists the pace to localStorage when available', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      const api = usePromptPaceStore.getState();
      api.recordPrompt();
      const raw = store.get('lucid.promptPace');
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.level).toBeCloseTo(PROMPT_PACE_STEP);
      expect(parsed.promptCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
