/**
 * Profile tab — Settings > Profile (Gary, 2026-11-12 ~17:36 PST):
 * "profiles should just be create a profile and guest access as a
 * segregated profile and deletion happens within the profile".
 *
 * This is the profile's OWN view — the place deletion lives. The
 * Profiles screen (startup) is just create + guest access + choose
 * and has NO delete controls. Here, the active profile's own
 * details are shown (name, status, verified gates) and deletion
 * happens from within it: a two-step confirm, then the store wipes
 * it. After deleting the active profile you stay in Lucid — the
 * active profile falls back to Default (or, for Default itself,
 * resets to a fresh temp).
 *
 * The delete boundary is Gary's (~12:28 PST): the synth goes back
 * to demo and chats + driving-agent memory are gone; files,
 * homunculi and daemons stay ("like you never left"). The confirm
 * copy says exactly that.
 *
 * GUESTS (Gary, ~17:36 PST): a guest is demo-locked AND has NO
 * deletion — no delete control exists for a guest profile anywhere
 * in this tab, and the store refuses a guest wipe outright. OPEN
 * QUESTION (Gary's call): can the owner ever remove a guest
 * profile? No owner-delete exists — do not invent one.
 */
import { useState } from 'react';
import {
  DEFAULT_PROFILE_ID,
  useProfileStore,
} from '../../stores/profileStore';
import { PROFILE_GATES } from '../../lib/profileGates';
import {
  STATUS_CLASS,
  STATUS_LABEL,
} from '../Profiles/ProfilesScreen';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never entered';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never entered';
  return date.toLocaleString();
}

export function ProfileTab() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const wipeProfile = useProfileStore((s) => s.wipeProfile);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const active =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  if (!active) {
    return (
      <div data-testid="profile-tab" className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
            Profile
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            No active profile.
          </p>
        </section>
      </div>
    );
  }

  const isGuest = active.status === 'guest';
  const isDefault = active.id === DEFAULT_PROFILE_ID;
  const verifiedNames = active.verifiedGates
    .map((id) => PROFILE_GATES.find((g) => g.id === id)?.label ?? id)
    .join(', ');

  const handleConfirmDelete = async () => {
    setDeleteArmed(false);
    await wipeProfile(active.id);
    // The deleted profile is gone (or, for 'default', reset) — the
    // store falls back to the implicit profile and this tab
    // re-renders from the store. You stay in Lucid.
  };

  return (
    <div data-testid="profile-tab" className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          Profile
        </h3>
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="profile-tab-name"
            className="truncate text-base font-medium text-[var(--text-primary)]"
          >
            {active.name}
          </span>
          <span
            data-testid="profile-tab-status"
            data-status={active.status}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[active.status]}`}
          >
            {STATUS_LABEL[active.status]}
          </span>
        </div>
        <p
          data-testid="profile-tab-gates"
          className="mt-1 text-xs text-[var(--text-muted)]"
        >
          {verifiedNames !== ''
            ? `Verified gates: ${verifiedNames}`
            : 'No verified gates yet'}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Last active {formatDate(active.lastActiveAt)}
        </p>
        {isGuest && (
          <p
            data-testid="profile-tab-guest-note"
            className="mt-0.5 text-xs text-violet-300"
          >
            Guest — the synth stays in demo mode. Guest profiles have
            no deletion.
          </p>
        )}
      </section>

      {!isGuest && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
            Delete profile
          </h3>
          {deleteArmed ? (
            <div
              data-testid="profile-tab-delete-confirm"
              className="rounded-lg border border-red-500/40 bg-red-500/10 p-3"
            >
              <p className="text-xs leading-relaxed text-red-200">
                Delete this profile? The synth goes back to demo and
                chats + driving-agent memory are gone. Files,
                homunculi and daemons stay, like you never left.
                {isDefault &&
                  ' Default can\u2019t be removed — deleting it resets it to a fresh profile instead.'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="profile-tab-delete-confirm-button"
                  onClick={() => void handleConfirmDelete()}
                  className="rounded-md bg-red-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  data-testid="profile-tab-delete-cancel-button"
                  onClick={() => setDeleteArmed(false)}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="profile-tab-delete-button"
              onClick={() => setDeleteArmed(true)}
              className="rounded-md border border-white/10 px-3 py-1 text-xs text-[var(--text-muted)] hover:border-red-500/50 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
            >
              Delete profile
            </button>
          )}
        </section>
      )}
    </div>
  );
}
