/**
 * Google Drive sign-in tests (Gary, 2026-11-08 ~02:32 PST).
 *
 * The Connect button starts a Google OAuth sign-in (PKCE, desktop
 * flow, no client secret). These tests cover the pure pieces: the
 * connection state, the authorisation URL, the PKCE pair, and the
 * one-time in-flight attempt storage. The loopback redirect
 * listener + code exchange + token storage are the approved next
 * step, not this file.
 *
 * Gmail is not in this segment and not in this file: Gmail is a
 * separate future segment ("Gmail Connect"), gated on a temp being
 * verified by the daily server check.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GOOGLE_DRIVE_REDIRECT_URI,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_OAUTH_AUTH_URL,
  buildGoogleDriveAuthUrl,
  generatePkcePair,
  googleDriveConnectionState,
  savePkceAttempt,
  sha256UrlSafe,
  takePkceAttempt,
} from '../src/lib/googleDriveAuth';

// Node has no sessionStorage — give the PKCE attempt storage a
// minimal in-memory one so the round-trip is testable.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
});

describe('googleDriveConnectionState', () => {
  it('needs a client ID before Connect can sign in', () => {
    expect(googleDriveConnectionState('', false)).toBe('needs-client-id');
    expect(googleDriveConnectionState('   ', false)).toBe('needs-client-id');
  });

  it('is not connected with a client ID but no tokens', () => {
    expect(googleDriveConnectionState('some-client-id.apps.googleusercontent.com', false)).toBe(
      'not-connected',
    );
  });

  it('is connected once tokens are stored', () => {
    expect(googleDriveConnectionState('some-client-id.apps.googleusercontent.com', true)).toBe(
      'connected',
    );
  });
});

describe('buildGoogleDriveAuthUrl', () => {
  it('builds a Google OAuth URL with PKCE and the Drive scope, and no client secret', () => {
    const url = buildGoogleDriveAuthUrl('my-client-id', 'state-123', 'challenge-abc');
    expect(url.startsWith(`${GOOGLE_OAUTH_AUTH_URL}?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('my-client-id');
    expect(params.get('redirect_uri')).toBe(GOOGLE_DRIVE_REDIRECT_URI);
    expect(params.get('scope')).toBe(GOOGLE_DRIVE_SCOPE);
    expect(params.get('state')).toBe('state-123');
    expect(params.get('code_challenge')).toBe('challenge-abc');
    expect(params.get('code_challenge_method')).toBe('S256');
    // No client secret anywhere in the URL (PKCE desktop flow).
    expect(url).not.toContain('secret');
  });

  it('asks for Drive files only, never Gmail', () => {
    expect(GOOGLE_DRIVE_SCOPE).toContain('googleapis.com/auth/drive');
    expect(GOOGLE_DRIVE_SCOPE).not.toContain('gmail');
  });
});

describe('PKCE', () => {
  it('generates a verifier and a challenge that is the SHA-256 of the verifier', async () => {
    const pair = await generatePkcePair();
    expect(pair.verifier.length).toBeGreaterThan(40);
    expect(pair.challenge.length).toBeGreaterThan(20);
    expect(pair.challenge).not.toBe(pair.verifier);
    expect(await sha256UrlSafe(pair.verifier)).toBe(pair.challenge);
    // URL-safe base64 only (no +, /, or = padding).
    expect(pair.verifier).not.toMatch(/[+/=]/);
    expect(pair.challenge).not.toMatch(/[+/=]/);
  });
});

describe('PKCE attempt storage', () => {
  it('saves an attempt and takes it once, then it is gone', () => {
    expect(takePkceAttempt()).toBeNull();
    savePkceAttempt({ verifier: 'verifier-1', state: 'state-1' });
    expect(takePkceAttempt()).toEqual({ verifier: 'verifier-1', state: 'state-1' });
    expect(takePkceAttempt()).toBeNull();
  });
});
