/**
 * Menu → modal wiring (Atom steal #13 — menus, 2026-11-14).
 *
 * The application menu (electron/menu.ts) sends one IPC event
 * per click, `menu:open-modal`, carrying a `MenuActionKind`.
 * This module is the renderer's side of that channel: it
 * subscribes to the preload's `lucidAPI.menu.onOpenModal`
 * and hands the action to the caller. It is a no-op (and
 * returns a no-op unsubscribe) when the preload bridge is
 * absent — jsdom tests, the web build, a detached window's
 * mini renderer — so subscribing is always safe.
 *
 * The modal store owns WHICH modal is open; this module only
 * carries the menu's request to the store. Guards (a symbol
 * modal needs an active file, go-to-line needs the editor
 * view) live in the subscriber, not here.
 */

/** Every action the menu can name. The three Atom modals,
 *  plus the three App-level actions the menu reaches (Help,
 *  New Terminal Tab, Close File). Go to Line is NOT here: its
 *  binding is Ctrl+G, editor-gated, and a menu accelerator of
 *  Ctrl+G would shadow the terminal's readline Ctrl+G the same
 *  way the default Reload shadowed ⌘R. Close File is here
 *  instead of the `close` role: the role's ⌘W closes the
 *  window, but the keymap says ⌘W closes the file — the menu
 *  item carries the keymap's binding and the renderer decides
 *  (active file → close it with the dirty confirm; no file →
 *  close the window, the old role's behaviour). Save File is
 *  here for the same reason the File menu exists at all (Gary,
 *  2026-11-16: the File menu had no Save — "you cant save a
 *  file in file tab in top hotbar on mac"): the menu item
 *  carries the keymap's ⌘S and the renderer saves the active
 *  file (no file → no-op, same as the file:save command). */
export type MenuActionKind =
  | 'palette'
  | 'finder'
  | 'symbols'
  | 'help'
  | 'new-terminal-tab'
  | 'close-file'
  | 'save-file';

/** Subscribe to menu actions. Returns an unsubscribe. */
export function subscribeMenuModals(
  callback: (kind: MenuActionKind) => void,
): () => void {
  const menuApi = (window as unknown as { lucidAPI?: unknown }).lucidAPI as
    | {
        menu?: {
          onOpenModal: (
            cb: (kind: MenuActionKind) => void,
          ) => (() => void) | void;
        };
      }
    | undefined;
  if (!menuApi?.menu || typeof menuApi.menu.onOpenModal !== 'function') {
    return () => {};
  }
  const unsubscribe = menuApi.menu.onOpenModal(callback);
  return typeof unsubscribe === 'function' ? unsubscribe : () => {};
}
