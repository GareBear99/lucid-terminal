// @vitest-environment node
/**
 * Event log store tests (Gary, 2026-11-08 ~09:50 PST, scope
 * ~10:27 PST: "Now all the initial and throughout allow
 * tracking and why"; SPSC ~10:47 PST: "spsc the event log and
 * startup"). The store is the live record: every event it logs
 * carries WHEN (a timestamp) and WHY (a diagnosis), for
 * initial (startup) events and throughout (ongoing) events
 * alike — and an undeterminable cause is recorded as 'unknown',
 * never invented.
 *
 * SPSC: every event travels through ONE bounded ring
 * (src/lib/spscRing.ts) from its source to this store. The
 * store drains the ring into the visible log. Tests call
 * drain() after logging so the event is visible right now
 * (in the app the drain runs on a microtask after enqueue).
 *
 * These tests pin:
 * - The log is BOUNDED: a producer cannot pile events up past
 *   the ring's capacity (backpressure refuses, counted).
 * - A startup event flows through the SAME SPSC log as every
 *   other event, with its timestamp + diagnosis.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventRing, useEventLogStore } from '../src/stores/eventLogStore';
import { EVENT_LOG_LIMIT, EVENT_RING_CAPACITY, createEvent } from '../src/lib/eventLog';
import type { TrackedEvent } from '../src/lib/eventLog';

/** The log actions return the event, or null on backpressure.
 *  These tests log at human rates, so the ring always accepts
 *  — assert that, then unwrap. */
function must(e: TrackedEvent | null): TrackedEvent {
  expect(e).not.toBeNull();
  return e as TrackedEvent;
}

/** Flush the ring into the visible log, right now. */
function drain() {
  useEventLogStore.getState().drain();
}

beforeEach(() => {
  // Clear discards anything in flight in the ring, empties
  // the log and resets the refusal count.
  useEventLogStore.getState().clear();
});

afterEach(() => {
  useEventLogStore.getState().clear();
});

describe('the store logs startup events as initial (a)', () => {
  it('the startup file-explorer walk is an initial event with a timestamp + the startup diagnosis', () => {
    const before = Date.now();
    const e = must(
      useEventLogStore.getState().logStartupFileExplorerWalk('/Users/gary', 'completed'),
    );
    expect(e.at).toBeGreaterThanOrEqual(before);
    expect(e.phase).toBe('initial');
    expect(e.type).toBe('startup.file-explorer-walk');
    expect(e.what).toContain('/Users/gary');
    expect(e.why).toContain('src/App.tsx');
    expect(e.why).toContain('fileStore.setCurrentDir');
    expect(e.why).toContain('fs:readDir');
    expect(e.outcome).toBe('completed');
    expect(e.detail).toContain('~/Desktop');
    expect(e.detail).toContain('~/Documents');
    expect(e.detail).toContain('~/Downloads');
    // It is not in the visible log until the ring drains.
    expect(useEventLogStore.getState().events).toHaveLength(0);
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a failed startup walk is recorded as failed, with the error as detail', () => {
    const e = must(
      useEventLogStore.getState().logStartupFileExplorerWalk('/Users/gary', 'failed', 'ENOENT: no such file'),
    );
    expect(e.phase).toBe('initial');
    expect(e.outcome).toBe('failed');
    expect(e.detail).toBe('ENOENT: no such file');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a startup permission probe is an initial event', () => {
    const e = must(useEventLogStore.getState().logPermissionProbe('startup', 'completed'));
    expect(e.phase).toBe('initial');
    expect(e.type).toBe('startup.permission-probe');
    expect(e.why).toContain('probes on open');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });
});

describe('a startup event flows through the SAME SPSC log', () => {
  it('initial and throughout events share one bounded channel, in FIFO order', () => {
    // A startup event and a session event, logged in that order.
    const startup = must(
      useEventLogStore.getState().logStartupFileExplorerWalk('/Users/gary', 'completed'),
    );
    const session = must(
      useEventLogStore.getState().logDirectoryRead('/tmp/work', 'completed'),
    );
    // Both are in flight in the same ring — nothing in the
    // visible log yet, both in the one channel.
    expect(eventRing.length).toBe(2);
    expect(useEventLogStore.getState().events).toHaveLength(0);
    drain();
    // The ring is empty and both events landed, newest first,
    // the startup one with its timestamp + diagnosis intact.
    expect(eventRing.length).toBe(0);
    const events = useEventLogStore.getState().events;
    expect(events).toHaveLength(2);
    expect(events[0]).toBe(session);
    expect(events[1]).toBe(startup);
    expect(events[1].phase).toBe('initial');
    expect(events[1].at).toBeGreaterThan(0);
    expect(events[1].why).toContain('src/App.tsx');
  });
});

describe('the store logs ongoing events as throughout (b)', () => {
  it('a directory read is a throughout event naming the user trigger', () => {
    const e = must(useEventLogStore.getState().logDirectoryRead('/tmp/work', 'completed'));
    expect(e.phase).toBe('throughout');
    expect(e.type).toBe('file.directory-read');
    expect(e.why).toContain('User opened a folder');
    expect(e.what).toContain('/tmp/work');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a user Refresh probe is a throughout event', () => {
    const e = must(useEventLogStore.getState().logPermissionProbe('user-refresh', 'completed'));
    expect(e.phase).toBe('throughout');
    expect(e.type).toBe('permission.probe');
    expect(e.why).toContain('User hit Refresh');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a permission request is a throughout prompt event with the answer as outcome', () => {
    const granted = must(useEventLogStore.getState().logPermissionRequest('microphone', 'granted'));
    expect(granted.phase).toBe('throughout');
    expect(granted.type).toBe('permission.prompt');
    expect(granted.why).toContain('User clicked Request');
    expect(granted.why).toContain('Microphone');
    expect(granted.outcome).toBe('granted');

    const denied = must(useEventLogStore.getState().logPermissionRequest('camera', 'denied'));
    expect(denied.outcome).toBe('denied');
    expect(denied.why).toContain('Camera');
    drain();
    expect(useEventLogStore.getState().events).toHaveLength(2);
  });

  it('a state change names the permission and the from → to move', () => {
    const e = must(
      useEventLogStore.getState().logPermissionStateChange('screen-recording', 'denied', 'granted'),
    );
    expect(e.type).toBe('permission.state-change');
    expect(e.phase).toBe('throughout');
    expect(e.why).toContain('Screen Recording');
    expect(e.why).toContain('denied');
    expect(e.why).toContain('granted');
    expect(e.outcome).toBe('granted');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a folder picker is a throughout event naming its callsite', () => {
    const e = must(
      useEventLogStore
        .getState()
        .logDirectoryDialog('Files screen — pick a workspace folder', 'cancelled'),
    );
    expect(e.phase).toBe('throughout');
    expect(e.type).toBe('file.directory-dialog');
    expect(e.why).toContain('Files screen — pick a workspace folder');
    expect(e.outcome).toBe('cancelled');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a page asking for a capability is pending on arrival, then granted/denied on answer', () => {
    const asked = must(
      useEventLogStore
        .getState()
        .logBrowserPermissionPrompt('https://example.com', 'notifications', 'pending'),
    );
    expect(asked.phase).toBe('throughout');
    expect(asked.type).toBe('browser.permission-prompt');
    expect(asked.why).toContain('the user did not initiate this');
    expect(asked.outcome).toBe('pending');

    const answered = must(
      useEventLogStore
        .getState()
        .logBrowserPermissionPrompt('https://example.com', 'notifications', 'granted', 'once'),
    );
    expect(answered.what).toContain('Allow once');
    expect(answered.outcome).toBe('granted');

    const refused = must(
      useEventLogStore
        .getState()
        .logBrowserPermissionPrompt('https://example.com', 'notifications', 'denied', 'deny'),
    );
    expect(refused.what).toContain('Deny');
    expect(refused.outcome).toBe('denied');
    drain();
    expect(useEventLogStore.getState().events).toHaveLength(3);
  });

  it('a page asking for sign-in records the answer, never the credentials', () => {
    const asked = must(useEventLogStore.getState().logBrowserAuthPrompt('intranet.example.com', 'pending'));
    expect(asked.type).toBe('browser.auth-prompt');
    expect(asked.why).toContain('Credentials are never logged');

    const sent = must(
      useEventLogStore
        .getState()
        .logBrowserAuthPrompt('intranet.example.com', 'completed', 'submitted'),
    );
    expect(sent.what).toContain('credentials sent');
    expect(sent.what).not.toContain('password');
    expect(sent.why).not.toContain('password');

    const cancelled = must(
      useEventLogStore
        .getState()
        .logBrowserAuthPrompt('intranet.example.com', 'dismissed', 'cancelled'),
    );
    expect(cancelled.what).toContain('cancelled');
    expect(cancelled.outcome).toBe('dismissed');
    drain();
    expect(useEventLogStore.getState().events).toHaveLength(3);
  });
});

describe('unknown is honest, never invented (c)', () => {
  it('an unexpected ask records why as unknown', () => {
    const e = must(useEventLogStore.getState().logUnexpectedAsk('Something asked for a folder'));
    expect(e.type).toBe('unexpected-ask');
    expect(e.why).toBe('unknown');
    expect(e.outcome).toBe('unknown');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });

  it('a bare log() with no why records unknown', () => {
    const e = must(
      useEventLogStore.getState().log({
        phase: 'throughout',
        type: 'unexpected-ask',
        what: 'A prompt appeared with no known trigger',
      }),
    );
    expect(e.why).toBe('unknown');
    drain();
    expect(useEventLogStore.getState().events[0]).toBe(e);
  });
});

describe('the log is bounded — a producer cannot pile events up', () => {
  it('the ring refuses past EVENT_RING_CAPACITY and the refusal is counted, not silent', () => {
    // Fill the one shared ring to capacity WITHOUT draining
    // (enqueue directly — the store would schedule a drain,
    // so the fill goes through the ring itself).
    for (let i = 0; i < EVENT_RING_CAPACITY; i++) {
      expect(
        eventRing.enqueue(
          createEvent({
            phase: 'throughout',
            type: 'file.directory-read',
            what: `fill ${i}`,
            at: 1000 + i,
          }),
        ),
      ).toBe(true);
    }
    expect(eventRing.length).toBe(EVENT_RING_CAPACITY);
    expect(eventRing.isFull).toBe(true);
    // The next event — through the store's log — is REFUSED.
    const refused = useEventLogStore.getState().logDirectoryRead('/tmp/overflow', 'completed');
    expect(refused).toBeNull();
    expect(useEventLogStore.getState().refusedCount).toBe(1);
    expect(eventRing.length).toBe(EVENT_RING_CAPACITY);
    // Still refused — the bound holds no matter how often
    // the producer tries.
    expect(useEventLogStore.getState().logDirectoryRead('/tmp/overflow-2', 'completed')).toBeNull();
    expect(useEventLogStore.getState().refusedCount).toBe(2);
    // The refused events never reached the visible log.
    drain();
    const events = useEventLogStore.getState().events;
    expect(events.find((e) => e.what.includes('overflow'))).toBeUndefined();
  });

  it('the visible log caps at EVENT_LOG_LIMIT, newest first', () => {
    const log = useEventLogStore.getState();
    for (let i = 0; i < EVENT_LOG_LIMIT + 5; i++) {
      log.logDirectoryRead(`/tmp/dir-${i}`, 'completed');
    }
    drain();
    const events = useEventLogStore.getState().events;
    expect(events).toHaveLength(EVENT_LOG_LIMIT);
    expect(events[0].what).toContain(`dir-${EVENT_LOG_LIMIT + 4}`);
  });

  it('clear() empties the log, the ring and the refusal count', () => {
    useEventLogStore.getState().logDirectoryRead('/tmp', 'completed');
    drain();
    expect(useEventLogStore.getState().events).toHaveLength(1);
    useEventLogStore.getState().clear();
    expect(useEventLogStore.getState().events).toHaveLength(0);
    expect(eventRing.length).toBe(0);
    expect(useEventLogStore.getState().refusedCount).toBe(0);
  });
});
