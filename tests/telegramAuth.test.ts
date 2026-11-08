/**
 * Telegram connection tests (Gary, 2026-11-08 ~03:00 PST).
 *
 * The Connect button verifies the user's bot token with a real
 * call to Telegram's Bot API (getMe). These tests cover the pure
 * pieces: the connection state, the getMe URL, and the token
 * validation — with a mock fetch, so no test touches the network
 * or needs a real token. Message sending/reading and the temp →
 * user conversion backend are follow-ups, not this file.
 *
 * No user-account login is tested here: no phone number, no
 * sign-in code, no MTProto — the bot token is the mechanism.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TELEGRAM_BOT_API_BASE,
  getMeUrl,
  telegramConnectionState,
  validateTelegramBotToken,
} from '../src/lib/telegramAuth';

/** A mock fetch returning one JSON body. */
function mockFetch(body: unknown) {
  return vi.fn(async () => ({ json: async () => body }) as unknown as Response);
}

describe('telegramConnectionState', () => {
  it('needs a token before Connect can verify it', () => {
    expect(telegramConnectionState(false, false)).toBe('needs-token');
    expect(telegramConnectionState(false, true)).toBe('needs-token');
  });

  it('is not connected with a stored token that was not verified', () => {
    expect(telegramConnectionState(true, false)).toBe('not-connected');
  });

  it('is connected once the token was verified', () => {
    expect(telegramConnectionState(true, true)).toBe('connected');
  });
});

describe('getMeUrl', () => {
  it('builds the Telegram getMe URL for the token, and nothing else', () => {
    const url = getMeUrl('123456:ABC-def');
    expect(url).toBe(`${TELEGRAM_BOT_API_BASE}/bot123456:ABC-def/getMe`);
    expect(url.startsWith('https://api.telegram.org/')).toBe(true);
  });
});

describe('validateTelegramBotToken', () => {
  it('returns the bot when Telegram verifies the token', async () => {
    const fetchFn = mockFetch({
      ok: true,
      result: { id: 123456, username: 'my_lucid_bot', first_name: 'Lucid' },
    });
    const result = await validateTelegramBotToken('123456:ABC-def', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(getMeUrl('123456:ABC-def'));
    expect(result).toEqual({
      ok: true,
      bot: { id: 123456, username: 'my_lucid_bot', first_name: 'Lucid' },
    });
  });

  it('refuses a token Telegram answers not-ok for', async () => {
    const fetchFn = mockFetch({ ok: false, error_code: 401, description: 'Unauthorized' });
    const result = await validateTelegramBotToken('bad-token', fetchFn);
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('refuses an empty token without calling Telegram', async () => {
    const fetchFn = mockFetch({ ok: true, result: {} });
    expect(await validateTelegramBotToken('', fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(await validateTelegramBotToken('   ', fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports network failure instead of faking a connection', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await validateTelegramBotToken('123456:ABC-def', fetchFn);
    expect(result).toEqual({ ok: false, error: 'network' });
  });

  it('refuses a malformed Telegram answer', async () => {
    const fetchFn = mockFetch({ ok: true, result: { username: 'no-id-bot' } });
    const result = await validateTelegramBotToken('123456:ABC-def', fetchFn);
    expect(result).toEqual({ ok: false, error: 'bad-response' });
  });

  it('refuses a non-JSON answer', async () => {
    const fetchFn = vi.fn(async () => ({
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as Response);
    const result = await validateTelegramBotToken('123456:ABC-def', fetchFn);
    expect(result).toEqual({ ok: false, error: 'bad-response' });
  });
});
