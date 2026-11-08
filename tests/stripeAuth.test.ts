/**
 * Stripe connection tests (Gary, 2026-11-08 ~04:05 PST).
 *
 * The Connect button verifies the user's API key with a real
 * call to Stripe's API (GET /v1/account). These tests cover the
 * pure pieces: the connection state, the account URL, and the
 * key validation — with a mock fetch, so no test touches the
 * network or needs a real key. Balance reading, payment links
 * and taking payments are follow-ups, not this file.
 *
 * A restricted key is best (least privilege); a full secret key
 * also works. A restricted key without the Accounts read
 * permission answers 403 — that is not a bad key, it is a key
 * without the permission, so it is reported distinctly
 * ('forbidden') and the segment tells the user how to fix it.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  STRIPE_API_BASE,
  accountUrl,
  stripeConnectionState,
  validateStripeApiKey,
} from '../src/lib/stripeAuth';

/** A mock fetch returning one status + JSON body. */
function mockFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as unknown as Response,
  );
}

describe('stripeConnectionState', () => {
  it('needs a key before Connect can verify it', () => {
    expect(stripeConnectionState(false, false)).toBe('needs-key');
    expect(stripeConnectionState(false, true)).toBe('needs-key');
  });

  it('is not connected with a stored key that was not verified', () => {
    expect(stripeConnectionState(true, false)).toBe('not-connected');
  });

  it('is connected once the key was verified', () => {
    expect(stripeConnectionState(true, true)).toBe('connected');
  });
});

describe('accountUrl', () => {
  it('is the Stripe account endpoint, and nothing else', () => {
    expect(accountUrl()).toBe(`${STRIPE_API_BASE}/v1/account`);
    expect(accountUrl().startsWith('https://api.stripe.com/')).toBe(true);
  });
});

describe('validateStripeApiKey', () => {
  it('returns the account when Stripe verifies the key', async () => {
    const fetchFn = mockFetch(200, {
      id: 'acct_123',
      business_profile: { name: 'GareBear Productionz' },
      email: 'gdoman99@gmail.com',
      charges_enabled: true,
      payouts_enabled: true,
      livemode: true,
    });
    const result = await validateStripeApiKey('sk_live_abc', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      accountUrl(),
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk_live_abc' },
      }),
    );
    expect(result).toEqual({
      ok: true,
      account: {
        id: 'acct_123',
        displayName: 'GareBear Productionz',
        chargesEnabled: true,
        payoutsEnabled: true,
        livemode: true,
      },
    });
  });

  it('falls back to the account email, then the id, for the display name', async () => {
    const byEmail = mockFetch(200, {
      id: 'acct_456',
      business_profile: {},
      email: 'gdoman99@gmail.com',
      charges_enabled: false,
      payouts_enabled: false,
      livemode: false,
    });
    const emailResult = await validateStripeApiKey('sk_test_abc', byEmail);
    expect(emailResult).toEqual({
      ok: true,
      account: {
        id: 'acct_456',
        displayName: 'gdoman99@gmail.com',
        chargesEnabled: false,
        payoutsEnabled: false,
        livemode: false,
      },
    });
    const byId = mockFetch(200, { id: 'acct_789' });
    const idResult = await validateStripeApiKey('sk_test_abc', byId);
    expect(idResult).toEqual({
      ok: true,
      account: {
        id: 'acct_789',
        displayName: 'acct_789',
        chargesEnabled: false,
        payoutsEnabled: false,
        livemode: false,
      },
    });
  });

  it('refuses a key Stripe answers 401 for', async () => {
    const fetchFn = mockFetch(401, {
      error: { type: 'invalid_request_error', message: 'Invalid API Key provided' },
    });
    const result = await validateStripeApiKey('bad-key', fetchFn);
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('reports a restricted key without the Accounts permission distinctly', async () => {
    // A 403 is a key that authenticated but cannot read the
    // account — not a bad key, a key without the permission.
    const fetchFn = mockFetch(403, {
      error: {
        type: 'invalid_request_error',
        message: 'This key cannot perform that action.',
      },
    });
    const result = await validateStripeApiKey('rk_live_abc', fetchFn);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses an empty key without calling Stripe', async () => {
    const fetchFn = mockFetch(200, { id: 'acct_123' });
    expect(await validateStripeApiKey('', fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(await validateStripeApiKey('   ', fetchFn)).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports network failure instead of faking a connection', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await validateStripeApiKey('sk_live_abc', fetchFn);
    expect(result).toEqual({ ok: false, error: 'network' });
  });

  it('refuses a malformed Stripe answer', async () => {
    const fetchFn = mockFetch(200, { business_profile: { name: 'No id' } });
    const result = await validateStripeApiKey('sk_live_abc', fetchFn);
    expect(result).toEqual({ ok: false, error: 'bad-response' });
  });

  it('refuses a non-JSON answer', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as Response);
    const result = await validateStripeApiKey('sk_live_abc', fetchFn);
    expect(result).toEqual({ ok: false, error: 'bad-response' });
  });
});
