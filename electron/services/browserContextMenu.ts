/**
 * Right-click context menu for the in-panel browser — the "which items"
 * logic, kept pure so it is unit-testable without Electron.
 *
 * The main process (`electron/ipc/browser.ts`) turns these items into
 * a native `Menu` and pops it up; the ids map to actions there
 * (back/forward/reload on the view, copy-link via the clipboard,
 * copy via the view's selection, inspect via `inspectElement`).
 *
 * Items are returned in display order, grouped as:
 *   Back / Forward / Reload | Copy Link Address / Copy | Inspect Element
 * A group is omitted when none of its items applies (e.g. no link under
 * the cursor means no "Copy Link Address"). Separators between groups
 * are the main process's job.
 */

export type BrowserContextMenuItemId =
  | 'back'
  | 'forward'
  | 'reload'
  | 'copy-link'
  | 'copy'
  | 'inspect';

export interface BrowserContextMenuItem {
  id: BrowserContextMenuItemId;
  label: string;
  enabled: boolean;
}

export interface BrowserContextMenuParams {
  /** URL of the link under the cursor, or '' when not on a link. */
  linkURL: string;
  /** Selected text, or '' when nothing is selected. */
  selectionText: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function browserContextMenuItems(
  params: BrowserContextMenuParams,
): BrowserContextMenuItem[] {
  const items: BrowserContextMenuItem[] = [
    { id: 'back', label: 'Back', enabled: params.canGoBack },
    { id: 'forward', label: 'Forward', enabled: params.canGoForward },
    { id: 'reload', label: 'Reload', enabled: true },
  ];
  if (params.linkURL) {
    items.push({
      id: 'copy-link',
      label: 'Copy Link Address',
      enabled: true,
    });
  }
  if (params.selectionText) {
    items.push({ id: 'copy', label: 'Copy', enabled: true });
  }
  items.push({ id: 'inspect', label: 'Inspect Element', enabled: true });
  return items;
}
