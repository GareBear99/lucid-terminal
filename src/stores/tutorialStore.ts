/**
 * Tutorial state.
 *
 * Which tutorial is open and which step the user is on.
 * `next()` / `previous()` are Atom's `tutorial.next()` in
 * Lucid's shape: they advance a step and clamp at the ends
 * (advancing past the last step stays on it — the viewer
 * shows the step count, so the end is visible). Session-only,
 * in-memory (guest-safe).
 */
import { create } from 'zustand';
import type { Tutorial } from '../lib/tutorials';

interface TutorialStoreState {
  /** The open tutorial, or null (the picker shows instead). */
  tutorial: Tutorial | null;
  /** The current step, 0-based. */
  stepIndex: number;
  /** Open a tutorial at its first step. */
  openTutorial: (tutorial: Tutorial) => void;
  /** Back to the picker (keeps the tutorial open underneath? No — closes it). */
  closeTutorial: () => void;
  /** Advance one step, clamped at the last. */
  nextStep: () => void;
  /** Go back one step, clamped at the first. */
  previousStep: () => void;
  /** Jump to a step, clamped into range. */
  goToStep: (index: number) => void;
  /** Test-only reset. */
  resetForTests: () => void;
}

export const useTutorialStore = create<TutorialStoreState>((set, get) => ({
  tutorial: null,
  stepIndex: 0,

  openTutorial: (tutorial) => set({ tutorial, stepIndex: 0 }),

  closeTutorial: () => set({ tutorial: null, stepIndex: 0 }),

  nextStep: () => {
    const { tutorial, stepIndex } = get();
    if (!tutorial) return;
    set({ stepIndex: Math.min(tutorial.steps.length - 1, stepIndex + 1) });
  },

  previousStep: () => {
    const { stepIndex } = get();
    set({ stepIndex: Math.max(0, stepIndex - 1) });
  },

  goToStep: (index) => {
    const { tutorial } = get();
    if (!tutorial) return;
    set({ stepIndex: Math.min(tutorial.steps.length - 1, Math.max(0, index)) });
  },

  resetForTests: () => set({ tutorial: null, stepIndex: 0 }),
}));
