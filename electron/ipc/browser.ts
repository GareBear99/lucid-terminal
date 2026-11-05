import {
  app,
  BrowserWindow,
  clipboard,
  IpcMain,
  Menu,
  session,
  shell,
} from 'electron';
import path from 'path';
import {
  attachBrowserView,
  createBrowserView,
  detachBrowserView,
  setBrowserViewBounds,
} from '../services/browserViewAdapter';
import type { BrowserViewBounds } from '../services/browserViewAdapter';
import {
  isPermissionAllowed,
  loadPermissionAllowlist,
  originOfUrl,
} from '../services/browserPermissions';
import type { BrowserPermissionAllowlist } from '../services/browserPermissions';
import { browserContextMenuItems } from '../services/browserContextMenu';
import type { BrowserAuthRequest } from '../../src/types';

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
 *
 * View creation/attachment goes through the adapter
 * (`electron/services/browserViewAdapter.ts`) — the one place that
 * knows Electron's view API — so the Electron 30 `WebContentsView`
 * migration is a one-file swap later.
 *
 * Session handlers (Area 0): the browser session denies permissions
 * by default (camera/mic/notifications only for origins on the
 * allowlist, which is empty until the per-site memory lands in
 * Area 9); HTTP-auth (`login`) asks Gary in the panel and never
 * silently retries; right-click shows a native context menu
 * (Back / Forward / Reload / Copy Link / Copy / Inspect).
 *
 * Chrome completion (Area 1): find-in-page (with match counts pushed
 * back as `browser:find-updated`), per-tab zoom (0.25–5, remembered
 * while the tab lives), and open-in-system-browser for the current
 * page (http/https only).
 */

export type { BrowserViewBounds };

export interface BrowserTabState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const BROWSER_PARTITION = 'persist:lucid-browser';

/** Credentials Gary typed into the panel's auth prompt, or null when
 * he cancelled (the page then shows its own auth failure — no retry). */
type AuthCredentials = { username: string; password: string } | null;

/** Zoom limits: Chromium's own find/zoom range, clamped so a stray
 * factor can never shrink a page to nothing or blow it up. */
export const BROWSER_ZOOM_MIN = 0.25;
export const BROWSER_ZOOM_MAX = 5;

export function clampZoomFactor(factor: number): number {
  if (!Number.isFinite(factor)) return 1;
  return Math.min(BROWSER_ZOOM_MAX, Math.max(BROWSER_ZOOM_MIN, factor));
}

/** One step on the zoom buttons: 20% per step, rounded to 2 decimals
 * so the label never shows a long float. */
export function stepZoomFactor(factor: number, direction: 1 | -1): number {
  const next = direction === 1 ? factor * 1.2 : factor / 1.2;
  return clampZoomFactor(Math.round(next * 100) / 100);
}

export function setupBrowserHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  const views = new Map<string, ReturnType<typeof createBrowserView>>();
  let activeTabId: string | null = null;
  let lastBounds: BrowserViewBounds | null = null;
  // Per-tab zoom, remembered while the tab lives (closing the tab
  // forgets it — a reopened tab starts at 100%).
  const zoomFactors = new Map<string, number>();

  // Per-site permission allowlist (deny by default; empty until the
  // per-site memory UI lands in Area 9). Loaded once at startup.
  let allowlist: BrowserPermissionAllowlist = {};
  try {
    allowlist = loadPermissionAllowlist(
      path.join(app.getPath('userData'), 'browser-permissions.json'),
    );
  } catch {
    allowlist = {};
  }

  // The session is shared by every browser view, so one permission
  // handler covers all tabs. Deny by default; allow only origins on
  // the allowlist.
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const origin =
        details.requestingUrl != null
          ? originOfUrl(details.requestingUrl)
          : null;
      callback(
        origin !== null && isPermissionAllowed(allowlist, origin, permission),
      );
    },
  );

  // Pending HTTP-auth requests: request id -> resolver + tab. The
  // renderer shows Gary a prompt and answers via `browser:auth-response`.
  const pendingAuth = new Map<
    string,
    { resolve: (creds: AuthCredentials) => void; tabId: string }
  >();
  let authCounter = 0;

  const cancelPendingAuthForTab = (tabId: string) => {
    for (const [id, pending] of pendingAuth) {
      if (pending.tabId === tabId) {
        pendingAuth.delete(id);
        pending.resolve(null);
      }
    }
  };

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
    // No remembered bounds yet (first attach before any report):
    // keep the view's current bounds instead of zeroing them.
    attachBrowserView(win, view, lastBounds ?? view.getBounds());
    activeTabId = tabId;
  };

  const detach = () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) detachBrowserView(win);
    activeTabId = null;
  };

  const createView = (tabId: string, url: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || views.has(tabId)) return;
    const view = createBrowserView({
      partition: BROWSER_PARTITION,
      // The phone page polls on a timer. A detached/hidden page
      // has its timers clamped to 1 wake-up/s, then 1/min under
      // intensive throttling — the stream stalls every time Gary
      // switches to the AI Chat tab. The view is not destroyed on
      // hide, so its page keeps running: let its timers run.
      backgroundThrottling: false,
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
    // Find-in-page: push match counts back so the panel's find bar
    // can show "3 / 12". Every update is forwarded; the last one is
    // the settled count.
    wc.on('found-in-page', (_event, result) => {
      const foundWin = getMainWindow();
      if (!foundWin || foundWin.isDestroyed()) return;
      foundWin.webContents.send('browser:find-updated', tabId, {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
      });
    });
    // A page asking for a new window (target=_blank, window.open)
    // gets a new Lucid browser tab instead of an external window.
    wc.setWindowOpenHandler(({ url: nextUrl }) => {
      win.webContents.send('browser:open-url', nextUrl);
      return { action: 'deny' };
    });
    // HTTP basic auth: ask Gary in the panel, never silently retry.
    // A second login for the same tab cancels the pending one (a page
    // has one auth realm at a time in practice).
    wc.on('login', (event, _webContents, _details, authInfo, callback) => {
      event.preventDefault();
      cancelPendingAuthForTab(tabId);
      authCounter += 1;
      const requestId = `browser-auth-${Date.now().toString(36)}-${authCounter}`;
      const request: BrowserAuthRequest = {
        id: requestId,
        tabId,
        url: wc.getURL(),
        host: authInfo.host,
        realm: authInfo.realm,
      };
      const promise = new Promise<AuthCredentials>((resolve) => {
        pendingAuth.set(requestId, { resolve, tabId });
      });
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('browser:auth-required', request);
      } else {
        pendingAuth.delete(requestId);
        callback();
        return;
      }
      void promise.then((creds) => {
        if (creds) callback(creds.username, creds.password);
        else callback();
      });
    });
    // Right-click: a native context menu (Back / Forward / Reload /
    // Copy Link / Copy / Inspect). Nothing here navigates or fills
    // without Gary choosing the item.
    wc.on('context-menu', (_event, params) => {
      const mainWin = getMainWindow();
      if (!mainWin || mainWin.isDestroyed()) return;
      const items = browserContextMenuItems({
        linkURL: params.linkURL,
        selectionText: params.selectionText,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      });
      const template: Electron.MenuItemConstructorOptions[] = [];
      const groups: Array<Array<(typeof items)[number]>> = [[], [], []];
      for (const item of items) {
        if (item.id === 'back' || item.id === 'forward' || item.id === 'reload') {
          groups[0].push(item);
        } else if (item.id === 'copy-link' || item.id === 'copy') {
          groups[1].push(item);
        } else {
          groups[2].push(item);
        }
      }
      const actions: Record<string, () => void> = {
        back: () => {
          if (wc.canGoBack()) wc.goBack();
        },
        forward: () => {
          if (wc.canGoForward()) wc.goForward();
        },
        reload: () => wc.reload(),
        'copy-link': () => clipboard.writeText(params.linkURL),
        copy: () => wc.copy(),
        inspect: () => wc.inspectElement(params.x, params.y),
      };
      for (const group of groups) {
        if (group.length === 0) continue;
        if (template.length > 0) template.push({ type: 'separator' });
        for (const item of group) {
          template.push({
            label: item.label,
            enabled: item.enabled,
            click: actions[item.id],
          });
        }
      }
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWin });
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
    cancelPendingAuthForTab(tabId);
    zoomFactors.delete(tabId);
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
    if (view) setBrowserViewBounds(view, bounds);
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

  // Find-in-page: returns Chromium's request id. An empty query
  // clears the search instead of matching everything.
  ipcMain.handle(
    'browser:find',
    (
      _event,
      tabId: string,
      text: string,
      options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
    ) => {
      const wc = views.get(tabId)?.webContents;
      if (!wc) return -1;
      if (!text) {
        wc.stopFindInPage('clearSelection');
        return -1;
      }
      return wc.findInPage(text, {
        forward: options?.forward ?? true,
        findNext: options?.findNext ?? false,
        matchCase: options?.matchCase ?? false,
      });
    },
  );

  ipcMain.handle(
    'browser:stop-find',
    (
      _event,
      tabId: string,
      action?: 'clearSelection' | 'keepSelection' | 'activateSelection',
    ) => {
      views.get(tabId)?.webContents.stopFindInPage(action ?? 'clearSelection');
    },
  );

  // Per-tab zoom. Returns the factor actually applied (clamped).
  ipcMain.handle('browser:zoom', (_event, tabId: string, factor: number) => {
    const wc = views.get(tabId)?.webContents;
    const clamped = clampZoomFactor(factor);
    zoomFactors.set(tabId, clamped);
    if (wc) wc.setZoomFactor(clamped);
    return clamped;
  });

  // Open the given URL in Gary's system browser. Only http/https:
  // anything else (javascript:, file:, custom schemes) is ignored
  // rather than handed to the OS.
  ipcMain.handle('browser:open-external', (_event, url: string) => {
    if (typeof url !== 'string') return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    void shell.openExternal(url);
  });

  // Gary's answer to an HTTP-auth prompt (from the panel). Resolves
  // the pending login; an unknown id is ignored.
  ipcMain.handle(
    'browser:auth-response',
    (_event, requestId: string, creds: AuthCredentials) => {
      const pending = pendingAuth.get(requestId);
      if (!pending) return;
      pendingAuth.delete(requestId);
      pending.resolve(creds);
    },
  );
}
