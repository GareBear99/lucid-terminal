/**
 * Mini window (Area 6) main-process tests: pop-out / pop-in view
 * migration through setupBrowserHandlers with a mocked Electron
 * and a fake mini window (same pattern as
 * tests/browserActionsMain.test.ts).
 *
 * The fake windows track which view is attached to them, so the
 * tests prove the view actually moves: main -> mini on pop-out,
 * mini -> nowhere on pop-in (the panel re-attaches the active tab
 * when it hears `browser:mini-closed`), and the mini window closes
 * when its tab pops back in or is closed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface MiniState {
  currentUrl: string;
  readResult: { hasPassword: boolean; username: string; password: string };
  scripts: string[];
  views: Array<{ wc: Record<string, unknown>; view: unknown }>;
}

(globalThis as unknown as { __miniState: unknown }).__miniState ??= {
  currentUrl: '',
  readResult: { hasPassword: false, username: '', password: '' },
  scripts: [],
  views: [],
};

const miniState = () =>
  (globalThis as unknown as { __miniState: MiniState }).__miniState;

vi.mock('electron', () => {
  const state = miniState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        destroyed: false,
        boundsCalls: [] as Array<Record<string, unknown>>,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => Promise.resolve(),
        getURL: () => state.currentUrl,
        getTitle: () => 'Test Page',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => {
          wc.destroyed = true;
        },
        executeJavaScript: (script: string) => {
          state.scripts.push(script);
          if (script.includes('__findPassword')) {
            if (script.includes('__setFieldValue')) {
              return Promise.resolve(true);
            }
            return Promise.resolve({ ...state.readResult });
          }
          if (script.includes('innerText')) {
            return Promise.resolve({
              title: 'Test Page',
              url: state.currentUrl,
              text: 'Hello world.',
            });
          }
          if (script.includes('document.forms')) {
            return Promise.resolve({
              url: state.currentUrl,
              title: 'Test Page',
              loading: false,
              forms: [],
            });
          }
          return Promise.resolve({ ok: true });
        },
        capturePage: () =>
          Promise.resolve({ toPNG: () => Buffer.from('fake-png-bytes') }),
        findInPage: () => 42,
        stopFindInPage: () => undefined,
        setZoomFactor: () => undefined,
        getZoomFactor: () => 1,
        copy: () => undefined,
        inspectElement: () => undefined,
        goBack: () => undefined,
        goForward: () => undefined,
        reload: () => undefined,
        __handlers: handlers,
      };
      this.webContents = wc;
      state.views.push({ wc, view: this });
    }
    setBounds(bounds: Record<string, unknown>): void {
      (this.webContents.boundsCalls as Array<Record<string, unknown>>).push(
        bounds,
      );
    }
    getBounds() {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
  }
  return {
    BrowserView,
    BrowserWindow: class {},
    IpcMain: class {},
    app: { getPath: () => '/tmp/lucid-test-user-data' },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: () => undefined,
        on: () => undefined,
      }),
    },
    clipboard: { writeText: () => undefined },
    Menu: { buildFromTemplate: () => ({ popup: () => undefined }) },
    shell: {
      openExternal: () => undefined,
      showItemInFolder: () => undefined,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
    },
  };
});

vi.mock('electron-store', () => ({
  default: class {
    private data = new Map<string, unknown>();
    constructor(_opts?: unknown) {}
    get(key: string) {
      return this.data.get(key);
    }
    set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    has(key: string) {
      return this.data.has(key);
    }
    delete(key: string) {
      this.data.delete(key);
    }
    get store() {
      return Object.fromEntries(this.data);
    }
  },
}));

/** A fake window that tracks which view is attached to it and
 * which events its webContents received. */
const makeFakeWindow = () => {
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  let attached: unknown = null;
  return {
    sent,
    attached: () => attached,
    isDestroyed: () => false,
    getBrowserView: () => attached,
    setBrowserView: (view: unknown) => {
      attached = view;
    },
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sent.push({ channel, args });
      },
    },
  };
};

const setup = async (withMini = true) => {
  const { setupBrowserHandlers } = await import('../electron/ipc/browser');
  const handlers: Handlers = {};
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }),
  } as unknown as import('electron').IpcMain;
  const mainWin = makeFakeWindow();
  const miniWin = makeFakeWindow();
  let miniClosedCount = 0;
  let onClosed: (() => void) | null = null;
  // The fake mini window's close() fires its 'closed' handler, like
  // the real window does — synchronously here, for determinism.
  const miniClose = () => {
    miniClosedCount += 1;
    onClosed?.();
  };
  const mini = {
    ...miniWin,
    close: miniClose,
    closedCount: () => miniClosedCount,
    fireClosed: () => onClosed?.(),
  };
  const options: Record<string, unknown> = {};
  if (withMini) {
    options.mini = {
      create: (cb: () => void) => {
        onClosed = cb;
        return mini as unknown as import('electron').BrowserWindow;
      },
      get: () => mini as unknown as import('electron').BrowserWindow,
    };
  }
  setupBrowserHandlers(
    mockIpcMain,
    () => mainWin as unknown as import('electron').BrowserWindow,
    options as never,
  );
  return { handlers, mainWin, mini };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const createTab = (handlers: Handlers, tabId: string, url = 'https://example.com/') => {
  miniState().currentUrl = url;
  call(handlers, 'browser:create', tabId, url);
};

const activateTab = (handlers: Handlers, tabId: string) => {
  call(handlers, 'browser:activate', tabId, {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
};

const viewOf = (tabId: string) => {
  const index = tabId === 'tab-1' ? 0 : 1;
  return miniState().views[index];
};

const handlersOf = (wc: Record<string, unknown>) =>
  wc.__handlers as Record<string, (...args: unknown[]) => void>;

const miniClosedEvents = (sent: Array<{ channel: string; args: unknown[] }>) =>
  sent.filter((s) => s.channel === 'browser:mini-closed');

beforeEach(() => {
  const state = miniState();
  state.currentUrl = '';
  state.readResult = { hasPassword: false, username: '', password: '' };
  state.scripts = [];
  state.views = [];
});

describe('pop-out', () => {
  it('reports mini-unavailable when no mini window is wired', async () => {
    const { handlers } = await setup(false);
    createTab(handlers, 'tab-1');
    expect(await call(handlers, 'browser:pop-out', 'tab-1')).toEqual({
      ok: false,
      error: 'mini-unavailable',
    });
  });

  it('reports no-such-tab for an unknown tab', async () => {
    const { handlers } = await setup();
    expect(await call(handlers, 'browser:pop-out', 'nope')).toEqual({
      ok: false,
      error: 'no-such-tab',
    });
  });

  it('moves the view from the main window to the mini window', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    activateTab(handlers, 'tab-1');
    expect(mainWin.attached()).toBe(viewOf('tab-1').view);
    expect(await call(handlers, 'browser:pop-out', 'tab-1')).toEqual({
      ok: true,
    });
    expect(mainWin.attached()).toBeNull();
    expect(mini.attached()).toBe(viewOf('tab-1').view);
    // The mini window hears the tab's state on pop-out.
    const states = mini.sent.filter((s) => s.channel === 'browser:mini-state');
    expect(states).toHaveLength(1);
    expect(states[0].args[0]).toBe('tab-1');
    expect(
      (states[0].args[1] as Record<string, unknown>).url,
    ).toBe('https://example.com/');
  });

  it('popping out twice is a no-op, not an error', async () => {
    const { handlers, mini } = await setup();
    createTab(handlers, 'tab-1');
    expect(await call(handlers, 'browser:pop-out', 'tab-1')).toEqual({
      ok: true,
    });
    expect(await call(handlers, 'browser:pop-out', 'tab-1')).toEqual({
      ok: true,
    });
    expect(mini.attached()).toBe(viewOf('tab-1').view);
  });

  it('activating a popped-out tab does not drag it back to the main window', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    activateTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(mainWin.attached()).toBeNull();
    expect(mini.attached()).toBe(viewOf('tab-1').view);
  });

  it('set-mini-bounds re-positions the mini view', async () => {
    const { handlers } = await setup();
    createTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    const wc = viewOf('tab-1').wc;
    const before = (wc.boundsCalls as unknown[]).length;
    call(handlers, 'browser:set-mini-bounds', {
      x: 5,
      y: 80,
      width: 600,
      height: 300,
    });
    const calls = wc.boundsCalls as Array<Record<string, unknown>>;
    expect(calls.length).toBe(before + 1);
    expect(calls[calls.length - 1]).toEqual({
      x: 5,
      y: 80,
      width: 600,
      height: 300,
    });
  });

  it('page updates reach the mini window while the tab is out', async () => {
    const { handlers, mini } = await setup();
    createTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    mini.sent.length = 0;
    handlersOf(viewOf('tab-1').wc)['did-navigate']();
    const states = mini.sent.filter((s) => s.channel === 'browser:mini-state');
    expect(states).toHaveLength(1);
    expect(states[0].args[0]).toBe('tab-1');
  });
});

describe('pop-in', () => {
  it('pops back in: mini detaches and closes, panel is told', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    mainWin.sent.length = 0;
    expect(await call(handlers, 'browser:pop-in', 'tab-1')).toEqual({
      ok: true,
    });
    expect(mini.attached()).toBeNull();
    expect(mini.closedCount()).toBe(1);
    // The panel hears it, so it can re-attach the active tab.
    expect(miniClosedEvents(mainWin.sent)).toHaveLength(1);
    expect(miniClosedEvents(mainWin.sent)[0].args[0]).toBe('tab-1');
    // Pop-in never attaches the view to the main window directly
    // (the panel does that when it hears mini-closed).
    expect(mainWin.attached()).toBeNull();
    expect(await call(handlers, 'browser:pop-in', 'tab-1')).toEqual({
      ok: false,
      error: 'not-popped-out',
    });
  });

  it('closing the mini window directly pops the tab back in', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    mainWin.sent.length = 0;
    mini.fireClosed();
    expect(mini.attached()).toBeNull();
    expect(miniClosedEvents(mainWin.sent)).toHaveLength(1);
    expect(mini.closedCount()).toBe(0);
  });

  it('popping out a second tab pops the first back in (window stays open)', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    createTab(handlers, 'tab-2');
    await call(handlers, 'browser:pop-out', 'tab-1');
    mainWin.sent.length = 0;
    expect(await call(handlers, 'browser:pop-out', 'tab-2')).toEqual({
      ok: true,
    });
    expect(mini.attached()).toBe(viewOf('tab-2').view);
    expect(mini.closedCount()).toBe(0);
    expect(miniClosedEvents(mainWin.sent)).toHaveLength(1);
    expect(miniClosedEvents(mainWin.sent)[0].args[0]).toBe('tab-1');
  });

  it('closing a popped-out tab closes the mini window and tells the panel', async () => {
    const { handlers, mainWin, mini } = await setup();
    createTab(handlers, 'tab-1');
    await call(handlers, 'browser:pop-out', 'tab-1');
    mainWin.sent.length = 0;
    call(handlers, 'browser:close', 'tab-1');
    expect(mini.attached()).toBeNull();
    expect(mini.closedCount()).toBe(1);
    expect(miniClosedEvents(mainWin.sent)).toHaveLength(1);
    expect(viewOf('tab-1').wc.destroyed).toBe(true);
  });
});
