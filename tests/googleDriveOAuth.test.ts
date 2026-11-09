/**
 * Google Drive OAuth main-process tests (Gary, 2026-11-08).
 *
 * The loopback redirect listener, the code-for-token exchange, the
 * refresh, and the authenticated Drive API call — the main-process
 * half of the Drive sign-in. The listener test binds a real server
 * on 127.0.0.1 and hits it with a real fetch (a test port, 18765,
 * so it never fights the real redirect port 8765). The exchange
 * and refresh tests use a mock fetch, so no real code, client ID,
 * or Google call is ever needed.
 *
 * No client ID, secret, or token is invented here: the exchange
 * tests use obviously-fake placeholders ('test-code',
 * 'test-client-id.apps.googleusercontent.com') against a mock
 * fetch that answers with canned token JSON.
 */
import { describe, it, expect } from 'vitest';
import {
  GOOGLE_DRIVE_LOOPBACK_PORT,
  exchangeGoogleDriveCode,
  googleDriveApiGet,
  parseGoogleDriveRedirectUrl,
  parseGoogleDriveTokenResponse,
  refreshGoogleDriveAccessToken,
  startGoogleDriveLoopbackListener,
} from '../electron/services/googleDriveOAuth';

/** A port for the listener tests — never the real redirect port. */
const TEST_PORT = 18765;

/** A mock fetch that answers with a canned JSON body + status. */
function mockFetch(body: unknown, status = 200): typeof fetch {
  return (async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe('parseGoogleDriveRedirectUrl', () => {
  it('parses a code + state redirect', () => {
    const result = parseGoogleDriveRedirectUrl('/?code=auth-code-1&state=state-1');
    expect(result).toEqual({ ok: true, code: 'auth-code-1', state: 'state-1' });
  });

  it('reports a denial when Google answers with an error', () => {
    expect(parseGoogleDriveRedirectUrl('/?error=access_denied&state=state-1')).toEqual({
      ok: false,
      error: 'denied',
    });
  });

  it('reports a missing code and a missing state distinctly', () => {
    expect(parseGoogleDriveRedirectUrl('/?state=state-1')).toEqual({
      ok: false,
      error: 'missing-code',
    });
    expect(parseGoogleDriveRedirectUrl('/?code=auth-code-1')).toEqual({
      ok: false,
      error: 'missing-state',
    });
  });
});

describe('parseGoogleDriveTokenResponse', () => {
  it('parses a full token response into tokens with an expiry', () => {
    const before = Date.now();
    const result = parseGoogleDriveTokenResponse({
      access_token: 'ya29.access',
      refresh_token: '1//refresh',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/drive.file',
      token_type: 'Bearer',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.accessToken).toBe('ya29.access');
    expect(result.tokens.refreshToken).toBe('1//refresh');
    expect(result.tokens.scope).toBe('https://www.googleapis.com/auth/drive.file');
    expect(result.tokens.expiresAtMs).toBeGreaterThanOrEqual(before + 3599 * 1000);
    expect(result.tokens.expiresAtMs).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it('keeps the previous refresh token when Google omits a new one', () => {
    const result = parseGoogleDriveTokenResponse(
      { access_token: 'ya29.new-access', expires_in: 1800 },
      '1//old-refresh',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.refreshToken).toBe('1//old-refresh');
    expect(result.tokens.expiresAtMs).toBeGreaterThanOrEqual(Date.now() + 1799 * 1000);
  });

  it('refuses a body without an access token', () => {
    expect(parseGoogleDriveTokenResponse({})).toEqual({ ok: false, error: 'bad-response' });
    expect(parseGoogleDriveTokenResponse(null)).toEqual({ ok: false, error: 'bad-response' });
    expect(parseGoogleDriveTokenResponse({ access_token: '   ' })).toEqual({
      ok: false,
      error: 'bad-response',
    });
  });
});

describe('exchangeGoogleDriveCode', () => {
  const input = {
    code: 'test-code',
    clientId: 'test-client-id.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:8765',
    codeVerifier: 'test-verifier',
  };

  it('exchanges a code for tokens and posts the PKCE verifier, never a secret', async () => {
    let postedUrl = '';
    let postedBody = '';
    const fetchFn = (async (url: string, init?: RequestInit) => {
      postedUrl = url;
      postedBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ya29.access',
          refresh_token: '1//refresh',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const result = await exchangeGoogleDriveCode(input, fetchFn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.accessToken).toBe('ya29.access');
    expect(result.tokens.refreshToken).toBe('1//refresh');
    expect(postedUrl).toBe('https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(postedBody);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('test-code');
    expect(params.get('code_verifier')).toBe('test-verifier');
    expect(params.get('redirect_uri')).toBe('http://127.0.0.1:8765');
    expect(postedBody).not.toContain('secret');
  });

  it('maps Google error codes to distinct reasons', async () => {
    const invalidGrant = await exchangeGoogleDriveCode(
      input,
      mockFetch({ error: 'invalid_grant', error_description: 'Bad Request' }, 400),
    );
    expect(invalidGrant).toEqual({ ok: false, error: 'invalid-grant' });
    const invalidClient = await exchangeGoogleDriveCode(
      input,
      mockFetch({ error: 'invalid_client' }, 401),
    );
    expect(invalidClient).toEqual({ ok: false, error: 'invalid-client' });
    const server = await exchangeGoogleDriveCode(input, mockFetch({ error: 'x' }, 500));
    expect(server).toEqual({ ok: false, error: 'server' });
  });

  it('refuses an empty code, client ID, or verifier before any network call', async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return {} as Response;
    }) as unknown as typeof fetch;
    expect(await exchangeGoogleDriveCode({ ...input, code: '  ' }, fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(await exchangeGoogleDriveCode({ ...input, clientId: '' }, fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(await exchangeGoogleDriveCode({ ...input, codeVerifier: '' }, fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(called).toBe(false);
  });

  it('reports a network failure as network, not as a bad code', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await exchangeGoogleDriveCode(input, fetchFn)).toEqual({
      ok: false,
      error: 'network',
    });
  });
});

describe('refreshGoogleDriveAccessToken', () => {
  it('refreshes with the stored refresh token and keeps it when Google omits a new one', async () => {
    const result = await refreshGoogleDriveAccessToken(
      { refreshToken: '1//old-refresh', clientId: 'test-client-id.apps.googleusercontent.com' },
      mockFetch({ access_token: 'ya29.new-access', expires_in: 3600 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.accessToken).toBe('ya29.new-access');
    expect(result.tokens.refreshToken).toBe('1//old-refresh');
  });

  it('refuses to refresh without a refresh token', async () => {
    expect(
      await refreshGoogleDriveAccessToken(
        { refreshToken: '', clientId: 'test-client-id.apps.googleusercontent.com' },
        mockFetch({}),
      ),
    ).toEqual({ ok: false, error: 'empty' });
  });
});

describe('googleDriveApiGet', () => {
  it('sends the access token as a Bearer header and returns the body', async () => {
    let auth = '';
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: 'file-1' }] }),
      } as Response;
    }) as unknown as typeof fetch;
    const result = await googleDriveApiGet(
      { accessToken: 'ya29.access', path: '/drive/v3/files?pageSize=1&fields=files(id)' },
      fetchFn,
    );
    expect(auth).toBe('Bearer ya29.access');
    expect(result).toEqual({ ok: true, status: 200, body: { files: [{ id: 'file-1' }] } });
  });

  it('maps 401/403 distinctly', async () => {
    expect(
      await googleDriveApiGet({ accessToken: 'ya29.bad', path: '/drive/v3/files' }, mockFetch({}, 401)),
    ).toEqual({ ok: false, error: 'unauthorized' });
    expect(
      await googleDriveApiGet({ accessToken: 'ya29.access', path: '/drive/v3/files' }, mockFetch({}, 403)),
    ).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('startGoogleDriveLoopbackListener', () => {
  it('uses port 8765 by default — the registered redirect URI', () => {
    expect(GOOGLE_DRIVE_LOOPBACK_PORT).toBe(8765);
  });

  it('binds on 127.0.0.1, captures the code + state, and answers with a done page', async () => {
    const seen = new Promise<{ code: string; state: string }>((resolve) => {
      const listener = startGoogleDriveLoopbackListener({
        port: TEST_PORT,
        timeoutMs: 5000,
        onRedirect: (result) => {
          listener.close();
          expect(result.ok).toBe(true);
          if (result.ok) resolve({ code: result.code, state: result.state });
        },
      });
    });
    // Give the server a tick to bind before Google's redirect arrives.
    await new Promise((r) => setTimeout(r, 100));
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/?code=auth-code-1&state=state-1`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('Signed in to Google Drive');
    expect(body).toContain('close this tab');
    await expect(seen).resolves.toEqual({ code: 'auth-code-1', state: 'state-1' });
  });

  it('reports a denial redirect and answers with a not-completed page', async () => {
    const seen = new Promise<string>((resolve) => {
      const listener = startGoogleDriveLoopbackListener({
        port: TEST_PORT + 1,
        timeoutMs: 5000,
        onRedirect: (result) => {
          listener.close();
          resolve(result.ok ? 'ok' : result.error);
        },
      });
    });
    await new Promise((r) => setTimeout(r, 100));
    const res = await fetch(`http://127.0.0.1:${TEST_PORT + 1}/?error=access_denied&state=state-1`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('not completed');
    await expect(seen).resolves.toBe('denied');
  });

  it('ignores a favicon-style probe and keeps waiting for the real redirect', async () => {
    const seen = new Promise<string>((resolve) => {
      const listener = startGoogleDriveLoopbackListener({
        port: TEST_PORT + 2,
        timeoutMs: 5000,
        onRedirect: (result) => {
          listener.close();
          resolve(result.ok ? result.code : result.error);
        },
      });
    });
    await new Promise((r) => setTimeout(r, 100));
    const probe = await fetch(`http://127.0.0.1:${TEST_PORT + 2}/favicon.ico`);
    expect(probe.status).toBe(404);
    const res = await fetch(`http://127.0.0.1:${TEST_PORT + 2}/?code=auth-code-2&state=state-2`);
    expect(res.status).toBe(200);
    await expect(seen).resolves.toBe('auth-code-2');
  });

  it('fires onTimeout when nothing arrives', async () => {
    const timedOut = new Promise<boolean>((resolve) => {
      const listener = startGoogleDriveLoopbackListener({
        port: TEST_PORT + 3,
        timeoutMs: 50,
        onRedirect: () => {
          listener.close();
          resolve(false);
        },
        onTimeout: () => resolve(true),
      });
    });
    await expect(timedOut).resolves.toBe(true);
  });

  it('reports a bind failure instead of hanging (port already in use)', async () => {
    const first = startGoogleDriveLoopbackListener({
      port: TEST_PORT + 4,
      timeoutMs: 5000,
      onRedirect: () => undefined,
    });
    await new Promise((r) => setTimeout(r, 100));
    const error = new Promise<Error>((resolve) => {
      startGoogleDriveLoopbackListener({
        port: TEST_PORT + 4,
        timeoutMs: 5000,
        onRedirect: () => undefined,
        onListenError: (e) => resolve(e),
      });
    });
    const err = await error;
    expect(err.message).toMatch(/EADDRINUSE/);
    first.close();
  });
});
