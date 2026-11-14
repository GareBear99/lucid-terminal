/**
 * The docs-panel cursor bus (Kite mapping #4 — the sidebar
 * pattern — 2026-11-14).
 *
 * Kite's sidebar is a reader of the engine: it shows docs
 * for the symbol under the cursor, fetched on the round trip
 * `loadDocs(language, identifier)` → `SHOW_DOCS` /
 * `LOAD_DOCS_FAILED` (`kiteco-public/sidebar/src/actions/
 * docs.js`). The panel never writes to the file and never
 * touches the stores directly — it receives what the client
 * returns for the cursor's symbol.
 *
 * This bus is the panel's context source: the editor
 * publishes the cursor (file + 1-based Monaco position +
 * the word at the cursor, or null when the cursor sits on
 * whitespace), and the docs panel subscribes. The bus is
 * dumb — it holds one cursor, dedups identical publishes
 * (same file + line + word publishes nothing, so moving
 * within a word is silent), and notifies. Nothing here
 * reads the file store or the session store; the publisher
 * (CodeEditor) owns the editor, the panel owns the
 * subscription.
 *
 * Guest: the cursor is session-only, in memory, like
 * everything else the guest touches — the panel reads the
 * in-memory engine, nothing persists.
 */

/** The cursor, in the editor's own coordinates: Monaco
 *  positions are 1-based (the client speaks 0-based LSP
 *  positions — the panel converts). */
export interface DocsCursor {
  /** The absolute file path. */
  path: string;
  /** 1-based line number. */
  lineNumber: number;
  /** 1-based column. */
  column: number;
  /** The word at the cursor, or null on whitespace. */
  word: string | null;
}

let current: DocsCursor | null = null;
const listeners = new Set<(cursor: DocsCursor | null) => void>();

function same(a: DocsCursor | null, b: DocsCursor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.lineNumber === b.lineNumber &&
    a.column === b.column &&
    a.word === b.word
  );
}

/** Publish a cursor. A publish identical to the current
 *  one notifies nobody — unless `force` is set (the engine
 *  just became ready, and the panel must re-ask even though
 *  the cursor did not move). */
export function publishDocsCursor(
  cursor: DocsCursor | null,
  force = false,
): void {
  if (!force && same(current, cursor)) return;
  current = cursor;
  for (const listener of [...listeners]) {
    try {
      listener(cursor);
    } catch {
      // A failing subscriber must never break the editor
      // that published the cursor.
    }
  }
}

/** Re-notify subscribers with the current cursor, even
 *  when it did not change (the engine just became ready). */
export function republishDocsCursor(): void {
  publishDocsCursor(current, true);
}

/** The last published cursor, or null before the first publish. */
export function getDocsCursor(): DocsCursor | null {
  return current;
}

/** Subscribe to cursor publishes. Returns an unsubscribe. */
export function subscribeDocsCursor(
  listener: (cursor: DocsCursor | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: clear the cursor and the subscribers. */
export function resetDocsCursorForTests(): void {
  current = null;
  listeners.clear();
}
