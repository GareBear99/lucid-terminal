/**
 * App update store — the live release CHECK caller (Gary,
 * 2026-11-16: an Updates section + a startup message when a
 * new version is out).
 *
 * THE CALLER (same shape as the snapshot update store):
 * - checkNow() fetches the latest GitHub release (main
 *   process — electron/ipc/appUpdate.ts, the renderer never
 *   fetches it itself), hands it to checkAppUpdate with the
 *   installed version (APP_VERSION) and this profile's
 *   opt-out, and records the decision. On launch (App.tsx
 *   init, after settings load) and on manual check (the
 *   Updates tab's "Check now" button).
 * - When a newer version exists, the alert (AppUpdateAlert
 *   dialog, rendered by App.tsx) shows once at startup unless
 *   this profile opted out. "View release" opens the release
 *   page; "Not now" closes without updating. There is NO
 *   auto-update in Lucid — nothing here downloads or installs
 *   anything; the Updates tab shows the honest install path
 *   (download the .dmg, replace the app).
 * - checkNow() also records the running version in the
 *   machine's version history (settings.installedAppVersions)
 *   when it is not there yet — the history is what the
 *   Updates tab lists as "prior versions installed on this
 *   machine". Best-effort and never blocking: a failed record
 *   leaves the check itself untouched.
 *
 * Pure state + guarded storage (no window/IPC access at module
 * load) so it can be imported by tests in a node environment.
 * The bridge is read lazily inside checkNow.
 */
import { create } from 'zustand';
import { APP_VERSION } from '../lib/appVersion';
import {
  checkAppUpdate,
  parseAppRelease,
  recordVersionSeen,
  type AppRelease,
  type AppUpdateCheckResult,
} from '../lib/appUpdate';
import { useProfileStore } from './profileStore';
import { useSettingsStore } from './settingsStore';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'error';

/** The app-update bridge, or null when this view has none
 *  (tests, or a renderer without the preload bridge). */
export interface AppUpdateBridge {
  checkLatest: () => Promise<{
    ok: boolean;
    raw?: unknown;
    error?: string;
  }>;
}

function getAppUpdateApi(): AppUpdateBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { lucidAPI?: { appUpdate?: unknown } })
    .lucidAPI?.appUpdate;
  if (typeof api !== 'object' || api === null) return null;
  return api as AppUpdateBridge;
}

/** True when the settings bridge is present (an older
 *  preload without it must not make the version-history
 *  record throw). */
function hasSettingsApi(): boolean {
  if (typeof window === 'undefined') return false;
  const api = (window as unknown as { lucidAPI?: { settings?: unknown } })
    .lucidAPI?.settings;
  return typeof api === 'object' && api !== null;
}

interface AppUpdateState {
  status: AppUpdateStatus;
  /** The last fetched release (parsed + validated). */
  release: AppRelease | null;
  /** The decision for the last fetched release. */
  checkResult: AppUpdateCheckResult | null;
  /** When the last check ran (Date.now()), or null. */
  lastCheckedAt: number | null;
  /** Why the last check failed, or null. */
  lastError: string | null;
  /** Version the alert-shown tick was already logged for
   *  (the tick fires once per dialog appearance). Reserved
   *  for the ring log when app-update events land there;
   *  today nothing logs it (see src/lib/appUpdate.ts). */
  lastAlertShownVersion: string | null;

  /** Fetch the latest release + decide. Launch + manual check. */
  checkNow: () => Promise<void>;
  /** Close the alert. dontAsk records "do not show again"
   *  for THIS profile (guest never opts out — the dialog
   *  hides the checkbox for Guest and the set is refused). */
  dismiss: (dontAsk: boolean) => void;
  /** Mark the alert as shown for this release (once per
   *  dialog appearance). */
  markAlertShown: () => void;
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  release: null,
  checkResult: null,
  lastCheckedAt: null,
  lastError: null,
  lastAlertShownVersion: null,

  checkNow: async () => {
    const { status } = get();
    if (status === 'checking') return;
    // The running version belongs in the machine's history
    // whether or not the release check itself succeeds — it
    // is what the Updates tab lists as prior versions on this
    // machine. Best-effort: a failed record never blocks the
    // check.
    if (hasSettingsApi()) {
      try {
        const history =
          useSettingsStore.getState().settings.installedAppVersions ?? [];
        const next = recordVersionSeen(
          history,
          APP_VERSION,
          new Date().toISOString(),
        );
        if (next.length !== history.length) {
          await useSettingsStore
            .getState()
            .updateSetting('installedAppVersions', next);
        }
      } catch {
        // History record failed — the check still runs.
      }
    }
    const api = getAppUpdateApi();
    if (api === null) {
      set({
        status: 'error',
        lastError: 'App update check is not available in this view.',
      });
      return;
    }
    set({ status: 'checking', lastError: null });
    try {
      const fetched = await api.checkLatest();
      if (!fetched.ok) {
        set({
          status: 'error',
          lastError: fetched.error ?? 'App update check failed.',
          lastCheckedAt: Date.now(),
        });
        return;
      }
      let release: AppRelease;
      try {
        release = parseAppRelease(fetched.raw);
      } catch (err) {
        set({
          status: 'error',
          lastError:
            err instanceof Error
              ? err.message
              : 'Latest release did not parse.',
          lastCheckedAt: Date.now(),
        });
        return;
      }
      const profileState = useProfileStore.getState();
      const active = profileState.profiles.find(
        (p) => p.id === profileState.activeProfileId,
      );
      const skipUpdateAlert = active?.skipUpdateAlert === true;
      const result = checkAppUpdate(release, skipUpdateAlert);
      set({
        status: result.available ? 'update-available' : 'up-to-date',
        release,
        checkResult: result,
        lastCheckedAt: Date.now(),
      });
    } catch (err) {
      set({
        status: 'error',
        lastError:
          err instanceof Error ? err.message : 'App update check failed.',
        lastCheckedAt: Date.now(),
      });
    }
  },

  dismiss: (dontAsk) => {
    if (dontAsk) {
      // "Do not show again" is per-profile, saved profiles
      // only (Gary, 2026-11-16): a guest session always sees
      // the new-version message — there is no opt-out for
      // Guest, and the store refuses the set anyway.
      const profileState = useProfileStore.getState();
      const activeId = profileState.activeProfileId;
      if (activeId) {
        profileState.setSkipUpdateAlert(activeId, true);
      }
    }
    set({ status: 'idle' });
  },

  markAlertShown: () => {
    const { status, release, checkResult, lastAlertShownVersion } = get();
    if (
      status !== 'update-available' ||
      release === null ||
      checkResult?.showAlert !== true ||
      lastAlertShownVersion === release.version
    ) {
      return;
    }
    // No ring tick yet: app-update events are not in the
    // event ring (see src/lib/appUpdate.ts). The version is
    // still remembered so a future tick fires once per
    // dialog appearance, not once per render.
    set({ lastAlertShownVersion: release.version });
  },
}));
