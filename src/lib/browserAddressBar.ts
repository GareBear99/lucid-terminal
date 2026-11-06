/**
 * Address-bar helpers for the Browser panel.
 *
 * Two behaviours live here so they are unit-testable without mounting
 * the full BrowserPanel (whose effects need window.lucidAPI.browser):
 *
 * - Cmd+L (macOS) / Ctrl+L focuses the address bar, like every other
 *   browser. The panel's shortcut handler calls isFocusAddressBarShortcut
 *   and, on a match, focusAddressBar.
 * - Opening a new tab focuses the address bar, so Gary can type a URL
 *   straight away. The panel calls focusAddressBar after createTab.
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
