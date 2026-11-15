/**
 * Kite signature assist (Atom steal #19 — 2026-11-14).
 *
 * Kite's signature panel was where it stopped feeling like
 * autocomplete and started feeling like a senior dev leaning
 * over your shoulder: the call signature with the current
 * argument highlighted, `**kwargs` listed, a "How others used
 * this" section of real invocation patterns, and a `Docs` link
 * at the bottom. The Pro-gating/upsell half is not worth
 * stealing — and Kite's data (other developers' code, from
 * its cloud) doubly so. What Lucid takes is the *shape*:
 *
 * - the `Docs` link — the same `lucid-docs://` wiring as the
 *   hover Docs link (steal #7), opening Lucid's docs panel
 *   at the called symbol;
 * - a "How others used this" block drawn from **Lucid's own
 *   corpus** — the pattern index over the user's open files
 *   (steal #7, Tabnine patterns only): lines starting with
 *   the call, i.e. how this codebase actually invokes it.
 *
 * Both are optional augmentations of the LSP signature help
 * Monaco already shows: when there is no Docs link and no
 * invocation, the signature is returned exactly as the LSP
 * gave it. The cap is Kite's: at most 3 invocations beside
 * the signature.
 */

/** At most 3 common invocations beside the signature (Kite's cap). */
export const SIGNATURE_INVOCATION_LIMIT = 3;

/** An invocation line is trimmed to this length in the panel. */
export const SIGNATURE_INVOCATION_MAX_LENGTH = 120;

/** Keywords that look like a callee but are control flow, not a call. */
const NON_CALL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

/** The called function at the cursor, or null when there is none. */
export interface CalleeName {
  /** The full dotted chain before the `(` (`obj.foo`). */
  chain: string;
  /** The called name alone (`foo`) — the docs-panel word. */
  word: string;
}

/**
 * The callee of the call the cursor sits inside: the identifier
 * chain immediately before the last `(` at or before the cursor
 * column. `column` is 1-based, Monaco-style. The chain stops at
 * any inner `(` — `obj.foo(` gives `obj.foo`, while
 * `store.getState().openFiles(` gives `openFiles` (the call
 * chain's last link). Returns null when there is no `(` before
 * the cursor, no identifier before it, or the "callee" is
 * control flow (`if (`, `for (`). Never throws.
 */
export function extractCalleeName(lineText: string, column: number): CalleeName | null {
  try {
    const before = lineText.slice(0, Math.max(0, column - 1));
    const openParen = before.lastIndexOf('(');
    if (openParen < 0) return null;
    const match = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/.exec(
      before.slice(0, openParen),
    );
    if (!match) return null;
    const chain = match[1];
    const word = chain.split('.').pop() ?? chain;
    if (NON_CALL_KEYWORDS.has(word)) return null;
    return { chain, word };
  } catch {
    return null;
  }
}

/**
 * The augmented documentation for the active signature: the
 * LSP's own documentation, then a `Docs` link, then the
 * "How others used this" block. Returns null when there is
 * nothing to add — the caller then leaves the signature
 * exactly as the LSP gave it.
 */
export function buildSignatureDocumentation(
  existing: string | undefined,
  docsUrl: string | undefined,
  invocations: readonly string[],
): string | null {
  const shown = invocations.filter((line) => line.trim().length > 0).slice(0, SIGNATURE_INVOCATION_LIMIT);
  // Nothing new to add — the caller leaves the signature exactly
  // as the LSP gave it.
  if (!docsUrl && shown.length === 0) return null;
  const parts: string[] = [];
  if (existing) parts.push(existing);
  if (docsUrl) parts.push(`[Docs](${docsUrl})`);
  if (shown.length > 0) {
    const lines = shown.map((line) => {
      const trimmed = line.trim();
      const short =
        trimmed.length > SIGNATURE_INVOCATION_MAX_LENGTH
          ? `${trimmed.slice(0, SIGNATURE_INVOCATION_MAX_LENGTH - 1)}…`
          : trimmed;
      return `- \`${short}\``;
    });
    parts.push(`**How others used this:**\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}
