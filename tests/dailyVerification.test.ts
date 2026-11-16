// @vitest-environment jsdom
/**
 * Daily-verification issuance tests (dailies half 5).
 *
 * `applyDailyVerificationIssuance` (src/lib/dailyVerification.ts)
 * is the named call site that will receive issuance when the
 * FixNet connection lands (Phase 4) — it has NO caller today, and
 * nothing here fakes issuance: these tests call the function
 * directly, the way the connection will, and assert what the
 * store does with it. No UI path, no local "verify" button.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { applyDailyVerificationIssuance } from '../src/lib/dailyVerification';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

function resetProfiles() {
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // jsdom without storage: the store resets below regardless.
  }
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
  });
}

beforeEach(() => {
  resetProfiles();
});

describe('applyDailyVerificationIssuance', () => {
  test('issuance for a temp flips it to verified and records the gate', () => {
    expect(applyDailyVerificationIssuance('default')).toBe(true);
    const profile = useProfileStore.getState().profiles[0];
    expect(profile.verifiedGates).toEqual(['daily-check']);
    expect(profile.status).toBe('verified');
  });

  test('issuance never flips a temp to user — only telegram does that', () => {
    applyDailyVerificationIssuance('default');
    expect(useProfileStore.getState().profiles[0].status).not.toBe('user');
  });

  test('issuance for a guest returns false and changes nothing', () => {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(applyDailyVerificationIssuance(guest.id)).toBe(false);
    const after = useProfileStore
      .getState()
      .profiles.find((p) => p.id === guest.id);
    expect(after?.status).toBe('guest');
    expect(after?.verifiedGates).toEqual([]);
  });

  test('issuance for an unknown profile returns false', () => {
    expect(applyDailyVerificationIssuance('profile-gone')).toBe(false);
  });

  test('repeated issuance is idempotent — no duplicate gate', () => {
    expect(applyDailyVerificationIssuance('default')).toBe(true);
    expect(applyDailyVerificationIssuance('default')).toBe(true);
    expect(
      useProfileStore.getState().profiles[0].verifiedGates,
    ).toEqual(['daily-check']);
  });
});
