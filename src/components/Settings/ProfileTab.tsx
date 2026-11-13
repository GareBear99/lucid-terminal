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
 * GUESTS (Gary, ~17:36 + ~17:53 + ~17:56 PST): a guest is
 * demo-locked AND has NO deletion — no delete control exists for
 * a guest profile anywhere in this tab, and the store refuses a
 * guest wipe outright. "Guest is all one account" + "always a
 * new guest": exactly one guest profile ever exists, and entering
 * as guest always creates a fresh one — so no guest profiles ever
 * accumulate and no owner-delete of a guest is needed.
 *
 * AUTHENTICATOR GATE (Gary, 2026-11-12 ~17:59 PST): "that will
 * also require the paired google authenticator if enabled when
 * user later etc" — deleting a profile requires the paired
 * Google Authenticator code when 2FA is enabled. The 2FA system
 * already exists (totpAuth + Security tab enrollment; the secret
 * lives in the main process, the renderer only ever knows
 * hasTotpSecret) — this tab only gates the delete on it: when
 * hasTotpSecret is on, the confirm asks for the 6-digit code and
 * verifies it through settingsStore.verifyTotpCode (main-process
 * TOTP, lockout included) before wiping; when off, deletion
 * proceeds exactly as before, with no prompt. The code is
 * cleared after every check, whatever the answer (same pattern
 * as the Security tab).
 */
import { useState } from 'react';
import {
  DEFAULT_PROFILE_ID,
  useProfileStore,
} from '../../stores/profileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { isTotpCodeFormat } from '../../lib/totpAuth';
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
  const hasTotpSecret = useSettingsStore((s) => s.hasTotpSecret);
  const verifyTotpCode = useSettingsStore((s) => s.verifyTotpCode);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // The Authenticator code for the delete gate — only ever shown
  // when 2FA is enabled (hasTotpSecret). Cleared after every
  // check, whatever the answer.
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

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
    // Authenticator gate (Gary, 2026-11-12 ~17:59 PST): deleting a
    // profile requires the paired Google Authenticator code when
    // 2FA is enabled. When it is off, deletion proceeds exactly as
    // before, with no prompt. The code is cleared after every
    // check, whatever the answer (same pattern as SecurityTab).
    if (hasTotpSecret) {
      if (!isTotpCodeFormat(code)) {
        setCodeError('Type the 6-digit code from Google Authenticator.');
        return;
      }
      setCodeBusy(true);
      try {
        const result = await verifyTotpCode(code);
        setCode('');
        if (result.locked) {
          const minutes = Math.ceil(result.retryAfterMs / 60000);
          setCodeError(
            `Authenticator is locked — try again in ${minutes} minute${minutes === 1 ? '' : 's'}. The profile was not deleted.`,
          );
          return;
        }
        if (!result.ok) {
          setCodeError(
            "That code doesn't match — the profile was not deleted.",
          );
          return;
        }
      } catch {
        setCode('');
        setCodeError(
          'The code could not be checked — the profile was not deleted.',
        );
        return;
      } finally {
        setCodeBusy(false);
      }
    }
    setDeleteArmed(false);
    setCode('');
    setCodeError(null);
    await wipeProfile(active.id);
    // The deleted profile is gone (or, for 'default', reset) — the
    // store falls back to the implicit profile and this tab
    // re-renders from the store. You stay in Lucid.
  };

  const handleCancelDelete = () => {
    setDeleteArmed(false);
    setCode('');
    setCodeError(null);
  };

  const handleArmDelete = () => {
    setCode('');
    setCodeError(null);
    setDeleteArmed(true);
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
              {hasTotpSecret && (
                <div className="mt-2">
                  <label
                    htmlFor="profile-tab-delete-code"
                    className="text-xs text-red-200"
                  >
                    Google Authenticator is on — type the 6-digit code
                    to delete this profile.
                  </label>
                  <input
                    id="profile-tab-delete-code"
                    data-testid="profile-tab-delete-code-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    disabled={codeBusy}
                    className="mt-1 w-32 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  />
                </div>
              )}
              {codeError !== null && (
                <p
                  data-testid="profile-tab-delete-code-error"
                  className="mt-2 text-xs text-red-300"
                >
                  {codeError}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="profile-tab-delete-confirm-button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={codeBusy}
                  className="rounded-md bg-red-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  data-testid="profile-tab-delete-cancel-button"
                  onClick={handleCancelDelete}
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
              onClick={handleArmDelete}
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
