// @vitest-environment jsdom
/**
 * Computer-control segment panel tests (Gary, 2026-11-06).
 *
 * The computer-control segment is pre-installed in the Segments
 * panel (Modules tab): no starship, no install step, no server.
 * The panel shows the segment lock (kill-switch), availability,
 * the observe → plan → act → read-back → decide loop, protected
 * targets, the agent-only gate note, and the action log. The
 * starship Segments stay gated on detection — the panel still
 * shows "No starship detected" until Gary settles the mechanism.
 *
 * Run with: npm test
 */
import { describe, it, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { SegmentsPanel } from '../src/components/Modules/SegmentsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import { usePermissionsStore } from '../src/stores/permissionsStore';
import type { ComputerControlSegmentState } from '../src/lib/computerControl';
import type { PermissionSnapshot } from '../src/lib/permissions';

const MOCK_PERMISSION_SNAPSHOT: PermissionSnapshot[] = [
  { id: 'accessibility', status: 'granted', detail: null, verified: true, checkedAt: 1 },
  { id: 'screen-recording', status: 'granted', detail: null, verified: true, checkedAt: 1 },
  { id: 'full-disk-access', status: 'granted', detail: null, verified: true, checkedAt: 1 },
  { id: 'microphone', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
  { id: 'camera', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
];

const renderSettings = (initialTab?: 'modules') =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      ...(initialTab ? { initialTab } : {}),
    }),
  );

const MOCK_SEGMENT_STATE: ComputerControlSegmentState = {
  locked: false,
  available: true,
  availabilityReason: null,
  targetId: 'Test App',
  sequence: 1,
  log: [
    {
      sequence: 1,
      at: 1,
      kind: 'click',
      targetId: 'Test App',
      direction: 'Gary: click the window',
      outcome: 'landed',
      verified: true,
      changed: true,
      reason: null,
    },
  ],
  faults: [],
  watchdogTrips: 0,
  protectedTargets: ['Next Starship Steps'],
};

describe('Computer-control segment in the Modules tab (SSR)', () => {
  it('shows the computer-control segment as pre-installed', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Computer control');
    expect(html).toContain('Pre-installed');
    expect(html).toContain('agent-only');
  });

  it('shows the lock switch, unlocked by default', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Unlocked');
    expect(html).toContain('Lock the computer-control segment');
  });

  it('explains the loop and the read-back rule', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Observe');
    expect(html).toContain('read back');
    expect(html).toContain('did not land');
  });

  it('shows the protected target (Gary’s ChatGPT tab)', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Next Starship Steps');
    expect(html).toContain('Protected targets');
  });

  it('states the agent-only gate as an open decision, not a decided one', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Agent-only');
    expect(html).toContain('not decided yet');
    expect(html).toContain('lucidAPI.computerControl');
  });

  it('still shows the no-starship-detected state — the starship Segments stay gated', () => {
    const html = renderSettings('modules');
    expect(html).toContain('No starship detected');
    expect(html).toContain('Starship segments');
  });
});

describe('Computer-control segment panel (interactive)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  const mockGetState = vi.fn(async () => MOCK_SEGMENT_STATE);
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
      computerControl: {
        getState: mockGetState,
        listApps: vi.fn(async () => []),
        observe: vi.fn(async () => null),
        action: vi.fn(async () => ({})),
      },
      permissions: {
        getSnapshot: vi.fn(async () => MOCK_PERMISSION_SNAPSHOT),
        request: vi.fn(async () => false),
        openSettings: vi.fn(async () => true),
      },
    };
    mockSet.mockClear();
    mockGetState.mockClear();
    usePermissionsStore.setState({ snapshot: null, lastCheckedAt: null, checking: false, error: null });
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        computerControlLocked: false,
        computerControlProtectedTargets: ['Next Starship Steps'],
        installedAddons: [],
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  test('the lock switch unlocks/locks and persists the setting', async () => {
    render(<SegmentsPanel />);
    const toggle = await screen.findByRole('switch', { name: /Lock the computer-control segment/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('computerControlLocked', true);
    });
  });

  test('the action log renders the read-back verdict', async () => {
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Recent actions');
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('#1 click');
      expect(document.body.textContent).toContain('landed');
      expect(document.body.textContent).toContain('verified');
      expect(document.body.textContent).toContain('screen changed');
    });
  });

  test('availability is shown from the central permission tracker, one permission at a time', async () => {
    // Gary, 2026-11-07 ~02:47 PST: the segment's availability line
    // reads from the central permission tracker (Settings →
    // Permissions), not from a second probe here — one source of
    // truth for what the user allows.
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Accessibility:');
      expect(document.body.textContent).toContain('Screen Recording:');
      expect(document.body.textContent).toContain('Granted');
      expect(document.body.textContent).toContain('See Settings → Permissions.');
    });
  });

  test('granted in the tracker but the driver capture fails: the segment does NOT send Gary to Settings to grant it (Gary, 2026-11-07 ~06:22 PST)', async () => {
    // REGRESSION: the tracker (TCC record) said Screen Recording is
    // granted — Gary saw it granted in System Settings — but the
    // driver's test capture still failed, so the driver reported
    // unavailable with "Screen Recording permission not granted —
    // grant Lucid access in System Settings". The old segment
    // printed that reason verbatim next to "Screen Recording:
    // Granted", sending Gary to Settings for a permission he had
    // already granted, every time he clicked Modules. A failed
    // capture does NOT prove the permission is missing. The tracker
    // is the source of truth for whether it is granted; when it
    // says granted, the segment shows the honest follow-on (restart
    // Lucid), never a demand to grant it.
    const win = window as unknown as {
      lucidAPI?: { permissions?: { getSnapshot: (force?: boolean) => Promise<PermissionSnapshot[]> } };
    };
    const captureFailingSnapshot: PermissionSnapshot[] = [
      { id: 'accessibility', status: 'granted', detail: null, verified: true, checkedAt: 1 },
      {
        id: 'screen-recording',
        status: 'granted',
        detail: 'System Settings shows Screen Recording as granted, but a test capture just failed — try restarting Lucid. Until a capture works, features that need it will refuse.',
        verified: false,
        checkedAt: 1,
      },
      { id: 'full-disk-access', status: 'denied', detail: null, verified: true, checkedAt: 1 },
      { id: 'microphone', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
      { id: 'camera', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
    ];
    if (win.lucidAPI?.permissions) {
      win.lucidAPI.permissions.getSnapshot = async () => captureFailingSnapshot;
    }
    mockGetState.mockResolvedValue({
      ...MOCK_SEGMENT_STATE,
      available: false,
      availabilityReason: 'Screen Recording permission not granted — grant Lucid access in System Settings → Privacy & Security → Screen Recording',
    });
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Screen Recording:');
      expect(document.body.textContent).toContain('Granted');
    });
    await waitFor(() => {
      // The honest follow-on: restart, not grant.
      expect(document.body.textContent).toContain('restart');
      // The driver's misleading demand must NOT appear.
      expect(document.body.textContent).not.toContain('grant Lucid access');
    });
  });

  test('genuinely not granted in the tracker: the segment DOES say how to grant it', async () => {
    // Guard test — the fix above must not over-correct: when the
    // tracker agrees the permission is actually missing, the demand
    // to grant it still appears.
    const win = window as unknown as {
      lucidAPI?: { permissions?: { getSnapshot: (force?: boolean) => Promise<PermissionSnapshot[]> } };
    };
    const deniedSnapshot: PermissionSnapshot[] = [
      { id: 'accessibility', status: 'granted', detail: null, verified: true, checkedAt: 1 },
      { id: 'screen-recording', status: 'denied', detail: null, verified: true, checkedAt: 1 },
      { id: 'full-disk-access', status: 'denied', detail: null, verified: true, checkedAt: 1 },
      { id: 'microphone', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
      { id: 'camera', status: 'not-determined', detail: null, verified: false, checkedAt: 1 },
    ];
    if (win.lucidAPI?.permissions) {
      win.lucidAPI.permissions.getSnapshot = async () => deniedSnapshot;
    }
    mockGetState.mockResolvedValue({
      ...MOCK_SEGMENT_STATE,
      available: false,
      availabilityReason: 'Screen Recording permission not granted — grant Lucid access in System Settings → Privacy & Security → Screen Recording',
    });
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('grant Lucid access');
    });
  });
});
