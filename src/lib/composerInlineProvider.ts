/**
 * Monaco inline-completion provider for the composer (steal #1 —
 * 2026-11-14). The adapter between the pure engine
 * (./inlineCompletions.ts) and Monaco's
 * `registerInlineCompletionsProvider` API (monaco-editor 0.57).
 *
 * Contract, from the steal research (steal-research-2026-11-13.md,
 * the Monaco section — the API is richer than VS Code's, and
 * `disposeInlineCompletions` is REQUIRED in Monaco, not optional):
 *   - provideInlineCompletions returns one item at most — the
 *     full completion text over the whole line — or `undefined`
 *     (never an empty list, never an error). A bad suggestion is
 *     worse than none: return `undefined` rather than a wrong
 *     ghost.
 *   - the range must begin and end on the same line (the
 *     composer is one line; the range is the whole line, and the
 *     existing text is a prefix of the text to insert, as the
 *     API requires).
 *   - `enableForwardStability: true` on the list: typing along
 *     the suggestion does not re-request — the ghost is local
 *     and cheap, but a re-request per keystroke is work for
 *     nothing.
 *   - `disposeInlineCompletions` clears the stashed offer when
 *     the disposed list is the stashed one — the composer's Tab
 *     / Right-arrow accept reads the stash, so a stale offer
 *     must never survive its list.
 *   - the provider offers only at the end of the line, and only
 *     for a single-line model — the ghost completes what was
 *     typed, never mid-line.
 *   - Kite's failure mode: a dead engine returns no
 *     completions, never an error — the compute is wrapped in
 *     try/catch and a throw becomes `undefined`.
 *
 * At most one provider per Monaco instance: the composer
 * remounts across DEFCON branches (and React StrictMode
 * double-mounts in dev), and a stale provider would offer —
 * and stash — for a dead editor. A new registration disposes
 * the previous one for the same monaco; the last mounted
 * composer wins. Production has one composer per renderer, so
 * this is a guard, not a feature.
 *
 * The provider is guarded, not assumed: a monaco without
 * `languages` (the test stubs) registers nothing and the
 * returned dispose is a no-op, so the mount never fails on it.
 * The suggest widget is off in the composer
 * (quickSuggestions false, suppressSuggestions true), so
 * `context.selectedSuggestionInfo` is never set — no handling
 * for it. No `groupId` / `yieldsToGroupIds`: a single provider.
 * No `debounceDelayMs`: the engine is local and synchronous;
 * Monaco's own scheduling debounces.
 */

import type { MutableRefObject } from 'react';
import {
  computeInlineCompletion,
  type InlineCompletionContext,
  type InlineCompletionSource,
} from './inlineCompletions';

/** The provider's live offer, stashed for the composer's Tab /
 *  Right-arrow accept (the mounted key handlers read it). The
 *  accept is valid while the offer still completes the current
 *  input — the user may have typed along it since it was
 *  offered (forward stability), so the check is the prefix
 *  rule, not an exact match on `forInput`. */
export interface InlineOffer {
  /** The full completion text (the draft + the ghost remainder). */
  text: string;
  source: InlineCompletionSource;
  /** The input the offer was computed from. */
  forInput: string;
}

export interface ComposerInlineProviderOptions {
  /** Read at request time, so the provider always sees the
   *  current history / files / mode / parent ghost. */
  getContext: () => InlineCompletionContext;
  /** The ref the live offer is stashed in. */
  offerRef: MutableRefObject<InlineOffer | null>;
}

const registrations = new WeakMap<object, () => void>();

export function registerComposerInlineCompletions(
  monaco: {
    languages?: {
      registerInlineCompletionsProvider: (
        languageSelector: string,
        provider: Record<string, unknown>,
      ) => { dispose: () => void };
    };
  },
  opts: ComposerInlineProviderOptions,
): () => void {
  const languages = monaco?.languages;
  if (!languages?.registerInlineCompletionsProvider) return () => {};
  // One provider per monaco instance — a new registration
  // disposes the previous one (see the module doc above).
  const previous = registrations.get(monaco);
  if (previous) previous();

  let stashed: { list: unknown; offer: InlineOffer } | null = null;
  const provider = {
    provideInlineCompletions(
      model: {
        getLineCount: () => number;
        getLineContent: (lineNumber: number) => string;
        getLineMaxColumn: (lineNumber: number) => number;
      } | null,
      position: { lineNumber: number; column: number } | null,
      _context: unknown,
      token: { isCancellationRequested?: boolean } | null,
    ) {
      try {
        if (token?.isCancellationRequested) return undefined;
        if (!model || model.getLineCount() !== 1) return undefined;
        const line = model.getLineContent(1);
        // The ghost completes what was typed — only at the end
        // of the line, never mid-line.
        if (!position || position.column !== model.getLineMaxColumn(1)) return undefined;
        const result = computeInlineCompletion(line, opts.getContext());
        if (!result) {
          stashed = null;
          opts.offerRef.current = null;
          return undefined;
        }
        const offer: InlineOffer = { text: result.text, source: result.source, forInput: line };
        const list = {
          items: [
            {
              insertText: result.text,
              range: {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: model.getLineMaxColumn(1),
              },
            },
          ],
          enableForwardStability: true,
        };
        stashed = { list, offer };
        opts.offerRef.current = offer;
        return list;
      } catch {
        // Kite's failure mode — a dead engine returns no
        // completions, never an error in the user's face.
        stashed = null;
        opts.offerRef.current = null;
        return undefined;
      }
    },
    // REQUIRED by Monaco (monaco.d.ts lists it non-optional
    // on InlineCompletionsProvider): called when a list is no
    // longer in use. Only the stashed list clears the offer —
    // a dispose for another list must not kill a live one.
    disposeInlineCompletions(completions: unknown) {
      if (stashed && completions === stashed.list) {
        stashed = null;
        opts.offerRef.current = null;
      }
    },
  };

  const disposable = languages.registerInlineCompletionsProvider('shell', provider);
  const dispose = () => {
    try {
      disposable?.dispose();
    } catch {
      // Already disposed (StrictMode double-mount in dev, or a
      // newer registration replaced this one) — not an error.
    }
    if (registrations.get(monaco) === dispose) registrations.delete(monaco);
    stashed = null;
    opts.offerRef.current = null;
  };
  registrations.set(monaco, dispose);
  return dispose;
}
