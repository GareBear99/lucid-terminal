import { create } from 'zustand';

/**
 * Prompting pace — the Sentinel face's horns grow and regress with it.
 *
 * The horns are driven by a moving average of how often the user prompts
 * (Gary, 2026-11-04): they grow over time the more often you prompt, and
 * regress when the prompting average is not being kept up. The average
 * always averages out — a steady pace settles at a stable horn length
 * instead of growing forever, and a lull lets the horns shrink back.
 *
 * Model: an exponentially-decayed "horn charge", which is an EWMA of the
 * prompting rate. Each submitted prompt adds a fixed step to the level;
 * between prompts the level decays exponentially toward zero. At a steady
 * rate of r prompts per second the level settles at STEP * r * TAU (the
 * equilibrium — the average nulling out), a burst pushes it up, and a
 * gap lets it fall. The level is clamped to [0, 1].
 *
 * - STEP 0.15: ~7 rapid prompts to full horns.
 * - TAU 240s: half-life ~2.8 min — a few minutes of silence regresses
 *   the horns most of the way back to nothing.
 *
 * The level and its timestamp are persisted in localStorage (same
 * pattern as fileStore's recentWorkspaces), so the horns survive a
 * reload — decayed by however long the app was closed. All storage
 * access is guarded: a denied/unavailable store just means the horns
 * start at zero.
 */

export const PROMPT_PACE_STEP = 0.15;
export const PROMPT_PACE_TAU_MS = 240_000;
export const PROMPT_PACE_MAX = 1;
const STORAGE_KEY = 'lucid.promptPace';

/** Exponential decay of a level over `elapsedMs` (pure). */
export function decayedLevel(level: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return level;
  return level * Math.exp(-elapsedMs / PROMPT_PACE_TAU_MS);
}

/** Level after one submitted prompt, from a (already decayed) level. */
export function levelAfterPrompt(level: number): number {
  return Math.min(PROMPT_PACE_MAX, level + PROMPT_PACE_STEP);
}

/**
 * Where the level settles at a steady pace of `promptsPerMinute` — the
 * average nulling out. E.g. 1 prompt/min settles at 0.6, 1 prompt every
 * 2 min settles at 0.3, and anything above ~1.7 prompts/min pins at 1.
 */
export function equilibriumLevel(promptsPerMinute: number): number {
  const tauSeconds = PROMPT_PACE_TAU_MS / 1000;
  return Math.min(PROMPT_PACE_MAX, PROMPT_PACE_STEP * (promptsPerMinute / 60) * tauSeconds);
}

/** Horn scale for a level — the horns are the level, 0 (none) to 1 (full). */
export function hornScaleForLevel(level: number): number {
  return Math.max(0, Math.min(PROMPT_PACE_MAX, level));
}

interface StoredPace {
  level: number;
  lastUpdatedAt: number;
  promptCount: number;
}

function loadStored(): StoredPace {
  const fallback: StoredPace = { level: 0, lastUpdatedAt: Date.now(), promptCount: 0 };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredPace>;
    if (typeof parsed.level !== 'number' || typeof parsed.lastUpdatedAt !== 'number') {
      return fallback;
    }
    // Decay by however long the app was closed — away for hours means
    // the horns are gone when you come back.
    return {
      level: decayedLevel(Math.max(0, Math.min(1, parsed.level)), Date.now() - parsed.lastUpdatedAt),
      lastUpdatedAt: Date.now(),
      promptCount: typeof parsed.promptCount === 'number' ? parsed.promptCount : 0,
    };
  } catch {
    return fallback;
  }
}

function saveStored(pace: StoredPace): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pace));
  } catch {
    // Storage denied/unavailable — the horns just start at zero next time.
  }
}

interface PromptPaceState {
  /** Horn level, decayed to `lastUpdatedAt`. */
  level: number;
  /** When `level` was last decayed/recorded. */
  lastUpdatedAt: number;
  /** Total prompts recorded (all time, for debugging). */
  promptCount: number;
  /** Record one submitted prompt: decay to now, add the step, persist. */
  recordPrompt: () => void;
  /** Decay to now and re-render if the level moved visibly. Called on a
   *  slow tick while the face is mounted, so idle horns regress. */
  tick: () => void;
  /** Current level, decayed to right now (read-only, no state change). */
  levelNow: () => number;
}

export const usePromptPaceStore = create<PromptPaceState>((set, get) => {
  const stored = loadStored();
  return {
    level: stored.level,
    lastUpdatedAt: stored.lastUpdatedAt,
    promptCount: stored.promptCount,

    recordPrompt: () => {
      const now = Date.now();
      const state = get();
      const level = levelAfterPrompt(decayedLevel(state.level, now - state.lastUpdatedAt));
      const next = { level, lastUpdatedAt: now, promptCount: state.promptCount + 1 };
      saveStored(next);
      set(next);
    },

    tick: () => {
      const now = Date.now();
      const state = get();
      const level = decayedLevel(state.level, now - state.lastUpdatedAt);
      // Only re-render when the horns visibly moved — a 5s tick would
      // otherwise churn subscribers forever.
      if (Math.abs(level - state.level) < 0.004) return;
      set({ level, lastUpdatedAt: now });
    },

    levelNow: () => {
      const state = get();
      return decayedLevel(state.level, Date.now() - state.lastUpdatedAt);
    },
  };
});
