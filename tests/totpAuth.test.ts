/**
 * Google Authenticator (TOTP) renderer tests (Gary, 2026-11-10
 * ~05:37 PST).
 *
 * Authenticator is the second factor on the Google sign-in: RFC
 * 6238 TOTP (SHA-1, 30-second steps, 6 digits), the algorithm
 * Google Authenticator speaks. These tests cover the pure pieces:
 * base32 encode/decode, secret generation, the otpauth:// URI,
 * the code for a moment, and the ±1-step verification window —
 * against the published RFC 6238 test vectors, so no test needs
 * a real secret or a real Authenticator app.
 *
 * The secret in the vectors below is the RFC's own published
 * test value (ASCII "12345678901234567890") — a test vector,
 * never a real credential. No test here logs, stores, or
 * displays a real secret.
 */
import { describe, it, expect } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildTotpAuthUri,
  generateTotpSecret,
  isTotpCodeFormat,
  totpCode,
  totpCodeForCounter,
  verifyTotpCode,
} from '../src/lib/totpAuth';

/** The RFC 6238 test secret: ASCII "12345678901234567890". */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** RFC 6238 Appendix B, SHA-1 vectors (8-digit code → last 6
 *  digits, the 6-digit code Authenticator shows). */
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('base32Encode / base32Decode', () => {
  it('round-trips the RFC test secret', () => {
    const bytes = new TextEncoder().encode('12345678901234567890');
    expect(base32Encode(bytes)).toBe(RFC_SECRET);
    expect(base32Decode(RFC_SECRET)).toEqual(bytes);
  });

  it('tolerates lowercase and padding on decode', () => {
    expect(base32Decode('gezdgnbvgy3tqojqgezdgnbvgy3tqojq')).toEqual(
      base32Decode(RFC_SECRET),
    );
    expect(base32Decode(`${RFC_SECRET}====`)).toEqual(base32Decode(RFC_SECRET));
  });

  it('refuses a secret that is not base32', () => {
    expect(base32Decode('not-base32!')).toBeNull();
    expect(base32Decode('')).toBeNull();
    expect(base32Decode('   ')).toBeNull();
  });
});

describe('generateTotpSecret', () => {
  it('makes a 32-character base32 secret, different every time', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(b).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a)?.length).toBe(20);
  });
});

describe('buildTotpAuthUri', () => {
  it('builds the otpauth URI Authenticator enrols from', () => {
    const uri = buildTotpAuthUri(RFC_SECRET);
    expect(uri).toBe(
      `otpauth://totp/Lucid:Lucid?secret=${RFC_SECRET}&issuer=Lucid&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('labels the entry with the Google account email when one is given (Gary, 2026-11-10)', () => {
    const uri = buildTotpAuthUri(RFC_SECRET, 'gary@example.com');
    expect(uri).toBe(
      `otpauth://totp/Lucid:gary%40example.com?secret=${RFC_SECRET}&issuer=Lucid&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('falls back to Lucid for an empty account', () => {
    expect(buildTotpAuthUri(RFC_SECRET, '   ')).toBe(
      `otpauth://totp/Lucid:Lucid?secret=${RFC_SECRET}&issuer=Lucid&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe('totpCode', () => {
  it('matches the RFC 6238 vectors, as 6-digit codes', async () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(await totpCode(RFC_SECRET, seconds * 1000)).toBe(expected);
      expect(await totpCodeForCounter(RFC_SECRET, BigInt(Math.floor(seconds / 30)))).toBe(expected);
    }
  });

  it('returns null for a secret that is not base32', async () => {
    expect(await totpCode('not-base32!', 59_000)).toBeNull();
  });
});

describe('isTotpCodeFormat', () => {
  it('accepts exactly 6 digits, nothing else', () => {
    expect(isTotpCodeFormat('123456')).toBe(true);
    expect(isTotpCodeFormat('081804')).toBe(true);
    expect(isTotpCodeFormat('12345')).toBe(false);
    expect(isTotpCodeFormat('1234567')).toBe(false);
    expect(isTotpCodeFormat('12345a')).toBe(false);
    expect(isTotpCodeFormat('')).toBe(false);
    expect(isTotpCodeFormat(' 123456 ')).toBe(true);
  });
});

describe('verifyTotpCode', () => {
  it('accepts the code for the current step', async () => {
    expect(await verifyTotpCode(RFC_SECRET, '081804', 1111111109 * 1000)).toBe(true);
  });

  it('accepts ±1 step of clock skew', async () => {
    const now = 1111111109 * 1000;
    // The code from the step before and the step after.
    const prev = await totpCode(RFC_SECRET, now - 30_000);
    const next = await totpCode(RFC_SECRET, now + 30_000);
    expect(prev).not.toBe('081804');
    expect(next).not.toBe('081804');
    expect(await verifyTotpCode(RFC_SECRET, prev!, now)).toBe(true);
    expect(await verifyTotpCode(RFC_SECRET, next!, now)).toBe(true);
  });

  it('refuses a wrong code, a bad format, and a bad secret', async () => {
    const now = 1111111109 * 1000;
    expect(await verifyTotpCode(RFC_SECRET, '000000', now)).toBe(false);
    expect(await verifyTotpCode(RFC_SECRET, '12345', now)).toBe(false);
    expect(await verifyTotpCode(RFC_SECRET, '12345a', now)).toBe(false);
    expect(await verifyTotpCode('not-base32!', '081804', now)).toBe(false);
    // Two steps away is outside the window.
    const far = await totpCode(RFC_SECRET, now + 60_000);
    expect(await verifyTotpCode(RFC_SECRET, far!, now)).toBe(false);
  });
});
