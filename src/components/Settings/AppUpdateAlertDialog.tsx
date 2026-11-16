/**
 * App update alert — the alert for a new Lucid version
 * (Gary, 2026-11-16).
 *
 * When a new version is out, a message shows at the beginning
 * (startup) — in addition to the snapshot-off message, not a
 * replacement for it. The alert shows what is new (version +
 * publish date + release notes) and what is installed, with a
 * "Do not show again" checkbox and two buttons:
 * - View release — opens the release page (the honest install
 *   path: download the .dmg, replace the app — Lucid does not
 *   update itself).
 * - Not now — closes the alert without updating. When "Do not
 *   show again" is checked, the caller records the opt-out for
 *   THIS profile (settings.skipUpdateAlert), so the profile
 *   never sees the startup alert again. The Updates section
 *   still shows the latest version and the Check now button —
 *   the toggle only silences the startup notice, never the
 *   section. A guest NEVER sees the checkbox: a guest session
 *   always sees the message (guest wipes anyway — there is no
 *   opt-out for Guest).
 *
 * Mirrors the snapshot update alert (SnapshotUpdateAlert in
 * this folder) — the same "ask with a Don't ask again
 * checkbox" pattern Gary already approved. Pure presentation:
 * the caller decides when to show it (see
 * src/lib/appUpdate.ts checkAppUpdate) and what View release
 * / Dismiss do.
 */
import { useState } from 'react';
import type { AppRelease } from '../../lib/appUpdate';

const NOTES_PREVIEW_LIMIT = 400;

export function AppUpdateAlertDialog({
  release,
  installedVersion,
  showDontAsk,
  onViewRelease,
  onDismiss,
}: {
  /** The new release from the check. */
  release: AppRelease;
  /** The installed version. */
  installedVersion: string;
  /** Show the "Do not show again" checkbox — false for
   *  Guest (a guest always sees the message, never opts out). */
  showDontAsk: boolean;
  /** Open the release page. */
  onViewRelease: () => void;
  /** Close without updating. `dontAsk` is true when "Do not
   *  show again" was checked — the caller records the opt-out
   *  for this profile then. */
  onDismiss: (dontAsk: boolean) => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  const notes =
    release.notes.length > NOTES_PREVIEW_LIMIT
      ? `${release.notes.slice(0, NOTES_PREVIEW_LIMIT)}…`
      : release.notes;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Lucid ${release.tagName} is available`}
      data-testid="app-update-alert"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-96 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          A new version of Lucid is available
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Lucid {release.tagName} is out
          {release.publishedAt
            ? ` (published ${new Date(release.publishedAt).toLocaleDateString()})`
            : ''}
          . You are on {installedVersion}.
        </p>
        {notes && (
          <p className="mt-2 text-xs leading-[1.5] text-[var(--text-secondary)]">
            What changed: {notes}
          </p>
        )}
        <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
          Lucid does not update itself yet — install it from the
          release page (download the .dmg and replace the app).
          The Updates section in Settings always shows the latest
          version and how to install it.
        </p>
        {showDontAsk && (
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              data-testid="app-update-dont-ask"
            />
            Do not show again
          </label>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDismiss(dontAsk)}
            data-testid="app-update-not-now"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onViewRelease}
            data-testid="app-update-view-release"
            className="rounded-md bg-purple-500/80 px-3 py-1.5 text-sm text-white"
          >
            View release
          </button>
        </div>
      </div>
    </div>
  );
}
