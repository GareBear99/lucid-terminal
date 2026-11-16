/**
 * The unsplit feed-line bridge (sweep fold-in, 2026-11-16):
 * ⌘U and the palette `terminal:unsplit` entry share one
 * unsplit-with-line action with /unsplit and the split pill —
 * one press undoes exactly one split and writes the same
 * "Closed …" line through the writer Terminal registers.
 * Store-level: no React, no xterm — the writer here is a
 * mock standing in for termWriteLines.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSplitPaneStore,
  findGroupForTab,
  groupTabIds,
} from '../src/stores/splitPaneStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import {
  unsplitFeedLine,
  unsplitTabWithFeedLine,
  registerTerminalLineWriter,
} from '../src/lib/terminalFeedLine';

const terminalStub = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
});

let stub: ReturnType<typeof terminalStub>;
let homeDir: ReturnType<typeof vi.fn>;
const cleanups: Array<() => void> = [];

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
  while (cleanups.length > 0) cleanups.pop()!();
  resetAll();
  vi.unstubAllGlobals();
});

/** Build a 4-pane split: a, then c, d, e (e is the newest pane). */
async function makeFourPaneSplit(): Promise<string> {
  const a = await useTerminalStore.getState().createTab();
  await useSplitPaneStore.getState().splitTab(a); // terminal-2
  await useSplitPaneStore.getState().splitTab(a); // terminal-3
  await useSplitPaneStore.getState().splitTab(a); // terminal-4
  return a;
}

describe('unsplitFeedLine', () => {
  test('names the removed pane and the panes left', () => {
    expect(unsplitFeedLine('terminal-4', 3)).toBe('Closed terminal-4 — 3 panes left.');
  });

  test('back to one terminal at one pane left', () => {
    expect(unsplitFeedLine('terminal-2', 1)).toBe('Closed terminal-2 — back to one terminal.');
  });
});

describe('unsplitTabWithFeedLine', () => {
  test('unsplits one pane and writes the same line the pill writes', async () => {
    const a = await makeFourPaneSplit();
    const write = vi.fn();
    cleanups.push(registerTerminalLineWriter(a, write));

    const removed = unsplitTabWithFeedLine(a);

    expect(removed).toBe('terminal-4');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('Closed terminal-4 — 3 panes left.');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
    const group = findGroupForTab(useSplitPaneStore.getState().groups, a)!;
    expect(groupTabIds(group)).toEqual(['terminal-1', 'terminal-3', 'terminal-2']);
  });

  test('plain tab is a silent no-op — no line, nothing destroyed', async () => {
    const a = await useTerminalStore.getState().createTab();
    const write = vi.fn();
    cleanups.push(registerTerminalLineWriter(a, write));

    expect(unsplitTabWithFeedLine(a)).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });

  test('inconsistent tree names the failure instead of lying', async () => {
    const a = await makeFourPaneSplit();
    const write = vi.fn();
    cleanups.push(registerTerminalLineWriter(a, write));
    // Corrupt the tree by hand: the newest node's second child
    // is a split node, not a leaf — the defensive guard in
    // unsplitOneTab fires (the terminalUnsplit.test.tsx pattern).
    const group = findGroupForTab(useSplitPaneStore.getState().groups, a)!;
    useSplitPaneStore.setState({
      groups: {
        [group.id]: {
          ...group,
          root: {
            type: 'split',
            id: 'node-99',
            direction: 'vertical',
            sizes: [50, 50],
            first: { type: 'leaf', tabId: a },
            second: group.root,
          },
        },
      },
    });

    expect(unsplitTabWithFeedLine(a)).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("Couldn't unsplit — the split tree is inconsistent.");
    expect(stub.destroy).not.toHaveBeenCalled();
  });

  test('no writer registered: still unsplits, drops the line, never throws', async () => {
    const a = await makeFourPaneSplit();

    expect(unsplitTabWithFeedLine(a)).toBe('terminal-4');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
  });

  test('unregister stops the line', async () => {
    const a = await makeFourPaneSplit();
    const write = vi.fn();
    const unregister = registerTerminalLineWriter(a, write);
    unregister();

    expect(unsplitTabWithFeedLine(a)).toBe('terminal-4');
    expect(write).not.toHaveBeenCalled();
  });
});
