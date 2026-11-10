// @vitest-environment node
/**
 * Screen Recording probe — TCC record only, never a capture
 * (Gary, 2026-11-10 ~02:02 PST).
 *
 * Gary: opening Settings → Modules or Permissions re-asked for
 * Screen Recording every time. The ask came from the probe
 * itself: it spawned `screencapture` on every view open, and on
 * an unsigned, rebuilt Lucid macOS asks again even though the
 * grant is listed. The 2026-11-07 fix only helped when the TCC
 * record already said 'granted' — for this build the runtime
 * TCC check does not say 'granted', so every probe fell through
 * to the spawn and prompted. The fix: the probe reads the TCC
 * record only and never spawns a capture, in ANY state.
 *
 * For users (Gary, 2026-11-07 + 2026-11-10): granted shows
 * granted and is never re-asked; not granted shows how to grant
 * it and never nags — the prompt happens only when the user
 * clicks Request, or when a feature acts. Revoked: the live
 * probe wins over the recorded grant.
 *
 * These tests mock the TCC record and the spawned processes (no
 * Mac, no real screencapture) and assert the capture is never
 * spawned — at the probe level and at the Permissions-page
 * probePermissions level — and that every TCC state is reported
 * honestly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let tccScreen = 'granted';
const spawnCalls: string[] = [];

const mockGetMediaAccessStatus = vi.fn(
  () => tccScreen as 'granted' | 'denied' | 'not-determined' | 'unknown' | 'restricted',
);
const mockAskForMediaAccess = vi.fn(async () => false);

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => undefined) },
  systemPreferences: {
    getMediaAccessStatus: (...args: unknown[]) =>
      mockGetMediaAccessStatus(...(args as ['screen' | 'microphone' | 'camera'])),
    askForMediaAccess: (...args: unknown[]) =>
      mockAskForMediaAccess(...(args as ['screen' | 'microphone' | 'camera'])),
  },
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(
    (
      file: string,
      _args: unknown,
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      spawnCalls.push(file);
      cb(null, '', '');
      return { kill: vi.fn() };
    },
  ),
}));

import { probeScreenRecording } from '../electron/services/computerControlDriver';
import { probePermissions } from '../electron/services/permissions';

const realPlatform = process.platform;

const ALL_TCC_STATES = ['granted', 'denied', 'not-determined', 'unknown', 'restricted'] as const;

describe('probeScreenRecording — TCC record only, never spawns a capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnCalls.length = 0;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
  });

  it('TCC granted: returns granted without spawning screencapture', async () => {
    tccScreen = 'granted';
    const result = await probeScreenRecording();
    expect(result.granted).toBe(true);
    expect(result.reason).toBeNull();
    expect(spawnCalls).not.toContain('screencapture');
  });

  it('TCC not-determined: returns not-granted WITHOUT spawning screencapture, with the grant path', async () => {
    tccScreen = 'not-determined';
    const result = await probeScreenRecording();
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('Privacy & Security → Screen Recording');
    expect(spawnCalls).not.toContain('screencapture');
  });

  it('TCC denied: returns not-granted WITHOUT spawning screencapture', async () => {
    tccScreen = 'denied';
    const result = await probeScreenRecording();
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('Privacy & Security → Screen Recording');
    expect(spawnCalls).not.toContain('screencapture');
  });

  it('never spawns screencapture in ANY TCC state', async () => {
    for (const state of ALL_TCC_STATES) {
      tccScreen = state;
      spawnCalls.length = 0;
      await probeScreenRecording();
      expect(spawnCalls).not.toContain('screencapture');
    }
  });

  it('probePermissions: TCC granted reports screen-recording granted without spawning screencapture', async () => {
    tccScreen = 'granted';
    const snapshots = await probePermissions(true);
    const screen = snapshots.find((s) => s.id === 'screen-recording');
    expect(screen?.status).toBe('granted');
    expect(spawnCalls).not.toContain('screencapture');
  });

  it('probePermissions: TCC not-determined reports not-determined with the grant path, no spawn', async () => {
    tccScreen = 'not-determined';
    const snapshots = await probePermissions(true);
    const screen = snapshots.find((s) => s.id === 'screen-recording');
    expect(screen?.status).toBe('not-determined');
    expect(screen?.detail).toContain('Privacy & Security → Screen Recording');
    expect(spawnCalls).not.toContain('screencapture');
  });

  it('probePermissions: TCC denied reports denied, no spawn — the live probe wins over the recorded grant', async () => {
    tccScreen = 'denied';
    const snapshots = await probePermissions(true);
    const screen = snapshots.find((s) => s.id === 'screen-recording');
    expect(screen?.status).toBe('denied');
    expect(spawnCalls).not.toContain('screencapture');
  });
});
