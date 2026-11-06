/**
 * Address-bar helpers for the Browser panel.
 *
 * Three behaviours live here so they are unit-testable without mounting
 * the full BrowserPanel (whose effects need window.lucidAPI.browser):
 *
 * - Cmd+L (macOS) / Ctrl+L focuses the address bar, like every other
 *   browser. The panel's shortcut handler calls isFocusAddressBarShortcut
 *   and, on a match, focusAddressBar. The same shortcut typed INSIDE
 *   the page never reaches the panel (the BrowserView is a separate
 *   webContents), so the main process intercepts it with
 *   isFocusAddressBarKeyInput on `before-input-event` and forwards it
 *   to whichever window the view is attached to.
 * - Opening a new tab focuses the address bar, so Gary can type a URL
 *   straight away. A single setTimeout(0) is not enough: attaching
 *   the new tab's BrowserView yanks focus to its webarea after the
 *   first focus lands. scheduleAddressBarFocus retries at short
 *   delays — including once after the view attaches — and stops
 *   retrying as soon as Gary is typing in another text field.
 *
 * focusAddressBar also selects the input's text, so typing replaces
 * the current URL instead of appending to it.
 */

/** True for Cmd+L (macOS) / Ctrl+L — the "focus the address bar" shortcut. */
export function isFocusAddressBarShortcut(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  return (e.metaKey === true || e.ctrlKey === true) && e.key.toLowerCase() === 'l';
}

/** The `before-input-event` payload shape (Electron's Input event). */
export interface AddressBarKeyInput {
  /** 'keyDown' | 'keyUp' | 'char'. Missing means "unknown, treat as a press". */
  type?: string;
  key: string;
  meta?: boolean;
  control?: boolean;
}

/**
 * True for a Cmd+L / Ctrl+L key-down inside a BrowserView — the same
 * shortcut as isFocusAddressBarShortcut, but for the main process's
 * `before-input-event`, which carries `type`/`meta`/`control` instead
 * of a DOM KeyboardEvent. Key-up, char, and every other key never
 * match: the page keeps all of its own keystrokes.
 */
export function isFocusAddressBarKeyInput(input: AddressBarKeyInput): boolean {
  if (input.type !== undefined && input.type !== 'keyDown') return false;
  return (input.meta === true || input.control === true) && input.key.toLowerCase() === 'l';
}

/**
 * Focus the address-bar input and select its text. No-op for a null
 * input (the panel stays mounted when hidden, so the ref is normally
 * set — but a caller racing an unmount must not throw).
 */
export function focusAddressBar(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus();
  input.select();
}

/**
 * Focus the address bar now and again after short delays, so a focus
 * steal that lands after the first attempt (the BrowserView attaching
 * yanks focus to its webarea) does not win. Each attempt is a no-op
 * while Gary is typing in another text field, so a retry never yanks
 * focus out of the terminal prompt or the find bar — and the
 * returned cancel function stops all not-yet-fired attempts (call
 * it on unmount, or before scheduling a fresh round).
 */
export function scheduleAddressBarFocus(
  getInput: () => HTMLInputElement | null,
  delaysMs: number[] = [0, 100, 300],
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;
  const attempt = () => {
    if (cancelled) return;
    const input = getInput();
    if (!input) return;
    const active = input.ownerDocument?.activeElement as HTMLElement | null;
    if (active && active !== input && isTextField(active)) return;
    focusAddressBar(input);
  };
  for (const delay of delaysMs) {
    timers.push(setTimeout(attempt, delay));
  }
  return () => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
  };
}

function isTextField(el: HTMLElement): boolean {
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  );
}
