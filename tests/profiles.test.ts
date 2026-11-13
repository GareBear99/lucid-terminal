// @vitest-environment jsdom
/**
 * Profiles tests (Gary, 2026-11-12 ~10:48 + 10:52 + 12:26 + 12:28 PST).
 *
 * Startup: splashscreen → profile → splashcreen → Lucid. Each profile
 * tracks its verified gates + status temp / unverified / verified /
 * user. Wiping a profile wipes the synth back to demo and chats +
 * driving-agent memory — files, homunculi and daemons survive ("like
 * you never left"). Deletion lives WITHIN the profile (Settings >
 * Profile tab, Gary 2026-11-12 ~17:36 PST) — never on the Profiles
 * screen. Guests have NO deletion: a guest wipe is refused outright.
 *
 * OPEN GAP, stated not hidden: the LLMBuilder retention tiers (the
 * driving intelligence's long-term memory) have NO renderer clear
 * path — Lucid has zero references to the cleanroom retention layer
 * (see the memory-retention map). The wipe clears the driving-agent
 * memory the renderer CAN reach: the terminal-tab conversation
 * history the driving agent loads (historyStore) + the AI chats
 * (aiStore). Clearing the retention tiers is a follow-up once the
 * Lucid↔retention bridge exists; do not claim the wipe covers them.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  createCreatorBuild,
  type CreatorBuild,
} from '../src/lib/synthDisclaimer';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
} from '../src/lib/synthBlueprint';
import { createMachine } from '../src/lib/synthBoot';
import { DEFAULT_SYNTH_SEED } from '../src/types/synth';
import type { ChatSession, TerminalBlock } from '../src/types';
import type { Homunculus } from '../src/lib/homunculi';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useSynthStore } from '../src/stores/synthStore';
import { useAIStore } from '../src/stores/aiStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useFileStore } from '../src/stores/fileStore';
import { useForgeStore } from '../src/stores/forgeStore';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  isGuestProfile,
  parsePersistedProfiles,
  useProfileStore,
} from '../src/stores/profileStore';

// updateSetting/updateSettings + clearSessions persist through
// window.lucidAPI; stub just those calls (the convention in the
// component tests).
const win = globalThis as unknown as {
  lucidAPI?: {
    settings: { set: (...args: unknown[]) => Promise<unknown> };
    ai: { clearSessions: (...args: unknown[]) => Promise<unknown> };
  };
};

function validBuild(seedHex = '0123456789ABCDEF'): CreatorBuild {
  const build = createCreatorBuild(
    'iteration-8',
    seedHex,
    'purple',
    DEFAULT_SHELL_BLUEPRINT,
    DEFAULT_MODULES,
    'default',
    '2026-11-12T00:00:00.000Z',
  );
  if (!build) throw new Error('test fixture build must be valid');
  return build;
}

function resetSynthStore() {
  useSynthStore.setState({
    activePluginId: 'lucifer',
    seedHex: DEFAULT_SYNTH_SEED,
    selectedTileId: 'tile_0000',
    eyeMode: 'AUTO',
    machine: createMachine(),
    modules: { ship: null, scanner: null, hud: null },
    mounts: {},
    directories: {},
    localAccessSessionGranted: false,
  });
}

function setGate(build: CreatorBuild | null, demoReplaced: boolean) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      synthDemoReplaced: demoReplaced,
      synthOwnBuild: build,
    },
  });
}

function resetProfileStore() {
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
  });
}

function seedLiveData() {
  const session: ChatSession = {
    id: 's1',
    title: 'Chat',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  };
  useAIStore.setState({ sessions: [session], currentSessionId: 's1' });
  const block: TerminalBlock = {
    id: 'b1',
    command: 'ls',
    output: 'x',
    timestamp: 1,
    isComplete: true,
  };
  useHistoryStore.setState({ blocksByTab: { tab1: [block] } });
  useFileStore.setState({ currentDir: '/Users/gary' });
  const homunculus = {
    id: 'lucifer',
    name: 'Lucifer',
    color: 'purple',
    biography: null,
    modelPath: null,
    status: 'active',
    incumbentScore: null,
    lineage: [],
    createdAt: '2026-11-12T00:00:00.000Z',
  } as unknown as Homunculus;
  useForgeStore.setState({ roster: [homunculus] });
}

let prevLucidAPI: typeof win.lucidAPI;

beforeEach(() => {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    settings: { set: async () => undefined },
    ai: { clearSessions: async () => undefined },
  };
  resetProfileStore();
  resetSynthStore();
  setGate(null, false);
  useAIStore.setState({ sessions: [], currentSessionId: null });
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  setGate(null, false);
});

// ---------------------------------------------------------------------------
// Persistence parsing
// ---------------------------------------------------------------------------

describe('profile persistence parsing', () => {
  test('a valid record round-trips', () => {
    const record = {
      profiles: [
        {
          ...createDefaultProfile(),
          verifiedGates: ['telegram'],
          status: 'user',
        },
      ],
      activeProfileId: 'default',
    };
    const parsed = parsePersistedProfiles(record);
    expect(parsed).not.toBeNull();
    expect(parsed?.profiles).toHaveLength(1);
    expect(parsed?.profiles[0].status).toBe('user');
    expect(parsed?.activeProfileId).toBe('default');
  });

  test('corrupt / empty input parses to null', () => {
    expect(parsePersistedProfiles(null)).toBeNull();
    expect(parsePersistedProfiles('nope')).toBeNull();
    expect(parsePersistedProfiles({})).toBeNull();
    expect(parsePersistedProfiles({ profiles: 'nope' })).toBeNull();
  });

  test('a record without the default profile gets it repaired in', () => {
    const parsed = parsePersistedProfiles({
      profiles: [
        {
          id: 'profile-x',
          name: 'X',
          status: 'temp',
          verifiedGates: [],
          createdAt: '2026-11-12T00:00:00.000Z',
          lastActiveAt: null,
        },
      ],
      activeProfileId: 'profile-x',
    });
    expect(parsed?.profiles.some((p) => p.id === 'default')).toBe(true);
    expect(parsed?.activeProfileId).toBe('profile-x');
  });

  test('an unknown active profile id falls back to default', () => {
    const parsed = parsePersistedProfiles({
      profiles: [createDefaultProfile()],
      activeProfileId: 'profile-gone',
    });
    expect(parsed?.activeProfileId).toBe('default');
  });

  test('invalid profile entries are filtered, valid ones kept', () => {
    const parsed = parsePersistedProfiles({
      profiles: [
        createDefaultProfile(),
        { id: 'bad', name: '', status: 'temp' },
        { id: 'also-bad', name: 'Bad', status: 'not-a-status' },
      ],
      activeProfileId: 'default',
    });
    expect(parsed?.profiles).toHaveLength(1);
    expect(parsed?.profiles[0].id).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// Create / select
// ---------------------------------------------------------------------------

describe('create + select', () => {
  test('a new profile starts as a temp with no verified gates', () => {
    const created = useProfileStore.getState().createProfile('Gary');
    expect(created).not.toBeNull();
    expect(created?.status).toBe('temp');
    expect(created?.verifiedGates).toEqual([]);
    expect(useProfileStore.getState().profiles).toHaveLength(2);
  });

  test('a blank name creates nothing', () => {
    expect(useProfileStore.getState().createProfile('   ')).toBeNull();
    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });

  test('selecting a profile makes it active and stamps lastActiveAt', () => {
    const created = useProfileStore.getState().createProfile('Gary');
    expect(created).not.toBeNull();
    expect(useProfileStore.getState().selectProfile(created!.id)).toBe(true);
    const state = useProfileStore.getState();
    expect(state.activeProfileId).toBe(created!.id);
    expect(
      state.profiles.find((p) => p.id === created!.id)?.lastActiveAt,
    ).not.toBeNull();
  });

  test('selecting an unknown id is a no-op', () => {
    expect(useProfileStore.getState().selectProfile('profile-gone')).toBe(
      false,
    );
    expect(useProfileStore.getState().activeProfileId).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// Verified gates + status
// ---------------------------------------------------------------------------

describe('verified gates + status', () => {
  test('an unregistered gate id is rejected', () => {
    expect(
      useProfileStore.getState().markGateVerified('default', 'made-up'),
    ).toBe(false);
    expect(
      useProfileStore.getState().profiles[0].verifiedGates,
    ).toEqual([]);
    expect(useProfileStore.getState().profiles[0].status).toBe('temp');
  });

  test('an unknown profile is rejected', () => {
    expect(
      useProfileStore.getState().markGateVerified('profile-gone', 'telegram'),
    ).toBe(false);
  });

  test('the Telegram gate turns a temp into a user', () => {
    expect(
      useProfileStore.getState().markGateVerified('default', 'telegram'),
    ).toBe(true);
    const profile = useProfileStore.getState().profiles[0];
    expect(profile.verifiedGates).toEqual(['telegram']);
    expect(profile.status).toBe('user');
  });

  test('verifying the same gate twice is idempotent — no duplicate', () => {
    const store = useProfileStore.getState();
    expect(store.markGateVerified('default', 'telegram')).toBe(true);
    expect(store.markGateVerified('default', 'telegram')).toBe(true);
    expect(
      useProfileStore.getState().profiles[0].verifiedGates,
    ).toEqual(['telegram']);
  });
});

// ---------------------------------------------------------------------------
// Wipe — the boundary (Gary, 2026-11-12 ~12:28 PST)
// ---------------------------------------------------------------------------

describe('wipeProfile — synth bound to its profile', () => {
  test('wiping the ACTIVE profile wipes the synth to demo, chats + driving memory gone, platform things survive', async () => {
    const build = validBuild();
    setGate(build, true);
    await useSettingsStore
      .getState()
      .updateSetting('voxelLocalAccessDontAsk', true);
    seedLiveData();

    expect(
      await useProfileStore.getState().wipeProfile(DEFAULT_PROFILE_ID),
    ).toBe(true);

    // WIPED (profile-owned): the synth is back to demo.
    const settings = useSettingsStore.getState().settings;
    expect(settings.synthOwnBuild).toBeNull();
    expect(settings.synthDemoReplaced).toBe(false);
    expect(settings.synthDisclaimerChoice).toBeNull();
    expect(settings.synthVersion).toBeNull();
    expect(settings.homunculusColor).toBeNull();
    const synth = useSynthStore.getState();
    expect(synth.machine.boot).toBe('WAIT_BLUEPRINT');
    expect(synth.directories).toEqual({});
    expect(synth.localAccessSessionGranted).toBe(false);
    // WIPED: chats + driving-agent memory (terminal-tab history).
    expect(useAIStore.getState().sessions).toEqual([]);
    expect(useAIStore.getState().currentSessionId).toBeNull();
    // clearBlocks empties the tab's blocks (the key stays, empty).
    expect(useHistoryStore.getState().blocksByTab).toEqual({ tab1: [] });
    // SURVIVES (platform-connected, "like you never left").
    expect(settings.voxelLocalAccessDontAsk).toBe(true);
    expect(useFileStore.getState().currentDir).toBe('/Users/gary');
    expect(useForgeStore.getState().roster).toHaveLength(1);
    expect(useForgeStore.getState().roster[0].id).toBe('lucifer');
    // The implicit profile cannot be deleted — it resets to a fresh temp.
    const profiles = useProfileStore.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('default');
    expect(profiles[0].status).toBe('temp');
    expect(useProfileStore.getState().activeProfileId).toBe('default');
  });

  test('wiping a NON-active profile removes only the record — live chats, history and synth untouched', async () => {
    const build = validBuild();
    setGate(build, true);
    seedLiveData();
    const created = useProfileStore.getState().createProfile('Second');
    expect(created).not.toBeNull();

    expect(
      await useProfileStore.getState().wipeProfile(created!.id),
    ).toBe(true);

    expect(useProfileStore.getState().profiles).toHaveLength(1);
    expect(useProfileStore.getState().activeProfileId).toBe('default');
    // Untouched: the active profile's chats, history and synth.
    expect(useAIStore.getState().sessions).toHaveLength(1);
    expect(useHistoryStore.getState().blocksByTab).toEqual({
      tab1: expect.any(Array),
    });
    expect(
      useSettingsStore.getState().settings.synthOwnBuild,
    ).not.toBeNull();
    expect(
      useSettingsStore.getState().settings.synthDemoReplaced,
    ).toBe(true);
  });

  test('wiping the ACTIVE non-default profile falls back to default', async () => {
    const created = useProfileStore.getState().createProfile('Second');
    expect(created).not.toBeNull();
    expect(useProfileStore.getState().selectProfile(created!.id)).toBe(true);
    expect(
      await useProfileStore.getState().wipeProfile(created!.id),
    ).toBe(true);
    expect(useProfileStore.getState().profiles).toHaveLength(1);
    expect(useProfileStore.getState().activeProfileId).toBe('default');
  });

  test('wiping a profile that owns the saved creation wipes the synth even when it is not active', async () => {
    const build = createCreatorBuild(
      'iteration-8',
      '0123456789ABCDEF',
      'purple',
      DEFAULT_SHELL_BLUEPRINT,
      DEFAULT_MODULES,
      'profile-owner',
      '2026-11-12T00:00:00.000Z',
    );
    expect(build).not.toBeNull();
    setGate(build, true);
    seedLiveData();
    useProfileStore.setState({
      profiles: [
        createDefaultProfile(),
        {
          id: 'profile-owner',
          name: 'Owner',
          status: 'temp',
          verifiedGates: [],
          createdAt: '2026-11-12T00:00:00.000Z',
          lastActiveAt: null,
        },
      ],
      activeProfileId: 'default',
    });

    expect(
      await useProfileStore.getState().wipeProfile('profile-owner'),
    ).toBe(true);

    // The synth is bound to the wiped profile — back to demo.
    expect(useSettingsStore.getState().settings.synthOwnBuild).toBeNull();
    expect(useSettingsStore.getState().settings.synthDemoReplaced).toBe(
      false,
    );
    // But the ACTIVE profile's chats + history are NOT its memory.
    expect(useAIStore.getState().sessions).toHaveLength(1);
    expect(useHistoryStore.getState().blocksByTab).toEqual({
      tab1: expect.any(Array),
    });
  });

  test('wiping an unknown id is a no-op', async () => {
    expect(
      await useProfileStore.getState().wipeProfile('profile-gone'),
    ).toBe(false);
    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });
});

describe('guest profiles — demo-locked (Gary, 2026-11-12 ~16:41 PST)', () => {
  test('a guest profile is created with status guest, clearly named', () => {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(guest.status).toBe('guest');
    expect(guest.name).toBe('Guest');
    expect(guest.verifiedGates).toEqual([]);
    expect(isGuestProfile(guest)).toBe(true);
    expect(isGuestProfile(useProfileStore.getState().profiles[0])).toBe(
      false,
    );
    expect(isGuestProfile(null)).toBe(false);
    expect(isGuestProfile(undefined)).toBe(false);
  });

  test('guest is all one account and always a new guest — a second call replaces the old guest, never reuses it (Gary, 2026-11-12 ~17:53/17:56 PST)', () => {
    const first = useProfileStore.getState().createGuestProfile();
    const second = useProfileStore.getState().createGuestProfile();
    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe('Guest');
    const guests = useProfileStore
      .getState()
      .profiles.filter((p) => p.status === 'guest');
    expect(guests).toHaveLength(1);
    expect(guests[0].id).toBe(second.id);
  });

  test('a guest profile round-trips through persistence parsing', () => {
    const guest = useProfileStore.getState().createGuestProfile();
    const parsed = parsePersistedProfiles({
      profiles: [createDefaultProfile(), { ...guest }],
      activeProfileId: guest.id,
    });
    expect(parsed?.profiles.find((p) => p.id === guest.id)?.status).toBe(
      'guest',
    );
    expect(parsed?.activeProfileId).toBe(guest.id);
  });

  test('a guest can never verify a gate — guest status is terminal, so the demo-lock cannot lift', () => {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(
      useProfileStore.getState().markGateVerified(guest.id, 'telegram'),
    ).toBe(false);
    const after = useProfileStore
      .getState()
      .profiles.find((p) => p.id === guest.id);
    expect(after?.status).toBe('guest');
    expect(after?.verifiedGates).toEqual([]);
  });

  test('wiping a guest is REFUSED — guests have no deletion (Gary, 2026-11-12 ~17:36 PST)', async () => {
    const build = validBuild();
    setGate(build, true);
    seedLiveData();
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
    expect(await useProfileStore.getState().wipeProfile(guest.id)).toBe(
      false,
    );
    // NOTHING changes: the guest record stays, the guest stays
    // active, the owner's creation stays, and the guest's chats +
    // history stay — a refused guest wipe must never cross into
    // anything.
    expect(
      useProfileStore.getState().profiles.find((p) => p.id === guest.id),
    ).toBeDefined();
    expect(useProfileStore.getState().activeProfileId).toBe(guest.id);
    expect(useSettingsStore.getState().settings.synthOwnBuild).not.toBeNull();
    expect(useSettingsStore.getState().settings.synthDemoReplaced).toBe(
      true,
    );
    expect(useAIStore.getState().sessions).toHaveLength(1);
    expect(useHistoryStore.getState().blocksByTab).toEqual({
      tab1: expect.any(Array),
    });
  });

  test('wiping a NON-active guest is refused too — the record stays', async () => {
    const build = validBuild();
    setGate(build, true);
    seedLiveData();
    const guest = useProfileStore.getState().createGuestProfile();
    expect(await useProfileStore.getState().wipeProfile(guest.id)).toBe(
      false,
    );
    expect(useProfileStore.getState().profiles).toHaveLength(2);
    expect(
      useProfileStore.getState().profiles.find((p) => p.id === guest.id),
    ).toBeDefined();
    expect(useSettingsStore.getState().settings.synthOwnBuild).not.toBeNull();
    expect(useSettingsStore.getState().settings.synthDemoReplaced).toBe(
      true,
    );
    expect(useAIStore.getState().sessions).toHaveLength(1);
    expect(useHistoryStore.getState().blocksByTab).toEqual({
      tab1: expect.any(Array),
    });
  });
});
