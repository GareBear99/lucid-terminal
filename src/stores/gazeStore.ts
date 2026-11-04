import { create } from 'zustand';
import type { FollowCursor } from '../components/Synth/gaze';

/**
 * Gaze attention — a point the Sentinel face's eyes should look at for
 * a beat, set by an action (submitting a prompt looks at the prompt
 * input) and expiring on its own. The face reads it alongside the
 * pointer, the glow anchors, and its idle wander, in that priority.
 *
 * Ephemeral UI state: a point in client pixels plus the timestamp after
 * which it no longer applies. The face treats an expired attention as
 * absent — it never needs to be cleared explicitly.
 */

/** How long the eyes hold on an action's target before looking away. */
export const ATTENTION_DURATION_MS = 1500;

export interface GazeAttention {
  x: number;
  y: number;
  /** Epoch ms after which this attention no longer applies. */
  until: number;
}

interface GazeState {
  attention: GazeAttention | null;
  setAttention: (x: number, y: number, durationMs?: number) => void;
  clearAttention: () => void;
}

export const useGazeStore = create<GazeState>((set) => ({
  attention: null,

  setAttention: (x, y, durationMs = ATTENTION_DURATION_MS) =>
    set({ attention: { x, y, until: Date.now() + durationMs } }),

  clearAttention: () => set({ attention: null }),
}));

/** True while an attention is set and has not yet expired. */
export function isAttentionActive(
  attention: GazeAttention | null,
  now: number = Date.now(),
): boolean {
  return attention !== null && now < attention.until;
}

// --- Cursor registry (the follow target) -------------------------------
// The eyes follow a CURSOR — today the user's pointer, later any
// agent's cursor too. This registry is deliberately NOT reactive
// state: cursors move every frame, and every move must not re-render
// subscribers. The face reads it inside its own rAF-throttled gaze
// update. Each cursor is keyed by owner id ('user' today, an agent id
// later); `pickFollowTarget` in gaze.ts picks the most recently moved
// fresh one, so the eyes follow whichever cursor is acting and never
// two at once. To add an agent's cursor later, call setCursor with
// that agent's id — no other change is needed.
const cursorRegistry = new Map<string, FollowCursor>();

/** Record a cursor's latest position. Owner id is 'user' today. */
export function setCursor(id: string, x: number, y: number, at: number = Date.now()): void {
  cursorRegistry.set(id, { id, x, y, at });
}

/** All registered cursors (a fresh array each call). */
export function getCursors(): FollowCursor[] {
  return [...cursorRegistry.values()];
}

/** Forget a cursor (e.g. an agent that stopped moving / left). */
export function removeCursor(id: string): void {
  cursorRegistry.delete(id);
}
