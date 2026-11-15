/**
 * Split equalize tests (Gary, 2026-11-15 — the equal size button
 * in the tab bar).
 *
 * Pressing the button resets every split node's sizes so all
 * panes get an equal share (leaf-count-proportional — a flat
 * 50/50 at every node would leave a right-deep 4-pane tree at
 * 50/25/12.5/12.5, not equal). Membership, order, sessions and
 * content are untouched — only the ratios. The action is scoped
 * by group id: equalizing one group never touches another
 * group — and each window owns its own store instance, so a
 * main-window press never touches a detached window's panes
 * and a detached window's press never touches the main
 * window's. Equal shares are exact, without the 15–85% drag
 * clamp (with 7+ panes an equal share is below 15%).
 *
 * Same node-environment pattern as splitPaneStore.test.ts:
 * `window.lucidAPI` is stubbed; createTab only calls it to
 * resolve the home dir and drive the main-process PTY, which
 * the stubs swallow.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSplitPaneStore,
  findGroupForTab,
  groupTabIds,
  equalizeSplitNode,
  countSplitLeaves,
  type SplitGroup,
  type SplitNode,
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

/** Split the active tab (focus follows the new pane, so chaining
 *  this nests right-deep: [a | [b | [c | ...]]]). */
async function splitActive(direction?: 'vertical' | 'horizontal'): Promise<string> {
  const active = useTerminalStore.getState().activeTabId;
  expect(active).not.toBeNull();
  const created = await useSplitPaneStore.getState().splitTab(active!, direction);
  expect(created).not.toBeNull();
  return created!;
}

const groups = () => useSplitPaneStore.getState().groups;

/** Every split node's id in a group, in tree order. */
function splitNodeIds(group: SplitGroup): string[] {
  const ids: string[] = [];
  const walk = (node: SplitNode) => {
    if (node.type === 'split') {
      ids.push(node.id);
      walk(node.first);
      walk(node.second);
    }
  };
  walk(group.root);
  return ids;
}

/**
 * Each leaf's share of the total width/height, from the node's
 * sizes: a vertical node splits width, a horizontal node splits
 * height. This is what the panes actually render at.
 */
function leafShares(
  node: SplitNode,
  w = 100,
  h = 100,
): Map<string, { w: number; h: number }> {
  const out = new Map<string, { w: number; h: number }>();
  const walk = (n: SplitNode, cw: number, ch: number) => {
    if (n.type === 'leaf') {
      out.set(n.tabId, { w: cw, h: ch });
      return;
    }
    if (n.direction === 'vertical') {
      walk(n.first, (cw * n.sizes[0]) / 100, ch);
      walk(n.second, (cw * n.sizes[1]) / 100, ch);
    } else {
      walk(n.first, cw, (ch * n.sizes[0]) / 100);
      walk(n.second, cw, (ch * n.sizes[1]) / 100);
    }
  };
  walk(node, w, h);
  return out;
}

const closeTo = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 2);

describe('equalizeSplitNode (pure)', () => {
  test('a leaf is unchanged', () => {
    const leaf: SplitNode = { type: 'leaf', tabId: 'terminal-1' };
    expect(equalizeSplitNode(leaf)).toEqual(leaf);
    expect(countSplitLeaves(leaf)).toBe(1);
  });

  test('a flat 50/50 node stays 50/50', () => {
    const node: SplitNode = {
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [50, 50],
      first: { type: 'leaf', tabId: 'terminal-1' },
      second: { type: 'leaf', tabId: 'terminal-2' },
    };
    expect(equalizeSplitNode(node).type).toBe('split');
    const out = equalizeSplitNode(node);
    if (out.type === 'split') expect(out.sizes).toEqual([50, 50]);
  });

  test('a right-deep 4-pane tree becomes 25/75, 33.33/66.67, 50/50 — 25% a leaf', () => {
    // [a | [b | [c | d]]], all dragged to 80/20 first.
    const d: SplitNode = { type: 'leaf', tabId: 'terminal-4' };
    const c: SplitNode = { type: 'leaf', tabId: 'terminal-3' };
    const b: SplitNode = { type: 'leaf', tabId: 'terminal-2' };
    const a: SplitNode = { type: 'leaf', tabId: 'terminal-1' };
    const node3: SplitNode = {
      type: 'split', id: 'node-3', direction: 'vertical', sizes: [80, 20], first: c, second: d,
    };
    const node2: SplitNode = {
      type: 'split', id: 'node-2', direction: 'vertical', sizes: [80, 20], first: b, second: node3,
    };
    const root: SplitNode = {
      type: 'split', id: 'node-1', direction: 'vertical', sizes: [80, 20], first: a, second: node2,
    };
    const out = equalizeSplitNode(root);
    expect(out.type).toBe('split');
    if (out.type !== 'split') return;
    expect(out.sizes).toEqual([25, 75]);
    expect(out.first).toEqual(a);
    expect(out.second.type).toBe('split');
    if (out.second.type === 'split') {
      expect(out.second.sizes).toEqual([33.33, 66.67]);
      if (out.second.second.type === 'split') {
        expect(out.second.second.sizes).toEqual([50, 50]);
      }
    }
    // Every leaf an equal share of the total width.
    const shares = leafShares(out);
    for (const tabId of ['terminal-1', 'terminal-2', 'terminal-3', 'terminal-4']) {
      closeTo(shares.get(tabId)!.w, 25);
    }
  });
});

describe('equalizeGroup', () => {
  test('2 panes dragged uneven come back to 50/50', async () => {
    const [a] = await makeTabs(1);
    await splitActive();
    const group = findGroupForTab(groups(), a)!;
    const [rootId] = splitNodeIds(group);
    useSplitPaneStore.getState().setSplitSizes(group.id, rootId, [70, 30]);
    expect(findGroupForTab(groups(), a)!.root.type).toBe('split');
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const after = findGroupForTab(groups(), a)!;
    expect(after.root.type).toBe('split');
    if (after.root.type === 'split') expect(after.root.sizes).toEqual([50, 50]);
  });

  test('3 nested panes become equal thirds', async () => {
    const [a] = await makeTabs(1);
    await splitActive();
    await splitActive();
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toHaveLength(3);
    for (const nodeId of splitNodeIds(group)) {
      useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [80, 20]);
    }
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const shares = leafShares(findGroupForTab(groups(), a)!.root);
    expect(shares.size).toBe(3);
    for (const { w } of shares.values()) closeTo(w, 100 / 3);
  });

  test('4 nested panes (Gary’s screenshot) become equal quarters — membership and order untouched', async () => {
    const [a] = await makeTabs(1);
    await splitActive();
    await splitActive();
    await splitActive();
    const group = findGroupForTab(groups(), a)!;
    const before = groupTabIds(group);
    expect(before).toHaveLength(4);
    for (const nodeId of splitNodeIds(group)) {
      useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [80, 20]);
    }
    // Unequal before: the leftmost pane holds 80% of the width.
    const beforeShares = leafShares(findGroupForTab(groups(), a)!.root);
    closeTo(beforeShares.get(before[0])!.w, 80);
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const after = findGroupForTab(groups(), a)!;
    // Same panes, same order, same sessions — only ratios changed.
    expect(groupTabIds(after)).toEqual(before);
    const shares = leafShares(after.root);
    for (const { w } of shares.values()) closeTo(w, 25);
  });

  test('a balanced 4-pane tree becomes equal quarters', async () => {
    const [a] = await makeTabs(1);
    await splitActive(); // [a, b]
    await splitActive(); // [a, [b, c]]
    // Split `a` again: [[a, d], [b, c]] — balanced.
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toHaveLength(4);
    for (const nodeId of splitNodeIds(group)) {
      useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [70, 30]);
    }
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const shares = leafShares(findGroupForTab(groups(), a)!.root);
    for (const { w } of shares.values()) closeTo(w, 25);
  });

  test('a horizontal split nested in a vertical one equalizes per axis', async () => {
    const [a] = await makeTabs(1);
    await splitActive(); // [a | b], vertical
    await splitActive('horizontal'); // [a | [b over c]]
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toHaveLength(3);
    for (const nodeId of splitNodeIds(group)) {
      useSplitPaneStore.getState().setSplitSizes(group.id, nodeId, [80, 20]);
    }
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const shares = leafShares(findGroupForTab(groups(), a)!.root);
    // The vertical split divides by pane count (1 vs 2), so
    // the lone pane takes 33.33% of the width and the stacked
    // pair spans the other 66.67% — equal shares per split,
    // not equal leaf areas in a mixed tree. The stacked pair
    // splits its column's height equally; the lone pane keeps
    // full height.
    const ids = groupTabIds(group);
    closeTo(shares.get(ids[0])!.w, 100 / 3);
    closeTo(shares.get(ids[1])!.w, 200 / 3);
    closeTo(shares.get(ids[2])!.w, 200 / 3);
    closeTo(shares.get(ids[0])!.h, 100);
    closeTo(shares.get(ids[1])!.h, 50);
    closeTo(shares.get(ids[2])!.h, 50);
  });

  test('equalizing one group never touches another group (per-window isolation)', async () => {
    const [a, b] = await makeTabs(2);
    await useSplitPaneStore.getState().splitTab(a);
    await useSplitPaneStore.getState().splitTab(b);
    const groupA = findGroupForTab(groups(), a)!;
    const groupB = findGroupForTab(groups(), b)!;
    expect(groupA.id).not.toBe(groupB.id);
    const [rootA] = splitNodeIds(groupA);
    const [rootB] = splitNodeIds(groupB);
    useSplitPaneStore.getState().setSplitSizes(groupA.id, rootA, [70, 30]);
    useSplitPaneStore.getState().setSplitSizes(groupB.id, rootB, [70, 30]);
    useSplitPaneStore.getState().equalizeGroup(groupA.id);
    const afterA = findGroupForTab(groups(), a)!;
    const afterB = findGroupForTab(groups(), b)!;
    if (afterA.root.type === 'split') expect(afterA.root.sizes).toEqual([50, 50]);
    // The other group is untouched — the shape a detached
    // window's panes take: a press in one window never reaches
    // another window's groups.
    if (afterB.root.type === 'split') expect(afterB.root.sizes).toEqual([70, 30]);
  });

  test('an unknown group id is a no-op', async () => {
    const [a] = await makeTabs(1);
    await splitActive();
    const before = groups();
    useSplitPaneStore.getState().equalizeGroup('split-99');
    expect(groups()).toEqual(before);
  });

  test('7 panes get exact equal shares — the drag clamp is not applied', async () => {
    const [a] = await makeTabs(1);
    for (let i = 0; i < 6; i++) await splitActive();
    const group = findGroupForTab(groups(), a)!;
    expect(groupTabIds(group)).toHaveLength(7);
    useSplitPaneStore.getState().equalizeGroup(group.id);
    const shares = leafShares(findGroupForTab(groups(), a)!.root);
    for (const { w } of shares.values()) closeTo(w, 100 / 7);
    // The root pair proves the clamp was bypassed: 1/7 is
    // 14.29% (below the 15% drag minimum) and 6/7 is 85.71%
    // (above the 85% drag maximum).
    const root = findGroupForTab(groups(), a)!.root;
    expect(root.type).toBe('split');
    if (root.type === 'split') expect(root.sizes).toEqual([14.29, 85.71]);
  });

  test('a drag after equalizing works as before (unequal again until pressed again)', async () => {
    const [a] = await makeTabs(1);
    await splitActive();
    const group = findGroupForTab(groups(), a)!;
    const [rootId] = splitNodeIds(group);
    useSplitPaneStore.getState().equalizeGroup(group.id);
    useSplitPaneStore.getState().setSplitSizes(group.id, rootId, [60, 40]);
    const after = findGroupForTab(groups(), a)!;
    if (after.root.type === 'split') expect(after.root.sizes).toEqual([60, 40]);
  });
});
