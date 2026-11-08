/**
 * Stripe connection — the API-key start behind the Stripe
 * segment's Connect button (Gary, 2026-11-08 ~04:05 PST: "lets
 * get a stripe segment too for lucid"). Built exactly like the
 * Telegram connection (src/lib/telegramAuth.ts): a pure lib the
 * segment calls, with a real verification behind it.
 *
 * The mechanism: a Stripe API key. The user creates the key in
 * the Stripe Dashboard and pastes it here. A RESTRICTED key is
 * best (least privilege — it can only do what it is allowed to
 * do; Stripe itself recommends restricted keys for keys given to
 * an agent). A full secret key also works, but it can do anything
 * in the account. Tapping Connect verifies the key with a real
 * call to Stripe's API (GET /v1/account) — the call either
 * returns the account or it does not, and the segment reports
 * that honestly. The key itself is a secret: it is stored
 * encrypted in secureStorage (electron/services/secureStorage.ts,
 * stripeApiKeyStorage — the same pattern as the OpenAI key, the
 * ping key and the Telegram bot token), never in plain Settings.
 * The account id and display name are public identifiers and
 * live in settings as stripeAccountId / stripeAccountName,
 * captured when the key is verified.
 *
 * Restricted-key caveat (verified against Stripe's docs,
 * 2026-11-08): GET /v1/account works with a restricted key ONLY
 * if the key has the Accounts read permission. A restricted key
 * without it answers 403 ("This key cannot perform that
 * action") — that is not a bad key, it is a key without the
 * permission, so it is reported distinctly ('forbidden') and the
 * segment tells the user to add the Accounts read permission in
 * the Dashboard, or use a full secret key instead. A 401 is a
 * bad key ('unauthorized').
 *
 * What this file does (the connection, for now):
 * - stripeConnectionState: needs-key / not-connected /
 *   connected, from whether a key is stored and whether it was
 *   verified (a stored key + a stored account id means it was
 *   verified by a real /v1/account call when it was stored).
 * - accountUrl + validateStripeApiKey: the real Stripe check.
 *   The key is never invented or hard-coded, and no connection
 *   is faked: with no key the segment says plainly what is
 *   missing, and a key that does not verify is refused.
 *
 * What it does NOT do yet (follow-ups, not this task):
 * - Reading the live balance. The account object returned by
 *   the verification carries charges_enabled / payouts_enabled,
 *   which say whether the account can take money — the segment
 *   shows that status when the key is verified. A live balance
 *   read needs a main-process call (the key never crosses into
 *   the renderer after it is stored), which is the next step.
 * - Payment links, taking payments, payouts. The connection is
 *   what this segment builds now; the money movement is next,
 *   and nothing here fakes it.
 *
 * Stripe is NOT the Muse Stripe connector (the OAuth link Gary
 * taps to connect Stripe to Muse). This is Lucid's own segment:
 * Lucid connecting to Stripe with the user's own key.
 */

/** Stripe's API. */
export const STRIPE_API_BASE = 'https://api.stripe.com';

/** A Stripe account, as GET /v1/account returns it (the fields
 *  this segment uses — id, display name, and whether the
 *  account can take money). */
export interface StripeAccount {
  id: string;
  displayName: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  livemode: boolean;
}

/** The connection state the segment reports. */
export type StripeConnectionState =
  | 'needs-key'
  | 'not-connected'
  | 'connected';

/**
 * The segment's connection state, from what is stored and what
 * was verified. A stored key + a stored account id means the key
 * was verified by a real /v1/account call when it was stored.
 */
export function stripeConnectionState(
  hasKey: boolean,
  validated: boolean,
): StripeConnectionState {
  if (!hasKey) return 'needs-key';
  if (validated) return 'connected';
  return 'not-connected';
}

/** The account URL — the verification call. The key goes in the
 *  Authorization header as a Bearer token; it is never logged,
 *  and the call goes to Stripe only. */
export function accountUrl(): string {
  return `${STRIPE_API_BASE}/v1/account`;
}

/** The result of checking an API key with Stripe. */
export type StripeKeyValidation =
  | { ok: true; account: StripeAccount }
  | {
      ok: false;
      error: 'empty' | 'network' | 'bad-response' | 'unauthorized' | 'forbidden';
    };

/**
 * Verify an API key with a real call to Stripe's API
 * (GET /v1/account). Returns the account when the key verifies,
 * or the reason it did not. `fetchFn` is injectable so tests
 * never touch the network and never need a real key.
 *
 * A 401 is a bad key. A 403 is a key that authenticated but
 * cannot read the account — a restricted key without the
 * Accounts read permission (see the header note).
 */
export async function validateStripeApiKey(
  key: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<StripeKeyValidation> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  let res: Response;
  try {
    res = await fetchFn(accountUrl(), {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'unauthorized' };
    if (res.status === 403) return { ok: false, error: 'forbidden' };
    return { ok: false, error: 'bad-response' };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'bad-response' };
  }
  // Stripe answers the account object: { id: 'acct_…',
  // business_profile: { name }, email, charges_enabled,
  // payouts_enabled, livemode, … }. The id is the account — a
  // body without a string id is not an account.
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'bad-response' };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return { ok: false, error: 'bad-response' };
  }
  const businessProfile =
    typeof raw.business_profile === 'object' && raw.business_profile !== null
      ? (raw.business_profile as Record<string, unknown>)
      : {};
  const profileName =
    typeof businessProfile.name === 'string' && businessProfile.name.trim() !== ''
      ? businessProfile.name.trim()
      : null;
  const email =
    typeof raw.email === 'string' && raw.email.trim() !== ''
      ? raw.email.trim()
      : null;
  return {
    ok: true,
    account: {
      id: raw.id.trim(),
      displayName: profileName ?? email ?? raw.id.trim(),
      chargesEnabled: raw.charges_enabled === true,
      payoutsEnabled: raw.payouts_enabled === true,
      livemode: raw.livemode === true,
    },
  };
}
