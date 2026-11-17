/**
 * Ping-user rebind for verified profiles (Fix 1 migration,
 * 2026-11-17).
 *
 * The problem: Genesis's verified grant lives on the OLD
 * per-install `x-lucid-user` bucket — the client sent the
 * install id for every profile, so the server bound Genesis's
 * temp record (and its verified grant) to that install id.
 * Switching the client to per-profile ids orphans the grant:
 * Genesis's new profile-id bucket starts at 100 SP,
 * unverified, and the grab keeps re-marking the install-id
 * bucket (the temp record's stored ownerUserId).
 *
 * The repair: re-activate Genesis's temp once, with the new
 * profile-id header. The server's re-activation (resumed)
 * path returns the ORIGINAL tick and re-marks the SP bucket
 * using the CURRENT request header's id when the record is
 * verified — verified is sticky in the Durable Object, so the
 * grant persists on the profile-id bucket from then on. One
 * re-activation per profile per session is enough; the server
 * answers the resumed path idempotently, so a repeat is
 * harmless but pointless.
 *
 * Never for guests: guests never activate a temp (their
 * session is wiped on leave, nothing persists), and a guest
 * rebind would bind a guest temp to the server. The caller
 * passes isGuest explicitly — this module never guesses from
 * the profile status alone.
 *
 * Fire-and-forget, best-effort: a failed rebind (offline,
 * server down) never blocks the sync or the flip — the next
 * sync retries it (the dedup is per session, not persisted).
 * `activateFn` is injectable so tests can capture the call
 * without touching IPC.
 */

import { isValidPingUserId } from './pingUserId';

/** Profiles already rebound this session — one rebind each. */
const reboundThisSession = new Set<string>();

export function hasReboundPingUserThisSession(profileId: string): boolean {
  return reboundThisSession.has(profileId);
}

/** Test hook: forget the session dedup (tests only). */
export function resetPingUserRebindSession(): void {
  reboundThisSession.clear();
}

export type PingUserRebindActivateFn = (
  profileId: string,
  referralId?: string | null,
) => Promise<unknown>;

/**
 * Re-activate a verified profile's temp under its profile id,
 * moving the verified grant from the install-id bucket to the
 * profile-id bucket. No-op for guests, invalid ids, and
 * profiles already rebound this session.
 */
export function rebindPingUserForVerifiedProfile(
  profileId: string | null | undefined,
  isGuest: boolean,
  activateFn: PingUserRebindActivateFn = (id, referralId) =>
    window.lucidAPI?.ai?.activateTemp?.(id, referralId ?? null) ??
    Promise.resolve(null),
): void {
  if (isGuest) return;
  if (!isValidPingUserId(profileId)) return;
  if (reboundThisSession.has(profileId)) return;
  reboundThisSession.add(profileId);
  void Promise.resolve()
    .then(() => activateFn(profileId, null))
    .catch((error) => {
      // Best-effort: the grant stays on the old bucket until
      // the next sync retries. Never throw into the caller.
      console.warn('[ping] verified profile rebind failed', error);
    });
}
