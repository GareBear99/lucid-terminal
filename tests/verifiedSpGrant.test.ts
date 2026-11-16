// @vitest-environment jsdom
/**
 * Verified SP grant tests (src/lib/verifiedSpGrant.ts).
 *
 * The grant is 1,000 SP/day for a verified profile — recorded
 * once per UTC day, and refused to any profile that is not
 * verified (never self-reported). The server owns the grant; this
 * module records it per profile and refreshes the SP balance from
 * the server so the new balance shows.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VERIFIED_SP_DAILY,
  applyVerifiedSpGrant,
  isActiveProfileVerified,
  isProfileVerified,
  verifiedGrantDay,
} from '../src/lib/verifiedSpGrant';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
  type Profile,
} from '../src/stores/profileStore';
import { useAIStore } from '../src/stores/aiStore';

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

function makeProfile(id: string, name: string, status: Profile['status']): Profile {
  return {
    id,
    name,
    status,
    verifiedGates: status === 'verified' || status === 'user' ? ['daily-check'] : [],
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
  };
}

describe('verified SP grant', () => {
  let prevLucidAPI: unknown;
  let pingServerHealth: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProfiles();
    const win = window as unknown as { lucidAPI?: unknown };
    prevLucidAPI = win.lucidAPI;
    pingServerHealth = vi.fn().mockResolvedValue({
      ok: true,
      quota: { limit: 1100, remaining: 1100, reset: 1794000000, reset_in_seconds: 3600 },
    });
    win.lucidAPI = { ai: { pingServerHealth } };
  });

  afterEach(() => {
    const win = window as unknown as { lucidAPI?: unknown };
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    vi.restoreAllMocks();
  });

  test('the grant is 1,000 SP a day', () => {
    expect(VERIFIED_SP_DAILY).toBe(1000);
  });

  test('isProfileVerified: verified and user count, temp and guest do not', () => {
    expect(isProfileVerified(makeProfile('a', 'A', 'verified'))).toBe(true);
    expect(isProfileVerified(makeProfile('a', 'A', 'user'))).toBe(true);
    expect(isProfileVerified(makeProfile('a', 'A', 'temp'))).toBe(false);
    expect(isProfileVerified(makeProfile('a', 'A', 'unverified'))).toBe(false);
    expect(isProfileVerified(makeProfile('a', 'A', 'guest'))).toBe(false);
    expect(isProfileVerified(null)).toBe(false);
    expect(isProfileVerified(undefined)).toBe(false);
  });

  test('isActiveProfileVerified reads the active profile', () => {
    const mine = makeProfile('profile-mine', 'Mine', 'verified');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    expect(isActiveProfileVerified()).toBe(true);
    useProfileStore.setState({
      profiles: [makeProfile('profile-mine', 'Mine', 'temp')],
      activeProfileId: 'profile-mine',
    });
    expect(isActiveProfileVerified()).toBe(false);
  });

  test('a verified profile gets the grant once per day, then no more that day', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'verified');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    const first = await applyVerifiedSpGrant('profile-mine', '2026-11-16');
    expect(first).toEqual({ granted: true, reason: 'granted' });
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.verifiedSpGrantDay).toBe('2026-11-16');
    expect(pingServerHealth).toHaveBeenCalledTimes(1);
    // The SP balance was refreshed from the server.
    expect(useAIStore.getState().pingQuota?.remaining).toBe(1100);
    const second = await applyVerifiedSpGrant('profile-mine', '2026-11-16');
    expect(second).toEqual({ granted: false, reason: 'already_granted_today' });
    expect(pingServerHealth).toHaveBeenCalledTimes(1);
    // The next day grants again.
    const third = await applyVerifiedSpGrant('profile-mine', '2026-11-17');
    expect(third.granted).toBe(true);
  });

  test('a temp (not verified) never gets a grant', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    const result = await applyVerifiedSpGrant('profile-mine', '2026-11-16');
    expect(result).toEqual({ granted: false, reason: 'not_verified' });
    expect(pingServerHealth).not.toHaveBeenCalled();
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.verifiedSpGrantDay).toBeUndefined();
  });

  test('a guest never gets a grant', async () => {
    const guest = useProfileStore.getState().createGuestProfile();
    const result = await applyVerifiedSpGrant(guest.id, '2026-11-16');
    expect(result).toEqual({ granted: false, reason: 'guest' });
    expect(pingServerHealth).not.toHaveBeenCalled();
  });

  test('an unknown profile never gets a grant', async () => {
    const result = await applyVerifiedSpGrant('profile-gone', '2026-11-16');
    expect(result).toEqual({ granted: false, reason: 'unknown_profile' });
  });

  test('a failed quota refresh still leaves the grant recorded', async () => {
    pingServerHealth.mockRejectedValue(new Error('unreachable'));
    const mine = makeProfile('profile-mine', 'Mine', 'verified');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    const result = await applyVerifiedSpGrant('profile-mine', '2026-11-16');
    expect(result.granted).toBe(true);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.verifiedSpGrantDay).toBe('2026-11-16');
  });

  test('verifiedGrantDay is today in UTC', () => {
    expect(verifiedGrantDay(Date.UTC(2026, 10, 16, 7, 0, 0))).toBe('2026-11-16');
  });

  test('recordVerifiedSpGrant refuses guests, the unverified, and the unknown', () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    expect(useProfileStore.getState().recordVerifiedSpGrant('profile-mine', '2026-11-16')).toBe(false);
    expect(useProfileStore.getState().recordVerifiedSpGrant('profile-gone', '2026-11-16')).toBe(false);
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().recordVerifiedSpGrant(guest.id, '2026-11-16')).toBe(false);
    // A verified profile records fine.
    useProfileStore.setState({
      profiles: [makeProfile('profile-mine', 'Mine', 'verified')],
      activeProfileId: 'profile-mine',
    });
    expect(useProfileStore.getState().recordVerifiedSpGrant('profile-mine', '2026-11-16')).toBe(true);
  });
});
