/**
 * Profiles screen — the front door, and the security gate (Gary,
 * 2026-11-13 ~02:19 PST: "the profiles needs to be the front door
 * security gate"). Nothing reaches Lucid without passing through
 * this screen: boot is splashscreen → profiles → splashscreen →
 * Lucid, and the only way out of this screen is entering a profile
 * (click a card, create one, or enter as guest). There is no skip,
 * no dismiss, no back door — App.tsx has exactly three setBootPhase
 * call sites and this screen owns the middle one.
 *
 * THE LOOK (Gary, 2026-11-13 ~02:21–02:22 PST: "the cards should
 * be right in the center treat it like an os" / "if it doesnt look
 * like os bootscreen setup i dont want it"): an OS boot/setup
 * screen — macOS Setup Assistant / Windows OOBE / OS login. One
 * centered block, minimal, one focused step: the profile cards
 * RIGHT IN THE CENTER, and below them only create a profile, a
 * divider line, and guest access. Nothing else. The block sizes to
 * its content and centers on the screen; it can never exceed the
 * viewport (max-h-full inside a padded flex center), so nothing is
 * ever cut off — when there are many cards the cards area scrolls
 * inside the centered block and create + line + guest stay visible
 * right under them. (The old spread layout — an h-full column with
 * a flex-1 cards area stretching the controls to the very bottom
 * edge of a 900px viewport with a dead middle — is gone.)
 *
 * Gary, 2026-11-13 ~01:31–01:33 PST: "Lucid should just be guest
 * access and create profile nothing else" + "then the created cards
 * should show in their own scrollable area above". Gary, 2026-11-13
 * ~02:18 PST: "i just want areate profile, a line and guest
 * access". Gary, 2026-11-13 ~03:22–03:26 PST: "Shouldnt need enter
 * as a guest if guest access right there" + "the line needs to be
 * between default an guest" + "as default comes with the program"
 * + "in creator build" + "shouldnt say enter as guest like i said"
 * + "Because guest is an immuteable profile is why we have the
 * seperation right" — confirmed: the line separates the mutable
 * profiles from the immutable Guest. So this screen is ONLY:
 *   (a) the mutable profile cards, in their own scrollable area,
 *       RIGHT IN THE CENTER — Default FIRST (it comes with the
 *       program), then your created profiles — clicking a card
 *       enters that profile immediately (no select-then-enter step,
 *       no "Enter Lucid" button);
 *   (b) a divider line, then the Guest card — Guest is an immutable
 *       profile (always a fresh blank slate, never changed or
 *       deleted), so it sits on its own side of the line. The card
 *       says "Guest Access" (Gary, 2026-11-13 ~07:29 PST:
       "should say Guest Access on lucid guest") — no "Enter as guest"
       wording anywhere;
 *       clicking it creates a fresh guest and enters immediately.
 *   (c) below the cards: create a profile. Nothing else.
 * Each card shows its verified gates + status (temp / unverified /
 * verified / user / guest). Creating a profile enters it
 * immediately, the same way Guest does. The stored guest record
 * (if one exists from a live guest session) is never rendered as
 * its own card — the Guest card is the entry point, and entering
 * always creates a fresh guest.
 *
 * NO deletion on this screen (Gary, 2026-11-12 ~17:36 PST):
 * "profiles should just be create a profile and guest access as a
 * segregated profile and deletion happens within the profile".
 * Deletion lives inside the profile — Settings > Profile tab, on
 * the active profile only. Guests have no deletion at all.
 *
 * Fullscreen overlay (fixed, above the boot splash's z-100): the
 * dashboard stays mounted underneath, so the terminal's always-
 * mounted rule is untouched — this screen covers it opaquely
 * instead of unmounting it. The ROOT mounts opaque (opacity 1 from
 * the first frame — it never fades; animating it let the dashboard
 * show through for 400ms, Gary 2026-11-13 ~02:53 PST "glitches to
 * lucid still on splash") and only the inner centered content
 * block fades in (profiles-content-enter in ProfilesScreen.css,
 * 400ms) — the splash before it fades its own content out on black
 * first, so the handoff is black-to-black, never a hard cut and
 * never a flash of the dashboard.
 */
import { useState } from 'react';
import './ProfilesScreen.css';
import { SplashMist } from '../Splash/SplashMist';
import {
  DEFAULT_PROFILE_ID,
  useProfileStore,
  type Profile,
  type ProfileStatus,
} from '../../stores/profileStore';
import { PROFILE_GATES } from '../../lib/profileGates';

/** Status labels — exported for the Profile tab (Settings), which
 *  shows the same standing for the active profile. */
export const STATUS_LABEL: Record<ProfileStatus, string> = {
  temp: 'Temp',
  unverified: 'Unverified',
  verified: 'Verified',
  user: 'User',
  guest: 'Guest',
};

/** Status badge colours — same export, same reason as STATUS_LABEL. */
export const STATUS_CLASS: Record<ProfileStatus, string> = {
  temp: 'text-zinc-400 border-zinc-500/40',
  unverified: 'text-amber-400 border-amber-500/40',
  verified: 'text-emerald-400 border-emerald-500/40',
  user: 'text-sky-400 border-sky-500/40',
  guest: 'text-violet-300 border-violet-400/40',
};

function formatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return 'Never entered';
  const date = new Date(lastActiveAt);
  if (Number.isNaN(date.getTime())) return 'Never entered';
  return `Last active ${date.toLocaleString()}`;
}

function ProfileCard({
  profile,
  onEnter,
}: {
  profile: Profile;
  /** Clicking a card enters that profile immediately. */
  onEnter: () => void;
}) {
  const verifiedNames = profile.verifiedGates
    .map((id) => PROFILE_GATES.find((g) => g.id === id)?.label ?? id)
    .join(', ');
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Enter as ${profile.name}`}
      data-testid={`profile-card-${profile.id}`}
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEnter();
        }
      }}
      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-medium text-[var(--text-primary)]">
          {profile.name}
        </span>
        <span
          data-testid={`profile-status-${profile.id}`}
          data-status={profile.status}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[profile.status]}`}
        >
          {STATUS_LABEL[profile.status]}
        </span>
      </div>
      <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
        {verifiedNames !== ''
          ? `Verified gates: ${verifiedNames}`
          : 'No verified gates yet'}
      </p>
      <p className="mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
        {formatLastActive(profile.lastActiveAt)}
      </p>
      {profile.status === 'guest' && (
        <p className="mt-2 text-xs leading-[1.5] text-violet-300">
          Guest — the synth stays in demo mode.
        </p>
      )}
    </div>
  );
}

/** The Guest card — the immutable profile's entry point (Gary,
 *  2026-11-13 ~03:22–03:26 PST: guest access is right there, so
 *  there is no separate "Enter as guest" step and the screen never
 *  says "Enter as guest" — the card says "Guest Access" (Gary,
 *  2026-11-13 ~07:29 PST). It is NOT
 *  the stored guest record: clicking it always creates a fresh
 *  guest (always a new guest, always a blank slate) and enters
 *  immediately, the same way clicking any card enters. Same card
 *  form as the mutable profiles, on its own side of the divider
 *  line because Guest is immutable. */
function GuestCard({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Guest Access"
      data-testid="profile-guest-card"
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEnter();
        }
      }}
      className="w-full rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-left backdrop-blur transition-colors hover:bg-violet-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-medium text-[var(--text-primary)]">
          Guest Access
        </span>
        <span
          data-testid="profile-status-guest"
          data-status="guest"
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS.guest}`}
        >
          Guest
        </span>
      </div>
      <p className="mt-2 text-xs leading-[1.5] text-violet-300">
        Guest — the synth stays in demo mode.
      </p>
    </div>
  );
}

export function ProfilesScreen({ onDone }: { onDone: (profileId: string) => void }) {
  const profiles = useProfileStore((s) => s.profiles);
  const createProfile = useProfileStore((s) => s.createProfile);
  const createGuestProfile = useProfileStore((s) => s.createGuestProfile);
  const [name, setName] = useState('');

  // The mutable profiles: Default first (it comes with the
  // program), then your created ones. The stored guest record is
  // never a card — the Guest card below is the entry point.
  const defaultProfile = profiles.find((p) => p.id === DEFAULT_PROFILE_ID);
  const createdProfiles = profiles.filter(
    (p) => p.id !== DEFAULT_PROFILE_ID && p.status !== 'guest',
  );

  // Creating a profile enters it immediately — the same
  // create-and-enter shape as Guest below.
  const handleCreate = () => {
    const created = createProfile(name);
    if (!created) return;
    setName('');
    onDone(created.id);
  };

  // Guest (Gary, 2026-11-12 ~16:41 PST): a guest profile is created
  // on the spot and entered immediately — no name, no gate. Its
  // synth is demo-locked: the guest can compare the demo synth vs
  // Iteration 8, but never builds or replaces.
  const handleGuest = () => {
    const guest = createGuestProfile();
    onDone(guest.id);
  };

  return (
    <div
      role="dialog"
      aria-label="Choose a profile"
      data-testid="profiles-screen"
      className="fixed inset-0 z-[110] isolate flex items-center justify-center bg-black p-6"
    >
      <SplashMist />
      {/* The OS-setup block: one centered column, sized to its
          content, never taller than the viewport — the cards area
          scrolls inside it when there are many, and create + line
          + guest stay visible right under the cards. The block
          carries the 400ms entrance fade — the root above never
          fades, so the dashboard underneath can never show through. */}
      <div
        data-testid="profiles-content"
        className="profiles-content-enter relative flex max-h-full w-full max-w-md flex-col"
      >
        <h1 className="relative shrink-0 text-center text-2xl font-semibold tracking-wide text-[var(--text-primary)]">
          Profiles
        </h1>

        {/* The mutable cards — Default first, then your created
            profiles — then the line, then the immutable Guest card.
            The line sits between the mutable profiles and Guest
            because Guest is immutable (Gary, 2026-11-13 ~03:26
            PST). The cards area scrolls inside the centered block,
            so the create control below stays visible no matter how
            many cards there are. */}
        <div
          data-testid="profiles-cards"
          className="relative mt-8 min-h-0 flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-3">
            {defaultProfile && (
              <ProfileCard
                profile={defaultProfile}
                onEnter={() => onDone(defaultProfile.id)}
              />
            )}
            {createdProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEnter={() => onDone(profile.id)}
              />
            ))}
            <div
              aria-hidden="true"
              data-testid="profile-divider"
              className="my-1 h-px bg-white/10"
            />
            <GuestCard onEnter={handleGuest} />
          </div>
        </div>

        {/* Below the cards, and nothing else: create a profile. */}
        <div className="relative mt-6 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder="New profile name"
              aria-label="New profile name"
              data-testid="profile-name-input"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={name.trim() === ''}
              data-testid="profile-create-button"
              className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
            >
              Create profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
