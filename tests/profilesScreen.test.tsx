// @vitest-environment jsdom
/**
 * ProfilesScreen tests (Gary, 2026-11-12 ~10:48 PST): clean glass,
 * grey-blackish vanta. Create profiles (multiple), each card shows
 * its verified gates + status; select one and enter Lucid. NO
 * deletion on this screen (Gary, 2026-11-12 ~17:36 PST) — deletion
 * happens within the profile (Settings > Profile tab).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesScreen } from '../src/components/Profiles/ProfilesScreen';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';

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
  resetProfiles();
});

function createProfileViaUi(name: string) {
  fireEvent.change(screen.getByTestId('profile-name-input'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByTestId('profile-create-button'));
  const created = useProfileStore
    .getState()
    .profiles.find((p) => p.name === name);
  if (!created) throw new Error(`profile ${name} was not created`);
  return created;
}

describe('ProfilesScreen', () => {
  test('shows the default profile as a Temp with no verified gates yet', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    expect(screen.getByTestId('profiles-screen')).toBeTruthy();
    expect(
      screen.getByTestId(`profile-card-${DEFAULT_PROFILE_ID}`),
    ).toBeTruthy();
    const status = screen.getByTestId(`profile-status-${DEFAULT_PROFILE_ID}`);
    expect(status.getAttribute('data-status')).toBe('temp');
    expect(status.textContent).toBe('Temp');
    expect(screen.getByText('No verified gates yet')).toBeTruthy();
  });

  test('a blank name leaves Create disabled and creates nothing', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    expect(
      (screen.getByTestId('profile-create-button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByTestId('profile-name-input'), {
      target: { value: '   ' },
    });
    expect(
      (screen.getByTestId('profile-create-button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });

  test('creating a profile adds its card and selects it', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    const created = createProfileViaUi('Gary');
    expect(
      screen.getByTestId(`profile-card-${created.id}`),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId(`profile-card-${created.id}`)
        .getAttribute('data-selected'),
    ).toBe('true');
    expect(
      (screen.getByTestId('profile-name-input') as HTMLInputElement).value,
    ).toBe('');
  });

  test('selecting a profile and entering calls onDone with its id', () => {
    const onDone = vi.fn();
    render(<ProfilesScreen onDone={onDone} />);
    const created = createProfileViaUi('Gary');
    // Creating selects it already; enter straight away.
    fireEvent.click(screen.getByTestId('profile-enter-button'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(created.id);
  });

  test('clicking a card selects it; Enter follows the selection', () => {
    const onDone = vi.fn();
    render(<ProfilesScreen onDone={onDone} />);
    const created = createProfileViaUi('Gary');
    // Select the default card instead.
    fireEvent.click(screen.getByTestId(`profile-card-${DEFAULT_PROFILE_ID}`));
    expect(
      screen
        .getByTestId(`profile-card-${DEFAULT_PROFILE_ID}`)
        .getAttribute('data-selected'),
    ).toBe('true');
    fireEvent.click(screen.getByTestId('profile-enter-button'));
    expect(onDone).toHaveBeenCalledWith(DEFAULT_PROFILE_ID);
    expect(created).toBeTruthy();
  });

  test('the screen has no deletion — no wipe controls on any card', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    const created = createProfileViaUi('Second');
    fireEvent.click(screen.getByTestId('profile-guest-button'));
    const guest = useProfileStore
      .getState()
      .profiles.find((p) => p.status === 'guest');
    expect(guest).toBeDefined();
    // Deletion lives within the profile (Settings > Profile tab) —
    // this screen is just create + guest access + choose.
    for (const id of [DEFAULT_PROFILE_ID, created.id, guest!.id]) {
      expect(screen.queryByTestId(`profile-wipe-button-${id}`)).toBeNull();
      expect(
        screen.queryByTestId(`profile-wipe-confirm-${id}`),
      ).toBeNull();
      expect(
        screen.queryByTestId(`profile-wipe-confirm-button-${id}`),
      ).toBeNull();
    }
  });

  test('the Telegram gate is shown as not yet available', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    expect(screen.getByText(/Telegram verification/)).toBeTruthy();
    expect(screen.getByText(/not yet available/)).toBeTruthy();
  });

  test('Enter as guest creates a guest profile and enters immediately', () => {
    const onDone = vi.fn();
    render(<ProfilesScreen onDone={onDone} />);
    fireEvent.click(screen.getByTestId('profile-guest-button'));
    const guest = useProfileStore
      .getState()
      .profiles.find((p) => p.status === 'guest');
    expect(guest).toBeDefined();
    expect(guest?.name).toBe('Guest');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(guest!.id);
    const status = screen.getByTestId(`profile-status-${guest!.id}`);
    expect(status.getAttribute('data-status')).toBe('guest');
    expect(status.textContent).toBe('Guest');
    expect(screen.getByText(/synth stays in demo mode/i)).toBeTruthy();
  });
});
