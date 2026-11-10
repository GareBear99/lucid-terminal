/**
 * Google Authenticator (TOTP) main-process tests (Gary,
 * 2026-11-10 ~05:37 + ~05:40 PST).
 *
 * The main process is the one that touches the STORED secret:
 * verifyTotpCodeAgainstStored reads it from secureStorage
 * (totp-secret) and checks the typed code here, so the secret
 * never crosses into the renderer after enrollment. Electron is
 * mocked here — safeStorage encrypts with a reversible stand-in
 * and electron-store is an in-memory map — the same pattern as
 * tests/googleDriveTokenStorage.test.ts. The test proves the
 * round-trip through the real secureStorage + totpSecretStorage
 * code (set -> has -> get returns the same secret, delete clears
 * it), the stored-secret check against the published RFC 6238
 * vectors, and the brute-force lockout: 5 wrong codes in a row
 * lock the check for 10 minutes, a correct code clears the
 * count, and the lockout lifts after its time.
 *
 * The secret in the vectors below is the RFC's own published
 * test value (ASCII "12345678901234567890") — a test vector,
 * never a real credential. No test here logs, stores, or
 * displays a real secret.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => {
  return {
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
    },
  };
});

vi.mock('electron-store', () => ({
  default: class {
    private data = new Map<string, unknown>();
    constructor(_opts?: unknown) {}
    get(key: string) {
      return this.data.get(key);
    }
    set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    has(key: string) {
      return this.data.has(key);
    }
    delete(key: string) {
      this.data.delete(key);
    }
    clear() {
      this.data.clear();
    }
    get store() {
      return Object.fromEntries(this.data);
    }
  },
}));

import {
  __resetTotpAttemptState,
  totpCodeForCounter,
  verifyTotpCode,
  verifyTotpCodeAgainstStored,
} from '../electron/services/totpAuth';
import { totpSecretStorage } from '../electron/services/secureStorage';

/** The RFC 6238 test secret: ASCII "12345678901234567890". */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** One RFC vector moment: T=1111111109 → 6-digit code 081804. */
const NOW_MS = 1111111109 * 1000;
const CODE_AT_NOW = '081804';

beforeEach(() => {
  __resetTotpAttemptState();
  totpSecretStorage.deleteTotpSecret();
});

describe('totpSecretStorage', () => {
  it('round-trips the secret: set -> has -> get returns it, delete clears it', () => {
    expect(totpSecretStorage.hasTotpSecret()).toBe(false);
    expect(totpSecretStorage.getTotpSecret()).toBeNull();
    totpSecretStorage.setTotpSecret(RFC_SECRET);
    expect(totpSecretStorage.hasTotpSecret()).toBe(true);
    expect(totpSecretStorage.getTotpSecret()).toBe(RFC_SECRET);
    totpSecretStorage.deleteTotpSecret();
    expect(totpSecretStorage.hasTotpSecret()).toBe(false);
    expect(totpSecretStorage.getTotpSecret()).toBeNull();
  });
});

describe('main totpCodeForCounter', () => {
  it('matches the RFC 6238 vectors (number counter, no BigInt)', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, expected] of vectors) {
      expect(totpCodeForCounter(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected);
    }
  });

  it('agrees with the renderer check on a live code', () => {
    expect(verifyTotpCode(RFC_SECRET, CODE_AT_NOW, NOW_MS)).toBe(true);
    expect(verifyTotpCode(RFC_SECRET, '000000', NOW_MS)).toBe(false);
  });
});

describe('verifyTotpCodeAgainstStored', () => {
  it('is not ok when nothing is enrolled', () => {
    expect(verifyTotpCodeAgainstStored(CODE_AT_NOW, NOW_MS)).toEqual({
      ok: false,
      locked: false,
      retryAfterMs: 0,
    });
  });

  it('checks a code against the stored secret — never the value itself', () => {
    totpSecretStorage.setTotpSecret(RFC_SECRET);
    expect(verifyTotpCodeAgainstStored(CODE_AT_NOW, NOW_MS).ok).toBe(true);
    expect(verifyTotpCodeAgainstStored('000000', NOW_MS).ok).toBe(false);
    // The stored secret is still only readable as "stored" from
    // the renderer side — this test's get is the main-process
    // path, and the value never leaves in a result object.
    const result = verifyTotpCodeAgainstStored(CODE_AT_NOW, NOW_MS);
    expect(JSON.stringify(result)).not.toContain(RFC_SECRET);
  });

  it('locks after 5 wrong codes in a row, and lifts after 10 minutes', () => {
    totpSecretStorage.setTotpSecret(RFC_SECRET);
    for (let i = 0; i < 4; i++) {
      const result = verifyTotpCodeAgainstStored('000000', NOW_MS + i * 1000);
      expect(result).toEqual({ ok: false, locked: false, retryAfterMs: 0 });
    }
    // The 5th wrong code trips the lockout.
    const locked = verifyTotpCodeAgainstStored('000000', NOW_MS + 5000);
    expect(locked.ok).toBe(false);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterMs).toBe(10 * 60 * 1000);
    // Even the right code is refused while locked.
    expect(
      verifyTotpCodeAgainstStored(CODE_AT_NOW, NOW_MS + 6000).ok,
    ).toBe(false);
    // After the lockout lifts, the right code — for THAT later
    // moment, the old code has expired — works again.
    const laterMs = NOW_MS + 11 * 60 * 1000;
    const laterCode = totpCodeForCounter(RFC_SECRET, Math.floor(laterMs / 30_000))!;
    const after = verifyTotpCodeAgainstStored(laterCode, laterMs);
    expect(after).toEqual({ ok: true, locked: false, retryAfterMs: 0 });
  });

  it('a correct code clears the failure count', () => {
    totpSecretStorage.setTotpSecret(RFC_SECRET);
    for (let i = 0; i < 4; i++) {
      expect(verifyTotpCodeAgainstStored('000000', NOW_MS + i * 1000).locked).toBe(false);
    }
    expect(verifyTotpCodeAgainstStored(CODE_AT_NOW, NOW_MS + 5000).ok).toBe(true);
    // Four more wrong codes after the reset still do not lock —
    // the count restarted at the correct code.
    for (let i = 0; i < 4; i++) {
      expect(
        verifyTotpCodeAgainstStored('000000', NOW_MS + (6000 + i * 1000)).locked,
      ).toBe(false);
    }
  });
});
