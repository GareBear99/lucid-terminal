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
  getAttachedBrowserView,
  setBrowserViewBounds,
} from '../services/browserViewAdapter';
import type { BrowserViewBounds } from '../services/browserViewAdapter';
import {
  isPermissionAllowed,
  loadPermissionAllowlist,
  originOfUrl,
  savePermissionAllowlist,
  setPermissionAllowed,
} from '../services/browserPermissions';
import type {
  BrowserPermission,
  BrowserPermissionAllowlist,
} from '../services/browserPermissions';
import { browserContextMenuItems, buildCurlCommand } from '../services/browserContextMenu';
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
import { isFocusAddressBarKeyInput } from '../../src/lib/browserAddressBar';
import type { SearchResultItem } from '../../src/lib/browserActions';
import {
  registerBrowserToolTarget,
} from '../services/browserToolBridge';
import type { BrowserToolTarget } from '../services/browserToolBridge';
import { createBrowserFlowRunner } from '../services/browserFlows';
import type { FlowDefinition } from '../../src/lib/browserFlows';
import { createBrowserCdpManager } from '../services/browserCdp';
import {
  BROWSER_AGENT_HOLDER_ID,
  createBrowserAgentSession,
  type BrowserAgentSession,
} from '../services/browserAgentSession';
import { setMiniWindowFullscreen } from '../services/browserMiniWindow';
import {
  clampAgentMousePosition,
  type BrowserAgentStateSnapshot,
} from '../../src/lib/browserAgent';
import {
  formatVisitsForAi,
  loadVisitLog,
  recordVisit,
  saveVisitLog,
} from '../services/browserVisitLog';
import type { BrowserVisit } from '../services/browserVisitLog';
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
 * Session handlers (Area 0, memory in Area 9): the browser
 * session denies permissions by default (camera/mic/notifications
 * only for origins on the allowlist); a request for a
 * not-yet-allowed origin is held and asked about in the panel
 * (Allow once / Allow always / Deny), once per
 * origin+permission per session. HTTP-auth (`login`) asks Gary
 * in the panel and never silently retries; right-click shows a
 * native context menu (Back / Forward / Reload / Copy Link /
 * Copy Link as curl / Copy Page URL as curl / Copy / Inspect).
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
 *
 * Flows (Area 7): scripted multi-step flows (navigate, wait,
 * fill, click, verify) on one tab, run by
 * `electron/services/browserFlows.ts` on top of the Area 4
 * actions, with per-step verification from page state. A step
 * that needs approval — explicitly flagged, or matching the
 * money/irreversible heuristic (a click on a buy/checkout/pay/
 * submit control, a navigate to a checkout/payment page) —
 * PAUSES the runner until Gary approves it in the panel; a
 * rejection ends the flow, and stop ("take over") ends it and
 * leaves the page where it is for Gary to drive by hand. The AI
 * tool `browser_run_flow` can start a flow but never completes
 * a purchase unobserved.
 *
 * CDP Tier 2 (Area 8): built only after Tier 1 was proven
 * insufficient (tests/browserCdpProof.test.ts — `el.click()`
 * dispatches `isTrusted === false`, which pages can detect and
 * ignore; no Tier 1 action can observe network failures or
 * console errors). `electron/services/browserCdp.ts` manages one
 * debugger session per tab (attach lazily, detach on tab close),
 * with an explicit method allowlist (`Page`/`Runtime`/`Input`/
 * `Network` — never `Target`): trusted mouse/keyboard input and
 * per-tab diagnostics (failed requests, HTTP errors, console
 * errors, uncaught exceptions).
 *
 * Polish + stretch (Area 9): per-site permission memory (a
 * request for a not-yet-allowed origin is HELD and asked about
 * in the panel — Allow once / Allow always / Deny — once per
 * origin+permission per session; the allowlist persists to
 * userData); a main-side visit log (finished http(s) loads,
 * capped at 200) behind the AI tool `browser_history`; save page
 * as file into the downloads folder; the context menu copies a
 * link or the page URL as a `curl` command (copied, never
 * executed). Bookmarks live in the renderer
 * (`src/stores/browserBookmarks.ts`).
 *
 * Phase B (Area 10): the browser is Lucid's own thing, actually
 * working. Every `browser_*` tool call runs inside the agent
 * session (`electron/services/browserAgentSession.ts`): the active
 * tab pops out into the mini window so Gary sees the agent's
 * browsing, the browser tab is glass-splashed first (~3.2s, the
 * boot splash's rhythm), then the mini window goes FULLSCREEN
 * while the browser is in use and back to its floating PiP state
 * when idle. The browser has its OWN LIVE MOUSE — a real CDP
 * `mouseMoved` pointer (`browser_move_mouse`, and trusted clicks
 * travel there first), locked to the browser view bounds, drawn
 * in the mini window and the panel as the agent cursor. Finger
 * access is one agent at a time, QUEUED, if eligible — the
 * phone-finger pattern (starts enabled, Gary locks it with
 * `browserFingerLocked`). When LuciferAI is DISABLED, the mini
 * window is there for Gary to stop the agent or take the mouse
 * (`browser:agent-stop`, `browser:agent-take-control`).
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
    /** Agent-browser settings (Phase B): LuciferAI enabled +
     * browser finger lock, read live from the settings store.
     * Absent means the defaults (LuciferAI on, finger unlocked). */
    getAgentSettings?: () => {
      luciferAiEnabled: boolean;
      browserFingerLocked: boolean;
    };
    /** Persist the browser finger lock (Phase B). */
    setBrowserFingerLocked?: (locked: boolean) => void;
  },
): void {
  const views = new Map<string, ReturnType<typeof createBrowserView>>();
  let activeTabId: string | null = null;
  let lastBounds: BrowserViewBounds | null = null;
  // Per-tab zoom, remembered while the tab lives (closing the tab
  // forgets it — a reopened tab starts at 100%).
  const zoomFactors = new Map<string, number>();

  // Visit log (Area 9): the AI's copy of Gary's browsing, newest
  // first, persisted to userData. Recorded on finished loads.
  const visitLogPath = path.join(app.getPath('userData'), 'browser-visits.json');
  let visitLog: BrowserVisit[] = loadVisitLog(visitLogPath);

  // The session is shared by every browser view, so one permission
  // handler covers all tabs. Default is DENY — but a request for
  // a not-yet-allowed origin is HELD and asked about (Area 9):
  // the panel shows Allow once / Allow always / Deny, and the
  // page waits for Gary's answer instead of being silently
  // denied. One prompt per origin+permission per session: a
  // repeat request while one is pending joins the same prompt
  // and gets the same answer.
  const permissionFilePath = path.join(
    app.getPath('userData'),
    'browser-permissions.json',
  );
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  let allowlist: BrowserPermissionAllowlist = {};
  try {
    allowlist = loadPermissionAllowlist(permissionFilePath);
  } catch {
    allowlist = {};
  }
  /** origin+permission pairs allowed for this session only
   * ("Allow once" — never persisted). */
  const sessionAllowed = new Set<string>();
  const permissionKey = (origin: string, permission: string) =>
    `${origin}\n${permission}`;
  interface PendingPermission {
    origin: string;
    permission: string;
    callbacks: Array<(granted: boolean) => void>;
  }
  const pendingPermissions = new Map<string, PendingPermission>();
  browserSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const origin =
        details.requestingUrl != null
          ? originOfUrl(details.requestingUrl)
          : null;
      if (origin === null) {
        callback(false);
        return;
      }
      const key = permissionKey(origin, permission);
      if (
        isPermissionAllowed(allowlist, origin, permission) ||
        sessionAllowed.has(key)
      ) {
        callback(true);
        return;
      }
      const pending = pendingPermissions.get(key);
      if (pending) {
        pending.callbacks.push(callback);
        return;
      }
      pendingPermissions.set(key, {
        origin,
        permission,
        callbacks: [callback],
      });
      getMainWindow()?.webContents.send('browser:permission-requested', {
        origin,
        permission,
      });
    },
  );

  // Page actions (Area 4): the automation foundation. The runner
  // is stateless; every handler resolves its tab first and reports
  // `no-such-tab` for a closed or unknown tab instead of throwing.
  const actions = createBrowserActionsRunner();
  const actionWebContents = (tabId: string) =>
    views.get(tabId)?.webContents ?? null;

  // CDP Tier 2 (Area 8): the debugger session manager — trusted
  // input for pages that ignore synthetic clicks, and
  // network/console observation. Sessions attach lazily on first
  // Tier 2 use and detach when the tab closes.
  const cdp = createBrowserCdpManager();

  // Flow runner (Area 7): scripted multi-step flows on one tab.
  // Progress and approval requests go to the main window (the
  // panel shows them); a gated step pauses until Gary approves
  // it in the panel, or rejects / takes over.
  const flows = createBrowserFlowRunner({
    actions,
    navigate: async (tabId, url) => {
      const view = views.get(tabId);
      if (!view) return { ok: false, error: 'no-such-tab' };
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { ok: false, error: 'bad-url' };
        }
      } catch {
        return { ok: false, error: 'bad-url' };
      }
      await view.webContents.loadURL(url);
      return { ok: true };
    },
    getWebContents: (tabId) => views.get(tabId)?.webContents ?? null,
    onProgress: (event) => {
      getMainWindow()?.webContents.send('browser:flow-progress', event);
    },
    onApprovalNeeded: (request) => {
      getMainWindow()?.webContents.send(
        'browser:flow-approval-needed',
        request,
      );
    },
  });

  // Mini window (Area 6): at most one tab is popped out at a time.
  // `lastMiniBounds` is the container rect the mini renderer last
  // reported (the view is re-positioned there); before the first
  // report it is the default mini size minus the mini chrome
  // (~70px of nav bar + quick tabs), so the first paint lands under
  // the chrome instead of over it.
  let poppedOutTabId: string | null = null;
  /** Agent browser session (Phase B) — assigned below, after the
   * pop-out helpers it notifies. Null until then; popIn/popOut
   * guard with `?.` so early calls are safe. */
  let agentSession: BrowserAgentSession | null = null;
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
    agentSession?.setPoppedOutTabId(null);
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
    agentSession?.setPoppedOutTabId(tabId);
    sendUpdate(tabId);
    return { ok: true };
  };

  // Agent browser session (Phase B): the finger queue, the
  // in-use/idle lifecycle (mini fullscreen while in use, PiP when
  // idle), the glass splash, and the live agent mouse. Every
  // `browser_*` tool call is wrapped in begin/endTool below, so
  // the mini window appears whenever an agent browses — the
  // browser is Lucid's own thing, actually working, not theory.
  const agentFlowIds = new Set<string>();
  const emitAgentState = (state: BrowserAgentStateSnapshot) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('browser:agent-state', state);
    }
    const mini = options?.mini?.get() ?? null;
    if (mini && !mini.isDestroyed()) {
      mini.webContents.send('browser:agent-state', state);
    }
  };
  agentSession = createBrowserAgentSession({
    // The ACTIVE tab pops out. No tab open means no pop-out —
    // the tool itself reports 'No browser tab is open.', the
    // long-standing contract (the agent tells Gary to open the
    // browser; main never silently opens a tab for him).
    popOutActiveTab: () => {
      if (!activeTabId) return null;
      const result = popOut(activeTabId);
      return result.ok ? activeTabId : null;
    },
    setMiniFullscreen: (inUse) => {
      setMiniWindowFullscreen(inUse);
    },
    emitState: emitAgentState,
    getViewBounds: () => {
      const view = activeTabId ? views.get(activeTabId) : undefined;
      if (!view) return null;
      const b = view.getBounds();
      return { width: b.width, height: b.height };
    },
    onAgentStopped: () => {
      for (const flowId of agentFlowIds) flows.stopFlow(flowId);
      agentFlowIds.clear();
    },
    getLuciferAiEnabled: () =>
      options?.getAgentSettings?.().luciferAiEnabled ?? true,
    isFingerLocked: () =>
      options?.getAgentSettings?.().browserFingerLocked ?? false,
    setFingerLockedSetting: (locked) => {
      options?.setBrowserFingerLocked?.(locked);
    },
  });

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

  // Cmd+L / Ctrl+L typed inside a page: the renderer's window
  // keydown listener never sees it (the BrowserView is a separate
  // webContents), so the view's `before-input-event` handler calls
  // this. The forward goes to whichever window the view is
  // attached to — the main window's panel, or the mini window for
  // a popped-out tab. Returns true when a window took the
  // shortcut; a detached view has no focused window to forward
  // to, so it returns false and the keystroke is left alone.
  const forwardFocusAddressBar = (tabId: string): boolean => {
    const view = views.get(tabId);
    if (!view) return false;
    const win = getMainWindow();
    if (win && !win.isDestroyed() && getAttachedBrowserView(win) === view) {
      win.webContents.send('browser:focus-address-bar');
      return true;
    }
    const mini = options?.mini?.get() ?? null;
    if (mini && !mini.isDestroyed() && getAttachedBrowserView(mini) === view) {
      mini.webContents.send('browser:focus-address-bar');
      return true;
    }
    return false;
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
    // Visit log (Area 9): a finished load is a visit for the AI's
    // "what did I look at yesterday?" — http(s) only, consecutive
    // duplicates dropped, capped at 200, persisted to userData.
    wc.on('did-finish-load', () => {
      const url = wc.getURL();
      const title = wc.getTitle();
      visitLog = recordVisit(visitLog, {
        url,
        title,
        visitedAt: Date.now(),
      });
      try {
        saveVisitLog(visitLogPath, visitLog);
      } catch {
        // A failed write must not break the page load.
      }
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
    // Cmd+L / Ctrl+L inside the page: the renderer's window
    // keydown listener never sees keys typed into the BrowserView,
    // so main intercepts the shortcut here and asks whichever
    // window owns the view to focus its address bar. Every other
    // key passes through untouched; the shortcut itself is only
    // swallowed when a window actually took it (below).
    wc.on('before-input-event', (event, input) => {
      if (!isFocusAddressBarKeyInput(input)) return;
      // Only swallow the keystroke when a window actually took
      // the shortcut; otherwise the page keeps it.
      if (forwardFocusAddressBar(tabId)) event.preventDefault();
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
        pageURL: params.pageURL,
        selectionText: params.selectionText,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      });
      const template: Electron.MenuItemConstructorOptions[] = [];
      const groups: Array<Array<(typeof items)[number]>> = [[], [], []];
      for (const item of items) {
        if (item.id === 'back' || item.id === 'forward' || item.id === 'reload') {
          groups[0].push(item);
        } else if (
          item.id === 'copy-link' ||
          item.id === 'copy-link-curl' ||
          item.id === 'copy-page-curl' ||
          item.id === 'copy'
        ) {
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
        // Terminal commands, copied — never executed.
        'copy-link-curl': () =>
          clipboard.writeText(buildCurlCommand(params.linkURL)),
        'copy-page-curl': () =>
          clipboard.writeText(buildCurlCommand(params.pageURL)),
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
    if (wasPoppedOut) {
      poppedOutTabId = null;
      agentSession?.setPoppedOutTabId(null);
    }
    if (activeTabId === tabId) detach();
    cancelPendingAuthForTab(tabId);
    zoomFactors.delete(tabId);
    // CDP Tier 2 (Area 8): the debugger session dies with the tab.
    void cdp.detach(tabId);
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

    // Trusted click (Area 8, CDP Tier 2): a real mouse event at
    // the element's centre, for pages that ignore Tier 1's
    // synthetic click. The debugger session attaches lazily.
    trustedClick: async (selector) => {
      if (!activeTabId) return 'No browser tab is open.';
      const view = views.get(activeTabId);
      if (!view) return 'No browser tab is open.';
      const attached = await cdp.attach(activeTabId, view.webContents);
      if (!attached.ok) {
        return `Could not click ${selector}: the debugger could not attach (${attached.error ?? 'unknown error'}).`;
      }
      // The live agent mouse travels to the element first, so Gary
      // sees the cursor move before the click lands.
      const moved = await cdp.moveMouseToElement(activeTabId, selector);
      if (moved.ok && moved.x !== undefined && moved.y !== undefined) {
        agentSession?.moveMouse(moved.x, moved.y);
      }
      const result = await cdp.trustedClickAtElement(activeTabId, selector);
      return result.ok
        ? `Clicked ${selector} (trusted input).`
        : `Could not click ${selector}: ${result.error ?? 'unknown error'}.`;
    },

    // Live agent mouse (Phase B): a real CDP mouseMoved event,
    // clamped to the browser view bounds, with the agent cursor
    // drawn at the same point in the mini window / panel. The
    // wrapper already began the tool (holder + in-use), so the
    // session accepts the move and pushes the position out.
    moveMouse: async (x, y) => {
      if (!activeTabId) return 'No browser tab is open.';
      const view = views.get(activeTabId);
      if (!view) return 'No browser tab is open.';
      const clamped =
        agentSession?.moveMouse(x, y) ??
        clampAgentMousePosition(x, y, view.getBounds());
      const attached = await cdp.attach(activeTabId, view.webContents);
      if (!attached.ok) {
        return `Could not move the mouse: the debugger could not attach (${attached.error ?? 'unknown error'}).`;
      }
      const moved = await cdp.moveMouse(activeTabId, clamped.x, clamped.y);
      if (!moved.ok) {
        return `Could not move the mouse: ${moved.error ?? 'unknown error'}.`;
      }
      return `Moved the browser mouse to (${Math.round(clamped.x)}, ${Math.round(clamped.y)}).`;
    },

    // Visit history (Area 9): what Gary looked at, for the AI.
    getHistory: async (days) => {
      const n =
        typeof days === 'number' && Number.isFinite(days)
          ? Math.min(30, Math.max(1, Math.floor(days)))
          : 7;
      return formatVisitsForAi(visitLog, n);
    },

    // Start a scripted flow (Area 7) on the active tab. The flow
    // runs in the background; the AI gets a started summary, not a
    // completion — gated steps pause for Gary in the panel, so a
    // purchase is never completed unobserved.
    runFlow: async (definition) => {
      if (!activeTabId) return 'No browser tab is open.';
      const started = flows.startFlow(definition, activeTabId);
      if (!started.ok) {
        const detail = started.errors?.length
          ? ` ${started.errors.join(' ')}`
          : '';
        return `Could not start the flow: ${started.error}.${detail}`;
      }
      agentFlowIds.add(started.flowId);
      return `Flow started: ${definition.name} (${started.flowId}) — ${definition.steps.length} step(s). Steps that need approval (money, irreversible, or flagged) will pause for Gary in the browser panel; progress shows there.`;
    },
  };
  // Phase B: every tool call runs inside the agent session —
  // the mini window appears, the glass splash shows, the mini
  // goes fullscreen while in use, and the finger queue gates
  // access. A refused call (Gary took control, finger locked,
  // another agent holds it) returns a plain-text refusal, never
  // a throw — the AI can tell Gary what is blocking it.
  const withAgentSession =
    <A extends unknown[]>(fn: (...args: A) => Promise<string>) =>
    async (...args: A): Promise<string> => {
      const begun = agentSession?.beginTool(BROWSER_AGENT_HOLDER_ID);
      if (begun && !begun.ok) {
        return begun.error ?? 'The browser is not available right now.';
      }
      try {
        return await fn(...args);
      } finally {
        agentSession?.endTool();
      }
    };
  const wrappedToolTarget: BrowserToolTarget = {
    navigate: withAgentSession(toolTarget.navigate),
    readPage: withAgentSession(toolTarget.readPage),
    click: withAgentSession(toolTarget.click),
    fill: withAgentSession(toolTarget.fill),
    screenshot: withAgentSession(toolTarget.screenshot),
    getState: withAgentSession(toolTarget.getState),
    search: withAgentSession(toolTarget.search),
    trustedClick: withAgentSession(toolTarget.trustedClick),
    getHistory: withAgentSession(toolTarget.getHistory),
    runFlow: withAgentSession(toolTarget.runFlow),
    moveMouse: toolTarget.moveMouse
      ? withAgentSession(toolTarget.moveMouse)
      : undefined,
  };
  registerBrowserToolTarget(wrappedToolTarget);

  // Flows (Area 7): start / stop / approve / reject. Start
  // validates the definition in main and reports `no-such-tab`
  // for a closed or unknown tab. Approve/reject answer a pending
  // supervision gate; stop ends the flow and leaves the page
  // where it is (Gary takes over by hand from there).
  ipcMain.handle(
    'browser:flow-start',
    (_event, definition: FlowDefinition, tabId: string) => {
      if (!views.has(tabId)) return { ok: false, error: 'no-such-tab' };
      const started = flows.startFlow(definition, tabId);
      if (started.ok) agentFlowIds.add(started.flowId);
      return started;
    },
  );

  ipcMain.handle('browser:flow-stop', (_event, flowId: string) => {
    agentFlowIds.delete(flowId);
    return flows.stopFlow(flowId);
  });

  ipcMain.handle('browser:flow-approve', (_event, flowId: string) =>
    flows.approveStep(flowId),
  );

  ipcMain.handle('browser:flow-reject', (_event, flowId: string) =>
    flows.rejectStep(flowId),
  );

  // CDP Tier 2 (Area 8): trusted click + diagnostics. Both attach
  // the tab's debugger session lazily on first use (observation
  // starts then); the session detaches when the tab closes.
  ipcMain.handle(
    'browser:action-trusted-click',
    async (_event, tabId: string, selector: string) => {
      const view = views.get(tabId);
      if (!view) return { ok: false, error: 'no-such-tab' };
      const attached = await cdp.attach(tabId, view.webContents);
      if (!attached.ok) return { ok: false, error: attached.error };
      return cdp.trustedClickAtElement(tabId, selector);
    },
  );

  ipcMain.handle('browser:cdp-diagnostics', async (_event, tabId: string) => {
    const view = views.get(tabId);
    if (!view) return { ok: false, error: 'no-such-tab' };
    const attached = await cdp.attach(tabId, view.webContents);
    if (!attached.ok) return { ok: false, error: attached.error };
    return { ok: true, diagnostics: cdp.getDiagnostics(tabId) };
  });

  // Browser diagnostics (no tab id — the ACTIVE tab): where the
  // view is attached, its bounds, the window's bounds and focus,
  // and a capturePage screenshot saved to disk. Built to answer
  // "the page loaded but the view shows blank white": the
  // screenshot shows whether the page renders in the compositor
  // (content here, blank on screen = a presentation/attachment
  // problem; blank here too = the view's renderer produces no
  // frames). Invoked from the terminal (`browser diagnose`).
  ipcMain.handle('browser:diagnose', async () => {
    const win = getMainWindow();
    const tabId = activeTabId;
    const view = tabId ? views.get(tabId) : undefined;
    const wc = view?.webContents;
    const mini = options?.mini?.get() ?? null;
    const attachedToMain = !!(
      win &&
      !win.isDestroyed() &&
      view &&
      getAttachedBrowserView(win) === view
    );
    const attachedToMini = !!(
      mini &&
      !mini.isDestroyed() &&
      view &&
      getAttachedBrowserView(mini) === view
    );
    let screenshotPath: string | undefined;
    let screenshotError: string | undefined;
    if (wc) {
      const shot = await actions.screenshot(wc);
      if (shot.ok && shot.dataUrl) {
        screenshotPath = saveScreenshot(shot.dataUrl) ?? undefined;
        if (!screenshotPath) screenshotError = 'save-failed';
      } else {
        screenshotError = shot.error ?? 'capture-failed';
      }
    } else {
      screenshotError = 'no-active-tab';
    }
    return {
      ok: true,
      diagnose: {
        tabId: tabId ?? null,
        url: wc?.getURL() ?? null,
        title: wc?.getTitle() ?? null,
        loading: wc?.isLoading() ?? false,
        attachedToMain,
        attachedToMini,
        bounds: view ? view.getBounds() : null,
        lastBounds,
        windowBounds:
          win && !win.isDestroyed() ? win.getBounds() : null,
        windowFocused: win ? win.isFocused() : false,
        windowVisible: win ? win.isVisible() : false,
        viewCount: views.size,
      },
      screenshotPath,
      screenshotError,
    };
  });

  // Per-site permission memory (Area 9): answer a held request,
  // list the allowlist, revoke an entry. 'once' grants the held
  // request(s) and remembers the pair for this session only;
  // 'always' grants and persists it to the allowlist file; 'deny'
  // denies. The panel asks once per origin+permission per session.
  ipcMain.handle(
    'browser:permission-answer',
    (
      _event,
      origin: string,
      permission: BrowserPermission,
      decision: 'once' | 'always' | 'deny',
    ) => {
      const key = permissionKey(origin, permission);
      const pending = pendingPermissions.get(key);
      if (!pending) return { ok: false, error: 'no-such-request' };
      pendingPermissions.delete(key);
      if (decision === 'once') {
        sessionAllowed.add(key);
        pending.callbacks.forEach((cb) => cb(true));
      } else if (decision === 'always') {
        allowlist = setPermissionAllowed(
          allowlist,
          origin,
          permission,
          true,
        );
        try {
          savePermissionAllowlist(permissionFilePath, allowlist);
        } catch {
          // The grant still stands for this session.
        }
        pending.callbacks.forEach((cb) => cb(true));
      } else {
        pending.callbacks.forEach((cb) => cb(false));
      }
      return { ok: true };
    },
  );

  ipcMain.handle('browser:permission-list', () => ({
    ok: true,
    allowlist,
  }));

  ipcMain.handle(
    'browser:permission-revoke',
    (_event, origin: string, permission: BrowserPermission) => {
      allowlist = setPermissionAllowed(allowlist, origin, permission, false);
      sessionAllowed.delete(permissionKey(origin, permission));
      try {
        savePermissionAllowlist(permissionFilePath, allowlist);
      } catch {
        // The revoke still stands in memory.
      }
      return { ok: true, allowlist };
    },
  );

  // Save page as file (Area 9): the active page, complete with
  // its assets, into the downloads folder. http(s) pages only.
  ipcMain.handle('browser:save-page', async (_event, tabId: string) => {
    const view = views.get(tabId);
    if (!view) return { ok: false, error: 'no-such-tab' };
    const wc = view.webContents;
    const url = wc.getURL();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { ok: false, error: 'not-savable' };
    }
    const downloadsFolder =
      options?.getDownloadsFolder?.() ?? app.getPath('downloads');
    const base =
      (wc.getTitle() || 'page')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 80) || 'page';
    const filePath = path.join(
      downloadsFolder,
      `${base}-${Date.now().toString(36)}.html`,
    );
    try {
      fs.mkdirSync(downloadsFolder, { recursive: true });
      await wc.savePage(filePath, 'HTMLComplete');
      return { ok: true, path: filePath };
    } catch {
      return { ok: false, error: 'save-failed' };
    }
  });

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

  // Agent browser (Phase B): Gary's stop / take-control surface
  // in the mini window (there for him when LuciferAI is off, and
  // wired whenever), the finger lock, the live agent state, and
  // the finger queue for other agents.
  ipcMain.handle('browser:agent-stop', () => {
    agentSession?.stopAgent();
    return { ok: true };
  });

  ipcMain.handle('browser:agent-take-control', () => {
    agentSession?.takeControl();
    return { ok: true };
  });

  ipcMain.handle('browser:agent-give-back', () => {
    agentSession?.giveBackControl();
    return { ok: true };
  });

  ipcMain.handle('browser:agent-finger-lock', (_event, locked: boolean) => {
    agentSession?.setFingerLocked(locked === true);
    return { ok: true };
  });

  ipcMain.handle('browser:agent-get-state', () => ({
    ok: true,
    state: agentSession?.getState() ?? null,
  }));

  ipcMain.handle('browser:finger-request', (_event, holderId: string) => {
    if (typeof holderId !== 'string' || !holderId) {
      return { ok: false, error: 'bad-holder' };
    }
    const queue = agentSession?.getQueue();
    if (!queue) return { ok: false, error: 'no-session' };
    return { ok: true, ...queue.request(holderId) };
  });

  ipcMain.handle('browser:finger-release', (_event, holderId: string) => {
    if (typeof holderId !== 'string' || !holderId) {
      return { ok: false, error: 'bad-holder' };
    }
    const queue = agentSession?.getQueue();
    if (!queue) return { ok: false, error: 'no-session' };
    return { ok: true, nextHolder: queue.release(holderId) };
  });
}
