/**
 * Pure page-action helpers for the in-panel browser (Area 4), shared
 * by the main-process action runner.
 *
 * This module has NO Electron dependency, so both sides can import
 * it. The script builders produce the page-side JavaScript the
 * runner executes through `webContents.executeJavaScript` — the
 * script surface stays in main, parameterised here, never as raw JS
 * from the renderer (same rule as the Area 3 credential builders in
 * `src/lib/browserCredentials.ts`: a renderer bug must never be able
 * to run arbitrary JS in any page).
 *
 * Every script returns a small `{ ok, ... }` object so the runner
 * can map page outcomes to typed results without parsing strings.
 * Parameters are embedded with `JSON.stringify`, so quotes, newlines
 * and backslashes in a selector or a fill value cannot break out of
 * the script.
 *
 * The generic `fill` action NEVER fills a password field: a
 * password belongs to the vault (Area 3), never to a parameter
 * that could be typed by the AI or logged. The fill script checks
 * the target's type in-page and refuses with `password-field`;
 * use the saved-login fill for passwords.
 */

/** Page text returned to the AI is capped: a full page can be
 * megabytes, and the chat context must never swallow it whole. */
export const MAX_ACTION_TEXT_CHARS = 20000;

/** Page text sent into the AI chat (Area 5 "send page to AI") is
 * capped harder — the chat context is small. */
export const MAX_PAGE_TEXT_FOR_AI = 8000;

/** Longest selector the action API accepts. A CSS selector longer
 * than this is a paste error, not a real target. */
export const MAX_SELECTOR_LENGTH = 500;

/** Longest fill value the action API accepts. */
export const MAX_FILL_VALUE_LENGTH = 10000;

/** Default wait-for-selector timeout (ms). */
export const DEFAULT_WAIT_TIMEOUT_MS = 5000;

/** Longest wait-for-selector timeout (ms) the API accepts. */
export const MAX_WAIT_TIMEOUT_MS = 30000;

/** Is `selector` a usable CSS selector for the action API? */
export function isValidSelector(selector: unknown): selector is string {
  return (
    typeof selector === 'string' &&
    selector.trim().length > 0 &&
    selector.length <= MAX_SELECTOR_LENGTH
  );
}

/** Is `value` a usable fill value? */
export function isValidFillValue(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_FILL_VALUE_LENGTH;
}

/** Clamp a requested wait timeout into the accepted range. */
export function clampWaitTimeout(timeoutMs: unknown): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  return Math.min(
    MAX_WAIT_TIMEOUT_MS,
    Math.max(0, Math.floor(timeoutMs)),
  );
}

/** Page-side field setter, shared by the fill script: the native
 * setter trick (a plain `value =` assignment is silently ignored
 * by React-controlled forms), plus the `input` + `change` events
 * React listens for. */
const SET_FIELD_VALUE = `
  const __setFieldValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

/** Read the page's visible text. Returns `{ title, url, text }`
 * with the text capped at MAX_ACTION_TEXT_CHARS. */
export function buildReadTextScript(): string {
  return `(() => {
  const text = document.body ? document.body.innerText || '' : '';
  return {
    title: document.title || '',
    url: location.href,
    text: text.slice(0, ${MAX_ACTION_TEXT_CHARS}),
  };
})()`;
}

/** Describe the page: URL, title, load state, and the forms on it
 * (action, method, and each field's name/type/label/autocomplete)
 * so the AI — or Gary — can see what a form wants before filling
 * it. Password fields are reported as present (`type: 'password'`)
 * but their values are never read. */
export function buildGetStateScript(): string {
  return `(() => {
  const forms = Array.from(document.forms).map((form) => {
    const fields = Array.from(form.elements)
      .filter((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      .map((el) => {
        const input = el;
        let label = '';
        if (input.id) {
          const lab = document.querySelector('label[for="' + input.id + '"]');
          if (lab) label = (lab.textContent || '').trim();
        }
        if (!label && input.closest('label')) {
          label = ((input.closest('label').textContent) || '').trim();
        }
        return {
          name: input.name || '',
          type: (input.type || input.tagName.toLowerCase()) || '',
          label: label,
          autocomplete: input.getAttribute('autocomplete') || '',
          hasValue: !!(input.value && input.value.length > 0),
        };
      });
    return {
      action: form.action || '',
      method: (form.method || 'get').toLowerCase(),
      fields: fields,
    };
  });
  return {
    url: location.href,
    title: document.title || '',
    loading: document.readyState !== 'complete',
    forms: forms,
  };
})()`;
}

/** Fill one field, found by CSS selector. Returns
 * `{ ok: true }`, or `{ ok: false, error }` with `error` one of
 * `not-found` (no element matches), `not-fillable` (not an input /
 * textarea / select), or `password-field` (a password input — use
 * the saved-login fill instead). */
export function buildFillScript(selector: string, value: string): string {
  return `(() => {
  ${SET_FIELD_VALUE}
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'not-found' };
  const tag = el.tagName;
  if (tag === 'INPUT' && el.type === 'password') {
    return { ok: false, error: 'password-field' };
  }
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    return { ok: false, error: 'not-fillable' };
  }
  if (tag === 'SELECT') {
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    __setFieldValue(el, ${JSON.stringify(value)});
  }
  return { ok: true };
})()`;
}

/** Click one element, found by CSS selector. Scrolls it into view
 * first (a below-the-fold element still receives the click).
 * Returns `{ ok: true }`, or `{ ok: false, error: 'not-found' }`.
 *
 * Note: this is a JavaScript `.click()` — the dispatched event is
 * untrusted (`event.isTrusted === false`). Sites that ignore
 * untrusted clicks need the CDP Tier 2 trusted input (Area 8). */
export function buildClickScript(selector: string): string {
  return `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'not-found' };
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }
  el.click();
  return { ok: true };
})()`;
}

/** Is an element matching `selector` present in the page right
 * now? The wait-for-selector runner polls this until it is true
 * or the timeout expires. */
export function buildSelectorPresentScript(selector: string): string {
  return `(() => {
  try {
    return !!document.querySelector(${JSON.stringify(selector)});
  } catch {
    return false;
  }
})()`;
}
