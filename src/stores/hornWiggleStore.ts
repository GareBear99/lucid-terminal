import { create } from 'zustand';

/**
 * Horn wiggle — a one-shot "task complete" celebration for the
 * Sentinel face's horns.
 *
 * When a task completes (an AI-chat generation finishes, a terminal
 * command finishes), the horns wiggle inward a bit: each horn rotates
 * a few degrees toward the centre of the face and back, ~450ms total.
 * The trigger is a sequence number: `wiggle()` bumps it, and the face
 * runs the `sentinel-horn-wiggle` keyframe once per bump. A 500ms
 * debounce collapses double-fires for the same task (e.g.
 * completeStream followed by setLoading(false)) into a single wiggle.
 *
 * The wiggle never changes the horn length or the prompting pace —
 * it is an extra rotation on top of the pace scale, in the face only.
 */

/** Minimum gap between wiggles — same-task double-fires collapse. */
export const WIGGLE_DEBOUNCE_MS = 500;

/** How long one wiggle lasts (matches the CSS keyframe). */
export const WIGGLE_DURATION_MS = 450;

interface HornWiggleState {
  /** Bumps once per completed task; the face animates once per bump. */
  seq: number;
  lastWiggleAt: number;
  wiggle: () => void;
}

export const useHornWiggleStore = create<HornWiggleState>((set, get) => ({
  seq: 0,
  lastWiggleAt: 0,

  wiggle: () => {
    const now = Date.now();
    if (now - get().lastWiggleAt < WIGGLE_DEBOUNCE_MS) return;
    set((s) => ({ seq: s.seq + 1, lastWiggleAt: now }));
  },
}));
