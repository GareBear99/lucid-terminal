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
import type { FixNetSyncResult } from '../electron/services/fixnetSync';

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

function syncResult(overrides: Partial<FixNetSyncResult> = {}): FixNetSyncResult {
  return {
    status: [],
    day: '2026-11-16',
    daily: null,
    pulledAt: new Date().toISOString(),
    ...overrides,
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
});
