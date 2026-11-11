/**
 * Google Drive OAuth IPC handlers (Gary, 2026-11-08) — the bridge
 * between the Drive segment in the renderer and the main-process
 * OAuth service (electron/services/googleDriveOAuth.ts).
 *
 * The sign-in flow over IPC:
 * 1. `google-drive:startListener` — starts the loopback listener
 *    and resolves only once it is actually bound (the renderer
 *    must not open Google's sign-in page before that, or the
 *    redirect can land on a port nobody is listening on). Only one
 *    listener at a time; a second start answers 'already-running'.
 * 2. Google redirects to 127.0.0.1:8765 — the listener hands the
 *    code + state to the renderer that started it via the
 *    `google-drive:auth-redirect` event, then stops itself. A
 *    listener failure or timeout arrives the same way.
 * 3. `google-drive:exchangeCode` — the renderer passes the code +
 *    the PKCE verifier from its saved attempt (after checking the
 *    state). The main process reads the client ID from its own
 *    settings store, exchanges the code, and stores the tokens
 *    encrypted. The tokens never cross into the renderer.
 * 4. `google-drive:verifyConnection` — a real Drive call
 *    (files.list, pageSize 1) with the stored access token,
 *    refreshing it first when it has expired. This is how the
 *    segment proves the connection is real, and how later Drive
 *    calls will be made (tokens stay in the main process).
 * 5. `google-drive:hasTokens` / `google-drive:disconnect` — the
 *    segment's connected state and sign-out.
 * 6. `google-drive:getAccountEmail` — the Google account email
 *    (GET userinfo, main process only) for the Security tab and
 *    the Authenticator account label. The stored tokens must
 *    carry the openid scope — a sign-in granted before the
 *    openid + email scopes were added answers 'needs-reauth',
 *    and the tab says to sign in with Google again.
 *
 * The client ID is never invented here: it comes from Settings
 * (googleDriveClientId, stored by the renderer settings store).
 * Without it the exchange is refused before any network call.
 */
import { IpcMain, WebContents } from 'electron';
import { googleDriveTokenStorage, settings } from '../services/secureStorage';
import {
  GOOGLE_DRIVE_REDIRECT_URI,
  GoogleDriveAuthRedirect,
  GoogleDriveLoopbackListener,
  GoogleDriveTokens,
  exchangeGoogleDriveCode,
  fetchGoogleAccountEmail,
  googleDriveApiGet,
  refreshGoogleDriveAccessToken,
  startGoogleDriveLoopbackListener,
} from '../services/googleDriveOAuth';

/** The result of starting the listener, exchanging a code, or verifying. */
export type GoogleDriveIpcResult =
  | { ok: true }
  | {
      ok: false;
      error:
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
    };

/** The result of reading the Google account email. 'needs-reauth'
 *  means the stored sign-in was granted before the openid + email
 *  scopes were added (drive.file only) — Google does not widen
 *  granted scopes, so the user has to sign in with Google again
 *  before the account can be shown. */
export type GoogleDriveAccountEmailResult =
  | { ok: true; email: string }
  | {
      ok: false;
      error:
        | 'empty'
        | 'network'
        | 'bad-response'
        | 'unauthorized'
        | 'forbidden'
        | 'server'
        | 'not-connected'
        | 'token-expired'
        | 'invalid-grant'
        | 'invalid-client'
        | 'invalid-request'
        | 'needs-reauth';
    };

/** The listener + the renderer that started it, if a sign-in is in flight. */
interface ActiveListener {
  listener: GoogleDriveLoopbackListener;
  sender: WebContents;
}

let active: ActiveListener | null = null;

/** Stop the active listener, if any (idempotent). */
function stopActiveListener(): void {
  if (!active) return;
  active.listener.close();
  active = null;
}

/** A fresh access token: the stored one, or a refreshed one when
 *  it has expired (60s skew margin). Returns null when there is
 *  no usable token — 'not-connected' when nothing is stored,
 *  'token-expired' when it expired and cannot be refreshed. */
async function getUsableAccessToken(): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; error: 'not-connected' | 'token-expired' | 'empty' | 'network' | 'server' | 'invalid-grant' | 'invalid-client' | 'invalid-request' | 'bad-response' }
> {
  const stored = googleDriveTokenStorage.getGoogleDriveTokens();
  if (!stored) return { ok: false, error: 'not-connected' };
  if (Date.now() < stored.expiresAtMs - 60_000) {
    return { ok: true, accessToken: stored.accessToken };
  }
  if (!stored.refreshToken) return { ok: false, error: 'token-expired' };
  const clientId = settings.get<string>('googleDriveClientId') ?? '';
  if (!clientId.trim()) return { ok: false, error: 'token-expired' };
  const refreshed = await refreshGoogleDriveAccessToken({
    refreshToken: stored.refreshToken,
    clientId: clientId.trim(),
  });
  if (!refreshed.ok) {
    if (refreshed.error === 'invalid-grant') return { ok: false, error: 'token-expired' };
    return { ok: false, error: refreshed.error };
  }
  const next: GoogleDriveTokens = refreshed.tokens;
  googleDriveTokenStorage.setGoogleDriveTokens(next);
  return { ok: true, accessToken: next.accessToken };
}

export function setupGoogleDriveHandlers(ipcMain: IpcMain): void {
  // Start the loopback listener. Resolves once bound; the renderer
  // opens Google's sign-in page only after this resolves.
  ipcMain.handle(
    'google-drive:startListener',
    async (event): Promise<GoogleDriveIpcResult> => {
      if (active) return { ok: false, error: 'already-running' };
      const sender = event.sender;
      return new Promise<GoogleDriveIpcResult>((resolve) => {
        // The bind either succeeds fast or fails fast — never leave
        // the renderer hanging if the listening event never fires.
        // The timer is cleared on bind, so it cannot kill a live
        // listener; on a timeout the half-started listener is
        // stopped, so a retry does not answer 'already-running'.
        const timer = setTimeout(() => {
          stopActiveListener();
          resolve({ ok: false, error: 'listener-failed' });
        }, 2000);
        const listener = startGoogleDriveLoopbackListener({
          onRedirect: (result) => {
            stopActiveListener();
            if (!sender.isDestroyed()) {
              sender.send('google-drive:auth-redirect', result as GoogleDriveAuthRedirect);
            }
          },
          onTimeout: () => {
            stopActiveListener();
            if (!sender.isDestroyed()) {
              sender.send('google-drive:auth-redirect', {
                ok: false,
                error: 'timeout',
              } as GoogleDriveAuthRedirect);
            }
          },
          onListenError: () => {
            clearTimeout(timer);
            stopActiveListener();
            if (!sender.isDestroyed()) {
              sender.send('google-drive:auth-redirect', {
                ok: false,
                error: 'listener-failed',
              } as GoogleDriveAuthRedirect);
            }
            resolve({ ok: false, error: 'listener-failed' });
          },
          onListening: () => {
            clearTimeout(timer);
            resolve({ ok: true });
          },
        });
        active = { listener, sender };
      });
    },
  );

  // Stop the listener (e.g. the user cancelled in the segment).
  ipcMain.handle('google-drive:stopListener', (): { ok: true } => {
    stopActiveListener();
    return { ok: true };
  });

  // Exchange the authorisation code for tokens and store them.
  // The client ID comes from the main settings store, not the
  // renderer — one source of truth, and the renderer never has to
  // hand a credential over IPC.
  ipcMain.handle(
    'google-drive:exchangeCode',
    async (
      _event,
      code: string,
      codeVerifier: string,
    ): Promise<GoogleDriveIpcResult> => {
      const clientId = settings.get<string>('googleDriveClientId') ?? '';
      if (!clientId.trim()) return { ok: false, error: 'no-client-id' };
      const result = await exchangeGoogleDriveCode({
        code,
        clientId: clientId.trim(),
        redirectUri: GOOGLE_DRIVE_REDIRECT_URI,
        codeVerifier,
      });
      if (!result.ok) return { ok: false, error: result.error };
      googleDriveTokenStorage.setGoogleDriveTokens(result.tokens);
      return { ok: true };
    },
  );

  // Whether tokens are stored (the segment's connected state).
  ipcMain.handle('google-drive:hasTokens', (): boolean => {
    return googleDriveTokenStorage.hasGoogleDriveTokens();
  });

  // Sign out: delete the tokens and stop any in-flight listener.
  ipcMain.handle('google-drive:disconnect', (): { ok: true } => {
    stopActiveListener();
    googleDriveTokenStorage.deleteGoogleDriveTokens();
    return { ok: true };
  });

  // Prove the connection with a real Drive call (files.list, one
  // row), refreshing the access token first when it has expired.
  ipcMain.handle(
    'google-drive:verifyConnection',
    async (): Promise<GoogleDriveIpcResult> => {
      const token = await getUsableAccessToken();
      if (!token.ok) return { ok: false, error: token.error };
      const res = await googleDriveApiGet({
        accessToken: token.accessToken,
        path: '/drive/v3/files?pageSize=1&fields=files(id)',
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true };
    },
  );

  // Read the Google account email (GET userinfo) for the Security
  // tab and the Authenticator account label. The stored sign-in
  // must carry the openid scope: a token granted before the
  // openid + email scopes were added answers 'needs-reauth' and
  // no userinfo call is made with it (it would only answer 403).
  // A 403 from userinfo itself is also reported as 'forbidden'
  // (the token lost the scope); either way the tab never invents
  // an email — no email is shown until a call succeeds.
  ipcMain.handle(
    'google-drive:getAccountEmail',
    async (): Promise<GoogleDriveAccountEmailResult> => {
      const stored = googleDriveTokenStorage.getGoogleDriveTokens();
      if (!stored) return { ok: false, error: 'not-connected' };
      const grantedScopes = stored.scope.split(/\s+/).filter((s) => s !== '');
      if (!grantedScopes.includes('openid')) {
        return { ok: false, error: 'needs-reauth' };
      }
      const token = await getUsableAccessToken();
      if (!token.ok) return { ok: false, error: token.error };
      const res = await fetchGoogleAccountEmail({ accessToken: token.accessToken });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, email: res.email };
    },
  );
}
