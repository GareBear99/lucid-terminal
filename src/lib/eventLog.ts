/**
 * Event tracking + diagnosis — Lucid tracks WHEN every event
 * happened and diagnoses WHY (Gary, 2026-11-08 ~09:50 PST:
 * "For lucid so should be tracking all that and diagnosing as
 * its important to be like you to know when and why", scope
 * defined ~10:27 PST: "Now all the initial and throughout allow
 * tracking and why").
 *
 * This extends the "everything has to be like you" standard from
 * permission STATE (src/lib/permissions.ts) to event DIAGNOSIS:
 * verify before trusting, track permissions, handle denial
 * gracefully, know dependencies and couplings, be honest about
 * what is unknown, never assume, check before acting. The event
 * log is that standard applied to everything Lucid asks for:
 *
 * - INITIAL (startup) events: the startup file-explorer load
 *   (before the 4dd778a fix it walked the whole home tree
 *   recursively — the cause of the 3 macOS TCC prompts Gary
 *   reported, "still asks 3 times on startup for same thing",
 *   2026-11-08 ~09:49 PST; the fix was re-applied on Gary's yes
 *   2026-11-08 ~13:37 PST, so the startup load is top level
 *   only now) and the startup permission probe.
 * - THROUGHOUT (ongoing) events: permission prompts and probe
 *   runs during the session, permission state changes, directory
 *   reads and folder-picker dialogs, browser permission and
 *   auth prompts (a page asking — the user did not initiate
 *   those), and unexpected asks.
 * - HONEST ABOUT UNKNOWN: when the cause of an event cannot be
 *   determined, the diagnosis is the literal string 'unknown' —
 *   never invented. `createEvent` defaults `why` to 'unknown',
 *   so a missing diagnosis is recorded as unknown, not guessed.
 *
 * Pure functions + data, so the logic is unit-testable without
 * a browser or Electron — same pattern as permissions.ts. The
 * store (src/stores/eventLogStore.ts) holds the log; the
 * Permissions tab renders it.
 */

import {
  permissionDef,
  type PermissionId,
  type PermissionStatus,
} from './permissions';

/** A tracked event. `at` is WHEN (ms since epoch). `why` is the
 *  diagnosis — the triggering code path / cause, or the literal
 *  'unknown' when it cannot be determined. `outcome` is what
 *  happened in the end. */
export interface TrackedEvent {
  /** Unique id (timestamp + counter, assigned by createEvent). */
  id: string;
  /** WHEN the event happened (ms since epoch). */
  at: number;
  /** Startup ('initial') or during the session ('throughout'). */
  phase: EventPhase;
  /** What kind of event this is. */
  type: EventType;
  /** Short human label of what was asked / what happened. */
  what: string;
  /** WHY — the triggering code path / cause, or 'unknown'. */
  why: string;
  /** What happened in the end. */
  outcome: EventOutcome;
  /** Extra mechanism detail (e.g. why a walk triggers prompts). */
  detail: string | null;
}

export type EventPhase = 'initial' | 'throughout';

export type EventType =
  /** Startup: the file explorer walked the home directory. */
  | 'startup.file-explorer-walk'
  /** Startup: the permission probe ran (Permissions tab open). */
  | 'startup.permission-probe'
  /** During the session: a permission probe ran (Refresh, etc.). */
  | 'permission.probe'
  /** During the session: Lucid prompted for a permission. */
  | 'permission.prompt'
  /** During the session: a permission's state changed. */
  | 'permission.state-change'
  /** During the session: a directory was read (file explorer). */
  | 'file.directory-read'
  /** During the session: an OS folder-picker dialog opened. */
  | 'file.directory-dialog'
  /** During the session: a web page asked for a capability. */
  | 'browser.permission-prompt'
  /** During the session: a web page asked for sign-in. */
  | 'browser.auth-prompt'
  /** During the session: the DEFCON level changed (Gary's order). */
  | 'defcon.level-change'
  /** During the session: a new snapshot version was detected
   *  on manifest check (the next pull is different — the
   *  update is required). */
  | 'snapshot.update-detected'
  /** During the session: a snapshot download started (R2). */
  | 'snapshot.download-started'
  /** During the session: a packet could not hit the snapshot
   *  (mismatch) and fell back to the ping server — the single
   *  Connection call for that packet, while the update stream
   *  is in progress. */
  | 'snapshot.ping-fallback'
  /** During the session: a downloaded snapshot passed SHA-256
   *  verification against the manifest hash (before the swap). */
  | 'snapshot.hash-verified'
  /** During the session: a snapshot was swapped in via the
   *  SPSC triple-buffer atomic flip. */
  | 'snapshot.flipped'
  /** During the session: the first packet after the flip hit
   *  the new snapshot — the update stream is complete and
   *  local replies resume. */
  | 'snapshot.packet-hits'
  /** During the session: the snapshot update alert was shown. */
  | 'snapshot.alert-shown'
  /** During the session: the snapshot update alert was
   *  dismissed with "do not show again" for that version. */
  | 'snapshot.alert-dismissed'
  /** During the session: a snapshot update failed (the
   *  installed snapshot stays current). */
  | 'snapshot.update-failed'
  /** During the session: an ask with no attributable trigger. */
  | 'unexpected-ask';

export type EventOutcome =
  | 'granted'
  | 'denied'
  | 'dismissed'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'unknown';

/** The honest diagnosis when a cause cannot be determined —
 *  recorded, never invented. */
export const UNKNOWN_CAUSE = 'unknown';

/** The log is bounded — newest first, capped so it cannot
 *  grow without limit (the same discipline as SPSC: bounded,
 *  no pile-up). */
export const EVENT_LOG_LIMIT = 200;

/**
 * The SPSC ring capacity — the most events that can be in
 * flight between the event sources (producers) and the log
 * store (consumer) at once (Gary, 2026-11-08 ~10:47 PST:
 * "spsc the event log"). Generous for a burst of actions, but
 * bounded: a runaway producer is refused past this, never
 * allowed to pile events up without limit. The visible log
 * (EVENT_LOG_LIMIT) is the consumed side; the ring is the
 * channel. Both are bounded.
 */
export const EVENT_RING_CAPACITY = 512;

/** localStorage key the store persists the log under. */
export const EVENT_LOG_STORAGE_KEY = 'lucid.eventLog.v1';

/** Persisted key for the last snapshot update stream's time +
 *  strain summary (Gary, 2026-11-09 ~15:00 PST) — the Security
 *  tab shows the LAST stream even after a reload, so the stream
 *  summary persists next to the log. Same best-effort rule as
 *  the log itself: a full or unavailable storage never breaks
 *  logging. */
export const SNAPSHOT_STREAM_STORAGE_KEY = 'lucid.eventLog.snapshotStream.v1';

let eventCounter = 0;

/**
 * Build an event. `why` defaults to 'unknown' and `outcome` to
 * 'pending' — a missing diagnosis is recorded as unknown, never
 * guessed, and an event whose end is not yet known stays
 * pending until it resolves.
 */
export function createEvent(input: {
  phase: EventPhase;
  type: EventType;
  what: string;
  why?: string;
  outcome?: EventOutcome;
  detail?: string | null;
  at?: number;
}): TrackedEvent {
  const at = input.at ?? Date.now();
  eventCounter += 1;
  return {
    id: `evt-${at}-${eventCounter}`,
    at,
    phase: input.phase,
    type: input.type,
    what: input.what,
    why: input.why ?? UNKNOWN_CAUSE,
    outcome: input.outcome ?? 'pending',
    detail: input.detail ?? null,
  };
}

/** Prepend an event, newest first, capped at EVENT_LOG_LIMIT. */
export function appendEvent(events: TrackedEvent[], event: TrackedEvent): TrackedEvent[] {
  return [event, ...events].slice(0, EVENT_LOG_LIMIT);
}

/** One-line human summary — WHEN, WHAT, WHY, outcome. */
export function describeEvent(event: TrackedEvent): string {
  return `${new Date(event.at).toLocaleString()} — ${event.what} — why: ${event.why} (${event.outcome})`;
}

export function eventTypeLabel(type: EventType): string {
  switch (type) {
    case 'startup.file-explorer-walk':
      return 'Startup file walk';
    case 'startup.permission-probe':
      return 'Startup permission probe';
    case 'permission.probe':
      return 'Permission probe';
    case 'permission.prompt':
      return 'Permission prompt';
    case 'permission.state-change':
      return 'Permission changed';
    case 'file.directory-read':
      return 'Directory read';
    case 'file.directory-dialog':
      return 'Folder picker';
    case 'browser.permission-prompt':
      return 'Page asked for a capability';
    case 'browser.auth-prompt':
      return 'Page asked for sign-in';
    case 'defcon.level-change':
      return 'DEFCON level changed';
    case 'snapshot.update-detected':
      return 'New snapshot detected';
    case 'snapshot.download-started':
      return 'Snapshot download started';
    case 'snapshot.ping-fallback':
      return 'Ping fallback';
    case 'snapshot.hash-verified':
      return 'Snapshot hash verified';
    case 'snapshot.flipped':
      return 'Snapshot swapped in';
    case 'snapshot.packet-hits':
      return 'Packet hits snapshot';
    case 'snapshot.alert-shown':
      return 'Snapshot alert shown';
    case 'snapshot.alert-dismissed':
      return 'Snapshot alert dismissed';
    case 'snapshot.update-failed':
      return 'Snapshot update failed';
    case 'unexpected-ask':
      return 'Unexpected ask';
  }
}

export function eventPhaseLabel(phase: EventPhase): string {
  return phase === 'initial' ? 'Startup' : 'During session';
}

export function eventOutcomeLabel(outcome: EventOutcome): string {
  switch (outcome) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'dismissed':
      return 'Dismissed';
    case 'pending':
      return 'Pending';
    case 'completed':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'unknown':
      return 'Unknown';
  }
}

/* ------------------------------------------------------------------ */
/* Diagnoses — the WHY for each event. Each names the exact code    */
/* path that triggered it, so the log answers "why" without        */
/* guessing. The wording lives here, in one place, so every       */
/* callsite diagnoses the same way.                                 */
/* ------------------------------------------------------------------ */

/**
 * WHY the startup file-explorer load happens — the diagnosis for
 * Gary's 3-prompts report ("still asks 3 times on startup for
 * same thing", 2026-11-08 ~09:49 PST): App's init effect loads
 * the file explorer in the background. Before the 4dd778a fix it
 * read the whole home tree recursively, and macOS showed one TCC
 * prompt per protected folder on first read. The fix (re-applied
 * on Gary's yes, 2026-11-08 ~13:37 PST) reads the top level only
 * (depth 1) and lazy-loads on expand, so the startup load prompts
 * nothing.
 */
export function diagnoseStartupFileExplorerWalk(): string {
  return 'App startup (src/App.tsx init effect) → fileStore.setCurrentDir(home) → window.lucidAPI.fs.readDir → electron/ipc/fileSystem.ts fs:readDir, top level only (depth 1), lazy-load on expand — no recursive walk, no prompts at startup';
}

/** The mechanism behind the startup walk's prompts — recorded
 *  as the event's detail, not its why (the why is the code
 *  path; this is what the code path does to the OS). */
export function startupFileExplorerWalkDetail(): string {
  return 'Before the fix, the recursive walk read ~/Desktop, ~/Documents and ~/Downloads, so macOS showed one TCC prompt per protected folder the first time it was read — the three prompts on startup. The lazy-load fix (read top level only, expand on demand, commit 4dd778a) was re-applied on Gary\'s yes (2026-11-08 ~13:37 PST), so the startup load now prompts nothing — zero prompts on startup, one prompt only when the user explicitly opens a protected folder.';
}

export function diagnoseDirectoryRead(origin: 'startup' | 'user'): string {
  if (origin === 'startup') return diagnoseStartupFileExplorerWalk();
  return 'User opened a folder (Sidebar / Files screen → fileStore.setCurrentDir → window.lucidAPI.fs.readDir → electron/ipc/fileSystem.ts fs:readDir, top level only by default; deeper reads skip protected folders below the root)';
}

export type PermissionProbeOrigin = 'startup' | 'user-refresh' | 'after-request';

export function diagnosePermissionProbe(origin: PermissionProbeOrigin): string {
  switch (origin) {
    case 'startup':
      return 'Settings → Permissions opened: the tab probes on open (PermissionsTab effect → permissionsStore.refresh → permissions:getSnapshot → electron/services/permissions.ts probePermissions)';
    case 'user-refresh':
      return 'User hit Refresh in Settings → Permissions (PermissionsTab → permissionsStore.refresh → permissions:getSnapshot → electron/services/permissions.ts probePermissions)';
    case 'after-request':
      return 'Re-probe after a permission request (PermissionsTab requestPermission → permissionsStore.refresh → permissions:getSnapshot → electron/services/permissions.ts probePermissions)';
  }
}

/** WHY a permission prompt appeared: the user asked Lucid to
 *  ask. */
export function diagnosePermissionRequest(id: PermissionId): string {
  const label = permissionDef(id).label;
  return `User clicked Request for ${label} in Settings → Permissions (PermissionsTab → permissions:request → electron/services/permissions.ts requestPermission → systemPreferences.askForMediaAccess)`;
}

export function diagnosePermissionStateChange(
  id: PermissionId,
  from: PermissionStatus,
  to: PermissionStatus,
): string {
  const label = permissionDef(id).label;
  return `Probe re-ran and ${label} moved from ${from} to ${to} (permissionsStore.refresh → permissions:getSnapshot → electron/services/permissions.ts probePermissions)`;
}

/** WHY an OS folder-picker dialog opened: the callsite named
 *  it. `origin` is the human callsite label (e.g. 'Files screen
 *  — pick a workspace folder'). */
export function diagnoseDirectoryDialog(origin: string): string {
  return `${origin} (window.lucidAPI.fs.selectDirectory → electron/ipc/fileSystem.ts fs:selectDirectory → dialog.showOpenDialog)`;
}

/**
 * WHY a browser permission prompt appeared: a web page asked
 * for a capability — the user did NOT initiate this. The page
 * did. (The unexpected-ask archetype: an ask with a trigger
 * that is not the user.)
 */
export function diagnoseBrowserPermissionPrompt(origin: string, permission: string): string {
  return `A web page asked for ${permission} — the user did not initiate this; the page at ${origin} did (BrowserPanel onPermissionRequested → BrowserPermissionPrompt)`;
}

/**
 * WHY a browser sign-in prompt appeared: a web page asked for
 * credentials — the user did NOT initiate this. The page did.
 * Credentials are never logged — only that the prompt was
 * asked and answered.
 */
export function diagnoseBrowserAuthPrompt(host: string): string {
  return `A web page asked for sign-in credentials — the user did not initiate this; the page at ${host} did (BrowserPanel onAuthRequired → BrowserAuthPrompt). Credentials are never logged.`;
}
