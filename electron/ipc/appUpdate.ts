/**
 * App update IPC — the main-process side of the latest-release
 * check (Gary, 2026-11-16: an Updates section + a startup
 * message when a new version is out).
 *
 * Channels (the renderer consumes exactly this name):
 *   appUpdate:checkLatest — GET the latest release from the
 *     GitHub releases API and return it UNPARSED as JSON.
 *     Parsing + validation happen in the renderer
 *     (src/lib/appUpdate.ts parseAppRelease) — the electron
 *     project must not value-import from src/ (TS6307; see
 *     electron/preload.ts). The renderer cannot fetch it
 *     itself: the app's CSP does not allow api.github.com in
 *     connect-src, so the main process is the only side that
 *     can (same reason as the snapshot manifest fetch).
 *
 * This handler only READS the latest release — it downloads
 * nothing and installs nothing. Lucid has no auto-update:
 * the Updates tab shows the honest install path (download
 * the .dmg from the release page, replace the app).
 */
import type { IpcMain } from 'electron';

/** GitHub releases API — the latest release. */
const LUCID_RELEASES_API_URL =
  'https://api.github.com/repos/GareBear99/lucid-terminal/releases/latest';

/** The fetch gives up after this long — a hung check must
 *  never hang startup (the launch check is best-effort). */
const CHECK_TIMEOUT_MS = 15_000;

export function setupAppUpdateHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'appUpdate:checkLatest',
    async (): Promise<{
      ok: boolean;
      raw?: unknown;
      error?: string;
    }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(LUCID_RELEASES_API_URL, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'lucid-terminal',
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          return {
            ok: false,
            error: `GitHub releases returned ${res.status}.`,
          };
        }
        const raw: unknown = await res.json();
        return { ok: true, raw };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'App update check failed.',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
