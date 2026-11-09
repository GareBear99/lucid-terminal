/**
 * Browser paint nudge (Area 1) main-process tests: after a load
 * finishes on an attached tab, the view's bounds are jiggled by 1px
 * and restored on the next tick so the compositor presents the new
 * frame. Live diagnose (Gary, 2026-11-09): example.com loaded
 * (title + URL correct, loading false, attachedToMain true, sane
 * bounds) and capturePage HAS the rendered page, but the on-screen
 * view stays blank white — and detach + re-attach with the SAME
 * bounds does not fix it, so an identical-bounds re-set is a no-op
 * to the compositor. Only a changed bounds forces a present.
 *
 * Run with: npx vitest run tests/browserPaintNudge.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockWebContents {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  __handlers: Record<string, (...args: unknown[]) => void>;
}

interface MockView {
  wc: MockWebContents;
  __boundsCalls: Array<{ x: number; y: number; width: number; height: number }>;
  __bounds: { x: number; y: number; width: number; height: number };
}

// The mock factory below only runs when 'electron' is first imported
// (inside setup()), but beforeEach clears these first — so they must
// exist from module load.
(globalThis as unknown as { __paintViews: unknown[] }).__paintViews ??= [];

vi.mock('electron', () => {
  const created: MockView[] = [];
  (globalThis as unknown as { __paintViews: unknown[] }).__paintViews =
    created;
  class BrowserView {
    webContents: MockWebContents;
    __boundsCalls: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    __bounds = { x: 0, y: 0, width: 100, height: 100 };
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => undefined,
        getURL: () => 'https://example.com/',
        getTitle: () => 'Example Domain',
        isLoading: () => false,
        isDestroyed: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        __handlers: handlers,
      } as unknown as MockWebContents;
      this.webContents = wc;
      // The recorded view exposes `wc` (like the other browser
      // main tests) plus live getters for the bounds state, so the
      // test reads what the view actually did.
      const self = this;
      created.push({
        get wc() {
          return self.webContents;
        },
        get __boundsCalls() {
          return self.__boundsCalls;
        },
        get __bounds() {
          return self.__bounds;
        },
      } as unknown as MockView);
    }
    setBounds(b: { x: number; y: number; width: number; height: number }) {
      this.__boundsCalls.push({ ...b });
      this.__bounds = { ...b };
    }
    getBounds() {
      return { ...this.__bounds };
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
  let attachedView: unknown = null;
  const fakeWindow = {
    isDestroyed: () => false,
    getBrowserView: () => attachedView,
    setBrowserView: (view: unknown) => {
      attachedView = view;
    },
    webContents: { send: () => undefined },
  } as unknown as import('electron').BrowserWindow;
  setupBrowserHandlers(mockIpcMain, () => fakeWindow);
  return { handlers };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const views = () =>
  (globalThis as unknown as { __paintViews: MockView[] }).__paintViews;

const fireLoad = (tabIndex = 0) => {
  const wc = views()[tabIndex].wc;
  const handler = wc.__handlers['did-finish-load'];
  expect(handler).toBeDefined();
  (handler as () => void)();
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  views().length = 0;
});

describe('browser paint nudge on did-finish-load', () => {
  it('jiggles bounds by 1px and restores them on an attached tab', async () => {
    const { handlers } = await setup();
    call(handlers, "browser:create", "tab-1", "https://example.com/");
    call(handlers, 'browser:activate', 'tab-1', {
      x: 901,
      y: 252,
      width: 499,
      height: 624,
    });
    const view = views()[0];
    // Attach itself sets the bounds once.
    expect(view.__boundsCalls).toEqual([
      { x: 901, y: 252, width: 499, height: 624 },
    ]);
    fireLoad(0);
    // The jiggle lands synchronously: height + 1.
    expect(view.__boundsCalls).toEqual([
      { x: 901, y: 252, width: 499, height: 624 },
      { x: 901, y: 252, width: 499, height: 625 },
    ]);
    // The restore lands on the next tick, back to the exact bounds.
    await tick();
    expect(view.__boundsCalls).toEqual([
      { x: 901, y: 252, width: 499, height: 624 },
      { x: 901, y: 252, width: 499, height: 625 },
      { x: 901, y: 252, width: 499, height: 624 },
    ]);
  });

  it('does not touch bounds when the tab is not attached', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:create', 'tab-2', 'https://example.com/');
    const view = views()[0];
    fireLoad(0);
    await tick();
    expect(view.__boundsCalls).toEqual([]);
  });
});
