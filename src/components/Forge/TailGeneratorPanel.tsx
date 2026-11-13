/**
 * TailGeneratorPanel — the Tail Generator tab in the Forge (Gary,
 * 2026-11-06).
 *
 * Its requirement, shown on the page, is "dual unison detected". It
 * is FULLY unlocked only when the stop action has been verified and
 * detected in the unison detect (see the Dual Unison tab). Once
 * fully unlocked it roots united actions in binary 2, growing the
 * tail — the immutable DNA of your system. The tail is per-person
 * (grown from that person's own united actions) and append-only:
 * entries are never rewritten, reordered, or dropped.
 *
 * The cryptographic mechanism is a PLACEHOLDER (see tailEntryHash in
 * src/lib/dualUnison.ts): the record is hash-chained in shape, but
 * the exact mechanism — real hash chain vs signature vs something
 * else — is not decided. Do not treat the shown hashes as
 * cryptographic proof.
 */

import { useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import { HomunculusVoiceNote } from './HomunculusVoiceNote';
import {
  detectDualUnison,
  isTailPageFullyUnlocked,
  stopActionStateLabel,
} from '../../lib/dualUnison';

export function TailGeneratorPanel() {
  const roster = useForgeStore((s) => s.roster);
  const unison = useForgeStore((s) => s.unison);
  const lastError = useForgeStore((s) => s.lastError);
  const rootUnitedAction = useForgeStore((s) => s.rootUnitedAction);

  const [action, setAction] = useState('');
  // Ghost words (Gary, 2026-11-13 ~02:14 PST — the mechanism
  // covers EVERY prompt): gone after the first action rooted
  // here, even when the input is empty again. Local state — the
  // panel remounts each time the Tail Generator tab opens. Only
  // a successful root marks it; a rejected root (lastError says
  // why) leaves the ghost words in place.
  const [hasRooted, setHasRooted] = useState(false);

  const detection = detectDualUnison(roster);
  const fullyUnlocked = isTailPageFullyUnlocked(unison.stopAction);

  const handleRoot = () => {
    if (!action.trim()) return;
    try {
      rootUnitedAction(action);
      setHasRooted(true);
      setAction('');
    } catch {
      // Rejected (not detected / not fully unlocked / empty) —
      // lastError already says why.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <p className="text-xs text-[var(--text-muted)]">
          Listen to the Tail Generator voice message:
        </p>
        <audio
          className="mt-1 w-full max-w-md"
          controls
          preload="metadata"
          src="./forge/forge-tail-generator.mp3"
          aria-label="Tail Generator voice message"
        />
        <HomunculusVoiceNote />
      </section>
      <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Tail generator
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          The tail is the immutable DNA of your system — it grows from
          your own united actions, rooted in binary 2, cryptographically
          and causally. No two tails are alike: yours grows from your
          actions alone.
        </p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Requirement: dual unison detected —{' '}
          {detection.detected ? (
            <span className="text-green-400">detected</span>
          ) : (
            <span className="text-amber-300">not yet detected</span>
          )}
          .
        </p>
        {!detection.detected && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Create a pink and a purple Homunculus to unlock dual unison.
          </p>
        )}
        {detection.detected && !fullyUnlocked && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Dual unison is detected, but the tail page is not fully
            unlocked yet — the stop action is{' '}
            {stopActionStateLabel(unison.stopAction).toLowerCase()}. Finish
            it in the Dual Unison tab: input the first stop action, then
            verify and detect it in the unison detect.
          </p>
        )}
        {fullyUnlocked && (
          <p className="mt-1 text-xs text-green-400">
            Fully unlocked — the stop action was verified and detected.
          </p>
        )}
      </section>

      {fullyUnlocked && (
        <>
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Root a united action
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              An action taken while united gets anchored in binary 2 and
              grows the tail. Write what happened, in your own words.
            </p>
            <div className="mt-2 flex gap-2">
              {/* Ghost-words overlay (Gary, 2026-11-13 ~02:14 PST):
                  position:absolute inside this relative wrap, at
                  the input's own text origin (px-2 py-1),
                  pointer-events-none — the caret overlaps the
                  ghost text and nothing moves when the words
                  appear or disappear. Native placeholder is ''
                  while the overlay shows so the two never
                  double-render. Text frozen. */}
              <div className="relative min-w-0 flex-1">
                <input
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRoot();
                  }}
                  placeholder=""
                  aria-label="United action to root"
                />
                {!hasRooted && action.length === 0 && (
                  <div
                    data-testid="tail-generator-hint-placeholder"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-2 right-2 z-10 overflow-hidden whitespace-nowrap py-1 text-sm text-[var(--text-muted)] opacity-80"
                  >
                    What did you do while united?
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRoot}
                disabled={!action.trim()}
                className="shrink-0 rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Root in binary 2
              </button>
            </div>
            {lastError && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {lastError}
              </p>
            )}
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              The tail — {unison.tail.length}{' '}
              {unison.tail.length === 1 ? 'entry' : 'entries'}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Append-only — entries are never rewritten, reordered, or
              dropped. Hash-chained (placeholder — the exact
              cryptographic mechanism is still open).
            </p>
            {unison.tail.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Nothing rooted yet. Root your first united action above.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {unison.tail.map((entry) => (
                  <li
                    key={entry.tick}
                    className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs"
                  >
                    <span className="text-[var(--text-muted)]">
                      tick {entry.tick} ·{' '}
                      {new Date(entry.at).toLocaleString()}
                    </span>
                    <span className="block text-[var(--text-secondary)]">
                      {entry.action}
                    </span>
                    <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                      {entry.prevHash ? `← ${entry.prevHash} ` : 'genesis '}
                      · {entry.hash}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
