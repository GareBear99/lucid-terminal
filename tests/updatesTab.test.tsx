// @vitest-environment jsdom
/**
 * Updates tab tests (Gary, 2026-11-16).
 *
 * Settings > Updates shows the version running now, the latest
 * version out (Check now against the GitHub releases), how to
 * install it (honest: no auto-update — download the .dmg),
 * the prior versions on this machine, and the current
 * profile's "Tell me when a new version is out" toggle
 * (saved profiles only — a guest gets no toggle and always
 * sees the message).
 *
 * Covers: the tab names the running version and the empty
 * states (not checked yet, no versions recorded, no
 * auto-update); Check now with a newer release shows it and
 * records the running version in the history; Check now with
 * a matching release says up to date; Check now failing
 * reports the error honestly; a guest gets no toggle.
 *
 * Run with: npx vitest run tests/updatesTab.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdatesTab } from '../src/components/Settings/UpdatesTab';
import { useAppUpdateStore } from '../src/stores/appUpdateStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

const RELEASE_120 = {
  tag_name: 'v1.2.0',
  name: 'v1.2.0',
  html_url: 'https://github.com/GareBear99/lucid-terminal/releases/tag/v1.2.0',
  published_at: '2026-11-16T10:00:00Z',
  body: 'The Updates section lands.',
  assets: [
    {
      name: 'Lucid.Terminal-1.2.0.dmg',
      browser_download_url:
        'https://github.com/GareBear99/lucid-terminal/releases/download/v1.2.0/Lucid.Terminal-1.2.0.dmg',
    },
  ],
};

const settingsSetMock = vi.fn(async () => undefined);
const checkLatestMock = vi.fn(async () => ({ ok: true, raw: RELEASE_120 }));
const openExternalMock = vi.fn(async () => undefined);

function installLucidApiMock() {
  const win = window as unknown as Record<string, unknown>;
  const prev = win.lucidAPI;
  win.lucidAPI = {
    settings: { set: settingsSetMock },
    appUpdate: { checkLatest: checkLatestMock },
    browser: { openExternal: openExternalMock },
  };
  return prev;
}

function setSavedProfile() {
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
    logoutRequestedAt: null,
  });
}

function setGuestProfile() {
  const guest = {
    ...createDefaultProfile(),
    id: 'profile-guest',
    name: 'Guest',
    status: 'guest' as const,
  };
  useProfileStore.setState({
    profiles: [createDefaultProfile(), guest],
    activeProfileId: 'profile-guest',
    logoutRequestedAt: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppUpdateStore.setState({
    status: 'idle',
    release: null,
    checkResult: null,
    lastCheckedAt: null,
    lastError: null,
    lastAlertShownVersion: null,
  });
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, installedAppVersions: [] },
  }));
  setSavedProfile();
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  delete win.lucidAPI;
});

describe('UpdatesTab', () => {
  test('names the running version, the empty states, and the honest install path', () => {
    render(<UpdatesTab />);
    expect(screen.getByText(/This version/)).toBeTruthy();
    expect(screen.getByText(/v1\.1\.0/)).toBeTruthy();
    expect(screen.getByText(/Not checked yet/)).toBeTruthy();
    expect(screen.getByText(/Lucid does not update itself yet/)).toBeTruthy();
    expect(screen.getByText(/No versions recorded yet/)).toBeTruthy();
    expect(screen.getByText(/releases page/)).toBeTruthy();
    expect(screen.getByText(/Tell me when a new version is out/)).toBeTruthy();
  });

  test('Check now with a newer release shows it and records the running version', async () => {
    const prev = installLucidApiMock();
    try {
      render(<UpdatesTab />);
      fireEvent.click(screen.getByTestId('updates-check-now'));
      await waitFor(() =>
        expect(screen.getByText('v1.2.0')).toBeTruthy(),
      );
      expect(screen.getByText(/download the v1\.2\.0 \.dmg/)).toBeTruthy();
      expect(screen.getByText(/you are on 1\.1\.0/)).toBeTruthy();
      expect(screen.getByText(/View release/)).toBeTruthy();
      expect(screen.getByText(/Last checked/)).toBeTruthy();
      // The running version is recorded in the machine history.
      expect(settingsSetMock).toHaveBeenCalledWith(
        'installedAppVersions',
        expect.arrayContaining([
          expect.objectContaining({ version: '1.1.0' }),
        ]),
      );
      // View release opens the release page.
      fireEvent.click(screen.getByText(/View release/));
      expect(openExternalMock).toHaveBeenCalledWith(
        'https://github.com/GareBear99/lucid-terminal/releases/tag/v1.2.0',
      );
    } finally {
      (window as unknown as Record<string, unknown>).lucidAPI = prev;
    }
  });

  test('Check now with a matching release says up to date', async () => {
    checkLatestMock.mockResolvedValueOnce({
      ok: true,
      raw: { ...RELEASE_120, tag_name: 'v1.1.0', name: 'v1.1.0' },
    });
    const prev = installLucidApiMock();
    try {
      render(<UpdatesTab />);
      fireEvent.click(screen.getByTestId('updates-check-now'));
      await waitFor(() =>
        expect(screen.getByText(/You are on the latest version/)).toBeTruthy(),
      );
    } finally {
      (window as unknown as Record<string, unknown>).lucidAPI = prev;
    }
  });

  test('Check now failing reports the error honestly, never a made-up version', async () => {
    checkLatestMock.mockResolvedValueOnce({
      ok: false,
      error: 'GitHub releases returned 403.',
    });
    const prev = installLucidApiMock();
    try {
      render(<UpdatesTab />);
      fireEvent.click(screen.getByTestId('updates-check-now'));
      await waitFor(() =>
        expect(screen.getByText(/GitHub releases returned 403/)).toBeTruthy(),
      );
      expect(screen.queryByText('v1.2.0')).toBeNull();
    } finally {
      (window as unknown as Record<string, unknown>).lucidAPI = prev;
    }
  });

  test('prior versions on this machine list newest first', () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        installedAppVersions: [
          { version: '1.0.0', firstSeenAt: '2026-11-01T10:00:00Z' },
          { version: '1.1.0', firstSeenAt: '2026-11-09T10:00:00Z' },
        ],
      },
    }));
    render(<UpdatesTab />);
    const runningNow = screen.getByText(/v1\.1\.0 \(running now\)/);
    const older = screen.getByText('v1.0.0');
    expect(
      Boolean(
        runningNow.compareDocumentPosition(older) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  test('a guest gets NO toggle — the note says Guest always sees the message', () => {
    setGuestProfile();
    render(<UpdatesTab />);
    expect(screen.queryByText(/Tell me when a new version is out/)).toBeNull();
    expect(
      screen.getByText(/A guest session always sees the new-version message/),
    ).toBeTruthy();
  });

  test('flipping the toggle off records the opt-out for this profile only', () => {
    render(<UpdatesTab />);
    const toggle = screen.getByRole('switch', {
      name: 'Tell me when a new version is out',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(
      useProfileStore
        .getState()
        .profiles.find((p) => p.id === DEFAULT_PROFILE_ID)?.skipUpdateAlert,
    ).toBe(true);
    expect(screen.getByText(/will not pop up at startup/)).toBeTruthy();
  });
});
