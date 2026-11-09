/**
 * Google Drive segment — the pre-installed, connectable segment in
 * the Segments panel (Gary, 2026-11-08 ~02:30 PST): "add a google
 * drive connect segment too in lucid exactly like that". Built
 * exactly like the AI Chat segment (src/components/Modules/
 * AIChatSegment.tsx): same shape, same honesty.
 *
 * Pre-installed: no starship, no install step. Google Drive is a
 * place to connect your Google Drive to Lucid, so Lucid can find,
 * upload, download, organise and share the files in your Drive,
 * including the documents, notes and notebooks you keep there. It
 * stays when LuciferAI is off — it is not a LuciferAI surface.
 *
 * The panel shows:
 * - The segment itself (pre-installed).
 * - The Connect button — the segment's action, for now (Gary,
 *   2026-11-08 ~02:35 PST: "should just have a connect button in
 *   segments for that segment for now"). Tapping it starts the
 *   Google sign-in (OAuth, Gary's approved mechanism): it starts
 *   the loopback listener, opens Google's sign-in page in the
 *   browser, waits for Google's redirect, checks the state against
 *   the saved PKCE attempt, exchanges the code for tokens (stored
 *   encrypted in the main process — the tokens never reach the
 *   renderer), and proves the connection with a real Drive call
 *   before reporting Connected. With no Google OAuth client ID
 *   configured it says plainly what is missing and what to provide
 *   (a Google Cloud OAuth client ID, Desktop app type, stored in
 *   settings as googleDriveClientId). No client secret is stored —
 *   the desktop sign-in uses PKCE, so there is no secret to keep.
 * - A Disconnect button once connected, which deletes the stored
 *   tokens.
 * - What it does: find, upload, download, organise and share
 *   Drive files.
 * - That it stays when LuciferAI is off.
 * - Connections: Google Drive is a place other things can connect
 *   to, the way AI Chat is.
 *
 * Drive file operations are next, not this segment: the connection
 * is this task. Gmail is NOT in this segment (Gary, 2026-11-08
 * ~02:34 PST): Gmail is a separate future segment, "Gmail
 * Connect", gated on a temp being verified by the daily server
 * check. Nothing here asks for Gmail scope or promises Gmail.
 */
import { useEffect, useRef, useState } from 'react';
import { HardDrive } from 'lucide-react';
import {
  buildGoogleDriveAuthUrl,
  checkGoogleDriveRedirect,
  generatePkcePair,
  googleDriveConnectionState,
  googleDriveFailureNote,
  randomUrlSafeString,
  savePkceAttempt,
  takePkceAttempt,
} from '../../lib/googleDriveAuth';
import type { GoogleDriveAuthRedirect } from '../../lib/googleDriveAuth';
import { useSettingsStore } from '../../stores/settingsStore';

export function GoogleDriveSegment() {
  const clientId = useSettingsStore((s) => s.settings.googleDriveClientId ?? '');
  // null until the main process has answered hasTokens.
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The in-flight redirect subscription, if one is waiting.
  const redirectUnsubRef = useRef<(() => void) | null>(null);

  // The segment's connected state comes from the main process
  // (whether tokens are stored there), not from the renderer.
  useEffect(() => {
    let cancelled = false;
    const gd = window.lucidAPI?.googleDrive;
    if (!gd) {
      setConnected(false);
      return;
    }
    gd.hasTokens()
      .then((has) => {
        if (!cancelled) setConnected(has);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Never leave a dangling redirect subscription behind.
  useEffect(
    () => () => {
      redirectUnsubRef.current?.();
      redirectUnsubRef.current = null;
    },
    [],
  );

  // Google's redirect came back: check it against the saved PKCE
  // attempt, exchange the code, then prove the connection with a
  // real Drive call before reporting Connected.
  const handleRedirect = async (redirect: GoogleDriveAuthRedirect) => {
    const gd = window.lucidAPI?.googleDrive;
    const attempt = takePkceAttempt();
    const checked = checkGoogleDriveRedirect(redirect, attempt);
    if (!checked.ok) {
      setBusy(false);
      setNote(googleDriveFailureNote(checked.error));
      return;
    }
    if (!attempt || !gd) {
      setBusy(false);
      setNote(googleDriveFailureNote('attempt-lost'));
      return;
    }
    const exchanged = await gd.exchangeCode(checked.code, attempt.verifier);
    if (!exchanged.ok) {
      setBusy(false);
      setNote(googleDriveFailureNote(exchanged.error));
      return;
    }
    const verified = await gd.verifyConnection();
    setBusy(false);
    if (!verified.ok) {
      setNote(googleDriveFailureNote(verified.error));
      return;
    }
    setConnected(true);
    setNote('Connected to Google Drive.');
  };

  const handleConnect = async () => {
    if (!clientId.trim()) {
      setNote(googleDriveFailureNote('needs-client-id'));
      return;
    }
    const gd = window.lucidAPI?.googleDrive;
    const openExternal = window.lucidAPI?.browser?.openExternal;
    if (!gd || !openExternal) {
      setNote('The Google Drive sign-in is not available in this build of Lucid.');
      return;
    }
    setBusy(true);
    setNote('Google sign-in opened in your browser — sign in with Google to authorise Lucid.');
    // The listener must be bound before the sign-in page opens, or
    // Google's redirect can land on a port nobody is listening on.
    const started = await gd.startListener();
    if (!started.ok) {
      setBusy(false);
      setNote(googleDriveFailureNote(started.error));
      return;
    }
    try {
      const pkce = await generatePkcePair();
      const pkceState = randomUrlSafeString(32);
      savePkceAttempt({ verifier: pkce.verifier, state: pkceState });
      // Subscribe before opening the sign-in page: the redirect can
      // only arrive after the user signs in, but the subscription
      // must already exist when it does.
      redirectUnsubRef.current?.();
      redirectUnsubRef.current = gd.onAuthRedirect((redirect) => {
        redirectUnsubRef.current?.();
        redirectUnsubRef.current = null;
        void handleRedirect(redirect);
      });
      const url = buildGoogleDriveAuthUrl(clientId.trim(), pkceState, pkce.challenge);
      await openExternal(url);
    } catch {
      // The sign-in page never opened — stop the listener so a
      // retry does not answer 'already-running'.
      await gd.stopListener();
      setBusy(false);
      setNote(googleDriveFailureNote('listener-failed'));
    }
  };

  const handleDisconnect = async () => {
    const gd = window.lucidAPI?.googleDrive;
    if (gd) await gd.disconnect();
    setConnected(false);
    setNote(null);
  };

  // Tokens are stored in the main process, so the segment reports
  // not connected until that lands — it never fakes a connection.
  const state = googleDriveConnectionState(clientId, connected ?? false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <HardDrive size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Google Drive</span>
          <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
            Connect your Google Drive to Lucid — find, upload, download, organise and share
            Drive files.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* Connect / Disconnect — the segment's action, for now.
          Tapping Connect starts the Google sign-in: listener,
          sign-in page, redirect, exchange, verify. With no client
          ID configured it says plainly what is missing instead of
          faking a connection. */}
      <div className="flex items-center gap-3">
        {connected ? (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            aria-label="Disconnect Google Drive"
            title="Disconnect Google Drive — deletes the stored sign-in"
            className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
          >
            Disconnect Google Drive
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy}
            aria-label="Connect Google Drive"
            title="Connect Google Drive — opens Google sign-in"
            className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0 disabled:opacity-50"
          >
            Connect Google Drive
          </button>
        )}
        <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
          {note ??
            (state === 'needs-client-id'
              ? 'Not connected. A Google OAuth client ID is needed before Connect can sign in.'
              : 'Not connected. Tap Connect and sign in with Google.')}
        </span>
      </div>

      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Finds, uploads, downloads, organises and shares the files in your Google Drive,
        including the documents, notes and notebooks you keep there. It stays when LuciferAI
        is off — turning LuciferAI off removes the Synth and the blood drop, not Google Drive.
      </p>

      {/* Connections — Google Drive is a place other things can
          connect to, the way AI Chat is. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Connections</h4>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          No connections yet. A starship, or anything else, can use segments to connect to
          Google Drive the way they connect to AI Chat.
        </p>
      </div>
    </div>
  );
}
