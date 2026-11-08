/**
 * browser_navigate opens a tab when none is open (Gary, 2026-11-07,
 * browser up-to-par pass).
 *
 * Before this fix every browser_* tool answered "No browser tab is
 * open" until Gary opened one by hand, so the agent could never
 * start a browsing task on its own. navigate now asks the renderer
 * for a new tab (`browser:open-url` — the panel creates it, main
 * creates its view already pointed at the URL) and waits briefly
 * for the view to appear; when no tab appears it says so honestly
 * instead of claiming the page opened.
 *
 * Same mocked-Electron harness pattern as
 * tests/browserActionsMain.test.ts. Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

const sends: Array<{ channel: string; args: unknown[] }> = [];

vi.mock('electron', () => {
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
        getURL: () => 'https://example.com/',
        getTitle: () => 'Test Page',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
        executeJavaScript: () => Promise.resolve(undefined),
        capturePage: () =>
          Promise.resolve({ toPNG: () => Buffer.from('fake-png-bytes') }),
        findInPage: () => 0,
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
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sends.push({ channel, args });
      },
    },
  } as unknown as import('electron').BrowserWindow;
  setupBrowserHandlers(mockIpcMain, () => fakeWindow);
  return { handlers };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  sends.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('browser_navigate with no tab open', () => {
  it('asks the renderer for a new tab and reports it once the view appears', async () => {
    const { handlers } = await setup();
    const { executeTool } = await import('../electron/services/aiTools');
    const promise = executeTool('browser_navigate', {
      url: 'https://example.com/',
    });
    // The tool asks the renderer for a new tab first.
    await sleep(100);
    expect(
      sends.some(
        (s) =>
          s.channel === 'browser:open-url' &&
          s.args[0] === 'https://example.com/',
      ),
    ).toBe(true);
    // The renderer answers: create the view, then attach it (the
    // panel's activate) — the waiting navigate sees the tab.
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    await expect(promise).resolves.toBe(
      'Opened https://example.com/ in a new tab.',
    );
  });

  it('says so honestly when no tab appears', async () => {
    const { handlers } = await setup();
    void handlers;
    const { executeTool } = await import('../electron/services/aiTools');
    vi.useFakeTimers();
    const promise = executeTool('browser_navigate', {
      url: 'https://example.com/',
    });
    await vi.advanceTimersByTimeAsync(6000);
    await expect(promise).resolves.toContain('did not appear');
  });

  it('still navigates the active tab when one is open', async () => {
    const { handlers } = await setup();
    const { executeTool } = await import('../electron/services/aiTools');
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    await expect(
      executeTool('browser_navigate', { url: 'https://example.org/' }),
    ).resolves.toBe('Opened https://example.org/ in the active tab.');
    expect(
      sends.some((s) => s.channel === 'browser:open-url'),
    ).toBe(false);
  });
});
