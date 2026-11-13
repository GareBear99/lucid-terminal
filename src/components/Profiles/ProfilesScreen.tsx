/**
 * Profiles screen (Gary, 2026-11-12 ~10:48 + 10:52 PST, reaffirmed
 * 12:26 PST; redesigned 2026-11-13 ~01:31 PST): the profile step of
 * startup — splashscreen → profile → splashscreen → Lucid. Clean
 * glass, grey-blackish vanta: pure black + the splash's own mist
 * behind glass cards, no new look invented.
 *
 * Gary, 2026-11-13 ~01:31–01:33 PST: "Lucid should just be guest
 * access and create profile nothing else" + "then the created cards
 * should show in their own scrollable area above". So this screen
 * is ONLY:
 *   (a) the created profile cards, in their own scrollable area
 *       ABOVE — clicking a card enters that profile immediately
 *       (no select-then-enter step, no "Enter Lucid" button);
 *   (b) below, guest access + create a profile. Nothing else.
 * Each card shows its verified gates + status (temp / unverified /
 * verified / user / guest). Creating a profile enters it
 * immediately, the same way entering as guest does.
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
 * instead of unmounting it.
 */
import { useState } from 'react';
import { SplashMist } from '../Splash/SplashMist';
import {
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

export function ProfilesScreen({ onDone }: { onDone: (profileId: string) => void }) {
  const profiles = useProfileStore((s) => s.profiles);
  const createProfile = useProfileStore((s) => s.createProfile);
  const createGuestProfile = useProfileStore((s) => s.createGuestProfile);
  const [name, setName] = useState('');

  // Creating a profile enters it immediately — the same
  // create-and-enter shape as entering as guest below.
  const handleCreate = () => {
    const created = createProfile(name);
    if (!created) return;
    setName('');
    onDone(created.id);
  };

  // Enter as guest (Gary, 2026-11-12 ~16:41 PST): a guest profile
  // is created on the spot and entered immediately — no name, no
  // gate. Its synth is demo-locked: the guest can compare the demo
  // synth vs Iteration 8, but never builds or replaces.
  const handleGuest = () => {
    const guest = createGuestProfile();
    onDone(guest.id);
  };

  return (
    <div
      role="dialog"
      aria-label="Choose a profile"
      data-testid="profiles-screen"
      className="fixed inset-0 z-[110] bg-black"
    >
      <div className="relative isolate mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-10">
        <SplashMist />
        <h1 className="relative shrink-0 text-center text-2xl font-semibold tracking-wide text-[var(--text-primary)]">
          Profiles
        </h1>

        {/* Created cards — their own scrollable area above. It
            takes the free height and scrolls, so the guest +
            create controls below stay visible no matter how many
            cards there are. */}
        <div
          data-testid="profiles-cards"
          className="relative mt-8 min-h-0 flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-3">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEnter={() => onDone(profile.id)}
              />
            ))}
          </div>
        </div>

        {/* Below the cards, and nothing else: create a profile +
            guest access. */}
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

          <button
            type="button"
            onClick={handleGuest}
            data-testid="profile-guest-button"
            className="mt-3 w-full rounded-lg border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            Enter as guest — synth locked to demo mode
          </button>
        </div>
      </div>
    </div>
  );
}
