import { BrowserView, BrowserWindow } from 'electron';

/**
 * View-layer adapter: the one place that knows Electron's view API.
 *
 * Today the app runs Electron 28, where `BrowserView` is the supported
 * view API. Upstream, `BrowserView` is deprecated since Electron 30 and
 * replaced by `WebContentsView` — which has the same `webContents` +
 * `setBounds` shape; only attachment changes
 * (`contentView.addChildView` instead of `setBrowserView`). When the
 * app upgrades to Electron 30, ONLY this file changes:
 * `createBrowserView` returns a `WebContentsView`, `attachBrowserView`
 * calls `contentView.addChildView`, `detachBrowserView` calls
 * `contentView.removeChildView`. `electron/ipc/browser.ts` talks to
 * this adapter, never to `BrowserView` directly.
 *
 * Attachment: only one view is attached to a window at a time.
 * Attaching a view replaces the attached one; the replaced view stays
 * alive (detached), so its page keeps running and its state survives.
 */

/** Window-relative rect (CSS px == DIP for setBounds). */
export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A view handle. Today this is a `BrowserView`; on the Electron 30
 * migration it becomes a `WebContentsView` — same `webContents` +
 * `setBounds` shape, so callers do not change.
 */
export type BrowserViewHandle = BrowserView;

export function createBrowserView(options: {
  partition: string;
  /** Let a detached/hidden page's timers keep running (the phone page
   * polls on a timer; throttling would stall its stream). */
  backgroundThrottling: boolean;
}): BrowserViewHandle {
  const view = new BrowserView({
    webPreferences: {
      partition: options.partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: options.backgroundThrottling,
    },
  });
  // A page whose <html> background is painted via `light-dark()`
  // (color-scheme: light dark — example.com and the IANA family)
  // renders correctly in the compositor (capturePage shows white
  // text on #222) but its background does NOT paint on screen in
  // the BrowserView: the view shows its default white background
  // and the page's dark-mode (white) text goes invisible, so the
  // page looks blank white. Pages with an explicit background
  // (Hacker News, the phone page, a plain local page) paint fine
  // — their opaque background covers the view. Give the view the
  // app's dark background (#0d1117, the same colour the main
  // window and the mini window hardcode), so light-dark() text
  // stays readable even when the page's own background does not
  // paint. NOTE: this is the dark value, not scheme-aware — the
  // app is dark-only (its windows hardcode the same colour), and
  // reading nativeTheme here would break every electron mock in
  // tests. If the app ever runs light, this wants
  // nativeTheme.shouldUseDarkColors. The typeof guard is for the
  // same reason: the 12 hand-rolled BrowserView mocks in tests do
  // not define setBackgroundColor, and this adapter must not throw
  // there. A real Electron 28 BrowserView always has the method.
  // Verified live 2026-11-09: plain local page paints, a local
  // copy of example.com's exact CSS stays white on screen while
  // capturePage shows it dark, and the same page with explicit
  // black text reads fine on the white view.
  if (typeof view.setBackgroundColor === 'function') {
    view.setBackgroundColor('#0d1117');
  }
  return view;
}

/** Attach a view to a window and place it at `bounds`. */
export function attachBrowserView(
  win: BrowserWindow,
  view: BrowserViewHandle,
  bounds: BrowserViewBounds,
): void {
  if (win.getBrowserView() !== view) win.setBrowserView(view);
  view.setBounds(bounds);
}

/** Detach whatever view is attached to a window, if any. */
export function detachBrowserView(win: BrowserWindow): void {
  if (win.getBrowserView()) win.setBrowserView(null);
}

/** Move an attached (or detached) view to `bounds`. */
export function setBrowserViewBounds(
  view: BrowserViewHandle,
  bounds: BrowserViewBounds,
): void {
  view.setBounds(bounds);
}

/** The view currently attached to a window, if any. */
export function getAttachedBrowserView(
  win: BrowserWindow,
): BrowserViewHandle | null {
  return win.getBrowserView();
}
