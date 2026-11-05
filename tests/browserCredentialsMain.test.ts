/**
 * Browser credentials (Area 3) main-process tests: the vault
 * (encrypt/store/list/delete), capture-on-navigation, the save
 * offer, and auto-fill — driven through setupBrowserHandlers with
 * a mocked Electron (same pattern as
 * tests/browserDownloadsMain.test.ts).
 *
 * The password must NEVER reach the renderer: every test that
 * handles one asserts the sent IPC events do not contain it.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface CredState {
  currentUrl: string;
  readResult: { hasPassword: boolean; username: string; password: string };
  scripts: string[];
  views: Array<{ wc: Record<string, unknown> }>;
}

(globalThis as unknown as { __credState: unknown }).__credState ??= {
  currentUrl: '',
  readResult: { hasPassword: false, username: '', password: '' },
  scripts: [],
  views: [],
};

const credState = () =>
  (globalThis as unknown as { __credState: CredState }).__credState;

vi.mock('electron', () => {
  const state = credState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => undefined,
        getURL: () => state.currentUrl,
        getTitle: () => '',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        executeJavaScript: (script: string) => {
          state.scripts.push(script);
          // The fill script returns a boolean; the read script
          // returns the field values — like the real page would.
          if (script.includes('__setFieldValue')) {
            return Promise.resolve(true);
          }
          return Promise.resolve({ ...state.readResult });
        },
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
      state.views.push({ wc });
    }
    setBounds(): void {}
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
    // Fake keychain: tags the plaintext so tests can prove the
    // stored value is the encrypted form, never the raw password.
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

const flush = () => new Promise((r) => setTimeout(r, 10));

function memoryStore() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: (key: string) => data.get(key),
    set: (key: string, value: unknown) => {
      data.set(key, value);
    },
    has: (key: string) => data.has(key),
    delete: (key: string) => {
      data.delete(key);
    },
    entries: () => Object.fromEntries(data),
  };
}

const setup = async (credentials?: Record<string, unknown>) => {
  const { setupBrowserHandlers } = await import('../electron/ipc/browser');
  const handlers: Handlers = {};
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }),
  } as unknown as import('electron').IpcMain;
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  const fakeWindow = {
    isDestroyed: () => false,
    getBrowserView: () => null,
    setBrowserView: () => undefined,
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sent.push({ channel, args });
      },
    },
  } as unknown as import('electron').BrowserWindow;
  const store = memoryStore();
  setupBrowserHandlers(mockIpcMain, () => fakeWindow, {
    credentials: { store, ...(credentials ?? {}) },
  });
  return { handlers, sent, store };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const view = () => credState().views[credState().views.length - 1].wc;
const handlersOf = (wc: Record<string, unknown>) =>
  wc.__handlers as Record<string, (...args: unknown[]) => void>;

const loginDetected = (sent: Array<{ channel: string; args: unknown[] }>) =>
  sent.filter((s) => s.channel === 'browser:login-detected');

beforeEach(() => {
  const state = credState();
  state.currentUrl = '';
  state.readResult = { hasPassword: false, username: '', password: '' };
  state.scripts = [];
  state.views = [];
});

/** Drive a full sign-in capture, returning the offer sent. */
const capture = async (
  handlers: Handlers,
  sent: Array<{ channel: string; args: unknown[] }>,
  url = 'https://example.com/login',
) => {
  credState().currentUrl = url;
  credState().readResult = {
    hasPassword: true,
    username: 'gary',
    password: 's3cret-pw',
  };
  call(handlers, 'browser:create', 'tab-1', url);
  handlersOf(view())['will-navigate']();
  await flush();
  return loginDetected(sent);
};

describe('capture + offer', () => {
  it('offers a save on will-navigate; the password never reaches the renderer', async () => {
    const { handlers, sent } = await setup();
    const offers = await capture(handlers, sent);
    expect(offers).toHaveLength(1);
    expect(offers[0].args[0]).toEqual({
      origin: 'https://example.com',
      username: 'gary',
    });
    // The password is in main only: no sent event contains it.
    expect(JSON.stringify(sent)).not.toContain('s3cret-pw');
  });

  it('captures on in-page route change too (SPA login)', async () => {
    const { handlers, sent } = await setup();
    credState().currentUrl = 'https://example.com/login';
    credState().readResult = {
      hasPassword: true,
      username: 'gary',
      password: 's3cret-pw',
    };
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/login');
    handlersOf(view())['did-navigate-in-page']();
    await flush();
    expect(loginDetected(sent)).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain('s3cret-pw');
  });

  it('does not offer when no password field is filled', async () => {
    const { handlers, sent } = await setup();
    credState().currentUrl = 'https://example.com/login';
    credState().readResult = {
      hasPassword: false,
      username: '',
      password: '',
    };
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/login');
    handlersOf(view())['will-navigate']();
    await flush();
    expect(loginDetected(sent)).toHaveLength(0);
  });

  it('does not offer a repeat sign-in for the same username', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    expect(call(handlers, 'browser:save-login', 'https://example.com', 'gary')).toBe(true);
    // Sign in again with the same username: no second offer.
    handlersOf(view())['will-navigate']();
    await flush();
    expect(loginDetected(sent)).toHaveLength(1);
  });
});

describe('save / list / delete', () => {
  it('save-login persists encrypted; list returns metadata only', async () => {
    const { handlers, sent, store } = await setup();
    await capture(handlers, sent);
    expect(call(handlers, 'browser:save-login', 'https://example.com', 'gary')).toBe(true);
    const list = call(handlers, 'browser:list-saved-logins') as Array<
      Record<string, unknown>
    >;
    expect(list).toHaveLength(1);
    expect(list[0].origin).toBe('https://example.com');
    expect(list[0].username).toBe('gary');
    expect(typeof list[0].updatedAt).toBe('string');
    expect(list[0]).not.toHaveProperty('password');
    // The stored password is the encrypted form, never plaintext.
    const raw = store.data.get('login:https://example.com') as Record<
      string,
      unknown
    >;
    expect(raw.password).toBe(
      Buffer.from('enc:s3cret-pw').toString('base64'),
    );
    expect(raw.password).not.toBe('s3cret-pw');
  });

  it('dismiss drops the candidate; a later save returns false', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    call(handlers, 'browser:dismiss-login-offer', 'https://example.com');
    expect(call(handlers, 'browser:save-login', 'https://example.com', 'gary')).toBe(false);
    expect(call(handlers, 'browser:list-saved-logins')).toEqual([]);
  });

  it('save with a stale username returns false', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    expect(
      call(handlers, 'browser:save-login', 'https://example.com', 'someone-else'),
    ).toBe(false);
  });

  it('delete removes the login; unknown origins return false', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    call(handlers, 'browser:save-login', 'https://example.com', 'gary');
    expect(call(handlers, 'browser:delete-saved-login', 'https://example.com')).toBe(true);
    expect(call(handlers, 'browser:list-saved-logins')).toEqual([]);
    expect(call(handlers, 'browser:delete-saved-login', 'https://example.com')).toBe(false);
    expect(call(handlers, 'browser:delete-saved-login', 'https://nope.example')).toBe(false);
  });
});

describe('auto-fill', () => {
  it('fills a saved login on did-finish-load, main-side only', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    call(handlers, 'browser:save-login', 'https://example.com', 'gary');
    credState().scripts.length = 0;
    credState().currentUrl = 'https://example.com/dashboard';
    handlersOf(view())['did-finish-load']();
    await flush();
    const fill = credState().scripts[credState().scripts.length - 1];
    expect(fill).toContain('s3cret-pw');
    expect(fill).toContain('HTMLInputElement.prototype');
    expect(JSON.stringify(sent)).not.toContain('s3cret-pw');
  });

  it('does not fill a different origin', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    call(handlers, 'browser:save-login', 'https://example.com', 'gary');
    credState().scripts.length = 0;
    credState().currentUrl = 'https://other.example/';
    handlersOf(view())['did-finish-load']();
    await flush();
    expect(credState().scripts).toHaveLength(0);
  });

  it('fill-saved-login fills the active tab; false with no login', async () => {
    const { handlers, sent } = await setup();
    await capture(handlers, sent);
    call(handlers, 'browser:save-login', 'https://example.com', 'gary');
    // fill-saved-login acts on the ACTIVE tab: activate it first.
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    credState().currentUrl = 'https://example.com/';
    expect(await call(handlers, 'browser:fill-saved-login')).toBe(true);
    call(handlers, 'browser:delete-saved-login', 'https://example.com');
    expect(await call(handlers, 'browser:fill-saved-login')).toBe(false);
  });
});

describe('encryption unavailable', () => {
  it('never offers, never saves', async () => {
    const { handlers, sent } = await setup({
      isEncryptionAvailable: () => false,
    });
    const offers = await capture(handlers, sent);
    expect(offers).toHaveLength(0);
    expect(call(handlers, 'browser:save-login', 'https://example.com', 'gary')).toBe(false);
    expect(call(handlers, 'browser:list-saved-logins')).toEqual([]);
  });
});
