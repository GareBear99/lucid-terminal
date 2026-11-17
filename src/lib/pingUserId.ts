/**
 * Per-profile ping-server identity (Fix 1, 2026-11-17).
 *
 * The bug Gary found: the client sent ONE per-install id as
 * `x-lucid-user` on every ping-server call, whatever profile was
 * active — so Guest showed Genesis's verified bucket (1196 SP)
 * and Genesis's verified grant lived on a bucket no profile
 * owned. The server stores SP per user id (one Durable Object
 * record per id), so the client must send the ACTIVE profile's
 * id: Guest sends its own profile id (its own 100-SP bucket,
 * never verified), Genesis sends its profile id (its own
 * verified 1196-SP bucket), Default/Verify send theirs.
 *
 * The profile id is the store id (`profile-<uuid>`, see
 * newProfileId in src/stores/profileStore.ts) — NOT the TEMP-
 * display id (TEMP-C858AA0 is a display label for a guest's
 * temp, not the id the server keys on). The server accepts
 * profile ids (its userId() pattern allows letters, digits,
 * '.', '_' and '-', up to 128 chars).
 *
 * This module is pure (no electron, no store imports) so the
 * main process (electron/services/pingServer.ts) and the
 * renderer can share it, and so tests can import it directly.
 */

/**
 * The server's user-id shape (worker.js userId()):
 * 1–128 chars of letters, digits, '.', '_' and '-'. A profile
 * id that does not match is not sent — the caller falls back
 * to the install id instead of sending a value the server
 * would reject.
 */
export const PING_USER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function isValidPingUserId(value: unknown): value is string {
  return typeof value === 'string' && PING_USER_ID_PATTERN.test(value);
}

/**
 * The `x-lucid-user` value for a ping-server call: the active
 * profile's id when it is a valid server user id, otherwise
 * the per-install fallback id. The fallback keeps old callers
 * (and the tests) working — a call with no profile in context
 * still sends a usable id, and a profile id is never replaced
 * by the install id when it is valid.
 */
export function resolvePingUserId(
  profileId: string | null | undefined,
  fallbackInstallId: string,
): string {
  return isValidPingUserId(profileId) ? profileId : fallbackInstallId;
}

/**
 * The label the SP display shows next to the balance, so the
 * count is never unlabeled again ("Genesis — 1196/1196 left",
 * "Guest — 100/200 left"). Falls back to "Install" when no
 * profile name is known — the count is still labeled, never
 * bare.
 */
export function pingUserLabel(profileName: string | null | undefined): string {
  const name = typeof profileName === 'string' ? profileName.trim() : '';
  return name === '' ? 'Install' : name;
}
