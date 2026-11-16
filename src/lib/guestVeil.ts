/**
 * The guest veil, persisted across renderers.
 *
 * The guest veil (Gary, 2026-11-12 ~17:59 PST: no saved data in
 * any guest build) used to live only in each renderer's memory:
 * `guestSessionActive` in each store. Every renderer that booted
 * AFTER the guest session started veiled correctly — App's boot
 * init runs applyPersistedGuestVeil() first — but a renderer that
 * was ALREADY OPEN when the guest session started (a detached
 * terminal window) never learned about it: it kept showing the
 * owner's history, and — its veil flag false — its flushes wrote
 * the guest's own commands over the owner's persisted history.
 * That is the "guest History persisting its own commands"
 * hole: not the single-window flow (guarded), the second window.
 *
 * The fix: the veil is a persisted fact, not a per-renderer
 * memory. Entering a guest session writes this key; exiting
 * removes it. Every veiled store reads it at boot (a renderer
 * booting into a live guest session starts veiled) and listens
 * for `storage` events on it (a renderer open when the veil
 * changes veils/unveils live). Storage events fire only in
 * OTHER documents, so a window never re-enters its own veil.
 *
 * The value is the literal '1'; absence means unveiled. Never
 * throws; private mode just means no cross-window sync.
 */

export const GUEST_VEIL_STORAGE_KEY = 'lucid-guest-veil-v1';

/** Is a guest session veiled in right now (any renderer)? */
export function isGuestVeilPersisted(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(GUEST_VEIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record (or clear) the persisted veil. Called by each veiled
 *  store's enter/exit — idempotent, never throws. */
export function setGuestVeilPersisted(veiled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (veiled) {
      localStorage.setItem(GUEST_VEIL_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(GUEST_VEIL_STORAGE_KEY);
    }
  } catch {
    // Private mode / quota: the veil stays per-renderer.
  }
}
