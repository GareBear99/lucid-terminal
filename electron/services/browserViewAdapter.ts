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
  return new BrowserView({
    webPreferences: {
      partition: options.partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: options.backgroundThrottling,
    },
  });
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
