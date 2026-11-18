// @vitest-environment jsdom
/**
 * FixNet client sync tests (src/lib/fixnetSync.ts).
 *
 * The sync is PULL-ONLY: it calls exactly one bridge method —
 * window.lucidAPI.fixnet.sync() — which GETs the Pages files in
 * main. These tests stub that bridge and assert what the sync
 * does with what comes down: a verified temp flips (and only a
 * verified temp), the SP grant records once per day, guests are
 * skipped outright, and a failed pull changes nothing. No test
 * here fakes issuance: the bridge returns a published status
 * table, the way Pages publishes it.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { runFixNetSyncNow, stopFixNetSync } from '../src/lib/fixnetSync';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
  type Profile,
} from '../src/stores/profileStore';
import { useToastStore } from '../src/stores/toastStore';
import type {
  FixNetDaily,
  FixNetSyncResult,
} from '../electron/services/fixnetSync';

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
  useToastStore.setState({ notifications: [] });
}

function makeProfile(
  id: string,
  name: string,
  status: Profile['status'],
  overrides: Partial<Profile> = {},
): Profile {
  return {
    id,
    name,
    status,
    verifiedGates: status === 'verified' || status === 'user' ? ['daily-check'] : [],
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
    ...overrides,
  };
}

function syncResult(overrides: Partial<FixNetSyncResult> = {}): FixNetSyncResult {
  return {
    status: [],
    day: '2026-11-16',
    daily: null,
    pulledAt: new Date().toISOString(),
    ...overrides,
  };
}

function dailyDoc(
  day: string,
  depositEntries: { id: string; tick: number }[] = [],
): FixNetDaily {
  return {
    date: day,
    counts: { verified: 1, pending: 0, not_verified: 0, expired: 0, checked: 1 },
    yield: { verified_today: 1, verified_total: 1, corpus_entries_today: 0, corpus_total_entries: 0 },
    deposit: {
      sp_per_verified: 1000,
      overflow_queued: false,
      entries: depositEntries.map((e) => ({
        ...e,
        sp: 1000,
        snapshot_access: true,
      })),
    },
  };
}

describe('runFixNetSyncNow', () => {
  let prevLucidAPI: unknown;
  let sync: ReturnType<typeof vi.fn>;
  let pingServerHealth: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProfiles();
    stopFixNetSync();
    const win = window as unknown as { lucidAPI?: unknown };
    prevLucidAPI = win.lucidAPI;
    sync = vi.fn();
    pingServerHealth = vi.fn().mockResolvedValue({
      ok: true,
      quota: { limit: 1100, remaining: 1100, reset: 1794000000, reset_in_seconds: 3600 },
    });
    win.lucidAPI = {
      fixnet: { sync },
      ai: { pingServerHealth },
    };
  });

  afterEach(() => {
    const win = window as unknown as { lucidAPI?: unknown };
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    vi.restoreAllMocks();
  });

  test('a verified temp flips, gets its SP grant, and toasts', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({
      profiles: [createDefaultProfile(), mine],
      activeProfileId: 'profile-mine',
    });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-mine', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds' },
        ],
        daily: {
          date: '2026-11-16',
          counts: { verified: 1, pending: 0, not_verified: 0, expired: 0, checked: 1 },
          yield: { verified_today: 1, verified_total: 1, corpus_entries_today: 5, corpus_total_entries: 5 },
          deposit: {
            sp_per_verified: 1000,
            overflow_queued: false,
            entries: [{ id: 'profile-mine', tick: 1, sp: 1000, snapshot_access: true }],
          },
        },
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.ok).toBe(true);
    expect(report.verified).toEqual(['profile-mine']);
    expect(report.granted).toEqual(['profile-mine']);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.status).toBe('verified');
    expect(after?.verifiedGates).toEqual(['daily-check']);
    expect(after?.verifiedSpGrantDay).toBe('2026-11-16');
    // The grant refreshed the SP balance from the server.
    expect(pingServerHealth).toHaveBeenCalledTimes(1);
    // The user was told.
    const toasts = useToastStore.getState().notifications;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('Mine is verified');
    expect(toasts[0].message).toContain('1,000 SP');
  });

  test('a pending / not_verified temp does not flip and does not toast', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-mine', outcome: 'pending', day: '2026-11-16', reason: 'referrer_pending' },
        ],
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.ok).toBe(true);
    expect(report.verified).toEqual([]);
    expect(report.granted).toEqual([]);
    expect(useProfileStore.getState().profiles[0].status).toBe('temp');
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });

  test('a guest is skipped outright even when the table says verified', async () => {
    const guest = useProfileStore.getState().createGuestProfile();
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: guest.id, outcome: 'verified', day: '2026-11-16', reason: 'chain_holds' },
        ],
        daily: {
          date: '2026-11-16',
          counts: { verified: 1, pending: 0, not_verified: 0, expired: 0, checked: 1 },
          yield: { verified_today: 1, verified_total: 1, corpus_entries_today: 0, corpus_total_entries: 0 },
          deposit: {
            sp_per_verified: 1000,
            overflow_queued: false,
            entries: [{ id: guest.id, tick: 1, sp: 1000, snapshot_access: true }],
          },
        },
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual([]);
    expect(report.granted).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === guest.id);
    expect(after?.status).toBe('guest');
    expect(after?.verifiedSpGrantDay).toBeUndefined();
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });

  test('an already-verified profile is left alone — no double toast, no double grant', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'verified');
    mine.verifiedSpGrantDay = '2026-11-16';
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-mine', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds' },
        ],
        daily: {
          date: '2026-11-16',
          counts: { verified: 1, pending: 0, not_verified: 0, expired: 0, checked: 1 },
          yield: { verified_today: 1, verified_total: 1, corpus_entries_today: 0, corpus_total_entries: 0 },
          deposit: {
            sp_per_verified: 1000,
            overflow_queued: false,
            entries: [{ id: 'profile-mine', tick: 1, sp: 1000, snapshot_access: true }],
          },
        },
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual([]);
    expect(report.granted).toEqual([]);
    expect(pingServerHealth).not.toHaveBeenCalled();
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });

  test('a verified flip without a deposit entry still flips (no grant today)', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    // Verified yesterday (no deposit entry today): the status is
    // the truth, the flip happens, the grant waits for a deposit day.
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-mine', outcome: 'verified', day: '2026-11-15', reason: 'chain_holds' },
        ],
        daily: {
          date: '2026-11-16',
          counts: { verified: 0, pending: 0, not_verified: 0, expired: 0, checked: 0 },
          yield: { verified_today: 0, verified_total: 1, corpus_entries_today: 0, corpus_total_entries: 0 },
          deposit: { sp_per_verified: 1000, overflow_queued: false, entries: [] },
        },
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual(['profile-mine']);
    expect(report.granted).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.status).toBe('verified');
    const toasts = useToastStore.getState().notifications;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Mine is verified.');
  });

  test('a failed pull changes nothing and reports the failure', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockRejectedValue(new Error('FixNet Pages pull failed (503)'));
    const report = await runFixNetSyncNow();
    expect(report.ok).toBe(false);
    expect(report.error).toContain('503');
    expect(useProfileStore.getState().profiles[0].status).toBe('temp');
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });

  test('no bridge means no sync, no crash', async () => {
    const win = window as unknown as { lucidAPI?: unknown };
    win.lucidAPI = {};
    const report = await runFixNetSyncNow();
    expect(report.ok).toBe(false);
    expect(report.error).toBe('fixnet bridge unavailable');
  });

  test('PULL-ONLY: the sync calls fixnet.sync and nothing that uploads', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp');
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    const activateTemp = vi.fn();
    const chat = vi.fn();
    const win = window as unknown as { lucidAPI?: unknown };
    win.lucidAPI = {
      fixnet: { sync },
      ai: { pingServerHealth, activateTemp, chat },
    };
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-mine', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds' },
        ],
        daily: {
          date: '2026-11-16',
          counts: { verified: 1, pending: 0, not_verified: 0, expired: 0, checked: 1 },
          yield: { verified_today: 1, verified_total: 1, corpus_entries_today: 0, corpus_total_entries: 0 },
          deposit: {
            sp_per_verified: 1000,
            overflow_queued: false,
            entries: [{ id: 'profile-mine', tick: 1, sp: 1000, snapshot_access: true }],
          },
        },
      }),
    );
    await runFixNetSyncNow();
    expect(sync).toHaveBeenCalledTimes(1);
    // No fix ever goes up through the sync.
    expect(activateTemp).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
    // The only other bridge call is the quota refresh (a read —
    // POST /ping is unmetered and returns the balance).
    expect(pingServerHealth).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // FixNet temp rotation (Gary, 2026-11-17)
  // -------------------------------------------------------------------------

  test('matches the published status by tempId, not by profile id', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp', {
      tempId: 'profile-old-temp',
      tempState: 'temp',
    });
    const other = makeProfile('profile-other', 'Other', 'temp', {
      tempId: 'profile-other-temp',
      tempState: 'temp',
    });
    useProfileStore.setState({
      profiles: [mine, other],
      activeProfileId: 'profile-mine',
    });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-old-temp', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: null },
          // Keyed by the PROFILE id, not its temp — must not match.
          { tick: 2, id: 'profile-other', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: null },
        ],
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual(['profile-mine']);
    const mineAfter = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(mineAfter?.status).toBe('verified');
    expect(mineAfter?.tempState).toBe('verified');
    expect(mineAfter?.tempId).toBe('profile-old-temp');
    // The profile whose entry was keyed by its id (not its temp)
    // does not flip — its temp never verified.
    const otherAfter = useProfileStore.getState().profiles.find((p) => p.id === 'profile-other');
    expect(otherAfter?.status).toBe('temp');
    expect(otherAfter?.tempState).toBe('temp');
  });

  test('an already-verified profile still records its temp as verified — no flip, no toast', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'verified', {
      tempId: 'profile-temp-1',
      tempState: 'pending',
    });
    mine.verifiedSpGrantDay = '2026-11-16';
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-temp-1', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: null },
        ],
        daily: dailyDoc('2026-11-16', [{ id: 'profile-temp-1', tick: 1 }]),
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual([]);
    expect(report.granted).toEqual([]);
    expect(report.rotated).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    // The temp just verified, the profile was already verified —
    // the temp state still records it.
    expect(after?.status).toBe('verified');
    expect(after?.tempState).toBe('verified');
    expect(after?.tempId).toBe('profile-temp-1');
    expect(pingServerHealth).not.toHaveBeenCalled();
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });

  test('rotation: a verified temp rotates to next_temp after the deposit lands for the old temp', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp', {
      tempId: 'profile-t1',
      tempState: 'temp',
    });
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-t1', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: { id: 'profile-t2', tick: 2 } },
        ],
        daily: dailyDoc('2026-11-16', [{ id: 'profile-t1', tick: 1 }]),
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual(['profile-mine']);
    expect(report.granted).toEqual(['profile-mine']);
    expect(report.rotated).toEqual(['profile-mine']);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    // The profile id, its verified status, and its grant never
    // move — only the temp does.
    expect(after?.id).toBe('profile-mine');
    expect(after?.status).toBe('verified');
    expect(after?.verifiedSpGrantDay).toBe('2026-11-16');
    expect(after?.tempId).toBe('profile-t2');
    expect(after?.tempState).toBe('pending');
    // Two toasts: the verified flip (+ grant), then the rotation.
    const toasts = useToastStore.getState().notifications;
    expect(toasts).toHaveLength(2);
    expect(toasts[0].message).toBe('Mine is verified — 1,000 SP a day, from today.');
    expect(toasts[1].message).toBe(
      'Mine rotated to a new temp — awaiting verification at the next grab.',
    );
  });

  test('rotation is idempotent — a second sync with the same next_temp is a no-op', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp', {
      tempId: 'profile-t1',
      tempState: 'temp',
    });
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-t1', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: { id: 'profile-t2', tick: 2 } },
        ],
        daily: dailyDoc('2026-11-16', [{ id: 'profile-t1', tick: 1 }]),
      }),
    );
    const first = await runFixNetSyncNow();
    expect(first.rotated).toEqual(['profile-mine']);
    expect(useToastStore.getState().notifications).toHaveLength(2);
    // Same payload again: the profile already sits on T2, so
    // nothing matches anymore — no re-flip, no re-grant (the
    // deposit was for T1), no re-rotation, no new toast.
    const second = await runFixNetSyncNow();
    expect(second.verified).toEqual([]);
    expect(second.granted).toEqual([]);
    expect(second.rotated).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.tempId).toBe('profile-t2');
    expect(after?.tempState).toBe('pending');
    expect(after?.status).toBe('verified');
    expect(useToastStore.getState().notifications).toHaveLength(2);
    expect(pingServerHealth).toHaveBeenCalledTimes(1);
  });

  test('the full cycle: the rotated temp verifies at the next grab and rotates again', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp', {
      tempId: 'profile-t1',
      tempState: 'temp',
    });
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    // Sync 1: T1 verifies, deposit for T1 lands, rotate to T2.
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-t1', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: { id: 'profile-t2', tick: 2 } },
        ],
        daily: dailyDoc('2026-11-16', [{ id: 'profile-t1', tick: 1 }]),
      }),
    );
    const first = await runFixNetSyncNow();
    expect(first.verified).toEqual(['profile-mine']);
    expect(first.granted).toEqual(['profile-mine']);
    expect(first.rotated).toEqual(['profile-mine']);
    let after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    // temp → verified → pending, in one sync.
    expect(after?.tempId).toBe('profile-t2');
    expect(after?.tempState).toBe('pending');
    expect(after?.status).toBe('verified');
    // Sync 2: T2 verifies, no rotation yet — the temp state
    // records the verification and the temp stays put.
    sync.mockResolvedValue(
      syncResult({
        day: '2026-11-17',
        status: [
          { tick: 2, id: 'profile-t2', outcome: 'verified', day: '2026-11-17', reason: 'chain_holds', next_temp: null },
        ],
        daily: dailyDoc('2026-11-17', []),
      }),
    );
    const second = await runFixNetSyncNow();
    expect(second.verified).toEqual([]);
    expect(second.rotated).toEqual([]);
    after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.tempId).toBe('profile-t2');
    expect(after?.tempState).toBe('verified');
    expect(after?.status).toBe('verified');
    // Sync 3: T2 verified with a next_temp, deposit for T2 on
    // the new day — grant lands again, rotate to T3. The
    // profile stays verified throughout; only the temp moves.
    sync.mockResolvedValue(
      syncResult({
        day: '2026-11-17',
        status: [
          { tick: 2, id: 'profile-t2', outcome: 'verified', day: '2026-11-17', reason: 'chain_holds', next_temp: { id: 'profile-t3', tick: 3 } },
        ],
        daily: dailyDoc('2026-11-17', [{ id: 'profile-t2', tick: 2 }]),
      }),
    );
    const third = await runFixNetSyncNow();
    expect(third.verified).toEqual([]);
    expect(third.granted).toEqual(['profile-mine']);
    expect(third.rotated).toEqual(['profile-mine']);
    after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.tempId).toBe('profile-t3');
    expect(after?.tempState).toBe('pending');
    expect(after?.status).toBe('verified');
    expect(after?.verifiedSpGrantDay).toBe('2026-11-17');
    // Toasts: sync 1 verified + rotation, sync 3 rotation only.
    const toasts = useToastStore.getState().notifications;
    expect(toasts).toHaveLength(3);
    expect(toasts[2].message).toBe(
      'Mine rotated to a new temp — awaiting verification at the next grab.',
    );
  });

  test('a next_temp equal to the current temp is a no-op', async () => {
    const mine = makeProfile('profile-mine', 'Mine', 'temp', {
      tempId: 'profile-t1',
      tempState: 'temp',
    });
    useProfileStore.setState({ profiles: [mine], activeProfileId: 'profile-mine' });
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: 'profile-t1', outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: { id: 'profile-t1', tick: 1 } },
        ],
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual(['profile-mine']);
    expect(report.rotated).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === 'profile-mine');
    expect(after?.tempId).toBe('profile-t1');
    expect(after?.tempState).toBe('verified');
    // Only the verified toast — no rotation toast.
    expect(useToastStore.getState().notifications).toHaveLength(1);
  });

  test('a guest is skipped in all three loops — no flip, no grant, no rotation', async () => {
    const guest = useProfileStore.getState().createGuestProfile();
    sync.mockResolvedValue(
      syncResult({
        status: [
          { tick: 1, id: guest.id, outcome: 'verified', day: '2026-11-16', reason: 'chain_holds', next_temp: { id: 'profile-next', tick: 2 } },
        ],
        daily: dailyDoc('2026-11-16', [{ id: guest.id, tick: 1 }]),
      }),
    );
    const report = await runFixNetSyncNow();
    expect(report.verified).toEqual([]);
    expect(report.granted).toEqual([]);
    expect(report.rotated).toEqual([]);
    const after = useProfileStore.getState().profiles.find((p) => p.id === guest.id);
    expect(after?.status).toBe('guest');
    expect(after?.tempId).toBe(guest.id);
    expect(after?.tempState).toBe('temp');
    expect(after?.verifiedSpGrantDay).toBeUndefined();
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });
});
