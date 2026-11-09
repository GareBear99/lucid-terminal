/**
 * Snapshot auto-update tests (Gary, 2026-11-09 ~14:51–14:52 PST).
 *
 * When training is done and a new snapshot is published,
 * everyone's next pull is different and the new snapshot is
 * REQUIRED — an alert shows, with a "do not show again" box.
 * The update itself still proceeds (required); the dismissal
 * only silences the notice, once per version. Every step is a
 * tick in the event ring (SPSC, cap 512), 0 neurons, 0 SP,
 * inside the free-tier allowances (10,000 neurons/day,
 * 100,000 actions/day).
 *
 * Covers: required when no snapshot is installed, when the
 * version differs, when the hash differs; not required when
 * version + hash match; the alert fires once per new version
 * (dismissed versions never alert again, the next version
 * still alerts); dismissal appends, dedupes, and caps; the
 * check result carries the reason; stage labels + diagnoses
 * name the code path.
 *
 * Run with: npx vitest run tests/snapshotUpdate.test.ts
 */
import { describe, test, expect } from 'vitest';
import {
  ACTIONS_PER_DAY_CAP,
  NEURONS_PER_DAY_CAP,
  SNAPSHOT_DISMISSED_VERSIONS_LIMIT,
  checkSnapshotUpdate,
  diagnoseSnapshotUpdate,
  dismissSnapshotAlertVersion,
  isSnapshotUpdateRequired,
  shouldShowSnapshotAlert,
  snapshotUpdateStageLabel,
  type InstalledSnapshot,
  type SnapshotManifest,
} from '../src/lib/snapshotUpdate';

const MANIFEST_V1: SnapshotManifest = {
  version: 'v1',
  sha256: 'a'.repeat(64),
  downloadUrl: 'https://example.invalid/snapshot-v1.gguf',
  whatChanged: 'First trained snapshot.',
};

const MANIFEST_V2: SnapshotManifest = {
  version: 'v2',
  sha256: 'b'.repeat(64),
  downloadUrl: 'https://example.invalid/snapshot-v2.gguf',
  whatChanged: 'Retrained on the bigger corpus.',
};

const INSTALLED_V1: InstalledSnapshot = {
  version: 'v1',
  sha256: 'a'.repeat(64),
  verified: true,
};

describe('free-tier allowances', () => {
  test('the caps are the Cloudflare free tier — no paid plan', () => {
    expect(NEURONS_PER_DAY_CAP).toBe(10_000);
    expect(ACTIONS_PER_DAY_CAP).toBe(100_000);
  });
});

describe('isSnapshotUpdateRequired', () => {
  test('required when no snapshot is installed', () => {
    expect(isSnapshotUpdateRequired(null, MANIFEST_V1)).toBe(true);
  });

  test('not required when version and hash match', () => {
    expect(isSnapshotUpdateRequired(INSTALLED_V1, MANIFEST_V1)).toBe(false);
  });

  test('required when the manifest version is newer', () => {
    expect(isSnapshotUpdateRequired(INSTALLED_V1, MANIFEST_V2)).toBe(true);
  });

  test('required when the version matches but the hash differs — the hash IS the identity', () => {
    const sameVersionOtherHash: SnapshotManifest = {
      ...MANIFEST_V1,
      sha256: 'c'.repeat(64),
    };
    expect(isSnapshotUpdateRequired(INSTALLED_V1, sameVersionOtherHash)).toBe(true);
  });
});

describe('shouldShowSnapshotAlert — once per new version', () => {
  test('shows when an update is required and the version was never dismissed', () => {
    expect(shouldShowSnapshotAlert(INSTALLED_V1, MANIFEST_V2, [])).toBe(true);
  });

  test('does not show when nothing is required', () => {
    expect(shouldShowSnapshotAlert(INSTALLED_V1, MANIFEST_V1, [])).toBe(false);
  });

  test('does not show again for a dismissed version', () => {
    expect(shouldShowSnapshotAlert(INSTALLED_V1, MANIFEST_V2, ['v2'])).toBe(false);
  });

  test('still shows for the NEXT version after dismissing the last one', () => {
    const manifestV3: SnapshotManifest = {
      ...MANIFEST_V2,
      version: 'v3',
      sha256: 'd'.repeat(64),
    };
    expect(shouldShowSnapshotAlert(INSTALLED_V1, manifestV3, ['v2'])).toBe(true);
  });

  test('shows for a first install (no snapshot) when nothing was dismissed', () => {
    expect(shouldShowSnapshotAlert(null, MANIFEST_V1, [])).toBe(true);
  });
});

describe('dismissSnapshotAlertVersion', () => {
  test('appends the version', () => {
    expect(dismissSnapshotAlertVersion([], 'v2')).toEqual(['v2']);
  });

  test('dedupes — dismissing twice records once', () => {
    expect(dismissSnapshotAlertVersion(['v2'], 'v2')).toEqual(['v2']);
  });

  test('caps the list — oldest dismissals fall off', () => {
    const many = Array.from({ length: SNAPSHOT_DISMISSED_VERSIONS_LIMIT }, (_, i) => `v${i}`);
    const next = dismissSnapshotAlertVersion(many, 'v-new');
    expect(next).toHaveLength(SNAPSHOT_DISMISSED_VERSIONS_LIMIT);
    expect(next).not.toContain('v0');
    expect(next[next.length - 1]).toBe('v-new');
  });
});

describe('checkSnapshotUpdate', () => {
  test('no update: not required, no alert, reason says it matches', () => {
    const result = checkSnapshotUpdate(INSTALLED_V1, MANIFEST_V1, []);
    expect(result.required).toBe(false);
    expect(result.showAlert).toBe(false);
    expect(result.reason).toMatch(/matches/);
  });

  test('first install: required, alert shows, reason says so', () => {
    const result = checkSnapshotUpdate(null, MANIFEST_V1, []);
    expect(result.required).toBe(true);
    expect(result.showAlert).toBe(true);
    expect(result.reason).toMatch(/No snapshot installed/);
  });

  test('newer version: required, alert shows, reason names both versions', () => {
    const result = checkSnapshotUpdate(INSTALLED_V1, MANIFEST_V2, []);
    expect(result.required).toBe(true);
    expect(result.showAlert).toBe(true);
    expect(result.reason).toMatch(/v2/);
    expect(result.reason).toMatch(/v1/);
  });

  test('dismissed version: required, but the alert does NOT show', () => {
    const result = checkSnapshotUpdate(INSTALLED_V1, MANIFEST_V2, ['v2']);
    expect(result.required).toBe(true);
    expect(result.showAlert).toBe(false);
  });

  test('hash mismatch on the same version: required, reason says hash', () => {
    const otherHash: SnapshotManifest = { ...MANIFEST_V1, sha256: 'c'.repeat(64) };
    const result = checkSnapshotUpdate(INSTALLED_V1, otherHash, []);
    expect(result.required).toBe(true);
    expect(result.reason).toMatch(/hash/);
  });
});

describe('stage labels + diagnoses', () => {
  test('every stage has a label and a diagnosis naming the path', () => {
    const stages = [
      'detected',
      'ping-fallback',
      'downloading',
      'hash-verified',
      'flipped',
      'packet-hits',
      'alert-shown',
      'alert-dismissed',
      'failed',
    ] as const;
    for (const stage of stages) {
      expect(snapshotUpdateStageLabel(stage).length).toBeGreaterThan(0);
      const diagnosis = diagnoseSnapshotUpdate(stage, 'v2');
      expect(diagnosis).toContain('v2');
      expect(diagnosis).toMatch(/src\/lib\/snapshotUpdate\.ts|snapshot-plan\.md/);
    }
  });

  test('the flip diagnosis names the SPSC triple-buffer', () => {
    expect(diagnoseSnapshotUpdate('flipped', 'v2')).toMatch(/triple-buffer/);
  });

  test('the hash-verified diagnosis says verified BEFORE the swap', () => {
    expect(diagnoseSnapshotUpdate('hash-verified', 'v2')).toMatch(/BEFORE the swap/);
  });
});
