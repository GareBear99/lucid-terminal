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
  findNewestSplitNode,
  collapseSplitNode,
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

describe('unsplitOneTab — chained unsplit (Gary, 2026-11-15)', () => {
  test('one press removes exactly the newest pane; the rest, their PTYs and the group survive', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    const e = await useSplitPaneStore.getState().splitTab(a);
    // Focus follows the newest pane (e); one press removes e only.
    expect(useTerminalStore.getState().activeTabId).toBe(e);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    expect(stub.destroy).toHaveBeenCalledWith(e);
    expect(stub.destroy).not.toHaveBeenCalledWith(a);
    expect(stub.destroy).not.toHaveBeenCalledWith(c);
    expect(stub.destroy).not.toHaveBeenCalledWith(d);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, c, d]);
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toEqual([a, d, c]);
    // The survivors' layout is untouched — the previous
    // layout is restored exactly.
    expect(rootSizes(group)).toEqual([50, 50]);
    if (group.root.type === 'split' && group.root.first.type === 'split') {
      expect(group.root.first.sizes).toEqual([50, 50]);
    } else {
      throw new Error('expected a nested split node');
    }
    // Focus: the removed pane was active — focus lands on the
    // first leaf of the surviving subtree (a).
    expect(useTerminalStore.getState().activeTabId).toBe(a);
  });

  test('three presses on a 3-split group return to one terminal; the 4th press is a no-op', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    const e = await useSplitPaneStore.getState().splitTab(a);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, d, c]);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(d);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, c]);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(c);
    expect(groups()).toEqual({});
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a]);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBeNull();
    expect(stub.destroy).toHaveBeenCalledTimes(3);
    expect(stub.destroy).toHaveBeenCalledWith(e);
    expect(stub.destroy).toHaveBeenCalledWith(d);
    expect(stub.destroy).toHaveBeenCalledWith(c);
  });

  test('each press removes the most recent pane, not the focused one', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    const e = await useSplitPaneStore.getState().splitTab(a);
    // Focus the OLDEST pane — the press still removes the newest.
    useSplitPaneStore.getState().focusPane(a);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    expect(stub.destroy).toHaveBeenCalledWith(e);
    expect(stub.destroy).not.toHaveBeenCalledWith(a);
    expect(stub.destroy).not.toHaveBeenCalledWith(c);
    expect(stub.destroy).not.toHaveBeenCalledWith(d);
    // Focus does not move — the removed pane was not active.
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, d, c]);
  });

  test('removing the focused newest pane focuses the pane that was there before the split', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    // Focus is on c (the newest pane); unsplit removes c and
    // focus lands on a — the source pane, first leaf of the
    // surviving subtree.
    expect(useTerminalStore.getState().activeTabId).toBe(c);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(c);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(groups()).toEqual({});
  });

  test('focus lands on the surviving subtree, not the strip neighbour — nested case', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Tree [[a, d], c]; focus is on d (the newest pane). The
    // surviving subtree is leaf a — focus goes there, not to
    // c (the strip neighbour closePane would have picked).
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(d);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, c]);
  });

  test('mixed directions unwind in reverse creation order, layout restored at each step', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a, 'vertical');
    const d = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    const e = await useSplitPaneStore.getState().splitTab(c!, 'vertical');
    const group0 = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group0)).toEqual([a, d, c, e]);
    // Custom sizes, so the test can prove each step restores
    // the layout that existed before that split was made.
    const rootId = group0.root.type === 'split' ? group0.root.id : '';
    const innerId =
      group0.root.type === 'split' && group0.root.first.type === 'split'
        ? group0.root.first.id
        : '';
    useSplitPaneStore.getState().setSplitSizes(group0.id, rootId, [70, 30]);
    useSplitPaneStore.getState().setSplitSizes(group0.id, innerId, [60, 40]);
    // Press 1 undoes node-3: e goes, the tree is [[a, d], c]
    // with the root and inner sizes untouched.
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    const group1 = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group1)).toEqual([a, d, c]);
    expect(rootSizes(group1)).toEqual([70, 30]);
    expect(group1.root.type).toBe('split');
    if (group1.root.type === 'split') {
      expect(group1.root.direction).toBe('vertical');
      expect(group1.root.first.type).toBe('split');
      if (group1.root.first.type === 'split') {
        expect(group1.root.first.direction).toBe('horizontal');
        expect(group1.root.first.sizes).toEqual([60, 40]);
      }
    }
    // Press 2 undoes node-2: d goes, the tree is [a, c] vertical.
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(d);
    const group2 = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group2)).toEqual([a, c]);
    expect(rootSizes(group2)).toEqual([70, 30]);
    if (group2.root.type === 'split') expect(group2.root.direction).toBe('vertical');
    // Press 3 undoes node-1: c goes, the group dissolves.
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(c);
    expect(groups()).toEqual({});
  });

  test('two panes: one press dissolves the group, survivor is a normal tab; second press is a no-op', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    expect(useTerminalStore.getState().activeTabId).toBe(c);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(c);
    expect(groups()).toEqual({});
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a]);
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBeNull();
    expect(stub.destroy).toHaveBeenCalledTimes(1);
  });

  test('unsplit when not split is a no-op, never an error', async () => {
    const [a, b] = await makeTabs(2);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBeNull();
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);
    expect(groups()).toEqual({});
  });

  test('unsplit works in guest — a guest-made split unwinds one press at a time', async () => {
    const [a] = await makeTabs(1);
    useHistoryStore.getState().enterGuestSession();
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    const e = await useSplitPaneStore.getState().splitTab(a);
    expect(Object.keys(groups()).length).toBe(1);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, d, c]);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(d);
    expect(groupTabIds(findGroupForTab(groups(), a)!)).toEqual([a, c]);
    // Guest exit still drops whatever split remains.
    useHistoryStore.getState().exitGuestSession();
    expect(groups()).toEqual({});
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, c]);
  });

  test('equalize then unsplit: survivors keep their equalized shares; a second equalize re-equalizes', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(a);
    const e = await useSplitPaneStore.getState().splitTab(a);
    const group0 = findGroupForTab(groups(), a)!;
    useSplitPaneStore.getState().equalizeGroup(group0.id);
    // Four leaves: root 75/25 (3 vs 1), middle 66.67/33.33 (2 vs 1), inner 50/50.
    expect(rootSizes(findGroupForTab(groups(), a)!)).toEqual([75, 25]);
    expect(useSplitPaneStore.getState().unsplitOneTab(a)).toBe(e);
    // The survivors keep their equalized shares — the press
    // does not re-equalize or reset anything.
    const group1 = findGroupForTab(groups(), a)!;
    expect(rootSizes(group1)).toEqual([75, 25]);
    if (group1.root.type === 'split' && group1.root.first.type === 'split') {
      expect(group1.root.first.sizes).toEqual([66.67, 33.33]);
    } else {
      throw new Error('expected a nested split node');
    }
    // A second equalize re-equalizes the three survivors.
    useSplitPaneStore.getState().equalizeGroup(group1.id);
    const group2 = findGroupForTab(groups(), a)!;
    expect(rootSizes(group2)).toEqual([66.67, 33.33]);
    if (group2.root.type === 'split' && group2.root.first.type === 'split') {
      expect(group2.root.first.sizes).toEqual([50, 50]);
    } else {
      throw new Error('expected a nested split node');
    }
  });
});

describe('unsplitAllTabs — the explicit collapse-all', () => {
  test('closes every pane except the focused one, destroys their PTYs, group dissolves', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Focus follows the newest pane (d); collapse-all from d keeps d.
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    useSplitPaneStore.getState().unsplitAllTabs(d!);
    expect(stub.destroy).toHaveBeenCalledWith(a);
    expect(stub.destroy).toHaveBeenCalledWith(c);
    expect(stub.destroy).not.toHaveBeenCalledWith(d);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([d]);
    expect(groups()).toEqual({});
    expect(findGroupForTab(groups(), d!)).toBeNull();
    // Focus stays on the survivor.
    expect(useTerminalStore.getState().activeTabId).toBe(d);
  });

  test('unsplitAllTabs when not split is a no-op, never an error', async () => {
    const [a, b] = await makeTabs(2);
    useSplitPaneStore.getState().unsplitAllTabs(a);
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);
    expect(groups()).toEqual({});
  });
});

describe('unsplitAllAsk — the collapse-all ask', () => {
  test('requestUnsplitAll stages the ask with the pane count; confirm collapses all and clears it', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    // Focus is on d (the newest pane) — the ask is for d's group.
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    expect(useSplitPaneStore.getState().unsplitAllAsk).toBeNull();
    useSplitPaneStore.getState().requestUnsplitAll(d!);
    expect(useSplitPaneStore.getState().unsplitAllAsk).toEqual({ tabId: d, paneCount: 3 });
    // Nothing destroyed while the ask is pending.
    expect(stub.destroy).not.toHaveBeenCalled();
    useSplitPaneStore.getState().confirmUnsplitAll();
    expect(useSplitPaneStore.getState().unsplitAllAsk).toBeNull();
    expect(stub.destroy).toHaveBeenCalledWith(a);
    expect(stub.destroy).toHaveBeenCalledWith(c);
    expect(stub.destroy).not.toHaveBeenCalledWith(d);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([d]);
    expect(groups()).toEqual({});
  });

  test('dismissUnsplitAllAsk clears the ask and destroys nothing', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    useSplitPaneStore.getState().requestUnsplitAll(a);
    expect(useSplitPaneStore.getState().unsplitAllAsk).not.toBeNull();
    useSplitPaneStore.getState().dismissUnsplitAllAsk();
    expect(useSplitPaneStore.getState().unsplitAllAsk).toBeNull();
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(Object.keys(groups()).length).toBe(1);
  });

  test('requestUnsplitAll on a single pane is a no-op — no ask is staged', async () => {
    const [a] = await makeTabs(1);
    useSplitPaneStore.getState().requestUnsplitAll(a);
    expect(useSplitPaneStore.getState().unsplitAllAsk).toBeNull();
  });

  test('confirm/dismiss with no ask pending is a no-op, never an error', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    useSplitPaneStore.getState().confirmUnsplitAll();
    useSplitPaneStore.getState().dismissUnsplitAllAsk();
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(Object.keys(groups()).length).toBe(1);
  });
});

describe('findNewestSplitNode / collapseSplitNode', () => {
  test('findNewestSplitNode returns the highest-numbered split node, null for a single leaf', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    const group = findGroupForTab(groups(), a)!;
    const newest = findNewestSplitNode(group);
    expect(newest).not.toBeNull();
    expect(newest?.type).toBe('split');
    if (newest?.type === 'split') {
      expect(newest.id).toBe('node-2');
      expect(newest.second.type).toBe('leaf');
    }
    // A single leaf has no split node.
    expect(
      findNewestSplitNode({ id: 'split-9', root: { type: 'leaf', tabId: a } }),
    ).toBeNull();
  });

  test('collapseSplitNode replaces the named node with its first child, root included', () => {
    const leaf = (tabId: string) => ({ type: 'leaf' as const, tabId });
    const root = {
      type: 'split' as const,
      id: 'node-1',
      direction: 'vertical' as const,
      sizes: [50, 50] as [number, number],
      first: {
        type: 'split' as const,
        id: 'node-2',
        direction: 'horizontal' as const,
        sizes: [60, 40] as [number, number],
        first: leaf('terminal-1'),
        second: leaf('terminal-3'),
      },
      second: leaf('terminal-2'),
    };
    // Collapse the nested node: its first child takes its place.
    const collapsed = collapseSplitNode(root, 'node-2');
    expect(collapsed).toEqual({
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [50, 50],
      first: leaf('terminal-1'),
      second: leaf('terminal-2'),
    });
    // Collapse the root: the result is its first child directly.
    expect(collapseSplitNode(root, 'node-1')).toEqual(root.first);
    // Unknown id: unchanged (same reference).
    expect(collapseSplitNode(root, 'node-99')).toBe(root);
    // A leaf: unchanged.
    expect(collapseSplitNode(leaf('terminal-1'), 'node-1')).toEqual(leaf('terminal-1'));
    // The original tree is untouched.
    expect(root.first.type).toBe('split');
  });

  test('invariant: the newest split node’s second child is always a leaf — after splits, closes and detaches', async () => {
    const [a] = await makeTabs(1);
    const assertInvariant = () => {
      for (const group of Object.values(groups())) {
        const newest = findNewestSplitNode(group);
        if (newest && newest.type === 'split') {
          expect(newest.second.type).toBe('leaf');
        }
      }
    };
    const c = await useSplitPaneStore.getState().splitTab(a);
    assertInvariant();
    const d = await useSplitPaneStore.getState().splitTab(a, 'horizontal');
    assertInvariant();
    const e = await useSplitPaneStore.getState().splitTab(c!, 'vertical');
    assertInvariant();
    // A tab × close (closePane) shortens the chain — the
    // newest remaining node still has a leaf second child.
    useSplitPaneStore.getState().closePane(d!);
    assertInvariant();
    // Splitting again grows the chain from there.
    await useSplitPaneStore.getState().splitTab(a);
    assertInvariant();
    // A direct closeTab (prune path) also preserves it.
    useTerminalStore.getState().closeTab(e!);
    assertInvariant();
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
