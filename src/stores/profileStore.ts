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
 *   screen's onDone is the only caller) + applyPersistedGuestVeil
 *   (called once from App's boot init — a relaunch with a guest
 *   still active).
 *
 * LOG OUT (Gary, 2026-11-16): "log out of profile" lives in
 * Settings > General — the one place to leave the current profile
 * and return to the Profiles screen. There is no sign-out anywhere
 * else; the Profiles screen is the picker, and logging out just
 * shows it again (the active profile id stays persisted, so the
 * screen pre-selects where the user left off). The request is a
 * timestamp (requestLogout) because Settings has no access to
 * App's local bootPhase — App watches logoutRequestedAt and sets
 * the phase back to 'profiles'. Picking a profile proceeds
 * through splash2 → lucid exactly as on boot, and selectProfile
 * handles the guest-veil transitions (guest → non-guest restores
 * the owner's data; re-entering as guest creates a fresh guest).
 * - CONFIRMATION: logging out asks first — the prompt says what
 *   happens (a guest session is ephemeral: its chats and terminal
 *   history are discarded; a saved profile's data stays saved).
 *   The prompt has a "Don't ask again" checkbox; the choice is
 *   saved PER PROFILE (skipLogoutConfirm on the Profile record,
 *   persisted with it — absent on older records means ask).
 *   Settings > General has the toggle to turn the confirmation
 *   back on for the current profile ("Ask before logging out").
 *   A profile that disabled it logs out with no prompt until the
 *   toggle is flipped back. GUEST IS EXCLUDED (Gary, 2026-11-16):
 *   a guest session always asks — there is no "Don't ask again"
 *   and no toggle for Guest, only for saved profiles. The store
 *   refuses setSkipLogoutConfirm for a guest, and loading strips
 *   the flag from a guest record written by an older build.
 *   Settings > Security lists the profiles that turned the
 *   confirmation off, so it can be turned back on from there too.
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
import { clearProfileHistory, useHistoryStore } from './historyStore';
import { clearProfileCommandHistory, useCommandHistoryStore } from './commandHistoryStore';
import { clearProfilePlans, usePlanStore } from './planStore';
import { useLucidSessionStore } from './lucidSessionStore';
import { useCopilotStore } from './copilotStore';
import { useWorkspaceStore } from './workspaceStore';
import { useSettingsStore } from './settingsStore';
import { wipeProfileSynth } from './synthStore';
import { parseCreatorBuild } from '../lib/synthDisclaimer';
import { findProfileGate } from '../lib/profileGates';
import { usePaletteStore } from './paletteStore';

/** A profile's standing: temp / unverified / verified / user / guest (Gary, 2026-11-12 ~10:49 PST + ~16:41 PST). */
export type ProfileStatus =
  | 'temp'
  | 'unverified'
  | 'verified'
  | 'user'
  | 'guest';

/** The state of a profile's current FixNet temp (Gary, 2026-11-17). */
export type TempState = 'temp' | 'pending' | 'verified';

export interface Profile {
  id: string;
  name: string;
  status: ProfileStatus;
  /** Gate ids (see profileGates.ts) this profile has verified. */
  verifiedGates: string[];
  createdAt: string;
  lastActiveAt: string | null;
  /**
   * "Don't ask again" for the logout confirmation (Gary,
   * 2026-11-16): when true, Settings > General "Log out of
   * profile" skips the confirmation prompt for THIS profile
   * only. Each profile keeps its own value; absent (older
   * records) means ask. Turned back on from Settings > General
   * ("Ask before logging out") or Settings > Security. A guest
   * profile NEVER carries this flag — a guest session always
   * asks before logging out (the store refuses the set, and
   * loading strips it from a guest record).
   */
  skipLogoutConfirm?: boolean;
  /**
   * "Do not show again" for the new-version startup alert
   * (Gary, 2026-11-16): when true, Settings > Updates "Tell
   * me when a new version is out" is off for THIS profile
   * only — a new version never pops up at startup for it.
   * Each profile keeps its own value; absent (older records)
   * means tell. Turned back on from Settings > Updates or
   * Settings > Security. A guest profile NEVER carries this
   * flag — a guest session always sees the new-version
   * message (guest wipes anyway, so an opt-out makes no
   * sense); the store refuses the set, and loading strips it
   * from a guest record. The toggle only silences the
   * STARTUP notice — the Updates section always shows the
   * latest version and the Check now button.
   */
  skipUpdateAlert?: boolean;
  /**
   * The UTC date (YYYY-MM-DD) the verified SP grant was last
   * recorded for this profile (FixNet, Gary 2026-11-16): when
   * the profile flips to verified, the sync records the 1,000
   * SP/day grant for that day, so a second sync the same day
   * does not re-grant or re-toast. Absent (older records, or
   * never verified) means no grant recorded. A guest profile
   * NEVER carries this — guests never verify, and loading
   * strips it from a guest record.
   */
  verifiedSpGrantDay?: string | null;
  /**
   * The FixNet temp this profile currently verifies under
   * (FixNet temp rotation, Gary 2026-11-17): the profile id
   * stays stable — it is the key for history, AI, copilot,
   * workspace, sessions, palette, and the SP bucket — while
   * the temp rotates underneath it. Absent on older records:
   * load defaults it to the profile id (the temp it verified
   * under before rotation existed).
   */
  tempId?: string;
  /**
   * The state of the current temp: 'temp' (never verified),
   * 'pending' (rotated in, awaiting verification at the next
   * grab), 'verified' (the current temp verified). Absent on
   * older records: load defaults it from the profile status
   * (verified/user → 'verified', otherwise 'temp'). Separate
   * from the profile status: rotation never revokes a verified
   * profile or its SP grant.
   */
  tempState?: TempState;
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
    tempId: DEFAULT_PROFILE_ID,
    tempState: 'temp',
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
  // Guest never opts out (Gary, 2026-11-16): a guest record that
  // somehow carries skipLogoutConfirm (written by the build
  // before the guest exclusion) loses the flag on load, so a
  // guest always asks before logging out. Same for
  // skipUpdateAlert: a guest always sees the new-version
  // message.
  for (const p of profiles) {
    // FixNet temp rotation (Gary, 2026-11-17): records written
    // before rotation existed carry no temp — default tempId to
    // the profile id (the temp it verified under) and tempState
    // from the profile status (verified/user → 'verified',
    // otherwise 'temp'). An explicit temp on the record is kept;
    // a malformed one falls back to the same defaults.
    if (typeof p.tempId !== 'string' || p.tempId.trim() === '') {
      p.tempId = p.id;
    }
    if (
      p.tempState !== 'temp' &&
      p.tempState !== 'pending' &&
      p.tempState !== 'verified'
    ) {
      p.tempState =
        p.status === 'verified' || p.status === 'user'
          ? 'verified'
          : 'temp';
    }
    if (isGuestProfile(p)) {
      delete p.skipLogoutConfirm;
      delete p.skipUpdateAlert;
      delete p.verifiedSpGrantDay;
    }
  }
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
  /**
   * Logout request timestamp (Gary, 2026-11-16): Settings >
   * General "Log out of profile" sets this; App watches it and
   * returns to the Profiles screen. A timestamp (not a boolean)
   * so repeated logouts are distinct requests. Null when no
   * logout is pending.
   */
  logoutRequestedAt: number | null;
  /** Request a return to the Profiles screen (log out of the active profile). */
  requestLogout: () => void;
  /** Clear a pending logout request (App calls this when it acts on it). */
  clearLogoutRequest: () => void;
  /**
   * Set this profile's "Don't ask again" for the logout
   * confirmation. True = skip the prompt for this profile;
   * false = ask every time. False on an unknown profile id.
   * Persisted with the profile record.
   */
  setSkipLogoutConfirm: (profileId: string, skip: boolean) => boolean;
  /**
   * Set this profile's "Do not show again" for the new-version
   * startup alert. True = never pop up at startup for this
   * profile; false = tell every time a new version is out.
   * False on an unknown profile id. Persisted with the
   * profile record.
   */
  setSkipUpdateAlert: (profileId: string, skip: boolean) => boolean;
  /**
   * Record the verified SP grant for a profile, for one UTC day
   * (FixNet, Gary 2026-11-16). Called by the sync when a profile
   * flips to verified: the 1,000 SP/day grant is recorded for
   * `day` so a second sync the same day does not re-grant.
   * False on an unknown profile, a guest, or a profile that is
   * not verified — a grant is never recorded for an unverified
   * profile. Persisted with the profile record.
   */
  recordVerifiedSpGrant: (profileId: string, day: string) => boolean;
  /**
   * Rotate a profile onto a new FixNet temp (Gary, 2026-11-17):
   * sets tempId to the new temp and tempState to 'pending'
   * (awaiting verification at the next grab). The profile id
   * itself never changes — it stays the key for history, AI,
   * copilot, workspace, sessions, palette, and the SP bucket —
   * and the profile status is untouched: rotation never
   * revokes a verified profile or its SP grant. False on an
   * unknown profile, a guest, or an empty new temp id.
   * Persisted with the profile record.
   */
  rotateTemp: (profileId: string, newTempId: string) => boolean;
  /**
   * Mark a profile's current temp verified (FixNet temp
   * rotation, Gary 2026-11-17): the published status table
   * says the profile's current tempId verified. False on an
   * unknown profile or a guest. The profile status is
   * untouched — the sync flips it separately.
   */
  markTempVerified: (profileId: string) => boolean;
}

export const useProfileStore = create<ProfileState>((set, get) => {
  const initial = readPersistedProfiles();
  return {
    profiles: initial.profiles,
    activeProfileId: initial.activeProfileId,
    logoutRequestedAt: null,

    createProfile: (name) => {
      const clean = name.trim();
      if (clean === '') return null;
      const now = new Date().toISOString();
      const id = newProfileId();
      const profile: Profile = {
        id,
        name: clean,
        status: 'temp',
        verifiedGates: [],
        createdAt: now,
        lastActiveAt: null,
        // A new profile verifies under its own id until the
        // first rotation (FixNet temp rotation, Gary 2026-11-17).
        tempId: id,
        tempState: 'temp',
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
      const id = newProfileId();
      const profile: Profile = {
        id,
        name: 'Guest',
        status: 'guest',
        verifiedGates: [],
        createdAt: now,
        lastActiveAt: null,
        tempId: id,
        tempState: 'temp',
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
        usePlanStore.getState().resetGuestSession();
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
      // SP segregation (Fix 1, 2026-11-17): the displayed SP
      // balance belongs to the profile that was active when it
      // was fetched — clear it on every switch so the new
      // profile never shows the old profile's balance (Guest
      // showing Genesis's 1196 was exactly this). The next
      // chat / Test connection fetches the new profile's own
      // bucket. The base-100 fallback re-applies from there.
      useAIStore.getState().setPingQuota(null);
      // Guest veil (Gary, 2026-11-12 ~17:59 PST): a guest session
      // shows NO saved data — no LLMBuilder memory, no
      // driving-intelligence memory, no chat memory, no history.
      // The veil lives in aiStore / historyStore /
      // commandHistoryStore / planStore / copilotStore: entering veils the owner's sessions
      // + blocks + command list + plans in memory (never deleted, never
      // persisted over), leaving restores them exactly.
      // Guest-to-guest (a fresh guest replacing the old one) keeps
      // the veil on.
      if (!wasGuest && isGuest) {
        useAIStore.getState().enterGuestSession();
        useHistoryStore.getState().enterGuestSession();
        useCommandHistoryStore.getState().enterGuestSession();
        usePlanStore.getState().enterGuestSession();
        useCopilotStore.getState().enterGuestSession();
        // Workspace: flush the owner's
        // workspace, then veil it — a guest never reads it
        // and never persists over it.
        useWorkspaceStore.getState().enterGuestSession();
      } else if (wasGuest && !isGuest) {
        useAIStore.getState().exitGuestSession();
        useHistoryStore.getState().exitGuestSession();
        useCommandHistoryStore.getState().exitGuestSession();
        usePlanStore.getState().exitGuestSession();
        useCopilotStore.getState().exitGuestSession();
        useWorkspaceStore.getState().exitGuestSession();
        useLucidSessionStore.getState().exitGuestSession();
        // The guest is gone: load the target profile's data
        // (no-op when it is the profile the guest veiled in
        // from — exit already restored that profile's data).
        useHistoryStore.getState().switchProfile(id);
        useCommandHistoryStore.getState().switchProfile(id);
        usePlanStore.getState().switchProfile(id);
        useWorkspaceStore.getState().switchProfile(id);
        useLucidSessionStore.getState().switchProfile(id);
      } else {
        // Non-guest → non-guest (includes the boot Profiles
        // screen re-selecting the active profile): load that
        // profile's data. History blocks and sessions switch
        // here too — before this, switching profiles never
        // switched the History panel or the session list, so
        // profile B saw profile A's blocks and sessions.
        useHistoryStore.getState().switchProfile(id);
        useCommandHistoryStore.getState().switchProfile(id);
        usePlanStore.getState().switchProfile(id);
        useWorkspaceStore.getState().switchProfile(id);
        useLucidSessionStore.getState().switchProfile(id);
      }
      // The palette: favorites, aliases and
      // quicklinks are per profile, in the palette store's own
      // key — switching profiles switches them, so a guest
      // never sees the owner's palette state.
      usePaletteStore.getState().switchProfile(id);
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
        // Only this profile's history slot goes — other
        // profiles' blocks are untouched (per-profile history).
        clearProfileHistory(profileId);
        clearProfileCommandHistory(profileId);
        clearProfilePlans(profileId);
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
      // Wiping the ACTIVE profile falls back to the default profile
      // — and the data stores must follow it. Without this, every
      // store's profileId still points at the deleted profile: new
      // blocks would persist into a dead profile's slot (resurrecting
      // it) and the default profile's history would never load.
      // (selectProfile drives switchProfile on every other path
      // that changes the active profile; wipeProfile sets it here
      // directly, so it must drive the switch itself.)
      if (isActive) {
        useHistoryStore.getState().switchProfile(DEFAULT_PROFILE_ID);
        useCommandHistoryStore.getState().switchProfile(DEFAULT_PROFILE_ID);
        usePlanStore.getState().switchProfile(DEFAULT_PROFILE_ID);
        useWorkspaceStore.getState().switchProfile(DEFAULT_PROFILE_ID);
        useLucidSessionStore.getState().switchProfile(DEFAULT_PROFILE_ID);
      }
      return true;
    },

    requestLogout: () => {
      set({ logoutRequestedAt: Date.now() });
    },

    clearLogoutRequest: () => {
      set({ logoutRequestedAt: null });
    },

    setSkipLogoutConfirm: (profileId, skip) => {
      const state = get();
      const target = state.profiles.find((p) => p.id === profileId);
      if (!target) return false;
      // Guest never opts out (Gary, 2026-11-16): a guest session
      // is ephemeral and always asks before logging out, so there
      // is no "Don't ask again" for a guest profile — refuse the
      // set instead of recording a flag the UI can never show.
      if (isGuestProfile(target)) return false;
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId ? { ...p, skipLogoutConfirm: skip } : p,
        ),
      });
      return true;
    },

    setSkipUpdateAlert: (profileId, skip) => {
      const state = get();
      const target = state.profiles.find((p) => p.id === profileId);
      if (!target) return false;
      // Guest never opts out (Gary, 2026-11-16): a guest session
      // always sees the new-version message (guest wipes anyway,
      // so an opt-out makes no sense) — refuse the set instead
      // of recording a flag the UI can never show.
      if (isGuestProfile(target)) return false;
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId ? { ...p, skipUpdateAlert: skip } : p,
        ),
      });
      return true;
    },

    recordVerifiedSpGrant: (profileId, day) => {
      const state = get();
      const target = state.profiles.find((p) => p.id === profileId);
      if (!target) return false;
      // Guests never verify, so they never get a grant recorded.
      if (isGuestProfile(target)) return false;
      // A grant is only ever recorded for a verified profile —
      // the sync flips the profile first (markGateVerified),
      // then records the grant. Recording one for a temp would
      // let the UI claim an allowance the server never gave.
      if (target.status !== 'verified' && target.status !== 'user') return false;
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId ? { ...p, verifiedSpGrantDay: day } : p,
        ),
      });
      return true;
    },

    rotateTemp: (profileId, newTempId) => {
      const state = get();
      const target = state.profiles.find((p) => p.id === profileId);
      if (!target) return false;
      // Guests never rotate: they never verify, never activate
      // a temp (FixNet temp rotation, Gary 2026-11-17).
      if (isGuestProfile(target)) return false;
      if (typeof newTempId !== 'string' || newTempId.trim() === '') {
        return false;
      }
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId
            ? { ...p, tempId: newTempId, tempState: 'pending' as TempState }
            : p,
        ),
      });
      return true;
    },

    markTempVerified: (profileId) => {
      const state = get();
      const target = state.profiles.find((p) => p.id === profileId);
      if (!target) return false;
      // Guests never verify, so their temp never verifies.
      if (isGuestProfile(target)) return false;
      set({
        profiles: state.profiles.map((p) =>
          p.id === profileId
            ? { ...p, tempState: 'verified' as TempState }
            : p,
        ),
      });
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
//
// Moved out of module scope into applyPersistedGuestVeil()
// (2026-11-15): the block above ran at import time and called
// useWorkspaceStore.getState() while workspaceStore was still in
// TDZ — profileStore ↔ workspaceStore import each other, so the
// order depends on which store is first imported, and the c154ae9
// deploy flipped it (Kite click-to-jump: DocsPanel → lib/workspace
// → workspaceStore, reached before profileStore). The app then
// booted to a blank window:
// "Uncaught ReferenceError: Cannot access 'useWorkspaceStore'
// before initialization". App's boot init() calls this once after
// mount, when every module is initialized. Idempotent — every
// enterGuestSession() guards on already-veiled — and the behavior
// is unchanged: same check, same five veil calls, same order.
export function applyPersistedGuestVeil(): void {
  const state = useProfileStore.getState();
  const active = state.profiles.find((p) => p.id === state.activeProfileId);
  if (!active || active.status !== 'guest') return;
  useAIStore.getState().enterGuestSession();
  useHistoryStore.getState().enterGuestSession();
  useCommandHistoryStore.getState().enterGuestSession();
  usePlanStore.getState().enterGuestSession();
  useCopilotStore.getState().enterGuestSession();
  useWorkspaceStore.getState().enterGuestSession();
  useLucidSessionStore.getState().enterGuestSession();
}
