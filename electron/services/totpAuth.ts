/**
 * Google Authenticator (TOTP) — the main-process mirror of
 * src/lib/totpAuth.ts (Gary, 2026-11-10 ~05:37 PST).
 *
 * The mirror exists because the Electron main process must not
 * import from src/ (see the TS6307 note in electron/main.ts) —
 * the same reason googleDriveAuth.ts is mirrored in
 * electron/services/googleDriveOAuth.ts. Keep the two identical
 * by hand: RFC 6238, SHA-1, 30-second steps, 6 digits, ±1 step
 * of clock skew, base32 secrets.
 *
 * The difference is the crypto: main uses Node's crypto
 * (createHmac) instead of WebCrypto, and this file is the one
 * that touches the stored secret — verifyTotpCodeAgainstStored
 * reads it from secureStorage (totp-secret) and checks the typed
 * code here, so the secret never crosses into the renderer after
 * enrollment. The renderer generates the secret and verifies the
 * enrollment code locally (in memory only, never persisted until
 * it verifies); every later check comes here over IPC
 * (settings:verifyTotpCode).
 */
import { createHmac } from 'node:crypto';
import { totpSecretStorage } from './secureStorage';

/** TOTP step: 30 seconds, per RFC 6238. */
export const TOTP_PERIOD_MS = 30_000;

/** Digits in the code Google Authenticator shows. */
export const TOTP_DIGITS = 6;

/** Base32 alphabet (RFC 4648). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode a base32 secret (padding tolerated, case-insensitive).
 *  Returns null when the secret is not base32 at all. */
export function base32Decode(secret: string): Buffer | null {
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
  return Buffer.from(out);
}

/** The 6-digit code for one counter value (dynamic truncation,
 *  RFC 4226 §5.3). The counter is a plain number here, not a
 *  BigInt — the node tsconfig targets below ES2020, so BigInt
 *  literals do not compile, and a counter fits in a number
 *  exactly (2^53 is far above any real counter). */
export function totpCodeForCounter(secret: string, counter: number): string | null {
  const keyBytes = base32Decode(secret);
  if (keyBytes === null || keyBytes.length === 0) return null;
  const counterBytes = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c % 256;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac('sha1', keyBytes).update(counterBytes).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Whether a typed code has the shape of a TOTP code at all:
 *  exactly 6 digits. */
export function isTotpCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * Check a typed 6-digit code against a secret, allowing ±1 step
 * of clock skew. Returns false for a bad format, a bad secret,
 * or a code outside the window.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
): boolean {
  const trimmed = code.trim();
  if (!isTotpCodeFormat(trimmed)) return false;
  const counter = Math.floor(nowMs / TOTP_PERIOD_MS);
  for (const step of [-1, 0, 1]) {
    const expected = totpCodeForCounter(secret, counter + step);
    if (expected !== null && expected === trimmed) return true;
  }
  return false;
}

/**
 * Check a typed code against the STORED secret (the one
 * enrollment saved in secureStorage). False when no secret is
 * stored — nothing is enrolled, so no code can count.
 *
 * BRUTE-FORCE LOCKOUT (Gary, 2026-11-10 ~05:40 PST: "make sure
 * it's all super safe"): a 6-digit code is only a million
 * possibilities, so unlimited guesses would be a hole — the same
 * reason SlushAI bans PIN attempts (5 failures → ban). After 5
 * consecutive wrong codes the check refuses for 10 minutes
 * (retryAfterMs says how long). The lockout is IN MEMORY: it
 * resets when Lucid restarts. That is honest about what it is —
 * it stops automated guessing through the UI/IPC, it is NOT a
 * defence against someone who already owns the machine (they
 * could restart Lucid, and they have bigger access anyway). A
 * lockout never bricks the user: "Remove Authenticator" (delete
 * the secret) always stays available, so the worst case is
 * re-enrolling. A correct code clears the failure count.
 */
const MAX_FAILED_TOTP_ATTEMPTS = 5;
const TOTP_LOCKOUT_MS = 10 * 60_000;

let failedTotpAttempts = 0;
let totpLockedUntilMs = 0;

export interface TotpVerification {
  ok: boolean;
  locked: boolean;
  /** Milliseconds until the lockout lifts; 0 when not locked. */
  retryAfterMs: number;
}

export function verifyTotpCodeAgainstStored(
  code: string,
  nowMs: number = Date.now(),
): TotpVerification {
  if (nowMs < totpLockedUntilMs) {
    return { ok: false, locked: true, retryAfterMs: totpLockedUntilMs - nowMs };
  }
  const secret = totpSecretStorage.getTotpSecret();
  if (secret === null) {
    return { ok: false, locked: false, retryAfterMs: 0 };
  }
  const ok = verifyTotpCode(secret, code, nowMs);
  if (ok) {
    failedTotpAttempts = 0;
    return { ok: true, locked: false, retryAfterMs: 0 };
  }
  failedTotpAttempts += 1;
  if (failedTotpAttempts >= MAX_FAILED_TOTP_ATTEMPTS) {
    totpLockedUntilMs = nowMs + TOTP_LOCKOUT_MS;
    failedTotpAttempts = 0;
    return { ok: false, locked: true, retryAfterMs: TOTP_LOCKOUT_MS };
  }
  return { ok: false, locked: false, retryAfterMs: 0 };
}

/** Test seam: reset the in-memory lockout state. Tests only —
 *  production code never calls this. */
export function __resetTotpAttemptState(): void {
  failedTotpAttempts = 0;
  totpLockedUntilMs = 0;
}
