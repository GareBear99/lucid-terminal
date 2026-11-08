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
 *   Google sign-in (OAuth, Gary's approved mechanism): it opens
 *   Google's sign-in page in the browser, the user authorises
 *   Lucid, and the sign-in completes once the redirect listener +
 *   token exchange land (the approved next step). The button does
 *   not fake a connection: with no Google OAuth client ID
 *   configured it says plainly what is missing and what to provide
 *   (a Google Cloud OAuth client ID, Desktop app type, stored in
 *   settings as googleDriveClientId). No client secret is stored —
 *   the desktop sign-in uses PKCE, so there is no secret to keep.
 * - What it does: find, upload, download, organise and share
 *   Drive files.
 * - That it stays when LuciferAI is off.
 * - Connections: Google Drive is a place other things can connect
 *   to, the way AI Chat is.
 *
 * Gmail is NOT in this segment (Gary, 2026-11-08 ~02:34 PST):
 * Gmail is a separate future segment, "Gmail Connect", gated on a
 * temp being verified by the daily server check. Nothing here asks
 * for Gmail scope or promises Gmail.
 */
import { useState } from 'react';
import { HardDrive } from 'lucide-react';
import {
  buildGoogleDriveAuthUrl,
  generatePkcePair,
  googleDriveConnectionState,
  randomUrlSafeString,
  savePkceAttempt,
} from '../../lib/googleDriveAuth';
import { useSettingsStore } from '../../stores/settingsStore';

/** What the Connect button last did, for the plain-language note under it. */
type ConnectNote = 'needs-client-id' | 'signing-in' | 'failed' | null;

export function GoogleDriveSegment() {
  const clientId = useSettingsStore((s) => s.settings.googleDriveClientId ?? '');
  const [connectNote, setConnectNote] = useState<ConnectNote>(null);
  // Tokens are not stored yet (the code exchange is the next step),
  // so the segment reports not connected until that lands.
  const state = googleDriveConnectionState(clientId, false);

  const handleConnect = async () => {
    if (!clientId.trim()) {
      setConnectNote('needs-client-id');
      return;
    }
    const openExternal = window.lucidAPI?.browser?.openExternal;
    if (!openExternal) {
      setConnectNote('failed');
      return;
    }
    try {
      const pkce = await generatePkcePair();
      const pkceState = randomUrlSafeString(32);
      savePkceAttempt({ verifier: pkce.verifier, state: pkceState });
      const url = buildGoogleDriveAuthUrl(clientId.trim(), pkceState, pkce.challenge);
      await openExternal(url);
      setConnectNote('signing-in');
    } catch {
      setConnectNote('failed');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <HardDrive size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Google Drive</span>
          <span className="block text-xs text-[var(--text-muted)]">
            Connect your Google Drive to Lucid — find, upload, download, organise and share
            Drive files.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* Connect — the segment's action, for now. Tapping it starts
          the Google sign-in: it opens Google's sign-in page in the
          browser. With no client ID configured it says plainly what
          is missing instead of faking a connection. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleConnect()}
          aria-label="Connect Google Drive"
          title="Connect Google Drive — opens Google sign-in"
          className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
        >
          Connect Google Drive
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {connectNote === 'needs-client-id'
            ? 'Not connected. To connect, Lucid needs a Google OAuth client ID — create one in Google Cloud Console as a Desktop app, and give the client ID to Slave to store in Settings.'
            : connectNote === 'signing-in'
              ? 'Google sign-in opened in your browser — sign in with Google to authorise Lucid.'
              : connectNote === 'failed'
                ? 'The sign-in could not be opened. Try again, or check that a Google OAuth client ID is stored in Settings.'
                : state === 'needs-client-id'
                  ? 'Not connected. A Google OAuth client ID is needed before Connect can sign in.'
                  : 'Not connected. Tap Connect and sign in with Google.'}
        </span>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Finds, uploads, downloads, organises and shares the files in your Google Drive,
        including the documents, notes and notebooks you keep there. It stays when LuciferAI
        is off — turning LuciferAI off removes the Synth and the blood drop, not Google Drive.
      </p>

      {/* Connections — Google Drive is a place other things can
          connect to, the way AI Chat is. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Connections</h4>
        <p className="text-xs text-[var(--text-muted)]">
          No connections yet. A starship, or anything else, can use segments to connect to
          Google Drive the way they connect to AI Chat.
        </p>
      </div>
    </div>
  );
}
