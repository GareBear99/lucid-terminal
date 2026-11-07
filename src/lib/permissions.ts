/**
 * Permission tracking — Lucid tracks everything the user allows
 * (Gary, 2026-11-07 ~02:47 PST): "ok with lucid we need to track
 * everything im allowing right, so i just gave access to permission
 * for screen record but thats somethign others wont have right".
 * Gary just granted Screen Recording; other users will not have
 * it. So Lucid must track permissions per-user and handle the case
 * where one is NOT granted — gracefully, never assuming it.
 *
 * The standard (Gary, 2026-11-07 ~02:48 PST): "everything has to
 * be like you from this point on right" — everything in Lucid has
 * to work the way I (Slave) work: verify before trusting, track
 * permissions and handle denial gracefully, know dependencies and
 * couplings, be honest about what is unknown, never assume, check
 * before acting. This module is that standard, in code:
 *
 * - VERIFY BEFORE TRUSTING: the live probe is the truth. The
 *   persisted grant (`permissionGrants` in Settings) is only a
 *   memory of what the user once allowed. If the live probe says
 *   denied but the record says granted, the probe wins — the user
 *   may have revoked it in System Settings since. A recorded
 *   state is only ever shown marked stale, never as current.
 * - NEVER ASSUME: 'not-determined' and 'unknown' are NOT granted.
 *   The gate refuses them, with an honest reason, exactly like it
 *   refuses 'denied'.
 * - HONEST ABOUT UNKNOWN: 'unknown' is a real status. When a
 *   probe cannot determine the state, Lucid says so instead of
 *   guessing granted or denied.
 * - CHECK BEFORE ACTING: `gatePermission` is the helper every
 *   feature calls before it acts on a permission. No feature acts
 *   on an assumed grant.
 * - KNOW DEPENDENCIES: every permission definition lists the
 *   features that depend on it, so Lucid knows the coupling map —
 *   what goes away when a permission is not granted (the lesson
 *   from the AI panel: when LuciferAI was disabled, the panel went
 *   too, and nobody had mapped that coupling).
 *
 * Pure functions + data, so the logic is unit-testable without a
 * browser or Electron: the main-process probes live in
 * electron/services/permissions.ts and return these shapes.
 */

/** The macOS permissions Lucid tracks (TCC). */
export type PermissionId =
  | 'accessibility'
  | 'screen-recording'
  | 'full-disk-access'
  | 'microphone'
  | 'camera';

export const PERMISSION_IDS: readonly PermissionId[] = [
  'accessibility',
  'screen-recording',
  'full-disk-access',
  'microphone',
  'camera',
];

/**
 * A permission's state. 'granted' means the live probe just
 * verified it works. 'denied' means the capability is not usable
 * right now. 'not-determined' means the user has never been asked
 * (macOS has not recorded a decision). 'restricted' means macOS
 * policy (e.g. parental controls / MDM) forbids it. 'unknown'
 * means the probe could not determine the state — Lucid says so
 * instead of guessing. 'not-applicable' means the permission does
 * not exist on this platform (everything here is macOS TCC).
 */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'not-applicable';

/** The persisted record of what the user once allowed — memory,
 *  not truth. Written whenever a probe runs (see
 *  src/stores/permissionsStore.ts). */
export interface PermissionGrant {
  status: PermissionStatus;
  /** When the probe that produced this record ran. */
  checkedAt: number;
}

export type PermissionGrants = Partial<Record<PermissionId, PermissionGrant>>;

/** One permission's live state, from a probe. */
export interface PermissionSnapshot {
  id: PermissionId;
  status: PermissionStatus;
  /** Human-readable detail, e.g. why a probe failed. */
  detail: string | null;
  /** Whether the capability itself was verified working (a
   *  functional probe ran), as opposed to only the TCC record
   *  being read. */
  verified: boolean;
  /** When the probe ran. */
  checkedAt: number;
}

/** What the UI shows for one permission: the live state, or the
 *  last-known recorded state when no live probe has run yet this
 *  session — marked stale so it is never mistaken for current. */
export interface PermissionDisplayState {
  id: PermissionId;
  status: PermissionStatus;
  detail: string | null;
  /** 'live' = a probe just ran. 'recorded' = the last-known grant,
   *  shown because no probe has run yet — stale, not current. */
  source: 'live' | 'recorded';
  checkedAt: number | null;
}

/**
 * One permission's definition — what it is, why Lucid needs it,
 * what depends on it, and how to grant it. The dependents list is
 * the coupling map: if this permission is not granted, these
 * features do not work (and say so instead of failing silently).
 * A permission with no dependents yet says so explicitly — Lucid
 * never claims a feature needs a permission it does not.
 */
export interface PermissionDef {
  id: PermissionId;
  /** Short name, e.g. 'Screen Recording'. */
  label: string;
  /** What it is and why Lucid needs it (one or two sentences). */
  description: string;
  /** Features that need this permission to work. Empty = no
   *  feature uses it yet — stated, not hidden. */
  dependents: string[];
  /** Where to grant it, in words (System Settings path). */
  grantPath: string;
  /** macOS System Settings deep link (x-apple.systempreferences),
   *  or null where no deep link exists. */
  settingsUrl: string | null;
  /** Whether macOS lets Lucid prompt for this one directly
   *  (systemPreferences.askForMediaAccess). Accessibility and Full
   *  Disk Access cannot be prompted for — the user grants them in
   *  System Settings. */
  requestable: boolean;
}

export const PERMISSION_DEFS: readonly PermissionDef[] = [
  {
    id: 'accessibility',
    label: 'Accessibility',
    description:
      'Lets Lucid drive the Mac: click, type, and see which app and window is in front. The computer-control segment needs it.',
    dependents: ['Computer control — click, type, key, list apps, observe focus'],
    grantPath: 'System Settings → Privacy & Security → Accessibility → enable Lucid Terminal',
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    requestable: false,
  },
  {
    id: 'screen-recording',
    label: 'Screen Recording',
    description:
      'Lets Lucid see the screen. The computer-control segment needs it to read the screen back after an action and check that the action landed.',
    dependents: ['Computer control — screen fingerprint / read-back verification'],
    grantPath: 'System Settings → Privacy & Security → Screen Recording → enable Lucid Terminal',
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    requestable: true,
  },
  {
    id: 'full-disk-access',
    label: 'Full Disk Access',
    description:
      'Lets Lucid read files in protected places on the Mac. File work and the daemon need it when a file lives in one of those places.',
    dependents: ['File work in protected locations', 'Daemon — watched paths in protected locations'],
    grantPath: 'System Settings → Privacy & Security → Full Disk Access → enable Lucid Terminal',
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    requestable: false,
  },
  {
    id: 'microphone',
    label: 'Microphone',
    description:
      'For voice input, if Lucid ever listens. No feature uses it yet — Lucid never asks for a permission it does not need.',
    dependents: [],
    grantPath: 'System Settings → Privacy & Security → Microphone → enable Lucid Terminal',
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    requestable: true,
  },
  {
    id: 'camera',
    label: 'Camera',
    description:
      'For video input, if Lucid ever watches. No feature uses it yet — Lucid never asks for a permission it does not need.',
    dependents: [],
    grantPath: 'System Settings → Privacy & Security → Camera → enable Lucid Terminal',
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    requestable: true,
  },
];

export function permissionDef(id: PermissionId): PermissionDef {
  const def = PERMISSION_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`unknown permission: ${id}`);
  return def;
}

/** The only status that means "go ahead". Everything else is a
 *  refusal — including 'not-determined' and 'unknown'. Never
 *  assume. */
export function isPermissionGranted(status: PermissionStatus): boolean {
  return status === 'granted';
}

export function permissionStatusLabel(status: PermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Not granted';
    case 'not-determined':
      return 'Not determined';
    case 'restricted':
      return 'Restricted';
    case 'unknown':
      return 'Unknown';
    case 'not-applicable':
      return 'Not applicable';
  }
}

export interface PermissionCheckResult {
  ok: boolean;
  status: PermissionStatus;
  /** Honest reason when not ok — names the permission, its state,
   *  and how to grant it. Never silent, never a bare boolean. */
  reason: string | null;
}

/**
 * CHECK BEFORE ACTING — the gate every feature calls before it
 * acts on a permission. `snapshot` is the live probe result (or
 * null when no probe has run — which is itself a refusal: no
 * verification, no action). Only 'granted' passes. 'denied',
 * 'not-determined', 'restricted', 'unknown' and 'not-applicable'
 * all refuse, each with a reason that says what to do about it.
 */
export function gatePermission(
  snapshot: PermissionSnapshot | null | undefined,
  id: PermissionId,
): PermissionCheckResult {
  const def = permissionDef(id);
  if (!snapshot) {
    return {
      ok: false,
      status: 'unknown',
      reason: `${def.label} has not been checked yet — Lucid will not act on a permission it has not verified. Open Settings → Permissions and refresh.`,
    };
  }
  if (snapshot.status === 'granted') {
    return { ok: true, status: 'granted', reason: null };
  }
  if (snapshot.status === 'not-applicable') {
    return {
      ok: false,
      status: 'not-applicable',
      reason: `${def.label} does not apply on this platform — the feature that needs it is macOS-only.`,
    };
  }
  if (snapshot.status === 'not-determined') {
    return {
      ok: false,
      status: 'not-determined',
      reason: `${def.label} has never been granted or denied — macOS has no decision recorded. Grant it at ${def.grantPath}.`,
    };
  }
  if (snapshot.status === 'restricted') {
    return {
      ok: false,
      status: 'restricted',
      reason: `${def.label} is restricted by macOS policy on this Mac — Lucid cannot use it.`,
    };
  }
  if (snapshot.status === 'unknown') {
    return {
      ok: false,
      status: 'unknown',
      reason: `${def.label} could not be checked — Lucid will not assume it is granted. ${snapshot.detail ?? `Grant it at ${def.grantPath}.`}`,
    };
  }
  // 'denied'.
  return {
    ok: false,
    status: 'denied',
    reason: `${def.label} is not granted. ${snapshot.detail ?? ''} Grant it at ${def.grantPath}.`.trim(),
  };
}

/**
 * Resolve what the UI shows for one permission, from the live
 * probe and the recorded grant. The live probe ALWAYS wins when
 * it exists — a recorded 'granted' never overrides a live
 * 'denied' (the user may have revoked it in System Settings).
 * When no live probe has run yet this session, the recorded grant
 * is shown marked 'recorded' (stale) so it is never mistaken for
 * current. When neither exists, the state is honestly 'unknown'.
 */
export function resolvePermissionDisplayState(
  id: PermissionId,
  live: PermissionSnapshot | null | undefined,
  recorded: PermissionGrant | null | undefined,
): PermissionDisplayState {
  if (live) {
    return {
      id,
      status: live.status,
      detail: live.detail,
      source: 'live',
      checkedAt: live.checkedAt,
    };
  }
  if (recorded) {
    return {
      id,
      status: recorded.status,
      detail: 'Last known state — no probe has run yet this session.',
      source: 'recorded',
      checkedAt: recorded.checkedAt,
    };
  }
  return {
    id,
    status: 'unknown',
    detail: 'Never checked.',
    source: 'recorded',
    checkedAt: null,
  };
}

/**
 * THE INFO PAGE — the exact words (Gary, 2026-11-07 ~02:49 PST):
 * "there needs to be and info explanatory page and voice of the
 * exact words on that page explaining to in top of settings tabs".
 * One canonical string. The Permissions tab renders this string
 * verbatim, and the voice MP3
 * (public/settings/permissions-explanation.mp3) is synthesized
 * from this exact string — the voice reads the exact words on the
 * page, no paraphrase, no extra words. If the words change, the
 * MP3 must be re-synthesized from the new string.
 *
 * Written to be spoken: no markdown, no URLs, no digits, no
 * abbreviations — every word sounds the way it reads.
 */
export const PERMISSIONS_INFO_TEXT = [
  'Lucid checks every permission before it acts. A permission that is not granted is never assumed. If a feature needs a permission you have not granted, it tells you so, and tells you how to grant it.',
  'Accessibility lets Lucid drive the Mac: click, type, and see which app and window is in front. The computer-control segment needs it. Without it, computer control cannot click, type, or list apps, so it refuses instead of acting blind.',
  'Screen Recording lets Lucid see the screen. The computer-control segment needs it to read the screen back after an action and check that the action landed. Without it, computer control cannot verify anything, so it refuses instead of guessing.',
  'Full Disk Access lets Lucid read files in protected places on the Mac. File work and the daemon need it when a file lives in one of those places. Without it, that file work fails, and Lucid says so instead of silently skipping files.',
  'Microphone is for voice input, if Lucid ever listens. No feature uses it yet.',
  'Camera is for video input, if Lucid ever watches. No feature uses it yet.',
  'Permissions belong to you, on this Mac, for this app. Granting one here does not grant it anywhere else. You can change any of them in System Settings, under Privacy and Security. Lucid never asks for a permission it does not need, and it never pretends to have one it does not.',
].join('\n\n');

/** The voice-message audio path for the permissions info page. */
export const PERMISSIONS_INFO_VOICE_SRC = './settings/permissions-explanation.mp3';
