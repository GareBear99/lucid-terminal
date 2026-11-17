import { describe, it, expect } from 'vitest';
import {
  isValidPingUserId,
  resolvePingUserId,
  pingUserLabel,
  PING_USER_ID_PATTERN,
  DEFAULT_PROFILE_PING_ID,
  namespacedDefaultPingUserId,
} from '../src/lib/pingUserId';

// Fix 1 (2026-11-17): the client must send the ACTIVE profile's id
// as x-lucid-user, not one per-install id for every profile — Guest
// was showing Genesis's verified 1196 SP bucket because of it.

describe('isValidPingUserId', () => {
  it('accepts profile ids (profile-<uuid>)', () => {
    expect(
      isValidPingUserId('profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).toBe(true);
  });

  it('accepts the guest temp display shape (letters, digits, hyphen)', () => {
    expect(isValidPingUserId('TEMP-C858AA0')).toBe(true);
  });

  it('accepts the per-install UUID fallback shape', () => {
    expect(isValidPingUserId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects empty, over-long, and non-string values', () => {
    expect(isValidPingUserId('')).toBe(false);
    expect(isValidPingUserId('x'.repeat(129))).toBe(false);
    expect(isValidPingUserId(null)).toBe(false);
    expect(isValidPingUserId(undefined)).toBe(false);
    expect(isValidPingUserId(123)).toBe(false);
  });

  it('rejects ids with characters the server would reject (space, slash, @)', () => {
    expect(isValidPingUserId('bad id with spaces')).toBe(false);
    expect(isValidPingUserId('profile/abc')).toBe(false);
    expect(isValidPingUserId('user@example')).toBe(false);
  });

  it('caps at 128 chars, matching the server pattern', () => {
    expect(PING_USER_ID_PATTERN.test('x'.repeat(128))).toBe(true);
    expect(PING_USER_ID_PATTERN.test('x'.repeat(129))).toBe(false);
  });
});

describe('resolvePingUserId', () => {
  const FALLBACK = 'install-uuid-fallback';

  it('returns the profile id when it is valid', () => {
    expect(
      resolvePingUserId('profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', FALLBACK),
    ).toBe('profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('returns the guest profile id too — Guest gets its own bucket', () => {
    expect(
      resolvePingUserId('profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', FALLBACK),
    ).toBe('profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('falls back to the install id when no profile id is in context', () => {
    expect(resolvePingUserId(null, FALLBACK)).toBe(FALLBACK);
    expect(resolvePingUserId(undefined, FALLBACK)).toBe(FALLBACK);
    expect(resolvePingUserId('', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back to the install id for an invalid profile id', () => {
    expect(resolvePingUserId('bad id with spaces', FALLBACK)).toBe(FALLBACK);
  });

  it('never returns the Genesis id for a guest profile id', () => {
    const guest = resolvePingUserId(
      'profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'profile-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(guest).toBe('profile-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('namespaces the Default profile id per install — never the bare "default"', () => {
    const installA = '550e8400-e29b-41d4-a716-446655440000';
    const installB = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const a = resolvePingUserId(DEFAULT_PROFILE_PING_ID, installA);
    const b = resolvePingUserId(DEFAULT_PROFILE_PING_ID, installB);
    expect(a).toBe(`default-${installA}`);
    expect(b).toBe(`default-${installB}`);
    // Two installs, two buckets.
    expect(a).not.toBe(b);
    // Same install, same bucket — deterministic, no new setting.
    expect(resolvePingUserId(DEFAULT_PROFILE_PING_ID, installA)).toBe(a);
  });

  it('the namespaced Default id is a valid server user id, still Default, never profile-', () => {
    const namespaced = resolvePingUserId(
      DEFAULT_PROFILE_PING_ID,
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(isValidPingUserId(namespaced)).toBe(true);
    expect(namespaced.startsWith('default-')).toBe(true);
    expect(namespaced.startsWith('profile-')).toBe(false);
  });

  it('falls back to the bare Default id only when the install id is unusable', () => {
    expect(resolvePingUserId(DEFAULT_PROFILE_PING_ID, '')).toBe('default');
    expect(resolvePingUserId(DEFAULT_PROFILE_PING_ID, 'bad id')).toBe(
      'default',
    );
  });

  it('namespacedDefaultPingUserId returns null for an unusable install id', () => {
    expect(
      namespacedDefaultPingUserId('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('default-550e8400-e29b-41d4-a716-446655440000');
    expect(namespacedDefaultPingUserId('')).toBe(null);
    expect(namespacedDefaultPingUserId('bad id')).toBe(null);
  });
});

describe('pingUserLabel', () => {
  it('returns the profile name trimmed', () => {
    expect(pingUserLabel('Genesis')).toBe('Genesis');
    expect(pingUserLabel('  Guest  ')).toBe('Guest');
    // The Default SP display still reads "Default" — the label
    // comes from the profile NAME, not the namespaced wire id.
    expect(pingUserLabel('Default')).toBe('Default');
  });

  it('falls back to Install when no name is known — the count is still labeled', () => {
    expect(pingUserLabel(null)).toBe('Install');
    expect(pingUserLabel(undefined)).toBe('Install');
    expect(pingUserLabel('')).toBe('Install');
    expect(pingUserLabel('   ')).toBe('Install');
  });
});
