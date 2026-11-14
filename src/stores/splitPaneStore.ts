/**
 * Split panes — sweep audit item 2 (2026-11-14): Lucid had no split
 * panes anywhere. Warp, VS Code, iTerm2, Ghostty, WezTerm, Windows
 * Terminal, Kitty and Tabby all split; detach (c00da46) gives a
 * separate window, not two terminals side by side in one window.
 *
 * MODEL — a split group is a set of TABS shown side by side in the
 * main window's terminal view. Each pane IS a tab: its own PTY (see
 * terminalStore.createTab), its own feed (historyStore blocksByTab),
 * its own mode (sessionStore tabMode). There is no new session
 * concept, no pane object — the group is layout over tabs, and the
 * existing tab strip manages panes: click a pane's tab to focus it,
 * × on a pane's tab closes just that pane, the split button / ⌘D
 * splits the active tab. The strip is the management surface, as
 * the audit directed ("reusing the existing tab strip for pane
 * management").
 *
 * VERTICAL FIRST: panes sit side by side (a vertical split). A
 * horizontal split (stacked panes) is a follow-on — the group
 * would need a direction, and the divider a horizontal drag.
 * Terminal view only: the editor, Files and AI panel never split.
 *
 * MAIN WINDOW ONLY: detached windows (MiniTerminal, `?mini=
 * terminal`) render one tab and show no split control — the split
 * button and ⌘D are main-window only. Detaching a pane's tab out
 * of a split drops it from the group (the prune subscription
 * below); popping it back in returns it as a normal tab.
 *
 * FOCUS follows the clicked pane: Terminal.tsx's root mousedown
 * makes a visible-but-inactive pane the active tab, so its
 * composer / xterm take input. Only the focused pane is "active"
 * (isActiveTab) — the other pane's timers stay gated exactly like
 * a hidden tab's, and its agent mode applies when it regains
 * focus. PTY data is per-tabId (Terminal.tsx handleData filters
 * on it), so both panes stream live at once.
 *
 * DEFCON: no new behavior. Each pane is a full Terminal, so each
 * renders per its own tab state at the current level — feed at
 * DEFCON 3, xterm below it, devmode duplication unchanged (audit
 * item 6 is a separate fix). The levels gate nothing new here.
 *
 * GUEST: split groups are stashed on guest enter and restored on
 * exit, the sessionStore pattern (subscribe to historyStore's
 * guest flag). A guest starts with a single pane — the blank
 * slate — and any split the guest makes is dropped on exit. A
 * guest pane is a plain terminal pane: agent mode is refused in
 * guest by sessionStore, and splits never touch the owner's
 * persisted state (there is none — split layout is session-only,
 * like the tab strip itself: tabs start empty each launch).
 *
 * SIZES: percentages per group, summing to 100, each pane clamped
 * to 15–85%. Membership changes reset to equal widths; the
 * divider drag (SplitDivider.tsx) moves one boundary.
 */

import { create } from 'zustand';
import { useTerminalStore } from './terminalStore';
import { useHistoryStore } from './historyStore';
import type { TerminalTab } from '../types';

/** A split group: tabs shown side by side, left to right. */
export interface SplitGroup {
  /** Stable id (`split-N`), independent of membership — the anchor
   *  tab may leave the group without the group losing its id. */
  id: string;
  /** Pane tab ids, left to right. */
  tabIds: string[];
  /** Width percentages, same length as tabIds, summing to 100. */
  sizes: number[];
}

export interface SplitPaneState {
  /** Groups by id. A tab is in at most one group. */
  groups: Record<string, SplitGroup>;

  /**
   * Split a tab vertically: create a fresh tab (a new PTY, in the
   * source tab's cwd) and put it beside the source — appended
   * after the source inside its group when the source is already
   * split, else a new group [source, new]. Focus follows the new
   * pane (createTab makes it active). Returns the new tab id, or
   * null when the source tab does not exist.
   */
  splitTab: (tabId: string) => Promise<string | null>;
  /**
   * Close one pane: remove it from its group (dissolving the group
   * when one pane is left) and close the tab (destroying its PTY).
   * When the closed pane was active and siblings remain, focus
   * moves to the pane that takes its place (the next pane, else
   * the previous) — not to the strip neighbour, which may sit
   * outside the group. A tab in no group closes exactly like
   * closeTab.
   */
  closePane: (tabId: string) => void;
  /** Focus a pane — the tab strip's setActiveTab. */
  focusPane: (tabId: string) => void;
  /** Set a group's widths (divider drag). Length must match the
   *  group; each pane is clamped to 15–85% and the set is
   *  normalised to 100. Anything else is a no-op. */
  setPaneSizes: (groupId: string, sizes: number[]) => void;
  /** Test-only reset: clears groups, the group counter, and the
   *  guest stash (same precedent as sessionStore.resetForTests). */
  resetForTests: () => void;
}

/** Per-pane width limits (percent). */
export const SPLIT_PANE_MIN_PCT = 15;
export const SPLIT_PANE_MAX_PCT = 85;

/** Equal widths for n panes (rounded to 2 decimals; the sum lands
 *  within a hundredth of 100, which flex tolerates). */
export function equalSizes(n: number): number[] {
  if (n <= 0) return [];
  const each = Math.round(10000 / n) / 100;
  return Array.from({ length: n }, () => each);
}

/** Clamp a value into the per-pane limits. */
export function clampPanePct(value: number): number {
  return Math.min(SPLIT_PANE_MAX_PCT, Math.max(SPLIT_PANE_MIN_PCT, value));
}

/**
 * Drag math (pure, so it is unit-testable): move the divider at
 * `boundary` — between pane `boundary` and `boundary + 1` — by
 * `deltaPct` (positive grows the left pane). The two panes'
 * combined width is conserved; when one side hits its clamp the
 * other gives back the leftover, so both stay in 15–85%.
 */
export function computePaneSizesAfterDrag(
  sizes: number[],
  boundary: number,
  deltaPct: number,
): number[] {
  if (boundary < 0 || boundary >= sizes.length - 1) return [...sizes];
  const next = [...sizes];
  const total = next[boundary] + next[boundary + 1];
  let left = clampPanePct(next[boundary] + deltaPct);
  let right = total - left;
  if (right < SPLIT_PANE_MIN_PCT) {
    right = SPLIT_PANE_MIN_PCT;
    left = total - right;
  } else if (right > SPLIT_PANE_MAX_PCT) {
    right = SPLIT_PANE_MAX_PCT;
    left = total - right;
  }
  next[boundary] = left;
  next[boundary + 1] = right;
  return next;
}

/** The group containing a tab, or null. A tab is in at most one. */
export function findGroupForTab(
  groups: Record<string, SplitGroup>,
  tabId: string,
): SplitGroup | null {
  for (const group of Object.values(groups)) {
    if (group.tabIds.includes(tabId)) return group;
  }
  return null;
}

/**
 * Which tabs the terminal view shows: the active tab's whole
 * group when it is split, else just the active tab. Empty when
 * there is no active tab.
 */
export function getVisibleTabIds(
  groups: Record<string, SplitGroup>,
  activeTabId: string | null,
): string[] {
  if (!activeTabId) return [];
  const group = findGroupForTab(groups, activeTabId);
  return group ? [...group.tabIds] : [activeTabId];
}

/**
 * Render order for App.tsx's tab map: the visible panes first, in
 * group order (a group's order is the split order, which can
 * differ from strip order when a middle pane is split again),
 * then every other tab in strip order (they render hidden, so
 * their order is invisible). With no split this returns the tabs
 * unchanged.
 */
export function orderTabsForRender(
  tabs: TerminalTab[],
  groups: Record<string, SplitGroup>,
  activeTabId: string | null,
): TerminalTab[] {
  const visible = getVisibleTabIds(groups, activeTabId);
  if (visible.length < 2) return tabs;
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const ordered: TerminalTab[] = [];
  for (const id of visible) {
    const tab = byId.get(id);
    if (tab) ordered.push(tab);
  }
  for (const tab of tabs) {
    if (!visible.includes(tab.id)) ordered.push(tab);
  }
  return ordered;
}

let groupCounter = 0;

export const useSplitPaneStore = create<SplitPaneState>((set, get) => ({
  groups: {},

  splitTab: async (tabId) => {
    const source = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
    if (!source) return null;
    // A new PTY, in the source tab's cwd — a split of this
    // terminal starts where this terminal is. createTab makes
    // the new tab active, so focus follows the new pane.
    const newId = await useTerminalStore.getState().createTab(source.cwd);
    set((state) => {
      const existing = findGroupForTab(state.groups, tabId);
      if (existing) {
        const at = existing.tabIds.indexOf(tabId);
        const tabIds = [...existing.tabIds];
        tabIds.splice(at + 1, 0, newId);
        return {
          groups: {
            ...state.groups,
            [existing.id]: { ...existing, tabIds, sizes: equalSizes(tabIds.length) },
          },
        };
      }
      groupCounter += 1;
      const id = `split-${groupCounter}`;
      return {
        groups: {
          ...state.groups,
          [id]: { id, tabIds: [tabId, newId], sizes: [50, 50] },
        },
      };
    });
    return newId;
  },

  closePane: (tabId) => {
    const group = findGroupForTab(get().groups, tabId);
    const wasActive = useTerminalStore.getState().activeTabId === tabId;
    let nextActive: string | null = null;
    if (group) {
      const idx = group.tabIds.indexOf(tabId);
      const remaining = group.tabIds.filter((id) => id !== tabId);
      if (wasActive && remaining.length > 0) {
        nextActive = remaining[Math.min(idx, remaining.length - 1)];
      }
      set((state) => {
        const groups = { ...state.groups };
        if (remaining.length < 2) {
          // One pane left: the split is over — the survivor is a
          // normal tab again.
          delete groups[group.id];
        } else {
          groups[group.id] = { ...group, tabIds: remaining, sizes: equalSizes(remaining.length) };
        }
        return { groups };
      });
    }
    // Destroy the PTY (closeTab also reassigns the active tab to
    // the strip neighbour — overridden below when a sibling pane
    // takes the focus instead).
    useTerminalStore.getState().closeTab(tabId);
    if (nextActive) useTerminalStore.getState().setActiveTab(nextActive);
  },

  focusPane: (tabId) => {
    useTerminalStore.getState().setActiveTab(tabId);
  },

  setPaneSizes: (groupId, sizes) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group || sizes.length !== group.tabIds.length) return state;
      const clamped = sizes.map(clampPanePct);
      // Normalise to 100 on the largest pane; the drag helper
      // already conserves the sum, so this is a defensive fix-up
      // for direct callers, not the drag path.
      const total = clamped.reduce((a, b) => a + b, 0);
      const residual = 100 - total;
      if (residual !== 0) {
        let largest = 0;
        clamped.forEach((v, i) => {
          if (v > clamped[largest]) largest = i;
        });
        clamped[largest] = clampPanePct(clamped[largest] + residual);
      }
      return { groups: { ...state.groups, [groupId]: { ...group, sizes: clamped } } };
    });
  },

  resetForTests: () => {
    groupCounter = 0;
    stashedGroups = null;
    guestWasActive = useHistoryStore.getState().guestSessionActive;
    set({ groups: {} });
  },
}));

// A closed / detached tab's group membership dies with it: tab ids
// are `terminal-N` with the lowest free number reused
// (terminalStore), so a fresh tab must never inherit a dead tab's
// split — and a tab dragged out of the window must leave its
// group behind. The sessionStore prune subscription is the
// pattern: this fires on every terminal-store change and only
// writes when something actually dropped.
useTerminalStore.subscribe((state) => {
  const liveIds = new Set(state.tabs.map((t) => t.id));
  const groups = useSplitPaneStore.getState().groups;
  let changed = false;
  const next: Record<string, SplitGroup> = {};
  for (const [id, group] of Object.entries(groups)) {
    const tabIds = group.tabIds.filter((t) => liveIds.has(t));
    if (tabIds.length === group.tabIds.length) {
      next[id] = group;
      continue;
    }
    changed = true;
    if (tabIds.length >= 2) {
      next[id] = { ...group, tabIds, sizes: equalSizes(tabIds.length) };
    }
    // One pane left: the group dissolves, the survivor is a
    // normal tab — the entry is dropped, not kept.
  }
  if (changed) useSplitPaneStore.setState({ groups: next });
});

// A guest session veiling in stashes the split groups and clears
// them (see the header): a guest starts with a single pane — the
// blank slate. The owner's groups are restored exactly on exit,
// for tabs that still exist (a tab closed during the guest
// session does not come back). A split the guest made is dropped
// on exit — the stash restore overwrites it. This fires on the
// guest flag's transitions only, not on every history change
// (every PTY chunk mutates the store) — the sessionStore guest
// subscription is the pattern.
let stashedGroups: Record<string, SplitGroup> | null = null;
let guestWasActive = false;
useHistoryStore.subscribe((state) => {
  const guestActive = state.guestSessionActive;
  if (guestActive === guestWasActive) return;
  guestWasActive = guestActive;
  if (guestActive) {
    stashedGroups = useSplitPaneStore.getState().groups;
    if (Object.keys(stashedGroups).length > 0) {
      useSplitPaneStore.setState({ groups: {} });
    }
  } else if (stashedGroups !== null) {
    const liveIds = new Set(useTerminalStore.getState().tabs.map((t) => t.id));
    const restored: Record<string, SplitGroup> = {};
    for (const [id, group] of Object.entries(stashedGroups)) {
      const tabIds = group.tabIds.filter((t) => liveIds.has(t));
      if (tabIds.length >= 2) {
        restored[id] = { ...group, tabIds, sizes: equalSizes(tabIds.length) };
      }
    }
    stashedGroups = null;
    useSplitPaneStore.setState({ groups: restored });
  }
});
