// @vitest-environment jsdom
/**
 * ProfilesScreen tests (Gary, 2026-11-12 ~10:48 PST; redesigned
 * 2026-11-13 ~01:31 PST; OS boot/setup look 2026-11-13 ~02:21 PST;
 * Guest-card layout 2026-11-13 ~03:22–03:26 PST):
 * an OS bootscreen — one centered block, minimal, one focused step.
 * The mutable cards (Default first — it comes with the program —
 * then your created profiles) sit RIGHT IN THE CENTER in their own
 * scrollable area, then a divider line, then the Guest card — Guest
 * is an immutable profile (always a fresh blank slate, never
 * changed or deleted), so it sits on its own side of the line. The
 * card just says "Guest" — no "Enter as guest" wording anywhere.
 * Below the cards ONLY create a profile — nothing else. Clicking a
 * card enters that profile immediately (no select-then-enter step,
 * no "Enter Lucid" button, no gates note). Creating a profile
 * enters it immediately too. NO deletion on this screen (Gary,
 * 2026-11-12 ~17:36 PST) — deletion happens within the profile
 * (Settings > Profile tab). The block sizes to its content and can
 * never exceed the viewport, so nothing is ever cut off. The
 * entrance fade rides the CONTENT block only — the root mounts
 * opaque and never fades (Gary, 2026-11-13 ~02:53 PST: the old
 * root fade let the dashboard show through for 400ms, "glitches
 * to lucid still on splash").
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
    fireEvent.click(screen.getByTestId('profile-guest-card'));
    const guest = useProfileStore
      .getState()
      .profiles.find((p) => p.status === 'guest');
    expect(guest).toBeDefined();
    // Deletion lives within the profile (Settings > Profile tab) —
    // this screen is just the mutable cards + the line + the Guest
    // card + create a profile, nothing else.
    for (const id of [DEFAULT_PROFILE_ID, created.id]) {
      expect(screen.queryByTestId(`profile-wipe-button-${id}`)).toBeNull();
      expect(
        screen.queryByTestId(`profile-wipe-confirm-${id}`),
      ).toBeNull();
      expect(
        screen.queryByTestId(`profile-wipe-confirm-button-${id}`),
      ).toBeNull();
    }
    // The Guest card carries no wipe control either, and the stored
    // guest record is never rendered as its own card.
    expect(screen.queryByTestId('profile-wipe-button-guest')).toBeNull();
    expect(
      screen.queryByTestId(`profile-card-${guest!.id}`),
    ).toBeNull();
  });

  test('no gates note, no Enter Lucid button, and no "Enter as guest" wording render', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    expect(screen.queryByText(/Telegram/)).toBeNull();
    expect(screen.queryByText(/not yet available/)).toBeNull();
    expect(screen.queryByTestId('profile-enter-button')).toBeNull();
    // Gary, 2026-11-13 ~03:25 PST: "shouldnt say enter as guest
    // like i said" — the screen never says it, anywhere.
    expect(screen.queryByText(/Enter as guest/i)).toBeNull();
    expect(screen.queryByTestId('profile-guest-button')).toBeNull();
  });

  test('Guest is a card: clicking it creates a fresh guest and enters immediately', () => {
    const onDone = vi.fn();
    render(<ProfilesScreen onDone={onDone} />);
    // The Guest card is right there in the cards area — no separate
    // "Enter as guest" step, and the screen never says those words.
    expect(screen.queryByText(/Enter as guest/i)).toBeNull();
    fireEvent.click(screen.getByTestId('profile-guest-card'));
    const guest = useProfileStore
      .getState()
      .profiles.find((p) => p.status === 'guest');
    expect(guest).toBeDefined();
    expect(guest?.name).toBe('Guest');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(guest!.id);
    const status = screen.getByTestId('profile-status-guest');
    expect(status.getAttribute('data-status')).toBe('guest');
    expect(status.textContent).toBe('Guest');
    expect(screen.getByText(/synth stays in demo mode/i)).toBeTruthy();
    // The Guest card lives in the scrollable cards area like any
    // other card — but the stored guest record is NOT rendered as
    // its own card; the Guest card is the entry point.
    const cards = screen.getByTestId('profiles-cards');
    expect(cards.contains(screen.getByTestId('profile-guest-card'))).toBe(
      true,
    );
    expect(
      screen.queryByTestId(`profile-card-${guest!.id}`),
    ).toBeNull();
  });

  test('the block is OS-centered: one centered column, never taller than the viewport', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    const screenEl = screen.getByTestId('profiles-screen');
    // The overlay centers its one block both ways (macOS Setup
    // Assistant / Windows OOBE / OS login), instead of stretching
    // an h-full column that pinned the controls to the bottom edge
    // with a dead middle — the layout that read as cut off.
    expect(screenEl.className).toContain('items-center');
    expect(screenEl.className).toContain('justify-center');
    // The block sizes to its content and can never exceed the
    // viewport: max-h-full inside the padded flex center. (The
    // block is the "Profiles" heading's parent.)
    const block = screen.getByText('Profiles').parentElement;
    expect(block).toBeTruthy();
    expect(block!.className).toContain('max-h-full');
    expect(block!.className).toContain('max-w-md');
    // No standalone h-full: the old spread layout stretched an
    // h-full column across the viewport; this block sizes to its
    // content instead. (max-h-full is not h-full — check tokens.)
    expect(block!.className.split(/\s+/)).not.toContain('h-full');
  });

  test('the entrance fade rides the content block, never the root — the root mounts opaque', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    const screenEl = screen.getByTestId('profiles-screen');
    const block = screen.getByTestId('profiles-content');
    // The root is the opaque cover over the always-mounted
    // dashboard: it must never carry an entrance animation. The old
    // profiles-screen-enter class on the root animated it from
    // opacity 0, so the terminal showed straight through for 400ms
    // (Gary 2026-11-13 ~02:53 PST "glitches to lucid still on
    // splash"). It is gone; the root is bg-black, opacity 1 from
    // the first frame.
    expect(screenEl.className).not.toContain('profiles-screen-enter');
    expect(screenEl.className).toContain('bg-black');
    // The 400ms fade rides the inner centered content block only.
    expect(block.className).toContain('profiles-content-enter');
    // The block is the "Profiles" heading's parent — the fade
    // covers heading + cards + create + line + guest together.
    expect(screen.getByText('Profiles').parentElement).toBe(block);
    // The root is the block's parent (with SplashMist as its
    // sibling backdrop) — nothing between the opaque root and the
    // fading content can leak the dashboard.
    expect(block.parentElement).toBe(screenEl);
  });

  test('the line sits between the mutable profiles and the immutable Guest card', () => {
    const [second] = seedProfiles(['Second']);
    render(<ProfilesScreen onDone={() => undefined} />);
    const cards = screen.getByTestId('profiles-cards');
    const defaultCard = screen.getByTestId(
      `profile-card-${DEFAULT_PROFILE_ID}`,
    );
    const secondCard = screen.getByTestId(`profile-card-${second.id}`);
    const divider = screen.getByTestId('profile-divider');
    const guestCard = screen.getByTestId('profile-guest-card');
    // The line carries no words — it is a plain divider.
    expect(divider.textContent).toBe('');
    expect(divider.getAttribute('aria-hidden')).toBe('true');
    // Order in the document: Default first, then your created
    // profiles, then the line, then Guest — the line separates the
    // mutable profiles from the immutable Guest (Gary, 2026-11-13
    // ~03:26 PST: "Because guest is an immuteable profile is why we
    // have the seperation right").
    const pos = (a: HTMLElement, b: HTMLElement) =>
      // eslint-disable-next-line no-bitwise
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(pos(defaultCard, secondCard)).toBeTruthy();
    expect(pos(secondCard, divider)).toBeTruthy();
    expect(pos(divider, guestCard)).toBeTruthy();
    // And the divider sits INSIDE the scrollable cards area now,
    // with the Guest card — not below it.
    expect(cards.contains(divider)).toBe(true);
    expect(cards.contains(guestCard)).toBe(true);
  });

  test('below the cards there is ONLY create a profile', () => {
    render(<ProfilesScreen onDone={() => undefined} />);
    const cards = screen.getByTestId('profiles-cards');
    const createButton = screen.getByTestId('profile-create-button');
    const nameInput = screen.getByTestId('profile-name-input');
    // Create lives outside the cards area, below it.
    expect(cards.contains(createButton)).toBe(false);
    expect(cards.contains(nameInput)).toBe(false);
    expect(
      // eslint-disable-next-line no-bitwise
      cards.compareDocumentPosition(createButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Nothing else below the cards: no divider, no guest button,
    // no "Enter as guest" wording anywhere on the screen.
    expect(screen.queryByTestId('profile-guest-button')).toBeNull();
    expect(screen.queryByText(/Enter as guest/i)).toBeNull();
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
    // Every mutable card is inside it (the stored guest record, if
    // any, is never a card — the Guest card is the entry point).
    for (const profile of useProfileStore
      .getState()
      .profiles.filter((p) => p.status !== 'guest')) {
      expect(
        cards.contains(screen.getByTestId(`profile-card-${profile.id}`)),
      ).toBe(true);
    }
    // The Guest card is inside it too, below the line.
    expect(
      cards.contains(screen.getByTestId('profile-guest-card')),
    ).toBe(true);
    // The create controls are outside it, below it — so they stay
    // visible no matter how many cards there are.
    const createButton = screen.getByTestId('profile-create-button');
    const nameInput = screen.getByTestId('profile-name-input');
    expect(cards.contains(createButton)).toBe(false);
    expect(cards.contains(nameInput)).toBe(false);
    expect(
      // eslint-disable-next-line no-bitwise
      cards.compareDocumentPosition(createButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
