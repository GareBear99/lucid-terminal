/**
 * Telegram connection — the Bot API start behind the Telegram
 * segment's Connect button (Gary, 2026-11-08 ~03:00 PST: "So plan
 * and get that segment rolling" + "for users ya"). Built exactly
 * like the Google Drive sign-in (src/lib/googleDriveAuth.ts): a
 * pure lib the segment calls, with a real verification behind it.
 *
 * The mechanism Gary approved: a Telegram bot. The user creates
 * their own bot in BotFather on Telegram and pastes the bot token
 * here. Tapping Connect verifies the token with a real call to
 * Telegram's Bot API (getMe) — the call either returns the bot or
 * it does not, and the segment reports that honestly. The token
 * itself is a secret: it is stored encrypted in secureStorage
 * (electron/services/secureStorage.ts, telegramBotTokenStorage —
 * the same pattern as the OpenAI key and the ping key), never in
 * plain Settings. The bot's username is a public identifier and
 * lives in settings as telegramBotUsername, captured when the
 * token is verified.
 *
 * What this file does (the connection, for now):
 * - telegramConnectionState: needs-token / not-connected /
 *   connected, from whether a token is stored and whether it was
 *   verified (a stored token + a stored username means it was
 *   verified by a real getMe call when it was stored).
 * - getMeUrl + validateTelegramBotToken: the real Bot API check.
 *   The token is never invented or hard-coded, and no connection
 *   is faked: with no token the segment says plainly what is
 *   missing, and a token that does not verify is refused.
 *
 * What it does NOT do yet (follow-ups, not this task):
 * - Sending and reading messages through the bot. The connection
 *   is what this segment builds now; the message step is next.
 * - The temp → user conversion and the verification status
 *   lookup. Design rules (Gary, 2026-11-08 ~03:01–03:02 PST):
 *   once a temp is VERIFIED, they can use Telegram to become a
 *   full user, and they do NOT even need the Lucid retrieved
 *   action — the Telegram path alone is sufficient. When that
 *   happens the new user account STAYS LINKED to the temp (and
 *   thus to the referral): the referrer keeps the credit, the
 *   temp still counts toward the Full Glass two activated and
 *   recognised temps, and the referral token accumulation still
 *   applies — the conversion must NOT break the temp/referral
 *   link. And ANY temp, verified or not, can check the status of
 *   their verification — the system must expose a status lookup,
 *   not just a hidden yes/no gate. The account/temp store and the
 *   daily verification check that make all of that live do NOT
 *   exist yet, so nothing here fakes the conversion or the
 *   lookup: the segment builds the connection + the conversion
 *   entry point, and reports what still needs the backend.
 *
 * No user-account login is built here (Gary's mechanism is the
 * bot token): no phone number, no sign-in code, no MTProto.
 */

/** Telegram's Bot API. */
export const TELEGRAM_BOT_API_BASE = 'https://api.telegram.org';

/** A Telegram bot, as getMe returns it. */
export interface TelegramBot {
  id: number;
  username: string;
  first_name: string;
}

/** The connection state the segment reports. */
export type TelegramConnectionState =
  | 'needs-token'
  | 'not-connected'
  | 'connected';

/**
 * The segment's connection state, from what is stored and what
 * was verified. A stored token + a stored bot username means the
 * token was verified by a real getMe call when it was stored.
 */
export function telegramConnectionState(
  hasToken: boolean,
  validated: boolean,
): TelegramConnectionState {
  if (!hasToken) return 'needs-token';
  if (validated) return 'connected';
  return 'not-connected';
}

/** The getMe URL for a bot token. Telegram's Bot API puts the
 *  token in the path — that is the API's design, not a leak: the
 *  token is never logged, and the call goes to Telegram only. */
export function getMeUrl(token: string): string {
  return `${TELEGRAM_BOT_API_BASE}/bot${token}/getMe`;
}

/** The result of checking a bot token with Telegram. */
export type TelegramTokenValidation =
  | { ok: true; bot: TelegramBot }
  | { ok: false; error: 'empty' | 'network' | 'bad-response' | 'unauthorized' };

/**
 * Verify a bot token with a real call to Telegram's Bot API
 * (getMe). Returns the bot when the token verifies, or the reason
 * it did not. `fetchFn` is injectable so tests never touch the
 * network and never need a real token.
 */
export async function validateTelegramBotToken(
  token: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<TelegramTokenValidation> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  let res: Response;
  try {
    res = await fetchFn(getMeUrl(trimmed));
  } catch {
    return { ok: false, error: 'network' };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'bad-response' };
  }
  // Telegram answers { ok: true, result: { id, username,
  // first_name } } or { ok: false, error_code, description }.
  if (
    typeof body === 'object' &&
    body !== null &&
    (body as { ok?: unknown }).ok === true
  ) {
    const result = (body as { result?: unknown }).result;
    if (
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { id?: unknown }).id === 'number' &&
      typeof (result as { username?: unknown }).username === 'string' &&
      typeof (result as { first_name?: unknown }).first_name === 'string'
    ) {
      return { ok: true, bot: result as TelegramBot };
    }
    return { ok: false, error: 'bad-response' };
  }
  return { ok: false, error: 'unauthorized' };
}
