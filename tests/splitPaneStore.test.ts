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
  getVisibleTabIds,
  orderTabsForRender,
  computePaneSizesAfterDrag,
  equalSizes,
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
    expect(group!.tabIds).toEqual([a, created]);
    expect(group!.sizes).toEqual([50, 50]);
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
    expect(group!.tabIds).toEqual([a, d, c]);
    expect(group!.sizes).toEqual([33.33, 33.33, 33.33]);
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
    expect(group!.tabIds).toEqual([a, c]);
    expect(group!.sizes).toEqual([50, 50]);
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

describe('setPaneSizes', () => {
  test('clamps each pane to 15–85 and normalises the set to 100', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    useSplitPaneStore.getState().setPaneSizes(group.id, [5, 95]);
    expect(groups()[group.id].sizes).toEqual([15, 85]);
    useSplitPaneStore.getState().setPaneSizes(group.id, [60, 60]);
    // Over 100: the residual lands on the first largest pane.
    expect(groups()[group.id].sizes).toEqual([40, 60]);
  });

  test('wrong length or unknown group is a no-op', async () => {
    const [a] = await makeTabs(1);
    await useSplitPaneStore.getState().splitTab(a);
    const group = findGroupForTab(groups(), a)!;
    useSplitPaneStore.getState().setPaneSizes(group.id, [70]);
    expect(groups()[group.id].sizes).toEqual([50, 50]);
    useSplitPaneStore.getState().setPaneSizes('split-99', [70, 30]);
    expect(groups()[group.id].sizes).toEqual([50, 50]);
  });
});

describe('pruning on tab lifecycle', () => {
  test('closing a tab directly (not via closePane) drops it from the group', async () => {
    const [a] = await makeTabs(1);
    const c = await useSplitPaneStore.getState().splitTab(a);
    const d = await useSplitPaneStore.getState().splitTab(a);
    useTerminalStore.getState().closeTab(d!);
    const group = findGroupForTab(groups(), a);
    expect(group!.tabIds).toEqual([a, c]);
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
