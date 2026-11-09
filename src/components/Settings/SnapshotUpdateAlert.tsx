/**
 * Snapshot update alert — the alert for a required snapshot
 * update (Gary, 2026-11-09 ~14:51 PST).
 *
 * When training is done and a new snapshot is published,
 * everyone's next pull is different and the new snapshot is
 * REQUIRED. The alert shows what is new (version + what
 * changed) and what is installed, with a "Do not show again"
 * checkbox and two buttons:
 * - Update snapshot — starts the update (download → hash
 *   verify BEFORE swap → SPSC triple-buffer flip). The update
 *   itself is required; this button starts it now.
 * - Not now — closes the alert without updating. When "Do not
 *   show again" is checked, the caller records THIS version as
 *   dismissed (settings.snapshotAlertDismissedVersions), so the
 *   alert fires once per new version and never nags about a
 *   version the user already dismissed. The next version still
 *   alerts. Dismissing the notice never cancels the update —
 *   the next pull still requires the new snapshot.
 *
 * Mirrors the summon variant ask dialog (SummonVariantDialog in
 * src/components/Forge/SummonsSection.tsx) — the same "ask with
 * a Don't ask again checkbox" pattern Gary already approved.
 * Pure presentation: the caller decides when to show it (see
 * src/lib/snapshotUpdate.ts checkSnapshotUpdate) and what
 * Update / Dismiss do.
 */
import { useState } from 'react';
import type { SnapshotManifest } from '../../lib/snapshotUpdate';

export function SnapshotUpdateAlertDialog({
  manifest,
  installedVersion,
  onUpdate,
  onDismiss,
}: {
  /** The new snapshot from the manifest. */
  manifest: SnapshotManifest;
  /** The installed version, or null when no snapshot is installed. */
  installedVersion: string | null;
  /** Start the update now (download → verify → flip). */
  onUpdate: () => void;
  /** Close without updating. `dontAsk` is true when "Do not show
   *  again" was checked — the caller records this version as
   *  dismissed then. */
  onDismiss: (dontAsk: boolean) => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Snapshot ${manifest.version} is required`}
      data-testid="snapshot-update-alert"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-96 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          A new snapshot is required
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Training finished and snapshot {manifest.version} is
          published. Your next pull is different — this snapshot
          replaces{' '}
          {installedVersion === null
            ? 'no installed snapshot'
            : `snapshot ${installedVersion}`}
          .
        </p>
        {manifest.whatChanged && (
          <p className="mt-2 text-xs leading-[1.5] text-[var(--text-secondary)]">
            What changed: {manifest.whatChanged}
          </p>
        )}
        <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
          The update downloads the snapshot, verifies its hash
          before swapping it in, and flips it in without stopping
          anything. It costs no neurons and no SP.
        </p>
        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            data-testid="snapshot-update-dont-ask"
          />
          Do not show again
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDismiss(dontAsk)}
            data-testid="snapshot-update-not-now"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onUpdate}
            data-testid="snapshot-update-confirm"
            className="rounded-md bg-purple-500/80 px-3 py-1.5 text-sm text-white"
          >
            Update snapshot
          </button>
        </div>
      </div>
    </div>
  );
}
