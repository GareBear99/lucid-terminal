import { BrowserView, BrowserWindow, IpcMain } from 'electron';

/**
 * In-panel browser: one real Chromium view (BrowserView) per browser
 * tab, driven from the renderer over IPC.
 *
 * Why BrowserView and not <webview>: the app runs Electron 28, where
 * BrowserView is the supported view API (WebContentsView needs Electron
 * 30+), and <webview> would need `webviewTag: true` in webPreferences —
 * it is not set, and webview is discouraged upstream. A BrowserView
 * lives in the main process, so the renderer never touches web content
 * directly; it only asks main to create/attach/navigate views.
 *
 * Sessions persist: every view uses the named partition
 * `persist:lucid-browser`, so cookies and logins survive restarts.
 *
 * Attachment: only the active tab's view is attached to the window.
 * Switching tabs (or switching to the AI tab, or closing the panel)
 * detaches the view — it is NOT destroyed, so the page keeps running
 * and its state survives the switch. Closing a browser tab destroys
 * its view.
 *
 * Bounds: the renderer owns the container element and reports its
 * window-relative rect (CSS px == DIP for setBounds). Main remembers
 * the last bounds so a re-attached view lands in the right place even
 * if the renderer has not reported yet.
 */

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTabState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const BROWSER_PARTITION = 'persist:lucid-browser';

export function setupBrowserHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  const views = new Map<string, BrowserView>();
  let activeTabId: string | null = null;
  let lastBounds: BrowserViewBounds | null = null;

  const sendUpdate = (tabId: string) => {
    const view = views.get(tabId);
    const win = getMainWindow();
    if (!view || !win || win.isDestroyed()) return;
    const wc = view.webContents;
    const state: BrowserTabState = {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    };
    win.webContents.send('browser:updated', tabId, state);
  };

  const attach = (tabId: string) => {
    const win = getMainWindow();
    const view = views.get(tabId);
    if (!win || win.isDestroyed() || !view) return;
    if (win.getBrowserView() !== view) win.setBrowserView(view);
    if (lastBounds) view.setBounds(lastBounds);
    activeTabId = tabId;
  };

  const detach = () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.getBrowserView()) {
      win.setBrowserView(null);
    }
    activeTabId = null;
  };

  const createView = (tabId: string, url: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || views.has(tabId)) return;
    const view = new BrowserView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    views.set(tabId, view);
    const wc = view.webContents;
    const update = () => sendUpdate(tabId);
    wc.on('did-navigate', update);
    wc.on('did-navigate-in-page', update);
    wc.on('did-finish-load', update);
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('page-title-updated', update);
    // A page asking for a new window (target=_blank, window.open)
    // gets a new Lucid browser tab instead of an external window.
    wc.setWindowOpenHandler(({ url: nextUrl }) => {
      win.webContents.send('browser:open-url', nextUrl);
      return { action: 'deny' };
    });
    void wc.loadURL(url);
  };

  ipcMain.handle('browser:create', (_event, tabId: string, url: string) => {
    createView(tabId, url);
  });

  ipcMain.handle('browser:close', (_event, tabId: string) => {
    const view = views.get(tabId);
    if (!view) return;
    // A BrowserView has no destroy of its own — its webContents is
    // destroyed, and it must be detached first.
    if (activeTabId === tabId) detach();
    views.delete(tabId);
    view.webContents.destroy();
  });

  ipcMain.handle(
    'browser:activate',
    (_event, tabId: string, bounds: BrowserViewBounds) => {
      lastBounds = bounds;
      attach(tabId);
    },
  );

  ipcMain.handle('browser:hide', () => {
    detach();
  });

  ipcMain.handle('browser:setBounds', (_event, bounds: BrowserViewBounds) => {
    lastBounds = bounds;
    const view = activeTabId ? views.get(activeTabId) : undefined;
    if (view) view.setBounds(bounds);
  });

  ipcMain.handle('browser:navigate', (_event, tabId: string, url: string) => {
    const view = views.get(tabId);
    if (view) void view.webContents.loadURL(url);
  });

  ipcMain.handle('browser:goBack', (_event, tabId: string) => {
    const wc = views.get(tabId)?.webContents;
    if (wc?.canGoBack()) wc.goBack();
  });

  ipcMain.handle('browser:goForward', (_event, tabId: string) => {
    const wc = views.get(tabId)?.webContents;
    if (wc?.canGoForward()) wc.goForward();
  });

  ipcMain.handle('browser:reload', (_event, tabId: string) => {
    views.get(tabId)?.webContents.reload();
  });
}
