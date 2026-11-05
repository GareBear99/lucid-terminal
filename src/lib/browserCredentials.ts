/**
 * Pure credential helpers for the in-panel browser (Area 3), shared
 * by the main-process vault and (for the origin check) the renderer.
 *
 * This module has NO Electron dependency, so both sides can import
 * it. The two script builders produce the page-side JavaScript the
 * vault runs through `webContents.executeJavaScript` — the script
 * surface stays in main, parameterised here, never as raw JS from
 * the renderer (same rule as the Area 4 action API).
 *
 * The fill script uses the native-setter trick: a plain `value =`
 * assignment is silently ignored by React-controlled forms, so the
 * value is set through `HTMLInputElement.prototype`'s own setter
 * and `input` + `change` events are dispatched, which is what
 * React listens for.
 */

/** The origin a login belongs to, or null for anything that is not
 * an http(s) page (about:blank, file:, javascript:, garbage). */
export function originFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return parsed.origin;
}

/** Page-side field finder, shared by the fill and read scripts: the
 * password field, then the username field — `autocomplete` first,
 * then a `name`/`id` match, then the last text/email input in the
 * same form (the field just before the password, in practice). */
const FIELD_FINDER = `
  const __findPassword = () =>
    document.querySelector('input[type="password"]');
  const __findUsername = (pw) => {
    const scope = pw.form || document;
    const byAutocomplete = scope.querySelector(
      'input[autocomplete="username"], input[autocomplete="email"]',
    );
    if (byAutocomplete) return byAutocomplete;
    const named = scope.querySelector(
      'input[name="username"], input[name="email"], input[name="login"], ' +
        'input[id="username"], input[id="email"], input[id="login"]',
    );
    if (named) return named;
    const texts = Array.from(
      scope.querySelectorAll('input[type="text"], input[type="email"]'),
    ).filter((el) => el !== pw);
    return texts.length > 0 ? texts[texts.length - 1] : null;
  };
`;

/** Fill a page's login form from the vault. Returns true when a
 * password field was found and filled. The credentials are embedded
 * with JSON.stringify, so quotes and newlines in a password cannot
 * break out of the script. This string is built and run in main
 * only — it never travels through IPC to the renderer. */
export function buildFillScript(username: string, password: string): string {
  return `(() => {
  ${FIELD_FINDER}
  const __setFieldValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const pw = __findPassword();
  if (!pw) return false;
  const user = __findUsername(pw);
  if (user) __setFieldValue(user, ${JSON.stringify(username)});
  __setFieldValue(pw, ${JSON.stringify(password)});
  return true;
})()`;
}

export interface PageLoginFields {
  /** True when the page has a password field with a value in it. */
  hasPassword: boolean;
  /** Current value of the username field, or ''. */
  username: string;
  /** Current value of the password field, or ''. */
  password: string;
}

/** Read a page's login form (capture step): returns whether a
 * password field is filled and the field values. The caller keeps
 * the result in main — the password in it must never be sent to
 * the renderer, logged, or put in the chat transcript. */
export function buildReadLoginScript(): string {
  return `(() => {
  ${FIELD_FINDER}
  const pw = __findPassword();
  if (!pw || !pw.value) {
    return { hasPassword: false, username: '', password: '' };
  }
  const user = __findUsername(pw);
  return {
    hasPassword: true,
    username: user ? user.value : '',
    password: pw.value,
  };
})()`;
}
