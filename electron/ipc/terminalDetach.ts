/**
 * Tab detach + remount — main-process orchestration (Gary,
 * 2026-11-09: drag a terminal tab outside the main window and
 * it becomes its own terminal-only screen; drag a tab near
 * another window's tab hotbar and it remounts into the detected
 * one — only ONE bar detects at a time, no stacking; a light
 * hold before detection so a passing hover never fires;
 * failsafe everything).
 *
 * The drag session is owned by MAIN after drag-start: the source
 * renderer reports pointer moves (client coords); main adds the
 * source window's live bounds origin, runs the detach threshold
 * and the volley arbitration, and fires the detach itself. The
 * PTY never moves — only the owner-registry entry moves
 * (electron/ipc/terminal.ts), so a failed detach never loses
 * the tab and a failed remount never strands it in zero windows.
 *
 * Tuning values are PROPOSED, not decisions (Q1/Q4/Q5 — Gary's
 * review): 16px detach threshold, 300ms hold, 28px proximity.
 */
import { app, BrowserWindow, IpcMain, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { setTerminalOwner, getTerminalOwner } from './terminal';
import {
  createDetachedWindow,
  DETACH_TERMINAL_DEFAULT_BOUNDS,
  DETACH_FILES_DEFAULT_BOUNDS,
} from '../services/terminalDetachWindow';
import { pickDropTarget, insertionIndexFor, outsideDistance, ScreenBar } from '../lib/detachArbitration';
import type { BarRectReport, DetachedTab, DetachedFile, DetachResult } from '../../src/types/detach';

/**
 * DIAGNOSTIC logging for the detach drag (2026-11-13 — Gary tested
 * it himself and the tab does not detach). Every drag event lands
 * in the userData detach-drag.log AND on main's console, so a
 * reproduction leaves a complete trail: did drag-start arrive,
 * did drag-move arrive with out-of-bounds points, did fromId
 * resolve the source window, did fireDetach run or fail.
 * Kept concise (one line per event); remove the per-move lines
 * once the drag is proven live.
 */
function detachDiag(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'detach-drag.log'), line);
  } catch {
    // Logging must never break the drag.
  }
  console.log(`[detach-diag] ${message}`);
}

/** Q1 (proposed): the pointer must leave the source window by this far. */
export const DETACH_THRESHOLD_PX = 16;
/** Q4 (proposed): the pointer must stay in one candidate band this long. */
export const DETACH_HOLD_MS = 300;
/** Q5 (proposed): the proximity band around a bar that counts as "near". */
export const DETACH_PROXIMITY_PX = 28;
/** Drag fallback poll rate (~30 Hz, same as the cursor poll in
 *  electron/ipc/cursor.ts): while a drag session is live, main
 *  reads the OS cursor position directly — see startDragPoll. */
export const DRAG_POLL_MS = 33;
/** Stale-session watchdog (2026-11-13 — the leaked session):
 *  the renderer can go silent mid-drag (the source bar unmounts
 *  when the last tab leaves, releasing capture, so no
 *  drag-move/drag-end ever arrives). If the renderer has been
 *  silent this long, the poll ends the session: the tab stays
 *  safely wherever it is (a detached tab stays detached — the
 *  drop point is unknown, so no remount), and the poll stops
 *  instead of running forever on every cursor move. 10 s is far
 *  beyond any real drag-out (1–3 s); a user holding the button
 *  perfectly still for 10 s only loses the remount for that one
 *  drag, never the tab. */
export const DRAG_STALE_MS = 10_000;

interface MainWindowAccess {
  getMainWindow: () => BrowserWindow | null;
  createMainWindow: () => Promise<void>;
}

interface DragSession {
  tab: DetachedTab;
  /** Strip index in the source window at drag-start (pop-back target). */
  sourceIndex: number;
  sourceWindowId: number;
  /** The window that currently owns the tab (moves on detach/remount). */
  ownerWindowId: number;
  /** The window this drag created, if the tab has been detached. */
  detachedWindowId: number | null;
  candidateWindowId: number | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  detectedWindowId: number | null;
  detectedIndex: number;
  lastPoint: { x: number; y: number } | null;
  /** Last renderer event (drag-start / drag-move) — the
   *  stale-session watchdog's clock. The poll does NOT update
   *  it: the point is to detect renderer silence. */
  lastEventAt: number;
}

interface BarEntry {
  report: BarRectReport;
  focusedAt: number;
}

export function setupTerminalDetachHandlers(ipcMain: IpcMain, mainAccess: MainWindowAccess): void {
  const barRects = new Map<number, BarEntry>();
  const focusAt = new Map<number, number>();
  const pendingTerminalState = new Map<number, DetachedTab>();
  const pendingFilesState = new Map<number, DetachedFile>();
  const pendingMainTabs: { tab: DetachedTab; index: number }[] = [];
  const pendingMainFiles: DetachedFile[] = [];
  /** Tab metadata main remembers for a detached tab (pop-back
   *  target): the tab, its strip index in the main window, and
   *  the detached window that currently holds it. The window id
   *  is the truth for close-pop-back — the owner registry's
   *  WebContents is destroyed by the time a window's 'closed'
   *  handler runs, so it cannot be scanned then. */
  const detachedTabMeta = new Map<string, { tab: DetachedTab; index: number; windowId: number }>();
  /** Cross-window tab-number registry (Gary, 2026-11-13 - the +
   *  button lives in the detached window too): every tab id
   *  currently owned by ANY window. Main is the hub - a window
   *  reserves its new tab's number here (terminal:reserve-
   *  number), main broadcasts it to every other window, and a
   *  window joining late seeds its set from this one
   *  (terminal:get-reserved-numbers). A number is freed only
   *  when its PTY is destroyed for real (terminal:tab-closed).
   *  Detach / remount / pop-in move a tab between windows
   *  without changing its number, so they never touch this set.
   */
  const reservedTabNumbers = new Set<string>();
  /** Files living in detached windows, keyed by window id. */
  const detachedFiles = new Map<number, DetachedFile>();
  let dragSession: DragSession | null = null;
  /** Main-side drag fallback poll (see startDragPoll): one
   *  interval per drag session, cleared when the session ends. */
  let dragPollTimer: ReturnType<typeof setInterval> | null = null;
  let quitting = false;

  app.on('will-quit', () => {
    quitting = true;
  });
  app.on('browser-window-focus', (_event, window: BrowserWindow) => {
    focusAt.set(window.id, Date.now());
  });

  function windowById(id: number): BrowserWindow | null {
    const win = BrowserWindow.fromId(id);
    return win && !win.isDestroyed() ? win : null;
  }

  function sendToWindow(windowId: number, channel: string, ...args: unknown[]): boolean {
    const win = windowById(windowId);
    if (!win) return false;
    win.webContents.send(channel, ...args);
    return true;
  }

  /** Send a channel to every live window except `exceptSenderId`
   *  (a WebContents id, or null for all). The sender already
   *  applied the change locally, so it never needs its own echo.
   */
  function broadcast(channel: string, exceptSenderId: number | null, ...args: unknown[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      if (exceptSenderId !== null && win.webContents.id === exceptSenderId) continue;
      win.webContents.send(channel, ...args);
    }
  }

  /** Screen-space bars for arbitration (live bounds + reported viewport rects). */
  function screenBars(): ScreenBar[] {
    const bars: ScreenBar[] = [];
    // forEach, not for...of over the Map: tsconfig.node.json
    // sets no target, so iterating a Map errors there (the same
    // pre-existing class as llamafileManager / taskQueue).
    barRects.forEach((entry, windowId) => {
      const win = windowById(windowId);
      if (!win) return;
      const b = win.getBounds();
      bars.push({
        windowId,
        x: b.x + entry.report.rect.x,
        y: b.y + entry.report.rect.y,
        width: entry.report.rect.width,
        height: entry.report.rect.height,
        tabs: entry.report.tabs.map((t) => ({ id: t.id, x: b.x + t.x, width: t.width })),
        visible: win.isVisible() && !win.isMinimized(),
        focusedAt: focusAt.get(windowId) ?? entry.focusedAt,
      });
    });
    return bars;
  }

  /** Deliver a tab to the main window: push if it is alive, and
   *  ALWAYS record it as pending — the push can land before the
   *  main window's React listeners mount, and the pending fetch
   *  in App's init covers that. The receiver's add is idempotent,
   *  so a tab delivered twice lands once. */
  function deliverTabToMainWindow(tab: DetachedTab, index: number): void {
    pendingMainTabs.push({ tab, index });
    const main = mainAccess.getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('terminal:tab-added', tab, index);
    } else if (!quitting) {
      void mainAccess.createMainWindow();
    }
  }

  /** Same pattern for a file returning to the main window. */
  function deliverFileToMainWindow(file: DetachedFile): void {
    pendingMainFiles.push(file);
    const main = mainAccess.getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('files:file-added', file);
    } else if (!quitting) {
      void mainAccess.createMainWindow();
    }
  }

  function clearHold(session: DragSession): void {
    if (session.holdTimer) {
      clearTimeout(session.holdTimer);
      session.holdTimer = null;
    }
    session.candidateWindowId = null;
  }

  function clearDetect(session: DragSession): void {
    if (session.detectedWindowId !== null) {
      sendToWindow(session.detectedWindowId, 'terminal:drag-detect-clear');
      session.detectedWindowId = null;
    }
  }

  /** Roll a drag session back: the tab returns to its source
   *  window at its original index, any window the drag created
   *  closes once empty. A cancelled drag never loses the tab. */
  function cancelDragSession(session: DragSession): void {
    clearHold(session);
    clearDetect(session);
    // The session is over — the fallback poll stops with it.
    stopDragPoll();
    if (session.detachedWindowId !== null) {
      const tabId = session.tab.id;
      const detachedWin = windowById(session.detachedWindowId);
      const sourceWin = windowById(session.sourceWindowId);
      if (detachedWin && sourceWin) {
        setTerminalOwner(tabId, sourceWin.webContents);
        sourceWin.webContents.send('terminal:tab-added', session.tab, session.sourceIndex);
        detachedWin.webContents.send('terminal:tab-removed', tabId);
        // The tab is back in its source window: if that is the
        // main window it is no longer detached; if it is another
        // detached window, the meta follows it there.
        const mainWin = mainAccess.getMainWindow();
        if (mainWin && sourceWin.id === mainWin.id) {
          detachedTabMeta.delete(tabId);
        } else {
          detachedTabMeta.set(tabId, { tab: session.tab, index: session.sourceIndex, windowId: sourceWin.id });
        }
        // The window closes itself when its tab list empties;
        // close it here too once no tab is left in it.
        let stillOwned = false;
        detachedTabMeta.forEach((m) => {
          if (m.windowId === detachedWin.id) stillOwned = true;
        });
        if (!stillOwned) detachedWin.close();
      }
    }
    if (dragSession === session) dragSession = null;
  }

  /** Fire the detach: create the detached window at the drop
   *  point, re-target the PTY owner to it, and tell the source
   *  to drop the tab. The PTY itself never moves. */
  function fireDetach(session: DragSession, point: { x: number; y: number }): void {
    const sourceWin = windowById(session.sourceWindowId);
    if (!sourceWin) {
      detachDiag(`fireDetach ABORTED: source window ${session.sourceWindowId} unresolvable (fromId)`);
      return;
    }
    const tab = session.tab;
    let win: BrowserWindow;
    try {
      win = createDetachedWindow({
        boundsKey: `terminal:${tab.id}`,
        mini: 'terminal',
        query: `tab=${encodeURIComponent(tab.id)}`,
        dropPoint: point,
        defaultBounds: DETACH_TERMINAL_DEFAULT_BOUNDS,
        onClosed: () => handleDetachedWindowClosed(win, 'terminal'),
      });
    } catch (error) {
      // A failed detach never loses the tab — it stays in the
      // source window (§9). The drag just continues as a no-op.
      console.error('[detach] failed to create detached window:', error);
      detachDiag(`fireDetach FAILED to create window for tab ${tab.id}: ${String(error)}`);
      return;
    }
    detachDiag(`fireDetach OK: tab ${tab.id} -> detached window ${win.id} at (${point.x},${point.y})`);
    pendingTerminalState.set(win.id, tab);
    detachedTabMeta.set(tab.id, { tab, index: session.sourceIndex, windowId: win.id });
    setTerminalOwner(tab.id, win.webContents);
    session.ownerWindowId = win.id;
    session.detachedWindowId = win.id;
    sourceWin.webContents.send('terminal:tab-detached', tab.id);
  }

  /** A detached window closed (X, or main closed it once empty):
   *  every tab it still owned pops back into the main window.
   *  The owner registry is the truth — tabs already moved away
   *  by a remount are not re-delivered. */
  function handleDetachedWindowClosed(win: BrowserWindow, kind: 'terminal' | 'files'): void {
    barRects.delete(win.id);
    pendingTerminalState.delete(win.id);
    pendingFilesState.delete(win.id);
    if (dragSession && (dragSession.sourceWindowId === win.id || dragSession.ownerWindowId === win.id)) {
      dragSession = null;
      stopDragPoll();
    }
    if (quitting) return;
    if (kind === 'terminal') {
      // Tabs are re-homed from the meta map (window id, not the
      // owner registry — the window's WebContents is destroyed
      // by the time 'closed' runs, so the registry can't be
      // scanned). Only tabs this window still held come back;
      // tabs already moved away by a remount are not here.
      const owned: string[] = [];
      detachedTabMeta.forEach((meta, tabId) => {
        if (meta.windowId === win.id) owned.push(tabId);
      });
      for (const tabId of owned) {
        const meta = detachedTabMeta.get(tabId);
        if (!meta) continue;
        detachedTabMeta.delete(tabId);
        deliverTabToMainWindow(meta.tab, meta.index);
      }
    } else {
      const file = detachedFiles.get(win.id);
      if (file) {
        detachedFiles.delete(win.id);
        deliverFileToMainWindow(file);
      }
    }
  }

  function runArbitration(session: DragSession, point: { x: number; y: number }): void {
    const bars = screenBars();
    const target = pickDropTarget(point, bars, session.ownerWindowId, DETACH_PROXIMITY_PX);
    if (!target) {
      clearHold(session);
      clearDetect(session);
      return;
    }
    if (session.detectedWindowId === target.windowId) {
      // Hold already fired for this bar — track the landing spot.
      const bar = bars.find((b) => b.windowId === target.windowId);
      if (bar) {
        const index = insertionIndexFor(point.x, bar);
        if (index !== session.detectedIndex) {
          session.detectedIndex = index;
          sendToWindow(target.windowId, 'terminal:drag-detect', { tabId: session.tab.id, insertionIndex: index });
        }
      }
      return;
    }
    if (session.candidateWindowId !== target.windowId) {
      clearHold(session);
      session.candidateWindowId = target.windowId;
      session.holdTimer = setTimeout(() => {
        session.holdTimer = null;
        const bar = screenBars().find((b) => b.windowId === target.windowId);
        if (!bar || !dragSession || dragSession !== session) return;
        const index = insertionIndexFor(session.lastPoint?.x ?? point.x, bar);
        session.detectedWindowId = target.windowId;
        session.detectedIndex = index;
        session.candidateWindowId = null;
        sendToWindow(target.windowId, 'terminal:drag-detect', { tabId: session.tab.id, insertionIndex: index });
      }, DETACH_HOLD_MS);
    }
  }

  function executeRemount(session: DragSession, targetWindowId: number, index: number): void {
    const target = windowById(targetWindowId);
    const ownerWin = windowById(session.ownerWindowId);
    if (!target) {
      // The target died mid-drag: the tab stays with its owner (§9).
      return;
    }
    const tabId = session.tab.id;
    setTerminalOwner(tabId, target.webContents);
    if (ownerWin && ownerWin.id !== target.id) {
      ownerWin.webContents.send('terminal:tab-removed', tabId);
    }
    target.webContents.send('terminal:tab-added', session.tab, index);
    // The tab's new home: the main window drops it from the meta
    // map, a detached window keeps it with the new window id.
    const mainWin = mainAccess.getMainWindow();
    if (mainWin && target.id === mainWin.id) {
      detachedTabMeta.delete(tabId);
    } else {
      detachedTabMeta.set(tabId, { tab: session.tab, index, windowId: targetWindowId });
    }
    const wasDetachedWindow = session.detachedWindowId;
    session.ownerWindowId = targetWindowId;
    session.detachedWindowId = null;
    // If the drag's own detached window is now empty, close it.
    if (wasDetachedWindow !== null && ownerWin && ownerWin.id === wasDetachedWindow) {
      let stillOwned = false;
      detachedTabMeta.forEach((m) => {
        if (m.windowId === ownerWin.id) stillOwned = true;
      });
      if (!stillOwned) ownerWin.close();
    }
  }

  // --- Drag session (the source renderer reports; main decides) ---

  /**
   * The shared drag-point core: given a screen-space point, run
   * the detach threshold and the volley arbitration. Both the
   * renderer's drag-move IPC (client coords converted with the
   * source window's live bounds) and the main-side poll (already
   * screen coords) feed this one path, so a detach fires the
   * same way whichever delivery survives. Returns the outside
   * distance and whether this point fired the detach, or null
   * when the source window is unresolvable.
   */
  function handleDragPoint(
    session: DragSession,
    point: { x: number; y: number },
  ): { outside: number; fired: boolean } | null {
    const sourceWin = windowById(session.sourceWindowId);
    if (!sourceWin) return null;
    const bounds = sourceWin.getBounds();
    session.lastPoint = point;
    const outside = outsideDistance(point, bounds);
    const fired = session.detachedWindowId === null && outside > DETACH_THRESHOLD_PX;
    if (fired) fireDetach(session, point);
    runArbitration(session, point);
    return { outside, fired };
  }

  function stopDragPoll(): void {
    if (dragPollTimer) {
      clearInterval(dragPollTimer);
      dragPollTimer = null;
    }
  }

  /**
   * Main-side drag fallback (2026-11-13 — the drag does not
   * detach): the detach must not depend on the renderer's
   * pointermove events surviving past the viewport edge. The
   * renderer reports moves while it can (pointer capture on the
   * bar), but once the cursor leaves the window no more events
   * arrive if capture failed or the OS swallowed the edge
   * crossing — the header in electron/ipc/cursor.ts documents
   * exactly that gap. So while a drag session is live, main
   * polls the OS cursor position directly with
   * `screen.getCursorScreenPoint()` (no extra macOS permission —
   * it is not screen capture) and feeds each changed point into
   * the same handleDragPoint core the drag-move IPC uses. A
   * real drag-out then detaches even if the renderer went
   * silent at the edge; a drag that stays inside the window
   * never fires (the threshold is the same 16 px). The poll
   * runs ONLY during a drag session and stops on drag-end /
   * drag-cancel / session replacement, so an idle cursor costs
   * nothing. It logs only when the cursor is actually out of
   * the window (or it fires) — inside-window poll points are
   * redundant with the drag-move lines.
   */
  function startDragPoll(session: DragSession): void {
    stopDragPoll();
    let last: { x: number; y: number } | null = null;
    let loggedStart = false;
    dragPollTimer = setInterval(() => {
      if (!dragSession || dragSession !== session) {
        stopDragPoll();
        return;
      }
      // Stale-session watchdog: the renderer went silent (bar
      // unmounted at detach, capture released, no drag-end ever
      // arrives). End the session instead of polling forever —
      // the tab stays safely wherever it is.
      const silentMs = Date.now() - session.lastEventAt;
      if (silentMs > DRAG_STALE_MS) {
        detachDiag(
          `drag-poll stale-session end tab=${session.tab.id} detached=${session.detachedWindowId} silentMs=${silentMs}`,
        );
        clearHold(session);
        clearDetect(session);
        if (dragSession === session) dragSession = null;
        stopDragPoll();
        return;
      }
      const sourceWin = windowById(session.sourceWindowId);
      if (!sourceWin || sourceWin.isDestroyed()) {
        stopDragPoll();
        return;
      }
      const point = screen.getCursorScreenPoint();
      if (last && last.x === point.x && last.y === point.y) return;
      last = point;
      if (!loggedStart) {
        loggedStart = true;
        detachDiag(`drag-poll started session tab=${session.tab.id}`);
      }
      const res = handleDragPoint(session, point);
      if (res === null) {
        detachDiag(`drag-poll DROPPED: source window ${session.sourceWindowId} unresolvable (fromId)`);
        return;
      }
      if (res.outside > 0 || res.fired) {
        detachDiag(
          `drag-poll point=(${point.x},${point.y}) outside=${res.outside.toFixed(1)} ` +
            `detached=${session.detachedWindowId} fireDetach=${res.fired}`,
        );
      }
    }, DRAG_POLL_MS);
  }

  ipcMain.on('terminal:drag-start', (event, tab: DetachedTab, index: number) => {
    // DIAGNOSTIC: resolve the source window BOTH ways — fromId
    // takes a BrowserWindow id, event.sender.id is a WebContents
    // id. If fromId returns null here, every drag-move below is
    // dropped silently and the tab can never detach.
    const fromIdWin = BrowserWindow.fromId(event.sender.id);
    const fromWCWin = BrowserWindow.fromWebContents(event.sender);
    detachDiag(
      `drag-start tab=${tab?.id} index=${index} senderWC=${event.sender.id} ` +
        `fromId=${fromIdWin ? fromIdWin.id : 'null'} fromWebContents=${fromWCWin ? fromWCWin.id : 'null'}`,
    );
    if (dragSession) cancelDragSession(dragSession);
    dragSession = {
      tab,
      sourceIndex: typeof index === 'number' ? index : 0,
      sourceWindowId: event.sender.id,
      ownerWindowId: event.sender.id,
      detachedWindowId: null,
      candidateWindowId: null,
      holdTimer: null,
      detectedWindowId: null,
      detectedIndex: 0,
      lastPoint: null,
      lastEventAt: Date.now(),
    };
    // The fallback poll runs for this session's lifetime (it
    // stops on drag-end / drag-cancel / replacement).
    startDragPoll(dragSession);
  });

  // DIAGNOSTIC: renderer-side drag reports (pointerdown, capture
  // result, first move, pointerup summary) — one trail, one file.
  ipcMain.on('terminal:drag-diag', (_event, message: string) => {
    if (typeof message === 'string') detachDiag(`renderer: ${message}`);
  });

  ipcMain.on('terminal:drag-move', (event, clientX: number, clientY: number) => {
    const session = dragSession;
    if (!session || event.sender.id !== session.sourceWindowId) return;
    session.lastEventAt = Date.now();
    const sourceWin = windowById(session.sourceWindowId);
    if (!sourceWin) {
      detachDiag(`drag-move DROPPED: source window ${session.sourceWindowId} unresolvable (fromId)`);
      return;
    }
    const bounds = sourceWin.getBounds();
    const point = { x: bounds.x + clientX, y: bounds.y + clientY };
    const outside = outsideDistance(point, bounds);
    const fired = session.detachedWindowId === null && outside > DETACH_THRESHOLD_PX;
    detachDiag(
      `drag-move client=(${clientX},${clientY}) bounds=(${bounds.x},${bounds.y},${bounds.width}x${bounds.height}) ` +
        `point=(${point.x},${point.y}) outside=${outside.toFixed(1)} detached=${session.detachedWindowId} fireDetach=${fired}`,
    );
    // The shared core fires the detach and runs arbitration —
    // the same path the fallback poll feeds.
    handleDragPoint(session, point);
  });

  ipcMain.on('terminal:drag-end', (event, clientX: number, clientY: number) => {
    const session = dragSession;
    if (!session || event.sender.id !== session.sourceWindowId) return;
    detachDiag(`drag-end client=(${clientX},${clientY}) detached=${session.detachedWindowId} detected=${session.detectedWindowId}`);
    dragSession = null;
    stopDragPoll();
    clearHold(session);
    const sourceWin = windowById(session.sourceWindowId);
    if (sourceWin) {
      const bounds = sourceWin.getBounds();
      session.lastPoint = { x: bounds.x + clientX, y: bounds.y + clientY };
    }
    if (session.detectedWindowId !== null) {
      const targetWindowId = session.detectedWindowId;
      const index = session.detectedIndex;
      clearDetect(session);
      executeRemount(session, targetWindowId, index);
    } else {
      clearDetect(session);
    }
  });

  ipcMain.on('terminal:drag-cancel', (event) => {
    const session = dragSession;
    if (!session || event.sender.id !== session.sourceWindowId) return;
    detachDiag(`drag-cancel detached=${session.detachedWindowId}`);
    dragSession = null;
    cancelDragSession(session);
  });

  // A window claims a tab it just added (tab-added push,
  // pending-main-tabs fetch, or its own detach-state): the
  // owner registry follows the window that HOLDS the tab.
  ipcMain.on('terminal:claim-tab', (event, id: string) => {
    setTerminalOwner(id, event.sender);
  });

  // --- Cross-window tab-number registry ---

  // A window created a tab: record its number and tell every
  // other window, so no window can create a tab with this id
  // (whose PTY createTerminal would destroy first).
  ipcMain.on('terminal:reserve-number', (event, id: string) => {
    if (!id || typeof id !== 'string') return;
    reservedTabNumbers.add(id);
    broadcast('terminal:reserve-number', event.sender.id, id);
  });

  // A detached window created a tab: register it like a tab
  // that was dragged out, so closing the window pops it back
  // into the main window instead of losing it. Also reserves
  // the number (same broadcast as reserve-number).
  ipcMain.on('terminal:register-detached-tab', (event, tab: DetachedTab, index: number) => {
    if (!tab || typeof tab.id !== 'string') return;
    detachedTabMeta.set(tab.id, { tab, index: typeof index === 'number' ? index : 0, windowId: event.sender.id });
    reservedTabNumbers.add(tab.id);
    broadcast('terminal:reserve-number', event.sender.id, tab.id);
  });

  // A window joining late seeds its reserved numbers from main.
  ipcMain.handle('terminal:get-reserved-numbers', (): string[] => {
    return [...reservedTabNumbers];
  });

  ipcMain.on('terminal:report-bar-rect', (event, report: BarRectReport) => {
    if (!report || !report.rect || !Array.isArray(report.tabs)) return;
    barRects.set(event.sender.id, {
      report,
      focusedAt: focusAt.get(event.sender.id) ?? Date.now(),
    });
  });

  // --- Detach state fetch (the window pulls its tab on mount) ---

  ipcMain.handle('terminal:get-detach-state', (event): DetachedTab | null => {
    const tab = pendingTerminalState.get(event.sender.id) ?? null;
    if (tab) pendingTerminalState.delete(event.sender.id);
    return tab;
  });

  ipcMain.handle('terminal:get-pending-main-tabs', (): { tab: DetachedTab; index: number }[] => {
    return pendingMainTabs.splice(0, pendingMainTabs.length);
  });

  // --- Pop-in (a detached window sends one tab back to the main window) ---

  ipcMain.handle('terminal:pop-in', (event, tab: DetachedTab): DetachResult => {
    const owner = getTerminalOwner(tab.id);
    if (!owner || owner.id !== event.sender.id) {
      return { ok: false, error: 'tab is not owned by this window' };
    }
    const meta = detachedTabMeta.get(tab.id);
    const index = meta?.index ?? 0;
    detachedTabMeta.delete(tab.id);
    // Re-target to the main window when it exists; when it does
    // not, the new main window claims the tab on add
    // (terminal:claim-tab) — until then the PTY output still
    // routes to this (still open) window and is dropped, never
    // lost from the PTY.
    const mainWin = mainAccess.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      setTerminalOwner(tab.id, mainWin.webContents);
    }
    deliverTabToMainWindow(tab, index);
    event.sender.send('terminal:tab-removed', tab.id);
    return { ok: true };
  });

  // --- Tab-number release (a window destroyed a PTY) ---
  // Every window frees the number, not just the main window:
  // a detached window that reserved a number from a broadcast
  // must free it too, or the number stays taken forever there.
  ipcMain.on('terminal:tab-closed', (event, id: string) => {
    if (!id || typeof id !== 'string') return;
    reservedTabNumbers.delete(id);
    broadcast('terminal:release-number', event.sender.id, id);
  });

  // --- Files detach (same window pattern, no PTY — content transfers) ---

  ipcMain.handle('files:detach', (event, file: DetachedFile, dropX: number, dropY: number): DetachResult => {
    if (!file || typeof file.path !== 'string') return { ok: false, error: 'no file' };
    let win: BrowserWindow;
    try {
      win = createDetachedWindow({
        boundsKey: `files:${file.path}`,
        mini: 'files',
        query: `path=${encodeURIComponent(file.path)}`,
        dropPoint: { x: dropX, y: dropY },
        defaultBounds: DETACH_FILES_DEFAULT_BOUNDS,
        onClosed: () => handleDetachedWindowClosed(win, 'files'),
      });
    } catch (error) {
      console.error('[detach] failed to create detached files window:', error);
      return { ok: false, error: 'could not create window' };
    }
    pendingFilesState.set(win.id, file);
    detachedFiles.set(win.id, file);
    return { ok: true };
  });

  ipcMain.handle('files:get-detach-state', (event): DetachedFile | null => {
    const file = pendingFilesState.get(event.sender.id) ?? null;
    if (file) pendingFilesState.delete(event.sender.id);
    return file;
  });

  ipcMain.handle('files:get-pending-main-files', (): DetachedFile[] => {
    return pendingMainFiles.splice(0, pendingMainFiles.length);
  });

  ipcMain.handle('files:pop-in', (event, file: DetachedFile): DetachResult => {
    if (!file || typeof file.path !== 'string') return { ok: false, error: 'no file' };
    const owned = detachedFiles.get(event.sender.id);
    if (!owned || owned.path !== file.path) {
      return { ok: false, error: 'file is not owned by this window' };
    }
    detachedFiles.delete(event.sender.id);
    deliverFileToMainWindow(file);
    event.sender.send('files:file-removed', file.path);
    return { ok: true };
  });
}
