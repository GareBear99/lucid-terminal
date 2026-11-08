// @vitest-environment jsdom
/**
 * Event log panel tests (Gary, 2026-11-08 ~09:50 PST, scope
 * ~10:27 PST: "Now all the initial and throughout allow
 * tracking and why"). The Permissions tab shows the event log
 * below the permissions: WHEN every event happened and WHY —
 * startup events and session events alike, with the cause
 * recorded as 'unknown' when it cannot be determined.
 *
 * Client-rendered (like the existing interactive Permissions
 * tab tests) with window.lucidAPI mocked — the store's live
 * state is what renders, so pre-populated events show up.
 * Note the tab's own open effect probes on mount and logs a
 * startup probe event of its own, so phase badges are asserted
 * with findAllByText and event rows are scoped by data-event.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionsTab } from '../src/components/Settings/PermissionsTab';
import { useEventLogStore } from '../src/stores/eventLogStore';
import { usePermissionsStore } from '../src/stores/permissionsStore';
import { createEvent } from '../src/lib/eventLog';
import type { PermissionSnapshot } from '../src/lib/permissions';

const MOCK_SNAPSHOT: PermissionSnapshot[] = [
  { id: 'accessibility', status: 'denied', detail: 'Accessibility permission not granted.', verified: true, checkedAt: 1000 },
  { id: 'screen-recording', status: 'granted', detail: null, verified: true, checkedAt: 1000 },
  { id: 'full-disk-access', status: 'denied', detail: 'Full Disk Access is not granted.', verified: true, checkedAt: 1000 },
  { id: 'microphone', status: 'not-determined', detail: null, verified: false, checkedAt: 1000 },
  { id: 'camera', status: 'not-determined', detail: null, verified: false, checkedAt: 1000 },
];

describe('the Permissions tab shows the event log', () => {
  const mockGetSnapshot = vi.fn(async (_force?: boolean) => MOCK_SNAPSHOT);
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      permissions: {
        getSnapshot: mockGetSnapshot,
        request: vi.fn(async () => false),
        openSettings: vi.fn(async () => true),
      },
    };
    mockGetSnapshot.mockClear();
    mockSet.mockClear();
    usePermissionsStore.setState({ snapshot: null, lastCheckedAt: null, checking: false, error: null });
    // Clear resets the log AND the ring (anything in flight).
    useEventLogStore.getState().clear();
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    useEventLogStore.getState().clear();
  });

  it('shows the empty state when no events have been recorded', () => {
    // The probe never resolves here, so the open effect logs
    // nothing and the log stays empty for the whole test.
    mockGetSnapshot.mockImplementationOnce(() => new Promise<PermissionSnapshot[]>(() => {}));
    render(<PermissionsTab />);
    expect(screen.getByText('Event log — when Lucid asked, and why')).toBeTruthy();
    expect(screen.getByText(/No events yet\./)).toBeTruthy();
  });

  it('shows a startup event with its time, phase, what and why', async () => {
    useEventLogStore.setState({
      events: [
        createEvent({
          phase: 'initial',
          type: 'startup.file-explorer-walk',
          what: 'File explorer walked the home directory on startup (/Users/gary)',
          why: 'App startup (src/App.tsx init effect) → fileStore.setCurrentDir(home) → fs:readDir',
          outcome: 'completed',
          detail: 'The recursive walk reads ~/Desktop, ~/Documents and ~/Downloads.',
          at: 1_700_000_000_000,
        }),
      ],
    });
    const { container } = render(<PermissionsTab />);
    expect(await screen.findByText('Startup file walk')).toBeTruthy();
    // The tab's own startup probe also logs a 'Startup' badge,
    // so the phase badge is asserted as "at least one".
    expect(await screen.findAllByText('Startup')).toBeTruthy();
    const row = container.querySelector('[data-event="startup.file-explorer-walk"]');
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain('File explorer walked the home directory on startup');
    expect(row!.textContent).toContain('src/App.tsx');
    expect(row!.textContent).toContain('~/Desktop');
    expect(screen.getByText('Clear log')).toBeTruthy();
  });

  it('shows a session event with its trigger as the why, and unknown stays unknown', async () => {
    // Newest first: the unexpected ask (later) is stored first.
    useEventLogStore.setState({
      events: [
        createEvent({
          phase: 'throughout',
          type: 'unexpected-ask',
          what: 'A prompt appeared with no known trigger',
          outcome: 'unknown',
          at: 1_700_000_002_000,
        }),
        createEvent({
          phase: 'throughout',
          type: 'permission.prompt',
          what: 'Lucid asked for a permission (microphone)',
          why: 'User clicked Request for Microphone in Settings → Permissions',
          outcome: 'granted',
          at: 1_700_000_001_000,
        }),
      ],
    });
    const { container } = render(<PermissionsTab />);
    expect(await screen.findByText('Permission prompt')).toBeTruthy();
    expect(await screen.findAllByText('During session')).toBeTruthy();
    const promptRow = container.querySelector('[data-event="permission.prompt"]');
    expect(promptRow).toBeTruthy();
    expect(promptRow!.textContent).toContain('User clicked Request for Microphone');
    const unknownRow = container.querySelector('[data-event="unexpected-ask"]');
    expect(unknownRow).toBeTruthy();
    expect(unknownRow!.textContent).toContain('Unexpected ask');
    // The undeterminable cause reads 'unknown' — never invented.
    expect(unknownRow!.textContent).toContain('unknown');
    // Newest first: the unexpected ask (later) comes before the prompt.
    // (The tab's own startup probe logs asynchronously and prepends,
    // so only the relative order of these two is asserted.)
    const rows = Array.from(container.querySelectorAll('[data-event]')).map((r) =>
      r.getAttribute('data-event'),
    );
    expect(rows.indexOf('unexpected-ask')).toBeLessThan(rows.indexOf('permission.prompt'));
  });
});
