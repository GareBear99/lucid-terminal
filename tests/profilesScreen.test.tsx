// @vitest-environment jsdom
/**
 * ProfilesScreen tests (Gary, 2026-11-12 ~10:48 PST; redesigned
 * 2026-11-13 ~01:31 PST): clean glass, grey-blackish vanta. The
 * screen is ONLY the created cards in their own scrollable area
 * above + guest access and create a profile below — nothing else.
 * Clicking a card enters that profile immediately (no
 * select-then-enter step, no "Enter Lucid" button, no gates note).
 * Creating a profile enters it immediately too. NO deletion on
 * this screen (Gary, 2026-11-12 ~17:36 PST) — deletion happens
 * within the profile (Settings > Profile tab).
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

/** Seed extra profiles straight into the store (no UI side effects). */
function seedProfiles(names: string[]) {
  const created = names.map((name) =>
    useProfileStore.getState().createProfile(name),
  );
  if (created.some((p) => p === null)) {
    throw new Error('seeding failed');
  }
  return created as NonNullable<(typeof created)[number]>[];
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

  test('creating a profile adds its card and enters it immediately', () => {
    const onDone = vi.fn();
    render(<ProfilesScreen onDone={onDone} />);
    const created = createProfileViaUi('Gary');
    expect(
      screen.getByTestId(`profile-card-${created.id}`),
    ).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(created.id);
    expect(
      (screen.getByTestId('profile-name-input') as HTMLInputElement).value,
    ).toBe('');
  });

  test('clicking a card enters it immediately, with no select step', () => {
    const onDone = vi.fn();
    const [second] = seedProfiles(['Second']);
    render(<ProfilesScreen onDone={onDone} />);
    fireEvent.click(screen.getByTestId(`profile-card-${second.id}`));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(second.id);
    // No card carries a selection state any more — there is nothing
    // to select; the click IS the entry.
    for (const profile of useProfileStore.getState().profiles) {
      expect(
        screen
          .getByTestId(`profile-card-${profile.id}`)
          .getAttribute('data-selected'),
      ).toBeNull();
    }
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
    // this screen is just the created cards + guest access + create
    // a profile, nothing else.
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

  test('no gates note and no Enter Lucid button render', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    expect(screen.queryByText(/Telegram/)).toBeNull();
    expect(screen.queryByText(/not yet available/)).toBeNull();
    expect(screen.queryByTestId('profile-enter-button')).toBeNull();
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
    // The guest is a created profile: its card lives in the
    // scrollable cards area like any other.
    expect(
      screen
        .getByTestId('profiles-cards')
        .contains(screen.getByTestId(`profile-card-${guest!.id}`)),
    ).toBe(true);
  });

  test('created cards live in their own scrollable area above the controls', () => {
    seedProfiles(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    render(<ProfilesScreen onDone={() => undefined} />);
    const cards = screen.getByTestId('profiles-cards');
    // The cards area is the scrollable one, not the whole screen.
    expect(cards.className).toContain('overflow-y-auto');
    expect(screen.getByTestId('profiles-screen').className).not.toContain(
      'overflow-y-auto',
    );
    // Every card is inside it.
    for (const profile of useProfileStore.getState().profiles) {
      expect(
        cards.contains(screen.getByTestId(`profile-card-${profile.id}`)),
      ).toBe(true);
    }
    // The guest + create controls are outside it, below it — so they
    // stay visible no matter how many cards there are.
    const guestButton = screen.getByTestId('profile-guest-button');
    const createButton = screen.getByTestId('profile-create-button');
    const nameInput = screen.getByTestId('profile-name-input');
    expect(cards.contains(guestButton)).toBe(false);
    expect(cards.contains(createButton)).toBe(false);
    expect(cards.contains(nameInput)).toBe(false);
    expect(
      // eslint-disable-next-line no-bitwise
      cards.compareDocumentPosition(guestButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      // eslint-disable-next-line no-bitwise
      cards.compareDocumentPosition(createButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
