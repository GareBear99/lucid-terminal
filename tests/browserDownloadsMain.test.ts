/**
 * Browser downloads (Area 2) main-process tests: the will-download
 * handler, progress/done events, and the shelf IPC controls, driven
 * through setupBrowserHandlers with a mocked Electron (same pattern
 * as tests/browserChromeMain.test.ts).
 *
 * The mock session captures the 'will-download' handler so the test
 * can fire it with a fake DownloadItem; the downloads folder is a
 * real temp dir under os.tmpdir() (created per test, removed after).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Handlers = Record<string, (...args: unknown[]) => unknown>;

(globalThis as unknown as { __dlViews: unknown[] }).__dlViews ??= [];
(globalThis as unknown as { __dlSessionHandlers: unknown }).__dlSessionHandlers ??= {};
(globalThis as unknown as { __dlShowInFolder: string[] }).__dlShowInFolder ??= [];

vi.mock('electron', () => {
  const created: Array<{ opts: unknown; wc: Record<string, unknown> }> = [];
  (globalThis as unknown as { __dlViews: unknown[] }).__dlViews = created;
  const sessionHandlers: Record<string, (...args: unknown[]) => void> = {};
  (globalThis as unknown as { __dlSessionHandlers: unknown }).__dlSessionHandlers =
    sessionHandlers;
  const showInFolderCalls: string[] = [];
  (globalThis as unknown as { __dlShowInFolder: string[] }).__dlShowInFolder =
    showInFolderCalls;
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
        getURL: () => '',
        getTitle: () => '',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => undefined,
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
      created.push({ opts, wc });
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
        on: (event: string, handler: (...args: unknown[]) => void) => {
          sessionHandlers[event] = handler;
        },
      }),
    },
    clipboard: { writeText: () => undefined },
    Menu: { buildFromTemplate: () => ({ popup: () => undefined }) },
    shell: {
      openExternal: () => undefined,
      showItemInFolder: (p: string) => {
        showInFolderCalls.push(p);
      },
    },
  };
});

const setup = async (downloadsFolder: string) => {
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
  setupBrowserHandlers(mockIpcMain, () => fakeWindow, {
    getDownloadsFolder: () => downloadsFolder,
  });
  return { handlers, sent };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const sessionHandlers = () =>
  (globalThis as unknown as { __dlSessionHandlers: Record<string, (...args: unknown[]) => void> })
    .__dlSessionHandlers;

const showInFolderCalls = () =>
  (globalThis as unknown as { __dlShowInFolder: string[] }).__dlShowInFolder;

interface MockItem {
  getFilename: () => string;
  getURL: () => string;
  getTotalBytes: () => number;
  getReceivedBytes: () => number;
  setSavePath: (p: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  __handlers: Record<string, (...args: unknown[]) => void>;
  __savePath: string | null;
  __calls: string[];
}

function mockItem(filename: string): MockItem {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  let received = 0;
  const item: MockItem = {
    getFilename: () => filename,
    getURL: () => 'https://example.com/a.zip',
    getTotalBytes: () => 1000,
    getReceivedBytes: () => received,
    setSavePath: (p) => {
      item.__savePath = p;
    },
    on: (event, handler) => {
      handlers[event] = handler;
    },
    pause: () => {
      item.__calls.push('pause');
    },
    resume: () => {
      item.__calls.push('resume');
    },
    cancel: () => {
      item.__calls.push('cancel');
    },
    __handlers: handlers,
    __savePath: null,
    __calls: [],
  };
  // Let the test advance the received counter.
  (item as unknown as { __setReceived: (n: number) => void }).__setReceived = (
    n: number,
  ) => {
    received = n;
  };
  return item;
}

let tmpDir = '';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-dl-test-'));
  showInFolderCalls().length = 0;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('will-download', () => {
  it('saves into the Lucid downloads folder with a sanitised name', async () => {
    const { handlers, sent } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('../../evil.zip');
    sessionHandlers()['will-download'](undefined, item);
    expect(item.__savePath).toBe(path.join(tmpDir, 'evil.zip'));
    const update = sent.find((s) => s.channel === 'browser:download-updated');
    expect(update).toBeDefined();
    const state = update!.args[0] as Record<string, unknown>;
    expect(state.filename).toBe('evil.zip');
    expect(state.state).toBe('progressing');
    expect(state.savePath).toBe(path.join(tmpDir, 'evil.zip'));
  });

  it('dedupes: a second download of the same name gets (1)', async () => {
    const { handlers } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const first = mockItem('a.zip');
    const second = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, first);
    // The first file now "exists" on disk (create it so the
    // collision is real, not faked).
    fs.writeFileSync(first.__savePath!, '');
    sessionHandlers()['will-download'](undefined, second);
    expect(first.__savePath).toBe(path.join(tmpDir, 'a.zip'));
    expect(second.__savePath).toBe(path.join(tmpDir, 'a (1).zip'));
  });

  it('pushes progress on updated and completed on done', async () => {
    const { handlers, sent } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, item);
    (item as unknown as { __setReceived: (n: number) => void }).__setReceived(500);
    item.__handlers['updated'](undefined, 'progressing');
    const progress = sent
      .filter((s) => s.channel === 'browser:download-updated')
      .map((s) => s.args[0] as Record<string, unknown>);
    expect(progress[progress.length - 1].receivedBytes).toBe(500);
    expect(progress[progress.length - 1].state).toBe('progressing');
    item.__handlers['done'](undefined, 'completed');
    const done = progress[progress.length - 1];
    const last = sent
      .filter((s) => s.channel === 'browser:download-updated')
      .map((s) => s.args[0] as Record<string, unknown>);
    expect(last[last.length - 1].state).toBe('completed');
    expect(done).toBeDefined();
  });

  it('maps a cancelled done state through', async () => {
    const { handlers, sent } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, item);
    item.__handlers['done'](undefined, 'cancelled');
    const last = sent
      .filter((s) => s.channel === 'browser:download-updated')
      .map((s) => s.args[0] as Record<string, unknown>);
    expect(last[last.length - 1].state).toBe('cancelled');
  });
});

describe('download IPC controls', () => {
  it('list-downloads returns the current downloads', async () => {
    const { handlers } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, item);
    const list = call(handlers, 'browser:list-downloads') as Array<
      Record<string, unknown>
    >;
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('a.zip');
  });

  it('cancel / pause / resume forward to the item; unknown ids return false', async () => {
    const { handlers } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, item);
    const id = (
      call(handlers, 'browser:list-downloads') as Array<
        Record<string, unknown>
      >
    )[0].id as string;
    expect(call(handlers, 'browser:download-cancel', 'no-such-id')).toBe(false);
    expect(call(handlers, 'browser:download-cancel', id)).toBe(true);
    expect(call(handlers, 'browser:download-pause', id)).toBe(true);
    expect(call(handlers, 'browser:download-resume', id)).toBe(true);
    expect(item.__calls).toEqual(['cancel', 'pause', 'resume']);
  });

  it('show-in-folder reveals a completed download and refuses a running one', async () => {
    const { handlers } = await setup(tmpDir);
    call(handlers, 'browser:create', 'tab-1', 'https://example.com');
    const item = mockItem('a.zip');
    sessionHandlers()['will-download'](undefined, item);
    const id = (
      call(handlers, 'browser:list-downloads') as Array<
        Record<string, unknown>
      >
    )[0].id as string;
    expect(call(handlers, 'browser:show-download', id)).toBe(false);
    expect(showInFolderCalls()).toEqual([]);
    // Complete the download and put the file on disk.
    fs.writeFileSync(item.__savePath!, 'x');
    item.__handlers['done'](undefined, 'completed');
    expect(call(handlers, 'browser:show-download', id)).toBe(true);
    expect(showInFolderCalls()).toEqual([item.__savePath]);
    expect(call(handlers, 'browser:show-download', 'no-such-id')).toBe(false);
  });
});
