/**
 * The unsplit feed line, shared by every unsplit path (sweep
 * fold-in, 2026-11-16).
 *
 * The helper started as a local const in Terminal.tsx (sweep fix,
 * 2026-11-16): one source of truth for the message, shared by
 * /unsplit and the split pill's Unsplit — the pill used to call
 * unsplitOneTab bare, so a button unsplit left no "Closed
 * terminal-2 — 1 panes left" line in the feed (live check
 * 2026-11-16 on build 2ff0ba0). It lives here now because two
 * more paths need it and cannot reach Terminal's component
 * scope: ⌘U in TerminalTabs and the palette `terminal:unsplit`
 * entry in builtinCommands (which must stay DOM-free — it cannot
 * import the Terminal component). Same text, same callers.
 */

import {
  useSplitPaneStore,
  findGroupForTab,
  getVisibleTabIds,
} from '../stores/splitPaneStore';

/** The feed line for an unsplit that removed `removed`. */
export function unsplitFeedLine(removed: string, remaining: number): string {
  return remaining > 1
    ? `Closed ${removed} — ${remaining} panes left.`
    : `Closed ${removed} — back to one terminal.`;
}

/**
 * The terminal feed-line bridge: Terminal.tsx registers its
 * termWriteLines for the active tab, and the paths with no
 * access to the xterm surface write their line through it —
 * so every unsplit path lands the same "Closed …" line the
 * pill and /unsplit write. A write with no writer registered
 * (terminal unmounted, detached window) is dropped, never
 * queued: an unsplit with no visible terminal has nowhere
 * to show it.
 */
type TerminalLineWriter = (text: string) => void;

const writers = new Map<string, TerminalLineWriter>();

/** Register `write` as the feed-line writer for `tabId`. Returns the unregister. */
export function registerTerminalLineWriter(tabId: string, write: TerminalLineWriter): () => void {
  writers.set(tabId, write);
  return () => {
    if (writers.get(tabId) === write) writers.delete(tabId);
  };
}

/** Write `text` to `tabId`'s feed line. False when no writer is registered. */
export function writeTerminalFeedLine(tabId: string, text: string): boolean {
  const write = writers.get(tabId);
  if (!write) return false;
  write(text);
  return true;
}

/**
 * Unsplit one tab AND write the feed line: the shared
 * unsplit-with-line action for the paths that cannot reach
 * Terminal's termWriteLines — ⌘U in TerminalTabs and the
 * palette `terminal:unsplit` entry. Same message, same
 * guards as /unsplit and the split pill (handleToggleSplit):
 * one call undoes exactly one split; a tab with no split
 * group is a silent no-op (⌘U on a plain tab never printed
 * anything); a group whose tree is inconsistent names the
 * failure instead of lying, like /unsplit does. Returns the
 * removed pane's id, or null when nothing was unsplit.
 */
export function unsplitTabWithFeedLine(tabId: string): string | null {
  const removed = useSplitPaneStore.getState().unsplitOneTab(tabId);
  if (removed === null) {
    if (findGroupForTab(useSplitPaneStore.getState().groups, tabId)) {
      writeTerminalFeedLine(tabId, "Couldn't unsplit — the split tree is inconsistent.");
    }
    return null;
  }
  const remaining = getVisibleTabIds(useSplitPaneStore.getState().groups, tabId).length;
  writeTerminalFeedLine(tabId, unsplitFeedLine(removed, remaining));
  return removed;
}
