/**
 * The unsplit feed line, shared by every unsplit path (sweep
 * fold-in, 2026-11-16).
 *
 * The helper started as a local const in Terminal.tsx (sweep fix,
 * 2026-11-16): one source of truth for the message, shared by
 * /unsplit and the split pill's Unsplit — the pill used to call
 * unsplitOneTab bare, so a button unsplit left no "Unsplit
 * terminal-2 — back to separate terminals" line in the feed (live
 * check 2026-11-16 on build 2ff0ba0). It lives here now because
 * two more paths need it and cannot reach Terminal's component
 * scope: ⌘U in TerminalTabs and the palette `terminal:unsplit`
 * entry in builtinCommands (which must stay DOM-free — it cannot
 * import the Terminal component). Same text, same callers.
 *
 * UNSPLIT NEVER CLOSES A TAB (Gary, 2026-11-16): the line says
 * "Unsplit", never "Closed" — the separated pane keeps its PTY,
 * feed and cwd as a normal individual tab.
 */

import { create } from 'zustand';
import {
  useSplitPaneStore,
  findGroupForTab,
  getVisibleTabIds,
} from '../stores/splitPaneStore';
import { useTerminalStore } from '../stores/terminalStore';

/**
 * The feed line for an unsplit that separated `separated`.
 * `remaining` is the panes still in the split afterwards —
 * the group the acting tab is still in, if any. Nothing is
 * closed (Gary, 2026-11-16), so the line says "Unsplit",
 * never "Closed".
 */
export function unsplitFeedLine(separated: string, remaining: number): string {
  return remaining > 1
    ? `Unsplit ${separated} — ${remaining} panes left in the split.`
    : `Unsplit ${separated} — back to separate terminals.`;
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
 * The queued feed lines (2026-11-16 — the live 179d944 fix):
 * split/unsplit lines are QUEUED for the surviving pane, never
 * written straight to the instance that ran the action. A direct
 * write is lost live, twice over:
 *
 * (A) the final unsplit dissolves the group, so App moves the
 * surviving pane's <Terminal> from the split-tree leaf div to
 * its flat host div — React unmounts and remounts it, and its
 * xterm scrollback resets (App.tsx P1 known limit). termWriteLines
 * awaits the prompt echo first, so it resolves after the unmount
 * into a disposed surface (termRef null; the fallback setState on
 * an unmounted component is discarded; the scrollback-mirror copy
 * is orphaned in the dead instance; block capture is gated on the
 * prompter, inactive in plain terminal mode). The line lands
 * nowhere — verified live, 2 split/unsplit cycles, both Unsplit
 * buttons, while tests/terminalUnsplit.test.tsx passed 8/8: it
 * renders ONE <Terminal> directly, so no tree/flat-host swap ever
 * happens and the write always lands.
 *
 * (B) collapsing a NESTED node remounts the surviving leaf pane
 * even when the group survives: the node's container div is
 * replaced by the survivor's keyed leaf div, so React unmounts
 * the subtree (its Terminal included) and mounts a fresh one —
 * the survivor's scrollback resets (MARK-ONE probe, 2026-11-16:
 * a 3→2 pill unsplit in the surviving pane emptied its output
 * although nothing dissolved). Only a surviving SUBTREE keeps its
 * panes (same element type and key at the same position).
 *
 * The queue is reactive (zustand) and per-tab: the Terminal for
 * the surviving tab drains it on mount AND whenever its queue
 * changes — a remounting pane drains on its new mount, a pane
 * that never remounts drains in place, and a line queued for a
 * tab that then closes is dropped by the prune subscription below
 * (tab numbers are reused — a stale line must never land in a
 * later tab that reused the id).
 */
export interface FeedLineQueueState {
  /** Pending lines per tab id, in queue order. */
  queued: Record<string, string[]>;
  /** Append `text` to `tabId`'s pending lines. */
  enqueue: (tabId: string, text: string) => void;
  /** Remove and return `tabId`'s pending lines (none when empty). */
  take: (tabId: string) => string[];
  /** Test-only reset: clears every pending line. */
  resetForTests: () => void;
}

export const useFeedLineQueueStore = create<FeedLineQueueState>((set, get) => ({
  queued: {},
  enqueue: (tabId, text) =>
    set((state) => ({
      queued: { ...state.queued, [tabId]: [...(state.queued[tabId] ?? []), text] },
    })),
  take: (tabId) => {
    const lines = get().queued[tabId] ?? [];
    if (lines.length === 0) return [];
    set((state) => {
      const next = { ...state.queued };
      delete next[tabId];
      return { queued: next };
    });
    return lines;
  },
  resetForTests: () => set({ queued: {} }),
}));

/** Queue `text` for `tabId`'s feed — delivered by that tab's Terminal when it drains. */
export function queueTerminalFeedLine(tabId: string, text: string): void {
  useFeedLineQueueStore.getState().enqueue(tabId, text);
}

// A closed tab's pending lines die with it: tab ids are
// `terminal-N` with the lowest free number reused, so a queued
// line for a dead tab must never land in the fresh tab that
// reuses its number. The split store's prune subscription is the
// pattern: this fires on every terminal-store change and only
// writes when something actually dropped. The enqueue for an
// unsplit's survivor happens AFTER unsplitOneTab's closeTab, so
// the survivor (still live) is never pruned by its own unsplit.
useTerminalStore.subscribe((state) => {
  const liveIds = new Set(state.tabs.map((t) => t.id));
  const queued = useFeedLineQueueStore.getState().queued;
  const dead = Object.keys(queued).filter((id) => !liveIds.has(id));
  if (dead.length === 0) return;
  useFeedLineQueueStore.setState((s) => {
    const next = { ...s.queued };
    for (const id of dead) delete next[id];
    return { queued: next };
  });
});

/**
 * Unsplit one tab AND queue the feed line for the acting pane:
 * the shared unsplit-with-line action for the pill, /unsplit, ⌘U
 * and the palette `terminal:unsplit` entry. Same message and same
 * guards as before — one call undoes exactly one split; a tab
 * with no split group is a silent no-op (⌘U on a plain tab never
 * printed anything); a group whose tree is inconsistent names the
 * failure instead of lying, like /unsplit does. Returns the
 * separated pane's id and the feed line, or null when nothing was
 * unsplit.
 *
 * The line is queued, not written (see the queue note above): the
 * action's own instance is about to be remounted by the tree
 * surgery — dissolving the group moves the pane tree-leaf →
 * flat host, collapsing a nested node replaces the node's
 * container with the survivor's leaf div — so a direct write
 * resolves after the unmount into a disposed surface and the
 * line never appears (live 179d944). The target is the acting
 * tab: it always survives an unsplit now (nothing is closed),
 * so the line always has a live pane to land on. The
 * inconsistent-tree message is the exception: no tree change
 * happens, so no remount — it still goes straight through the
 * registered writer to the live instance.
 */
export function unsplitOneTabWithQueuedLine(tabId: string): { separated: string; line: string } | null {
  const before = getVisibleTabIds(useSplitPaneStore.getState().groups, tabId);
  const separated = useSplitPaneStore.getState().unsplitOneTab(tabId);
  if (separated === null) {
    if (findGroupForTab(useSplitPaneStore.getState().groups, tabId)) {
      writeTerminalFeedLine(tabId, "Couldn't unsplit — the split tree is inconsistent.");
    }
    return null;
  }
  const survivors = before.filter((id) => id !== separated);
  const line = unsplitFeedLine(separated, survivors.length);
  queueTerminalFeedLine(tabId, line);
  return { separated, line };
}

/**
 * Unsplit one tab AND write the feed line — the ⌘U / palette entry
 * point. Delegates to unsplitOneTabWithQueuedLine: the line is
 * queued for the acting pane (see above), not written to a dying
 * instance. Returns the separated pane's id and the feed line,
 * or null when nothing was unsplit.
 */
export function unsplitTabWithFeedLine(tabId: string): { separated: string; line: string } | null {
  return unsplitOneTabWithQueuedLine(tabId);
}

/**
 * Unsplit ALL of a tab's group AND queue the feed line (audit
 * item iii, 2026-11-16): confirming "Unsplit All Panes" used to
 * write no feed line at all — the confirm path called
 * unsplitAllTabs directly, which closed panes with no record.
 * The group dissolves (every pane becomes an individual tab,
 * nothing closes — Gary, 2026-11-16) and the line lands on the
 * acting tab, which always survives. Returns the number of panes
 * that were separated, or 0 when there was nothing to unsplit
 * (no group, or a single pane).
 */
export function unsplitAllTabsWithFeedLine(tabId: string): number {
  const before = getVisibleTabIds(useSplitPaneStore.getState().groups, tabId);
  if (before.length <= 1) return 0;
  useSplitPaneStore.getState().unsplitAllTabs(tabId);
  queueTerminalFeedLine(tabId, `Unsplit all — ${before.length} separate terminals.`);
  return before.length;
}
