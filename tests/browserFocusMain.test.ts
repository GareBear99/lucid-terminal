/**
 * Browser Cmd+L forwarding + diagnose (follow-up to the address-bar
 * fix): the renderer's window keydown listener never sees keys typed
 * inside a BrowserView, so the main process intercepts Cmd+L/Ctrl+L
 * on `before-input-event` and forwards `browser:focus-address-bar`
 * to whichever window the view is attached to. `browser:diagnose`
 * reports the active view's attachment/bounds plus a capturePage
 * screenshot, to answer "the page loaded but the view shows blank".
 *
 * Driven through setupBrowserHandlers with a mocked Electron (same
 * pattern as tests/browserChromeMain.test.ts).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockWebContents {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  __handlers: Record<string, (...args: unknown[]) => void>;
  capturePage: () => Promise<{ toPNG: () => Buffer }>;
}

(globalThis as unknown as { __focusViews: unknown[] }).__focusViews ??= [];

vi.mock('electron', () => {
  const created: Array<{ opts: unknown; wc: MockWebContents }> = [];
  (globalThis as unknown as { __focusViews: unknown[] }).__focusViews =
    created;
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
        getURL: () => 'https://example.com',
        getTitle: () => 'Example Domain',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        capturePage: async () => ({
          toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        }),
        __handlers: handlers,
      } as unknown as MockWebContents;
      this.webContents = wc;
      created.push({ opts, wc });
    }
    setBounds(): void {
      // No-op in the mock.
    }
    getBounds() {
      return { x: 10, y: 20, width: 800, height: 600 };
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
    shell: { openExternal: () => undefined },
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
  let attachedView: unknown = null;
  const fakeWindow = {
    isDestroyed: () => false,
    isFocused: () => true,
    isVisible: () => true,
    getBounds: () => ({ x: 0, y: 0, width: 1400, height: 900 }),
    getBrowserView: () => attachedView,
    setBrowserView: (view: unknown) => {
      attachedView = view;
    },
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

const views = () =>
  (globalThis as unknown as { __focusViews: Array<{ wc: MockWebContents }> })
    .__focusViews;

beforeEach(() => {
  views().length = 0;
});

const fireBeforeInput = (
  wc: MockWebContents,
  input: { type: string; key: string; meta?: boolean; control?: boolean },
) => {
  let prevented = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
  };
  wc.__handlers['before-input-event'](event, input);
  return prevented;
};

describe('Cmd+L inside the page (before-input-event)', () => {
  it('Cmd+L key-down forwards focus-address-bar once the view is attached', async () => {
    const { handlers, sent } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
    const wc = views()[0].wc;
    const prevented = fireBeforeInput(wc, {
      type: 'keyDown',
      key: 'l',
      meta: true,
    });
    expect(prevented).toBe(true);
    expect(sent).toContainEqual({
      channel: 'browser:focus-address-bar',
      args: [],
    });
  });

  it('Ctrl+L key-down forwards too', async () => {
    const { handlers, sent } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
    fireBeforeInput(views()[0].wc, {
      type: 'keyDown',
      key: 'L',
      control: true,
    });
    expect(sent).toContainEqual({
      channel: 'browser:focus-address-bar',
      args: [],
    });
  });

  it('does not forward while the view is not attached to the window', async () => {
    const { handlers, sent } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    // No browser:activate — the view is created but attached nowhere.
    const prevented = fireBeforeInput(views()[0].wc, {
      type: 'keyDown',
      key: 'l',
      meta: true,
    });
    expect(prevented).toBe(false);
    expect(sent).toEqual([]);
  });

  it('key-up and other keys pass through untouched', async () => {
    const { handlers, sent } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
    const wc = views()[0].wc;
    expect(
      fireBeforeInput(wc, { type: 'keyUp', key: 'l', meta: true }),
    ).toBe(false);
    expect(
      fireBeforeInput(wc, { type: 'keyDown', key: 'f', meta: true }),
    ).toBe(false);
    expect(
      fireBeforeInput(wc, { type: 'keyDown', key: 'l' }),
    ).toBe(false);
    expect(sent).toEqual([]);
  });

  it('an unknown tab never throws', async () => {
    const { handlers } = await setup();
    // No tabs at all: firing on a (non-existent) view is impossible,
    // so the guard is the forward itself — activating an unknown tab
    // is a no-op and the handler map stays empty.
    expect(() =>
      call(handlers, 'browser:activate', 'no-such-tab', {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    ).not.toThrow();
    expect(views()).toEqual([]);
  });
});

describe('browser:diagnose', () => {
  it('reports attachment, bounds, window state and a screenshot path', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
    const result = (await call(
      handlers,
      'browser:diagnose',
    )) as {
      ok: boolean;
      diagnose: Record<string, unknown>;
      screenshotPath?: string;
      screenshotError?: string;
    };
    expect(result.ok).toBe(true);
    expect(result.diagnose).toMatchObject({
      tabId: 'tab-1',
      url: 'https://example.com',
      title: 'Example Domain',
      loading: false,
      attachedToMain: true,
      attachedToMini: false,
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      lastBounds: { x: 10, y: 20, width: 800, height: 600 },
      windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
      windowFocused: true,
      windowVisible: true,
      viewCount: 1,
    });
    expect(result.screenshotPath).toMatch(
      /^\/tmp\/lucid-test-user-data\/browser-screenshots\/browser-.*\.png$/,
    );
    expect(result.screenshotError).toBeUndefined();
  });

  it('with no active tab reports nulls and no screenshot', async () => {
    const { handlers } = await setup();
    const result = (await call(
      handlers,
      'browser:diagnose',
    )) as {
      ok: boolean;
      diagnose: Record<string, unknown>;
      screenshotPath?: string;
      screenshotError?: string;
    };
    expect(result.ok).toBe(true);
    expect(result.diagnose).toMatchObject({
      tabId: null,
      attachedToMain: false,
      attachedToMini: false,
      bounds: null,
      viewCount: 0,
    });
    expect(result.screenshotPath).toBeUndefined();
    expect(result.screenshotError).toBe('no-active-tab');
  });
});
