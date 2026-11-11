/**
 * Google Authenticator (TOTP) — the second factor for the Google
 * sign-in in Settings > Security (Gary, 2026-11-10 ~05:37 PST):
 * "Security should allow Google Authenticator with Google sign-in,
 * after you're a user, with how the sign-in was set up".
 *
 * Google Authenticator is a TOTP app, NOT Google sign-in itself.
 * Google sign-in is the identity: in Lucid that is the Google
 * Drive segment's desktop OAuth (PKCE, no client secret —
 * src/lib/googleDriveAuth.ts). In SlushAI the same shape is
 * Authlib OAuth (scope openid email profile, /auth/login →
 * authorize_redirect, /auth/callback) with a 6-digit PIN as the
 * second factor for staff accounts. Lucid has no email, so the
 * local equivalent of that second factor is TOTP: Google
 * Authenticator takes a secret and shows a 6-digit code.
 *
 * This file is the renderer-side TOTP: RFC 6238 (SHA-1, 30-second
 * steps, 6 digits), the algorithm Google Authenticator speaks.
 * - generateTotpSecret: a fresh 20-byte secret, base32, for one
 *   enrollment. Shown ONCE during enrollment so it can be typed
 *   into Authenticator (manual setup-key entry — Lucid has no QR
 *   library); never shown again after enrollment completes, and
 *   never logged or copied by a button.
 * - buildTotpAuthUri: the otpauth:// URI the secret encodes
 *   (issuer Lucid, account = the Google account email when it
 *   is known — the label syncs with the Google account signed
 *   in, Gary 2026-11-10 ~06:10 PST — and 'Lucid' when no email
 *   is known). The Security tab stores the email as
 *   googleAccountEmail when it captures it via userinfo.
 * - totpCode / verifyTotpCode: the code for a moment, and the
 *   check of a code the user types, ±1 step of clock skew.
 *   `nowMs` is injectable so tests use the RFC 6238 vectors and
 *   never depend on the wall clock.
 * - The secret is stored ONLY after a code verifies during
 *   enrollment (electron/services/secureStorage.ts,
 *   totpSecretStorage — the same pattern as the ping key, the
 *   Stripe key and the Telegram bot token). After that the
 *   renderer only ever sees whether one is stored
 *   (hasTotpSecret); a stored secret is verified in the main
 *   process (electron/services/totpAuth.ts, the mirror of this
 *   file — main must not import from src/, so the two are kept
 *   identical by hand, the same as googleDriveAuth ↔
 *   googleDriveOAuth), because the secret never crosses into the
 *   renderer after storage.
 *
 * What this file does NOT do: enforce anything. There is no
 * Lucid user account yet (temp → verified → Telegram → full
 * user, and the account/temp system is NOT built — see the
 * Telegram segment), so there is no sign-in gate to require 2FA
 * at. Authenticator is OPTIONAL, not required — Gary decided
 * that (2026-11-10 ~06:10 PST: "not required just lose and
 * there if you need"). Enrollment here secures the Google
 * sign-in on this install; it is never required to sign in.
 * Nothing here fakes a gate.
 */

/** TOTP step: 30 seconds, per RFC 6238. */
export const TOTP_PERIOD_MS = 30_000;

/** Digits in the code Google Authenticator shows. */
export const TOTP_DIGITS = 6;

/** The issuer shown in Google Authenticator for a Lucid entry. */
export const TOTP_ISSUER = 'Lucid';

/** The account shown in Google Authenticator for a Lucid entry.
 *  'Lucid' is the fallback — the account is the Google account
 *  email when it is known (the label syncs with the Google
 *  account signed in, Gary 2026-11-10 ~06:10 PST; the Security
 *  tab passes the email it captured via userinfo). */
export const TOTP_ACCOUNT = 'Lucid';

/** Base32 alphabet (RFC 4648), no padding in the secrets this
 *  file generates — Google Authenticator accepts unpadded. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as base32 (RFC 4648), no padding. */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return out;
}

/** Decode a base32 secret (padding tolerated, case-insensitive).
 *  Returns null when the secret is not base32 at all — a bad
 *  secret is refused, never silently treated as empty. */
export function base32Decode(secret: string): Uint8Array | null {
  const clean = secret.trim().toUpperCase().replace(/=+$/, '');
  if (clean.length === 0) return null;
  if (/[^A-Z2-7]/.test(clean)) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** A fresh TOTP secret for one enrollment: 20 random bytes (160
 *  bits — the RFC 6238 recommendation), base32. The randomness
 *  comes from the platform, never Math.random. */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** The otpauth:// URI the enrollment encodes: what a QR code
 *  would carry, and what the manual setup-key entry in Google
 *  Authenticator amounts to. No QR library is in Lucid's deps,
 *  so the Security tab shows the setup key as text instead.
 *  `account` is the label the entry shows under in Authenticator
 *  — the Google account email when it is known (the label syncs
 *  with the Google account signed in), 'Lucid' otherwise. An
 *  empty account falls back to 'Lucid'; no account name is ever
 *  invented from nothing. */
export function buildTotpAuthUri(secret: string, account: string = TOTP_ACCOUNT): string {
  const label = account.trim() === '' ? TOTP_ACCOUNT : account.trim();
  const params = new URLSearchParams({
    secret: secret.trim().toUpperCase(),
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(label)}?${params.toString()}`;
}

/** The HMAC-SHA1 of one counter, via WebCrypto. */
async function hmacSha1(keyBytes: Uint8Array, counter: bigint): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const signature = await crypto.subtle.sign('HMAC', key, counterBytes as BufferSource);
  return new Uint8Array(signature);
}

/** The 6-digit code for one counter value (dynamic truncation,
 *  RFC 4226 §5.3). */
export async function totpCodeForCounter(
  secret: string,
  counter: bigint,
): Promise<string | null> {
  const keyBytes = base32Decode(secret);
  if (keyBytes === null || keyBytes.length === 0) return null;
  const hmac = await hmacSha1(keyBytes, counter);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** The 6-digit code Google Authenticator shows right now for
 *  this secret. Returns null for a secret that is not base32. */
export async function totpCode(secret: string, nowMs: number = Date.now()): Promise<string | null> {
  const counter = BigInt(Math.floor(nowMs / TOTP_PERIOD_MS));
  return totpCodeForCounter(secret, counter);
}

/** Whether a typed code has the shape of a TOTP code at all:
 *  exactly 6 digits. Anything else is refused before any
 *  secret is consulted. */
export function isTotpCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * Check a typed 6-digit code against the secret, allowing ±1
 * step of clock skew (the code from just before / just after
 * this step still counts — Authenticator and Lucid clocks are
 * rarely exact). Returns false for a bad format, a bad secret,
 * or a code outside the window — never true by accident.
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const trimmed = code.trim();
  if (!isTotpCodeFormat(trimmed)) return false;
  const counter = BigInt(Math.floor(nowMs / TOTP_PERIOD_MS));
  for (const step of [-1n, 0n, 1n]) {
    const expected = await totpCodeForCounter(secret, counter + step);
    if (expected !== null && expected === trimmed) return true;
  }
  return false;
}
