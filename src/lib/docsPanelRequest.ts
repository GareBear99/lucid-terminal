/**
 * The docs-panel open request (Atom steal #7 — 2026-11-14).
 *
 * The hover's `Docs` link must open the docs panel — but the
 * panel's active/collapsed state lives in the Sidebar's local
 * state, not a store. This bus is the same pattern as the
 * docs-cursor bus (`src/lib/docsCursor.ts`): the hover's link
 * opener requests the panel, the Sidebar subscribes and shows
 * it (switching to 'docs' and un-collapsing it). The cursor
 * itself is published on the docs-cursor bus, so the panel
 * shows the hovered symbol, not whatever the cursor was on.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Ask the Sidebar to show the docs panel. */
export function requestDocsPanel(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must never break the requester.
    }
  }
}

/** Subscribe to docs-panel open requests. Returns an unsubscribe. */
export function subscribeDocsPanelRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: clear the subscribers. */
export function resetDocsPanelRequestForTests(): void {
  listeners.clear();
}
