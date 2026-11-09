/**
 * DEFCON 3 Phase 3 — inline suggestion + Tab completion for the
 * prompter (Gary, 2026-11-09 ~08:10 PST — "proceed until complete",
 * same composer in both modes).
 *
 * SMALLEST COHERENT FORM (dissection §6.3): a faded ghost-text
 * suggestion in the composer, accepted with Right-arrow or Tab.
 * Two sources only, both already in the codebase — nothing new is
 * built to supply them:
 *   (a) the composer's own submitted history (`devHistory` in
 *       Terminal.tsx) — most-recent-first prefix match, case
 *       sensitive like the shell's own history;
 *   (b) known slash-command names — the `SLASH_COMMAND_NAMES`
 *       surface in src/utils/commandRouter.ts, the same list
 *       `findClosestCommand` draws its typo suggestions from
 *       (reused, not rebuilt).
 *
 * OUT OF SCOPE, deliberately not built here: shell-history
 * completion (the composer never reads the shell's history —
 * the shell owns it), fuzzy path completion, and a completion
 * popup. The ghost is single-line only: a multi-line input
 * returns no suggestion (the composer is a command line, not a
 * script editor).
 *
 * TAB — DECIDED (brief item 2): Tab in the composer NEVER goes
 * to the shell (the shell is not the input here). With a ghost
 * suggestion present, Tab accepts it. With none present, Tab
 * does nothing — it is swallowed, not inserted as a tab
 * character and not forwarded to the PTY. Right-arrow accepts
 * only when the cursor is at the end of the input (the usual
 * ghost-text rule); the cursor check lives in InputArea, not
 * here — this module only computes the suggestion text.
 *
 * Pure functions: unit-testable without a browser or Electron.
 */

import { SLASH_COMMAND_NAMES } from '../utils/commandRouter';

/**
 * The ghost suggestion for the composer's current input, or null
 * when there is nothing to suggest.
 *
 * Slash lines (`/...`) complete the command WORD only: the
 * fragment after the `/`, up to the first space. Once the line
 * has a space (arguments are being typed) there is no
 * suggestion — completing arguments is out of scope.
 *
 * Bare lines complete from submitted history: the most recent
 * entry that starts with the input and is longer than it.
 * The match must be strictly longer — an exact match suggests
 * nothing (there is nothing left to complete).
 */
export function computeGhostSuggestion(
  input: string,
  history: string[],
  slashNames: readonly string[] = SLASH_COMMAND_NAMES,
): string | null {
  if (!input) return null;
  // Single-line only — a multi-line draft has no ghost.
  if (input.includes('\n')) return null;

  if (input.startsWith('/')) {
    const fragment = input.slice(1);
    if (!fragment || /\s/.test(fragment)) return null;
    const lower = fragment.toLowerCase();
    // An exact match is a complete command — no ghost for a
    // DIFFERENT command (`/fix` must not ghost `/fixnet`):
    // the same exact-match rule as history, below.
    if (slashNames.includes(lower)) return null;
    const match = [...slashNames]
      .filter((name) => name.startsWith(lower) && name.length > fragment.length)
      .sort()[0];
    return match ? `/${match}` : null;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.length > input.length && entry.startsWith(input)) return entry;
  }
  return null;
}
