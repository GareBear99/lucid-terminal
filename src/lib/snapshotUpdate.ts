/**
 * Snapshot auto-update — the auto-connection between training and
 * the client (Gary, 2026-11-09 ~14:51–14:52 PST).
 *
 * Gary's order: "how is that autoconnected to the snapshot so when
 * training is done everyones next pull is different and requires
 * next snapshot with an alert of some sort and a do not show again"
 * — plus "that fed into the ring too with the allowances we have
 * right now" / "spsc".
 *
 * THE AUTO-CONNECTION, as built here:
 * - Training finishes → a new snapshot is published (one GGUF +
 *   SHA-256 + a manifest on GitHub IO: version, hash, download
 *   URL, what changed — see ~/workspace/snapshot-plan.md Steps
 *   7–11). The manifest is the source of truth for what is
 *   current.
 * - On pull, the client checks the manifest (the Connection pass:
 *   GitHub IO manifest/record, Cloudflare ping Worker, R2 bytes —
 *   otherwise NOT_CALLED, see src/lib/instantReplyConnection.ts)
 *   and compares it to its installed snapshot. When the version
 *   or the hash differ, the next pull IS different — the new
 *   snapshot is REQUIRED.
 * - An alert shows (the SnapshotUpdateAlert dialog): a new
 *   snapshot is available / required, with a "Do not show again"
 *   checkbox. Checking it records THAT version as dismissed, so
 *   the alert fires once per new version and never nags about a
 *   version the user already dismissed. The update itself still
 *   proceeds — it is required: download → hash verify BEFORE swap
 *   → SPSC triple-buffer atomic flip (snapshot-plan.md Step 12).
 * - Every step is recorded as a tick in the event ring (the
 *   SPSC channel, src/stores/eventLogStore.ts, cap 512) in causal
 *   order — detected, ping fallback, download started, hash
 *   verified, flipped, packet hits again, alert shown/dismissed,
 *   failed. Ring ticks are local: 0 neurons, 0 SP. The manifest
 *   check is a single Connection call; the snapshot download is
 *   R2 free egress.
 *
 * THE ALLOWANCES (free tier only — Gary's standing rule, no
 * costs, no paid plan):
 * - Workers AI: 10,000 neurons/day. Workers: 100,000 actions/day.
 *   SP: base 100, stage 1 cap 200 (+25/4h), stage 2 cap 250
 *   (+20/12h), verified 1000/day (target — verification not
 *   built yet, see src/lib/sovereignPoints.ts).
 *
 * WHAT IS NOT BUILT HERE (honest gap, do not fake it):
 * - The live manifest FETCH — the caller that pulls the manifest
 *   from GitHub IO on pull. No snapshot exists yet (no model
 *   trained, no R2 upload, no manifest published — snapshot-plan
 *   Steps 7–11), so there is nothing to fetch. The decision
 *   function below (checkSnapshotUpdate) is the entry point that
 *   caller will invoke with the fetched manifest; the dialog, the
 *   dismissal persistence, and the ring wiring are built and
 *   tested here. The snapshot itself is NOT built here.
 * - The Connections mechanism itself is still open (Gary's call)
 *   — this module uses the existing Connection pass
 *   (instantReplyConnection.ts), it does not invent a new one.
 * - Snapshot usage counters (neurons/day used, actions/day used)
 *   do not exist in Lucid yet — the Security tab shows the caps
 *   and says usage is not tracked yet, never an invented number.
 *
 * Pure functions + data, unit-testable without a browser — same
 * pattern as instantReplyConnection.ts and permissions.ts. The
 * caller does the manifest fetch; this module only decides.
 */

/** The free-tier allowances (Gary's standing rule: free tier
 *  only, no costs). Workers AI: 10,000 neurons/day. Workers:
 *  100,000 actions/day. These are the caps the ring + the
 *  Security tab measure against — usage counters do not exist
 *  in Lucid yet, so the tab shows the caps honestly. */
export const NEURONS_PER_DAY_CAP = 10_000;
export const ACTIONS_PER_DAY_CAP = 100_000;

/** How many dismissed snapshot versions are remembered. A
 *  cap, not a pile: old dismissals fall off the list (the
 *  alert for a version dismissed that long ago is a version
 *  the user has long since moved past). */
export const SNAPSHOT_DISMISSED_VERSIONS_LIMIT = 20;

/** The snapshot manifest — what GitHub IO publishes per
 *  version (snapshot-plan.md Step 11): version, SHA-256 hash,
 *  download URL (R2 bytes), what changed. The repo holds the
 *  RECORD; R2 holds the bytes. */
export interface SnapshotManifest {
  /** Snapshot version, e.g. 'v1'. */
  version: string;
  /** SHA-256 of the GGUF — the hash IS the identity. */
  sha256: string;
  /** Download URL (R2 bytes). */
  downloadUrl: string;
  /** What changed in this version (human text). */
  whatChanged: string;
}

/** The snapshot installed on this machine, or null when no
 *  snapshot is installed (no model trained yet — the honest
 *  state today). */
export interface InstalledSnapshot {
  /** Installed version, e.g. 'v1'. */
  version: string;
  /** SHA-256 of the installed GGUF. */
  sha256: string;
  /** Whether the installed file passed hash verification. */
  verified: boolean;
}

/** One step of the update, for the ring. */
export type SnapshotUpdateStage =
  | 'detected'
  | 'ping-fallback'
  | 'downloading'
  | 'hash-verified'
  | 'flipped'
  | 'packet-hits'
  | 'alert-shown'
  | 'alert-dismissed'
  | 'failed';

/**
 * Is a new snapshot REQUIRED — is the next pull different?
 * True when no snapshot is installed, or the manifest's
 * version differs from the installed version, or the hash
 * differs. The hash is the identity: a version that matches
 * but a hash that does not is still a different snapshot.
 */
export function isSnapshotUpdateRequired(
  installed: InstalledSnapshot | null,
  manifest: SnapshotManifest,
): boolean {
  if (installed === null) return true;
  if (installed.version !== manifest.version) return true;
  if (installed.sha256 !== manifest.sha256) return true;
  return false;
}

/**
 * Should the update alert SHOW for this manifest? The alert
 * fires once per new version: required AND this version has
 * not been dismissed. "Do not show again" records the
 * version (see dismissSnapshotAlertVersion), so a dismissed
 * version never alerts again — but the NEXT version still
 * alerts, because it is a new snapshot the user has not
 * seen. A single global flag would silence every future
 * snapshot alert forever, including versions the user never
 * saw — per-version dismissal is the honest reading of
 * Gary's "do not show again" on an alert about one new
 * snapshot.
 */
export function shouldShowSnapshotAlert(
  installed: InstalledSnapshot | null,
  manifest: SnapshotManifest,
  dismissedVersions: readonly string[],
): boolean {
  if (!isSnapshotUpdateRequired(installed, manifest)) return false;
  return !dismissedVersions.includes(manifest.version);
}

/**
 * Record a version as dismissed ("do not show again" was
 * checked for it). Pure: returns the new list, deduped,
 * capped at SNAPSHOT_DISMISSED_VERSIONS_LIMIT (oldest
 * dismissals fall off first).
 */
export function dismissSnapshotAlertVersion(
  dismissedVersions: readonly string[],
  version: string,
): string[] {
  if (dismissedVersions.includes(version)) return [...dismissedVersions];
  return [...dismissedVersions, version].slice(
    -SNAPSHOT_DISMISSED_VERSIONS_LIMIT,
  );
}

/** The result of checking a fetched manifest on pull. */
export interface SnapshotCheckResult {
  /** A new snapshot is required (the next pull is different). */
  required: boolean;
  /** The alert should show for this manifest. */
  showAlert: boolean;
  /** Why, in plain words — the reason the check gave. */
  reason: string;
}

/**
 * The entry point the manifest-check caller invokes with a
 * fetched manifest: decide whether an update is required and
 * whether the alert shows. The caller does the fetch (the
 * Connection pass); this function only decides. Returns the
 * decision + the reason, so the caller can log it to the ring
 * verbatim.
 */
export function checkSnapshotUpdate(
  installed: InstalledSnapshot | null,
  manifest: SnapshotManifest,
  dismissedVersions: readonly string[],
): SnapshotCheckResult {
  const required = isSnapshotUpdateRequired(installed, manifest);
  if (!required) {
    return {
      required: false,
      showAlert: false,
      reason: `Installed snapshot ${installed?.version ?? 'none'} matches manifest ${manifest.version} (hash matches) — no update required.`,
    };
  }
  const showAlert = shouldShowSnapshotAlert(installed, manifest, dismissedVersions);
  if (installed === null) {
    return {
      required: true,
      showAlert,
      reason: `No snapshot installed — manifest ${manifest.version} is required (first install).`,
    };
  }
  if (installed.version !== manifest.version) {
    return {
      required: true,
      showAlert,
      reason: `Manifest ${manifest.version} is newer than installed ${installed.version} — update required.`,
    };
  }
  return {
    required: true,
    showAlert,
    reason: `Manifest ${manifest.version} has a different hash than the installed snapshot — update required (hash mismatch).`,
  };
}

/** Human label for a snapshot update stage (ring + UI). */
export function snapshotUpdateStageLabel(stage: SnapshotUpdateStage): string {
  switch (stage) {
    case 'detected':
      return 'New snapshot detected';
    case 'ping-fallback':
      return 'Ping fallback';
    case 'downloading':
      return 'Snapshot download started';
    case 'hash-verified':
      return 'Snapshot hash verified';
    case 'flipped':
      return 'Snapshot swapped in';
    case 'packet-hits':
      return 'Packet hits new snapshot';
    case 'alert-shown':
      return 'Snapshot alert shown';
    case 'alert-dismissed':
      return 'Snapshot alert dismissed';
    case 'failed':
      return 'Snapshot update failed';
  }
}

/**
 * WHY a snapshot update event happened — the diagnosis for
 * the ring. Each names the exact code path, so the log
 * answers "why" without guessing (same discipline as
 * src/lib/eventLog.ts).
 */
export function diagnoseSnapshotUpdate(
  stage: SnapshotUpdateStage,
  version: string,
): string {
  switch (stage) {
    case 'detected':
      return `Manifest check on pull found ${version} (version or hash differs from the installed snapshot) — the next pull is different, so the update is required (src/lib/snapshotUpdate.ts checkSnapshotUpdate → Connection pass: GitHub IO manifest)`;
    case 'ping-fallback':
      return `A packet could not hit snapshot ${version} (mismatch) and fell back to the ping server — the single Connection call for that packet, while the update stream is in progress. The reply costs 1 SP; the update stream is not done (src/lib/snapshotUpdate.ts → Connection pass: Cloudflare ping Worker)`;
    case 'downloading':
      return `Snapshot ${version} download started from R2 (free egress) — the manifest's download URL (src/lib/snapshotUpdate.ts → Connection pass: R2 bytes)`;
    case 'hash-verified':
      return `Downloaded snapshot ${version} passed SHA-256 verification against the manifest hash — verified BEFORE the swap, never after (src/lib/snapshotUpdate.ts → snapshot-plan.md Step 12)`;
    case 'flipped':
      return `Snapshot ${version} swapped in via the SPSC triple-buffer atomic flip — the engine never stalls, never reads a half-updated snapshot (src/lib/snapshotUpdate.ts → snapshot-plan.md Step 12, FreeEQ8 SPSC triple-buffer)`;
    case 'packet-hits':
      return `The first packet after the flip hit the new snapshot ${version} — the update stream is complete and local replies resume at 0 SP (src/lib/snapshotUpdate.ts)`;
    case 'alert-shown':
      return `Snapshot update alert shown for ${version} — a new snapshot is required and the user has not dismissed this version (src/lib/snapshotUpdate.ts shouldShowSnapshotAlert)`;
    case 'alert-dismissed':
      return `User dismissed the snapshot update alert for ${version} with "do not show again" — this version will not alert again; the update itself still proceeds (src/lib/snapshotUpdate.ts dismissSnapshotAlertVersion)`;
    case 'failed':
      return `Snapshot update for ${version} failed — the installed snapshot stays current; the failure is recorded, never hidden (src/lib/snapshotUpdate.ts)`;
  }
}
