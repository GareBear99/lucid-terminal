/**
 * Monaco completion provider for the Files editor (steal #2 —
 * 2026-11-14). The adapter between the live tree-sitter structure
 * (src/lib/treeSitter.ts) and Monaco's `registerCompletionItemProvider`
 * API: at the cursor, offer the identifiers the tree says are in
 * scope — the enclosing function's parameters and locals, the
 * file's top-level definitions, and its imports.
 *
 * Contract (from the steal research — the Monaco completion API is
 * the deterministic counterpart to the ghost: only real in-scope
 * symbols, never an invented name):
 *   - provideCompletionItems returns items for the word at the
 *     cursor, or an empty list — never an error, never a throw.
 *     A dead engine returns no items (Kite's failure mode).
 *   - the range is the current word, so accepting replaces exactly
 *     what was typed; the items are sorted by the structure's own
 *     order (nearest scope first), not re-sorted by Monaco.
 *   - `triggerCharacters` is empty: the provider answers the
 *     suggest widget's own invocation (Ctrl+Space / typing), it
 *     does not pop up on every `.` — the editor already has
 *     Monaco's own suggestions, and this provider is the
 *     structure-aware one, not a replacement for them.
 *
 * At most one provider per Monaco instance per language: the
 * editor remounts when the file changes (and React StrictMode
 * double-mounts in dev), and a stale provider would offer for a
 * dead editor. A new registration disposes the previous one for
 * the same monaco + language. Guarded: a monaco without
 * `languages` (the test stubs) registers nothing and the returned
 * dispose is a no-op, so the mount never fails on it.
 */

export interface EditorStructureProviderOptions {
  /** Identifiers in scope at a Monaco position in the active
   *  file, nearest first. Read at request time, so the provider
   *  always sees the current tree. */
  getIdentifiersAtPosition: (lineNumber: number, column: number) => string[];
}

type MonacoLike = {
  languages?: {
    CompletionItemKind?: { Variable: number; Function: number; Class: number };
    registerCompletionItemProvider: (
      languageSelector: string,
      provider: Record<string, unknown>,
    ) => { dispose: () => void };
  };
};

const registrations = new WeakMap<object, Map<string, () => void>>();

export function registerEditorStructureCompletions(
  monaco: MonacoLike,
  languageId: string,
  opts: EditorStructureProviderOptions,
): () => void {
  const languages = monaco?.languages;
  if (!languages?.registerCompletionItemProvider) return () => {};
  const byLanguage = registrations.get(monaco) ?? new Map();
  registrations.set(monaco, byLanguage);
  const previous = byLanguage.get(languageId);
  if (previous) previous();

  const kinds = languages.CompletionItemKind ?? { Variable: 13, Function: 2, Class: 6 };

  const provider = {
    provideCompletionItems(
      model: {
        getWordAtPosition: (position: {
          lineNumber: number;
          column: number;
        }) => {
          word: string;
          startColumn: number;
          endColumn: number;
        } | null;
      } | null,
      position: { lineNumber: number; column: number } | null,
    ) {
      try {
        if (!model || !position) return { suggestions: [] };
        const wordInfo = model.getWordAtPosition(position);
        const word = wordInfo?.word ?? '';
        // A single character would offer everywhere — require a
        // stem of at least two, like the composer's ghost.
        if (word.length < 2) return { suggestions: [] };
        const identifiers = opts.getIdentifiersAtPosition(
          position.lineNumber,
          position.column,
        );
        const seen = new Set<string>();
        const suggestions = [];
        for (const identifier of identifiers) {
          if (
            identifier.length > word.length &&
            identifier.startsWith(word) &&
            !seen.has(identifier)
          ) {
            seen.add(identifier);
            suggestions.push({
              label: identifier,
              kind: kinds.Variable,
              insertText: identifier,
              range: wordInfo
                ? {
                    startLineNumber: position.lineNumber,
                    startColumn: wordInfo.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: wordInfo.endColumn,
                  }
                : undefined,
            });
          }
        }
        return { suggestions };
      } catch {
        // Kite's failure mode — a dead engine returns no
        // completions, never an error in the user's face.
        return { suggestions: [] };
      }
    },
  };

  const disposable = languages.registerCompletionItemProvider(
    languageId,
    provider,
  );
  const dispose = () => {
    try {
      disposable?.dispose();
    } catch {
      // Already disposed (StrictMode double-mount in dev, or a
      // newer registration replaced this one) — not an error.
    }
    if (byLanguage.get(languageId) === dispose) {
      byLanguage.delete(languageId);
    }
  };
  byLanguage.set(languageId, dispose);
  return dispose;
}
