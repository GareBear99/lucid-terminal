/**
 * Structure completions for the ghost (steal #2 — 2026-11-14).
 *
 * The tree-sitter slice of the completion engine: complete the
 * draft's last token to an identifier the live structure says is
 * in scope — a top-level definition or an import in the file being
 * edited (the composer), or an in-scope identifier at the cursor
 * (the Files editor). Same rules as completeOpenFile, so the two
 * sources never disagree about what a token completes to:
 * case-sensitive, at least two characters (a single character
 * would ghost everywhere), first match in the given order wins —
 * cycling through multiple matches is later work (an Explicit
 * trigger / Alt+]/[).
 *
 * Local, in-memory, synchronous — the identifiers come from the
 * cached tree, never a model, never a network round-trip.
 */

export function completeStructureIdentifier(
  draft: string,
  identifiers: ReadonlyArray<string>,
): string | null {
  const tokenMatch = draft.match(/(\S+)$/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];
  if (token.length < 2) return null;
  const head = draft.slice(0, draft.length - token.length);
  for (const identifier of identifiers) {
    if (identifier.length > token.length && identifier.startsWith(token)) {
      return head + identifier;
    }
  }
  return null;
}
