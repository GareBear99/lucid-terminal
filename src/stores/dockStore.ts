/**
 * Docks (Atom steal #12 — 2026-11-14).
 *
 * Atom has three Docks (left, right, bottom), each wrapping a
 * full PaneContainer, rendered as a mask that animates 0↔N px,
 * with a hover-revealed chevron toggle at the window edge, a
 * resize handle, and drag-in/drop-target behaviour. A dock
 * auto-hides when its last item is removed, auto-shows when a
 * pane inside is activated, and returns focus to the center
 * when hidden while focused.
 *
 * Lucid's shape: this store owns the three docks' visibility
 * + pixel size; the Dock component (components/Layout/Dock)
 * renders one edge. The first dock item is the AI panel on
 * the right — it used to be a useState boolean + width in
 * App, with its own inline resize handle; it now rides the
 * dock store, so its toggle, size and chevron live in one
 * place. The left dock is reserved for the sidebar (its
 * allowed location — see dockLocations.ts) but the Sidebar
 * keeps its own chrome this slice; the bottom dock has no
 * content yet. Both exist in the store, ready to take items.
 *
 * Sizes follow Atom's numbers: MINIMUM_SIZE 100,
 * DEFAULT_INITIAL_SIZE 300 (the AI panel keeps its existing
 * 500 default, so its look does not change). The store clamps
 * to [100, 1200] as a sanity cap; the component clamps to its
 * container while dragging. Layout is session-only — nothing
 * here is persisted (workspace persistence is steal #14).
 */
import { create } from 'zustand';

export type DockEdge = 'left' | 'right' | 'bottom';

/** Atom's dock.js MINIMUM_SIZE. */
export const DOCK_MIN_SIZE = 100;
/** Atom's dock.js DEFAULT_INITIAL_SIZE. */
export const DOCK_DEFAULT_SIZE = 300;
/** The open/close mask animation, in ms (the Dock component's transition). */
export const DOCK_ANIMATION_MS = 150;
/** Sanity cap on a dock's size (the component clamps tighter, to its container). */
export const DOCK_MAX_SIZE = 1200;

export interface DockState {
  /** Whether the dock is showing. */
  visible: boolean;
  /** The dock's size in px (width for left/right, height for bottom). */
  size: number;
}

interface DockStoreState {
  docks: Record<DockEdge, DockState>;
  /** Show a dock. */
  showDock: (edge: DockEdge) => void;
  /** Hide a dock. */
  hideDock: (edge: DockEdge) => void;
  /** Flip a dock's visibility. */
  toggleDock: (edge: DockEdge) => void;
  /** Set a dock's size, clamped to [DOCK_MIN_SIZE, DOCK_MAX_SIZE]. */
  setDockSize: (edge: DockEdge, size: number) => void;
  /** Test-only reset: restores the initial dock states. */
  resetForTests: () => void;
}

export function clampDockSize(size: number): number {
  // NaN is the only true "no value" — it falls back to the
  // default; infinities clamp to the bounds like any number.
  if (Number.isNaN(size)) return DOCK_DEFAULT_SIZE;
  return Math.min(DOCK_MAX_SIZE, Math.max(DOCK_MIN_SIZE, Math.round(size)));
}

const initialDocks: Record<DockEdge, DockState> = {
  // The sidebar's allowed edge — no content rides it yet.
  left: { visible: false, size: DOCK_DEFAULT_SIZE },
  // The AI panel lives here; 500 keeps its existing default width.
  right: { visible: false, size: 500 },
  bottom: { visible: false, size: DOCK_DEFAULT_SIZE },
};

export const useDockStore = create<DockStoreState>((set) => ({
  docks: initialDocks,

  showDock: (edge) =>
    set((state) => ({ docks: { ...state.docks, [edge]: { ...state.docks[edge], visible: true } } })),

  hideDock: (edge) =>
    set((state) => ({ docks: { ...state.docks, [edge]: { ...state.docks[edge], visible: false } } })),

  toggleDock: (edge) =>
    set((state) => ({
      docks: { ...state.docks, [edge]: { ...state.docks[edge], visible: !state.docks[edge].visible } },
    })),

  setDockSize: (edge, size) =>
    set((state) => ({
      docks: { ...state.docks, [edge]: { ...state.docks[edge], size: clampDockSize(size) } },
    })),

  resetForTests: () => set({ docks: initialDocks }),
}));
