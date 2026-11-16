/**
 * Daily-verification issuance — status application (dailies half 5).
 *
 * The verdict comes DOWN through the FixNet connection (Phase 4):
 * the client sync (src/lib/fixnetSync.ts) pulls the published
 * status table from the FixNet repo's GitHub Pages site every 6
 * hours and on startup, and calls this module when a local temp
 * is verified in it. The issuance for a profile is its verified
 * tick in the published table — the proof, never self-reported.
 *
 * This module is the named call site that receives that
 * issuance. Its one function applies it: `markGateVerified` with
 * the `daily-check` gate, which flips a temp to status `verified`
 * (the temp discards temp status) — it does NOT flip to `user`
 * (only `telegram` does that; temp → user via the daily feed is
 * the following step). Guests never verify: `markGateVerified`
 * already refuses them, and this path must not special-case
 * around it.
 *
 * Do NOT call this from any UI, button, or local flow: there is
 * no local "verify this profile" path, and no self-reported
 * verified state. The only caller is the FixNet sync.
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
