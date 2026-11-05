import {
  app,
  BrowserWindow,
  clipboard,
  IpcMain,
  Menu,
  session,
  shell,
} from 'electron';
import * as fs from 'fs';
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
import { setupBrowserDownloads } from '../services/browserDownloads';
import {
  createBrowserCredentialsVault,
} from '../services/browserCredentials';
import type { BrowserCredentialsDeps } from '../services/browserCredentials';
import { createBrowserActionsRunner } from '../services/browserActions';
import { capTextForAi } from '../services/browserActions';
import {
  buildSearchResultsScript,
  formatSearchResults,
} from '../../src/lib/browserActions';
import type { SearchResultItem } from '../../src/lib/browserActions';
import {
  registerBrowserToolTarget,
} from '../services/browserToolBridge';
import type { BrowserToolTarget } from '../services/browserToolBridge';
import type {
  BrowserActionResult,
  BrowserAuthRequest,
  BrowserDownload,
  BrowserPageState,
  BrowserPageText,
  BrowserScreenshotResult,
} from '../../src/types';

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
 *
 * Downloads (Area 2): a `will-download` handler on the browser
 * session saves straight into a Lucid downloads folder (OS Downloads
 * by default, `browserDownloadsFolder` setting overrides it) with
 * progress pushed back as `browser:download-updated`; the shelf
 * offers pause / resume / cancel / show-in-folder.
 *
 * Credentials (Area 3): a `safeStorage` vault (one login per
 * origin, logins only) auto-fills a saved login on page load, and
 * captures a login candidate when Gary signs in and the page
 * navigates away — the renderer only ever sees origin + username,
 * and only saves when he confirms the offer. The password never
 * crosses IPC, is never logged, and never enters the AI chat.
 *
 * Page actions (Area 4): typed main-process actions — `readText`,
 * `fill`, `click`, `waitForSelector`, `screenshot`, `getState` —
 * parameterised, never raw JS from the renderer. The scripts live
 * in `src/lib/browserActions.ts` and are built and run in main
 * only. The generic `fill` refuses password fields (use the
 * saved-login fill); the AI tools (Area 5) and the flow runner
 * (Area 7) are built on these actions.
 *
 * AI browser tools (Area 5): the `browser_*` tools in
 * `electron/services/aiTools.ts` run through the bridge in
 * `electron/services/browserToolBridge.ts`, registered here — the
 * AI asks, main acts on the active tab through the Area 4 actions.
 * Web search runs in a temporary tab that is never attached to a
 * window and is destroyed when the results are read. Everything
 * is local: the model, the tools, the page. No remote server.
 *
 * Mini window (Area 6): popping a tab out moves its BrowserView
 * from the main window to a compact floating window (640x420,
 * frameless, always on top, bounds persisted — see
 * `electron/services/browserMiniWindow.ts`); popping back reverses
 * it. The view, its session and its cookies survive the move.
 * Popping back in never attaches the view to the main window
 * directly — the panel re-attaches the active tab when it hears
 * `browser:mini-closed`, so a different active tab is never
 * clobbered. The Phone tab pops out like any other tab; the
 * in-app stream stays in the panel (its frames go to the main
 * window), and the mini window's phone entries reuse the spike's
 * GPU gate exactly like the panel's.
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
  options?: {
    /** Folder downloads go to; defaults to the OS Downloads folder.
     * main passes the `browserDownloadsFolder` setting here. */
    getDownloadsFolder?: () => string | undefined;
    /** Vault dependencies (store / crypto). Production uses the
     * real safeStorage + electron-store; tests inject fakes. */
    credentials?: BrowserCredentialsDeps;
    /** Mini window (Area 6): create/get the floating window.
     * Production wires the real BrowserWindow (see
     * `electron/services/browserMiniWindow.ts`); tests inject a
     * fake. Absent means no mini window: pop-out reports
     * `mini-unavailable`. */
    mini?: {
      create: (onClosed: () => void) => BrowserWindow | null;
      get: () => BrowserWindow | null;
    };
  },
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

  // Page actions (Area 4): the automation foundation. The runner
  // is stateless; every handler resolves its tab first and reports
  // `no-such-tab` for a closed or unknown tab instead of throwing.
  const actions = createBrowserActionsRunner();
  const actionWebContents = (tabId: string) =>
    views.get(tabId)?.webContents ?? null;

  // Mini window (Area 6): at most one tab is popped out at a time.
  // `lastMiniBounds` is the container rect the mini renderer last
  // reported (the view is re-positioned there); before the first
  // report it is the default mini size minus the mini chrome
  // (~70px of nav bar + quick tabs), so the first paint lands under
  // the chrome instead of over it.
  let poppedOutTabId: string | null = null;
  let lastMiniBounds: BrowserViewBounds = {
    x: 0,
    y: 70,
    width: 640,
    height: 350,
  };

  /** Tell the panel a popped-out tab is back in the main window
   * (popped in, tab closed, or mini window closed). The event
   * carries the tab id; the panel clears its popped-out state only
   * for that tab. */
  const emitMiniClosed = (tabId: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('browser:mini-closed', tabId);
  };

  /** Pop a tab back into the main window. Never attaches the view
   * to the main window directly: the panel re-attaches the active
   * tab when it hears `browser:mini-closed`, so a different active
   * tab is never clobbered. Closing the mini window is optional
   * (a swap to another popped-out tab keeps it open). */
  const popIn = (
    tabId: string,
    closeWindow = true,
  ): BrowserActionResult => {
    if (poppedOutTabId !== tabId) {
      return { ok: false, error: 'not-popped-out' };
    }
    poppedOutTabId = null;
    const mini = options?.mini?.get() ?? null;
    if (mini && !mini.isDestroyed()) {
      detachBrowserView(mini);
      if (closeWindow) mini.close();
    }
    emitMiniClosed(tabId);
    return { ok: true };
  };

  /** The mini window closed (Gary closed it, or it was closed by a
   * pop-in): whatever tab was out comes back. Popping in already
   * cleared the state, so this is a no-op for a deliberate pop-in. */
  const onMiniClosed = () => {
    if (!poppedOutTabId) return;
    popIn(poppedOutTabId, false);
  };

  /** Move a tab's view to the mini window. A different tab already
   * out pops back in first (the window stays open; the new tab
   * takes its place). */
  const popOut = (tabId: string): BrowserActionResult => {
    const view = views.get(tabId);
    if (!view) return { ok: false, error: 'no-such-tab' };
    if (poppedOutTabId === tabId) return { ok: true };
    if (!options?.mini) return { ok: false, error: 'mini-unavailable' };
    if (poppedOutTabId) popIn(poppedOutTabId, false);
    const mini = options.mini.create(onMiniClosed);
    if (!mini || mini.isDestroyed()) {
      return { ok: false, error: 'mini-unavailable' };
    }
    if (activeTabId === tabId) detach();
    attachBrowserView(mini, view, lastMiniBounds);
    poppedOutTabId = tabId;
    sendUpdate(tabId);
    return { ok: true };
  };

  // Downloads (Area 2): the session is shared by every browser
  // view, so one will-download handler covers all tabs. Progress
  // goes to the renderer as `browser:download-updated` events.
  const downloads = setupBrowserDownloads(browserSession, {
    downloadsFolder: () =>
      options?.getDownloadsFolder?.() ?? app.getPath('downloads'),
    fallbackFolder: () => app.getPath('downloads'),
    send: (update: BrowserDownload) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.webContents.send('browser:download-updated', update);
    },
  });

  // Credentials (Area 3): built lazily on first use, so a test that
  // never touches a login never constructs the vault's store.
  let credentialsVault: ReturnType<
    typeof createBrowserCredentialsVault
  > | null = null;
  const getCredentials = () => {
    if (!credentialsVault) {
      credentialsVault = createBrowserCredentialsVault(
        options?.credentials,
      );
    }
    return credentialsVault;
  };

  // Read the departing page's login fields; when a password was
  // filled, offer Gary the save (origin + username only — the
  // password stays in main's memory until he confirms).
  const captureAndOffer = (wc: import('electron').WebContents) => {
    void getCredentials()
      .captureCandidate(wc)
      .then((offer) => {
        if (!offer) return;
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        win.webContents.send('browser:login-detected', offer);
      })
      .catch(() => undefined);
  };

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
    // A popped-out tab's state goes to the mini window too, so its
    // chrome (address bar, title) stays in step with the page.
    if (tabId === poppedOutTabId) {
      const mini = options?.mini?.get() ?? null;
      if (mini && !mini.isDestroyed()) {
        mini.webContents.send('browser:mini-state', tabId, state);
      }
    }
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
    // Credentials (Area 3): auto-fill a saved login when the page
    // loads, and capture a login candidate when Gary signs in and
    // the page navigates away (or changes route in-page, for SPA
    // logins). The capture reads the departing page while it is
    // still live; by `did-navigate` it would already be gone.
    wc.on('did-finish-load', () => {
      void getCredentials().fillLogin(wc).catch(() => undefined);
    });
    wc.on('will-navigate', () => captureAndOffer(wc));
    wc.on('did-navigate-in-page', () => captureAndOffer(wc));
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

  // Destroy a tab's view (detach first if it is active). Shared by
  // the close handler and the search temp tab (Area 5). Closing a
  // popped-out tab (Area 6) also closes the mini window and tells
  // the panel the tab is back (so it clears its popped-out state).
  const closeView = (tabId: string) => {
    const view = views.get(tabId);
    if (!view) return;
    const wasPoppedOut = poppedOutTabId === tabId;
    if (wasPoppedOut) poppedOutTabId = null;
    if (activeTabId === tabId) detach();
    cancelPendingAuthForTab(tabId);
    zoomFactors.delete(tabId);
    views.delete(tabId);
    if (wasPoppedOut) {
      const mini = options?.mini?.get() ?? null;
      if (mini && !mini.isDestroyed()) {
        detachBrowserView(mini);
        mini.close();
      }
      emitMiniClosed(tabId);
    }
    view.webContents.destroy();
  };

  ipcMain.handle('browser:close', (_event, tabId: string) => {
    closeView(tabId);
  });

  ipcMain.handle(
    'browser:activate',
    (_event, tabId: string, bounds: BrowserViewBounds) => {
      lastBounds = bounds;
      // A popped-out tab lives in the mini window: activating it in
      // the panel must not drag its view back to the main window.
      if (tabId === poppedOutTabId) return;
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

  // Downloads (Area 2): current list plus the shelf's controls.
  // Unknown ids are no-ops (false) — a stale shelf button after a
  // restart must not throw.
  ipcMain.handle('browser:list-downloads', () => downloads.listDownloads());

  ipcMain.handle('browser:download-cancel', (_event, id: string) =>
    downloads.cancelDownload(id),
  );

  ipcMain.handle('browser:download-pause', (_event, id: string) =>
    downloads.pauseDownload(id),
  );

  ipcMain.handle('browser:download-resume', (_event, id: string) =>
    downloads.resumeDownload(id),
  );

  ipcMain.handle('browser:show-download', (_event, id: string) =>
    downloads.showDownloadInFolder(id),
  );

  // Credentials (Area 3): the vault lives in main; the renderer
  // only ever sees origin + username. `browser:save-login`
  // confirms a candidate main already holds — the password never
  // crosses IPC. Unknown origins are no-ops (false).
  ipcMain.handle('browser:list-saved-logins', () =>
    getCredentials().listLogins(),
  );

  ipcMain.handle('browser:delete-saved-login', (_event, origin: string) =>
    getCredentials().deleteLogin(origin),
  );

  ipcMain.handle(
    'browser:save-login',
    (_event, origin: string, username: string) =>
      getCredentials().confirmCandidate(origin, username),
  );

  ipcMain.handle('browser:dismiss-login-offer', (_event, origin: string) => {
    getCredentials().discardCandidate(origin);
  });

  ipcMain.handle('browser:fill-saved-login', () => {
    const view = activeTabId ? views.get(activeTabId) : undefined;
    if (!view) return false;
    return getCredentials().fillLogin(view.webContents);
  });

  // Page actions (Area 4): typed, parameterised, main-side only.
  // The renderer sends a tab id + parameters (a selector, a value);
  // the scripts are built in main from `src/lib/browserActions.ts`.
  // Every result is `{ ok, ... }` — a closed tab reports
  // `no-such-tab`, never a throw.
  ipcMain.handle(
    'browser:action-read-text',
    async (_event, tabId: string): Promise<
      BrowserActionResult & { text?: BrowserPageText }
    > => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.readText(wc);
    },
  );

  ipcMain.handle(
    'browser:action-fill',
    async (
      _event,
      tabId: string,
      selector: string,
      value: string,
    ): Promise<BrowserActionResult> => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.fill(wc, selector, value);
    },
  );

  ipcMain.handle(
    'browser:action-click',
    async (_event, tabId: string, selector: string): Promise<BrowserActionResult> => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.click(wc, selector);
    },
  );

  ipcMain.handle(
    'browser:action-wait',
    async (
      _event,
      tabId: string,
      selector: string,
      timeoutMs?: number,
    ): Promise<BrowserActionResult> => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.waitForSelector(wc, selector, timeoutMs);
    },
  );

  ipcMain.handle(
    'browser:action-screenshot',
    async (_event, tabId: string): Promise<BrowserScreenshotResult> => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.screenshot(wc);
    },
  );

  ipcMain.handle(
    'browser:action-state',
    async (_event, tabId: string): Promise<
      BrowserActionResult & { state?: BrowserPageState }
    > => {
      const wc = actionWebContents(tabId);
      if (!wc) return { ok: false, error: 'no-such-tab' };
      return actions.getState(wc);
    },
  );

  // AI browser tools (Area 5): the bridge target. The AI asks,
  // main acts on the ACTIVE tab through the Area 4 actions, and
  // answers in plain text. No browser tab open → a clean message,
  // never a throw. Screenshots are saved under userData (the AI
  // gets the path; the chat is text-only, so the image itself is
  // never pasted into it).
  const activeWebContents = () =>
    activeTabId ? views.get(activeTabId)?.webContents ?? null : null;

  // Web search: a temporary tab loads DuckDuckGo's html endpoint
  // (no JS needed), the results are read off the DOM, and the tab
  // is destroyed. The tab is never attached to a window, so Gary
  // never sees it. A load that never finishes destroys the tab on
  // timeout instead of leaking it.
  let searchCounter = 0;
  const searchWeb = async (
    query: string,
    timeoutMs = 15000,
  ): Promise<string> => {
    const timeout = Math.min(
      60000,
      Math.max(1000, Math.floor(timeoutMs) || 15000),
    );
    searchCounter += 1;
    const tempId = `browser-search-${Date.now().toString(36)}-${searchCounter}`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    createView(tempId, searchUrl);
    const view = views.get(tempId);
    if (!view) return 'Search failed: could not open a search tab.';
    try {
      const loaded = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeout);
        view.webContents.once('did-finish-load', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!loaded) {
        return `Search timed out after ${Math.round(timeout / 1000)}s.`;
      }
      const results = (await view.webContents.executeJavaScript(
        buildSearchResultsScript(),
      )) as SearchResultItem[];
      if (!Array.isArray(results)) {
        return 'Search failed: could not read the results page.';
      }
      return formatSearchResults(results);
    } catch {
      return 'Search failed: the results page could not be read.';
    } finally {
      closeView(tempId);
    }
  };

  const saveScreenshot = (dataUrl: string): string | null => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    try {
      const dir = path.join(app.getPath('userData'), 'browser-screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(
        dir,
        `browser-${Date.now().toString(36)}-${searchCounter}.png`,
      );
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      return filePath;
    } catch {
      return null;
    }
  };

  const toolTarget: BrowserToolTarget = {
    navigate: async (url) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return `Could not open ${url}: not a valid URL.`;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `Could not open ${url}: only http(s) URLs can be opened.`;
      }
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      void wc.loadURL(url);
      return `Opened ${url} in the active tab.`;
    },

    readPage: async () => {
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      const result = await actions.readText(wc);
      if (!result.ok || !result.text) {
        return `Could not read the page: ${result.error ?? 'unknown error'}.`;
      }
      const text = capTextForAi(result.text.text);
      return `Page: ${result.text.title} (${result.text.url})\n\n${text}`;
    },

    click: async (selector) => {
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      const result = await actions.click(wc, selector);
      return result.ok
        ? `Clicked ${selector}.`
        : `Could not click ${selector}: ${result.error ?? 'unknown error'}.`;
    },

    fill: async (selector, value) => {
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      const result = await actions.fill(wc, selector, value);
      if (result.ok) return `Filled ${selector}.`;
      if (result.error === 'password-field') {
        return 'That field is a password field — fill it from the saved login instead, or let Gary type it.';
      }
      return `Could not fill ${selector}: ${result.error ?? 'unknown error'}.`;
    },

    screenshot: async () => {
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      const result = await actions.screenshot(wc);
      if (!result.ok || !result.dataUrl) {
        return `Could not take a screenshot: ${result.error ?? 'unknown error'}.`;
      }
      const filePath = saveScreenshot(result.dataUrl);
      if (!filePath) return 'Could not save the screenshot.';
      return `Screenshot saved to ${filePath}.`;
    },

    getState: async () => {
      const wc = activeWebContents();
      if (!wc) return 'No browser tab is open.';
      const result = await actions.getState(wc);
      if (!result.ok || !result.state) {
        return `Could not describe the page: ${result.error ?? 'unknown error'}.`;
      }
      const json = JSON.stringify(result.state, null, 2);
      return json.length > 8000 ? json.slice(0, 8000) : json;
    },

    search: async (query, timeoutMs) => searchWeb(query, timeoutMs),
  };
  registerBrowserToolTarget(toolTarget);

  // Mini window (Area 6): pop a tab's view out to the floating
  // window, or back in. The mini renderer reports its container
  // bounds so the view lands under the mini chrome, not over it.
  ipcMain.handle(
    'browser:pop-out',
    (_event, tabId: string): BrowserActionResult => popOut(tabId),
  );

  ipcMain.handle(
    'browser:pop-in',
    (_event, tabId: string): BrowserActionResult => popIn(tabId, true),
  );

  ipcMain.handle('browser:set-mini-bounds', (_event, bounds: BrowserViewBounds) => {
    lastMiniBounds = bounds;
    const view = poppedOutTabId ? views.get(poppedOutTabId) : undefined;
    if (view) setBrowserViewBounds(view, bounds);
  });

  // Close the mini window (its tab pops back in first, via the
  // close handler's pop-in).
  ipcMain.handle('browser:mini-close', () => {
    if (poppedOutTabId) popIn(poppedOutTabId, true);
  });

  // The mini window's internal Phone entry: the stream itself lives
  // in the panel (its frames go to the main window), so the tab
  // pops back in and the panel opens the stream there. The entry's
  // enabled/disabled state comes from the spike's GPU gate, exactly
  // like the panel's — the mini window never decides it alone.
  ipcMain.handle('browser:mini-open-internal', () => {
    if (poppedOutTabId) popIn(poppedOutTabId, true);
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('browser:open-internal-phone');
  });
}
