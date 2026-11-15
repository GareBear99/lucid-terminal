/**
 * The application menu (Atom steal #13 — menus, 2026-11-14).
 *
 * Why this file exists: Lucid never called
 * `Menu.setApplicationMenu`, so macOS got Electron's default
 * menu — whose View menu carries Reload (Cmd+R) / Force Reload
 * (Cmd+Shift+R). A menu accelerator is intercepted by the main
 * process before the renderer's keydown ever fires, so pressing
 * ⌘R in the real app RELOADED the app to Profiles (wiping the
 * guest session) instead of opening go-to-symbol, even though
 * the renderer's ⌘R binding was correct. The fix is this menu:
 * it has no Reload item at all, and Cmd+R is Go to Symbol.
 *
 * Shape (Atom's `menus/darwin.cson` + `menu-manager.coffee`):
 * the menu is data built from command names, and every item
 * either has a `role` (Electron fills the label/accelerator/
 * behaviour — undo, copy, quit, …) or a `click` that sends one
 * `menu:open-modal` IPC event to the focused window. The
 * renderer owns the behaviour (the modal store, the file store
 * guards); the menu only names the action. Keystroke labels
 * come from the keymap (src/lib/keymap.ts), so the menu, the
 * palette and the keymap file all show the same keys.
 *
 * Deliberately NOT in this menu: Go to Line. Its binding is
 * Ctrl+G, editor-gated (the terminal's readline Ctrl+G must
 * survive) — a menu accelerator of Ctrl+G would shadow the
 * terminal's Ctrl+G the same way the default Reload shadowed
 * ⌘R. Go to Line stays a renderer-only binding.
 *
 * The template builder is pure (type-only Electron import) so
 * it is unit-testable in vitest without Electron; the Electron
 * `Menu` object is injected into `setupApplicationMenu`.
 */

import type { Menu, MenuItemConstructorOptions } from 'electron';
import { acceleratorForCommand, type KeymapBinding } from '../src/lib/keymap';
import type { MenuActionKind } from '../src/lib/menuModals';

/** The IPC channel the menu items send on. */
export const MENU_OPEN_MODAL_CHANNEL = 'menu:open-modal';

export type { MenuActionKind };

/**
 * Build the application-menu template. `send` is called with
 * the action when a menu item is clicked; `platform` defaults
 * to the running platform (injected in tests). `overrides`
 * is the resolved user keymap (settings.customKeybindings):
 * every item's accelerator comes from the keymap through
 * acceleratorForCommand, so a user rebind changes the menu
 * label, the palette label and the keydown handler together —
 * Atom's MenuManager.update() rule. An override that unbinds
 * a command (empty keys) leaves the item with no accelerator.
 * The View menu deliberately has NO Reload / Force Reload —
 * that is the ⌘R fix. DevTools stays (role toggleDevTools,
 * Alt+Cmd+I), so debugging is still one keypress away.
 *
 * File's Close is a named item, not the `close` role: the
 * role's ⌘W closes the window, but the keymap says ⌘W closes
 * the file. The item carries the keymap's binding and sends
 * 'close-file'; the renderer decides (active file → close it
 * with the dirty confirm; no file → close the window).
 */
export function buildApplicationMenuTemplate(
  send: (kind: MenuActionKind) => void,
  platform: NodeJS.Platform = process.platform,
  overrides: KeymapBinding[] = [],
): MenuItemConstructorOptions[] {
  const modalItem = (
    label: string,
    commandId: string,
    kind: MenuActionKind,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator: acceleratorForCommand(commandId, overrides),
    click: () => send(kind),
  });

  const template: MenuItemConstructorOptions[] = [];

  // macOS app menu (role 'appMenu' fills About/Services/
  // Hide/Quit with the app name — Electron's standard).
  if (platform === 'darwin') {
    template.push({
      role: 'appMenu',
    });
  }

  template.push({
    label: 'File',
    submenu: [
      modalItem('New Terminal Tab', 'terminal:new-tab', 'new-terminal-tab'),
      { type: 'separator' },
      modalItem('Close File', 'file:close', 'close-file'),
    ],
  });

  // The Edit menu is roles-only: without these, undo/redo and
  // copy/paste have no keyboard path in a packaged app (the
  // default menu provided them; this menu replaces it).
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });

  // View — the three Atom modals, then the standard window
  // chrome. No Reload, no Force Reload (the ⌘R fix).
  template.push({
    label: 'View',
    submenu: [
      modalItem('Command Palette', 'lucid:command-palette', 'palette'),
      modalItem('Quick Open…', 'lucid:quick-open', 'finder'),
      modalItem('Go to Symbol in File…', 'lucid:go-to-symbol', 'symbols'),
      { type: 'separator' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  });

  template.push({
    label: 'Help',
    submenu: [modalItem('Lucid Help', 'help:open', 'help')],
  });

  return template;
}

/** The Electron Menu surface this file needs — injected so
 *  tests can pass a stub. Typed with Electron's own types so
 *  `typeof Menu` is assignable (the real Menu class). */
export interface MenuApi {
  buildFromTemplate: (
    template: MenuItemConstructorOptions[],
  ) => Menu;
  setApplicationMenu: (menu: Menu | null) => void;
}

/** Build the template and set it as the application menu.
 *  `overrides` is the user's keymap (see above) — main
 *  rebuilds with it whenever the renderer sends new
 *  bindings, so the menu labels follow a rebind live. */
export function setupApplicationMenu(
  menuApi: MenuApi,
  send: (kind: MenuActionKind) => void,
  platform: NodeJS.Platform = process.platform,
  overrides: KeymapBinding[] = [],
): void {
  const template = buildApplicationMenuTemplate(send, platform, overrides);
  menuApi.setApplicationMenu(menuApi.buildFromTemplate(template));
}
