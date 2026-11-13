// @vitest-environment jsdom
/**
 * ProfileTab tests (Gary, 2026-11-12 ~17:36 PST): deletion happens
 * WITHIN the profile — Settings > Profile tab, on the active
 * profile only. The tab shows the active profile's own details
 * (name, status, verified gates) and the delete flow (two-step
 * confirm, same boundary copy as the old card wipe). Guests have
 * NO deletion: no delete control exists for a guest profile. The
 * tab is wired into SettingsPanel as the 'profile' tab.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileTab } from '../src/components/Settings/ProfileTab';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

// updateSetting/updateSettings + clearSessions persist through
// window.lucidAPI; stub just those calls (the convention in the
// component tests).
const win = globalThis as unknown as {
  lucidAPI?: {
    settings: {
      set: (...args: unknown[]) => Promise<unknown>;
      getAll: (...args: unknown[]) => Promise<unknown>;
      hasApiKey: (...args: unknown[]) => Promise<unknown>;
      hasPingKey: (...args: unknown[]) => Promise<unknown>;
      getStorageStatus: (...args: unknown[]) => Promise<unknown>;
    };
    ai: { clearSessions: (...args: unknown[]) => Promise<unknown> };
  };
};

let prevLucidAPI: typeof win.lucidAPI;

function resetProfiles() {
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // jsdom without storage: the store resets below regardless.
  }
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
  });
}

beforeEach(() => {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    settings: {
      set: async () => undefined,
      getAll: async () => ({}),
      hasApiKey: async () => false,
      hasPingKey: async () => false,
      getStorageStatus: async () => ({ degraded: false, reason: null }),
    },
    ai: { clearSessions: async () => undefined },
  };
  resetProfiles();
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
});

describe('ProfileTab — the profile’s own view', () => {
  test('shows the active profile — name, status, gates', () => {
    render(<ProfileTab />);
    expect(screen.getByTestId('profile-tab')).toBeTruthy();
    expect(screen.getByTestId('profile-tab-name').textContent).toBe(
      'Default',
    );
    const status = screen.getByTestId('profile-tab-status');
    expect(status.getAttribute('data-status')).toBe('temp');
    expect(status.textContent).toBe('Temp');
    expect(screen.getByText('No verified gates yet')).toBeTruthy();
  });

  test('delete asks first — the confirm names what goes and what stays', async () => {
    const created = useProfileStore.getState().createProfile('Second');
    expect(created).not.toBeNull();
    expect(useProfileStore.getState().selectProfile(created!.id)).toBe(
      true,
    );
    render(<ProfileTab />);
    fireEvent.click(screen.getByTestId('profile-tab-delete-button'));
    const confirm = screen.getByTestId('profile-tab-delete-confirm');
    expect(confirm.textContent).toContain('back to demo');
    expect(confirm.textContent).toContain('like you never left');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    // The profile is gone; the active profile falls back to Default
    // and the tab re-renders showing it — you stay in Lucid.
    await waitFor(() => {
      expect(useProfileStore.getState().profiles).toHaveLength(1);
    });
    expect(useProfileStore.getState().activeProfileId).toBe(
      DEFAULT_PROFILE_ID,
    );
    expect(screen.getByTestId('profile-tab-name').textContent).toBe(
      'Default',
    );
  });

  test('deleting the default profile resets it instead of removing it', async () => {
    render(<ProfileTab />);
    fireEvent.click(screen.getByTestId('profile-tab-delete-button'));
    const confirm = screen.getByTestId('profile-tab-delete-confirm');
    expect(confirm.textContent).toContain('resets it to a fresh profile');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(
        useProfileStore.getState().profiles[0].status,
      ).toBe('temp');
    });
    const profiles = useProfileStore.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(DEFAULT_PROFILE_ID);
  });

  test('a guest sees no delete control at all — guest profiles have no deletion', () => {
    const guest = useProfileStore.getState().createGuestProfile();
    expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
    render(<ProfileTab />);
    expect(screen.getByTestId('profile-tab-name').textContent).toBe(
      'Guest',
    );
    const status = screen.getByTestId('profile-tab-status');
    expect(status.getAttribute('data-status')).toBe('guest');
    expect(screen.getByTestId('profile-tab-guest-note')).toBeTruthy();
    expect(screen.getByText(/no deletion/i)).toBeTruthy();
    expect(
      screen.queryByTestId('profile-tab-delete-button'),
    ).toBeNull();
    expect(
      screen.queryByTestId('profile-tab-delete-confirm'),
    ).toBeNull();
  });

  test('cancel leaves the profile alone', () => {
    const created = useProfileStore.getState().createProfile('Second');
    expect(created).not.toBeNull();
    expect(useProfileStore.getState().selectProfile(created!.id)).toBe(
      true,
    );
    render(<ProfileTab />);
    fireEvent.click(screen.getByTestId('profile-tab-delete-button'));
    expect(
      screen.getByTestId('profile-tab-delete-confirm'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-cancel-button'),
    );
    expect(
      screen.queryByTestId('profile-tab-delete-confirm'),
    ).toBeNull();
    expect(useProfileStore.getState().profiles).toHaveLength(2);
    expect(useProfileStore.getState().activeProfileId).toBe(created!.id);
  });
});

describe('Profile tab wiring in SettingsPanel', () => {
  test('the Profile tab button exists and opens the tab', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        settingsTabOrder: [],
        settingsTabsLocked: false,
      },
    });
    render(<SettingsPanel onClose={() => undefined} />);
    const tabButton = document
      .querySelector('[data-settings-tab="profile"]')
      ?.querySelector('button') as HTMLElement;
    expect(tabButton).not.toBeNull();
    expect(tabButton?.textContent).toContain('Profile');
    fireEvent.click(tabButton);
    expect(screen.getByTestId('profile-tab')).toBeTruthy();
  });
});
