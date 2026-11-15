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
 * PANEAXIS TREE (Atom steal #9, 2026-11-14): a group is a binary
 * tree of split nodes, not a flat row. A leaf is one pane (a tab);
 * a split node holds exactly two children and a direction —
 * 'vertical' (side by side, the original ⌘D split) or
 * 'horizontal' (stacked, ⌘⇧D / `/split horizontal`). Splitting a
 * pane replaces its leaf with a split node holding the old pane
 * and the new one, so splits nest: split a pane inside a vertical
 * split horizontally and you get a stack inside a column, the
 * way Atom's PaneAxis nests. Each split node carries its own
 * two sizes (percentages summing to 100); a divider drag moves
 * exactly one node's boundary. Closing a pane collapses its
 * parent node — the sibling takes the parent's place — and a
 * group whose root collapses to one leaf dissolves, the same
 * rule the flat model had. The leaf order (left-to-right, then
 * top-to-bottom) is the visible order and the order the
 * terminal view shows.
 *
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
 * SIZES: percentages per split node, summing to 100, each pane
 * clamped to 15–85%. Splitting a pane always starts the new
 * node at 50/50; the divider drag (SplitDivider.tsx) moves one
 * node's boundary. EQUALIZE (Gary, 2026-11-15 — the equal size
 * button in the tab bar): equalizeGroup resets every node so
 * each leaf gets an equal share (leaf-count-proportional, see
 * equalizeSplitNode) — exact equal shares, without the drag
 * clamp, since with 7+ panes an equal share is below 15%.
 */

import { create } from 'zustand';
import { useTerminalStore } from './terminalStore';
import { useHistoryStore } from './historyStore';
import type { TerminalTab } from '../types';

/** Split direction: 'vertical' is side by side, 'horizontal' is stacked. */
export type SplitDirection = 'vertical' | 'horizontal';

/**
 * A node in a group's PaneAxis tree. A leaf is one pane (a tab);
 * a split node holds exactly two children and the direction they
 * sit in. Sizes are the two children's percentages, summing to
 * 100 — a divider drag moves exactly this node's boundary.
 */
export type SplitNode =
  | { type: 'leaf'; tabId: string }
  | {
      type: 'split';
      id: string;
      direction: SplitDirection;
      sizes: [number, number];
      first: SplitNode;
      second: SplitNode;
    };

/** A split group: one tree over its panes. */
export interface SplitGroup {
  /** Stable id (`split-N`), independent of membership — the anchor
   *  tab may leave the group without the group losing its id. */
  id: string;
  /** The tree's root: a split node while the group is split. */
  root: SplitNode;
}

export interface SplitPaneState {
  /** Groups by id. A tab is in at most one group. */
  groups: Record<string, SplitGroup>;

  /**
   * Split a tab: create a fresh tab (a new PTY, in the source
   * tab's cwd) and put it beside the source — the source leaf is
   * replaced by a split node holding the source and the new pane
   * (50/50, in `direction`), so splits nest. When the source is
   * not split yet this makes a new group. Focus follows the new
   * pane (createTab makes it active). Returns the new tab id, or
   * null when the source tab does not exist.
   */
  splitTab: (tabId: string, direction?: SplitDirection) => Promise<string | null>;
  /**
   * Close one pane: remove it from its group (collapsing its
   * parent node — the sibling takes the parent's place — and
   * dissolving the group when one pane is left) and close the tab
   * (destroying its PTY). When the closed pane was active and
   * siblings remain, focus moves to the pane that takes its place
   * (the next pane, else the previous) — not to the strip
   * neighbour, which may sit outside the group. A tab in no group
   * closes exactly like closeTab.
   */
  closePane: (tabId: string) => void;
  /**
   * Unsplit a tab's group: close every pane in the group except
   * this one (each closed pane's PTY is destroyed, the same as
   * closePane — there is no pane-hiding that keeps PTYs alive).
   * The survivor becomes a normal tab again. A tab in no group
   * is a no-op, never an error. Focus stays on this tab: no
   * closed pane was active, so closePane never moves it.
   */
  unsplitTab: (tabId: string) => void;
  /** Focus a pane — the tab strip's setActiveTab. */
  focusPane: (tabId: string) => void;
  /** Set one split node's sizes (divider drag). The sizes must
   *  be a pair; each pane is clamped to 15–85% and the pair is
   *  normalised to 100. An unknown group, an unknown node, or a
   *  wrong-length sizes array is a no-op. */
  setSplitSizes: (groupId: string, nodeId: string, sizes: [number, number]) => void;
  /**
   * Equalize a group's panes (Gary, 2026-11-15 — the equal
   * size button in the tab bar): reset every split node's
   * sizes so all panes get an equal share (see
   * equalizeSplitNode). Membership, order, sessions and
   * content are untouched — only the ratios change. A resize
   * after equalizing works as today (unequal again until the
   * button is pressed again). An unknown group is a no-op.
   * Scoped by group id: other groups are never touched — and
   * each window owns its own store instance, so a main-window
   * press never touches a detached window's panes and a
   * detached window's press never touches the main window's.
   */
  equalizeGroup: (groupId: string) => void;
  /** Test-only reset: clears groups, the group/node counters, and
   *  the guest stash (same precedent as sessionStore.resetForTests). */
  resetForTests: () => void;
}

/** Per-pane width limits (percent). */
export const SPLIT_PANE_MIN_PCT = 15;
export const SPLIT_PANE_MAX_PCT = 85;

/** Equal widths for n panes (rounded to 2 decimals; the sum lands
 *  within a hundredth of 100, which flex tolerates). Kept for the
 *  flat callers that still need an n-way split (tests, and the
 *  drag helper's boundary math); a split node itself always
 *  holds exactly two sizes. */
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
 * other gives back the leftover, so both stay in 15–85%. A
 * divider always sits between exactly two children of one split
 * node, so callers pass a two-element sizes array and boundary 0.
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

/** The pane tab ids under a node, in visible order (left to right, then top to bottom). */
export function splitNodeTabIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.tabId];
  return [...splitNodeTabIds(node.first), ...splitNodeTabIds(node.second)];
}

/** The pane tab ids of a group, in visible order. */
export function groupTabIds(group: SplitGroup): string[] {
  return splitNodeTabIds(group.root);
}

/** The split node with this id inside a group, or null. */
export function findSplitNode(group: SplitGroup, nodeId: string): SplitNode | null {
  const walk = (node: SplitNode): SplitNode | null => {
    if (node.type === 'split') {
      if (node.id === nodeId) return node;
      return walk(node.first) ?? walk(node.second);
    }
    return null;
  };
  return walk(group.root);
}

/** The group containing a tab, or null. A tab is in at most one. */
export function findGroupForTab(
  groups: Record<string, SplitGroup>,
  tabId: string,
): SplitGroup | null {
  for (const group of Object.values(groups)) {
    if (groupTabIds(group).includes(tabId)) return group;
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
  return group ? groupTabIds(group) : [activeTabId];
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

/**
 * Tree surgery (pure, exported for tests). Replace the leaf
 * holding `tabId` with `replacement`, returning a new tree —
 * the old tree is never mutated. Returns the node unchanged
 * when the leaf is not under it.
 */
export function replaceLeaf(node: SplitNode, tabId: string, replacement: SplitNode): SplitNode {
  if (node.type === 'leaf') {
    return node.tabId === tabId ? replacement : node;
  }
  return {
    ...node,
    first: replaceLeaf(node.first, tabId, replacement),
    second: replaceLeaf(node.second, tabId, replacement),
  };
}

/**
 * Remove the leaf holding `tabId`, collapsing its parent: the
 * sibling takes the parent's place. Returns null when the node
 * itself was that leaf (the group dissolves), and the node
 * unchanged when the leaf is not under it.
 */
export function removeLeaf(node: SplitNode, tabId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.tabId === tabId ? null : node;
  }
  const first = removeLeaf(node.first, tabId);
  if (first === null) return node.second;
  const second = removeLeaf(node.second, tabId);
  if (second === null) return node.first;
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

/** Set one split node's sizes, returning a new tree. */
export function setNodeSizes(
  node: SplitNode,
  nodeId: string,
  sizes: [number, number],
): SplitNode {
  if (node.type === 'leaf') return node;
  if (node.id === nodeId) return { ...node, sizes };
  return {
    ...node,
    first: setNodeSizes(node.first, nodeId, sizes),
    second: setNodeSizes(node.second, nodeId, sizes),
  };
}

/** The panes (leaves) under a node. */
export function countSplitLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1;
  return countSplitLeaves(node.first) + countSplitLeaves(node.second);
}

/**
 * Equalize a PaneAxis tree (pure, exported for tests): every
 * split node divides its space between its two children in
 * proportion to their pane counts. In a single-direction tree
 * that gives every leaf an equal share of the total — a
 * right-deep [a | [b | [c | d]]] becomes 25/75, 33.33/66.67,
 * 50/50, each leaf 25% wide — where a flat 50/50 at every node
 * would leave a at 50% and d at 12.5%. In a mixed-direction
 * tree each split still divides by pane count on its own axis
 * (a vertical 1-vs-2 split is 33.33/66.67 even when the pair
 * is stacked), so a stacked pair spans the wider column —
 * equal shares per split, not equal leaf areas. Each pair sums
 * to exactly 100 (the second share is the complement of the
 * rounded first, 2 decimals).
 *
 * Sizes are exact equal shares, WITHOUT the 15–85% drag
 * clamp: the clamp is a divider-drag rule (a pane should not
 * be dragged below 15%), and an explicit equalize overrides
 * it — with 7+ panes an equal share is below 15%, and
 * clamping would make the panes unequal again. A later drag
 * re-clamps its own node as usual. Membership, order,
 * sessions and content are untouched — only the ratios.
 */
export function equalizeSplitNode(node: SplitNode): SplitNode {
  if (node.type === 'leaf') return node;
  const firstCount = countSplitLeaves(node.first);
  const secondCount = countSplitLeaves(node.second);
  const total = firstCount + secondCount;
  const first = Math.round(((100 * firstCount) / total) * 100) / 100;
  const second = Math.round((100 - first) * 100) / 100;
  return {
    ...node,
    sizes: [first, second],
    first: equalizeSplitNode(node.first),
    second: equalizeSplitNode(node.second),
  };
}

/**
 * Drop every leaf whose tab id is not live, collapsing parents
 * as removeLeaf does. Returns null when nothing survives.
 */
export function pruneSplitNode(node: SplitNode, liveIds: Set<string>): SplitNode | null {
  if (node.type === 'leaf') {
    return liveIds.has(node.tabId) ? node : null;
  }
  const first = pruneSplitNode(node.first, liveIds);
  const second = pruneSplitNode(node.second, liveIds);
  if (first && second) {
    // Nothing dropped under this node: return the same
    // reference, so the prune subscription's `changed` check
    // stays false and the store is not rewritten on every
    // terminal-store change.
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
  }
  return first ?? second;
}

let groupCounter = 0;
let nodeCounter = 0;

export const useSplitPaneStore = create<SplitPaneState>((set, get) => ({
  groups: {},

  splitTab: async (tabId, direction = 'vertical') => {
    const source = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
    if (!source) return null;
    // A new PTY, in the source tab's cwd — a split of this
    // terminal starts where this terminal is. createTab makes
    // the new tab active, so focus follows the new pane.
    const newId = await useTerminalStore.getState().createTab(source.cwd);
    set((state) => {
      nodeCounter += 1;
      const node: SplitNode = {
        type: 'split',
        id: `node-${nodeCounter}`,
        direction,
        sizes: [50, 50],
        first: { type: 'leaf', tabId },
        second: { type: 'leaf', tabId: newId },
      };
      const existing = findGroupForTab(state.groups, tabId);
      if (existing) {
        // Nest: the source leaf becomes a split node holding the
        // source and the new pane — the split lands beside the
        // source inside its group, at whatever depth it sits.
        return {
          groups: {
            ...state.groups,
            [existing.id]: { ...existing, root: replaceLeaf(existing.root, tabId, node) },
          },
        };
      }
      groupCounter += 1;
      const id = `split-${groupCounter}`;
      return {
        groups: {
          ...state.groups,
          [id]: { id, root: node },
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
      const leaves = groupTabIds(group);
      const idx = leaves.indexOf(tabId);
      const remaining = leaves.filter((id) => id !== tabId);
      if (wasActive && remaining.length > 0) {
        nextActive = remaining[Math.min(idx, remaining.length - 1)];
      }
      set((state) => {
        const groups = { ...state.groups };
        const current = groups[group.id];
        if (!current) return state;
        // Collapse the parent; a root that becomes one leaf
        // dissolves the group — the survivor is a normal tab.
        const root = removeLeaf(current.root, tabId);
        if (root === null || root.type === 'leaf') {
          delete groups[group.id];
        } else {
          groups[group.id] = { ...current, root };
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

  unsplitTab: (tabId) => {
    const group = findGroupForTab(get().groups, tabId);
    if (!group) return;
    // Snapshot the membership: each closePane mutates the group
    // (removing its tab, dissolving it at one pane left), so the
    // loop reads the original list, not the shrinking one.
    for (const id of groupTabIds(group)) {
      if (id !== tabId) get().closePane(id);
    }
  },

  focusPane: (tabId) => {
    useTerminalStore.getState().setActiveTab(tabId);
  },

  equalizeGroup: (groupId) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, root: equalizeSplitNode(group.root) },
        },
      };
    });
  },

  setSplitSizes: (groupId, nodeId, sizes) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      const node = findSplitNode(group, nodeId);
      if (!node || node.type !== 'split') return state;
      const clamped = sizes.map(clampPanePct) as [number, number];
      // Normalise to 100 on the larger pane; the drag helper
      // already conserves the sum, so this is a defensive fix-up
      // for direct callers, not the drag path.
      const total = clamped[0] + clamped[1];
      const residual = 100 - total;
      if (residual !== 0) {
        const largest = clamped[0] >= clamped[1] ? 0 : 1;
        clamped[largest] = clampPanePct(clamped[largest] + residual);
      }
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, root: setNodeSizes(group.root, nodeId, clamped) },
        },
      };
    });
  },

  resetForTests: () => {
    groupCounter = 0;
    nodeCounter = 0;
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
    const root = pruneSplitNode(group.root, liveIds);
    if (root === null || root.type === 'leaf') {
      // Nothing survives, or one pane left: the group dissolves,
      // the survivor is a normal tab — the entry is dropped.
      if (root !== group.root) changed = true;
      continue;
    }
    if (root !== group.root) changed = true;
    next[id] = root === group.root ? group : { ...group, root };
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
      const root = pruneSplitNode(group.root, liveIds);
      if (root !== null && root.type === 'split') {
        restored[id] = { ...group, root };
      }
    }
    stashedGroups = null;
    useSplitPaneStore.setState({ groups: restored });
  }
});
