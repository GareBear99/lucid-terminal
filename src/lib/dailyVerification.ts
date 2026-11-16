/**
 * Daily-verification issuance — status application (dailies half 5).
 *
 * The verdict comes DOWN through the FixNet connection (Phase 4),
 * which does not exist yet. When it lands, it carries verification
 * issuance down (server → client, the grab's yield in tick order):
 * the issuance for a profile is its verified tick — the proof,
 * never self-reported.
 *
 * This module is the named call site that will receive that
 * issuance. Its one function applies it: `markGateVerified` with
 * the `daily-check` gate, which flips a temp to status `verified`
 * (the temp discards temp status) — it does NOT flip to `user`
 * (only `telegram` does that; temp → user via the daily feed is
 * the following step). Guests never verify: `markGateVerified`
 * already refuses them, and this path must not special-case
 * around it.
 *
 * AWAITING THE FIXNET CONNECTION — no caller today. Do NOT call
 * this from any UI, button, or local flow: there is no local
 * "verify this profile" path, and no self-reported verified state.
 */

import { useProfileStore } from '../stores/profileStore';

/**
 * Apply a daily-verification issuance for a profile id.
 * Returns true when the gate was recorded (or was already
 * recorded), false on an unknown profile, an unregistered gate,
 * or a guest profile.
 */
export function applyDailyVerificationIssuance(
  profileId: string,
): boolean {
  return useProfileStore
    .getState()
    .markGateVerified(profileId, 'daily-check');
}
