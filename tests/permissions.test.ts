// @vitest-environment node
/**
 * Permission tracking tests (Gary, 2026-11-07 ~02:47–02:48 PST):
 * Lucid tracks everything the user allows, and works "like you"
 * — verify before trusting, never assume, honest about unknown,
 * check before acting, know dependencies.
 *
 * These tests pin the standard:
 * - Only 'granted' passes the gate. 'denied', 'not-determined',
 *   'restricted', 'unknown', 'not-applicable' and "never checked"
 *   all refuse, each with an honest reason.
 * - The live probe ALWAYS wins over the recorded grant.
 * - Every permission definition names its dependents (empty =
 *   no feature uses it yet, stated, not hidden) and how to grant
 *   it.
 * - The info page text is speakable verbatim: no markdown, no
 *   URLs, no digits — the voice reads the exact words on the page.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS_INFO_TEXT,
  PERMISSIONS_INFO_VOICE_SRC,
  PERMISSION_DEFS,
  PERMISSION_IDS,
  gatePermission,
  isPermissionGranted,
  permissionDef,
  permissionStatusLabel,
  resolvePermissionDisplayState,
  type PermissionSnapshot,
} from '../src/lib/permissions';

function snapshot(
  id: PermissionSnapshot['id'],
  status: PermissionSnapshot['status'],
  detail: string | null = null,
): PermissionSnapshot {
  return { id, status, detail, verified: true, checkedAt: 1 };
}

describe('permission definitions — the coupling map', () => {
  it('covers exactly the five tracked permissions', () => {
    expect(PERMISSION_IDS).toEqual([
      'accessibility',
      'screen-recording',
      'full-disk-access',
      'microphone',
      'camera',
    ]);
    expect(PERMISSION_DEFS.map((d) => d.id)).toEqual([...PERMISSION_IDS]);
  });

  it('every permission names what it is, what depends on it, and how to grant it', () => {
    for (const def of PERMISSION_DEFS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.grantPath).toContain('System Settings');
      expect(def.settingsUrl).toContain('x-apple.systempreferences:');
      expect(Array.isArray(def.dependents)).toBe(true);
    }
  });

  it('permissions with no feature yet say so — they never claim a false dependent', () => {
    expect(permissionDef('microphone').dependents).toEqual([]);
    expect(permissionDef('camera').dependents).toEqual([]);
    expect(permissionDef('accessibility').dependents.length).toBeGreaterThan(0);
    expect(permissionDef('screen-recording').dependents.length).toBeGreaterThan(0);
    expect(permissionDef('full-disk-access').dependents.length).toBeGreaterThan(0);
  });

  it('computer control depends on Accessibility + Screen Recording', () => {
    const text = [
      ...permissionDef('accessibility').dependents,
      ...permissionDef('screen-recording').dependents,
    ].join(' ');
    expect(text).toContain('Computer control');
  });
});

describe('gatePermission — check before acting, never assume', () => {
  it('only granted passes', () => {
    expect(isPermissionGranted('granted')).toBe(true);
    for (const status of [
      'denied',
      'not-determined',
      'restricted',
      'unknown',
      'not-applicable',
    ] as const) {
      expect(isPermissionGranted(status)).toBe(false);
    }
    expect(gatePermission(snapshot('screen-recording', 'granted'), 'screen-recording').ok).toBe(true);
  });

  it('denied refuses with the grant path in the reason', () => {
    const result = gatePermission(
      snapshot('screen-recording', 'denied', 'Screen Recording permission not granted.'),
      'screen-recording',
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('Screen Recording');
    expect(result.reason).toContain('System Settings');
  });

  it('not-determined refuses — never asked is not granted', () => {
    const result = gatePermission(snapshot('microphone', 'not-determined'), 'microphone');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('not-determined');
    expect(result.reason).toContain('never been granted or denied');
  });

  it('unknown refuses — Lucid says it could not check, it does not guess', () => {
    const result = gatePermission(snapshot('full-disk-access', 'unknown'), 'full-disk-access');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('unknown');
    expect(result.reason).toContain('could not be checked');
  });

  it('restricted and not-applicable refuse with honest reasons', () => {
    expect(gatePermission(snapshot('camera', 'restricted'), 'camera').ok).toBe(false);
    const na = gatePermission(snapshot('camera', 'not-applicable'), 'camera');
    expect(na.ok).toBe(false);
    expect(na.reason).toContain('does not apply on this platform');
  });

  it('never checked refuses — no verification, no action', () => {
    const result = gatePermission(null, 'accessibility');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('unknown');
    expect(result.reason).toContain('has not been checked yet');
  });
});

describe('resolvePermissionDisplayState — live probe wins over memory', () => {
  it('a live denied beats a recorded granted (the user may have revoked it)', () => {
    const state = resolvePermissionDisplayState(
      'screen-recording',
      snapshot('screen-recording', 'denied', 'Not granted.'),
      { status: 'granted', checkedAt: 1 },
    );
    expect(state.status).toBe('denied');
    expect(state.source).toBe('live');
  });

  it('a live granted beats a recorded denied', () => {
    const state = resolvePermissionDisplayState(
      'screen-recording',
      snapshot('screen-recording', 'granted'),
      { status: 'denied', checkedAt: 1 },
    );
    expect(state.status).toBe('granted');
    expect(state.source).toBe('live');
  });

  it('no live probe shows the recorded grant marked stale, never as current', () => {
    const state = resolvePermissionDisplayState(
      'screen-recording',
      null,
      { status: 'granted', checkedAt: 123 },
    );
    expect(state.status).toBe('granted');
    expect(state.source).toBe('recorded');
    expect(state.detail).toContain('Last known state');
  });

  it('neither live nor recorded is honestly unknown', () => {
    const state = resolvePermissionDisplayState('camera', null, null);
    expect(state.status).toBe('unknown');
    expect(state.detail).toContain('Never checked');
  });
});

describe('permission status labels', () => {
  it('denied reads as "Not granted", never as a bare "No"', () => {
    expect(permissionStatusLabel('denied')).toBe('Not granted');
    expect(permissionStatusLabel('not-determined')).toBe('Not determined');
    expect(permissionStatusLabel('unknown')).toBe('Unknown');
    expect(permissionStatusLabel('granted')).toBe('Granted');
  });
});

describe('the info page text — the exact words the voice reads', () => {
  it('is seven speakable paragraphs covering every permission', () => {
    const paragraphs = PERMISSIONS_INFO_TEXT.split('\n\n');
    expect(paragraphs).toHaveLength(7);
    for (const p of paragraphs) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
    expect(PERMISSIONS_INFO_TEXT).toContain('Accessibility');
    expect(PERMISSIONS_INFO_TEXT).toContain('Screen Recording');
    expect(PERMISSIONS_INFO_TEXT).toContain('Full Disk Access');
    expect(PERMISSIONS_INFO_TEXT).toContain('Microphone');
    expect(PERMISSIONS_INFO_TEXT).toContain('Camera');
    expect(PERMISSIONS_INFO_TEXT).toContain('never assumed');
    expect(PERMISSIONS_INFO_TEXT).toContain('never pretends to have one it does not');
  });

  it('has no markdown, no URLs, no digits — every word sounds the way it reads', () => {
    expect(PERMISSIONS_INFO_TEXT).not.toMatch(/[#*`_[\]]/);
    expect(PERMISSIONS_INFO_TEXT).not.toContain('http');
    expect(PERMISSIONS_INFO_TEXT).not.toMatch(/\d/);
  });

  it('the voice file path is the settings MP3', () => {
    expect(PERMISSIONS_INFO_VOICE_SRC).toBe('./settings/permissions-explanation.mp3');
  });
});
