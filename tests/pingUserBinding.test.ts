import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rebindPingUserForVerifiedProfile,
  resetPingUserRebindSession,
} from '../src/lib/pingUserBinding';

// Fix 1 migration (2026-11-17): Genesis's verified grant lives on
// the old per-install bucket. Re-activating the temp once under
// the profile id moves the grant to the profile's own bucket
// (the server's resumed path re-marks the bucket verified).
// Fire-and-forget, deduped per session, never for guests.

const GENESIS_ID = 'profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST_ID = 'profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  resetPingUserRebindSession();
});

function flush(): Promise<void> {
  // The rebind schedules its call on a resolved promise — let
  // the microtask queue drain before asserting.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('rebindPingUserForVerifiedProfile', () => {
  it('re-activates a verified profile once, with a null referral', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    await flush();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith(GENESIS_ID, null);
  });

  it('dedups within a session — a second rebind for the same profile is a no-op', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    await flush();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('rebinds different verified profiles independently', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    rebindPingUserForVerifiedProfile(GUEST_ID, false, activate);
    await flush();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('never rebinds a guest — guests never activate a temp', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile(GUEST_ID, true, activate);
    await flush();
    expect(activate).not.toHaveBeenCalled();
  });

  it('never rebinds an invalid or missing profile id', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile('bad id with spaces', false, activate);
    rebindPingUserForVerifiedProfile(null, false, activate);
    rebindPingUserForVerifiedProfile(undefined, false, activate);
    await flush();
    expect(activate).not.toHaveBeenCalled();
  });

  it('never throws into the caller when the activation fails — the next sync retries', async () => {
    const activate = vi.fn().mockRejectedValue(new Error('server down'));
    expect(() =>
      rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate),
    ).not.toThrow();
    await flush();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('allows a rebind again after the session dedup is reset (tests only)', async () => {
    const activate = vi.fn().mockResolvedValue({ resumed: true });
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    await flush();
    expect(activate).toHaveBeenCalledTimes(1);
    resetPingUserRebindSession();
    rebindPingUserForVerifiedProfile(GENESIS_ID, false, activate);
    await flush();
    expect(activate).toHaveBeenCalledTimes(2);
  });
});
