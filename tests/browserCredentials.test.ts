/**
 * Browser credentials (Area 3) — pure helpers: origin parsing and
 * the fill / read script builders.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  originFromUrl,
  buildFillScript,
  buildReadLoginScript,
} from '../src/lib/browserCredentials';

describe('originFromUrl', () => {
  it('returns the origin for http/https, port included', () => {
    expect(originFromUrl('https://example.com/login?x=1')).toBe(
      'https://example.com',
    );
    expect(originFromUrl('http://localhost:8080/a/b')).toBe(
      'http://localhost:8080',
    );
  });

  it('rejects non-pages and garbage', () => {
    expect(originFromUrl('about:blank')).toBeNull();
    expect(originFromUrl('file:///etc/passwd')).toBeNull();
    expect(originFromUrl('javascript:alert(1)')).toBeNull();
    expect(originFromUrl('not a url')).toBeNull();
    expect(originFromUrl('')).toBeNull();
  });
});

describe('buildFillScript', () => {
  it('uses the native setter trick and the password selector', () => {
    const script = buildFillScript('gary', 's3cret');
    expect(script).toContain('HTMLInputElement.prototype');
    expect(script).toContain("input[type=\"password\"]");
    expect(script).toContain("new Event('input'");
    expect(script).toContain("new Event('change'");
  });

  it('embeds credentials JSON-escaped, never raw', () => {
    const username = 'o"hara';
    const password = 'p"ass\nword\\x';
    const script = buildFillScript(username, password);
    // The JSON-escaped forms are in the script…
    expect(script).toContain(JSON.stringify(username));
    expect(script).toContain(JSON.stringify(password));
    // …but the raw values (which would break out of the string)
    // are not.
    expect(script).not.toContain(username);
    expect(script).not.toContain(password);
  });
});

describe('buildReadLoginScript', () => {
  it('reports the filled fields and nothing else', () => {
    const script = buildReadLoginScript();
    expect(script).toContain('hasPassword');
    expect(script).toContain("input[type=\"password\"]");
    expect(script).toContain('password: pw.value');
  });
});
