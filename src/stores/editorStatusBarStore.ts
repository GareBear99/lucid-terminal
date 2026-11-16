/**
 * The editor status bar tile registry.
 *
 * Atom's status bar is an extension point: any package calls
 * `statusBar.addLeftTile({item, priority})` / `addRightTile(...)`
 * and gets a `Tile` whose `destroy()` removes it. This store is
 * Lucid's version of that service: `registerTile` takes a tile
 * descriptor and returns an unregister function (the Tile's
 * destroy). Tiles render in priority order (lower first), ties
 * broken by registration order — Atom's priority-ordered
 * insertion. The bar component subscribes and renders both
 * sides; the core tiles register themselves from the bar, and
 * future tiles (the brain-alive tile) register
 * from wherever they live.
 *
 * A tile's `render` is a function returning a React node, stored
 * in the store like the docs-panel request bus stores its
 * callbacks — the tile component itself subscribes to whatever
 * data it shows, so it updates independently of the bar.
 */
import { create } from 'zustand';
import type { ReactNode } from 'react';

export type StatusBarSide = 'left' | 'right';

export interface StatusBarTile {
  /** Stable id — re-registering the same id replaces the tile. */
  id: string;
  /** Which side of the bar the tile sits on. */
  side: StatusBarSide;
  /** Lower renders first (further left on the left side). */
  priority: number;
  /** Render the tile's content. */
  render: () => ReactNode;
}

interface EditorStatusBarState {
  tiles: StatusBarTile[];
  /**
   * Register a tile (replacing any tile with the same id) and
   * get back an unregister function — the Tile's destroy().
   */
  registerTile: (tile: StatusBarTile) => () => void;
  /** Remove a tile by id. */
  unregisterTile: (id: string) => void;
  /** Test-only reset: clears tiles and the sequence counter. */
  resetForTests: () => void;
}

let sequence = 0;
const sequenceById = new Map<string, number>();

export const useEditorStatusBarStore = create<EditorStatusBarState>((set, get) => ({
  tiles: [],

  registerTile: (tile) => {
    sequence += 1;
    sequenceById.set(tile.id, sequence);
    set((state) => ({
      tiles: [...state.tiles.filter((t) => t.id !== tile.id), tile],
    }));
    return () => get().unregisterTile(tile.id);
  },

  unregisterTile: (id) => {
    sequenceById.delete(id);
    set((state) => ({ tiles: state.tiles.filter((t) => t.id !== id) }));
  },

  resetForTests: () => {
    sequence = 0;
    sequenceById.clear();
    set({ tiles: [] });
  },
}));

/**
 * A side's tiles in render order: priority ascending, ties by
 * registration order. Pure, so it is unit-testable.
 */
export function sortedTiles(tiles: StatusBarTile[], side: StatusBarSide): StatusBarTile[] {
  return tiles
    .filter((t) => t.side === side)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (sequenceById.get(a.id) ?? 0) - (sequenceById.get(b.id) ?? 0);
    });
}
