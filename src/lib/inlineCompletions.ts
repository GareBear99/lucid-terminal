/**
 * Monaco inline completions (ghost answers) — steal #1 (2026-11-14).
 *
 * The pure completion engine: given the composer's current draft and
 * the cheap local context (submitted history, slash names, open
 * files), return the full text the ghost should show, or null. No
 * Monaco, no React, no network — unit-testable on its own, and the
 * hot path stays local: no model call, no network round-trip, no
 * lock, no SP. The only limit is the intelligence of the context
 * we feed it (Gary, 2026-11-14: the only bottleneck is ours, or
 * the driving intelligence's) — this first slice feeds it history
 * + slash names + open files only.
 *
 * Priority (the parent's overlay ghost is the same order, so the
 * two sources never disagree about what a draft completes to):
 *   1. submitted history — the most recent entry that starts with
 *      the draft and is strictly longer (computeGhostSuggestion,
 *      the same rule the overlay uses);
 *   2. slash names — `/fi` -> `/fix` (the command word only);
 *   3. open files — the draft's last token completed to an open
 *      file's path or basename (the tab's file context);
 *   4. structure — the draft's last token completed to an
 *      identifier the live tree-sitter structure says is in
 *      scope in the file being edited (steal #2).
 *
 * Silence rules (the ghost never fires):
 *   - empty or multi-line draft (the composer is one line);
 *   - agent mode — the parent's overlay ghost owns agent mode
 *     (the tab's own agent prompts), and the provider's terminal
 *     history would ghost shell commands into agent prompts;
 *   - while the parent's overlay ghost is set — the two ghosts
 *     must never double-render (the parent covers history/slash
 *     in the linked composer, so the provider's unique
 *     contribution there is file completion; in the delinked bar
 *     and the detached window without a prompter, with no parent
 *     ghost, the provider covers history + slash + files).
 *
 * Kite's failure mode is the contract: a dead engine returns no
 * completions, never an error in the user's face. Nothing here
 * throws on ordinary input — the adapter still wraps the call.
 */

import { computeGhostSuggestion } from './prompterSuggestions';
import { completeStructureIdentifier } from './structureCompletions';

export type InlineCompletionSource = 'history' | 'slash' | 'file' | 'structure';

/** The cheap local context the engine reads — all in-memory. */
export interface InlineCompletionContext {
  /** Submitted commands, oldest -> newest (the command history
   *  store's entries; the guest veil is already applied by the
   *  store — a guest's session-only list, never persisted). */
  history: string[];
  /** The tab's open files (file store's openFiles, path + name). */
  openFiles: ReadonlyArray<{ path: string; name: string }>;
  /** Which mode the composer is in. */
  mode: 'terminal' | 'agent';
  /** The parent overlay's ghost for this draft, if any — the
   *  provider stays silent while it is set. */
  parentGhost: string | null;
  /** Identifiers the live tree-sitter structure says are in
   *  scope in the file being edited (steal #2 — top-level
   *  definitions + imports for the composer). Optional: the
   *  engine may not be ready yet, and the provider degrades to
   *  history / slash / files without it. */
  structureIdentifiers?: string[];
  /** The active terminal tab's cwd (steal #2). A relative token
   *  with a `/` is resolved against it before matching the open
   *  files' absolute paths — without it, `src/com` could never
   *  match `/Users/gary/…/src/components/…`. Optional: the
   *  composer works without it (bare tokens still complete to
   *  basenames). */
  cwd?: string;
}

export interface InlineCompletion {
  /** The full text the ghost should show (draft + remainder). */
  text: string;
  source: InlineCompletionSource;
}

export function computeInlineCompletion(
  draft: string,
  ctx: InlineCompletionContext,
): InlineCompletion | null {
  if (!draft || draft.includes('\n')) return null;
  // Agent mode defers to the parent's overlay ghost (the tab's
  // own agent prompts) — see the module doc above.
  if (ctx.mode === 'agent') return null;
  // Never double-render with the parent's overlay ghost.
  if (ctx.parentGhost) return null;
  // History + slash share one rule (computeGhostSuggestion
  // already orders them: slash lines complete the command
  // word, bare lines complete from history).
  const ghost = computeGhostSuggestion(draft, ctx.history);
  if (ghost) {
    return { text: ghost, source: draft.startsWith('/') ? 'slash' : 'history' };
  }
  const file = completeOpenFile(draft, ctx.openFiles, ctx.cwd);
  if (file) return { text: file, source: 'file' };
  // Structure last: identifiers from the file being edited are
  // the weakest signal in a shell prompt (a command is not code),
  // but they are exactly what the composer could not offer before
  // — completing a symbol name the user is about to type.
  const structure = completeStructureIdentifier(
    draft,
    ctx.structureIdentifiers ?? [],
  );
  if (structure) return { text: structure, source: 'structure' };
  return null;
}

/**
 * Complete the draft's last token from the open files (the tab's
 * file context — the cheapest grounding the provider has, and
 * the one the parent's overlay ghost does not offer).
 *
 * A token with a `/` completes against the file's full path
 * (`cd src/com` -> `cd src/components/Terminal.tsx`); a bare
 * token completes against the file's basename (`cat READ` ->
 * `cat README.md`). Case-sensitive, like the shell. First open
 * file in tab order wins — cycling through multiple matches is
 * later work (an Explicit trigger / Alt+]/[).
 *
 * A relative token with a `/` is resolved against `cwd` first
 * (`src/com` in `/Users/gary/lucid-terminal` becomes
 * `/Users/gary/lucid-terminal/src/com`) — without the cwd, a
 * relative token could never match an absolute path. An absolute
 * token is used as-is. When no cwd is given, only absolute tokens
 * match by path (bare tokens still match by basename).
 *
 * Returns null when there is nothing to complete: no token, a
 * single-character token (that would ghost everywhere), a token
 * that is already a complete path/name, or no open file that
 * starts with the token.
 */
export function completeOpenFile(
  draft: string,
  openFiles: ReadonlyArray<{ path: string; name: string }>,
  cwd?: string,
): string | null {
  const tokenMatch = draft.match(/(\S+)$/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];
  // A single character would ghost everywhere — require at
  // least two, like a shell's own completion needs a stem.
  if (token.length < 2) return null;
  const head = draft.slice(0, draft.length - token.length);
  for (const file of openFiles) {
    if (token.includes('/')) {
      const resolved =
        token.startsWith('/') || !cwd
          ? token
          : `${cwd.replace(/\/$/, '')}/${token}`;
      if (file.path.length > resolved.length && file.path.startsWith(resolved)) {
        return head + file.path;
      }
    } else if (file.name.length > token.length && file.name.startsWith(token)) {
      return head + file.name;
    }
  }
  return null;
}
