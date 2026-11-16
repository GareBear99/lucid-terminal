/**
 * Updates tab — Settings > Updates (Gary, 2026-11-16).
 *
 * "have an updates section for searching for the latest
 * update / about installing the latest version and your prior
 * versions installed on this machine" — one place that shows:
 * - the version running now;
 * - the latest version out (checked against the GitHub
 *   releases, on demand with "Check now" — the launch check
 *   runs it at startup too), its publish date, and its
 *   release page;
 * - how to install the latest version (honest: Lucid does
 *   not update itself yet — download the .dmg from the
 *   release page and replace the app, or pull + rebuild from
 *   the repo for a dev checkout);
 * - the prior versions installed on this machine (the
 *   versions Lucid has actually run here, first-seen date per
 *   version — the list starts with the version running now,
 *   never invented);
 * - the current profile's "Tell me when a new version is out"
 *   toggle — saved profiles only. A guest gets NO toggle: a
 *   guest session always sees the new-version message (guest
 *   wipes anyway, so an opt-out makes no sense). Profiles
 *   that turned the alert off also show in Security, where it
 *   can be turned back on.
 *
 * The toggle only silences the STARTUP notice — this section
 * always shows the latest version and the Check now button,
 * whatever the toggle says.
 */
import { APP_VERSION } from '../../lib/appVersion';
import {
  LUCID_RELEASES_PAGE_URL,
  macDmgAssetName,
} from '../../lib/appUpdate';
import { useAppUpdateStore } from '../../stores/appUpdateStore';
import { useProfileStore, isGuestProfile } from '../../stores/profileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Toggle } from './Toggle';

function openExternal(url: string): void {
  const api = (
    window as unknown as {
      lucidAPI?: { browser?: { openExternal?: (url: string) => Promise<void> } };
    }
  ).lucidAPI?.browser?.openExternal;
  if (api) void api(url);
}

export function UpdatesTab() {
  const status = useAppUpdateStore((s) => s.status);
  const release = useAppUpdateStore((s) => s.release);
  const checkResult = useAppUpdateStore((s) => s.checkResult);
  const lastCheckedAt = useAppUpdateStore((s) => s.lastCheckedAt);
  const lastError = useAppUpdateStore((s) => s.lastError);
  const checkNow = useAppUpdateStore((s) => s.checkNow);
  const installedVersions = useSettingsStore(
    (s) => s.settings.installedAppVersions ?? [],
  );
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const setSkipUpdateAlert = useProfileStore((s) => s.setSkipUpdateAlert);
  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? null;
  const isGuest = isGuestProfile(activeProfile);
  const alertsOn = activeProfile ? activeProfile.skipUpdateAlert !== true : true;
  // Prior versions, newest first (the record is in first-seen
  // order — the most recent run is the most useful at the top).
  const priorVersions = [...installedVersions].reverse();

  return (
    <div className="space-y-4">
      {/* The version running now. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <h3 className="text-sm font-semibold">This version</h3>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Lucid <span className="font-semibold text-[var(--text-secondary)]">v{APP_VERSION}</span> — this
          is the version running now.
        </p>
      </div>

      {/* The latest version out — checked against the GitHub
          releases, on demand here and at startup. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">Latest version</h3>
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={status === 'checking'}
            data-testid="updates-check-now"
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {status === 'checking' ? 'Checking…' : 'Check now'}
          </button>
        </div>
        {status === 'checking' && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Checking the latest release…
          </p>
        )}
        {status === 'idle' && release === null && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Not checked yet — the launch check runs at startup, or
            check now.
          </p>
        )}
        {status === 'error' && (
          <p className="text-xs leading-[1.5] text-red-500">
            {lastError ?? 'The check failed.'} Try again, or open
            the releases page below.
          </p>
        )}
        {release !== null && status !== 'checking' && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            {checkResult?.available === true ? (
              <>
                Lucid{' '}
                <span className="font-semibold text-[var(--text-secondary)]">
                  {release.tagName}
                </span>{' '}
                is out
                {release.publishedAt
                  ? ` (published ${new Date(release.publishedAt).toLocaleDateString()})`
                  : ''}
                — you are on {APP_VERSION}.{' '}
                <button
                  type="button"
                  onClick={() => openExternal(release.htmlUrl)}
                  className="text-[var(--text-secondary)] underline"
                >
                  View release
                </button>
              </>
            ) : (
              <>
                You are on the latest version — release{' '}
                <span className="font-semibold text-[var(--text-secondary)]">
                  {release.tagName}
                </span>
                {release.publishedAt
                  ? ` (published ${new Date(release.publishedAt).toLocaleDateString()})`
                  : ''}
                .
              </>
            )}
          </p>
        )}
        {lastCheckedAt !== null && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Last checked {new Date(lastCheckedAt).toLocaleString()}.
          </p>
        )}
      </div>

      {/* How to install the latest version — honest: no
          auto-update exists, so this is the real path. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <h3 className="text-sm font-semibold">Install the latest version</h3>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Lucid does not update itself yet — there is no
          auto-update. To install the latest version, download
          the Mac .dmg from the{' '}
          <button
            type="button"
            onClick={() => openExternal(LUCID_RELEASES_PAGE_URL)}
            className="text-[var(--text-secondary)] underline"
          >
            releases page
          </button>{' '}
          and replace the app. This Mac is Intel, so the file is{' '}
          <span className="font-semibold text-[var(--text-secondary)]">
            {macDmgAssetName(release?.version ?? APP_VERSION)}
          </span>
          {release !== null && release.downloadUrl !== null && (
            <>
              {' — '}
              <button
                type="button"
                onClick={() => openExternal(release.downloadUrl as string)}
                className="text-[var(--text-secondary)] underline"
              >
                download the {release.tagName} .dmg
              </button>
            </>
          )}
          . For a dev checkout instead, pull the repo and rebuild
          (tsc → vite build → electron-builder).
        </p>
      </div>

      {/* Prior versions installed on this machine — the
          versions Lucid has actually run here. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <h3 className="text-sm font-semibold">
          Prior versions on this machine
        </h3>
        {priorVersions.length === 0 ? (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            No versions recorded yet — the list starts with the
            version running now and grows as new versions run here.
          </p>
        ) : (
          <div className="space-y-2">
            {priorVersions.map((v) => (
              <div key={v.version} className="flex items-center gap-2">
                <span className="text-xs font-semibold flex-1">
                  v{v.version}
                  {v.version === APP_VERSION ? ' (running now)' : ''}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  first ran {new Date(v.firstSeenAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Versions are recorded when Lucid runs them — a version
          that ran here before this record existed is not listed,
          never guessed.
        </p>
      </div>

      {/* The new-version startup message, per profile — saved
          profiles only (Gary, 2026-11-16): a guest session
          always sees the message, so Guest gets no toggle here. */}
      {!isGuest ? (
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <Toggle
            checked={alertsOn}
            onChange={(checked) =>
              activeProfile && setSkipUpdateAlert(activeProfile.id, !checked)
            }
            disabled={!activeProfile}
            ariaLabel="Tell me when a new version is out"
          />
          <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Tell me when a new version is out —{' '}
            {alertsOn
              ? 'On — a new version pops up at startup.'
              : 'Off — a new version will not pop up at startup for this profile. Turn it back on here or in Security.'}
          </span>
        </label>
      ) : (
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          A guest session always sees the new-version message —
          there is no opt-out for Guest.
        </p>
      )}
    </div>
  );
}
