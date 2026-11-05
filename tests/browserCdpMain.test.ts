/**
 * CDP Tier 2 (Area 8) IPC tests: the trusted-click and diagnostics
 * handlers in `electron/ipc/browser.ts` with a mocked Electron
 * (same pattern as tests/browserMiniMain.test.ts), plus the AI
 * bridge `trustedClick` target.
 *
 * The mock's webContents carries a fake `debugger` (attach /
 * detach / sendCommand / message events) and answers the
 * element-centre script with a fixed point, so the tests prove
 * the real wiring: lazy attach, trusted mouse events at the
 * element's centre, diagnostics from debugger events, and
 * detach on tab close.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface IpcState {
  currentUrl: string;
  scripts: string[];
  views: Array<{ wc: Record<string, unknown>; view: unknown }>;
}

(globalThis as unknown as { __cdpState: unknown }).__cdpState ??= {
  currentUrl: '',
  scripts: [],
  views: [],
};

const ipcState = () =>
  (globalThis as unknown as { __cdpState: IpcState }).__cdpState;

vi.mock('electron', () => {
  const state = ipcState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const dbg = {
        attached: false,
        commands: [] as Array<{
          method: string;
          params?: Record<string, unknown>;
        }>,
        listeners: [] as Array<
          (event: unknown, method: string, params: Record<string, unknown>) => void
        >,
        attach: async () => {
          dbg.attached = true;
        },
        detach: async () => {
          dbg.attached = false;
        },
        sendCommand: async (
          method: string,
          params?: Record<string, unknown>,
        ) => {
          dbg.commands.push({ method, params });
          return {};
        },
        isAttached: () => dbg.attached,
        on: (
          _event: string,
          listener: (
            event: unknown,
            method: string,
            params: Record<string, unknown>,
          ) => void,
        ) => {
          dbg.listeners.push(listener);
        },
      };
      const wc: Record<string, unknown> = {
        destroyed: false,
        debugger: dbg,
        __debugger: dbg,
        __emitDebugger: (method: string, params: Record<string, unknown>) => {
          for (const listener of dbg.listeners) listener({}, method, params);
        },
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
          if (script.includes('getBoundingClientRect')) {
            return Promise.resolve({ x: 120, y: 80 });
          }
          if (script.includes('__findPassword')) {
            if (script.includes('__setFieldValue')) {
              return Promise.resolve(true);
            }
            return Promise.resolve({
              hasPassword: false,
              username: '',
              password: '',
            });
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
          if (script.includes('!!document.querySelector')) {
            return Promise.resolve(true);
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
    setBounds() {}
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

const makeFakeWindow = () => {
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  let attached: unknown = null;
  return {
    sent,
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

const setup = async () => {
  const { setupBrowserHandlers } = await import('../electron/ipc/browser');
  const handlers: Handlers = {};
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }),
  } as unknown as import('electron').IpcMain;
  const mainWin = makeFakeWindow();
  setupBrowserHandlers(
    mockIpcMain,
    () => mainWin as unknown as import('electron').BrowserWindow,
    {},
  );
  return { handlers, mainWin };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const viewWc = (index = 0) => ipcState().views[index].wc;

const debuggerOf = (wc: Record<string, unknown>) =>
  wc.__debugger as {
    attached: boolean;
    commands: Array<{ method: string; params?: Record<string, unknown> }>;
  };

const emitDebugger = (
  wc: Record<string, unknown>,
  method: string,
  params: Record<string, unknown>,
) =>
  (wc.__emitDebugger as (m: string, p: Record<string, unknown>) => void)(
    method,
    params,
  );

beforeEach(() => {
  const state = ipcState();
  state.currentUrl = '';
  state.scripts = [];
  state.views = [];
});

describe('trusted-click IPC', () => {
  it('clicks the element with trusted mouse events at its centre', async () => {
    const { handlers } = await setup();
    ipcState().currentUrl = 'https://example.com/';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    const result = (await call(
      handlers,
      'browser:action-trusted-click',
      'tab-1',
      '#buy-now',
    )) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: true });
    const dbg = debuggerOf(viewWc());
    expect(dbg.attached).toBe(true);
    const mouse = dbg.commands.filter(
      (c) => c.method === 'Input.dispatchMouseEvent',
    );
    expect(mouse).toHaveLength(2);
    expect(mouse[0].params).toMatchObject({
      type: 'mousePressed',
      x: 120,
      y: 80,
      button: 'left',
    });
    expect(mouse[1].params).toMatchObject({
      type: 'mouseReleased',
      x: 120,
      y: 80,
      button: 'left',
    });
  });

  it('an unknown tab is no-such-tab', async () => {
    const { handlers } = await setup();
    expect(
      await call(handlers, 'browser:action-trusted-click', 'ghost', '#x'),
    ).toEqual({ ok: false, error: 'no-such-tab' });
  });

  it('closing the tab detaches the debugger session', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    await call(handlers, 'browser:action-trusted-click', 'tab-1', '#x');
    expect(debuggerOf(viewWc()).attached).toBe(true);
    call(handlers, 'browser:close', 'tab-1');
    // Detach is async; give the promise a turn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(debuggerOf(viewWc()).attached).toBe(false);
  });
});

describe('diagnostics IPC', () => {
  it('returns what the session observed on the tab', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    const first = (await call(
      handlers,
      'browser:cdp-diagnostics',
      'tab-1',
    )) as {
      ok: boolean;
      diagnostics?: {
        networkFailures: unknown[];
        consoleErrors: unknown[];
      };
    };
    expect(first.ok).toBe(true);
    expect(first.diagnostics?.networkFailures).toEqual([]);
    emitDebugger(viewWc(), 'Network.requestWillBeSent', {
      requestId: '1',
      request: { url: 'https://example.com/api' },
    });
    emitDebugger(viewWc(), 'Network.loadingFailed', {
      requestId: '1',
      errorText: 'net::ERR_CONNECTION_REFUSED',
    });
    emitDebugger(viewWc(), 'Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ value: 'boom' }],
    });
    const second = (await call(
      handlers,
      'browser:cdp-diagnostics',
      'tab-1',
    )) as {
      ok: boolean;
      diagnostics?: {
        networkFailures: Array<Record<string, unknown>>;
        consoleErrors: Array<Record<string, unknown>>;
      };
    };
    expect(second.diagnostics?.networkFailures).toHaveLength(1);
    expect(second.diagnostics?.networkFailures[0].url).toBe(
      'https://example.com/api',
    );
    expect(second.diagnostics?.consoleErrors).toHaveLength(1);
    expect(second.diagnostics?.consoleErrors[0].text).toBe('boom');
  });

  it('an unknown tab is no-such-tab', async () => {
    const { handlers } = await setup();
    expect(await call(handlers, 'browser:cdp-diagnostics', 'ghost')).toEqual({
      ok: false,
      error: 'no-such-tab',
    });
  });
});

describe('AI bridge trustedClick', () => {
  it('clicks the active tab and reports trusted input', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    ipcState().currentUrl = 'https://example.com/';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const target = getBrowserToolTarget();
    expect(target).not.toBeNull();
    const result = await target!.trustedClick('#buy-now');
    expect(result).toBe('Clicked #buy-now (trusted input).');
    const mouse = debuggerOf(viewWc()).commands.filter(
      (c) => c.method === 'Input.dispatchMouseEvent',
    );
    expect(mouse).toHaveLength(2);
  });

  it('no active tab is a clean message', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    const target = getBrowserToolTarget();
    const result = await target!.trustedClick('#x');
    expect(result).toBe('No browser tab is open.');
  });
});
