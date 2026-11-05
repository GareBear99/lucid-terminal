/**
 * Address-bar input → URL.
 *
 * The hand-checkable cases from the design, plus the edges around
 * them: scheme pass-through, localhost/loopback as http, bare domains
 * as https, search text as a DuckDuckGo query, empty input as a no-op.
 *
 * Run with: npm test
 */

import { resolveInputToUrl } from '../src/stores/browserUrl';

describe('resolveInputToUrl', () => {
  test('a full URL passes through unchanged', () => {
    expect(resolveInputToUrl('https://example.com')).toBe(
      'https://example.com',
    );
    expect(resolveInputToUrl('http://example.com/page?q=1')).toBe(
      'http://example.com/page?q=1',
    );
  });

  test('a bare domain gets https', () => {
    expect(resolveInputToUrl('example.com')).toBe('https://example.com');
    expect(resolveInputToUrl('example.com/path?q=1')).toBe(
      'https://example.com/path?q=1',
    );
    expect(resolveInputToUrl('example.com:8080')).toBe(
      'https://example.com:8080',
    );
  });

  test('localhost and loopback get http, never https', () => {
    expect(resolveInputToUrl('127.0.0.1:8090')).toBe('http://127.0.0.1:8090');
    expect(resolveInputToUrl('localhost:8090')).toBe('http://localhost:8090');
    expect(resolveInputToUrl('localhost')).toBe('http://localhost');
  });

  test('search text becomes a DuckDuckGo query', () => {
    expect(resolveInputToUrl('hello world')).toBe(
      'https://duckduckgo.com/?q=hello%20world',
    );
    expect(resolveInputToUrl('how do i tile a floor')).toBe(
      'https://duckduckgo.com/?q=how%20do%20i%20tile%20a%20floor',
    );
  });

  test('surrounding whitespace is trimmed', () => {
    expect(resolveInputToUrl('  example.com  ')).toBe('https://example.com');
  });

  test('empty input is a no-op', () => {
    expect(resolveInputToUrl('')).toBeNull();
    expect(resolveInputToUrl('   ')).toBeNull();
  });
});
