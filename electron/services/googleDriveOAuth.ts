/**
 * Google Drive OAuth — the main-process half of the Drive sign-in
 * (Gary, 2026-11-08): the loopback redirect listener, the
 * code-for-token exchange, the refresh, and the authenticated Drive
 * API call. The renderer half (PKCE + authorisation URL) lives in
 * src/lib/googleDriveAuth.ts; the segment that drives it is
 * src/components/Modules/GoogleDriveSegment.tsx.
 *
 * The flow, end to end (modulo the client ID, which Gary still owes):
 * 1. The renderer generates a PKCE pair + state, saves the attempt,
 *    and asks the main process to start the loopback listener
 *    (127.0.0.1:8765 — the redirect URI registered on the client).
 * 2. The renderer opens Google's sign-in page in the browser.
 * 3. Google redirects back to 127.0.0.1:8765/?code=…&state=… .
 *    The listener answers with a small "you can close this tab"
 *    page, hands the code + state to the renderer, and stops.
 * 4. The renderer checks the state against its saved attempt and
 *    asks the main process to exchange the code (PKCE, no client
 *    secret — a Desktop app has no secret to keep).
 * 5. The main process stores the tokens encrypted (see
 *    googleDriveTokenStorage in secureStorage.ts). The tokens never
 *    cross into the renderer: the renderer only ever learns whether
 *    tokens are stored, and the main process makes the Drive calls.
 *
 * Nothing here invents a client ID, a secret, or a token. The
 * client ID comes from Settings (googleDriveClientId) via the IPC
 * layer; without it the exchange is refused before any network call.
 * Google's token endpoint is the only network destination, plus
 * www.googleapis.com for the Drive call.
 */
import http from 'node:http';

/** Google's token endpoint (code exchange + refresh). */
export const GOOGLE_DRIVE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Google's Drive API base. */
export const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com';

/** The loopback port — the redirect URI is http://127.0.0.1:8765
 *  (see GOOGLE_DRIVE_REDIRECT_URI in src/lib/googleDriveAuth.ts). */
export const GOOGLE_DRIVE_LOOPBACK_PORT = 8765;

/** The loopback redirect URI — the same value as
 *  GOOGLE_DRIVE_REDIRECT_URI in src/lib/googleDriveAuth.ts,
 *  duplicated here because the electron project must not import
 *  from src/ (see the TS6307 note in electron/main.ts). */
export const GOOGLE_DRIVE_REDIRECT_URI =
  `http://127.0.0.1:${GOOGLE_DRIVE_LOOPBACK_PORT}`;

/** How long the listener waits for Google's redirect before giving
 *  up (the user may take a while to sign in; 10 minutes). */
export const GOOGLE_DRIVE_LISTENER_TIMEOUT_MS = 10 * 60 * 1000;

/** The tokens for one signed-in Google account. `expiresAtMs` is
 *  the wall-clock time the access token stops working
 *  (Date.now() + expires_in * 1000 at exchange time). The refresh
 *  token is null when Google did not issue one (offline access was
 *  not granted); without it the sign-in cannot be refreshed and
 *  the user has to sign in again. */
export interface GoogleDriveTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number;
  scope: string;
}

/** What Google's redirect back to the loopback listener carried. */
export type GoogleDriveRedirectResult =
  | { ok: true; code: string; state: string }
  | { ok: false; error: 'denied' | 'missing-code' | 'missing-state' | 'bad-url' };

/** What the main process reports to the renderer for one sign-in
 *  attempt: Google's redirect, or the listener failing / timing
 *  out before Google answered. */
export type GoogleDriveAuthRedirect =
  | GoogleDriveRedirectResult
  | { ok: false; error: 'timeout' | 'listener-failed' };

/**
 * Parse Google's redirect URL (the path + query Google lands on
 * at 127.0.0.1:8765). Success is ?code=…&state=…; denial is
 * ?error=access_denied (the user said no on Google's page).
 */
export function parseGoogleDriveRedirectUrl(
  rawUrl: string,
): GoogleDriveRedirectResult {
  let url: URL;
  try {
    url = new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return { ok: false, error: 'bad-url' };
  }
  const params = url.searchParams;
  const error = params.get('error');
  if (error) return { ok: false, error: 'denied' };
  const code = params.get('code');
  if (!code) return { ok: false, error: 'missing-code' };
  const state = params.get('state');
  if (!state) return { ok: false, error: 'missing-state' };
  return { ok: true, code, state };
}

/** The result of a token exchange or refresh. */
export type GoogleDriveTokenResult =
  | { ok: true; tokens: GoogleDriveTokens }
  | {
      ok: false;
      error:
        | 'empty'
        | 'network'
        | 'bad-response'
        | 'invalid-grant'
        | 'invalid-client'
        | 'invalid-request'
        | 'server';
    };

/**
 * Parse a token response body into tokens. Google answers
 * { access_token, refresh_token?, expires_in, scope, token_type }.
 * The access token is required; the refresh token is optional on a
 * refresh (Google only returns a new one sometimes — the caller
 * keeps the old one); expires_in defaults to 3600 when absent.
 */
export function parseGoogleDriveTokenResponse(
  body: unknown,
  previousRefreshToken: string | null = null,
): GoogleDriveTokenResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'bad-response' };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.access_token !== 'string' || raw.access_token.trim() === '') {
    return { ok: false, error: 'bad-response' };
  }
  const refreshToken =
    typeof raw.refresh_token === 'string' && raw.refresh_token.trim() !== ''
      ? raw.refresh_token.trim()
      : previousRefreshToken;
  const expiresIn =
    typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in) && raw.expires_in > 0
      ? raw.expires_in
      : 3600;
  const scope = typeof raw.scope === 'string' ? raw.scope : '';
  return {
    ok: true,
    tokens: {
      accessToken: raw.access_token.trim(),
      refreshToken,
      expiresAtMs: Date.now() + expiresIn * 1000,
      scope,
    },
  };
}

/**
 * Exchange an authorisation code for tokens (PKCE desktop flow —
 * no client secret). `fetchFn` is injectable so tests never touch
 * the network and never need a real code or client ID.
 *
 * Google's error body ({ error: 'invalid_grant' | 'invalid_client'
 * | … }) is mapped to a distinct reason: invalid_grant is a code
 * that was already used, expired, or issued for a different
 * verifier; invalid_client is a client ID Google does not know.
 */
export async function exchangeGoogleDriveCode(
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<GoogleDriveTokenResult> {
  const code = input.code.trim();
  const clientId = input.clientId.trim();
  const verifier = input.codeVerifier.trim();
  if (!code || !clientId || !verifier) return { ok: false, error: 'empty' };
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  let res: Response;
  try {
    res = await fetchFn(GOOGLE_DRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, error: 'bad-response' };
  }
  if (!res.ok) {
    const errorCode =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).error
        : null;
    if (errorCode === 'invalid_grant') return { ok: false, error: 'invalid-grant' };
    if (errorCode === 'invalid_client') return { ok: false, error: 'invalid-client' };
    if (errorCode === 'invalid_request') return { ok: false, error: 'invalid-request' };
    if (res.status >= 500) return { ok: false, error: 'server' };
    return { ok: false, error: 'bad-response' };
  }
  return parseGoogleDriveTokenResponse(parsed);
}

/**
 * Refresh an access token with the stored refresh token. Google
 * usually answers without a new refresh token — the old one stays
 * valid, so it is carried forward. Without a refresh token there
 * is nothing to refresh with ('empty').
 */
export async function refreshGoogleDriveAccessToken(
  input: { refreshToken: string; clientId: string },
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<GoogleDriveTokenResult> {
  const refreshToken = input.refreshToken.trim();
  const clientId = input.clientId.trim();
  if (!refreshToken || !clientId) return { ok: false, error: 'empty' };
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    grant_type: 'refresh_token',
  });
  let res: Response;
  try {
    res = await fetchFn(GOOGLE_DRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, error: 'bad-response' };
  }
  if (!res.ok) {
    const errorCode =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).error
        : null;
    if (errorCode === 'invalid_grant') return { ok: false, error: 'invalid-grant' };
    if (errorCode === 'invalid_client') return { ok: false, error: 'invalid-client' };
    if (errorCode === 'invalid_request') return { ok: false, error: 'invalid-request' };
    if (res.status >= 500) return { ok: false, error: 'server' };
    return { ok: false, error: 'bad-response' };
  }
  return parseGoogleDriveTokenResponse(parsed, refreshToken);
}

/** The result of an authenticated Drive API GET. */
export type GoogleDriveApiResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; error: 'network' | 'bad-response' | 'unauthorized' | 'forbidden' | 'server' };

/**
 * One authenticated GET against the Drive API (the tokens never
 * leave the main process — this is how the renderer verifies the
 * connection and, later, how Drive calls are made). `path` is the
 * API path including its query, e.g.
 * '/drive/v3/files?pageSize=1&fields=files(id)'.
 */
export async function googleDriveApiGet(
  input: { accessToken: string; path: string },
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<GoogleDriveApiResult> {
  const token = input.accessToken.trim();
  if (!token || !input.path.trim()) {
    return { ok: false, error: 'bad-response' };
  }
  let res: Response;
  try {
    res = await fetchFn(`${GOOGLE_DRIVE_API_BASE}${input.path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'unauthorized' };
    if (res.status === 403) return { ok: false, error: 'forbidden' };
    if (res.status >= 500) return { ok: false, error: 'server' };
    return { ok: false, error: 'bad-response' };
  }
  try {
    return { ok: true, status: res.status, body: await res.json() };
  } catch {
    return { ok: false, error: 'bad-response' };
  }
}

/** The loopback listener — started on demand, one redirect, then it stops. */
export interface GoogleDriveLoopbackListener {
  /** Stop the listener (idempotent; also called automatically after a redirect or a timeout). */
  close(): void;
}

/** The page Google's redirect lands on: plain, no scripts, tells
 *  the user the sign-in is done and to go back to Lucid. */
function loopbackResponsePage(success: boolean): string {
  return success
    ? '<!doctype html><html><body style="font-family:sans-serif;padding:2em">' +
        '<h1>Signed in to Google Drive</h1>' +
        '<p>Lucid is connected. You can close this tab and return to Lucid.</p>' +
        '</body></html>'
    : '<!doctype html><html><body style="font-family:sans-serif;padding:2em">' +
        '<h1>Google Drive sign-in not completed</h1>' +
        '<p>The sign-in was denied or did not finish. You can close this tab and try again in Lucid.</p>' +
        '</body></html>';
}

/**
 * Start the loopback listener on 127.0.0.1 (default port 8765 —
 * the redirect URI). It answers the first request with the
 * done/denied page, reports the parsed redirect through
 * `onRedirect`, and stops itself. A request to any other path
 * (e.g. a favicon) is ignored — only the first request carrying a
 * code or an error completes the sign-in. If nothing arrives
 * within `timeoutMs`, `onTimeout` fires and the listener stops.
 * A bind failure (port already in use) is reported through
 * `onListenError` — the caller must not open the auth URL then.
 */
export function startGoogleDriveLoopbackListener(options: {
  port?: number;
  timeoutMs?: number;
  onRedirect: (result: GoogleDriveRedirectResult) => void;
  onTimeout?: () => void;
  onListenError?: (error: Error) => void;
  /** Fires once the server is actually bound — the caller must not
   *  open the auth URL until this fires, or Google's redirect can
   *  land on a port nobody is listening on. */
  onListening?: () => void;
}): GoogleDriveLoopbackListener {
  const port = options.port ?? GOOGLE_DRIVE_LOOPBACK_PORT;
  const timeoutMs = options.timeoutMs ?? GOOGLE_DRIVE_LISTENER_TIMEOUT_MS;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const server = http.createServer((req, res) => {
    if (stopped) return;
    // A request with neither a code nor an error (favicon, a
    // probe) is not the redirect — ignore it and keep waiting.
    // A code without a state IS the redirect, malformed: report it.
    let isRedirect = false;
    try {
      const probe = new URL(req.url ?? '/', 'http://127.0.0.1');
      isRedirect = probe.searchParams.has('code') || probe.searchParams.has('error');
    } catch {
      isRedirect = false;
    }
    if (!isRedirect) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(loopbackResponsePage(false));
      return;
    }
    const result = parseGoogleDriveRedirectUrl(req.url ?? '/');
    stopped = true;
    if (timer) clearTimeout(timer);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(loopbackResponsePage(result.ok));
    server.close();
    options.onRedirect(result);
  });

  server.on('error', (error: Error) => {
    stopped = true;
    if (timer) clearTimeout(timer);
    options.onListenError?.(error);
  });

  server.on('listening', () => {
    options.onListening?.();
  });

  timer = setTimeout(() => {
    if (stopped) return;
    stopped = true;
    server.close();
    options.onTimeout?.();
  }, timeoutMs);
  // The listener must not keep the app alive on its own if the
  // window is closed while it waits.
  timer.unref?.();

  server.listen(port, '127.0.0.1');

  return {
    close(): void {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      server.close();
    },
  };
}
