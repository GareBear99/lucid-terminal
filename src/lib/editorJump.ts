/**
 * The editor-jump bus (Atom steal #8 — 2026-11-14).
 *
 * Go-to-symbol, go-to-line and the fuzzy finder's `:line`
 * suffix all need the same thing: put the editor on a file,
 * line and column and centre it. Atom does it with
 * `setCursorBufferPosition` + `scrollToBufferPosition`
 * (centre). Lucid's shape is a bus like the docs-cursor bus
 * (`src/lib/docsCursor.ts`): a modal requests a jump, the
 * editor (CodeEditor) consumes it.
 *
 * The request is *sticky*: the editor view is only mounted
 * while it is the current view, so a jump requested from the
 * terminal view would be missed if the bus only notified.
 * The latest request stays pending until the editor consumes
 * it on mount / on active-file change — then it clears. A
 * newer request replaces an older unconsumed one.
 */

export interface EditorJump {
  /** The absolute file path to open (or the active file). */
  path: string;
  /** 1-based line number. */
  lineNumber: number;
  /** 1-based column (1 = start of line). */
  column: number;
}

let pending: EditorJump | null = null;
const listeners = new Set<(jump: EditorJump) => void>();

/** Request a jump. Replaces any unconsumed pending request. */
export function requestEditorJump(jump: EditorJump): void {
  pending = { ...jump };
  for (const listener of [...listeners]) {
    try {
      listener({ ...jump });
    } catch {
      // A failing subscriber must never break the requester.
    }
  }
}

/** The pending jump, or null when none is waiting. */
export function getPendingEditorJump(): EditorJump | null {
  return pending ? { ...pending } : null;
}

/** Take the pending jump (clearing it), or null. */
export function consumePendingEditorJump(): EditorJump | null {
  const jump = pending;
  pending = null;
  return jump;
}

/** Subscribe to jump requests. Returns an unsubscribe. */
export function subscribeEditorJump(
  listener: (jump: EditorJump) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: clear the pending jump and the subscribers. */
export function resetEditorJumpForTests(): void {
  pending = null;
  listeners.clear();
}
