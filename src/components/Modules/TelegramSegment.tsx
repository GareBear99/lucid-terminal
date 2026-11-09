/**
 * Telegram segment — the pre-installed, connectable segment in
 * the Segments panel (Gary, 2026-11-08 ~03:00 PST): "So plan and
 * get that segment rolling" + "for users ya". Built exactly like
 * the Google Drive segment (src/components/Modules/
 * GoogleDriveSegment.tsx): same shape, same honesty. For USERS —
 * a product feature for Lucid users, not just for Gary.
 *
 * Pre-installed: no starship, no install step. Telegram is a
 * place to connect your Telegram to Lucid, through a bot you
 * create in BotFather. It stays when LuciferAI is off — it is
 * not a LuciferAI surface.
 *
 * The panel shows:
 * - The segment itself (pre-installed).
 * - The Connect flow — a bot token input + the Connect button.
 *   The user creates a bot in BotFather on Telegram and pastes
 *   the bot token here. Tapping Connect verifies the token with
 *   a real call to Telegram's Bot API (getMe): the call either
 *   returns the bot or it does not. A verified token is stored
 *   encrypted in secureStorage (telegram-bot-token — the same
 *   pattern as the OpenAI key and the ping key) and the bot's
 *   username is captured in settings as telegramBotUsername.
 *   The button does not fake a connection: with no token it says
 *   plainly what is missing, and a token that does not verify is
 *   refused. Disconnect removes the token and the username.
 * - What it does: connects your Telegram to Lucid through your
 *   bot. Sending and reading messages through the bot is the
 *   NEXT step, not this one — the connection is what this
 *   segment builds now, and the panel says so.
 * - That it stays when LuciferAI is off.
 * - Becoming a user: once a temp is VERIFIED, Telegram is how
 *   that temp becomes a full user — no Lucid retrieval step is
 *   needed, and the new user stays linked to the temp that
 *   referred them, so the referrer keeps the credit (Gary,
 *   2026-11-08 ~03:01–03:02 PST). The account/temp system that
 *   makes this live is NOT built yet, so this does not convert
 *   anyone today — the panel says so, and nothing here fakes the
 *   conversion or the link. Any temp, verified or not, can check
 *   the status of their verification once that system exists —
 *   the status lookup is part of it, not a hidden yes/no gate.
 * - Connections: Telegram is a place other things can connect
 *   to, the way AI Chat is.
 *
 * No user-account login is built here: no phone number, no
 * sign-in code, no MTProto — the bot token is the mechanism.
 */
import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  telegramConnectionState,
  validateTelegramBotToken,
  type TelegramBot,
} from '../../lib/telegramAuth';
import { useSettingsStore } from '../../stores/settingsStore';

/** What the Connect button last did, for the plain-language note under it. */
type ConnectNote =
  | 'needs-token'
  | 'checking'
  | 'connected'
  | 'failed-token'
  | 'failed-network'
  | 'failed'
  | 'disconnected'
  | null;

export function TelegramSegment() {
  const hasToken = useSettingsStore((s) => s.hasTelegramBotToken);
  const botUsername = useSettingsStore((s) => s.settings.telegramBotUsername ?? '');
  const setTelegramBotToken = useSettingsStore((s) => s.setTelegramBotToken);
  const deleteTelegramBotToken = useSettingsStore((s) => s.deleteTelegramBotToken);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [token, setToken] = useState('');
  const [bot, setBot] = useState<TelegramBot | null>(null);
  const [connectNote, setConnectNote] = useState<ConnectNote>(null);

  // The token was verified by a real getMe call when it was
  // stored, and the bot username was captured then — a stored
  // token + a stored username means validated. A bot validated
  // this session counts too.
  const validated = bot !== null || (hasToken && botUsername.trim() !== '');
  const state = telegramConnectionState(hasToken, validated);
  const displayName = bot?.username ?? botUsername;

  const handleConnect = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setConnectNote('needs-token');
      return;
    }
    setConnectNote('checking');
    const result = await validateTelegramBotToken(trimmed);
    if (!result.ok) {
      setConnectNote(
        result.error === 'network'
          ? 'failed-network'
          : result.error === 'unauthorized'
            ? 'failed-token'
            : 'failed',
      );
      return;
    }
    try {
      await setTelegramBotToken(trimmed);
      await updateSetting('telegramBotUsername', result.bot.username);
    } catch {
      setConnectNote('failed');
      return;
    }
    setBot(result.bot);
    setToken('');
    setConnectNote('connected');
  };

  const handleDisconnect = async () => {
    try {
      await deleteTelegramBotToken();
      await updateSetting('telegramBotUsername', '');
    } catch {
      // Best effort — the in-memory state still clears below.
    }
    setBot(null);
    setToken('');
    setConnectNote('disconnected');
  };

  const note =
    connectNote === 'needs-token'
      ? 'Not connected. To connect, create a bot in BotFather on Telegram and paste the bot token here.'
      : connectNote === 'checking'
        ? 'Checking the bot token with Telegram…'
        : connectNote === 'failed-token'
          ? 'That token did not verify with Telegram. Check the token from BotFather and try again.'
          : connectNote === 'failed-network'
            ? 'Telegram could not be reached. Check your connection and try again.'
            : connectNote === 'failed'
              ? 'The token could not be checked. Try again.'
              : connectNote === 'connected'
                ? `Connected as @${displayName}. The bot token is stored securely and verified with Telegram.`
                : connectNote === 'disconnected'
                  ? 'Disconnected. The bot token was removed.'
                  : state === 'needs-token'
                    ? 'Not connected. A bot token from BotFather is needed before Connect can verify it.'
                    : state === 'not-connected'
                      ? 'Not connected. Tap Connect and paste the bot token to verify it.'
                      : `Connected as @${displayName}.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Send size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Telegram</span>
          <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
            Connect your Telegram to Lucid — through a bot you create in BotFather.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* Connect — the bot token input + the segment's action.
          Tapping it verifies the token with a real getMe call to
          Telegram's Bot API. With no token it says plainly what
          is missing instead of faking a connection, and a token
          that does not verify is refused. */}
      <div className="flex items-center gap-3">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the bot token from BotFather"
          aria-label="Telegram bot token"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
        />
        <button
          type="button"
          onClick={() => void handleConnect()}
          aria-label="Connect Telegram"
          title="Connect Telegram — verifies the bot token with Telegram"
          className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
        >
          Connect Telegram
        </button>
        {state === 'connected' && (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            aria-label="Disconnect Telegram"
            title="Disconnect Telegram — removes the stored bot token"
            className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] shrink-0"
          >
            Disconnect
          </button>
        )}
      </div>
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">{note}</p>

      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Connects your Telegram to Lucid through a bot you create in BotFather. Sending and
        reading messages through the bot is the next step — the connection is what this
        segment builds now. It stays when LuciferAI is off — turning LuciferAI off removes
        the Synth and the blood drop, not Telegram.
      </p>

      {/* Becoming a user — the verified-temp conversion path
          (Gary, 2026-11-08 ~03:01–03:02 PST). Once a temp is
          verified, Telegram is how that temp becomes a full user
          — no Lucid retrieval step is needed, and the new user
          stays linked to the temp that referred them, so the
          referrer keeps the credit. The account system that
          makes this live is not built yet, so this does not
          convert anyone today. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">
          Becoming a user
        </h4>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Once a temp is verified, Telegram is how that temp becomes a full user — no Lucid
          retrieval step is needed, and the new user stays linked to the temp that referred
          them, so the referrer keeps the credit. The account system that makes this live is
          not built yet, so this does not convert you today.
        </p>
      </div>

      {/* Connections — Telegram is a place other things can
          connect to, the way AI Chat is. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Connections</h4>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          No connections yet. A starship, or anything else, can use segments to connect to
          Telegram the way they connect to AI Chat.
        </p>
      </div>
    </div>
  );
}
