/**
 * Where dock items are allowed to live (Atom steal #12 —
 * 2026-11-14).
 *
 * Atom's items declare `getAllowedLocations()` /
 * `getDefaultLocation()`; text editors are explicitly NOT
 * allowed in docks (dock.js:808-815). This module is Lucid's
 * version of that gate: the items that exist today and the
 * edges they may sit on. The Dock component and App consult
 * it before placing an item — an item with no allowed edge
 * (the terminal, the editor) belongs in the center, never in
 * a dock.
 *
 * Pure data + helpers — unit-tested, no store, no DOM.
 */
import type { DockEdge } from '../stores/dockStore';

/** The dockable items Lucid has today. */
export type DockItemId = 'ai-panel' | 'sidebar' | 'terminal' | 'editor' | 'git-panel';

/**
 * Which edges each item may sit on. Empty means center-only:
 * the terminal and the editor are never dock items, Atom's
 * rule — a dock holds tools, not the thing being edited.
 */
export const DOCK_ITEM_LOCATIONS: Record<DockItemId, DockEdge[]> = {
  'ai-panel': ['right'],
  sidebar: ['left'],
  terminal: [],
  editor: [],
  // The Git panel (Atom steal #21): bottom dock only.
  'git-panel': ['bottom'],
};

/** True when this item may live on this edge. */
export function isDockLocationAllowed(item: DockItemId, edge: DockEdge): boolean {
  return (DOCK_ITEM_LOCATIONS[item] ?? []).includes(edge);
}

/** The edges an item may live on (a copy — callers must not mutate the registry). */
export function allowedDockLocations(item: DockItemId): DockEdge[] {
  return [...(DOCK_ITEM_LOCATIONS[item] ?? [])];
}
