// @vitest-environment jsdom
/**
 * Logout in Settings → General (Gary, 2026-11-16).
 *
 * "Log out of profile" lives in General, with a confirmation
 * prompt ("Are you sure?") before logging out. A saved profile
 * can check "Don't ask again" (saved per profile as
 * skipLogoutConfirm) and turn the confirmation back on with
 * the "Ask before logging out" toggle. GUEST IS EXCLUDED
 * (Gary, 2026-11-16): a guest session always asks — no toggle
 * in General and no "Don't ask again" checkbox for Guest, only
 * for saved profiles. The profiles that turned the confirmation
 * off are listed in Settings > Security, where it can be turned
 * back on (see tests/securityTab.test.tsx).
 *
 * Interactive render (same pattern as
 * tests/devModeSettings.test.tsx).
 *
 * Run with: npx vitest run tests/logoutGeneral.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

describe('Settings → General → Log out of profile', () => {
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
    };
    mockSet.mockClear();
    // A saved profile is active by default in these tests.
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
      logoutRequestedAt: null,
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    useProfileStore.setState({
      profiles: [createDefaultProfile()],
      activeProfileId: DEFAULT_PROFILE_ID,
      logoutRequestedAt: null,
    });
  });

  function renderGeneral() {
    render(<SettingsPanel onClose={() => {}} initialTab="general" />);
  }

  function setActiveGuest() {
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

  test('a saved profile gets the Ask before logging out toggle', () => {
    renderGeneral();
    expect(screen.getByTestId('general-logout-button')).toBeTruthy();
    expect(screen.getByText(/Log out of/)).toBeTruthy();
    expect(screen.getByText(/Ask before logging out/)).toBeTruthy();
  });

  test('a guest gets NO Ask before logging out toggle — Guest always asks', () => {
    setActiveGuest();
    renderGeneral();
    expect(screen.getByTestId('general-logout-button')).toBeTruthy();
    expect(screen.queryByText(/Ask before logging out/)).toBeNull();
  });

  test('guest logout prompt says unsaved data will be lost, with NO Don\'t ask again checkbox', () => {
    setActiveGuest();
    renderGeneral();
    fireEvent.click(screen.getByTestId('general-logout-button'));
    expect(screen.getByText('Log out of Guest?')).toBeTruthy();
    expect(screen.getByText(/All unsaved data will be lost/)).toBeTruthy();
    expect(screen.queryByTestId('logout-dont-ask-again')).toBeNull();
  });

  test('saved profile logout prompt HAS the Don\'t ask again checkbox', () => {
    renderGeneral();
    fireEvent.click(screen.getByTestId('general-logout-button'));
    expect(screen.getByText('Log out of Default?')).toBeTruthy();
    expect(screen.getByTestId('logout-dont-ask-again')).toBeTruthy();
  });

  test('a saved profile that opted out logs out with no prompt', () => {
    expect(
      useProfileStore.getState().setSkipLogoutConfirm(DEFAULT_PROFILE_ID, true),
    ).toBe(true);
    renderGeneral();
    fireEvent.click(screen.getByTestId('general-logout-button'));
    // No modal: the logout request went straight through.
    expect(screen.queryByTestId('logout-dont-ask-again')).toBeNull();
    expect(screen.queryByTestId('logout-confirm-button')).toBeNull();
    expect(typeof useProfileStore.getState().logoutRequestedAt).toBe('number');
  });

  test('checking Don\'t ask again on a saved profile saves it per profile', () => {
    renderGeneral();
    fireEvent.click(screen.getByTestId('general-logout-button'));
    fireEvent.click(screen.getByTestId('logout-dont-ask-again'));
    fireEvent.click(screen.getByTestId('logout-confirm-button'));
    expect(
      useProfileStore.getState().profiles.find((p) => p.id === DEFAULT_PROFILE_ID)
        ?.skipLogoutConfirm,
    ).toBe(true);
    expect(typeof useProfileStore.getState().logoutRequestedAt).toBe('number');
  });
});
