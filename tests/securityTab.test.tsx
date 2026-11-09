// @vitest-environment jsdom
/**
 * Security tab tests (Gary, 2026-11-09 ~14:51–14:52 PST).
 *
 * Settings > Security is the general, platform-wide tab where
 * all the security stuff is checked in one place: the snapshot,
 * the Living Golem, starship detection, the ping key, SP, the
 * free-tier allowances, the permissions and denials, and the
 * security events as they happened in the ring.
 *
 * Covers: no snapshot installed (no model trained yet — said
 * honestly, never invented); Living Golem locked; starship not
 * detected (the mechanism is open — never faked); ping key not
 * set (value never shown); SP not checked yet; the allowances
 * show the free-tier caps with usage honestly "not tracked";
 * permissions not checked yet (probe lives in the Permissions
 * tab); dismissed snapshot versions listed with a "Show snapshot
 * alerts again" button that clears them; snapshot ring events
 * (detected → download → hash verified → flipped) land in the
 * tab's event list (newest first, like the Permissions log;
 * the ring itself holds them in causal FIFO order); the ring's
 * refused count shows when the channel was full.
 *
 * Run with: npx vitest run tests/securityTab.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecurityTab } from '../src/components/Settings/SecurityTab';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useEventLogStore } from '../src/stores/eventLogStore';
import { usePermissionsStore } from '../src/stores/permissionsStore';

function installLucidApiMock() {
  const win = window as unknown as Record<string, unknown>;
  const prev = win.lucidAPI;
  win.lucidAPI = {
    settings: {
      set: vi.fn(async () => undefined),
      getAll: async () => ({}),
    },
    ai: {
      pingServerStatus: pingServerStatusMock,
    },
  };
  return () => {
    win.lucidAPI = prev;
  };
}

/** The server pull the tab makes on open / refresh (GET /).
 *  Healthy by default; individual tests override it once. */
const pingServerStatusMock = vi.fn(async () => ({
  ok: true,
  service: 'lucid-ping',
  version: '1.0.0',
  model: '@cf/meta/llama-3.2-1b-instruct',
  mode: 'ping',
  maintenance: null,
  server_caps: { neurons_per_day: 10000, requests_per_day: 100000, maintenance_hours: 24 },
}));

describe('SecurityTab', () => {
  let restoreLucidApi: () => void;
  let initialSettings: ReturnType<typeof useSettingsStore.getState>['settings'];

  beforeEach(() => {
    restoreLucidApi = installLucidApiMock();
    pingServerStatusMock.mockClear();
    initialSettings = useSettingsStore.getState().settings;
    useEventLogStore.getState().clear();
    useAIStore.setState({ pingQuota: null, pingQuotaSource: null });
    usePermissionsStore.setState({ snapshot: null, lastCheckedAt: null });
  });

  afterEach(() => {
    restoreLucidApi();
    useSettingsStore.setState({ settings: initialSettings });
    useEventLogStore.getState().clear();
    useAIStore.setState({ pingQuota: null, pingQuotaSource: null });
    usePermissionsStore.setState({ snapshot: null, lastCheckedAt: null });
    vi.restoreAllMocks();
  });

  test('says no snapshot is installed — no model trained yet, never invented', () => {
    render(<SecurityTab />);
    expect(screen.getByText(/No snapshot installed — no model trained yet/)).toBeTruthy();
    expect(screen.getByText(/Not checked yet — the manifest is checked on pull/)).toBeTruthy();
  });

  test('shows an installed snapshot version + hash when one exists', () => {
    useSettingsStore.setState({
      settings: {
        ...initialSettings,
        installedSnapshotVersion: 'v1',
        installedSnapshotHash: 'a'.repeat(64),
      },
    });
    render(<SecurityTab />);
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText(/aaaaaaaaaaaaaaaa…/)).toBeTruthy();
  });

  test('Living Golem is locked — nobody owns one yet', () => {
    render(<SecurityTab />);
    expect(screen.getByText(/Locked — no Living Golem on this account/)).toBeTruthy();
    expect(screen.getByText(/detection is not built/)).toBeTruthy();
  });

  test('starship is not detected — the mechanism is open, never faked', () => {
    render(<SecurityTab />);
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.getByText(/detection mechanism is not wired yet/)).toBeTruthy();
  });

  test('ping key shows only present / not set — never the value', () => {
    render(<SecurityTab />);
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.queryByText(/lucid-/)).toBeNull();
  });

  test('SP balance not checked yet when the quota is null', () => {
    render(<SecurityTab />);
    expect(screen.getByText('Not checked yet.')).toBeTruthy();
  });

  test('SP balance shows the live quota when one exists', () => {
    useAIStore.setState({
      pingQuota: { limit: 200, remaining: 150, reset: 0, reset_in_seconds: 0 },
      pingQuotaSource: 'server',
    });
    render(<SecurityTab />);
    expect(screen.getByText(/150 SP of 200 SP/)).toBeTruthy();
  });

  test('allowances show the free-tier caps — usage honestly not tracked', () => {
    render(<SecurityTab />);
    expect(screen.getByText(/Cap 10,000 per day/)).toBeTruthy();
    expect(screen.getByText(/Cap 100,000 per day/)).toBeTruthy();
    expect(screen.getAllByText(/usage not tracked in Lucid yet/).length).toBeGreaterThan(0);
  });

  test('permissions not checked yet — the probe lives in the Permissions tab', () => {
    render(<SecurityTab />);
    expect(screen.getByText(/Not checked yet — open the Permissions tab to probe/)).toBeTruthy();
  });

  test('dismissed snapshot versions are listed, and the button clears them', async () => {
    useSettingsStore.setState({
      settings: { ...initialSettings, snapshotAlertDismissedVersions: ['v2'] },
    });
    render(<SecurityTab />);
    expect(screen.getByText(/1 version dismissed \(v2\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('security-show-snapshot-alerts-again'));
    await waitFor(() => {
      expect(
        useSettingsStore.getState().settings.snapshotAlertDismissedVersions,
      ).toEqual([]);
    });
  });

  test('snapshot ring events land in the tab (newest first, like the Permissions log)', () => {
    const store = useEventLogStore.getState();
    store.logSnapshotUpdate('detected', 'v2', 'completed');
    store.logSnapshotUpdate('downloading', 'v2', 'completed');
    store.logSnapshotUpdate('hash-verified', 'v2', 'completed');
    store.logSnapshotUpdate('flipped', 'v2', 'completed');
    store.drain();
    const { container } = render(<SecurityTab />);
    // The event wrapper carries data-event=<type>. The ring
    // holds the steps in causal order (FIFO drain); the log
    // view shows newest first, the same convention as the
    // Permissions tab.
    const types = Array.from(container.querySelectorAll('[data-event]')).map((el) =>
      el.getAttribute('data-event'),
    );
    expect(types).toEqual([
      'snapshot.flipped',
      'snapshot.hash-verified',
      'snapshot.download-started',
      'snapshot.update-detected',
    ]);
  });

  test('an alert-dismissed ring event shows with its why', () => {
    const store = useEventLogStore.getState();
    store.logSnapshotUpdate('alert-dismissed', 'v2', 'dismissed');
    store.drain();
    const { container } = render(<SecurityTab />);
    const event = container.querySelector('[data-event="snapshot.alert-dismissed"]');
    expect(event).toBeTruthy();
    expect(event?.textContent).toMatch(/Snapshot alert dismissed/);
    expect(event?.textContent).toMatch(/do not show again/);
  });

  test('the refused count shows when the ring was full', () => {
    const store = useEventLogStore.getState();
    // Fill the ring past capacity (512) — every enqueue past
    // capacity is refused and counted, never dropped silently.
    for (let i = 0; i < 520; i++) {
      store.logSnapshotUpdate('detected', 'v2', 'completed');
    }
    store.drain();
    render(<SecurityTab />);
    expect(screen.getByText(/refused — the event channel was full/)).toBeTruthy();
  });

  test('no stream yet — no snapshot exists to update', () => {
    render(<SecurityTab />);
    expect(screen.getByText(/No snapshot update stream yet/)).toBeTruthy();
  });

  test('a full update stream shows time + strain for the whole stream', () => {
    const store = useEventLogStore.getState();
    store.logSnapshotUpdate('detected', 'v2', 'completed');
    store.logSnapshotUpdate('ping-fallback', 'v2', 'completed');
    store.logSnapshotUpdate('downloading', 'v2', 'completed');
    store.logSnapshotUpdate('hash-verified', 'v2', 'completed');
    store.logSnapshotUpdate('flipped', 'v2', 'completed');
    store.logSnapshotUpdate('packet-hits', 'v2', 'completed');
    store.drain();
    const { container } = render(<SecurityTab />);
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText(/Complete — the first packet hit the new snapshot/)).toBeTruthy();
    // Per-phase durations, in stream order (each phase took ~0ms
    // in the test — the labels + the measurement are what matter).
    // The label lives in a span inside the row, so match on the
    // section's full text.
    const text = container.textContent ?? '';
    expect(text).toMatch(/Mismatch detected → Ping fallback: \d+ ms/);
    expect(text).toMatch(/Ping fallback → Download: \d+ ms/);
    expect(text).toMatch(/Download → Hash verify: \d+ ms/);
    expect(text).toMatch(/Hash verify → Flip: \d+ ms/);
    expect(text).toMatch(/Flip → Packet hits again: \d+ ms/);
    // Strain: the ring accumulated one tick per phase (6 in
    // flight at the deepest), the tick ring stayed empty.
    expect(screen.getByText(/Deepest 6 of 512 in flight/)).toBeTruthy();
    expect(screen.getByText(/Deepest 0 of 256 in flight/)).toBeTruthy();
    expect(screen.getAllByText(/nothing refused/).length).toBe(2);
    expect(screen.getByText(/Longest tick wait/)).toBeTruthy();
  });

  test('a failed stream shows failed — the installed snapshot stayed current', () => {
    const store = useEventLogStore.getState();
    store.logSnapshotUpdate('detected', 'v2', 'completed');
    store.logSnapshotUpdate('downloading', 'v2', 'completed');
    store.logSnapshotUpdate('failed', 'v2', 'failed');
    store.drain();
    render(<SecurityTab />);
    expect(screen.getByText(/Failed — the installed snapshot stayed current/)).toBeTruthy();
  });

  test('alert stages record no stream sample — the alert is a notice, not a step', () => {
    const store = useEventLogStore.getState();
    store.logSnapshotUpdate('alert-shown', 'v2', 'completed');
    store.logSnapshotUpdate('alert-dismissed', 'v2', 'dismissed');
    store.drain();
    render(<SecurityTab />);
    expect(screen.getByText(/No snapshot update stream yet/)).toBeTruthy();
  });

  test('server section: live rows from the pull, honest gaps where the server exposes nothing', async () => {
    render(<SecurityTab />);
    // Live (GET /): service + model, up, the server caps.
    expect(await screen.findByText(/lucid-ping/)).toBeTruthy();
    expect(screen.getByText(/Up — not in maintenance/)).toBeTruthy();
    expect(screen.getByText(/10,000 neurons\/day, 100,000 requests\/day, 24h maintenance/)).toBeTruthy();
    // Not yet available (no public route to the usage DO).
    expect(screen.getByText(/Not yet available — the server counts today’s neurons/)).toBeTruthy();
    expect(screen.getByText(/Not yet available — same store, same reason/)).toBeTruthy();
    // CPU: not applicable — serverless. GPU: plan-only, not built.
    expect(screen.getByText(/Not applicable — the ping server is serverless/)).toBeTruthy();
    expect(screen.getByText(/Not yet available — the GPU pool is plan-only/)).toBeTruthy();
    // The pull happened once, on open.
    expect(pingServerStatusMock).toHaveBeenCalledTimes(1);
  });

  test('server section: Refresh pulls again — one call per pull, never per event', async () => {
    render(<SecurityTab />);
    await screen.findByText(/lucid-ping/);
    expect(pingServerStatusMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('security-refresh-server-status'));
    await waitFor(() => {
      expect(pingServerStatusMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('security-server-pulled-at')).toBeTruthy();
  });

  test('server section: maintenance shows the server\'s where + why', async () => {
    pingServerStatusMock.mockResolvedValueOnce({
      ok: true,
      service: 'lucid-ping',
      version: '1.0.0',
      model: '@cf/meta/llama-3.2-1b-instruct',
      mode: 'ping',
      maintenance: { reason: 'neurons_exhausted', detail: 'cap hit', back_in_seconds: 45 },
      server_caps: { neurons_per_day: 10000, requests_per_day: 100000, maintenance_hours: 24 },
    });
    render(<SecurityTab />);
    expect(await screen.findByText(/In maintenance — neurons_exhausted/)).toBeTruthy();
    expect(screen.getByText(/The maintenance view is the server's where \+ why: neurons_exhausted — cap hit/)).toBeTruthy();
  });

  test('server section: a failed pull says so, never a made-up status', async () => {
    pingServerStatusMock.mockRejectedValueOnce(new Error('fetch failed'));
    render(<SecurityTab />);
    expect(await screen.findByText(/Server status not available — fetch failed/)).toBeTruthy();
  });
});
