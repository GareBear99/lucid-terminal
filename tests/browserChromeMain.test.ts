/**
 * Browser chrome (Area 1) main-process tests: find-in-page, zoom and
 * open-in-system-browser, driven through setupBrowserHandlers with a
 * mocked Electron (same pattern as tests/phoneView.test.ts).
 *
 * The mock records every BrowserView's webContents calls so the tests
 * can assert on findInPage / stopFindInPage / setZoomFactor, captures
 * the 'found-in-page' listener so it can be fired by hand, and records
 * shell.openExternal calls.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockWebContents {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  __handlers: Record<string, (...args: unknown[]) => void>;
  __findCalls: Array<{ text: string; options: unknown }>;
  __stopCalls: string[];
  __zoomCalls: number[];
}

// The mock factory below only runs when 'electron' is first imported
// (inside setup()), but beforeEach clears these first — so they must
// exist from module load. The factory replaces them with its own
// arrays when it runs; views() always reads the live global.
(globalThis as unknown as { __chromeViews: unknown[] }).__chromeViews ??= [];
(globalThis as unknown as { __openExternalCalls: string[] }).__openExternalCalls ??= [];

vi.mock('electron', () => {
  const created: Array<{ opts: unknown; wc: MockWebContents }> = [];
  (globalThis as unknown as { __chromeViews: unknown[] }).__chromeViews =
    created;
  const openExternalCalls: string[] = [];
  (globalThis as unknown as { __openExternalCalls: string[] }).__openExternalCalls =
    openExternalCalls;
  class BrowserView {
    webContents: MockWebContents;
    constructor(opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => undefined,
        getURL: () => '',
        getTitle: () => '',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        findInPage: (text: string, options: unknown) => {
          wc.__findCalls.push({ text, options });
          return 42;
        },
        stopFindInPage: (action: string) => {
          wc.__stopCalls.push(action);
        },
        setZoomFactor: (factor: number) => {
          wc.__zoomCalls.push(factor);
        },
        getZoomFactor: () => 1,
        copy: () => undefined,
        inspectElement: () => undefined,
        goBack: () => undefined,
        goForward: () => undefined,
        reload: () => undefined,
        __handlers: handlers,
        __findCalls: [] as Array<{ text: string; options: unknown }>,
        __stopCalls: [] as string[],
        __zoomCalls: [] as number[],
      } as unknown as MockWebContents & {
        findInPage: (text: string, options: unknown) => number;
        stopFindInPage: (action: string) => void;
        setZoomFactor: (factor: number) => void;
      };
      this.webContents = wc;
      created.push({ opts, wc });
    }
    setBounds(): void {
      // No-op in the mock.
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
        // Area 2 registers will-download on the same session.
        on: () => undefined,
      }),
    },
    clipboard: { writeText: () => undefined },
    Menu: { buildFromTemplate: () => ({ popup: () => undefined }) },
    shell: {
      openExternal: (url: string) => {
        openExternalCalls.push(url);
      },
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

type Handlers = Record<string, (...args: unknown[]) => unknown>;

const setup = async () => {
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
  setupBrowserHandlers(mockIpcMain, () => fakeWindow);
  return { handlers, sent };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const createTab = (handlers: Handlers, tabId = 'tab-1') =>
  call(handlers, 'browser:create', tabId, 'https://example.com');

const views = () =>
  (globalThis as unknown as { __chromeViews: Array<{ wc: MockWebContents }> })
    .__chromeViews;

const openExternalCalls = () =>
  (globalThis as unknown as { __openExternalCalls: string[] })
    .__openExternalCalls;

beforeEach(() => {
  views().length = 0;
  openExternalCalls().length = 0;
});

describe('browser:find / browser:stop-find', () => {
  it('findInPage is called with the text and options, returning the request id', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const id = call(handlers, 'browser:find', 'tab-1', 'hello', {
      forward: true,
      findNext: false,
      matchCase: false,
    });
    expect(id).toBe(42);
    expect(views()[0].wc.__findCalls).toEqual([
      {
        text: 'hello',
        options: { forward: true, findNext: false, matchCase: false },
      },
    ]);
  });

  it('an empty query clears the search instead of matching everything', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const id = call(handlers, 'browser:find', 'tab-1', '', undefined);
    expect(id).toBe(-1);
    expect(views()[0].wc.__findCalls).toEqual([]);
    expect(views()[0].wc.__stopCalls).toEqual(['clearSelection']);
  });

  it('find on an unknown tab returns -1 and calls nothing', async () => {
    const { handlers } = await setup();
    const id = call(handlers, 'browser:find', 'no-such-tab', 'hello', undefined);
    expect(id).toBe(-1);
  });

  it('stop-find forwards the action, defaulting to clearSelection', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    call(handlers, 'browser:stop-find', 'tab-1', 'keepSelection');
    call(handlers, 'browser:stop-find', 'tab-1', undefined);
    expect(views()[0].wc.__stopCalls).toEqual([
      'keepSelection',
      'clearSelection',
    ]);
  });

  it('found-in-page pushes match counts back to the renderer', async () => {
    const { handlers, sent } = await setup();
    createTab(handlers);
    const wc = views()[0].wc;
    wc.__handlers['found-in-page'](undefined, {
      activeMatchOrdinal: 3,
      matches: 12,
      selectionArea: { x: 0, y: 0, width: 0, height: 0 },
      finalUpdate: true,
    });
    expect(sent).toContainEqual({
      channel: 'browser:find-updated',
      args: ['tab-1', { activeMatchOrdinal: 3, matches: 12 }],
    });
  });
});

describe('browser:zoom', () => {
  it('sets the factor on the view and returns it', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    const factor = call(handlers, 'browser:zoom', 'tab-1', 1.2);
    expect(factor).toBe(1.2);
    expect(views()[0].wc.__zoomCalls).toEqual([1.2]);
  });

  it('clamps out-of-range and non-finite factors', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    expect(call(handlers, 'browser:zoom', 'tab-1', 99)).toBe(5);
    expect(call(handlers, 'browser:zoom', 'tab-1', 0.01)).toBe(0.25);
    expect(call(handlers, 'browser:zoom', 'tab-1', Number.NaN)).toBe(1);
    expect(views()[0].wc.__zoomCalls).toEqual([5, 0.25, 1]);
  });

  it('zoom on an unknown tab returns the clamped factor without throwing', async () => {
    const { handlers } = await setup();
    expect(call(handlers, 'browser:zoom', 'no-such-tab', 1.5)).toBe(1.5);
  });

  it('closing a tab forgets its zoom — a re-created tab starts at 100%', async () => {
    const { handlers } = await setup();
    createTab(handlers);
    call(handlers, 'browser:zoom', 'tab-1', 1.5);
    call(handlers, 'browser:close', 'tab-1');
    createTab(handlers);
    expect(views()).toHaveLength(2);
    expect(views()[1].wc.__zoomCalls).toEqual([]);
  });
});

describe('browser:open-external', () => {
  it('opens http and https URLs in the system browser', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:open-external', 'https://example.com/page');
    call(handlers, 'browser:open-external', 'http://127.0.0.1:8090');
    expect(openExternalCalls()).toEqual([
      'https://example.com/page',
      'http://127.0.0.1:8090',
    ]);
  });

  it('ignores non-http(s) URLs and garbage instead of handing them to the OS', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:open-external', 'javascript:alert(1)');
    call(handlers, 'browser:open-external', 'file:///etc/passwd');
    call(handlers, 'browser:open-external', 'not a url');
    call(handlers, 'browser:open-external', '');
    expect(openExternalCalls()).toEqual([]);
  });
});

describe('zoom helpers', () => {
  it('clampZoomFactor and stepZoomFactor behave', async () => {
    const { clampZoomFactor, stepZoomFactor } = await import(
      '../electron/ipc/browser'
    );
    expect(clampZoomFactor(99)).toBe(5);
    expect(clampZoomFactor(0.01)).toBe(0.25);
    expect(clampZoomFactor(Number.NaN)).toBe(1);
    expect(stepZoomFactor(1, 1)).toBe(1.2);
    expect(stepZoomFactor(1, -1)).toBe(0.83);
    expect(stepZoomFactor(5, 1)).toBe(5);
    expect(stepZoomFactor(0.25, -1)).toBe(0.25);
  });
});
