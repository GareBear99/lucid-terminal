/**
 * Browser AI tools (Area 5) main-process tests: the bridge target
 * registered by setupBrowserHandlers, driven with a mocked
 * Electron (same pattern as tests/browserActionsMain.test.ts).
 *
 * Covers web search in its temporary tab (created, read, destroyed
 * — never attached to a window), the search timeout, navigation
 * validation, the no-open-tab case, screenshot saving, and the
 * password-field refusal through the target.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface SearchState {
  currentUrl: string;
  readResult: { hasPassword: boolean; username: string; password: string };
  scripts: string[];
  views: Array<{ wc: Record<string, unknown> }>;
  loadedUrls: string[];
  /** When false, loadURL never fires did-finish-load (timeout test). */
  fireLoad: boolean;
}

(globalThis as unknown as { __searchState: unknown }).__searchState ??= {
  currentUrl: '',
  readResult: { hasPassword: false, username: '', password: '' },
  scripts: [],
  views: [],
  loadedUrls: [],
  fireLoad: true,
};

const searchState = () =>
  (globalThis as unknown as { __searchState: SearchState }).__searchState;

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
  const state = searchState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const onceHandlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        destroyed: false,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        once: (event: string, handler: (...args: unknown[]) => void) => {
          onceHandlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: (url: string) => {
          state.loadedUrls.push(url);
          if (state.fireLoad) {
            setTimeout(() => {
              handlers['did-finish-load']?.();
              onceHandlers['did-finish-load']?.();
            }, 0);
          }
          return Promise.resolve();
        },
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
          if (script.includes('result__a')) {
            return Promise.resolve([
              {
                title: 'First Result',
                url: 'https://first.example/',
                snippet: 'The first snippet.',
              },
              {
                title: 'Second Result',
                url: 'https://second.example/',
                snippet: '',
              },
            ]);
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
              forms: [],
            });
          }
          if (script.includes('__setFieldValue')) {
            const selector = embeddedSelector(script);
            if (selector === 'input[type="password"]') {
              return Promise.resolve({ ok: false, error: 'password-field' });
            }
            return Promise.resolve({ ok: true });
          }
          if (script.includes('scrollIntoView')) {
            return Promise.resolve({ ok: true });
          }
          if (script.includes('!!document.querySelector')) {
            return Promise.resolve(true);
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
  const { getBrowserToolTarget } = await import(
    '../electron/services/browserToolBridge'
  );
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
  return { handlers, getTarget: getBrowserToolTarget };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const createAndActivateTab = (handlers: Handlers) => {
  searchState().currentUrl = 'https://example.com/';
  call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
  call(handlers, 'browser:activate', 'tab-1', {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
};

beforeEach(() => {
  const state = searchState();
  state.currentUrl = '';
  state.readResult = { hasPassword: false, username: '', password: '' };
  state.scripts = [];
  state.views = [];
  state.loadedUrls = [];
  state.fireLoad = true;
});

afterEach(async () => {
  const { clearBrowserToolTarget } = await import(
    '../electron/services/browserToolBridge'
  );
  clearBrowserToolTarget();
  // Screenshot files land under /tmp only; clean them up.
  const dir = '/tmp/lucid-test-user-data/browser-screenshots';
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Nothing to clean.
  }
});

describe('bridge target', () => {
  it('is registered by setupBrowserHandlers', async () => {
    const { getTarget } = await setup();
    expect(getTarget()).not.toBeNull();
  });

  it('readPage returns the active tab text; no tab is a clean message', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    expect(target).not.toBeNull();
    expect(await target!.readPage()).toBe('No browser tab is open.');
    createAndActivateTab(handlers);
    const read = await target!.readPage();
    expect(read).toContain('Page: Test Page (https://example.com/)');
    expect(read).toContain('Hello world, this is the page text.');
  });

  it('navigate validates the URL and opens http(s) in the active tab', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    expect(await target!.navigate('not a url')).toMatch(/not a valid URL/);
    expect(await target!.navigate('javascript:alert(1)')).toMatch(
      /only http\(s\)/,
    );
    expect(await target!.navigate('https://example.com/')).toBe(
      'Could not open https://example.com/: no browser tab is open and a new one did not appear — open the Browser tab in the AI panel and try again.',
    );
    createAndActivateTab(handlers);
    expect(await target!.navigate('https://other.example/page')).toBe(
      'Opened https://other.example/page in the active tab.',
    );
    expect(searchState().loadedUrls).toContain(
      'https://other.example/page',
    );
  });

  it('fill refuses a password field through the target', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    createAndActivateTab(handlers);
    expect(
      await target!.fill('input[type="password"]', 'hunter2'),
    ).toMatch(/password field/);
    expect(await target!.fill('#q', 'hello')).toBe('Filled #q.');
    expect(await target!.click('#go')).toBe('Clicked #go.');
  });

  it('getState returns the page description as JSON', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    createAndActivateTab(handlers);
    const state = await target!.getState();
    expect(JSON.parse(state).url).toBe('https://example.com/');
  });

  it('screenshot saves a PNG under userData and returns the path', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    createAndActivateTab(handlers);
    const result = await target!.screenshot();
    expect(result).toMatch(/^Screenshot saved to \/tmp\/lucid-test-user-data\/browser-screenshots\/browser-.*\.png\.$/);
    const filePath = result.replace(/^Screenshot saved to /, '').replace(/\.$/, '');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath).toString()).toBe('fake-png-bytes');
  });
});

describe('search', () => {
  it('reads results off a temporary tab and destroys it', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    createAndActivateTab(handlers);
    const before = searchState().views.length;
    const result = await target!.search('lucid terminal');
    expect(result).toContain('1. First Result');
    expect(result).toContain('https://first.example/');
    expect(result).toContain('The first snippet.');
    expect(result).toContain('2. Second Result');
    // A temporary view was created for the search…
    expect(searchState().views.length).toBe(before + 1);
    expect(searchState().loadedUrls).toContain(
      'https://html.duckduckgo.com/html/?q=lucid%20terminal',
    );
    // …and destroyed once the results were read.
    const tempView = searchState().views[searchState().views.length - 1].wc;
    expect(tempView.destroyed).toBe(true);
    // The real tab still works afterwards.
    const read = (await call(
      handlers,
      'browser:action-read-text',
      'tab-1',
    )) as Record<string, unknown>;
    expect(read.ok).toBe(true);
  });

  it('times out and destroys the tab when the results page never loads', async () => {
    const { handlers, getTarget } = await setup();
    const target = getTarget();
    createAndActivateTab(handlers);
    searchState().fireLoad = false;
    const result = await target!.search('slow query', 1200);
    expect(result).toBe('Search timed out after 1s.');
    const tempView = searchState().views[searchState().views.length - 1].wc;
    expect(tempView.destroyed).toBe(true);
  });
});
