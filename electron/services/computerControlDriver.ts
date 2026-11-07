/**
 * Computer-control driver — the real OS driver for the
 * computer-control segment (Gary, 2026-11-06): AppleScript System
 * Events + screencapture, macOS only, spawned from Electron's main
 * process. The segment's core (src/lib/computerControl.ts) owns the
 * lock, the single-flight slot, the timeouts, the read-back
 * verification and the protected targets; this driver is dumb — it
 * just does what the core tells it, one call at a time. Every spawn
 * has a timeout, so a hung osascript can never wedge the driver.
 *
 * What it does:
 * - listApps: one osascript — every visible process, its frontmost
 *   window's title + geometry, and whether it is frontmost.
 * - observe: is the target frontmost (focus), the frontmost window's
 *   geometry, the focused control's role (for the password refusal),
 *   and a fingerprint — the SHA-256 of a screencapture of the
 *   target window's rectangle (scoped to the window, not the whole
 *   screen, so the menu-bar clock does not read as "changed").
 * - click / type / key: activate the target, then System Events
 *   `click at`, `keystroke`, or `key code` (with modifiers).
 * - openApp / activate: `open -a` / `tell application to activate`.
 * - killPid: Node process.kill(pid, 'SIGKILL') — exact pid only.
 *
 * macOS permissions gate: the driver needs Accessibility (System
 * Events) + Screen Recording (screencapture). checkAvailability
 * probes both; when either is missing it reports unavailable with
 * the reason, and never silently degrades into acting blind.
 */
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs/promises';
import type {
  ComputerControlAppWindow,
  ComputerControlDriver,
  ComputerControlDriverObservation,
} from '../../src/lib/computerControl';

const SPAWN_TIMEOUT_MS = 10_000;
const AVAILABILITY_CACHE_MS = 30_000;

/** Run a command with a timeout — rejects on timeout, and kills
 *  the child so a hung spawn can never wedge the driver. */
function runWithTimeout(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
    // execFile's own timeout kills the child; this is the belt to
    // its braces — a second timer that force-kills on SIGKILL.
    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }, timeoutMs + 1000);
    killer.unref?.();
  });
}

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runOsascript(script: string): Promise<string> {
  return runWithTimeout('osascript', ['-e', script], SPAWN_TIMEOUT_MS).then(
    ({ stdout }) => stdout.trim(),
  );
}

/** Key names to System Events key codes. */
const KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const MODIFIER_NAMES: Record<string, string> = {
  cmd: 'command down',
  command: 'command down',
  ctrl: 'control down',
  control: 'control down',
  option: 'option down',
  alt: 'option down',
  shift: 'shift down',
};

/**
 * The two permission probes, as module-level functions so the
 * central permissions service (electron/services/permissions.ts)
 * reuses them instead of duplicating the probe logic — one probe
 * per permission, used by both the driver and the tracker.
 *
 * Accessibility probe — System Events must answer. When it does
 * not, the reason is honest about the platform limit: macOS does
 * not tell the app whether Access was denied or never asked, so
 * the reason says "not granted" and where to grant it, not "denied
 * by the user" (which would claim knowledge Lucid does not have).
 */
export async function probeAccessibility(): Promise<{ granted: boolean; reason: string | null }> {
  if (process.platform !== 'darwin') {
    return { granted: false, reason: 'Accessibility is macOS-only' };
  }
  try {
    await runOsascript('tell application "System Events" to get name of first process whose frontmost is true');
    return { granted: true, reason: null };
  } catch {
    return {
      granted: false,
      reason: 'Accessibility permission not granted — grant Lucid access in System Settings → Privacy & Security → Accessibility',
    };
  }
}

/** Screen Recording probe — screencapture must produce a file. */
export async function probeScreenRecording(): Promise<{ granted: boolean; reason: string | null }> {
  if (process.platform !== 'darwin') {
    return { granted: false, reason: 'Screen Recording is macOS-only' };
  }
  const probeFile = join(tmpdir(), `lucid-cc-probe-${process.pid}.png`);
  try {
    await runWithTimeout('screencapture', ['-x', '-t', 'png', probeFile], SPAWN_TIMEOUT_MS);
    return { granted: true, reason: null };
  } catch {
    // A failed capture does NOT prove the permission is missing —
    // it can also fail right after granting (Lucid needs a restart
    // to pick the grant up) or after Lucid is rebuilt (an unsigned,
    // rebuilt binary is not recognised for capture even though the
    // grant is listed). So the reason says what was observed and
    // what to do, never that the permission is definitely absent —
    // the permissions service (which reads the TCC record) is the
    // one that knows whether it is granted. (Gary, 2026-11-07
    // ~06:22 PST: the old wording sent him to Settings for a
    // permission he had already granted.)
    return {
      granted: false,
      reason: 'A test screen capture failed — Screen Recording may not be granted, or Lucid may need a restart after granting. Grant Lucid access in System Settings → Privacy & Security → Screen Recording if it is not listed there, then restart Lucid.',
    };
  } finally {
    await unlink(probeFile).catch(() => undefined);
  }
}

export function createMacComputerControlDriver(): ComputerControlDriver {
  let availabilityCache: { at: number; available: boolean; reason: string | null } | null = null;

  const checkAvailability = async (): Promise<{ available: boolean; reason: string | null }> => {
    if (process.platform !== 'darwin') {
      return { available: false, reason: 'computer control is macOS-only' };
    }
    if (availabilityCache && Date.now() - availabilityCache.at < AVAILABILITY_CACHE_MS) {
      return { available: availabilityCache.available, reason: availabilityCache.reason };
    }
    // Accessibility probe — System Events must answer.
    const accessibility = await probeAccessibility();
    if (!accessibility.granted) {
      const result = { available: false, reason: accessibility.reason };
      availabilityCache = { at: Date.now(), ...result };
      return result;
    }
    // Screen Recording probe — screencapture must produce a file.
    const screenRecording = await probeScreenRecording();
    if (!screenRecording.granted) {
      const result = { available: false, reason: screenRecording.reason };
      availabilityCache = { at: Date.now(), ...result };
      return result;
    }
    const result = { available: true, reason: null };
    availabilityCache = { at: Date.now(), ...result };
    return result;
  };

  const listApps = async (): Promise<ComputerControlAppWindow[]> => {
    if (process.platform !== 'darwin') return [];
    const script = [
      'tell application "System Events"',
      'set out to ""',
      'repeat with p in (every process whose visible is true)',
      'set appName to name of p',
      'set isFront to frontmost of p',
      'try',
      'set w to first window of p',
      'set pos to position of w',
      'set sz to size of w',
      'set t to name of w',
      'set out to out & appName & "|||" & isFront & "|||" & t & "|||" & (item 1 of pos) & "|||" & (item 2 of pos) & "|||" & (item 1 of sz) & "|||" & (item 2 of sz) & "\n"',
      'on error',
      'set out to out & appName & "|||" & isFront & "|||" & "" & "|||" & "" & "|||" & "" & "|||" & "" & "|||" & "" & "\n"',
      'end try',
      'end repeat',
      'return out',
      'end tell',
    ].join('\n');
    const out = await runOsascript(script);
    const apps: ComputerControlAppWindow[] = [];
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('|||');
      if (parts.length < 7) continue;
      const [appName, isFront, title, x, y, w, h] = parts;
      const hasGeometry = x !== '' && y !== '' && w !== '' && h !== '';
      apps.push({
        id: appName,
        appName,
        title: title || appName,
        focused: isFront === 'true',
        geometry: hasGeometry
          ? { x: Number(x), y: Number(y), width: Number(w), height: Number(h) }
          : null,
      });
    }
    return apps;
  };

  const observe = async (targetId: string | null): Promise<ComputerControlDriverObservation> => {
    if (process.platform !== 'darwin') {
      return {
        targetId,
        focused: false,
        focusedControlRole: null,
        fingerprint: null,
        geometry: null,
        detail: 'computer control is macOS-only',
      };
    }
    const apps = await listApps();
    const target = targetId ? apps.find((a) => a.id === targetId) : apps.find((a) => a.focused);
    const focused = target ? target.focused : false;
    const geometry = target?.geometry ?? null;

    // Focused control role — for the password refusal. Best effort:
    // when it cannot be determined the role is null ('unknown') and
    // the core logs that, but cannot refuse what it cannot see.
    let focusedControlRole: string | null = null;
    if (target) {
      try {
        const role = await runOsascript(
          `tell application "System Events" to tell process "${escapeAppleScriptString(target.appName)}" to get role of (first UI element of front window whose focused is true)`,
        );
        focusedControlRole = role || null;
      } catch {
        focusedControlRole = null;
      }
    }

    // Fingerprint — a screencapture of the target window's
    // rectangle, hashed. Scoped to the window so the menu-bar clock
    // does not read as "changed". Whole screen when the geometry is
    // unknown.
    let fingerprint: string | null = null;
    const shotFile = join(tmpdir(), `lucid-cc-shot-${process.pid}-${Date.now()}.png`);
    try {
      const args = geometry
        ? ['-x', '-t', 'png', '-R', `${geometry.x},${geometry.y},${geometry.width},${geometry.height}`, shotFile]
        : ['-x', '-t', 'png', shotFile];
      await runWithTimeout('screencapture', args, SPAWN_TIMEOUT_MS);
      const { readFile } = await import('fs/promises');
      const png = await readFile(shotFile);
      fingerprint = createHash('sha256').update(png).digest('hex');
    } catch {
      fingerprint = null;
    } finally {
      await unlink(shotFile).catch(() => undefined);
    }

    return {
      targetId: target?.id ?? targetId,
      focused,
      focusedControlRole,
      fingerprint,
      geometry,
      detail: target
        ? `${target.appName} — ${target.title}${focused ? ' (focused)' : ' (not focused)'}`
        : `no such target: ${targetId ?? '(frontmost)'}`,
    };
  };

  const activate = async (targetId: string): Promise<void> => {
    if (process.platform !== 'darwin') throw new Error('computer control is macOS-only');
    await runOsascript(`tell application "${escapeAppleScriptString(targetId)}" to activate`);
  };

  const click = async (targetId: string, x: number, y: number): Promise<void> => {
    if (process.platform !== 'darwin') throw new Error('computer control is macOS-only');
    await activate(targetId);
    await runOsascript(`tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`);
  };

  const type = async (targetId: string, text: string): Promise<void> => {
    if (process.platform !== 'darwin') throw new Error('computer control is macOS-only');
    await activate(targetId);
    await runOsascript(
      `tell application "System Events" to keystroke "${escapeAppleScriptString(text)}"`,
    );
  };

  const key = async (targetId: string, keys: string[]): Promise<void> => {
    if (process.platform !== 'darwin') throw new Error('computer control is macOS-only');
    await activate(targetId);
    const modifiers: string[] = [];
    let keyName: string | null = null;
    for (const k of keys) {
      const lower = k.toLowerCase();
      if (MODIFIER_NAMES[lower]) {
        modifiers.push(MODIFIER_NAMES[lower]);
      } else {
        keyName = lower;
      }
    }
    if (!keyName) throw new Error('key needs a non-modifier key');
    const using = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
    if (keyName.length === 1) {
      await runOsascript(
        `tell application "System Events" to keystroke "${escapeAppleScriptString(keyName)}"${using}`,
      );
      return;
    }
    const code = KEY_CODES[keyName];
    if (code === undefined) throw new Error(`unknown key: ${keyName}`);
    await runOsascript(
      `tell application "System Events" to key code ${code}${using}`,
    );
  };

  const openApp = async (appName: string): Promise<void> => {
    if (process.platform !== 'darwin') throw new Error('computer control is macOS-only');
    await runWithTimeout('open', ['-a', appName], SPAWN_TIMEOUT_MS);
  };

  const killPid = async (pid: number): Promise<void> => {
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error('killPid needs an exact numeric pid — never a name or pattern');
    }
    process.kill(pid, 'SIGKILL');
  };

  return {
    listApps,
    observe,
    click,
    type,
    key,
    openApp,
    activate,
    killPid,
    checkAvailability,
  };
}
