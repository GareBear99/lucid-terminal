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

import { create } from 'zustand';
import {
  useSplitPaneStore,
  findGroupForTab,
  getVisibleTabIds,
} from '../stores/splitPaneStore';
import { useTerminalStore } from '../stores/terminalStore';

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
 * Unsplit one tab AND queue the feed line for the SURVIVING pane:
 * the shared unsplit-with-line action for the pill, /unsplit, ⌘U
 * and the palette `terminal:unsplit` entry. Same message and same
 * guards as before — one call undoes exactly one split; a tab
 * with no split group is a silent no-op (⌘U on a plain tab never
 * printed anything); a group whose tree is inconsistent names the
 * failure instead of lying, like /unsplit does. Returns the
 * removed pane's id, or null when nothing was unsplit.
 *
 * The line is queued, not written (see the queue note above): the
 * action's own instance is about to be unmounted by the tree
 * surgery — either its tab closes (the removed pane, the usual
 * live case: focus follows the newest pane, so the Unsplit press
 * lands in the pane being removed) or its pane remounts. The
 * target is the pane that stays visible: the acting tab when it
 * survives, else the first remaining leaf of the group as it stood
 * before the unsplit (snapshot BEFORE the call — after it, the
 * removed tab reads as a plain tab and the group may be gone).
 * The inconsistent-tree message is the exception: no tree change
 * happens, so no remount — it still goes straight through the
 * registered writer to the live instance.
 */
export function unsplitOneTabWithQueuedLine(tabId: string): string | null {
  const before = getVisibleTabIds(useSplitPaneStore.getState().groups, tabId);
  const removed = useSplitPaneStore.getState().unsplitOneTab(tabId);
  if (removed === null) {
    if (findGroupForTab(useSplitPaneStore.getState().groups, tabId)) {
      writeTerminalFeedLine(tabId, "Couldn't unsplit — the split tree is inconsistent.");
    }
    return null;
  }
  const survivors = before.filter((id) => id !== removed);
  const target = survivors.includes(tabId) ? tabId : survivors[0] ?? null;
  if (target !== null) {
    queueTerminalFeedLine(target, unsplitFeedLine(removed, survivors.length));
  }
  return removed;
}

/**
 * Unsplit one tab AND write the feed line — the ⌘U / palette entry
 * point. Delegates to unsplitOneTabWithQueuedLine: the line is
 * queued for the surviving pane (see above), not written to the
 * dying instance. Returns the removed pane's id, or null when
 * nothing was unsplit.
 */
export function unsplitTabWithFeedLine(tabId: string): string | null {
  return unsplitOneTabWithQueuedLine(tabId);
}
