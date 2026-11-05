/**
 * Browser page actions (Area 4) main-process tests: the action
 * runner driven through setupBrowserHandlers with a mocked
 * Electron (same pattern as tests/browserCredentialsMain.test.ts).
 *
 * The mock page answers scripts by content: the fill/click scripts
 * by their embedded selector, the read-text script with canned
 * text, the state script with a canned form, and the
 * selector-present script with a controllable delay (to prove the
 * wait polls instead of returning on the first check).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface ActionState {
  currentUrl: string;
  readResult: { hasPassword: boolean; username: string; password: string };
  scripts: string[];
  views: Array<{ wc: Record<string, unknown> }>;
  /** Present-check calls before the selector counts as present. */
  presentAfter: number;
  presentCalls: number;
}

(globalThis as unknown as { __actionState: unknown }).__actionState ??= {
  currentUrl: '',
  readResult: { hasPassword: false, username: '', password: '' },
  scripts: [],
  views: [],
  presentAfter: 0,
  presentCalls: 0,
};

const actionState = () =>
  (globalThis as unknown as { __actionState: ActionState }).__actionState;

/** Extract the JSON-embedded selector from an action script. */
const embeddedSelector = (script: string): string | null => {
  const match = /document\.querySelector\(("(?:[^"\\]|\\.)*")\)/.exec(script);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
};

vi.mock('electron', () => {
  const state = actionState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => undefined,
        getURL: () => state.currentUrl,
        getTitle: () => 'Test Page',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        executeJavaScript: (script: string) => {
          state.scripts.push(script);
          // Credential scripts (Area 3) also run on load/navigate:
          // the fill script sets a value, the read script returns
          // the (empty) login fields — no offer, no interference.
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
              text: 'Hello world, this is the page text.',
            });
          }
          if (script.includes('document.forms')) {
            return Promise.resolve({
              url: state.currentUrl,
              title: 'Test Page',
              loading: false,
              forms: [
                {
                  action: '/login',
                  method: 'post',
                  fields: [
                    {
                      name: 'q',
                      type: 'text',
                      label: 'Search',
                      autocomplete: '',
                      hasValue: false,
                    },
                  ],
                },
              ],
            });
          }
          if (script.includes('__setFieldValue')) {
            // Action fill: answer by the embedded selector.
            const selector = embeddedSelector(script);
            if (selector === '#missing') {
              return Promise.resolve({ ok: false, error: 'not-found' });
            }
            if (selector === 'input[type="password"]') {
              return Promise.resolve({ ok: false, error: 'password-field' });
            }
            return Promise.resolve({ ok: true });
          }
          if (script.includes('scrollIntoView')) {
            const selector = embeddedSelector(script);
            if (selector === '#missing') {
              return Promise.resolve({ ok: false, error: 'not-found' });
            }
            return Promise.resolve({ ok: true });
          }
          if (script.includes('!!document.querySelector')) {
            state.presentCalls += 1;
            return Promise.resolve(state.presentCalls > state.presentAfter);
          }
          return Promise.resolve(undefined);
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

const setup = async () => {
  const { setupBrowserHandlers } = await import('../electron/ipc/browser');
  const handlers: Handlers = {};
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }),
  } as unknown as import('electron').IpcMain;
  const fakeWindow = {
    isDestroyed: () => false,
    getBrowserView: () => null,
    setBrowserView: () => undefined,
    webContents: { send: () => undefined },
  } as unknown as import('electron').BrowserWindow;
  setupBrowserHandlers(mockIpcMain, () => fakeWindow);
  return { handlers };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const createTab = (handlers: Handlers, url = 'https://example.com/') => {
  actionState().currentUrl = url;
  call(handlers, 'browser:create', 'tab-1', url);
};

beforeEach(() => {
  const state = actionState();
  state.currentUrl = '';
  state.readResult = { hasPassword: false, username: '', password: '' };
  state.scripts = [];
  state.views = [];
  state.presentAfter = 0;
  state.presentCalls = 0;
});

describe('readText', () => {
  it('returns the page title, url and text', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = (await call(
      handlers,
      'browser:action-read-text',
      'tab-1',
    )) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.text).toEqual({
      title: 'Test Page',
      url: 'https://example.com/',
      text: 'Hello world, this is the page text.',
    });
  });

  it('unknown tab reports no-such-tab', async () => {
    const { handlers } = await setup();
    const result = (await call(
      handlers,
      'browser:action-read-text',
      'no-such-tab',
    )) as Record<string, unknown>;
    expect(result).toEqual({ ok: false, error: 'no-such-tab' });
  });
});

describe('getState', () => {
  it('returns url, title, load state and forms', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = (await call(
      handlers,
      'browser:action-state',
      'tab-1',
    )) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    const state = result.state as Record<string, unknown>;
    expect(state.url).toBe('https://example.com/');
    expect(state.loading).toBe(false);
    expect(state.forms).toHaveLength(1);
    const form = (state.forms as Array<Record<string, unknown>>)[0];
    expect(form.action).toBe('/login');
    expect((form.fields as Array<Record<string, unknown>>)[0].label).toBe(
      'Search',
    );
  });
});

describe('fill', () => {
  it('fills a field and reports ok', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = await call(
      handlers,
      'browser:action-fill',
      'tab-1',
      '#email',
      'gary@example.com',
    );
    expect(result).toEqual({ ok: true });
    // The value travelled inside the main-built script only.
    expect(actionState().scripts.join('\n')).toContain('gary@example.com');
  });

  it('reports not-found for a missing element', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = await call(
      handlers,
      'browser:action-fill',
      'tab-1',
      '#missing',
      'v',
    );
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('refuses a password field — use the saved-login fill', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = await call(
      handlers,
      'browser:action-fill',
      'tab-1',
      'input[type="password"]',
      'hunter2',
    );
    expect(result).toEqual({ ok: false, error: 'password-field' });
  });

  it('rejects a bad selector / oversize value without running a script', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const before = actionState().scripts.length;
    expect(
      await call(handlers, 'browser:action-fill', 'tab-1', '', 'v'),
    ).toEqual({ ok: false, error: 'bad-selector' });
    expect(
      await call(
        handlers,
        'browser:action-fill',
        'tab-1',
        '#email',
        'x'.repeat(10001),
      ),
    ).toEqual({ ok: false, error: 'bad-value' });
    expect(actionState().scripts.length).toBe(before);
  });
});

describe('click', () => {
  it('clicks and reports ok; not-found for a missing element', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    expect(
      await call(handlers, 'browser:action-click', 'tab-1', '#submit'),
    ).toEqual({ ok: true });
    expect(
      await call(handlers, 'browser:action-click', 'tab-1', '#missing'),
    ).toEqual({ ok: false, error: 'not-found' });
    expect(
      await call(handlers, 'browser:action-click', 'tab-1', ''),
    ).toEqual({ ok: false, error: 'bad-selector' });
  });
});

describe('waitForSelector', () => {
  it('polls until the selector appears', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    // Not present for the first two checks, then present.
    actionState().presentAfter = 2;
    const result = await call(
      handlers,
      'browser:action-wait',
      'tab-1',
      '#ready',
      5000,
    );
    expect(result).toEqual({ ok: true });
    expect(actionState().presentCalls).toBe(3);
  });

  it('times out when the selector never appears', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    actionState().presentAfter = Number.POSITIVE_INFINITY;
    const started = Date.now();
    const result = await call(
      handlers,
      'browser:action-wait',
      'tab-1',
      '#never',
      150,
    );
    expect(result).toEqual({ ok: false, error: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(actionState().presentCalls).toBeGreaterThan(0);
  });

  it('rejects a bad selector without polling', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    expect(await call(handlers, 'browser:action-wait', 'tab-1', '')).toEqual({
      ok: false,
      error: 'bad-selector',
    });
    expect(actionState().presentCalls).toBe(0);
  });
});

describe('screenshot', () => {
  it('returns a PNG data URL', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const result = (await call(
      handlers,
      'browser:action-screenshot',
      'tab-1',
    )) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.dataUrl).toBe(
      `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`,
    );
  });

  it('unknown tab reports no-such-tab', async () => {
    const { handlers } = await setup();
    expect(
      await call(handlers, 'browser:action-screenshot', 'nope'),
    ).toEqual({ ok: false, error: 'no-such-tab' });
  });
});

describe('capTextForAi', () => {
  it('caps page text for the chat context', async () => {
    const { capTextForAi } = await import(
      '../electron/services/browserActions'
    );
    expect(capTextForAi('short')).toBe('short');
    const long = 'x'.repeat(20000);
    expect(capTextForAi(long)).toHaveLength(8000);
  });
});
