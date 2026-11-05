/**
 * Browser permission allowlist tests — the deny-by-default core.
 *
 * The allowlist decides whether a page gets a capability (camera,
 * microphone, notifications, ...). Default is DENY: an origin not on
 * the list gets nothing. The pure functions here are the testable
 * core; the Electron session handler in `electron/ipc/browser.ts`
 * consults them, and the file helpers just persist the JSON.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  isPermissionAllowed,
  originOfUrl,
  parsePermissionAllowlist,
  setPermissionAllowed,
  stringifyPermissionAllowlist,
} from '../electron/services/browserPermissions';

describe('isPermissionAllowed', () => {
  it('denies everything when the allowlist is empty', () => {
    expect(isPermissionAllowed({}, 'https://meet.example', 'camera')).toBe(
      false,
    );
    expect(
      isPermissionAllowed({}, 'https://meet.example', 'notifications'),
    ).toBe(false);
  });

  it('allows a listed permission for that origin only', () => {
    const allowlist = { 'https://meet.example': ['camera', 'microphone'] };
    expect(isPermissionAllowed(allowlist, 'https://meet.example', 'camera')).toBe(
      true,
    );
    expect(
      isPermissionAllowed(allowlist, 'https://meet.example', 'microphone'),
    ).toBe(true);
    expect(
      isPermissionAllowed(allowlist, 'https://meet.example', 'notifications'),
    ).toBe(false);
    expect(isPermissionAllowed(allowlist, 'https://other.example', 'camera')).toBe(
      false,
    );
  });

  it('does not confuse origins that share a suffix', () => {
    const allowlist = { 'https://meet.example': ['camera'] };
    expect(
      isPermissionAllowed(allowlist, 'https://evilmeet.example', 'camera'),
    ).toBe(false);
    expect(
      isPermissionAllowed(allowlist, 'https://meet.example.evil.com', 'camera'),
    ).toBe(false);
  });
});

describe('originOfUrl', () => {
  it('returns the origin of a full URL', () => {
    expect(originOfUrl('https://meet.example:8443/room?x=1')).toBe(
      'https://meet.example:8443',
    );
    expect(originOfUrl('http://127.0.0.1:8090/')).toBe('http://127.0.0.1:8090');
  });

  it('returns null for unparseable input', () => {
    expect(originOfUrl('not a url')).toBeNull();
    expect(originOfUrl('')).toBeNull();
  });
});

describe('parsePermissionAllowlist', () => {
  it('parses a well-formed allowlist', () => {
    expect(
      parsePermissionAllowlist(
        '{"https://meet.example": ["camera", "microphone"]}',
      ),
    ).toEqual({ 'https://meet.example': ['camera', 'microphone'] });
  });

  it('garbage in gives an empty allowlist, never a crash', () => {
    expect(parsePermissionAllowlist('not json')).toEqual({});
    expect(parsePermissionAllowlist('')).toEqual({});
    expect(parsePermissionAllowlist('[]')).toEqual({});
    expect(parsePermissionAllowlist('{"a": "not an array"}')).toEqual({});
    expect(parsePermissionAllowlist('null')).toEqual({});
  });

  it('drops non-string permissions but keeps the valid ones', () => {
    expect(
      parsePermissionAllowlist('{"https://x.example": ["camera", 42, null]}'),
    ).toEqual({ 'https://x.example': ['camera'] });
  });
});

describe('setPermissionAllowed', () => {
  it('adds a permission without mutating the input', () => {
    const before = { 'https://meet.example': ['camera'] };
    const after = setPermissionAllowed(
      before,
      'https://meet.example',
      'microphone',
      true,
    );
    expect(after).toEqual({
      'https://meet.example': ['camera', 'microphone'],
    });
    expect(before).toEqual({ 'https://meet.example': ['camera'] });
  });

  it('adding an already-listed permission is a no-op', () => {
    const before = { 'https://meet.example': ['camera'] };
    expect(
      setPermissionAllowed(before, 'https://meet.example', 'camera', true),
    ).toEqual({ 'https://meet.example': ['camera'] });
  });

  it('clearing the last permission for an origin drops the origin', () => {
    const before = { 'https://meet.example': ['camera'] };
    expect(
      setPermissionAllowed(before, 'https://meet.example', 'camera', false),
    ).toEqual({});
  });

  it('clearing one permission keeps the others', () => {
    const before = {
      'https://meet.example': ['camera', 'microphone'],
    };
    expect(
      setPermissionAllowed(before, 'https://meet.example', 'camera', false),
    ).toEqual({ 'https://meet.example': ['microphone'] });
  });
});

describe('stringifyPermissionAllowlist', () => {
  it('round-trips through parse', () => {
    const allowlist = {
      'https://b.example': ['notifications'],
      'https://a.example': ['camera', 'microphone'],
    };
    expect(parsePermissionAllowlist(stringifyPermissionAllowlist(allowlist))).toEqual(
      allowlist,
    );
  });

  it('sorts origins and permissions for a stable diff', () => {
    expect(
      stringifyPermissionAllowlist({
        'https://b.example': ['microphone', 'camera'],
      }),
    ).toBe(
      '{\n  "https://b.example": [\n    "camera",\n    "microphone"\n  ]\n}',
    );
  });
});
