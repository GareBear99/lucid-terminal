// @vitest-environment node
/**
 * Screen Recording probe — no prompt when already granted (Gary, 2026-11-07 ~08:30 PST).
 *
 * Gary: opening the Permissions or Modules page prompted for Screen
 * Recording even though it was already granted. The prompt came from
 * the probe itself: it spawned `screencapture` on every view open,
 * and on an unsigned, rebuilt Lucid macOS asks again even though the
 * grant is listed. The fix: the TCC record is read first, and when
 * it says 'granted' no capture is attempted — no prompt, ever, for
 * a granted permission. The capture probe only runs when the record
 * says the permission is not granted.
 *
 * These tests mock the TCC record and the spawned processes (no Mac,
 * no real screencapture) and assert the capture is never spawned
 * when the record says granted — at the probe level and at the
 * Permissions-page probePermissions level.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let tccScreen = 'granted';
let screencaptureShouldFail = false;
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
      if (file === 'screencapture' && screencaptureShouldFail) {
        cb(new Error('screencapture failed'), '', '');
      } else {
        cb(null, '', '');
      }
      return { kill: vi.fn() };
    },
  ),
}));

import { probeScreenRecording } from '../electron/services/computerControlDriver';
import { probePermissions } from '../electron/services/permissions';

const realPlatform = process.platform;

describe('probeScreenRecording — granted TCC never spawns a capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnCalls.length = 0;
    screencaptureShouldFail = false;
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

  it('TCC not-determined + capture succeeds: returns granted and spawns screencapture once', async () => {
    tccScreen = 'not-determined';
    const result = await probeScreenRecording();
    expect(result.granted).toBe(true);
    expect(spawnCalls.filter((f) => f === 'screencapture')).toHaveLength(1);
  });

  it('TCC not-determined + capture fails: returns not-granted with a reason', async () => {
    tccScreen = 'not-determined';
    screencaptureShouldFail = true;
    const result = await probeScreenRecording();
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('test screen capture failed');
    expect(spawnCalls.filter((f) => f === 'screencapture')).toHaveLength(1);
  });

  it('probePermissions: TCC granted reports screen-recording granted without spawning screencapture', async () => {
    tccScreen = 'granted';
    const snapshots = await probePermissions(true);
    const screen = snapshots.find((s) => s.id === 'screen-recording');
    expect(screen?.status).toBe('granted');
    expect(spawnCalls).not.toContain('screencapture');
  });
});
