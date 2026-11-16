/**
 * Application menu tests (menus).
 *
 * The menu exists to fix the ⌘R bug: Electron's default menu
 * carried Reload (Cmd+R) / Force Reload (Cmd+Shift+R), and a
 * menu accelerator shadows the renderer's keydown, so ⌘R
 * reloaded the app to Profiles instead of opening
 * go-to-symbol. These tests pin the contract: no Reload
 * anywhere, Cmd+R is Go to Symbol, the three Atom modals are
 * in View with the keymap's accelerators, and every click
 * sends the right action.
 *
 * Run with: npx vitest run tests/appMenu.test.ts
 */
import { describe, test, expect, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import {
  buildApplicationMenuTemplate,
  setupApplicationMenu,
  MENU_OPEN_MODAL_CHANNEL,
} from '../electron/menu';
import type { MenuActionKind } from '../electron/menu';

function flatten(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  const out: MenuItemConstructorOptions[] = [];
  for (const item of items) {
    out.push(item);
    if (Array.isArray(item.submenu)) out.push(...flatten(item.submenu));
  }
  return out;
}

function submenuOf(
  template: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions[] {
  const menu = template.find((item) => item.label === label);
  if (!menu || !Array.isArray(menu.submenu)) return [];
  return menu.submenu as MenuItemConstructorOptions[];
}

describe('buildApplicationMenuTemplate', () => {
  test('the channel is menu:open-modal', () => {
    expect(MENU_OPEN_MODAL_CHANNEL).toBe('menu:open-modal');
  });

  test('no Reload / Force Reload anywhere — the ⌘R fix', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const all = flatten(template);
    expect(
      all.filter((i) => (i.label ?? '').toLowerCase().includes('reload')),
    ).toEqual([]);
    expect(
      all.filter((i) => (i.accelerator ?? '').toLowerCase().includes('shift+r')),
    ).toEqual([]);
  });

  test('Cmd+R is Go to Symbol, and only Go to Symbol', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const all = flatten(template);
    const cmdR = all.filter((i) => i.accelerator === 'CmdOrCtrl+R');
    expect(cmdR).toHaveLength(1);
    expect(cmdR[0].label).toBe('Go to Symbol in File…');
  });

  test('View holds the three Atom modals with the keymap accelerators', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const view = submenuOf(template, 'View');
    const byLabel = new Map(view.map((i) => [i.label, i]));
    expect(byLabel.get('Command Palette')?.accelerator).toBe(
      'CmdOrCtrl+Shift+P',
    );
    expect(byLabel.get('Quick Open…')?.accelerator).toBe('CmdOrCtrl+P');
    expect(byLabel.get('Go to Symbol in File…')?.accelerator).toBe(
      'CmdOrCtrl+R',
    );
    // Go to Line is NOT in the menu: its Ctrl+G binding is
    // editor-gated so the terminal's readline Ctrl+G survives,
    // and a menu accelerator would shadow it.
    expect(byLabel.has('Go to Line…')).toBe(false);
    expect(view.some((i) => i.role === 'toggleDevTools')).toBe(true);
    expect(view.some((i) => i.role === 'togglefullscreen')).toBe(true);
  });

  test('Edit is roles-only (undo/redo/cut/copy/paste/selectAll)', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const edit = submenuOf(template, 'Edit');
    const roles = edit.map((i) => i.role);
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      expect(roles).toContain(role);
    }
  });

  test('File holds New Terminal Tab (Cmd+T), Save (Cmd+S) and Close File (Cmd+W) — no window-close role', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const file = submenuOf(template, 'File');
    const byLabel = new Map(file.map((i) => [i.label, i]));
    expect(byLabel.get('New Terminal Tab')?.accelerator).toBe('CmdOrCtrl+T');
    // Save carries the keymap's ⌘S (file:save) and sends
    // 'save-file' — the File menu had no Save at all (Gary,
    // 2026-11-16), so there was no way to save from the menu.
    expect(byLabel.get('Save')?.accelerator).toBe('CmdOrCtrl+S');
    // Close File is a named item carrying the keymap's ⌘W, not
    // the `close` role — the role's ⌘W closed the window, but
    // the keymap says ⌘W closes the file.
    expect(byLabel.get('Close File')?.accelerator).toBe('CmdOrCtrl+W');
    expect(file.some((i) => i.role === 'close')).toBe(false);
  });

  test('File > Save is enabled by default and greyed out when no file is open (Gary, 2026-11-16)', () => {
    // A menu that promises Save with nothing to save is "not
    // user friendly" — main greys the item out when the
    // renderer reports no active file, so it never offers a
    // save it cannot do.
    const enabled = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const byLabelEnabled = new Map(
      submenuOf(enabled, 'File').map((i) => [i.label, i]),
    );
    expect(byLabelEnabled.get('Save')?.enabled).not.toBe(false);
    const disabled = buildApplicationMenuTemplate(vi.fn(), 'darwin', [], {
      saveEnabled: false,
    });
    const byLabelDisabled = new Map(
      submenuOf(disabled, 'File').map((i) => [i.label, i]),
    );
    expect(byLabelDisabled.get('Save')?.enabled).toBe(false);
    // The other File items are untouched by the flag.
    expect(byLabelDisabled.get('New Terminal Tab')?.enabled).not.toBe(false);
    expect(byLabelDisabled.get('Close File')?.enabled).not.toBe(false);
  });

  test('user overrides re-label the menu: a rebound palette shows its new accelerator', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin', [
      { command: 'lucid:command-palette', keys: 'cmd-shift-o' },
    ]);
    const view = submenuOf(template, 'View');
    const byLabel = new Map(view.map((i) => [i.label, i]));
    expect(byLabel.get('Command Palette')?.accelerator).toBe('CmdOrCtrl+Shift+O');
  });

  test('an override that unbinds a command leaves its menu item accelerator-less', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin', [
      { command: 'lucid:quick-open', keys: '' },
    ]);
    const view = submenuOf(template, 'View');
    const byLabel = new Map(view.map((i) => [i.label, i]));
    expect(byLabel.get('Quick Open…')?.accelerator).toBeUndefined();
    // The other items keep their defaults.
    expect(byLabel.get('Command Palette')?.accelerator).toBe('CmdOrCtrl+Shift+P');
  });

  test('Help holds Lucid Help (Cmd+/)', () => {
    const template = buildApplicationMenuTemplate(vi.fn(), 'darwin');
    const help = submenuOf(template, 'Help');
    expect(help).toHaveLength(1);
    expect(help[0].label).toBe('Lucid Help');
    expect(help[0].accelerator).toBe('CmdOrCtrl+/');
  });

  test('darwin gets the app menu; other platforms do not', () => {
    expect(buildApplicationMenuTemplate(vi.fn(), 'darwin')[0].role).toBe(
      'appMenu',
    );
    expect(
      buildApplicationMenuTemplate(vi.fn(), 'linux').some(
        (i) => i.role === 'appMenu',
      ),
    ).toBe(false);
  });

  test('clicking each modal item sends its action', () => {
    const send = vi.fn();
    const template = buildApplicationMenuTemplate(send, 'darwin');
    const all = flatten(template);
    const click = (label: string) => {
      const item = all.find((i) => i.label === label);
      expect(item?.click).toBeDefined();
      (item!.click as (item: unknown, win: unknown, ev: unknown) => void)(
        item,
        null,
        null,
      );
    };
    click('Command Palette');
    click('Quick Open…');
    click('Go to Symbol in File…');
    click('Lucid Help');
    click('New Terminal Tab');
    click('Save');
    expect(send.mock.calls.map((c) => c[0] as MenuActionKind)).toEqual([
      'palette',
      'finder',
      'symbols',
      'help',
      'new-terminal-tab',
      'save-file',
    ]);
  });
});

describe('setupApplicationMenu', () => {
  test('builds the template and sets it as the application menu', () => {
    const built = { __menu: true };
    const menuApi = {
      buildFromTemplate: vi.fn(() => built),
      setApplicationMenu: vi.fn(),
    };
    setupApplicationMenu(
      menuApi as unknown as Parameters<typeof setupApplicationMenu>[0],
      vi.fn(),
      'darwin',
    );
    expect(menuApi.buildFromTemplate).toHaveBeenCalledTimes(1);
    const template = menuApi.buildFromTemplate.mock
      .calls[0][0] as MenuItemConstructorOptions[];
    expect(flatten(template).some((i) => i.label === 'Go to Symbol in File…')).toBe(
      true,
    );
    expect(menuApi.setApplicationMenu).toHaveBeenCalledWith(built);
  });
});
