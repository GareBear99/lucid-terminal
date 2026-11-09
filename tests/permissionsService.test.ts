// @vitest-environment node
/**
 * Permissions probe service tests (Gary, 2026-11-07 ~02:47 PST).
 *
 * The service probes the REAL state of every macOS permission.
 * On a non-macOS platform (this VM runs Linux) every permission
 * is honestly 'not-applicable' — the permissions are macOS TCC,
 * and saying so is honest. The macOS probe paths themselves are
 * exercised live on the Mac (Settings → Permissions shows the
 * probed states there).
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetMediaAccessStatus = vi.fn(() => 'not-determined' as const);
const mockAskForMediaAccess = vi.fn(async () => false);
const mockOpenExternal = vi.fn(async (_url: string) => undefined);

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/lucid-test') },
  shell: { openExternal: (...args: unknown[]) => mockOpenExternal(...(args as [string])) },
  systemPreferences: {
    getMediaAccessStatus: (...args: unknown[]) =>
      mockGetMediaAccessStatus(...(args as ['screen' | 'microphone' | 'camera'])),
    askForMediaAccess: (...args: unknown[]) =>
      mockAskForMediaAccess(...(args as ['screen' | 'microphone' | 'camera'])),
  },
}));

import { openPermissionSettings, probePermissions, requestPermission } from '../electron/services/permissions';

describe('probePermissions off macOS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // These two assert the off-macOS branch: on macOS the service
  // probes the real TCC state instead (the macOS probe paths are
  // exercised live on the Mac — Settings → Permissions shows the
  // probed states there — per the header above), so they only run
  // where the platform is not darwin. The workflow runs them on
  // ubuntu-latest; the macOS build job skips them, it does not
  // weaken the gate — the assertions still run on every Linux run.
  it.skipIf(process.platform === 'darwin')(
    'reports every permission as not-applicable on Linux',
    async () => {
      const snapshots = await probePermissions(true);
      expect(snapshots).toHaveLength(5);
      expect(snapshots.map((s) => s.id)).toEqual([
        'accessibility',
        'screen-recording',
        'full-disk-access',
        'microphone',
        'camera',
      ]);
      for (const s of snapshots) {
        expect(s.status).toBe('not-applicable');
        expect(s.detail).toContain('do not apply on this platform');
      }
    },
  );

  it.skipIf(process.platform === 'darwin')(
    'requestPermission refuses off macOS without prompting',
    async () => {
      expect(await requestPermission('screen-recording')).toBe(false);
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    },
  );

  it('openPermissionSettings opens the Screen Recording pane URL', async () => {
    expect(await openPermissionSettings('screen-recording')).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  });

  it('openPermissionSettings opens the Accessibility pane URL', async () => {
    expect(await openPermissionSettings('accessibility')).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    );
  });
});
