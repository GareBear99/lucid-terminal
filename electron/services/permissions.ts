/**
 * Permissions probe service — the main-process side of Lucid's
 * permission tracking (Gary, 2026-11-07 ~02:47 PST: "we need to
 * track everything im allowing"). Gary just granted Screen
 * Recording; other users will not have it. This service probes
 * the REAL state of every macOS permission Lucid tracks and
 * reports it honestly — it never assumes one is granted.
 *
 * The standard (Gary, 2026-11-07 ~02:48 PST: "everything has to
 * be like you"): verify before trusting. Two probe kinds:
 *
 * - TCC record (systemPreferences.getMediaAccessStatus): what
 *   macOS has recorded for Screen Recording / Microphone /
 *   Camera. It distinguishes 'granted' from 'denied' from
 *   'not-determined' — the honest states.
 * - FUNCTIONAL probe: does the capability actually work right
 *   now? Accessibility (System Events must answer) is probed by
 *   doing the thing; Screen Recording is probed by doing the
 *   thing ONLY when the TCC record does not already say granted
 *   — when it says granted, the record is trusted and no capture
 *   is attempted, because spawning screencapture on an unsigned,
 *   rebuilt Lucid prompts the user again even though the grant is
 *   listed (Gary, 2026-11-07 ~08:30 PST). A feature that actually
 *   needs a capture discovers a broken capture at action time,
 *   with its own reason — the probe never prompts on view open.
 *
 * What is NOT probed, and why (honest limits):
 * - Accessibility has no TCC-read API: a failed probe means "not
 *   granted right now" — macOS does not tell the app whether it
 *   was denied or never asked, and the reason says so.
 * - Microphone / Camera are read from the TCC record only. A
 *   functional probe would need getUserMedia, which PROMPTS the
 *   user — Lucid never prompts for a permission no feature needs
 *   (no feature uses mic/camera yet).
 * - Full Disk Access is probed by listing (never reading) two
 *   TCC-protected directories. A listing that succeeds means the
 *   access works; EPERM on both means it does not.
 *
 * Non-macOS: every permission is 'not-applicable' — the
 * permissions are macOS TCC, and saying so is honest.
 */
import { shell, systemPreferences } from 'electron';
import { readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type {
  PermissionId,
  PermissionSnapshot,
  PermissionStatus,
} from '../../src/lib/permissions';
import { PERMISSION_IDS, permissionDef } from '../../src/lib/permissions';
import {
  probeAccessibility,
  probeScreenRecording,
} from './computerControlDriver';

const PROBE_CACHE_MS = 30_000;

let cache: { at: number; snapshots: PermissionSnapshot[] } | null = null;

function notApplicableSnapshots(now: number): PermissionSnapshot[] {
  return PERMISSION_IDS.map((id) => ({
    id,
    status: 'not-applicable' as PermissionStatus,
    detail: 'macOS permissions do not apply on this platform.',
    verified: false,
    checkedAt: now,
  }));
}

type MediaAccessStatus = 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined';

function mapMediaStatus(status: MediaAccessStatus): PermissionStatus {
  return status;
}

/** Full Disk Access probe — list (never read) TCC-protected
 *  directories. Success on any one means the access works.
 *  EPERM on all of them means it does not. Anything else (e.g.
 *  the directories do not exist) means the state cannot be
 *  determined — reported as 'unknown', not guessed. */
async function probeFullDiskAccess(now: number): Promise<PermissionSnapshot> {
  const candidates = [join(homedir(), 'Library', 'Mail'), join(homedir(), 'Library', 'Messages')];
  let sawPermissionError = false;
  for (const dir of candidates) {
    try {
      await readdir(dir);
      return {
        id: 'full-disk-access',
        status: 'granted',
        detail: null,
        verified: true,
        checkedAt: now,
      };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException | null)?.code;
      if (code === 'EPERM' || code === 'EACCES') sawPermissionError = true;
      // ENOENT (no such directory) and anything else: try the
      // next candidate; the state stays undetermined.
    }
  }
  if (sawPermissionError) {
    return {
      id: 'full-disk-access',
      status: 'denied',
      detail:
        'Full Disk Access is not granted — protected locations on this Mac cannot be read. Grant it in System Settings → Privacy & Security → Full Disk Access.',
      verified: true,
      checkedAt: now,
    };
  }
  return {
    id: 'full-disk-access',
    status: 'unknown',
    detail:
      'Full Disk Access could not be determined — none of the protected locations used for the check exist on this Mac.',
    verified: false,
    checkedAt: now,
  };
}

async function probeOne(id: PermissionId, now: number): Promise<PermissionSnapshot> {
  switch (id) {
    case 'accessibility': {
      const probe = await probeAccessibility();
      return {
        id,
        status: probe.granted ? 'granted' : 'denied',
        detail: probe.reason,
        verified: true,
        checkedAt: now,
      };
    }
    case 'screen-recording': {
      // TCC record first (it knows denied vs never-asked), then
      // the functional probe — which trusts a 'granted' record
      // and never spawns a capture for it (spawning one prompts
      // the user again for an unsigned, rebuilt binary — Gary,
      // 2026-11-07 ~08:30 PST). A feature that actually needs a
      // capture discovers a broken capture at action time.
      let tcc: MediaAccessStatus = 'unknown';
      try {
        tcc = systemPreferences.getMediaAccessStatus('screen') as MediaAccessStatus;
      } catch {
        tcc = 'unknown';
      }
      const probe = await probeScreenRecording();
      if (probe.granted) {
        return { id, status: 'granted', detail: null, verified: true, checkedAt: now };
      }
      return {
        id,
        status: mapMediaStatus(tcc),
        detail: probe.reason,
        verified: true,
        checkedAt: now,
      };
    }
    case 'microphone':
    case 'camera': {
      // TCC record only — a functional probe would prompt the user
      // for a permission no feature needs yet.
      let tcc: MediaAccessStatus = 'unknown';
      try {
        tcc = systemPreferences.getMediaAccessStatus(id) as MediaAccessStatus;
      } catch {
        tcc = 'unknown';
      }
      const def = permissionDef(id);
      return {
        id,
        status: mapMediaStatus(tcc),
        detail:
          tcc === 'not-determined'
            ? `No feature uses ${def.label} yet, and it has never been granted or denied.`
            : null,
        verified: false,
        checkedAt: now,
      };
    }
    case 'full-disk-access': {
      return probeFullDiskAccess(now);
    }
  }
}

/** Probe every tracked permission. Results are cached 30s
 *  (probes spawn processes); pass force to bypass the cache —
 *  e.g. right after the user grants something in System
 *  Settings and hits Refresh. */
export async function probePermissions(force = false): Promise<PermissionSnapshot[]> {
  const now = Date.now();
  if (process.platform !== 'darwin') {
    return notApplicableSnapshots(now);
  }
  if (!force && cache && now - cache.at < PROBE_CACHE_MS) {
    return cache.snapshots;
  }
  const snapshots = await Promise.all(PERMISSION_IDS.map((id) => probeOne(id, now)));
  cache = { at: now, snapshots };
  return snapshots;
}

/** Prompt the user for a permission macOS lets Lucid ask for
 *  (Screen Recording, Microphone, Camera). Accessibility and Full
 *  Disk Access cannot be prompted for — the user grants them in
 *  System Settings. Returns whether access is granted now. */
export async function requestPermission(id: PermissionId): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  const def = permissionDef(id);
  if (!def.requestable) return false;
  try {
    const granted = await systemPreferences.askForMediaAccess(
      id === 'screen-recording' ? 'screen' : id,
    );
    cache = null; // The answer changed something — re-probe next time.
    return granted;
  } catch {
    return false;
  }
}

/** Open the System Settings pane for a permission, so the user
 *  can grant it. Best effort — returns false when the link could
 *  not be opened (the text path in the definition is the fallback
 *  the UI always shows). */
export async function openPermissionSettings(id: PermissionId): Promise<boolean> {
  const def = permissionDef(id);
  if (!def.settingsUrl) return false;
  try {
    await shell.openExternal(def.settingsUrl);
    return true;
  } catch {
    return false;
  }
}
