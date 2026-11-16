/**
 * Genesis — the first verification (FixNet, Gary 2026-11-16).
 *
 * The grab requires a verified referrer, and no verified referrer
 * exists yet. The first verification becomes possible because
 * FixNet is finished: the FIRST temp ever activated may carry the
 * genesis referral, and the grab treats its referrer as verified,
 * so the root verifies on the first grab. The root is Gary's own
 * profile — he is the owner/founder.
 *
 * The claim is EXPLICIT and one-time, on both sides:
 * - Client: the genesis referral is sent ONLY when the founder
 *   flag (`fixnetClaimGenesis`) is on AND this install has never
 *   activated a temp (`fixnetActivatedOnce` is false). The flag
 *   defaults to off — a later install's first profile does NOT
 *   claim the root by accident. The flag is consumed by the first
 *   successful activation, genesis or not.
 * - Server: the referral only verifies at activation tick 1. A
 *   later temp carrying it is marked not_verified
 *   (genesis_not_root) — terminal, never re-checked. A wrong
 *   claim bricks that temp's verification forever, which is why
 *   the client flag defaults to off and the deploy must confirm
 *   the server's tick 1 is still free before the root is claimed.
 *
 * A referral-less temp is NEVER silently marked verified: without
 * the explicit genesis referral it is marked not_verified
 * (no_referral) by the grab, and this module never invents a
 * referral for it.
 */
import { useSettingsStore } from '../stores/settingsStore';

/** The genesis referral id — the root of the referral chain. */
export const GENESIS_REFERRAL_ID = 'ref:genesis';

/**
 * The referral to send when creating a new profile, or null for a
 * normal (referral-less) activation. Returns the genesis referral
 * only when the founder flag is on and this install has never
 * activated a temp. Pure read — it does not consume the flag;
 * the caller consumes it via markFixNetActivated() after a
 * successful activation.
 */
export function genesisReferralForNewProfile(): string | null {
  const settings = useSettingsStore.getState().settings;
  if (settings.fixnetClaimGenesis !== true) return null;
  if (settings.fixnetActivatedOnce === true) return null;
  return GENESIS_REFERRAL_ID;
}

/**
 * Record that this install has activated a temp (genesis or not).
 * Consumes the founder flag: after the first successful activation
 * this install can never claim the root again (its first tick is
 * taken, so a later claim would be refused as genesis_not_root).
 * Call after a successful activateTemp — never after a failed one
 * (a failed activation takes no tick, so the claim stays live).
 * Returns the settings write (await it in tests; fire-and-forget
 * in the UI).
 */
export function markFixNetActivated(): Promise<void> {
  const store = useSettingsStore.getState();
  return store.updateSettings({
    fixnetActivatedOnce: true,
    fixnetClaimGenesis: false,
  });
}
