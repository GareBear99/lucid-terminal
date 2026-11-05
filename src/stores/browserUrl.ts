/**
 * Address-bar input → URL.
 *
 * Pure function (no Electron, no window) so the browser tab strip and
 * the address bar share one rule, and the tests can check it by hand:
 *
 *   'example.com'        -> 'https://example.com'
 *   'https://example.com'-> 'https://example.com' (unchanged)
 *   '127.0.0.1:8090'     -> 'http://127.0.0.1:8090' (local hosts are http)
 *   'localhost:8090'     -> 'http://localhost:8090'
 *   'hello world'        -> 'https://duckduckgo.com/?q=hello%20world'
 *   ''                   -> null (nothing to navigate to)
 *
 * The heuristic is the usual one: no spaces + a dot in the host (or a
 * localhost / loopback host) reads as a URL; anything else is a search.
 * A bare "file.txt" therefore navigates to https://file.txt — the same
 * trade-off every browser's address bar makes.
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i;
const DOMAIN_RE = /^[^\s/:]+\.[^\s/:]+(:\d+)?(\/.*)?$/;

export function resolveInputToUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (SCHEME_RE.test(text)) return text;
  if (LOCAL_HOST_RE.test(text)) return `http://${text}`;
  if (DOMAIN_RE.test(text)) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}
