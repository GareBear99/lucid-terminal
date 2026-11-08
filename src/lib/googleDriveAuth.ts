/**
 * Google Drive sign-in — the OAuth start behind the Google Drive
 * segment's Connect button (Gary, 2026-11-08 ~02:32 PST: "Yes and
 * should just have a connect button in segments for that segment
 * for now").
 *
 * The mechanism Gary approved: Google OAuth (a Google sign-in).
 * Tapping Connect opens Google's sign-in page; the user authorises
 * Lucid, and Lucid stores the token securely. The sign-in is a
 * desktop OAuth flow with PKCE — the public client needs no client
 * secret, so no secret is stored anywhere. The client ID (a public
 * identifier) lives in settings as googleDriveClientId; it is empty
 * until Gary supplies one.
 *
 * What this file does (the sign-in start, for now):
 * - buildGoogleDriveAuthUrl: the Google authorisation URL, with a
 *   PKCE code challenge. Opened in the browser when Connect is
 *   tapped and a client ID is configured.
 * - generatePkcePair: the code verifier + SHA-256 challenge.
 * - googleDriveConnectionState: not-connected / needs-client-id /
 *   connected, from the client ID and whether a token is stored.
 *
 * What it does NOT do yet (the approved next step, not this task):
 * the loopback redirect listener that catches Google's redirect
 * back to Lucid, the code-for-token exchange, and the secure token
 * storage. Until those land, tapping Connect with a client ID opens
 * the real Google sign-in page, and the sign-in completes once the
 * listener + exchange are wired in. Nothing here fakes a
 * connection: with no client ID the segment says plainly what is
 * missing, and with no token the segment reports not connected.
 *
 * Scope: drive.file — the least-privilege scope for the segment's
 * job (find, upload, download, organise and share the Drive files
 * it works with). Gary can widen it if the segment needs to see
 * files it did not create.
 *
 * Gmail is NOT in this segment (Gary, 2026-11-08 ~02:34 PST): Gmail
 * is a separate future segment, "Gmail Connect", gated on a temp
 * being verified by the daily server check. Nothing here asks for
 * Gmail scope or promises Gmail.
 */

/** Google's OAuth authorisation endpoint. */
export const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** The loopback redirect for a desktop sign-in. The listener that
 *  catches this redirect is the approved next step, not this file. */
export const GOOGLE_DRIVE_REDIRECT_URI = 'http://127.0.0.1:8765';

/** Least-privilege Drive scope for the segment's job. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** The connection state the segment reports. */
export type GoogleDriveConnectionState =
  | 'not-connected'
  | 'needs-client-id'
  | 'connected';

/**
 * The segment's connection state, from what is configured and what
 * is stored. Tokens are not stored yet (the exchange is the next
 * step), so 'connected' is only reachable once that lands.
 */
export function googleDriveConnectionState(
  clientId: string,
  hasTokens: boolean,
): GoogleDriveConnectionState {
  if (!clientId.trim()) return 'needs-client-id';
  if (hasTokens) return 'connected';
  return 'not-connected';
}

/** A PKCE code verifier + its SHA-256 challenge. */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Random URL-safe base64, for the PKCE verifier and the state. */
export function randomUrlSafeString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** SHA-256, URL-safe base64 — the PKCE code challenge. */
export async function sha256UrlSafe(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A fresh PKCE pair for one sign-in attempt. */
export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafeString(64);
  const challenge = await sha256UrlSafe(verifier);
  return { verifier, challenge };
}

/** sessionStorage key for the in-flight sign-in attempt. The
 *  verifier + state must survive until Google redirects back, so
 *  the next step's listener can read them for the code exchange. */
export const GOOGLE_DRIVE_PKCE_KEY = 'google-drive-pkce-attempt';

/** The in-flight sign-in attempt (verifier + state), if one was started. */
export interface PkceAttempt {
  verifier: string;
  state: string;
}

/** Save the in-flight attempt for the redirect listener (next step). */
export function savePkceAttempt(attempt: PkceAttempt): void {
  try {
    sessionStorage.setItem(GOOGLE_DRIVE_PKCE_KEY, JSON.stringify(attempt));
  } catch {
    // No session storage (SSR / restricted) — the attempt is lost
    // and the sign-in cannot complete; the segment says so.
  }
}

/** Read + clear the in-flight attempt (one-time use, for the code exchange). */
export function takePkceAttempt(): PkceAttempt | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_DRIVE_PKCE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GOOGLE_DRIVE_PKCE_KEY);
    const parsed = JSON.parse(raw) as PkceAttempt;
    if (typeof parsed.verifier !== 'string' || typeof parsed.state !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The Google authorisation URL for the Drive sign-in. Opened in the
 * browser when Connect is tapped and a client ID is configured.
 */
export function buildGoogleDriveAuthUrl(
  clientId: string,
  state: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}
