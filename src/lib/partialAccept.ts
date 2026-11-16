/**
 * Partial accept (Tabnine S1 — 2026-11-15): accept only the
 * next word or the next line of a ghost offer, instead of the
 * whole thing.
 *
 * Pure functions — the caller resolves which offer is live
 * (the inline provider's offer first, then the parent's
 * overlay ghost) and passes its full text + the current
 * input. Both return the new input, or null when there is
 * nothing to accept (no offer, or the offer is not a
 * completion of the input).
 *
 * Keybindings (the build's choice, recorded here — Tabnine
 * uses Tab for whole + separate bindings for partial; Lucid
 * must not collide with the existing Tab-accept or the
 * shell's Tab):
 *   - Ctrl+Right — accept the next word (VS Code's inline-
 *     suggest convention).
 *   - Ctrl+Down — accept the next line.
 * Both fire only when a ghost is shown and the cursor is at
 * the end of the input; otherwise the keys do their normal
 * thing (word-jump / scroll / history).
 */

/** The offer's remainder after the current input, or null
 *  when the offer is not a completion of the input. */
function remainder(
  offerText: string | null | undefined,
  current: string,
): string | null {
  if (!offerText) return null;
  if (offerText.length <= current.length) return null;
  if (!offerText.startsWith(current)) return null;
  return offerText.slice(current.length);
}

/** Accept the next word of the offer: leading whitespace +
 *  the next non-whitespace run. Repeated partial accepts
 *  walk the offer word by word. A remainder of only
 *  whitespace (e.g. a trailing space) is taken whole —
 *  there is no further word. */
export function acceptNextWord(
  offerText: string | null | undefined,
  current: string,
): string | null {
  const rest = remainder(offerText, current);
  if (rest === null) return null;
  const m = rest.match(/^\s*\S+/);
  if (!m) {
    // All whitespace — take it all; no further word.
    return /^\s+$/.test(rest) ? current + rest : null;
  }
  return current + m[0];
}

/** Accept the next line of the offer: up to and including
 *  the next newline. With no newline in the remainder, the
 *  whole remainder (the same as whole-accept — there is only
 *  one line). */
export function acceptNextLine(
  offerText: string | null | undefined,
  current: string,
): string | null {
  const rest = remainder(offerText, current);
  if (rest === null) return null;
  const nl = rest.indexOf('\n');
  return current + (nl === -1 ? rest : rest.slice(0, nl + 1));
}
