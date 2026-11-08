// @vitest-environment node
/**
 * Event tracking + diagnosis tests (Gary, 2026-11-08 ~09:50 PST,
 * scope ~10:27 PST: "Now all the initial and throughout allow
 * tracking and why"). Lucid tracks WHEN every event happened and
 * diagnoses WHY — initial (startup) events and throughout
 * (ongoing) events alike.
 *
 * These tests pin the standard:
 * - A startup event carries a timestamp and a diagnosis naming
 *   the startup code path (the file-explorer walk behind the 3
 *   macOS TCC prompts).
 * - An ongoing event carries a timestamp and a diagnosis naming
 *   its trigger (a permission request, a folder picker, a page
 *   asking).
 * - An event whose cause cannot be determined records 'unknown'
 *   — never invented.
 * - The log is bounded (newest first, capped) so events cannot
 *   pile up without limit.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  appendEvent,
  createEvent,
  describeEvent,
  diagnoseBrowserAuthPrompt,
  diagnoseBrowserPermissionPrompt,
  diagnoseDirectoryDialog,
  diagnoseDirectoryRead,
  diagnosePermissionProbe,
  diagnosePermissionRequest,
  diagnosePermissionStateChange,
  diagnoseStartupFileExplorerWalk,
  eventOutcomeLabel,
  eventPhaseLabel,
  eventTypeLabel,
  EVENT_LOG_LIMIT,
  startupFileExplorerWalkDetail,
  UNKNOWN_CAUSE,
  type TrackedEvent,
} from '../src/lib/eventLog';

function event(overrides: Partial<TrackedEvent> = {}): TrackedEvent {
  return createEvent({
    phase: 'throughout',
    type: 'file.directory-read',
    what: 'Directory read (/tmp)',
    at: 1000,
    ...overrides,
  });
}

describe('createEvent — WHEN + WHY, honestly', () => {
  it('records a timestamp (WHEN) and a diagnosis (WHY)', () => {
    const e = createEvent({
      phase: 'initial',
      type: 'startup.file-explorer-walk',
      what: 'File explorer walked the home directory on startup (/Users/gary)',
      why: diagnoseStartupFileExplorerWalk(),
      outcome: 'completed',
      at: 1_700_000_000_000,
    });
    expect(e.at).toBe(1_700_000_000_000);
    expect(e.phase).toBe('initial');
    expect(e.type).toBe('startup.file-explorer-walk');
    expect(e.why).toContain('src/App.tsx');
    expect(e.id).toMatch(/^evt-1700000000000-\d+$/);
  });

  it('defaults an undeterminable cause to unknown — never invented (c)', () => {
    const e = createEvent({
      phase: 'throughout',
      type: 'unexpected-ask',
      what: 'Something asked for a folder',
    });
    expect(e.why).toBe(UNKNOWN_CAUSE);
    expect(e.why).toBe('unknown');
    expect(e.outcome).toBe('pending');
  });

  it('assigns a unique id per event', () => {
    const a = event({ at: 1000 });
    const b = event({ at: 1000 });
    expect(a.id).not.toBe(b.id);
  });

  it('defaults the timestamp to now when not given', () => {
    const before = Date.now();
    const e = createEvent({
      phase: 'throughout',
      type: 'permission.probe',
      what: 'Permission probe ran',
    });
    expect(e.at).toBeGreaterThanOrEqual(before);
    expect(e.at).toBeLessThanOrEqual(Date.now());
  });
});

describe('the startup load diagnosis (a) — the 3 TCC prompts, fixed', () => {
  it('names the startup code path: App init → setCurrentDir → fs:readDir, top level only', () => {
    const why = diagnoseStartupFileExplorerWalk();
    expect(why).toContain('src/App.tsx');
    expect(why).toContain('fileStore.setCurrentDir');
    expect(why).toContain('fs:readDir');
    expect(why).toContain('top level only');
    expect(why).toContain('depth 1');
    expect(why).toContain('no recursive walk');
    expect(why).toContain('no prompts at startup');
  });

  it('explains the mechanism: the old walk read the three protected folders; the fix prompts nothing on startup', () => {
    const detail = startupFileExplorerWalkDetail();
    expect(detail).toContain('~/Desktop');
    expect(detail).toContain('~/Documents');
    expect(detail).toContain('~/Downloads');
    expect(detail).toContain('one TCC prompt per protected folder');
    expect(detail).toContain('4dd778a');
    expect(detail).toContain('zero prompts on startup');
  });

  it('the user folder-read diagnosis names its own path, not the startup one', () => {
    const why = diagnoseDirectoryRead('user');
    expect(why).toContain('User opened a folder');
    expect(why).toContain('fileStore.setCurrentDir');
    expect(why).toContain('fs:readDir');
    expect(why).not.toContain('src/App.tsx');
  });
});

describe('the ongoing diagnoses (b) — each names its trigger', () => {
  it('a permission request is diagnosed as the user clicking Request', () => {
    const why = diagnosePermissionRequest('screen-recording');
    expect(why).toContain('User clicked Request');
    expect(why).toContain('Screen Recording');
    expect(why).toContain('PermissionsTab');
    expect(why).toContain('permissions:request');
    expect(why).toContain('askForMediaAccess');
  });

  it('a probe is diagnosed by its origin (startup open vs user Refresh vs after a request)', () => {
    expect(diagnosePermissionProbe('startup')).toContain('probes on open');
    expect(diagnosePermissionProbe('startup')).toContain('PermissionsTab');
    expect(diagnosePermissionProbe('user-refresh')).toContain('User hit Refresh');
    expect(diagnosePermissionProbe('after-request')).toContain('after a permission request');
  });

  it('a state change is diagnosed as the probe finding it, naming from → to', () => {
    const why = diagnosePermissionStateChange('microphone', 'not-determined', 'granted');
    expect(why).toContain('Microphone');
    expect(why).toContain('not-determined');
    expect(why).toContain('granted');
    expect(why).toContain('Probe re-ran');
  });

  it('a folder picker is diagnosed by its callsite', () => {
    const why = diagnoseDirectoryDialog('Files screen — pick a workspace folder');
    expect(why).toContain('Files screen — pick a workspace folder');
    expect(why).toContain('selectDirectory');
    expect(why).toContain('showOpenDialog');
  });

  it('a browser permission prompt is diagnosed as the page asking — not the user', () => {
    const why = diagnoseBrowserPermissionPrompt('https://example.com', 'notifications');
    expect(why).toContain('A web page asked for notifications');
    expect(why).toContain('the user did not initiate this');
    expect(why).toContain('https://example.com');
    expect(why).toContain('BrowserPanel');
  });

  it('a browser sign-in prompt is diagnosed as the page asking, and never logs credentials', () => {
    const why = diagnoseBrowserAuthPrompt('intranet.example.com');
    expect(why).toContain('A web page asked for sign-in credentials');
    expect(why).toContain('the user did not initiate this');
    expect(why).toContain('intranet.example.com');
    expect(why).toContain('Credentials are never logged');
  });
});

describe('appendEvent — bounded, newest first', () => {
  it('prepends the new event and caps the log at EVENT_LOG_LIMIT', () => {
    let events: TrackedEvent[] = [];
    for (let i = 0; i < EVENT_LOG_LIMIT + 5; i++) {
      events = appendEvent(events, event({ at: 1000 + i, what: `event ${i}` }));
    }
    expect(events).toHaveLength(EVENT_LOG_LIMIT);
    expect(events[0].what).toBe(`event ${EVENT_LOG_LIMIT + 4}`);
    expect(events[EVENT_LOG_LIMIT - 1].what).toBe('event 5');
  });

  it('does not mutate the input array', () => {
    const before = [event({ what: 'first' })];
    const after = appendEvent(before, event({ what: 'second' }));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[0].what).toBe('second');
  });
});

describe('labels + describeEvent', () => {
  it('labels every event type and phase', () => {
    expect(eventTypeLabel('startup.file-explorer-walk')).toBe('Startup file walk');
    expect(eventTypeLabel('unexpected-ask')).toBe('Unexpected ask');
    expect(eventTypeLabel('browser.permission-prompt')).toBe('Page asked for a capability');
    expect(eventPhaseLabel('initial')).toBe('Startup');
    expect(eventPhaseLabel('throughout')).toBe('During session');
    expect(eventOutcomeLabel('granted')).toBe('Granted');
    expect(eventOutcomeLabel('pending')).toBe('Pending');
    expect(eventOutcomeLabel('failed')).toBe('Failed');
  });

  it('describeEvent puts WHEN, WHAT, WHY and the outcome on one line', () => {
    const e = event({
      what: 'Directory read (/tmp)',
      why: 'User opened a folder (test)',
      outcome: 'completed',
      at: 1_700_000_000_000,
    });
    const line = describeEvent(e);
    expect(line).toContain('Directory read (/tmp)');
    expect(line).toContain('User opened a folder (test)');
    expect(line).toContain('completed');
  });
});
