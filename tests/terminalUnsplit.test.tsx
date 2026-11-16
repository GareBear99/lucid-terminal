// @vitest-environment jsdom
/**
 * Chained unsplit, end to end (Gary, 2026-11-15 — one unsplit
 * press wiped ALL split progress, verified live): the plain
 * `/unsplit` command and the split toggle pill each undo
 * exactly ONE split — the most recent one — and never the
 * rest. `/unsplit all` stages the close ask and destroys
 * nothing until it is confirmed.
 *
 * Harness: the terminalPlainTerminal.test.tsx pattern (jsdom
 * has no canvas 2d context, so XtermSurface renders its
 * plain-text fallback with the same per-keystroke `onInput`
 * contract; typing here drives the same code path the real
 * terminal takes). The heavy children are stubbed
 * (SentinelFace runs a rAF gaze loop; FixNetStatus fetches
 * stats on mount). The store-level semantics live in
 * tests/splitPaneStore.test.ts — this file proves the pill
 * and the slash command actually call the chained action
 * (the regression test for exactly Gary's bug).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSplitPaneStore, groupTabIds, findGroupForTab } from '../src/stores/splitPaneStore';

// Heavy children the test does not care about — stub them so the render
// stays light (SentinelFace runs a rAF gaze loop; FixNetStatus fetches
// stats on mount).
vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));
vi.mock('../src/components/FixNet/FixNetStatus', () => ({
  FixNetStatus: () => null,
}));

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let writeMock: ReturnType<typeof vi.fn>;
let createMock: ReturnType<typeof vi.fn>;
let destroyMock: ReturnType<typeof vi.fn>;
let commandMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })),
      configurable: true,
    });
  }
  writeMock = vi.fn();
  createMock = vi.fn().mockResolvedValue(undefined);
  destroyMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({});
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      create: createMock,
      destroy: destroyMock,
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
    },
    fs: { getHomeDir: vi.fn().mockResolvedValue('/home/test') },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: commandMock,
      getHistory: vi.fn().mockResolvedValue([]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
    },
  };
  // Fresh stores: no tabs, no groups, tab numbers reset.
  const { tabs, closeTab } = useTerminalStore.getState();
  tabs.forEach((t) => closeTab(t.id));
  // Closing the previous test's leftover tabs calls destroy —
  // clear the mock AFTER the cleanup so each test starts
  // counting from zero (the splitPaneStore.test.ts pattern).
  destroyMock.mockClear();
  createMock.mockClear();
  useTerminalStore.setState({ tabs: [], activeTabId: null, createErrors: {}, exitedTabs: {} });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useTerminalStore.getState().resetForTests();
  useSplitPaneStore.getState().resetForTests();
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  vi.restoreAllMocks();
});

/** Type a command into the fallback input line and press Enter. */
function submitCommand(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** The fallback output pane's text so far. */
function outputText(): string {
  return screen.getByTestId('xterm-fallback-output').textContent ?? '';
}

/** Wait until a slash command's output has landed in the pane. */
async function waitForOutput(text: string) {
  await waitFor(() => {
    expect(outputText()).toContain(text);
  });
}

/** Build a 4-pane split: a, then c, d, e (e is the newest pane). */
async function makeFourPaneSplit(): Promise<string> {
  const a = await useTerminalStore.getState().createTab();
  await useSplitPaneStore.getState().splitTab(a); // terminal-2
  await useSplitPaneStore.getState().splitTab(a); // terminal-3
  await useSplitPaneStore.getState().splitTab(a); // terminal-4
  return a;
}

describe('Terminal: chained unsplit (Gary, 2026-11-15)', () => {
  test('/unsplit undoes one split and names the removed pane — the rest survive', async () => {
    const a = await makeFourPaneSplit();
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');
    // The pill shows "Unsplit" while split.
    expect(screen.getByTestId('split-toggle-pill').textContent).toBe('Unsplit');

    submitCommand('/unsplit');
    await waitForOutput('Closed terminal-4 — 3 panes left.');

    // Exactly the newest pane is gone — its PTY destroyed, the
    // other three panes (and the group) untouched.
    expect(destroyMock).toHaveBeenCalledWith('terminal-4');
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
    const group = findGroupForTab(useSplitPaneStore.getState().groups, a)!;
    expect(groupTabIds(group)).toEqual(['terminal-1', 'terminal-3', 'terminal-2']);
  });

  test('the split pill undoes one split — it never collapses all (Gary’s bug)', async () => {
    const a = await makeFourPaneSplit();
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');

    fireEvent.click(screen.getByTestId('split-toggle-pill'));

    // The pill writes the same feed line as /unsplit
    // (sweep fix, 2026-11-16 — the live check found no
    // "Closed …" line after a button unsplit).
    await waitForOutput('Closed terminal-4 — 3 panes left.');

    // One click = one pane gone, not three. The pill is a
    // toggle that used to wipe the whole split with one press.
    expect(destroyMock).toHaveBeenCalledWith('terminal-4');
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
      'terminal-1',
      'terminal-2',
      'terminal-3',
    ]);
    expect(Object.keys(useSplitPaneStore.getState().groups).length).toBe(1);
    // The pill still shows "Unsplit" — a split remains.
    expect(screen.getByTestId('split-toggle-pill').textContent).toBe('Unsplit');
  });

  test('/unsplit all stages the close ask and destroys nothing until it is confirmed', async () => {
    const a = await makeFourPaneSplit();
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');

    submitCommand('/unsplit all');
    await waitForOutput('Unsplit all — close the other 3 panes? Confirm in the tab bar.');

    // The ask is pending — tab id only (P4: the pane count is
    // derived live by the strip) — and nothing has been
    // destroyed.
    expect(useSplitPaneStore.getState().unsplitAllAsk).toEqual({ tabId: a });
    expect(destroyMock).not.toHaveBeenCalled();
    expect(Object.keys(useSplitPaneStore.getState().groups).length).toBe(1);
    expect(useTerminalStore.getState().tabs).toHaveLength(4);
  });

  test('N presses return to one terminal; the next press is a no-op', async () => {
    const a = await makeFourPaneSplit();
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');

    submitCommand('/unsplit');
    await waitForOutput('Closed terminal-4 — 3 panes left.');
    submitCommand('/unsplit');
    await waitForOutput('Closed terminal-3 — 2 panes left.');
    submitCommand('/unsplit');
    await waitForOutput('Closed terminal-2 — back to one terminal.');
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);
    expect(useSplitPaneStore.getState().groups).toEqual({});

    submitCommand('/unsplit');
    await waitForOutput('Already one terminal — nothing to unsplit.');
    expect(destroyMock).toHaveBeenCalledTimes(3);
  });
});

describe('Terminal: /unsplit honesty (P7, P10)', () => {
  test('/unsplit on a plain tab names the split group open on another tab', async () => {
    const a = await makeFourPaneSplit();
    // A plain tab beside the group.
    const b = await useTerminalStore.getState().createTab();
    useTerminalStore.getState().setActiveTab(b);
    render(<Terminal tabId={b} />);
    await screen.findByTestId('xterm-surface');

    submitCommand('/unsplit');
    // The message names the other group instead of pretending
    // no split exists — the pill's title does the same.
    await waitForOutput('Already one terminal — a split group is open on Terminal 1.');
    // Nothing destroyed: the group is untouched.
    expect(destroyMock).not.toHaveBeenCalled();
    expect(Object.keys(useSplitPaneStore.getState().groups).length).toBe(1);
    expect(a).toBeDefined();
  });

  test('/unsplit with no split anywhere is the plain no-op', async () => {
    const a = await useTerminalStore.getState().createTab();
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');

    submitCommand('/unsplit');
    await waitForOutput('Already one terminal — nothing to unsplit.');
    expect(destroyMock).not.toHaveBeenCalled();
  });

  test('/unsplit on an inconsistent tree says so — it never lies "already one terminal"', async () => {
    const a = await makeFourPaneSplit();
    // Corrupt the tree by hand: the newest node's second child
    // is a split node, not a leaf — the defensive guard in
    // unsplitOneTab fires (the invariant test locks it there).
    const group = findGroupForTab(useSplitPaneStore.getState().groups, a)!;
    const newest = group.root.type === 'split' ? group.root : null;
    expect(newest).not.toBeNull();
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
    render(<Terminal tabId={a} />);
    await screen.findByTestId('xterm-surface');

    submitCommand('/unsplit');
    await waitForOutput("Couldn't unsplit — the split tree is inconsistent.");
    expect(destroyMock).not.toHaveBeenCalled();
  });

  test('the split pill names the other group in its title when this tab is single-pane', async () => {
    const a = await makeFourPaneSplit();
    const b = await useTerminalStore.getState().createTab();
    useTerminalStore.getState().setActiveTab(b);
    render(<Terminal tabId={b} />);
    await screen.findByTestId('xterm-surface');

    const pill = screen.getByTestId('split-toggle-pill');
    expect(pill.textContent).toBe('Split');
    expect(pill.getAttribute('title')).toBe(
      'Split terminal (⌘D) — a split group already exists on Terminal 1',
    );
    expect(a).toBeDefined();
  });
});
