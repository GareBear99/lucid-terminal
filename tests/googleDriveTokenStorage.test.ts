/**
 * Google Drive token storage tests (Gary, 2026-11-08).
 *
 * The tokens from the OAuth code exchange are stored encrypted in
 * secureStorage (the same pattern as the Stripe key, the Telegram
 * bot token, the ping key and the OpenAI key). Electron is mocked
 * here — safeStorage encrypts with a reversible stand-in and
 * electron-store is an in-memory map — the same pattern as
 * tests/browserActionsMain.test.ts. The test proves the round-trip
 * through the real secureStorage + googleDriveTokenStorage code:
 * set -> has -> get returns the same tokens, delete clears them,
 * and a corrupt stored value reads back as null instead of
 * crashing the segment.
 *
 * The tokens here are obviously-fake placeholders, never real
 * credentials.
 */
import { describe, it, expect, vi } from 'vitest';

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

import { googleDriveTokenStorage, secureStorage, settings } from '../electron/services/secureStorage';

const TOKENS = {
  accessToken: 'ya29.test-access',
  refreshToken: '1//test-refresh',
  expiresAtMs: Date.now() + 3600 * 1000,
  scope: 'https://www.googleapis.com/auth/drive.file',
};

describe('googleDriveTokenStorage', () => {
  it('round-trips tokens: set -> has -> get returns the same tokens', () => {
    googleDriveTokenStorage.deleteGoogleDriveTokens();
    expect(googleDriveTokenStorage.hasGoogleDriveTokens()).toBe(false);
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toBeNull();

    googleDriveTokenStorage.setGoogleDriveTokens(TOKENS);
    expect(googleDriveTokenStorage.hasGoogleDriveTokens()).toBe(true);
    const read = googleDriveTokenStorage.getGoogleDriveTokens();
    expect(read).toEqual(TOKENS);
  });

  it('keeps the tokens out of plain Settings — they live only in the encrypted store', () => {
    googleDriveTokenStorage.setGoogleDriveTokens(TOKENS);
    // getSecret decrypts by design, so the encryption itself is
    // observed here by where the tokens are NOT: the plain settings
    // store (the one settings.getAll reads) must never hold them.
    const plain = JSON.stringify(settings.getAll());
    expect(plain).not.toContain('ya29.test-access');
    expect(plain).not.toContain('1//test-refresh');
    expect(plain).not.toContain('google-drive-tokens');
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toEqual(TOKENS);
  });

  it('delete clears the tokens', () => {
    googleDriveTokenStorage.setGoogleDriveTokens(TOKENS);
    expect(googleDriveTokenStorage.hasGoogleDriveTokens()).toBe(true);
    googleDriveTokenStorage.deleteGoogleDriveTokens();
    expect(googleDriveTokenStorage.hasGoogleDriveTokens()).toBe(false);
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toBeNull();
  });

  it('a corrupt stored value reads back as null, not a crash', () => {
    secureStorage.setSecret('google-drive-tokens', 'not-json{{{');
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toBeNull();
    secureStorage.setSecret('google-drive-tokens', JSON.stringify({ accessToken: 42 }));
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toBeNull();
    secureStorage.setSecret('google-drive-tokens', JSON.stringify({ accessToken: 'ya29.x' }));
    expect(googleDriveTokenStorage.getGoogleDriveTokens()).toBeNull();
    googleDriveTokenStorage.deleteGoogleDriveTokens();
  });

  it('a token without a refresh token round-trips with refreshToken null', () => {
    googleDriveTokenStorage.setGoogleDriveTokens({ ...TOKENS, refreshToken: null });
    const read = googleDriveTokenStorage.getGoogleDriveTokens();
    expect(read).not.toBeNull();
    expect(read?.refreshToken).toBeNull();
    expect(read?.accessToken).toBe('ya29.test-access');
    googleDriveTokenStorage.deleteGoogleDriveTokens();
  });
});
