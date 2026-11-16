/**
 * The unsplit feed-line bridge (sweep fold-in, 2026-11-16;
 * queued delivery, 2026-11-16 — the live 179d944 fix):
 * ⌘U and the palette `terminal:unsplit` entry share one
 * unsplit-with-line action with /unsplit and the split pill —
 * one press undoes exactly one split and queues the same
 * "Closed …" line for the surviving pane's Terminal to drain
 * (a direct write is lost live: the unsplit's tree surgery
 * remounts the acting instance). Store-level: no React, no
 * xterm — the writer here is a mock standing in for
 * termWriteLines, used only by the inconsistent-tree message
 * (no tree change there, so no remount).
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
  queueTerminalFeedLine,
  useFeedLineQueueStore,
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
  useFeedLineQueueStore.getState().resetForTests();
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
  test('unsplits one pane and queues the same line the pill queues — the writer is NOT the delivery', async () => {
    const a = await makeFourPaneSplit();
    const write = vi.fn();
    cleanups.push(registerTerminalLineWriter(a, write));

    const removed = unsplitTabWithFeedLine(a);

    expect(removed).toBe('terminal-4');
    // The line is QUEUED for the surviving pane (2026-11-16):
    // a direct write would land in the instance the unsplit
    // remounts (live 179d944: no line ever appeared). The
    // registered writer is not called for a successful unsplit.
    expect(write).not.toHaveBeenCalled();
    expect(useFeedLineQueueStore.getState().queued[a]).toEqual([
      'Closed terminal-4 — 3 panes left.',
    ]);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
    const group = findGroupForTab(useSplitPaneStore.getState().groups, a)!;
    expect(groupTabIds(group)).toEqual(['terminal-1', 'terminal-3', 'terminal-2']);
  });

  test('acting tab is the removed pane: the line is queued for the surviving pane', async () => {
    const a = await makeFourPaneSplit();
    // Live: focus follows the newest pane, so the Unsplit press
    // lands in the pane being removed — its own instance unmounts
    // outright, so the line must go to the survivor, not the actor.
    const removed = unsplitTabWithFeedLine('terminal-4');

    expect(removed).toBe('terminal-4');
    expect(useFeedLineQueueStore.getState().queued[a]).toEqual([
      'Closed terminal-4 — 3 panes left.',
    ]);
    expect(useFeedLineQueueStore.getState().queued['terminal-4']).toBeUndefined();
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
  });

  test('plain tab is a silent no-op — no line queued, nothing destroyed', async () => {
    const a = await useTerminalStore.getState().createTab();
    const write = vi.fn();
    cleanups.push(registerTerminalLineWriter(a, write));

    expect(unsplitTabWithFeedLine(a)).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(useFeedLineQueueStore.getState().queued).toEqual({});
    expect(stub.destroy).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });

  test('inconsistent tree names the failure instead of lying — direct write, no queue', async () => {
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
    // No tree change, so no remount: the message goes direct,
    // and nothing is queued for the feed.
    expect(useFeedLineQueueStore.getState().queued).toEqual({});
    expect(stub.destroy).not.toHaveBeenCalled();
  });

  test('no writer registered: still unsplits, queues the line, never throws', async () => {
    const a = await makeFourPaneSplit();

    expect(unsplitTabWithFeedLine(a)).toBe('terminal-4');
    expect(useFeedLineQueueStore.getState().queued[a]).toEqual([
      'Closed terminal-4 — 3 panes left.',
    ]);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
  });

  test('unregister stops the direct message, never the queued line', async () => {
    const a = await makeFourPaneSplit();
    const write = vi.fn();
    const unregister = registerTerminalLineWriter(a, write);
    unregister();

    expect(unsplitTabWithFeedLine(a)).toBe('terminal-4');
    expect(write).not.toHaveBeenCalled();
    expect(useFeedLineQueueStore.getState().queued[a]).toEqual([
      'Closed terminal-4 — 3 panes left.',
    ]);
  });

  test('closing a tab drops its queued lines — a reused number never inherits them', async () => {
    const a = await makeFourPaneSplit();
    queueTerminalFeedLine(a, 'Closed terminal-4 — 3 panes left.');
    expect(useFeedLineQueueStore.getState().queued[a]).toHaveLength(1);

    useTerminalStore.getState().closeTab(a);

    expect(useFeedLineQueueStore.getState().queued[a]).toBeUndefined();
  });
});
