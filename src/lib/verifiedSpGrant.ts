/**
 * Verified SP grant — the client half of the 1,000 SP/day allowance
 * (Gary, 2026-11-16: verified = 1,000 SP/day, SP_VERIFIED_DAILY).
 *
 * The SERVER owns the grant: when the grab verifies a temp it marks
 * the owner's SP bucket verified, and the bucket grants +1,000 SP
 * per UTC day with no cap (the on-hand balance is the cap). This
 * module is the client half: when a profile flips to verified
 * (through the FixNet sync), it records the grant for that profile
 * and refreshes the SP balance from the server so the new balance
 * shows — and it refuses to grant to any profile that is not
 * verified, so a grant can never be self-reported.
 *
 * The grant is recorded per profile, per UTC day
 * (`verifiedSpGrantDay` on the profile record): the deposit is once
 * a day, so a second sync the same day does not re-grant, re-toast,
 * or re-refresh. A new day grants again.
 *
 * Guests never get a grant: they never verify (markGateVerified
 * refuses them), and this module refuses them too.
 */
import { SP_VERIFIED_DAILY } from './sovereignPoints';
import { SP_VERIFIED_PERIOD_SECONDS } from './pingQuota';
import { useAIStore } from '../stores/aiStore';
import { useProfileStore, type Profile } from '../stores/profileStore';

/** The verified grant period: one grant per UTC day. */
export const VERIFIED_SP_RESTOCK_PERIOD_SECONDS = SP_VERIFIED_PERIOD_SECONDS;

/** The SP a verified profile gets per day (sovereignPoints.ts). */
export const VERIFIED_SP_DAILY = SP_VERIFIED_DAILY;

/** Whether a profile counts as verified for the SP grant. */
export function isProfileVerified(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return profile.status === 'verified' || profile.status === 'user';
}

/** Whether the ACTIVE profile is verified (the restock timer reads this). */
export function isActiveProfileVerified(): boolean {
  const state = useProfileStore.getState();
  const active = state.profiles.find((p) => p.id === state.activeProfileId);
  return isProfileVerified(active);
}

/** Today's UTC date (YYYY-MM-DD), the grant-day key. */
export function verifiedGrantDay(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export interface VerifiedSpGrantResult {
  granted: boolean;
  /** Why not, when not granted. */
  reason: string;
}

/**
 * Record the verified SP grant for a profile, for one UTC day.
 * Returns granted:false when the profile is unknown, a guest, not
 * verified, or already granted for this day. On a grant it records
 * the day on the profile and refreshes the SP balance from the
 * server (best-effort: a failed refresh leaves the grant recorded
 * — the server already granted it, the display catches up on the
 * next chat or ping).
 */
export async function applyVerifiedSpGrant(
  profileId: string,
  day: string = verifiedGrantDay(),
): Promise<VerifiedSpGrantResult> {
  const profile = useProfileStore
    .getState()
    .profiles.find((p) => p.id === profileId);
  if (!profile) return { granted: false, reason: 'unknown_profile' };
  if (profile.status === 'guest') return { granted: false, reason: 'guest' };
  if (!isProfileVerified(profile)) {
    return { granted: false, reason: 'not_verified' };
  }
  if (profile.verifiedSpGrantDay === day) {
    return { granted: false, reason: 'already_granted_today' };
  }
  const recorded = useProfileStore.getState().recordVerifiedSpGrant(profileId, day);
  if (!recorded) return { granted: false, reason: 'record_failed' };
  // Refresh the SP balance from the server so the +1,000 shows.
  // Best-effort: never un-grant on a refresh failure. The
  // profile just verified, so the restock timer takes the
  // verified (daily) period.
  try {
    const health = await window.lucidAPI?.ai?.pingServerHealth?.();
    if (health?.quota) {
      useAIStore.getState().setPingQuota(health.quota, true);
    }
  } catch (error) {
    console.warn('[fixnet] verified SP grant recorded, quota refresh failed', error);
  }
  return { granted: true, reason: 'granted' };
}
