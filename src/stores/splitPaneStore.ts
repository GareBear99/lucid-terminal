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
 * PANEAXIS TREE: a group is a binary
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
 * DETACH + REJOIN (Gary, 2026-11-15 — the split pair
 * conjoins until unsplit): detaching a pane's tab out of a
 * split drops it from the group (the prune subscription
 * below), but the split store stashes where it sat
 * (noteDetachedPane, recorded by the detach push listeners
 * before the tab leaves) and rejoinDetachedPane puts it back
 * at that exact position — same side, same direction, same
 * sizes — when the tab pops back in (called from every
 * addDetachedTab site). If the group dissolved while the pane
 * was out (a two-pane group), the stash rebuilds it beside
 * the surviving sibling; if the sibling is gone, the stash
 * is dropped and the pane stays a normal tab.
 *
 * Terminal view only: the editor, Files and AI panel never split.
 *
 * MAIN WINDOW ONLY: detached windows (MiniTerminal, `?mini=
 * terminal`) render one tab and show no split control — the split
 * button and ⌘D are main-window only. Detaching a pane's tab out
 * of a split drops it from the group (the prune subscription
 * below) and stashes its position (see DETACH + REJOIN above);
 * popping it back in rejoins it at that position.
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
 *
 * UNSPLIT, CHAINED (Gary, 2026-11-15 — one unsplit press wiped
 * all split progress, verified live): unsplitOneTab undoes
 * exactly the most recent split — the split node with the
 * highest node id (monotonic per window, so the newest node
 * is recoverable with no new state; its second child is
 * provably the leaf that split created — see the dissection,
 * ~/workspace/split-unsplit-dissection-2026-11-15.md) —
 * separating that pane from the group. N splits need N
 * presses to return to single terminals; the next press is a
 * no-op. UNSPLIT NEVER CLOSES A TAB (Gary, 2026-11-16 —
 * "unsplitting still deletes the pair instead of making it
 * an individual"): the separated pane keeps its PTY, feed
 * and cwd as a normal individual tab. The old chained design
 * closed the newest pane per press ("one press loses at most
 * one pane"); that was the bug — unsplitting separates, it
 * does not destroy. Collapse-all (unsplitAllTabs) dissolves
 * the whole group the same way: every pane becomes an
 * individual tab, nothing closes. There is no close ask for
 * unsplitting any more — nothing is destroyed, so nothing
 * needs confirming. */

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

/**
 * Where a detached pane sat (P3): everything rejoin needs
 * to put it back at its recorded position. `siblingLeafIds`
 * are the other child's leaves in visible order (one id
 * when the sibling is a single pane); `siblingNodeId` is
 * the other child's node id when it is a split node
 * (a subtree), else null. `side` is which side of the
 * parent node the detached pane occupied; `direction` and
 * `sizes` are the parent node's, so the rejoin restores the
 * exact proportions. Module-level, like the guest stash —
 * session-only, never persisted.
 */
export interface DetachedPaneStash {
  siblingLeafIds: string[];
  siblingNodeId: string | null;
  side: 'first' | 'second';
  direction: SplitDirection;
  sizes: [number, number];
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
   * Undo ONE split in a tab's group (chained unsplit, Gary
   * 2026-11-15; preservation, Gary 2026-11-16): separate
   * exactly the pane the most recent split created — the
   * newest split node's second leaf — from the group, and
   * collapse that node to its first child, so the previous
   * layout is restored exactly (every surviving pane keeps
   * its size, position, PTY, feed and cwd). The separated
   * pane is NOT closed — it keeps its PTY, feed and cwd as
   * a normal individual tab (unsplit separates, it does not
   * destroy). Returns the separated tab id, or null when
   * there is nothing to undo (no group, or no split node).
   * Focus never moves: the separated pane, if active, stays
   * the active tab (it is still there, just individual);
   * otherwise the active tab is untouched. N splits need N
   * presses to return to single terminals; the next press
   * is a no-op, never an error.
   */
  unsplitOneTab: (tabId: string) => string | null;
  /**
   * Unsplit ALL of a tab's group (Gary 2026-11-16): dissolve
   * the group — every pane becomes a normal individual tab.
   * Nothing is closed: every pane keeps its PTY, feed and
   * cwd. The old collapse-all closed every pane but one
   * (behind a close ask); that was the same deletion bug as
   * unsplitOneTab, so the ask is gone with it — there is
   * nothing destructive left to confirm. A tab in no group
   * is a no-op, never an error. Focus stays on this tab.
   */
  unsplitAllTabs: (tabId: string) => void;
  /**
   * Record where a pane sat before it is detached
   * (P3): the detach push listeners call this before the
   * tab leaves, so the prune subscription's collapse does
   * not lose the position. A tab in no group is a no-op.
   */
  noteDetachedPane: (tabId: string) => void;
  /**
   * Put a popped-back pane back into its split (P3): the
   * addDetachedTab sites call this right after the tab
   * lands. No stash, or no live sibling, is a no-op — the
   * pane stays a normal tab.
   */
  rejoinDetachedPane: (tabId: string) => void;
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
 * The first split group NOT containing `tabId`, in strip order
 * of each group's first leaf (audit item iv, 2026-11-16): the
 * old code named `Object.values(splitGroups)[0]` — the record's
 * insertion order, which is arbitrary when several groups exist
 * and can name a group the user is not asking about. Strip
 * order is the order the user sees in the tab bar, so the
 * named group is the leftmost split group that is not this
 * tab's own. Null when no other group exists. `stripIndex`
 * maps tab id → strip position; tabs missing from it sort
 * last (they cannot be first leaves of a visible group).
 */
export function findFirstOtherGroup(
  groups: Record<string, SplitGroup>,
  tabId: string,
  stripIndex: Map<string, number>,
): SplitGroup | null {
  const others = Object.values(groups).filter(
    (group) => !groupTabIds(group).includes(tabId),
  );
  if (others.length === 0) return null;
  others.sort((a, b) => {
    const aFirst = splitNodeTabIds(a.root)[0];
    const bFirst = splitNodeTabIds(b.root)[0];
    const aIdx = aFirst === undefined ? Number.MAX_SAFE_INTEGER : (stripIndex.get(aFirst) ?? Number.MAX_SAFE_INTEGER);
    const bIdx = bFirst === undefined ? Number.MAX_SAFE_INTEGER : (stripIndex.get(bFirst) ?? Number.MAX_SAFE_INTEGER);
    return aIdx - bIdx;
  });
  return others[0] ?? null;
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
 * Render order for App.tsx's tab map (P11, 2026-11-15):
 * EVERY split group's leaves first (group order is the
 * split order, which can differ from strip order when a
 * middle pane is split again), then every other tab in
 * strip order. Groups are ordered by their first leaf's
 * strip position. The order depends only on the groups and
 * the strip — never on which tab is active — so clicking
 * off a split tab and back never reshuffles the strip (the
 * old rule put only the ACTIVE tab's group first, so ⌘1–⌘9
 * retargeted on every click off and back). With no split
 * this returns the tabs unchanged.
 */
export function orderTabsForRender(
  tabs: TerminalTab[],
  groups: Record<string, SplitGroup>,
): TerminalTab[] {
  if (Object.keys(groups).length === 0) return tabs;
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const stripIndex = new Map(tabs.map((t, i) => [t.id, i]));
  const ordered: TerminalTab[] = [];
  const seen = new Set<string>();
  const groupsInStripOrder = Object.values(groups).sort((a, b) => {
    const aFirst = splitNodeTabIds(a.root)[0];
    const bFirst = splitNodeTabIds(b.root)[0];
    return (stripIndex.get(aFirst) ?? 0) - (stripIndex.get(bFirst) ?? 0);
  });
  for (const group of groupsInStripOrder) {
    for (const id of groupTabIds(group)) {
      const tab = byId.get(id);
      if (tab && !seen.has(id)) {
        ordered.push(tab);
        seen.add(id);
      }
    }
  }
  for (const tab of tabs) {
    if (!seen.has(tab.id)) ordered.push(tab);
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

/**
 * Tree surgery (pure, exported for tests). Replace the split
 * node with `nodeId` by `replacement`, returning a new tree —
 * the old tree is never mutated. The rejoin path uses it to
 * put a detached pane back beside a whole subtree (the
 * sibling the pane sat next to), where replaceLeaf can only
 * target one leaf. Returns the node unchanged when the id is
 * not under it, and a leaf unchanged.
 */
export function replaceSplitNode(
  node: SplitNode,
  nodeId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === 'split' && node.id === nodeId) return replacement;
  if (node.type === 'leaf') return node;
  const first = replaceSplitNode(node.first, nodeId, replacement);
  const second = replaceSplitNode(node.second, nodeId, replacement);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

/**
 * The parent split node of the leaf holding `tabId`, with
 * which side the leaf sits on (pure, exported for tests).
 * Null when the tab is not a leaf under a split node (the
 * tree is a single leaf). The detach stash reads it.
 */
export function findParentSplitNode(
  node: SplitNode,
  tabId: string,
): { node: Extract<SplitNode, { type: 'split' }>; side: 'first' | 'second' } | null {
  if (node.type === 'leaf') return null;
  if (node.first.type === 'leaf' && node.first.tabId === tabId) return { node, side: 'first' };
  if (node.second.type === 'leaf' && node.second.tabId === tabId) return { node, side: 'second' };
  return findParentSplitNode(node.first, tabId) ?? findParentSplitNode(node.second, tabId);
}

/** The numeric part of a split node id (`node-12` → 12). */
function splitNodeNumber(id: string): number {
  return Number(id.replace(/^node-/, ''));
}

/**
 * The most recent split node in a group — the split node with
 * the highest node id (pure, exported for tests). Node ids are
 * monotonic per window (splitTab increments the module counter
 * once per split), so the highest id is the split made most
 * recently. Null when the group has no split node (a single
 * leaf — a group is always split in practice, but the caller
 * must not assume it).
 */
export function findNewestSplitNode(group: SplitGroup): SplitNode | null {
  let newest: SplitNode | null = null;
  let newestNum = -1;
  const walk = (node: SplitNode): void => {
    if (node.type !== 'split') return;
    const num = splitNodeNumber(node.id);
    if (Number.isFinite(num) && num > newestNum) {
      newestNum = num;
      newest = node;
    }
    walk(node.first);
    walk(node.second);
  };
  walk(group.root);
  return newest;
}

/**
 * Tree surgery (pure, exported for tests). Replace the split
 * node with `nodeId` by its `first` child — the pane (or
 * subtree) that existed before that split — returning a new
 * tree. The node itself is dropped with its `second` child
 * (the pane that split created); the caller closes that pane.
 * When the named node is the root, the result is its first
 * child directly (a leaf when the group had two panes — the
 * caller dissolves the group then, the same rule removeLeaf
 * uses). Returns the node unchanged when the id is not under
 * it, and a leaf unchanged.
 */
export function collapseSplitNode(node: SplitNode, nodeId: string): SplitNode {
  if (node.type === 'leaf') return node;
  if (node.id === nodeId) return node.first;
  const first = collapseSplitNode(node.first, nodeId);
  const second = collapseSplitNode(node.second, nodeId);
  // Nothing under this node changed: return the same
  // reference, so callers that compare references (the
  // prune subscription's `changed` check, and tests) see
  // no change.
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
 * A rectangle in the terminal container, as fractions of the
 * container (0..1). The stable-homes layout (2026-11-16) positions
 * every pane's home div absolutely from these fractions.
 */
export interface SplitLayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One split divider's geometry: its node, direction, and the
 *  node's own rect (fractions) — the drag measures against the
 *  node's pixel size, which is the node rect × the container. */
export interface SplitLayoutDivider {
  nodeId: string;
  direction: SplitDirection;
  /** The split node's own rect (fractions of the container). */
  nodeRect: SplitLayoutRect;
  /** The boundary position within the node rect (0..1) — the
   *  first child's share (sizes[0] / 100). */
  boundary: number;
}

/** The flat layout of a split group: every leaf's rect and every
 *  divider's geometry, all as fractions of the container. */
export interface SplitLayout {
  leaves: Map<string, SplitLayoutRect>;
  dividers: SplitLayoutDivider[];
}

/**
 * The flat layout of a PaneAxis tree (pure, exported for tests).
 * Walks the tree once, dividing each split node's rect by its
 * direction and sizes: a vertical node splits its width (side by
 * side), a horizontal node its height (stacked). Each leaf gets
 * its rect; each split node contributes one divider at its
 * boundary. Fractions sum exactly: the second child's share is
 * the complement of the first, so no rounding drift.
 *
 * STABLE PANE HOMES (2026-11-16, audit item i): App renders
 * every tab's <Terminal> in ONE home div that is always a direct
 * child of the terminal container, positioned absolutely from
 * this layout. A tab never changes React parents — joining or
 * leaving a group only changes its home's rect / visibility —
 * so its Terminal never remounts and its xterm scrollback,
 * composer draft and current-block ref survive tree surgery.
 * The nested-flex SplitPaneTree is gone: it moved panes between
 * the tree's leaf divs and the flat host divs, remounting every
 * pane on every join/leave.
 */
export function computeSplitLayout(root: SplitNode): SplitLayout {
  const leaves = new Map<string, SplitLayoutRect>();
  const dividers: SplitLayoutDivider[] = [];
  const walk = (node: SplitNode, rect: SplitLayoutRect): void => {
    if (node.type === 'leaf') {
      leaves.set(node.tabId, rect);
      return;
    }
    const firstShare = node.sizes[0] / 100;
    if (node.direction === 'vertical') {
      const w1 = rect.width * firstShare;
      walk(node.first, { left: rect.left, top: rect.top, width: w1, height: rect.height });
      walk(node.second, {
        left: rect.left + w1,
        top: rect.top,
        width: rect.width - w1,
        height: rect.height,
      });
    } else {
      const h1 = rect.height * firstShare;
      walk(node.first, { left: rect.left, top: rect.top, width: rect.width, height: h1 });
      walk(node.second, {
        left: rect.left,
        top: rect.top + h1,
        width: rect.width,
        height: rect.height - h1,
      });
    }
    dividers.push({ nodeId: node.id, direction: node.direction, nodeRect: rect, boundary: firstShare });
  };
  walk(root, { left: 0, top: 0, width: 1, height: 1 });
  return { leaves, dividers };
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

/** Detached-pane positions (P3): keyed by the detached tab id. */
let detachedPanes: Record<string, DetachedPaneStash> = {};

export const useSplitPaneStore = create<SplitPaneState>((set, get) => ({
  groups: {},

  splitTab: async (tabId, direction = 'vertical') => {
    const source = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
    if (!source) return null;
    // A new PTY, in the source tab's cwd — a split of this
    // terminal starts where this terminal is. createTab makes
    // the new tab active, so focus follows the new pane.
    const newId = await useTerminalStore.getState().createTab(source.cwd);
    // The source can die while createTab awaits (its PTY is
    // created in main; the user can × the source tab, or a
    // bulk close can take it, before this resumes). Writing
    // the node then would leave a dead leaf — a blank
    // half-pane with no session (P6, 2026-11-15). Re-check
    // both tabs synchronously: if the source is gone, the
    // new tab is an orphan the user never asked for, so it
    // is closed and the split is a no-op; if the new tab is
    // gone, there is nothing to group. The check-then-set is
    // synchronous, so nothing can interleave between it and
    // the write below.
    // The source's id alone is NOT enough: closeTab frees
    // the tab number synchronously, so a source that died
    // mid-flight has its number reused by a later tab — and
    // an id-liveness check alone would pass with a node
    // holding the same id twice. A new tab can never take a
    // live tab's id (its number is in use), so newId ===
    // tabId proves the source died. (createTab reserves its
    // number synchronously before the await, so the reuse
    // cannot happen through this path today — the guard
    // stays as the belt to the liveness check's braces,
    // because the hazard is real if that order ever changes.)
    const live = useTerminalStore.getState().tabs;
    if (newId === tabId || !live.some((t) => t.id === tabId)) {
      if (live.some((t) => t.id === newId)) {
        useTerminalStore.getState().closeTab(newId);
      }
      return null;
    }
    if (!live.some((t) => t.id === newId)) return null;
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

  unsplitOneTab: (tabId) => {
    const group = findGroupForTab(get().groups, tabId);
    if (!group) return null;
    const newest = findNewestSplitNode(group);
    // The newest node's second child is provably the leaf
    // that split created (see the dissection §10): any later
    // split of that leaf would have created a newer node.
    // The guards are defensive — the invariant test locks
    // them, and a violation must be a no-op, never a
    // wrong-pane separation.
    if (!newest || newest.type !== 'split' || newest.second.type !== 'leaf') return null;
    const separatedTabId = newest.second.tabId;
    set((state) => {
      const groups = { ...state.groups };
      const current = groups[group.id];
      if (!current) return state;
      // Collapse the node: its first child takes its place
      // in the tree (the same collapse rule removeLeaf
      // uses); a root that becomes one leaf dissolves the
      // group — the survivor is a normal tab.
      const root = collapseSplitNode(current.root, newest.id);
      if (root.type === 'leaf') {
        delete groups[group.id];
      } else {
        groups[group.id] = { ...current, root };
      }
      return { groups };
    });
    // The separated pane is NOT closed (Gary, 2026-11-16):
    // it keeps its PTY, feed and cwd as a normal individual
    // tab — unsplit separates, it does not destroy. Focus
    // never moves: the separated pane, if active, stays the
    // active tab; otherwise the active tab is untouched.
    return separatedTabId;
  },

  unsplitAllTabs: (tabId) => {
    const group = findGroupForTab(get().groups, tabId);
    if (!group) return;
    // Dissolve the group: every pane becomes a normal
    // individual tab. Nothing is closed — every pane keeps
    // its PTY, feed and cwd (Gary, 2026-11-16). Focus stays
    // on this tab.
    set((state) => {
      const groups = { ...state.groups };
      delete groups[group.id];
      return { groups };
    });
  },

  noteDetachedPane: (tabId) => {
    const group = findGroupForTab(get().groups, tabId);
    if (!group) return;
    const parent = findParentSplitNode(group.root, tabId);
    if (!parent) return;
    const sibling = parent.side === 'first' ? parent.node.second : parent.node.first;
    detachedPanes[tabId] = {
      siblingLeafIds: splitNodeTabIds(sibling),
      siblingNodeId: sibling.type === 'split' ? sibling.id : null,
      side: parent.side,
      direction: parent.node.direction,
      sizes: [...parent.node.sizes] as [number, number],
    };
  },

  rejoinDetachedPane: (tabId) => {
    const stash = detachedPanes[tabId];
    if (!stash) return;
    // Consumed on first attempt — a stale stash must never
    // rejoin a later tab that reused the id.
    delete detachedPanes[tabId];
    const state = get();
    if (findGroupForTab(state.groups, tabId)) return;
    const live = useTerminalStore.getState().tabs;
    if (!live.some((t) => t.id === tabId)) return;
    // A live sibling leaf decides where the pane lands:
    // the first recorded sibling leaf still in a group wins
    // (its group is the one to rejoin); with no group, the
    // first live sibling leaf is the one to rebuild beside.
    let group: SplitGroup | null = null;
    let siblingLeafId: string | null = null;
    for (const id of stash.siblingLeafIds) {
      const g = findGroupForTab(state.groups, id);
      if (g) {
        group = g;
        siblingLeafId = id;
        break;
      }
    }
    if (!group) {
      siblingLeafId = stash.siblingLeafIds.find((id) => live.some((t) => t.id === id)) ?? null;
    }
    if (!siblingLeafId) return;
    const detachedLeaf: SplitNode = { type: 'leaf', tabId };
    const siblingLeaf: SplitNode = { type: 'leaf', tabId: siblingLeafId };
    nodeCounter += 1;
    const node: SplitNode = {
      type: 'split',
      id: `node-${nodeCounter}`,
      direction: stash.direction,
      sizes: stash.sizes,
      first: stash.side === 'first' ? detachedLeaf : siblingLeaf,
      second: stash.side === 'first' ? siblingLeaf : detachedLeaf,
    };
    if (group) {
      // The sibling sat beside a whole subtree: put the pane
      // back beside that subtree, at the recorded position,
      // with the recorded proportions. When the subtree is
      // gone (it collapsed while the pane was out), fall back
      // to rejoining beside the sibling leaf itself — the pane
      // lands next to its sibling, the group intact, no
      // session lost.
      const groupId = group.id;
      const leafId = siblingLeafId;
      if (!leafId) return;
      const siblingNodeId = stash.siblingNodeId;
      set((s) => {
        const current = s.groups[groupId];
        if (!current) return s;
        let root = current.root;
        let replacement: SplitNode = node;
        if (siblingNodeId) {
          const subtree = findSplitNode(current, siblingNodeId);
          if (subtree) {
            replacement = {
              ...node,
              first: stash.side === 'first' ? detachedLeaf : subtree,
              second: stash.side === 'first' ? subtree : detachedLeaf,
            };
            root = replaceSplitNode(root, siblingNodeId, replacement);
          } else {
            root = replaceLeaf(root, leafId, node);
          }
        } else {
          root = replaceLeaf(root, leafId, node);
        }
        if (root === current.root) return s;
        return { groups: { ...s.groups, [groupId]: { ...current, root } } };
      });
      return;
    }
    // The group dissolved while the pane was out (the
    // two-pane case): rebuild it beside the surviving
    // sibling, at the recorded position and proportions.
    groupCounter += 1;
    const id = `split-${groupCounter}`;
    set((s) => ({
      groups: { ...s.groups, [id]: { id, root: node } },
    }));
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
    detachedPanes = {};
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
  // A detach stash whose sibling leaves are all gone can
  // never rejoin (P3): drop it, so a later tab reusing the
  // id is never rejoined into a group it never sat in.
  for (const [tabId, stash] of Object.entries(detachedPanes)) {
    if (!stash.siblingLeafIds.some((id) => liveIds.has(id))) {
      delete detachedPanes[tabId];
    }
  }
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
