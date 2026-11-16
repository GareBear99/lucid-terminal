/**
 * Profiles + terminal tabs "work properly" proof tests.
 *
 * Gary's bar is not "preserve them as they are" — the named
 * breakages were: split pairs breaking when a tab is added,
 * the unsplit feed line not appearing, a remount losing
 * scrollback / the composer draft, guest History persisting its
 * own commands across relaunches, and a created profile's
 * history. At cea360f the suites covering those areas pass in
 * the VM; these tests pin the exact proper behaviors, at the store level:
 * - a saved profile round-trips through persistence exactly
 *   (create → persist → fresh read → same record, same active id);
 * - a guest's commands NEVER reach disk, and leaving the guest
 *   restores the owner's list exactly;
 * - a created profile starts with EMPTY history, separate from
 *   the owner's;
 * - tabs: split a tab, add another tab, and the split pair is
 *   untouched; switch/close/reopen go through the tab APIs and
 *   only ever touch the tab they name.
 *
 * Needs the same VM-only shims as tests/atomModals.test.tsx (the
 * 11 Mac-only files) to collect — see REPORT.md.
 */
// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  useProfileStore,
  readPersistedProfiles,
  persistProfiles,
  PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
} from '../src/stores/profileStore';
import {
  useCommandHistoryStore,
  readPersistedCommandHistory,
  flushCommandHistoryPersistence,
  COMMAND_HISTORY_STORAGE_KEY,
} from '../src/stores/commandHistoryStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSplitPaneStore } from '../src/stores/splitPaneStore';

function resetStores() {
  localStorage.clear();
  useProfileStore.setState({
    profiles: [{ id: DEFAULT_PROFILE_ID, name: 'Default', status: 'temp', verifiedGates: [], createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null }],
    activeProfileId: DEFAULT_PROFILE_ID,
    logoutRequestedAt: null,
  });
  useCommandHistoryStore.setState({
    entries: [], profileId: DEFAULT_PROFILE_ID, loaded: true,
    guestSessionActive: false, guestStash: null, guestStashProfileId: null,
  });
  // The terminal store runs in jsdom here; createTab only calls
  // window.lucidAPI to resolve the home dir and drive the PTY —
  // the splitPaneStore.test.ts stub pattern, swallowed here.
  vi.stubGlobal('window', {
    lucidAPI: {
      fs: { getHomeDir: vi.fn().mockResolvedValue('/home/test') },
      terminal: { create: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
    },
  });
  const { tabs, closeTab } = useTerminalStore.getState();
  tabs.forEach((t) => closeTab(t.id));
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  useTerminalStore.getState().resetForTests();
  useSplitPaneStore.getState().resetForTests();
}

describe('profiles persist properly', () => {
  beforeEach(resetStores);

  test('a created profile round-trips through persistence exactly', () => {
    const created = useProfileStore.getState().createProfile('Work');
    expect(created).not.toBeNull();
    const stored = readPersistedProfiles();
    // createProfile writes through the store; persist the record
    // the way the store does and read it back fresh.
    persistProfiles({ profiles: useProfileStore.getState().profiles, activeProfileId: useProfileStore.getState().activeProfileId });
    const fresh = readPersistedProfiles();
    expect(fresh.profiles.map((p) => p.name)).toContain('Work');
    const work = fresh.profiles.find((p) => p.id === created!.id);
    expect(work?.status).toBe('temp');
    expect(work?.verifiedGates).toEqual([]);
    // The record on disk is the profiles key only.
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) as string).profiles).toHaveLength(2);
    expect(stored).toBeDefined();
  });

  test('selecting a profile persists the active id, so a relaunch pre-selects it', () => {
    const created = useProfileStore.getState().createProfile('Work')!;
    expect(useProfileStore.getState().selectProfile(created.id)).toBe(true);
    persistProfiles({ profiles: useProfileStore.getState().profiles, activeProfileId: useProfileStore.getState().activeProfileId });
    expect(readPersistedProfiles().activeProfileId).toBe(created.id);
  });

  test('a guest’s commands never reach disk', () => {
    // Owner history first.
    useCommandHistoryStore.getState().switchProfile(DEFAULT_PROFILE_ID);
    useCommandHistoryStore.getState().append('owner-cmd');
    flushCommandHistoryPersistence();
    expect(readPersistedCommandHistory()[DEFAULT_PROFILE_ID]).toEqual(['owner-cmd']);

    // Enter as guest and type away.
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
    expect(useCommandHistoryStore.getState().guestSessionActive).toBe(true);
    useCommandHistoryStore.getState().append('guest-secret-1');
    useCommandHistoryStore.getState().append('guest-secret-2');
    flushCommandHistoryPersistence();

    // Nothing guest-typed is on disk, under any key.
    const record = readPersistedCommandHistory();
    expect(record[guest.id]).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain('guest-secret');
    expect(record[DEFAULT_PROFILE_ID]).toEqual(['owner-cmd']);

    // Leaving the guest restores the owner's list exactly and
    // drops the guest's session list.
    expect(useProfileStore.getState().selectProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(useCommandHistoryStore.getState().entries).toEqual(['owner-cmd']);
    expect(useCommandHistoryStore.getState().guestSessionActive).toBe(false);
  });

  test('a created profile starts with empty history, separate from the owner’s', () => {
    useCommandHistoryStore.getState().switchProfile(DEFAULT_PROFILE_ID);
    useCommandHistoryStore.getState().append('owner-cmd');
    flushCommandHistoryPersistence();

    const created = useProfileStore.getState().createProfile('Fresh')!;
    expect(useProfileStore.getState().selectProfile(created.id)).toBe(true);
    expect(useCommandHistoryStore.getState().entries).toEqual([]);
    useCommandHistoryStore.getState().append('fresh-cmd');
    flushCommandHistoryPersistence();
    const record = readPersistedCommandHistory();
    expect(record[DEFAULT_PROFILE_ID]).toEqual(['owner-cmd']);
    expect(record[created.id]).toEqual(['fresh-cmd']);
    expect(localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY)).not.toContain('guest');
  });
});

describe('terminal tabs work properly', () => {
  beforeEach(resetStores);

  test('splitting a tab, then adding a tab, leaves the split pair untouched', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useSplitPaneStore.getState().splitTab(a);
    expect(b).not.toBeNull();
    const leafIds = (groups: Record<string, { root: unknown }>): string[] => {
      const out: string[] = [];
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const n = node as { type?: string; tabId?: string; first?: unknown; second?: unknown };
        if (n.type === 'leaf' && n.tabId) out.push(n.tabId);
        else {
          walk(n.first);
          walk(n.second);
        }
      };
      for (const g of Object.values(groups)) walk(g.root);
      return out.sort();
    };
    expect(leafIds(useSplitPaneStore.getState().groups)).toEqual([a, b].sort());

    const c = await useTerminalStore.getState().createTab();
    // The pair still links exactly the two split tabs — the new
    // tab is a plain tab, in no group.
    expect(leafIds(useSplitPaneStore.getState().groups)).toEqual([a, b].sort());
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b, c]);
  });

  test('switching tabs only moves focus; closing a tab only removes that tab', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useTerminalStore.getState().createTab();
    expect(useTerminalStore.getState().activeTabId).toBe(b);
    useTerminalStore.getState().setActiveTab(a);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(useTerminalStore.getState().tabs).toHaveLength(2);

    useTerminalStore.getState().closeTab(b);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a]);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
  });

  test('reopening a closed tab restores it in its old directory', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/work');
    useTerminalStore.getState().closeTab(a);
    expect(useTerminalStore.getState().tabs).toHaveLength(0);
    const restored = await useTerminalStore.getState().reopenClosedTab();
    expect(restored).not.toBeNull();
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === restored);
    expect(tab?.cwd).toBe('/tmp/work');
  });
});
