/**
 * Browser polish (Area 9) main-process tests: per-site
 * permission memory (hold + ask, once/always/deny, list,
 * revoke), save-page-as-file, and the main-side visit log
 * behind the AI `browser_history` tool — all through
 * `electron/ipc/browser.ts` with a mocked Electron (same
 * pattern as tests/browserCdpMain.test.ts).
 *
 * The mock session captures the permission-request handler so
 * the tests can drive it like a page asking for the camera.
 * The allowlist + visit-log files live under /tmp and are
 * wiped before each test so runs are isolated.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type Handlers = Record<string, (...args: unknown[]) => unknown>;
type PermissionHandler = (
  webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
  details: { requestingUrl?: string },
) => void;

interface IpcState {
  currentUrl: string;
  scripts: string[];
  views: Array<{ wc: Record<string, unknown>; view: unknown }>;
  savePageCalls: Array<{ filePath: string; type: string }>;
  permissionHandler: PermissionHandler | null;
}

(globalThis as unknown as { __polishState: unknown }).__polishState ??= {
  currentUrl: '',
  scripts: [],
  views: [],
  savePageCalls: [],
  permissionHandler: null,
};

const ipcState = () =>
  (globalThis as unknown as { __polishState: IpcState }).__polishState;

const USER_DATA = '/tmp/lucid-test-user-data';

vi.mock('electron', () => {
  const state = ipcState();
  state.views = [];
  state.savePageCalls = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        destroyed: false,
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
        savePage: (filePath: string, type: string) => {
          state.savePageCalls.push({ filePath, type });
          return Promise.resolve();
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
    app: { getPath: (name: string) => (name === 'downloads' ? '/tmp/lucid-test-downloads' : USER_DATA) },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: (handler: PermissionHandler) => {
          state.permissionHandler = handler;
        },
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

const requestPermission = (permission: string, requestingUrl?: string) =>
  new Promise<boolean>((resolve) => {
    const handler = ipcState().permissionHandler;
    expect(handler).not.toBeNull();
    handler!(null, permission, resolve, { requestingUrl });
  });

const permissionEvents = (mainWin: ReturnType<typeof makeFakeWindow>) =>
  mainWin.sent.filter((s) => s.channel === 'browser:permission-requested');

beforeEach(() => {
  const state = ipcState();
  state.currentUrl = '';
  state.scripts = [];
  state.views = [];
  state.savePageCalls = [];
  state.permissionHandler = null;
  for (const file of ['browser-permissions.json', 'browser-visits.json']) {
    try {
      fs.rmSync(path.join(USER_DATA, file), { force: true });
    } catch {
      // Already gone.
    }
  }
});

describe('permission memory', () => {
  it('an allowlisted origin is granted immediately, with no prompt', async () => {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(
      path.join(USER_DATA, 'browser-permissions.json'),
      JSON.stringify({ 'https://meet.example': ['camera'] }),
    );
    const { mainWin } = await setup();
    const granted = await requestPermission(
      'camera',
      'https://meet.example/room',
    );
    expect(granted).toBe(true);
    expect(permissionEvents(mainWin)).toHaveLength(0);
  });

  it('a new request is held and asked about once; a repeat joins the same prompt', async () => {
    const { handlers, mainWin } = await setup();
    let first: boolean | null = null;
    let second: boolean | null = null;
    const p1 = requestPermission('camera', 'https://meet.example/room').then(
      (v) => {
        first = v;
      },
    );
    const p2 = requestPermission('camera', 'https://meet.example/room').then(
      (v) => {
        second = v;
      },
    );
    // Neither callback has fired: the request is held.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(permissionEvents(mainWin)).toHaveLength(1);
    expect(permissionEvents(mainWin)[0].args[0]).toEqual({
      origin: 'https://meet.example',
      permission: 'camera',
    });
    // Answering once grants BOTH held requests.
    expect(
      await call(
        handlers,
        'browser:permission-answer',
        'https://meet.example',
        'camera',
        'once',
      ),
    ).toEqual({ ok: true });
    await Promise.all([p1, p2]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    // "Allow once" is remembered for the session: no second prompt.
    expect(
      await requestPermission('camera', 'https://meet.example/other'),
    ).toBe(true);
    expect(permissionEvents(mainWin)).toHaveLength(1);
  });

  it('deny answers no; the next request asks again', async () => {
    const { handlers, mainWin } = await setup();
    const p1 = requestPermission('microphone', 'https://chat.example/');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      await call(
        handlers,
        'browser:permission-answer',
        'https://chat.example',
        'microphone',
        'deny',
      ),
    ).toEqual({ ok: true });
    expect(await p1).toBe(false);
    const p2 = requestPermission('microphone', 'https://chat.example/');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(permissionEvents(mainWin)).toHaveLength(2);
    expect(
      await call(
        handlers,
        'browser:permission-answer',
        'https://chat.example',
        'microphone',
        'deny',
      ),
    ).toEqual({ ok: true });
    expect(await p2).toBe(false);
  });

  it('allow always persists: a fresh setup still grants it', async () => {
    const { handlers } = await setup();
    const p1 = requestPermission('camera', 'https://meet.example/room');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await call(
      handlers,
      'browser:permission-answer',
      'https://meet.example',
      'camera',
      'always',
    );
    expect(await p1).toBe(true);
    const list = (await call(handlers, 'browser:permission-list')) as {
      ok: boolean;
      allowlist: Record<string, string[]>;
    };
    expect(list.allowlist).toEqual({ 'https://meet.example': ['camera'] });
    // A fresh setup (new process lifetime) loads it from disk.
    await setup();
    expect(
      await requestPermission('camera', 'https://meet.example/room'),
    ).toBe(true);
  });

  it('answering with nothing pending fails cleanly; revoke removes the entry', async () => {
    const { handlers } = await setup();
    expect(
      await call(
        handlers,
        'browser:permission-answer',
        'https://x.example',
        'camera',
        'deny',
      ),
    ).toEqual({ ok: false, error: 'no-such-request' });
    const p1 = requestPermission('camera', 'https://x.example/');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await call(
      handlers,
      'browser:permission-answer',
      'https://x.example',
      'camera',
      'always',
    );
    expect(await p1).toBe(true);
    const revoked = (await call(
      handlers,
      'browser:permission-revoke',
      'https://x.example',
      'camera',
    )) as { ok: boolean; allowlist: Record<string, string[]> };
    expect(revoked.allowlist).toEqual({});
    // The next request asks again.
    const p2 = requestPermission('camera', 'https://x.example/');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await call(handlers, 'browser:permission-list')).toEqual({
      ok: true,
      allowlist: {},
    });
    await call(
      handlers,
      'browser:permission-answer',
      'https://x.example',
      'camera',
      'deny',
    );
    expect(await p2).toBe(false);
  });

  it('a request with no requesting URL is denied, never asked about', async () => {
    const { mainWin } = await setup();
    expect(await requestPermission('camera')).toBe(false);
    expect(permissionEvents(mainWin)).toHaveLength(0);
  });
});

describe('save page', () => {
  it('saves the page into the downloads folder', async () => {
    const { handlers } = await setup();
    ipcState().currentUrl = 'https://example.com/article';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/article');
    const result = (await call(handlers, 'browser:save-page', 'tab-1')) as {
      ok: boolean;
      path?: string;
    };
    expect(result.ok).toBe(true);
    expect(result.path).toContain('/tmp/lucid-test-downloads/');
    expect(result.path).toContain('Test_Page-');
    expect(ipcState().savePageCalls).toEqual([
      { filePath: result.path, type: 'HTMLComplete' },
    ]);
  });

  it('an unknown tab is no-such-tab; about:blank is not savable', async () => {
    const { handlers } = await setup();
    expect(await call(handlers, 'browser:save-page', 'ghost')).toEqual({
      ok: false,
      error: 'no-such-tab',
    });
    ipcState().currentUrl = 'about:blank';
    call(handlers, 'browser:create', 'tab-1', 'about:blank');
    expect(await call(handlers, 'browser:save-page', 'tab-1')).toEqual({
      ok: false,
      error: 'not-savable',
    });
  });
});

describe('visit log + browser_history', () => {
  it('a finished load is logged; a reload is not a new visit; blank is not logged', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    ipcState().currentUrl = 'https://example.com/article';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/article');
    const wc = ipcState().views[0].wc;
    const handlersOf = wc.__handlers as Record<string, () => void>;
    // The mock keeps only the last did-finish-load listener: the
    // visit recorder (real Electron runs all three).
    handlersOf['did-finish-load']();
    handlersOf['did-finish-load']();
    const target = getBrowserToolTarget();
    const history = await target!.getHistory(7);
    expect(history).toContain('Test Page (https://example.com/article)');
    expect(history.match(/Test Page/g)).toHaveLength(1);
    // A different page logs too; about:blank does not.
    ipcState().currentUrl = 'https://other.example/';
    handlersOf['did-finish-load']();
    ipcState().currentUrl = 'about:blank';
    handlersOf['did-finish-load']();
    const history2 = await target!.getHistory(7);
    expect(history2).toContain('https://other.example/');
    expect(history2).not.toContain('about:blank');
    expect(history2).toContain('Pages visited in the last 7 days (2):');
  });

  it('getHistory with no visits says so', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    const target = getBrowserToolTarget();
    expect(await target!.getHistory(1)).toBe(
      'No pages visited in the last day.',
    );
  });
});
