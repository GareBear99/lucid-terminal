/**
 * Stripe segment — the pre-installed, connectable segment in
 * the Segments panel (Gary, 2026-11-08 ~04:05 PST): "lets get a
 * stripe segment too for lucid". Built exactly like the Telegram
 * segment (src/components/Modules/TelegramSegment.tsx): same
 * shape, same honesty. For USERS — a product feature for Lucid
 * users, not just for Gary.
 *
 * Pre-installed: no starship, no install step. Stripe is a place
 * to connect your Stripe to Lucid, through an API key you create
 * in the Stripe Dashboard — the wallet for receiving money. It
 * stays when LuciferAI is off — it is not a LuciferAI surface.
 *
 * The panel shows:
 * - The segment itself (pre-installed).
 * - The Connect flow — an API key input + the Connect button.
 *   The user creates the key in the Stripe Dashboard and pastes
 *   it here. A RESTRICTED key is best (least privilege — it can
 *   only do what it is allowed to do); a full secret key also
 *   works. Tapping Connect verifies the key with a real call to
 *   Stripe's API (GET /v1/account): the call either returns the
 *   account or it does not. A verified key is stored encrypted
 *   in secureStorage (stripe-api-key — the same pattern as the
 *   OpenAI key, the ping key and the Telegram bot token) and the
 *   account id + display name are captured in settings as
 *   stripeAccountId / stripeAccountName. The button does not
 *   fake a connection: with no key it says plainly what is
 *   missing, and a key that does not verify is refused.
 *   A restricted key without the Accounts read permission answers
 *   403 — that is not a bad key, it is a key without the
 *   permission, and the panel says so (add the permission in the
 *   Dashboard, or use a full secret key). Disconnect removes the
 *   key and the account.
 * - What it does: connects your Stripe to Lucid so Lucid can
 *   show the account and whether it can take payments. Reading
 *   the live balance, creating payment links, and taking payments
 *   are the NEXT step, not this one — the connection is what this
 *   segment builds now, and the panel says so.
 * - Receiving money: the account must have charges and payouts
 *   enabled in Stripe to actually take money. The segment shows
 *   that status when the key is verified.
 * - That it stays when LuciferAI is off.
 * - Connections: Stripe is a place other things can connect to,
 *   the way AI Chat is.
 *
 * This is NOT the Muse Stripe connector (the OAuth link Gary
 * taps to connect Stripe to Muse). This is Lucid's own segment:
 * Lucid connecting to Stripe with the user's own key.
 */
import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import {
  stripeConnectionState,
  validateStripeApiKey,
  type StripeAccount,
} from '../../lib/stripeAuth';
import { useSettingsStore } from '../../stores/settingsStore';

/** What the Connect button last did, for the plain-language note under it. */
type ConnectNote =
  | 'needs-key'
  | 'checking'
  | 'connected'
  | 'failed-key'
  | 'failed-forbidden'
  | 'failed-network'
  | 'failed'
  | 'disconnected'
  | null;

export function StripeSegment() {
  const hasKey = useSettingsStore((s) => s.hasStripeApiKey);
  const accountId = useSettingsStore((s) => s.settings.stripeAccountId ?? '');
  const accountName = useSettingsStore((s) => s.settings.stripeAccountName ?? '');
  const setStripeApiKey = useSettingsStore((s) => s.setStripeApiKey);
  const deleteStripeApiKey = useSettingsStore((s) => s.deleteStripeApiKey);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [apiKey, setApiKey] = useState('');
  const [account, setAccount] = useState<StripeAccount | null>(null);
  const [connectNote, setConnectNote] = useState<ConnectNote>(null);

  // The key was verified by a real /v1/account call when it was
  // stored, and the account id was captured then — a stored key
  // + a stored account id means validated. An account validated
  // this session counts too.
  const validated = account !== null || (hasKey && accountId.trim() !== '');
  const state = stripeConnectionState(hasKey, validated);
  const displayName = account?.displayName ?? accountName;
  // Whether the account can take money, from the verification
  // that just ran (not persisted — a live balance/status read is
  // the next step, and the segment does not claim a status it
  // did not just check).
  const moneyStatus = account
    ? account.chargesEnabled && account.payoutsEnabled
      ? 'Charges and payouts are enabled on this account, so it can take money.'
      : account.chargesEnabled
        ? 'Charges are enabled, but payouts are not yet — the account cannot pay out until payouts are enabled in Stripe.'
        : 'Charges are not enabled on this account yet — it cannot take money until charges are enabled in Stripe.'
    : null;

  const handleConnect = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setConnectNote('needs-key');
      return;
    }
    setConnectNote('checking');
    const result = await validateStripeApiKey(trimmed);
    if (!result.ok) {
      setConnectNote(
        result.error === 'network'
          ? 'failed-network'
          : result.error === 'unauthorized'
            ? 'failed-key'
            : result.error === 'forbidden'
              ? 'failed-forbidden'
              : 'failed',
      );
      return;
    }
    try {
      await setStripeApiKey(trimmed);
      await updateSetting('stripeAccountId', result.account.id);
      await updateSetting('stripeAccountName', result.account.displayName);
    } catch {
      setConnectNote('failed');
      return;
    }
    setAccount(result.account);
    setApiKey('');
    setConnectNote('connected');
  };

  const handleDisconnect = async () => {
    try {
      await deleteStripeApiKey();
      await updateSetting('stripeAccountId', '');
      await updateSetting('stripeAccountName', '');
    } catch {
      // Best effort — the in-memory state still clears below.
    }
    setAccount(null);
    setApiKey('');
    setConnectNote('disconnected');
  };

  const note =
    connectNote === 'needs-key'
      ? 'Not connected. To connect, create a key in the Stripe Dashboard and paste it here — a restricted key is best.'
      : connectNote === 'checking'
        ? 'Checking the key with Stripe…'
        : connectNote === 'failed-key'
          ? 'That key did not verify with Stripe. Check the key from the Stripe Dashboard and try again.'
          : connectNote === 'failed-forbidden'
            ? 'That key is valid, but it cannot read the Stripe account. If it is a restricted key, give it the Accounts read permission in the Stripe Dashboard, or use a full secret key instead.'
            : connectNote === 'failed-network'
              ? 'Stripe could not be reached. Check your connection and try again.'
              : connectNote === 'failed'
                ? 'The key could not be checked. Try again.'
                : connectNote === 'connected'
                  ? `Connected as ${displayName}. The key is stored securely and verified with Stripe.${moneyStatus ? ` ${moneyStatus}` : ''}`
                  : connectNote === 'disconnected'
                    ? 'Disconnected. The key was removed.'
                    : state === 'needs-key'
                      ? 'Not connected. A key from the Stripe Dashboard is needed before Connect can verify it.'
                      : state === 'not-connected'
                        ? 'Not connected. Tap Connect and paste the key to verify it.'
                        : `Connected as ${displayName}.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <CreditCard size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Stripe</span>
          <span className="block text-xs text-[var(--text-muted)]">
            Connect your Stripe to Lucid — the wallet for receiving money.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* Connect — the API key input + the segment's action.
          Tapping it verifies the key with a real GET /v1/account
          call to Stripe. With no key it says plainly what is
          missing instead of faking a connection, and a key that
          does not verify is refused. */}
      <div className="flex items-center gap-3">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste the key from the Stripe Dashboard"
          aria-label="Stripe API key"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
        />
        <button
          type="button"
          onClick={() => void handleConnect()}
          aria-label="Connect Stripe"
          title="Connect Stripe — verifies the key with Stripe"
          className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
        >
          Connect Stripe
        </button>
        {state === 'connected' && (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            aria-label="Disconnect Stripe"
            title="Disconnect Stripe — removes the stored key"
            className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
          >
            Disconnect
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{note}</p>

      <p className="text-xs text-[var(--text-muted)]">
        Connects your Stripe to Lucid so Lucid can show the account and whether it can take
        payments. Reading the live balance, creating payment links, and taking payments are
        the next step — the connection is what this segment builds now. It stays when
        LuciferAI is off — turning LuciferAI off removes the Synth and the blood drop, not
        Stripe.
      </p>

      {/* Receiving money — the wallet's point, and what is still
          missing. The account must have charges and payouts
          enabled in Stripe to actually take money; the segment
          shows that status when the key is verified. Payment
          links and taking payments are the next step, not this
          one. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">
          Receiving money
        </h4>
        <p className="text-xs text-[var(--text-muted)]">
          Stripe is the wallet for receiving money. The account must have charges and payouts
          enabled in Stripe to actually take money, and the segment shows that status when the
          key is verified. Creating payment links and taking payments is the next step — this
          segment connects the account, it does not take payments yet.
        </p>
      </div>

      {/* Connections — Stripe is a place other things can
          connect to, the way AI Chat is. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Connections</h4>
        <p className="text-xs text-[var(--text-muted)]">
          No connections yet. A starship, or anything else, can use segments to connect to
          Stripe the way they connect to AI Chat.
        </p>
      </div>
    </div>
  );
}
