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
 * What this file does (the sign-in start + finish, renderer side):
 * - buildGoogleDriveAuthUrl: the Google authorisation URL, with a
 *   PKCE code challenge. Opened in the browser when Connect is
 *   tapped and a client ID is configured.
 * - generatePkcePair: the code verifier + SHA-256 challenge.
 * - googleDriveConnectionState: not-connected / needs-client-id /
 *   connected, from the client ID and whether a token is stored.
 * - GoogleDriveAuthRedirect / GoogleDriveIpcResult: the types the
 *   main process speaks over IPC (the listener hands the redirect
 *   to the renderer; the exchange + token storage live in main and
 *   the tokens never cross into the renderer).
 * - checkGoogleDriveRedirect: verify Google's redirect against the
 *   saved PKCE attempt (state match) before the code is exchanged.
 * - googleDriveFailureNote: plain-language notes for every failure
 *   the segment can hit, so it says what went wrong, not a code.
 *
 * What it does NOT do yet (next, not this task): Drive file
 * operations (find, upload, download, organise, share) — the
 * connection is this task; the file work is next. And the live
 * sign-in still needs Gary's Desktop-app OAuth client ID: with no
 * client ID the segment says plainly what is missing, and with no
 * token the segment reports not connected. Nothing here fakes a
 * connection.
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

/** What the main process reports to the renderer for one sign-in
 *  attempt: Google's redirect, or the listener failing / timing
 *  out before Google answered. Mirrors GoogleDriveAuthRedirect in
 *  electron/services/googleDriveOAuth.ts — the electron project
 *  must not import from src/ (see the TS6307 note in
 *  electron/main.ts), so the two are kept identical by hand. */
export type GoogleDriveAuthRedirect =
  | { ok: true; code: string; state: string }
  | {
      ok: false;
      error:
        | 'denied'
        | 'missing-code'
        | 'missing-state'
        | 'bad-url'
        | 'timeout'
        | 'listener-failed';
    };

/** Error codes the google-drive IPC calls can return. Mirrors
 *  GoogleDriveIpcResult in electron/ipc/googleDrive.ts (same
 *  no-import-from-src reason — keep the two identical). */
export type GoogleDriveIpcError =
  | 'already-running'
  | 'listener-failed'
  | 'no-client-id'
  | 'empty'
  | 'network'
  | 'bad-response'
  | 'invalid-grant'
  | 'invalid-client'
  | 'invalid-request'
  | 'server'
  | 'not-connected'
  | 'token-expired'
  | 'unauthorized'
  | 'forbidden';

/** The result of a google-drive IPC call. */
export type GoogleDriveIpcResult =
  | { ok: true }
  | { ok: false; error: GoogleDriveIpcError };

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

/** What checking Google's redirect against the saved attempt can say. */
export type GoogleDriveRedirectCheck =
  | { ok: true; code: string }
  | {
      ok: false;
      error:
        | 'denied'
        | 'missing-code'
        | 'missing-state'
        | 'bad-url'
        | 'timeout'
        | 'listener-failed'
        | 'attempt-lost'
        | 'state-mismatch';
    };

/**
 * Check Google's redirect before the code is exchanged: the
 * redirect must have succeeded, the saved PKCE attempt must still
 * exist (one-time use — takePkceAttempt clears it), and the state
 * Google sent back must match the state the attempt saved. A
 * mismatch means the reply is not for this sign-in and the code
 * must never be exchanged.
 */
export function checkGoogleDriveRedirect(
  redirect: GoogleDriveAuthRedirect,
  attempt: PkceAttempt | null,
): GoogleDriveRedirectCheck {
  if (!redirect.ok) return { ok: false, error: redirect.error };
  if (!attempt) return { ok: false, error: 'attempt-lost' };
  if (redirect.state !== attempt.state) return { ok: false, error: 'state-mismatch' };
  return { ok: true, code: redirect.code };
}

/**
 * Plain-language note for a sign-in failure, for the segment to
 * show under the Connect button. Every error the flow can produce
 * maps to something Gary can act on; unknown codes fall back to a
 * generic note, never a bare code.
 */
export function googleDriveFailureNote(error: string): string {
  switch (error) {
    case 'needs-client-id':
    case 'no-client-id':
      return 'Not connected. To connect, Lucid needs a Google OAuth client ID — create one in Google Cloud Console as a Desktop app, and give the client ID to Slave to store in Settings.';
    case 'listener-failed':
      return 'The sign-in could not start — Lucid could not listen for Google’s reply on this computer. Try again; if it keeps failing, restart Lucid.';
    case 'already-running':
      return 'A Google sign-in is already in progress — finish it in your browser, or wait for it to time out, then try again.';
    case 'denied':
      return 'The Google sign-in was denied — Google did not authorise Lucid. Tap Connect and try again, and approve the sign-in when Google asks.';
    case 'timeout':
      return 'The sign-in timed out — Google did not reply within 10 minutes. Tap Connect and try again.';
    case 'missing-code':
    case 'missing-state':
    case 'bad-url':
      return 'Google’s reply could not be understood — no sign-in code came back. Tap Connect and try again.';
    case 'attempt-lost':
      return 'The sign-in attempt was lost before Google replied — Lucid could not match the reply to a sign-in it started. Tap Connect and try again.';
    case 'state-mismatch':
      return 'Google’s reply did not match the sign-in Lucid started, so it was not used. Tap Connect and try again.';
    case 'invalid-grant':
      return 'Google rejected the sign-in code — it may have expired or already been used. Tap Connect and try again.';
    case 'invalid-client':
      return 'Google rejected the client ID — check that the client ID stored in Settings is a Desktop-app OAuth client ID from Google Cloud Console.';
    case 'invalid-request':
    case 'bad-response':
    case 'empty':
      return 'Google’s reply could not be understood. Tap Connect and try again; if it keeps failing, check the client ID in Settings.';
    case 'network':
      return 'Lucid could not reach Google — check the network connection and try again.';
    case 'server':
      return 'Google’s servers returned an error. Wait a moment and tap Connect to try again.';
    case 'not-connected':
      return 'Not connected. Tap Connect and sign in with Google.';
    case 'token-expired':
      return 'The saved sign-in expired and could not be refreshed. Tap Connect and sign in with Google again.';
    case 'unauthorized':
    case 'forbidden':
      return 'Google refused access — the saved sign-in no longer has permission. Tap Connect and sign in with Google again.';
    default:
      return 'The sign-in could not be completed. Tap Connect and try again.';
  }
}
