import { describe, it, expect } from 'vitest';
import {
  isValidPingUserId,
  resolvePingUserId,
  pingUserLabel,
  PING_USER_ID_PATTERN,
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
});

describe('pingUserLabel', () => {
  it('returns the profile name trimmed', () => {
    expect(pingUserLabel('Genesis')).toBe('Genesis');
    expect(pingUserLabel('  Guest  ')).toBe('Guest');
  });

  it('falls back to Install when no name is known — the count is still labeled', () => {
    expect(pingUserLabel(null)).toBe('Install');
    expect(pingUserLabel(undefined)).toBe('Install');
    expect(pingUserLabel('')).toBe('Install');
    expect(pingUserLabel('   ')).toBe('Install');
  });
});
