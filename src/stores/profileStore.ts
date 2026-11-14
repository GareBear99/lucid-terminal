/**
 * Profiles store (Gary, 2026-11-12 ~10:48 + 10:52 + 12:26 + 12:28 PST).
 *
 * Startup flow: splashscreen → profile → splashscreen → Lucid,
 * window fullscreen, clean switch over. The Profiles screen is the
 * profile step; App owns the splashscreens around it.
 *
 * A profile tracks its verified gates + status:
 * - temp: a fresh local profile (the default for every new profile).
 * - unverified: reserved for a profile pending verification, once a
 *   verification flow exists — nothing sets it today.
 * - verified: at least one gate verified (markGateVerified).
 * - user: the Telegram gate verified — "a temp becomes a full user
 *   through Telegram once verified" (SecurityTab). The account
 *   system is not built, so no UI path sets this today; the store
 *   action is the seam the verification flow will call.
 * - guest: a guest profile (Gary, 2026-11-12 ~16:41 PST) — allowed
 *   in, but its synth is LOCKED to demo mode: no builder, no
 *   permanent demo replacement, no demo wipe, no owner creation
 *   loaded or shown. Guest status is terminal: a guest can never
 *   verify a gate (that would silently lift the demo-lock). The
 *   saved guest profile is the test bed for comparing the demo
 *   synth vs Iteration 8.
 *
 * THE WIPE (Gary, 2026-11-12 ~12:28 PST): "your synth is bound to
 * that profile and wiping that profile wipes the synth back to demo
 * and all retained knowledge right but youll still have all the
 * tings you setup connected to the ppaltform like you never left
 * like file and homunculi daemon etc, just chats and driving agent
 * memory gone."
 * - WIPED: the synth (wipeProfileSynth — creation, demo-replaced
 *   flag, disclaimer, colour, machine, mounts, directory, session
 *   grant — back to demo), the AI chats (aiStore.clearSessions),
 *   and the driving-agent memory (renderer side: the terminal-tab
 *   conversation history the driving agent loads — historyStore
 *   blocks + the persisted copy).
 * - SURVIVES (platform-connected, "like you never left"): files
 *   (fileStore — untouched), homunculi (forgeStore roster —
 *   untouched), daemons (daemon settings — untouched), the
 *   REMEMBERED local-file access grant (voxelLocalAccessDontAsk —
 *   a platform setup; wipeProfileSynth keeps it, see its own
 *   boundary comment).
 * - The synth + chats + history clear only when the wiped profile
 *   is the ACTIVE profile (its data is the live data) — or, for the
 *   synth, when the wiped profile owns the saved creation. Wiping
 *   another profile must never destroy the active profile's chats.
 *   Wiping a non-active, non-owning profile just removes the
 *   record.
 * - NOT wiped here: the LLMBuilder retention tiers (the driving
 *   intelligence's long-term memory) — Lucid has no renderer path
 *   to clear them yet; that is a follow-up, not a silent skip (see
 *   the deploy note in tests/profiles.test.ts).
 * - The implicit 'default' profile cannot be deleted: wiping it
 *   resets it to a fresh temp instead.
 * - DELETION LIVES WITHIN THE PROFILE (Gary, 2026-11-12 ~17:36
 *   PST): "profiles should just be create a profile and guest
 *   access as a segregated profile and deletion happens within
 *   the profile". The Profiles screen is just the created cards
 *   (their own scrollable area above — clicking a card enters it
 *   immediately) + guest access + create a profile below, nothing
 *   else (Gary, 2026-11-13 ~01:31 PST). Deletion is in
 *   the profile's own view: Settings > Profile tab, on the active
 *   profile only. A non-active profile is deleted by entering it
 *   first, then deleting from within.
 * - GUESTS (Gary, 2026-11-12 ~16:41 + ~17:36 + ~17:53 + ~17:56 +
 *   ~17:59 PST): a guest is demo-locked AND has NO deletion —
 *   wipeProfile refuses a guest outright (returns false, nothing
 *   changes). A guest owns no creation and its synth is demo-only,
 *   so there is nothing of its own to wipe; the owner's global
 *   creation must never be touched from a guest. "Guest is all
 *   one account" + "always a new guest": exactly one guest profile
 *   ever exists, and entering as guest always creates a fresh one
 *   (createGuestProfile replaces any previous guest record) — so
 *   no guest profiles ever accumulate and no owner-delete of a
 *   guest is needed (the earlier open question is answered).
 *   THE GUEST VEIL (Gary, 2026-11-12 ~17:59 PST): "no llmbuilder
 *   memory or driving intelligence memory or chat memory or
 *   history etc" — "in every guest build". Entering as guest
 *   veils ALL saved data: aiStore + historyStore stash the
 *   owner's sessions + blocks in memory (never deleted, never
 *   persisted over) and show empty; the guest's own live chats /
 *   terminal blocks are never persisted and are dropped on exit.
 *   The only restriction on a guest is demo until a real profile
 *   is made; a guest can run long enough to verify the build.
 *   The veil transitions live in selectProfile (the boot Profiles
 *   screen's onDone is the only caller) + the module-bottom init
 *   sync (a relaunch with a guest still active).
 *
 * Persistence: localStorage, versioned key (same pattern as
 * historyStore — guarded, never throws, corrupt storage starts
 * fresh). The active profile id persists too, so the Profiles
 * screen can pre-select where the user left off.
 *
 * This store is pure state + guarded storage (no window/IPC access
 * at module load) so it can be imported by tests in a node
 * environment. The wipe's settings/AI calls go through the other
 * stores' own actions, which own their IPC.
 */

import { create } from 'zustand';
import { useAIStore } from './aiStore';
import { clearPersistedHistory, useHistoryStore } from './historyStore';
import { clearProfileCommandHistory, useCommandHistoryStore } from './commandHistoryStore';
import { useCopilotStore } from './copilotStore';
import { useSettingsStore } from './settingsStore';
import { wipeProfileSynth } from './synthStore';
import { parseCreatorBuild } from '../lib/synthDisclaimer';
import { findProfileGate } from '../lib/profileGates';

/** A profile's standing: temp / unverified / verified / user / guest (Gary, 2026-11-12 ~10:49 PST + ~16:41 PST). */
export type ProfileStatus =
  | 'temp'
  | 'unverified'
  | 'verified'
  | 'user'
  | 'guest';

export interface Profile {
  id: string;
  name: string;
  status: ProfileStatus;
  /** Gate ids (see profileGates.ts) this profile has verified. */
  verifiedGates: string[];
  createdAt: string;
  lastActiveAt: string | null;
}

/** The implicit profile every creation carries until profiles land. */
export const DEFAULT_PROFILE_ID = 'default';

/** Versioned storage key (same guarded pattern as historyStore). */
export const PROFILE_STORAGE_KEY = 'lucid-profiles-v1';

const PROFILE_STATUSES: ProfileStatus[] = [
  'temp',
  'unverified',
  'verified',
  'user',
  'guest',
];

/**
 * True when the profile is a guest — guests are demo-locked in the
 * synth (Gary, 2026-11-12 ~16:41 PST): their synth stays in demo
 * mode, never builds or replaces. Null/undefined is not a guest.
 */
export function isGuestProfile(
  profile: Profile | null | undefined,
): boolean {
  return profile?.status === 'guest';
}

/** The implicit profile, fresh. */
export function createDefaultProfile(): Profile {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    status: 'temp',
    verifiedGates: [],
    createdAt: now,
    lastActiveAt: null,
  };
}

function isProfileStatus(value: unknown): value is ProfileStatus {
  return (
    typeof value === 'string' &&
    (PROFILE_STATUSES as string[]).includes(value)
  );
}

function isValidProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.trim() !== '' &&
    typeof v.name === 'string' &&
    v.name.trim() !== '' &&
    isProfileStatus(v.status) &&
    Array.isArray(v.verifiedGates) &&
    v.verifiedGates.every((g) => typeof g === 'string') &&
    typeof v.createdAt === 'string' &&
    (v.lastActiveAt === null || typeof v.lastActiveAt === 'string')
  );
}

export interface PersistedProfiles {
  profiles: Profile[];
  activeProfileId: string;
}

/**
 * Parse a stored profiles record. Returns null when there is
 * nothing usable (fresh install / corrupt storage) — the caller
 * falls back to the implicit default profile. A stored record
 * without a valid default profile is repaired, never trusted as-is.
 */
export function parsePersistedProfiles(value: unknown): PersistedProfiles | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.profiles)) return null;
  const profiles = (v.profiles as unknown[]).filter(isValidProfile);
  if (!profiles.some((p) => p.id === DEFAULT_PROFILE_ID)) {
    profiles.unshift(createDefaultProfile());
  }
  const activeProfileId =
    typeof v.activeProfileId === 'string' &&
    profiles.some((p) => p.id === v.activeProfileId)
      ? v.activeProfileId
      : DEFAULT_PROFILE_ID;
  return { profiles, activeProfileId };
}

/** Read the persisted record, or the fresh default when there is none. Never throws. */
export function readPersistedProfiles(): PersistedProfiles {
  try {
    if (typeof localStorage === 'undefined') {
      return { profiles: [createDefaultProfile()], activeProfileId: DEFAULT_PROFILE_ID };
    }
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return { profiles: [createDefaultProfile()], activeProfileId: DEFAULT_PROFILE_ID };
    }
    return (
      parsePersistedProfiles(JSON.parse(raw)) ?? {
        profiles: [createDefaultProfile()],
        activeProfileId: DEFAULT_PROFILE_ID,
      }
    );
  } catch {
    // Corrupt or unreadable storage: start fresh, never crash.
    return { profiles: [createDefaultProfile()], activeProfileId: DEFAULT_PROFILE_ID };
  }
}

/** Write the record now. Never throws. */
export function persistProfiles(record: PersistedProfiles): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode / quota: profiles just don't persist this session.
  }
}

function newProfileId(): string {
  try {
    const cryptoRef = (
      globalThis as unknown as {
        crypto?: { randomUUID?: () => string };
      }
    ).crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
      return `profile-${cryptoRef.randomUUID()}`;
    }
  } catch {
    // Fall through to the Math.random id.
  }
  return `profile-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 0xffffffff,
  ).toString(36)}`;
}

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string;
  /** Create a profile (status temp). Returns null when the name is blank. */
  createProfile: (name: string) => Profile | null;
  /**
   * Create a guest profile (status 'guest'). Guest is all one
   * account and always a new guest (Gary, 2026-11-12 ~17:53/17:56
   * PST): exactly one guest profile ever exists, and entering as
   * guest always creates a fresh one — any previous guest record
   * is replaced, never reused, never accumulated. A guest's synth
   * is demo-locked (see the module header) — the saved guest
   * profile is the test bed for comparing the demo synth vs
   * Iteration 8.
   */
  createGuestProfile: () => Profile;
  /** Make a profile the active one (records lastActiveAt). False on an unknown id. */
  selectProfile: (id: string) => boolean;
  /**
   * Mark a registered gate verified on a profile. The Telegram gate
   * turns the profile into a user; any other gate marks it verified.
   * False on an unknown profile or an unregistered gate id. No UI
   * path calls this today — the Telegram account system is not
   * built; this is the seam the verification flow will call.
   */
  markGateVerified: (profileId: string, gateId: string) => boolean;
  /**
   * Wipe a profile per the boundary in the module header. Returns
   * false on an unknown id — and on a GUEST profile: guests have
   * no deletion (Gary, 2026-11-12 ~17:36 PST), the call is refused
   * outright and nothing changes. Wiping 'default' resets it to a
   * fresh temp instead of deleting it. Deletion is invoked from
   * within the profile (Settings > Profile tab), never from the
   * Profiles screen.
   */
  wipeProfile: (profileId: string) => Promise<boolean>;
}

export const useProfileStore = create<ProfileState>((set, get) => {
  const initial = readPersistedProfiles();
  return {
    profiles: initial.profiles,
    activeProfileId: initial.activeProfileId,

    createProfile: (name) => {
      const clean = name.trim();
      if (clean === '') return null;
      const now = new Date().toISOString();
      const profile: Profile = {
        id: newProfileId(),
        name: clean,
        status: 'temp',
        verifiedGates: [],
        createdAt: now,
        lastActiveAt: null,
      };
      set((state) => ({ profiles: [...state.profiles, profile] }));
      return profile;
    },

    createGuestProfile: () => {
      // Guest is all one account and always a new guest (Gary,
      // 2026-11-12 ~17:53/17:56 PST): exactly one guest profile
      // ever exists, and entering as guest always creates a fresh
      // one — any previous guest record is replaced, never reused,
      // never accumulated. This is a plain record replacement, not
      // a wipe: the guest owns no creation and its synth is demo
      // only, so there is nothing of its own to wipe. If the guest
      // being replaced was the active profile, the fresh guest
      // becomes active (the caller selects it right after anyway).
      const now = new Date().toISOString();
      const profile: Profile = {
        id: newProfileId(),
        name: 'Guest',
        status: 'guest',
        verifiedGates: [],
        createdAt: now,
        lastActiveAt: null,
      };
      const activeWasGuest = get().profiles.some(
        (p) => p.id === get().activeProfileId && p.status === 'guest',
      );
      set((state) => ({
        profiles: [
          ...state.profiles.filter((p) => p.status !== 'guest'),
          profile,
        ],
        ...(activeWasGuest ? { activeProfileId: profile.id } : {}),
      }));
      // The previous guest's live data goes with it: a fresh guest
      // starts empty (its chats / terminal blocks were never
      // persisted, and the owner's stashed sessions + blocks stay
      // stashed). Only when the replaced guest was the active one
      // is a guest session actually veiled in.
      if (activeWasGuest) {
        useAIStore.getState().resetGuestSession();
        useHistoryStore.getState().resetGuestSession();
        useCommandHistoryStore.getState().resetGuestSession();
        useCopilotStore.getState().resetGuestSession();
      }
      return profile;
    },

    selectProfile: (id) => {
      const state = get();
      const next = state.profiles.find((p) => p.id === id);
      if (!next) return false;
      const wasGuest =
        state.profiles.find((p) => p.id === state.activeProfileId)?.status === 'guest';
      const isGuest = next.status === 'guest';
      const now = new Date().toISOString();
      set({
        activeProfileId: id,
        profiles: state.profiles.map((p) =>
          p.id === id ? { ...p, lastActiveAt: now } : p,
        ),
      });
      // Guest veil (Gary, 2026-11-12 ~17:59 PST): a guest session
      // shows NO saved data — no LLMBuilder memory, no
      // driving-intelligence memory, no chat memory, no history.
      // The veil lives in aiStore / historyStore /
      // commandHistoryStore / copilotStore: entering veils the owner's sessions
      // + blocks + command list in memory (never deleted, never
      // persisted over), leaving restores them exactly.
      // Guest-to-guest (a fresh guest replacing the old one) keeps
      // the veil on.
      if (!wasGuest && isGuest) {
        useAIStore.getState().enterGuestSession();
        useHistoryStore.getState().enterGuestSession();
        useCommandHistoryStore.getState().enterGuestSession();
        useCopilotStore.getState().enterGuestSession();
      } else if (wasGuest && !isGuest) {
        useAIStore.getState().exitGuestSession();
        useHistoryStore.getState().exitGuestSession();
        useCommandHistoryStore.getState().exitGuestSession();
        useCopilotStore.getState().exitGuestSession();
        // The guest is gone: load the target profile's command
        // list (no-op when it is the profile the guest veiled
        // in from — exit already restored that list).
        useCommandHistoryStore.getState().switchProfile(id);
      } else {
        // Non-guest → non-guest (includes the boot Profiles
        // screen re-selecting the active profile): load that
        // profile's command list.
        useCommandHistoryStore.getState().switchProfile(id);
      }
      return true;
    },

    markGateVerified: (profileId, gateId) => {
      const gate = findProfileGate(gateId);
      if (!gate) return false;
      const state = get();
      const profile = state.profiles.find((p) => p.id === profileId);
      if (!profile) return false;
      // Guests never verify: a guest turning into a 'user' would
      // silently lift the synth demo-lock. Guest status is terminal.
      if (profile.status === 'guest') return false;
      if (profile.verifiedGates.includes(gateId)) return true;
      const verifiedGates = [...profile.verifiedGates, gateId];
      const status: ProfileStatus =
        gateId === 'telegram'
          ? 'user'
          : profile.status === 'user'
            ? 'user'
            : 'verified';
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId ? { ...p, verifiedGates, status } : p,
        ),
      });
      return true;
    },

    wipeProfile: async (profileId) => {
      const state = get();
      const profile = state.profiles.find((p) => p.id === profileId);
      if (!profile) return false;
      // Guests have NO deletion (Gary, 2026-11-12 ~17:36 PST):
      // refused outright, nothing changes. A guest owns no creation
      // and its synth is demo-only — there is nothing of its own
      // to wipe, and the owner's global creation must never be
      // touched from a guest.
      if (profile.status === 'guest') return false;
      const isActive = state.activeProfileId === profileId;
      const creation = parseCreatorBuild(
        useSettingsStore.getState().settings.synthOwnBuild,
      );
      const ownsCreation =
        creation !== null && creation.profileId === profileId;
      // The synth is bound to the profile: wiping the active profile,
      // or the profile that owns the saved creation, wipes the synth
      // back to demo.
      if (isActive || ownsCreation) {
        await wipeProfileSynth();
      }
      // Chats + driving-agent memory are the profile's memory: they
      // go only when the wiped profile is the active one, so wiping
      // another profile never destroys the active profile's chats.
      if (isActive) {
        await useAIStore.getState().clearSessions();
        const history = useHistoryStore.getState();
        for (const tabId of Object.keys(history.blocksByTab)) {
          history.clearBlocks(tabId);
        }
        clearPersistedHistory();
        clearProfileCommandHistory(profileId);
      }
      if (profileId === DEFAULT_PROFILE_ID) {
        // The implicit profile cannot be deleted — wiping it resets
        // it to a fresh temp.
        const fresh = createDefaultProfile();
        set({
          profiles: state.profiles.map((p) =>
            p.id === DEFAULT_PROFILE_ID ? fresh : p,
          ),
          activeProfileId: DEFAULT_PROFILE_ID,
        });
      } else {
        set({
          profiles: state.profiles.filter((p) => p.id !== profileId),
          activeProfileId: isActive
            ? DEFAULT_PROFILE_ID
            : state.activeProfileId,
        });
      }
      return true;
    },
  };
});

// Persist on every change (profiles change rarely — no debounce
// needed). The write is guarded; a failed write only means this
// session's profiles don't survive a relaunch.
useProfileStore.subscribe((state) => {
  persistProfiles({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
  });
});

// A relaunch with a guest still active boots straight into the
// guest session: veil the owner's chats + history before anything
// reads them (the boot Profiles screen's onDone → selectProfile
// covers every later transition; this covers the persisted-active
// guest on module load).
if (
  useProfileStore
    .getState()
    .profiles.some(
      (p) =>
        p.id === useProfileStore.getState().activeProfileId &&
        p.status === 'guest',
    )
) {
  useAIStore.getState().enterGuestSession();
  useHistoryStore.getState().enterGuestSession();
  useCommandHistoryStore.getState().enterGuestSession();
  useCopilotStore.getState().enterGuestSession();
}
