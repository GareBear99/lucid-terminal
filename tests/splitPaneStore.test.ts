/**
 * Split pane store tests — sweep audit item 2 (2026-11-14).
 *
 * A split group is layout over tabs: each pane IS a tab (its own
 * PTY, its own feed, its own mode). splitTab creates a fresh tab
 * beside the source; closePane removes one pane and dissolves the
 * group at one pane left; sizes are percentages clamped to
 * 15–85%; groups are pruned when tabs close or detach, stashed
 * on guest enter and restored on exit.
 *
 * The store runs in node here (vitest `environment: 'node'`), so
 * `window.lucidAPI` is stubbed — createTab only calls it to
 * resolve the home dir and drive the main-process PTY, which the
 * stubs swallow (the terminalStore.test.ts pattern).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSplitPaneStore,
  findGroupForTab,
  findSplitNode,
  getVisibleTabIds,
  groupTabIds,
  orderTabsForRender,
  computePaneSizesAfterDrag,
  equalSizes,
  replaceLeaf,
  removeLeaf,
  pruneSplitNode,
  type SplitGroup,
} from '../src/stores/splitPaneStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';

const terminalStub = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
});

let stub: ReturnType<typeof terminalStub>;
let homeDir: ReturnType<typeof vi.fn>;

function resetAll() {
  // Close every tab through the store API so its number is released,
  // then clear any leftover state.
  const { tabs, closeTab } = useTerminalStore.getState();
  tabs.forEach((t) => closeTab(t.id));
  useTerminalStore.setState({ tabs: [], activeTabId: null, createErrors: {}, exitedTabs: {} });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useTerminalStore.getState().resetForTests();
  useSplitPaneStore.getState().resetForTests();
}

beforeEach(() => {
  stub = terminalStub();
  homeDir = vi.fn().mockResolvedValue('/home/test');
  vi.stubGlobal('window', {
    lucidAPI: {
      fs: { getHomeDir: homeDir },
      terminal: stub,
    },
  });
  resetAll();
});

afterEach(() => {
  resetAll();
});

async function makeTabs(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(await useTerminalStore.getState().createTab());
  }
  return ids;
}

const groups = () => useSplitPaneStore.getState().groups;

/** The root split node's sizes, or null when the group is a single leaf (it never is — a group is always split). */
const rootSizes = (group: SplitGroup): [number, number] | null =>
  group.root.type === 'split' ? group.root.sizes : null;

describe('splitTab', () => {
  test('splits a tab: a fresh tab with its own PTY beside it, 50/50, focus follows', async () => {
    const [a] = await makeTabs(1);
    const cwd = useTerminalStore.getState().tabs[0].cwd;
    const created = await useSplitPaneStore.getState().splitTab(a);
    expect(created).not.toBeNull();
    expect(created).not.toBe(a);
    // Its own PTY, in the source tab's cwd.
    expect(stub.create).toHaveBeenCalledWith(created, cwd);
    const group = findGroupForTab(groups(), a);
    expect(group).not.toBeNull();
    expect(groupTabIds(group!)).toEqual([a, created]);
    expect(rootSizes(group!)).toEqual([50, 50]);
    // Focus follows the new pane.
    expect(useTerminalStore.getState().activeTabId).toBe(created);
  });

  test('splitting a missing tab returns null and creates nothing', async () => {
    expect(await useSplitPaneStore.getState().splitTab('terminal-99')).toBeNull();
    expect(stub.create).not.toHaveBeenCalled();
    expect(groups()).toEqual({});
  });

  test('splitting a middle pane appends after it, in group order, equal sizes', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a);
    // The tree nests: splitting `a` again replaces its leaf with
    // a split node [a, d] inside the root [.., c] — the leaf order
    // is [a, d, c], and each node holds its own 50/50 pair.
    expect(groupTabIds(group!)).toEqual([a, d, c]);
    expect(rootSizes(group!)).toEqual([50, 50]);
    expect(group!.root.type).toBe('split');
    if (group!.root.type === 'split') {
      expect(group!.root.first.type).toBe('split');
      if (group!.root.first.type === 'split') {
        expect(group!.root.first.sizes).toEqual([50, 50]);
      }
    }
  });
});

describe('closePane', () => {
  test('closes one pane, destroys its PTY, group survives with equal sizes', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    useSplitPaneStore.getState().closePane(d!);
    expect(stub.destroy).toHaveBeenCalledWith(d);
    const group = findGroupForTab(groups(), a);
    expect(groupTabIds(group!)).toEqual([a, c]);
    expect(rootSizes(group!)).toEqual([50, 50]);
  });

  test('closing down to one pane dissolves the group — the survivor is a normal tab', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    useSplitPaneStore.getState().closePane(c!);
    expect(groups()).toEqual({});
    expect(findGroupForTab(groups(), a)).toBeNull();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a]);
  });

  test('closing the active pane focuses the pane that takes its place', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Focus is on the newest pane (d); close it — focus goes to the
    // pane that takes its place (c, the previous pane).
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    useSplitPaneStore.getState().closePane(d!);
    expect(useTerminalStore.getState().activeTabId).toBe(c);
    // Close the active first pane — focus goes to the next pane.
    useSplitPaneStore.getState().focusPane(a);
    useSplitPaneStore.getState().closePane(a);
    expect(useTerminalStore.getState().activeTabId).toBe(c);
  });

  test('closePane on a tab in no group closes it exactly like closeTab', async () => {
    const [a, b] = await makeTabs(2);
    useSplitPaneStore.getState().closePane(a);
    expect(stub.destroy).toHaveBeenCalledWith(a);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([b]);
    expect(groups()).toEqual({});
  });
});

describe('unsplitTab', () => {
  test('closes every pane except the focused one, destroys their PTYs, group dissolves', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Focus follows the newest pane (d); unsplit from d keeps d.
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    useSplitPaneStore.getState().unsplitTab(d!);
    expect(stub.destroy).toHaveBeenCalledWith(a);
    expect(stub.destroy).toHaveBeenCalledWith(c);
    expect(stub.destroy).not.toHaveBeenCalledWith(d);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([d]);
    expect(groups()).toEqual({});
    expect(findGroupForTab(groups(), d!)).toBeNull();
    // Focus stays on the survivor.
    expect(useTerminalStore.getState().activeTabId).toBe(d);
  });

  test('unsplit from a middle pane keeps that pane and closes the rest', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(a);
    useSplitPaneStore.getState().focusPane(c!);
    useSplitPaneStore.getState().unsplitTab(c!);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([c]);
    expect(groups()).toEqual({});
    expect(useTerminalStore.getState().activeTabId).toBe(c);
  });

  test('unsplit when not split is a no-op, never an error', async () => {
    const [a, b] = await makeTabs(2);
    useSplitPaneStore.getState().unsplitTab(a);
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);
    expect(groups()).toEqual({});
  });

  test('unsplit works in guest — a guest-made split unsplits to one pane', async () => {
    const [a] = await makeTabs(1);
    useHistoryStore.getState().enterGuestSession();
    const c = await useSplitPaneStore.getState().splitTab(a);
    expect(Object.keys(groups()).length).toBe(1);
    useSplitPaneStore.getState().unsplitTab(c!);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([c]);
    expect(groups()).toEqual({});
    useHistoryStore.getState().exitGuestSession();
  });
});

describe('setSplitSizes', () => {
  test('clamps each pane to 15–85 and normalises the pair to 100', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    const nodeId = group.root.type === 'split' ? group.root.id : '';
    useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [5, 95]);
    expect(rootSizes(findGroupForTab(groups(), a)!)).toEqual([15, 85]);
    useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [60, 60]);
    // Over 100: the residual lands on the first largest pane.
    expect(rootSizes(findGroupForTab(groups(), a)!)).toEqual([40, 60]);
  });

  test('wrong node or unknown group is a no-op', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    useSplitPaneStore.getState().setSplitSizes(group.id, 'node-99', [70, 30]);
    expect(rootSizes(findGroupForTab(groups(), a)!)).toEqual([50, 50]);
    useSplitPaneStore.getState().setSplitSizes('split-99', 'node-99', [70, 30]);
    expect(rootSizes(findGroupForTab(groups(), a)!)).toEqual([50, 50]);
  });

  test('sets one nested node without touching its parent', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    // Root [ [a, d], c ] — the inner node is the root's first child.
    expect(group.root.type).toBe('split');
    if (group.root.type !== 'split') return;
    expect(group.root.first.type).toBe('split');
    if (group.root.first.type !== 'split') return;
    const innerId = group.root.first.id;
    useSplitPaneStore.getState().setSplitSizes(group.id, innerId, [70, 30]);
    const after = findGroupForTab(groups(), a)!;
    expect(rootSizes(after)).toEqual([50, 50]);
    if (after.root.type === 'split' && after.root.first.type === 'split') {
      expect(after.root.first.sizes).toEqual([70, 30]);
    } else {
      throw new Error('expected a nested split node');
    }
  });
});

describe('PaneAxis nesting', () => {
  test('horizontal split stacks below: direction recorded, leaf order kept', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toEqual([a, c]);
    expect(group.root.type).toBe('split');
    if (group.root.type === 'split') {
      expect(group.root.direction).toBe('horizontal');
      expect(group.root.sizes).toEqual([50, 50]);
    }
  });

  test('a horizontal split inside a vertical split nests — a stack inside a column', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    const group = findGroupForTab(groups(), a)!;
    // Leaf order [a, d, c]: the inner node [a, d] sits left of c.
    expect(groupTabIds(group)).toEqual([a, d, c]);
    expect(group.root.type).toBe('split');
    if (group.root.type === 'split') {
      expect(group.root.direction).toBe('vertical');
      expect(group.root.first.type).toBe('split');
      if (group.root.first.type === 'split') {
        expect(group.root.first.direction).toBe('horizontal');
        expect(group.root.first.sizes).toEqual([50, 50]);
      }
    }
  });

  test('closing a pane in a nested node collapses its parent — the sibling takes its place', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    // Tree: root [ [a, d], c ]. Close d: the inner node collapses
    // to leaf a, the root becomes [a, c].
    useSplitPaneStore.getState().closePane(d!);
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toEqual([a, c]);
    expect(group.root.type).toBe('split');
    if (group.root.type === 'split') {
      expect(group.root.first.type).toBe('leaf');
      expect(group.root.second.type).toBe('leaf');
    }
    expect(stub.destroy).toHaveBeenCalledWith(d);
  });

  test('pruning a nested leaf collapses its parent node', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    // Close d directly (not via closePane): the prune
    // subscription collapses the inner node to leaf a.
    useTerminalStore.getState().closeTab(d!);
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toEqual([a, c]);
    expect(group.root.type).toBe('split');
    if (group.root.type === 'split') {
      expect(group.root.first.type).toBe('leaf');
    }
  });

  test('findSplitNode finds a nested node and returns null for a missing id', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    const group = findGroupForTab(groups(), a)!;
    if (group.root.type !== 'split' || group.root.first.type !== 'split') {
      throw new Error('expected a nested split node');
    }
    const inner = findSplitNode(group, group.root.first.id);
    expect(inner).not.toBeNull();
    expect(inner!.type).toBe('split');
    expect(findSplitNode(group, 'node-99')).toBeNull();
  });

  test('pure tree surgery: replaceLeaf nests, removeLeaf collapses, pruneSplitNode drops dead leaves', () => {
    const leaf = (tabId: string) => ({ type: 'leaf' as const, tabId });
    const root = {
      type: 'split' as const,
      id: 'node-1',
      direction: 'vertical' as const,
      sizes: [50, 50] as [number, number],
      first: leaf('terminal-1'),
      second: leaf('terminal-2'),
    };
    const nested = replaceLeaf(root, 'terminal-1', {
      type: 'split',
      id: 'node-2',
      direction: 'horizontal',
      sizes: [50, 50],
      first: leaf('terminal-1'),
      second: leaf('terminal-3'),
    });
    expect(nested.type).toBe('split');
    // The original tree is untouched — surgery returns new trees.
    expect(root.first).toEqual(leaf('terminal-1'));
    // Remove the middle leaf: its parent collapses to the sibling.
    const collapsed = removeLeaf(nested, 'terminal-3');
    expect(collapsed).toEqual(root);
    // Prune a dead leaf: the node collapses to the live sibling.
    const pruned = pruneSplitNode(nested, new Set(['terminal-1', 'terminal-2']));
    expect(pruned).toEqual({
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [50, 50],
      first: leaf('terminal-1'),
      second: leaf('terminal-2'),
    });
    // Prune everything: null.
    expect(pruneSplitNode(nested, new Set())).toBeNull();
  });
});

describe('pruning on tab lifecycle', () => {
  test('closing a tab directly (not via closePane) drops it from the group', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    useTerminalStore.getState().closeTab(d!);
    const group = findGroupForTab(groups(), a);
    expect(groupTabIds(group!)).toEqual([a, c]);
    useTerminalStore.getState().closeTab(c!);
    expect(groups()).toEqual({});
  });

  test('detaching a pane out of the window drops it from the group', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    useTerminalStore.getState().detachTab(a);
    expect(groups()).toEqual({});
    // The detached window closing that tab for real frees its
    // number (releaseTabNumber) — without this the module-level
    // number set leaks the detached tab's number into later tests.
    useTerminalStore.getState().releaseTabNumber(a);
  });

  test('a fresh tab reusing a dead tab id never inherits its split', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    // Close both tabs: the group dissolves with them.
    const { tabs, closeTab } = useTerminalStore.getState();
    tabs.forEach((t) => closeTab(t.id));
    expect(groups()).toEqual({});
    const fresh = await useTerminalStore.getState().createTab();
    expect(fresh).toBe('terminal-1');
    expect(findGroupForTab(groups(), fresh)).toBeNull();
  });
});

describe('guest veil', () => {
  test('guest enter stashes the groups and clears them; exit restores them', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    expect(Object.keys(groups()).length).toBe(1);
    useHistoryStore.getState().enterGuestSession();
    expect(groups()).toEqual({});
    useHistoryStore.getState().exitGuestSession();
    expect(Object.keys(groups()).length).toBe(1);
    expect(findGroupForTab(groups(), a)).not.toBeNull();
  });

  test('a split the guest makes is dropped on exit — the owner layout returns', async () => {
    const [a] = await makeTabs(1);
    useHistoryStore.getState().enterGuestSession();
    await useSplitPaneStore.getState().splitTab(a);
    expect(Object.keys(groups()).length).toBe(1);
    useHistoryStore.getState().exitGuestSession();
    expect(groups()).toEqual({});
  });

  test('a tab closed during the guest session does not come back in a group', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    useHistoryStore.getState().enterGuestSession();
    useTerminalStore.getState().closeTab(c!);
    useHistoryStore.getState().exitGuestSession();
    expect(groups()).toEqual({});
  });
});

describe('pure helpers', () => {
  test('getVisibleTabIds: unsplit is just the active tab; split is the whole group', async () => {
    const [a] = await makeTabs(1);
    expect(getVisibleTabIds(groups(), a)).toEqual([a]);
    expect(getVisibleTabIds(groups(), null)).toEqual([]);
    const c = await useSplitPaneStore.getState().splitTab(a);
    expect(getVisibleTabIds(groups(), a)).toEqual([a, c]);
    expect(getVisibleTabIds(groups(), c)).toEqual([a, c]);
  });

  test('orderTabsForRender: visible panes first in group order, then the rest in strip order', async () => {
    const [a, b] = await makeTabs(2);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Group order is [a, d, c]; strip order is [a, b, c, d].
    const tabs = useTerminalStore.getState().tabs;
    expect(orderTabsForRender(tabs, groups(), a).map((t) => t.id)).toEqual([a, d, c, b]);
    // No split: the strip order is unchanged.
    expect(orderTabsForRender(tabs, {}, b).map((t) => t.id)).toEqual([a, b, c, d]);
  });

  test('computePaneSizesAfterDrag moves one boundary and conserves the pair', () => {
    expect(computePaneSizesAfterDrag([50, 50], 0, 10)).toEqual([60, 40]);
    expect(computePaneSizesAfterDrag([50, 50], 0, -10)).toEqual([40, 60]);
    expect(computePaneSizesAfterDrag([50, 30, 20], 1, 10)).toEqual([50, 35, 15]);
    // Growing pane 1 by 10 would shrink pane 2 to 10 — below the
    // 15% floor — so the drag stops at +5 (35/15).
    // Clamps: the left pane cannot pass 85, the right cannot pass 15.
    expect(computePaneSizesAfterDrag([50, 50], 0, 60)).toEqual([85, 15]);
    expect(computePaneSizesAfterDrag([50, 50], 0, -60)).toEqual([15, 85]);
    // Out-of-range boundary returns a copy, unchanged.
    expect(computePaneSizesAfterDrag([50, 50], 1, 10)).toEqual([50, 50]);
    expect(computePaneSizesAfterDrag([50, 50], -1, 10)).toEqual([50, 50]);
  });

  test('equalSizes sums to (within a hundredth of) 100', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const sizes = equalSizes(n);
      expect(sizes).toHaveLength(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    }
  });
});
