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
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileTab } from '../src/components/Settings/ProfileTab';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useHistoryStore } from '../src/stores/historyStore';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

// updateSetting/updateSettings + clearSessions persist through
// window.lucidAPI; stub just those calls (the convention in the
// component tests). verifyTotpCode is the Authenticator gate's IPC
// (settingsStore.verifyTotpCode forwards to it) — a mock so each
// 2FA test can answer ok / wrong / locked.
const win = globalThis as unknown as {
  lucidAPI?: {
    settings: {
      set: (...args: unknown[]) => Promise<unknown>;
      getAll: (...args: unknown[]) => Promise<unknown>;
      hasApiKey: (...args: unknown[]) => Promise<unknown>;
      hasPingKey: (...args: unknown[]) => Promise<unknown>;
      getStorageStatus: (...args: unknown[]) => Promise<unknown>;
      verifyTotpCode: (...args: unknown[]) => Promise<unknown>;
    };
    ai: { clearSessions: (...args: unknown[]) => Promise<unknown> };
  };
};

let prevLucidAPI: typeof win.lucidAPI;
let verifyTotpCode: ReturnType<typeof vi.fn>;

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
  verifyTotpCode = vi.fn().mockResolvedValue({
    ok: true,
    locked: false,
    retryAfterMs: 0,
  });
  win.lucidAPI = {
    settings: {
      set: async () => undefined,
      getAll: async () => ({}),
      hasApiKey: async () => false,
      hasPingKey: async () => false,
      getStorageStatus: async () => ({ degraded: false, reason: null }),
      verifyTotpCode: async (...args: unknown[]) => verifyTotpCode(...args),
    },
    ai: { clearSessions: async () => undefined },
  };
  // 2FA off by default — each gate test turns it on itself.
  useSettingsStore.setState({ hasTotpSecret: false });
  // Each test starts un-veiled (direct setState never runs the veil
  // transitions — see tests/profiles.test.ts for the same reset).
  useAIStore.setState({ guestSessionActive: false, guestStash: null });
  useHistoryStore.setState({ guestSessionActive: false, guestStash: null });
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

describe('ProfileTab — Authenticator gate on deletion (Gary, 2026-11-12 ~17:59 PST)', () => {
  /** A second profile, active, so the delete flow has a target. */
  function makeSecond() {
    const created = useProfileStore.getState().createProfile('Second');
    expect(created).not.toBeNull();
    expect(useProfileStore.getState().selectProfile(created!.id)).toBe(true);
    return created!;
  }

  function armDelete() {
    render(<ProfileTab />);
    fireEvent.click(screen.getByTestId('profile-tab-delete-button'));
    expect(screen.getByTestId('profile-tab-delete-confirm')).toBeTruthy();
  }

  function typeCode(value: string) {
    fireEvent.change(screen.getByTestId('profile-tab-delete-code-input'), {
      target: { value },
    });
  }

  test('2FA off: no code input — deletion proceeds exactly as before', async () => {
    makeSecond();
    armDelete();
    expect(
      screen.queryByTestId('profile-tab-delete-code-input'),
    ).toBeNull();
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(useProfileStore.getState().profiles).toHaveLength(1);
    });
    expect(verifyTotpCode).not.toHaveBeenCalled();
  });

  test('2FA on + correct code: the code is verified, then the profile is deleted', async () => {
    makeSecond();
    useSettingsStore.setState({ hasTotpSecret: true });
    armDelete();
    const input = screen.getByTestId(
      'profile-tab-delete-code-input',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    typeCode('123456');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(useProfileStore.getState().profiles).toHaveLength(1);
    });
    expect(verifyTotpCode).toHaveBeenCalledTimes(1);
    expect(verifyTotpCode).toHaveBeenCalledWith('123456');
    expect(useProfileStore.getState().activeProfileId).toBe(
      DEFAULT_PROFILE_ID,
    );
  });

  test('2FA on + wrong code: no delete, an error shows, and the code is cleared', async () => {
    makeSecond();
    useSettingsStore.setState({ hasTotpSecret: true });
    verifyTotpCode.mockResolvedValue({
      ok: false,
      locked: false,
      retryAfterMs: 0,
    });
    armDelete();
    typeCode('000000');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('profile-tab-delete-code-error'),
      ).toBeTruthy();
    });
    expect(
      screen.getByTestId('profile-tab-delete-code-error').textContent,
    ).toContain("doesn't match");
    // The profile is still there, and the typed code is cleared
    // after the check (same pattern as the Security tab).
    expect(useProfileStore.getState().profiles).toHaveLength(2);
    expect(
      (
        screen.getByTestId(
          'profile-tab-delete-code-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('');
    expect(verifyTotpCode).toHaveBeenCalledTimes(1);
  });

  test('2FA on + locked: the lockout message shows and nothing is deleted', async () => {
    makeSecond();
    useSettingsStore.setState({ hasTotpSecret: true });
    verifyTotpCode.mockResolvedValue({
      ok: false,
      locked: true,
      retryAfterMs: 120000,
    });
    armDelete();
    typeCode('123456');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('profile-tab-delete-code-error'),
      ).toBeTruthy();
    });
    expect(
      screen.getByTestId('profile-tab-delete-code-error').textContent,
    ).toContain('locked');
    expect(
      screen.getByTestId('profile-tab-delete-code-error').textContent,
    ).toContain('2 minutes');
    expect(useProfileStore.getState().profiles).toHaveLength(2);
  });

  test('2FA on + malformed code: the format error shows and verify is never called', async () => {
    makeSecond();
    useSettingsStore.setState({ hasTotpSecret: true });
    armDelete();
    typeCode('123');
    fireEvent.click(
      screen.getByTestId('profile-tab-delete-confirm-button'),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('profile-tab-delete-code-error'),
      ).toBeTruthy();
    });
    expect(
      screen.getByTestId('profile-tab-delete-code-error').textContent,
    ).toContain('6-digit');
    expect(verifyTotpCode).not.toHaveBeenCalled();
    expect(useProfileStore.getState().profiles).toHaveLength(2);
  });
});
