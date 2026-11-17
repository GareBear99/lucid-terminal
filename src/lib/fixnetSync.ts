/**
 * FixNet client sync — the pull-only daily sync (Gary, 2026-11-16).
 *
 * Every 6 hours and on startup, the client syncs TO the repo and
 * pulls the community pool (yield, verified status, corpus data)
 * via GitHub Pages. PULL ONLY, local-only: this module makes ONE
 * call — `window.lucidAPI.fixnet.sync()` — which GETs the Pages
 * files in main. It never uploads, never posts, never sends
 * anything up. Fixes go UP through the 12am grab (the ping
 * server carries the batch), never through this sync.
 *
 * What a sync does with what it pulls:
 * - Status: for every local profile whose temp is `verified` in
 *   the published status table, call applyDailyVerificationIssuance
 *   (the profile flips temp -> verified). Guests are skipped
 *   outright (they never verify) and a profile that already
 *   verified is left alone.
 * - Deposit: when the day's file carries a deposit entry for a
 *   local verified profile, apply the verified SP grant
 *   (1,000 SP/day, once per day) and toast the flip so the user
 *   sees it. A profile that flips without a deposit entry (its
 *   verification day is not today) still flips — the deposit is
 *   a daily grant, the status is the truth.
 * - Yield: the day's yield (verified_today / corpus numbers) is
 *   returned in the report for the caller to log or show; the
 *   sync does not act on it.
 *
 * Failure: a failed pull (Pages down, no network, malformed
 * payload) logs and returns a failed report — the next sync
 * retries. A failed sync never changes a profile and never
 * toasts. The sync never blocks startup (App calls it
 * best-effort).
 */
import { applyDailyVerificationIssuance } from './dailyVerification';
import { verifiedGrantDay, applyVerifiedSpGrant } from './verifiedSpGrant';
import { rebindPingUserForVerifiedProfile } from './pingUserBinding';
import { useProfileStore } from '../stores/profileStore';
import { useToastStore } from '../stores/toastStore';

/** The sync cadence: every 6 hours (Gary, 2026-11-16) + on startup. */
export const FIXNET_SYNC_INTERVAL_MS = 6 * 3600 * 1000;

export interface FixNetSyncReport {
  ok: boolean;
  /** Profiles that flipped to verified in this sync. */
  verified: string[];
  /** Profiles whose SP grant was recorded in this sync. */
  granted: string[];
  /** The published day, or null when nothing is published yet. */
  day: string | null;
  /** The day's yield, when a daily file was published. */
  yield: {
    verified_today: number;
    verified_total: number;
    corpus_entries_today: number | null;
    corpus_total_entries: number | null;
  } | null;
  /** Why not, when not ok. */
  error?: string;
  pulledAt: string;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncInFlight: Promise<FixNetSyncReport> | null = null;

/**
 * One sync: pull from Pages, apply what came down. Safe to call
 * concurrently — a second call while one is in flight joins the
 * in-flight sync instead of pulling twice.
 */
export async function runFixNetSyncNow(): Promise<FixNetSyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async (): Promise<FixNetSyncReport> => {
    const pulledAt = new Date().toISOString();
    const bridge = window.lucidAPI?.fixnet?.sync;
    if (!bridge) {
      return {
        ok: false,
        verified: [],
        granted: [],
        day: null,
        yield: null,
        error: 'fixnet bridge unavailable',
        pulledAt,
      };
    }
    let pulled;
    try {
      pulled = await bridge();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[fixnet] sync pull failed', message);
      return {
        ok: false,
        verified: [],
        granted: [],
        day: null,
        yield: null,
        error: message,
        pulledAt,
      };
    }

    const verified: string[] = [];
    const granted: string[] = [];
    const day = pulled.day ?? verifiedGrantDay();
    const localProfiles = useProfileStore.getState().profiles;

    // Status: flip every local temp the published table says is verified.
    const byId = new Map(pulled.status.map((entry) => [entry.id, entry]));
    for (const profile of localProfiles) {
      // Guests never verify — skip them outright, before the
      // gate (markGateVerified refuses them too, this is the
      // belt on top of those braces).
      if (profile.status === 'guest') continue;
      const entry = byId.get(profile.id);
      if (!entry || entry.outcome !== 'verified') continue;
      if (profile.status === 'verified' || profile.status === 'user') continue;
      const flipped = applyDailyVerificationIssuance(profile.id);
      if (flipped) {
        verified.push(profile.id);
        // The verified grant lived on the install-id bucket
        // (Fix 1 migration): re-activate under the profile id
        // so the grant moves to this profile's own bucket.
        // Fire-and-forget, never for guests (skipped above).
        rebindPingUserForVerifiedProfile(profile.id, false);
      }
    }

    // Deposit + grant: a verified local profile with a deposit
    // entry for today gets its 1,000 SP/day grant recorded
    // (once per day — the grant module dedups by day). The
    // profiles are re-read fresh here: the status loop above
    // may have just flipped one, and the snapshot it used is
    // stale for that profile.
    const depositIds = new Set(
      (pulled.daily?.deposit.entries ?? []).map((entry) => entry.id),
    );
    for (const profile of useProfileStore.getState().profiles) {
      if (profile.status === 'guest') continue;
      if (!depositIds.has(profile.id)) continue;
      if (profile.status !== 'verified' && profile.status !== 'user') continue;
      // Already verified before this sync (the migration case:
      // Genesis's grant still sits on the install-id bucket) —
      // rebind first so the grant and the quota refresh below
      // land on this profile's own bucket. Fire-and-forget;
      // the next quota refresh converges if it races ahead.
      rebindPingUserForVerifiedProfile(profile.id, false);
      const result = await applyVerifiedSpGrant(profile.id, day);
      if (result.granted) granted.push(profile.id);
    }

    // Tell the user about the flips (only the flips — a sync
    // that changes nothing says nothing).
    for (const profileId of verified) {
      const profile = useProfileStore
        .getState()
        .profiles.find((p) => p.id === profileId);
      const name = profile?.name ?? profileId;
      const hasGrant = granted.includes(profileId);
      useToastStore
        .getState()
        .success(
          hasGrant
            ? `${name} is verified — 1,000 SP a day, from today.`
            : `${name} is verified.`,
        );
    }

    return {
      ok: true,
      verified,
      granted,
      day: pulled.day,
      yield: pulled.daily
        ? {
            verified_today: pulled.daily.yield.verified_today,
            verified_total: pulled.daily.yield.verified_total,
            corpus_entries_today: pulled.daily.yield.corpus_entries_today,
            corpus_total_entries: pulled.daily.yield.corpus_total_entries,
          }
        : null,
      pulledAt,
    };
  })();
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

/**
 * Start the sync: run once now, then every 6 hours. Idempotent —
 * a second start is a no-op (StrictMode double-invoke). Returns a
 * stop function. Best-effort: a failed sync never throws.
 */
export function startFixNetSync(): () => void {
  if (syncTimer) return stopFixNetSync;
  void runFixNetSyncNow().catch((error) => {
    console.warn('[fixnet] startup sync failed', error);
  });
  syncTimer = setInterval(() => {
    void runFixNetSyncNow().catch((error) => {
      console.warn('[fixnet] scheduled sync failed', error);
    });
  }, FIXNET_SYNC_INTERVAL_MS);
  return stopFixNetSync;
}

/** Stop the scheduled sync (tests / shutdown). */
export function stopFixNetSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
