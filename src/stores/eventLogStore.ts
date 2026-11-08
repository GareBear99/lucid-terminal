/**
 * Event log store — the live record of WHEN every event happened
 * and WHY (Gary, 2026-11-08 ~09:50 PST, scope ~10:27 PST:
 * "For lucid so should be tracking all that and diagnosing as
 * its important to be like you to know when and why" — "Now all
 * the initial and throughout allow tracking and why").
 *
 * SPSC (Gary, 2026-11-08 ~10:47 PST: "spsc the event log and
 * startup"): every event — initial (startup) AND throughout —
 * travels through ONE bounded SPSC ring (src/lib/spscRing.ts,
 * same discipline as module 1, ARC-SeedCatalog commit 8b776fa)
 * from its source (the producer) to this store (the consumer).
 * The ring is the channel; the `events` array below is the
 * consumed log. Both are bounded: the ring holds at most
 * EVENT_RING_CAPACITY events in flight, the visible log at
 * most EVENT_LOG_LIMIT. A runaway producer cannot pile events
 * up — the ring refuses past capacity (backpressure), the
 * refusal is COUNTED (`refusedCount`, shown in the UI) and the
 * caller is told (log returns null), never dropped silently.
 *
 * The consumer drains on a microtask after each enqueue, so
 * events genuinely transit the ring (there is a real in-flight
 * window, bounded by capacity) instead of being appended
 * inline. `drain()` is also exposed so tests — and any caller
 * that needs the event visible right now — can flush the ring
 * synchronously. The startup events go through this SAME ring,
 * not a separate path: the 3 TCC prompts, the file-explorer
 * walk and the other initialization steps are all events in
 * the one bounded channel, with timestamp (when) + diagnosis
 * (why).
 *
 * The log PERSISTS (localStorage, capped at EVENT_LOG_LIMIT) so
 * it survives a restart — the startup events are only useful if
 * they are still there to read after Lucid restarts and asks
 * again. Persistence is best-effort and guarded: if storage is
 * unavailable the in-memory log still works, and a corrupt
 * stored value is dropped, never trusted.
 *
 * The store never invents a cause: every convenience action
 * builds its diagnosis from src/lib/eventLog.ts, and a bare
 * log() call with no `why` records 'unknown'.
 */
import { create } from 'zustand';
import {
  appendEvent,
  createEvent,
  diagnoseBrowserAuthPrompt,
  diagnoseBrowserPermissionPrompt,
  diagnoseDirectoryDialog,
  diagnoseDirectoryRead,
  diagnosePermissionProbe,
  diagnosePermissionRequest,
  diagnosePermissionStateChange,
  diagnoseStartupFileExplorerWalk,
  startupFileExplorerWalkDetail,
  EVENT_LOG_LIMIT,
  EVENT_LOG_STORAGE_KEY,
  EVENT_RING_CAPACITY,
  type EventOutcome,
  type PermissionProbeOrigin,
  type TrackedEvent,
} from '../lib/eventLog';
import { SpscRing } from '../lib/spscRing';
import type { PermissionId, PermissionStatus } from '../lib/permissions';

/**
 * THE channel — one bounded SPSC ring for every event, initial
 * and throughout. Module-level (one event log, one ring), so
 * tests can observe it directly (its length / capacity) and
 * the store's drain is the single consumer. Exported for
 * tests; production code goes through the store actions.
 */
export const eventRing = new SpscRing<TrackedEvent>(EVENT_RING_CAPACITY);

/** Read the persisted log, or [] when there is none / it is
 *  corrupt / storage is unavailable. Never throws. */
function readPersisted(): TrackedEvent[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(EVENT_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is TrackedEvent =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as TrackedEvent).id === 'string' &&
        typeof (e as TrackedEvent).at === 'number' &&
        typeof (e as TrackedEvent).what === 'string' &&
        typeof (e as TrackedEvent).why === 'string',
    ).slice(0, EVENT_LOG_LIMIT);
  } catch {
    return [];
  }
}

/** Persist the log. Best-effort: never throws, so a full or
 *  unavailable storage never breaks logging. */
function persist(events: TrackedEvent[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Storage full or unavailable — the in-memory log still works.
  }
}

export interface EventLogInput {
  phase: TrackedEvent['phase'];
  type: TrackedEvent['type'];
  what: string;
  why?: string;
  outcome?: EventOutcome;
  detail?: string | null;
  at?: number;
}

interface EventLogState {
  /** Newest first, capped at EVENT_LOG_LIMIT. */
  events: TrackedEvent[];
  /** Events refused by ring backpressure (ring full). Counted
   *  and shown in the UI — a refusal is visible, never silent. */
  refusedCount: number;

  /**
   * Record an event: build it, offer it to the ring, and
   * schedule the consumer drain. Returns the event when the
   * ring accepted it, or null on backpressure (ring full —
   * the event was refused, `refusedCount` went up, nothing
   * was dropped silently).
   */
  log: (input: EventLogInput) => TrackedEvent | null;
  /** Consumer: move every event in the ring into the log
   * (FIFO, newest first, capped) and persist. Runs on a
   * microtask after each enqueue; call it directly when the
   * event must be visible right now (tests do). */
  drain: () => void;
  /** Startup: the file explorer walked the home directory. */
  logStartupFileExplorerWalk: (
    dir: string,
    outcome: EventOutcome,
    detail?: string | null,
  ) => TrackedEvent | null;
  /** During the session: a directory was read. */
  logDirectoryRead: (
    dir: string,
    outcome: EventOutcome,
    detail?: string | null,
  ) => TrackedEvent | null;
  /** A permission probe ran (startup or during the session). */
  logPermissionProbe: (
    origin: PermissionProbeOrigin,
    outcome: EventOutcome,
    detail?: string | null,
  ) => TrackedEvent | null;
  /** Lucid prompted for a permission (user asked it to ask). */
  logPermissionRequest: (
    id: PermissionId,
    outcome: EventOutcome,
    detail?: string | null,
  ) => TrackedEvent | null;
  /** A permission's state changed between probes. */
  logPermissionStateChange: (
    id: PermissionId,
    from: PermissionStatus,
    to: PermissionStatus,
  ) => TrackedEvent | null;
  /** An OS folder-picker dialog opened. */
  logDirectoryDialog: (
    origin: string,
    outcome: EventOutcome,
    detail?: string | null,
  ) => TrackedEvent | null;
  /** A web page asked for a capability (or answered one). */
  logBrowserPermissionPrompt: (
    origin: string,
    permission: string,
    outcome: EventOutcome,
    answered?: 'once' | 'always' | 'deny',
  ) => TrackedEvent | null;
  /** A web page asked for sign-in (or it was answered). */
  logBrowserAuthPrompt: (
    host: string,
    outcome: EventOutcome,
    answered?: 'submitted' | 'cancelled',
  ) => TrackedEvent | null;
  /** An ask with no attributable trigger — cause 'unknown'. */
  logUnexpectedAsk: (what: string, detail?: string | null) => TrackedEvent | null;
  /** Empty the log (and its persisted copy) and discard any
   *  events still in flight in the ring. An explicit user
   *  action — the discard is the clear itself, not silent. */
  clear: () => void;
}

export const useEventLogStore = create<EventLogState>((set, get) => {
  let drainScheduled = false;

  /** Schedule the consumer drain on a microtask (once per
   *  burst — many enqueues in one synchronous block drain
   *  together). Falls back to setTimeout where queueMicrotask
   *  is unavailable. */
  const scheduleDrain = () => {
    if (drainScheduled) return;
    drainScheduled = true;
    const run = () => {
      drainScheduled = false;
      get().drain();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else setTimeout(run, 0);
  };

  /** Producer: offer one event to the ring. Returns the event
   *  when accepted, or null on backpressure (ring full). */
  const enqueueEvent = (event: TrackedEvent): TrackedEvent | null => {
    if (!eventRing.enqueue(event)) {
      // Backpressure: do NOT drop silently. Count it (the UI
      // shows refusedCount) and tell the caller with null.
      set((s) => ({ refusedCount: s.refusedCount + 1 }));
      return null;
    }
    scheduleDrain();
    return event;
  };

  return {
    events: readPersisted(),
    refusedCount: 0,

    log: (input) => enqueueEvent(createEvent(input)),

    drain: () => {
      const drained = eventRing.drain();
      if (drained.length === 0) return;
      // Drained FIFO (oldest first); the log is newest first,
      // so prepend each drained event in FIFO order — the
      // newest drained ends up at index 0.
      let events = get().events;
      for (let i = 0; i < drained.length; i++) {
        events = appendEvent(events, drained[i]);
      }
      persist(events);
      set({ events });
    },

    logStartupFileExplorerWalk: (dir, outcome, detail) =>
      enqueueEvent(
        createEvent({
          phase: 'initial',
          type: 'startup.file-explorer-walk',
          what: `File explorer walked the home directory on startup (${dir})`,
          why: diagnoseStartupFileExplorerWalk(),
          outcome,
          detail: detail ?? startupFileExplorerWalkDetail(),
        }),
      ),

    logDirectoryRead: (dir, outcome, detail) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'file.directory-read',
          what: `Directory read (${dir})`,
          why: diagnoseDirectoryRead('user'),
          outcome,
          detail: detail ?? null,
        }),
      ),

    logPermissionProbe: (origin, outcome, detail) =>
      enqueueEvent(
        createEvent({
          phase: origin === 'startup' ? 'initial' : 'throughout',
          type: origin === 'startup' ? 'startup.permission-probe' : 'permission.probe',
          what:
            origin === 'startup'
              ? 'Permission probe ran on startup'
              : origin === 'after-request'
                ? 'Permission probe re-ran after a request'
                : 'Permission probe ran',
          why: diagnosePermissionProbe(origin),
          outcome,
          detail: detail ?? null,
        }),
      ),

    logPermissionRequest: (id, outcome, detail) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'permission.prompt',
          what: `Lucid asked for a permission (${id})`,
          why: diagnosePermissionRequest(id),
          outcome,
          detail: detail ?? null,
        }),
      ),

    logPermissionStateChange: (id, from, to) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'permission.state-change',
          what: `Permission state changed (${id}: ${from} → ${to})`,
          why: diagnosePermissionStateChange(id, from, to),
          outcome: to === 'granted' ? 'granted' : to === 'denied' ? 'denied' : 'unknown',
          detail: null,
        }),
      ),

    logDirectoryDialog: (origin, outcome, detail) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'file.directory-dialog',
          what: `Folder picker opened (${origin})`,
          why: diagnoseDirectoryDialog(origin),
          outcome,
          detail: detail ?? null,
        }),
      ),

    logBrowserPermissionPrompt: (origin, permission, outcome, answered) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'browser.permission-prompt',
          what:
            answered === undefined
              ? `${origin} asked for ${permission} access`
              : `${origin} asked for ${permission} access — answered: ${
                  answered === 'once'
                    ? 'Allow once'
                    : answered === 'always'
                      ? 'Allow always'
                      : 'Deny'
                }`,
          why: diagnoseBrowserPermissionPrompt(origin, permission),
          outcome,
          detail: null,
        }),
      ),

    logBrowserAuthPrompt: (host, outcome, answered) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'browser.auth-prompt',
          what:
            answered === undefined
              ? `A page asked for sign-in (${host})`
              : answered === 'submitted'
                ? `Sign-in asked for ${host} — answered: credentials sent`
                : `Sign-in asked for ${host} — answered: cancelled`,
          why: diagnoseBrowserAuthPrompt(host),
          outcome,
          detail: null,
        }),
      ),

    logUnexpectedAsk: (what, detail) =>
      enqueueEvent(
        createEvent({
          phase: 'throughout',
          type: 'unexpected-ask',
          what,
          // No why given on purpose — createEvent records
          // 'unknown' rather than inventing a cause.
          outcome: 'unknown',
          detail: detail ?? null,
        }),
      ),

    clear: () => {
      // Discard anything still in flight in the ring — the
      // user cleared the log, so the in-flight events go too.
      eventRing.drain();
      persist([]);
      set({ events: [], refusedCount: 0 });
    },
  };
});
