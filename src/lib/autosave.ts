/**
 * Autosave vetoes (Atom steal #20 — the `autosave` package's
 * `dontSaveIf`, 2026-11-14).
 *
 * Autosave itself is a blur handler in App: when the window
 * loses focus, dirty files save through the existing save
 * path — off by default, because saving something meant to
 * be discarded is worse than a dirty flag. A veto is a
 * predicate other code registers when a save would be wrong
 * right now (a modal open over unsaved work, a transient
 * state); any single veto blocks the save. Registration
 * returns an unregister function. A predicate that throws is
 * treated as a veto — on uncertainty the save does not
 * happen; the user can still save by hand.
 */

const vetoes = new Set<() => boolean>();

/** Register a save veto; returns an unregister function. Test seam: clears all vetoes. */
export function registerDontSaveIf(predicate: () => boolean): () => void {
  vetoes.add(predicate);
  return () => {
    vetoes.delete(predicate);
  };
}

/** True when any registered veto says do not save right now. */
export function autosaveVetoed(): boolean {
  for (const predicate of [...vetoes]) {
    try {
      if (predicate()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Test-only reset. */
export function resetAutosaveVetoesForTests(): void {
  vetoes.clear();
}
