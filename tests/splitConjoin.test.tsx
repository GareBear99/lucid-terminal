// @vitest-environment jsdom
/**
 * The split conjoin fix (Gary, 2026-11-15 — "the split pair of
 * tabs should conjoin until unsplit"): clicking off a split tab
 * must never unjoin its panes, and the context-menu bulk closes
 * must ask first like a tab × does.
 *
 * P1 (Critical) is the App-level regression test: split a tab,
 * put output in a pane and a draft in its input line, click off
 * to a plain tab and back, and assert the panes' Terminals were
 * NOT remounted — the output and the draft survive, and new PTY
 * data still lands. The old App swapped two render branches on
 * isSplitVisible (different parents), so React unmounted and
 * remounted every pane on every click off: xterm disposed,
 * scrollback gone, a running command's output dropped, the
 * draft lost. The fix renders every group's tree always (the
 * active one lays out, the rest hide with CSS) with each pane
 * a normal child of its tree's leaf div — the wrappers never
 * change parents. Portals were tried and rejected: React 18
 * unmounts and remounts a portal's children when its container
 * changes, so moving a Terminal between a leaf slot and a host
 * remounted it exactly like the branch swap (proven by a
 * minimal repro, since deleted).
 *
 * P2 (Critical) is the container-level bulk-close test: "Close
 * Other Tabs" / "Close to the Right" route through the used-tab
 * ask + closePane, never the silent bulk closeTabs.
 *
 * P8 is the container-level live-count test: the unsplit-all
 * dialog derives its pane count live from the group, so it
 * follows the group as it shrinks and vanishes when the group
 * dissolves.
 *
 * P13 is the ⌘U keyboard test: unsplit has a shortcut now.
 *
 * Run with: npx vitest run tests/splitConjoin.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from '../src/App';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSplitPaneStore, groupTabIds, findGroupForTab } from '../src/stores/splitPaneStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useBrowserStore } from '../src/stores/browserStore';
import { useToastStore } from '../src/stores/toastStore';
import type { TerminalBlock } from '../src/types';

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

function block(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

// ---------------------------------------------------------------- P1: App level

describe('P1 — clicking off a split tab never remounts its panes', () => {
  let restoreLucidAPI: () => void;
  let dataHandlers: Array<(id: string, data: string) => void>;
  let mockSettingsOverrides: Record<string, unknown> = {};

  function installMock() {
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    const noop = () => undefined;
    dataHandlers = [];
    const mock = {
      settings: {
        getAll: vi.fn(async () => ({ ...mockSettingsOverrides })),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
        set: vi.fn(async () => undefined),
      },
      ai: {
        getSessions: vi.fn(async () => []),
        saveSession: vi.fn(async () => undefined),
        deleteSession: vi.fn(async () => undefined),
        clearSessions: vi.fn(async () => undefined),
        chat: vi.fn(async () => undefined),
        cancelStream: vi.fn(noop),
        checkLocalBackend: vi.fn(async () => false),
        onStream: vi.fn(() => noop),
        onStreamEnd: vi.fn(() => noop),
        onStreamError: vi.fn(() => noop),
        onSnapshotHit: vi.fn(() => noop),
      },
      lucid: {
        checkModelsInstalled: vi.fn(async () => ({ installed: false })),
        getModelStatuses: vi.fn(async () => ({})),
        getUserId: vi.fn(async () => ({ success: true, userId: 'test-user' })),
        installTinyLlama: vi.fn(async () => ({ success: false, error: 'mock' })),
        onInstallTinyLlamaProgress: vi.fn(() => noop),
        init: vi.fn(async () => ({ success: false, error: 'mock' })),
      },
      fs: {
        getHomeDir: vi.fn(async () => '/tmp/test-home'),
        readDir: vi.fn(async () => []),
        selectDirectory: vi.fn(async () => null),
      },
      terminal: {
        create: vi.fn(async () => undefined),
        write: vi.fn(async () => undefined),
        destroy: vi.fn(async () => undefined),
        onData: vi.fn((handler: (id: string, data: string) => void) => {
          dataHandlers.push(handler);
          return noop;
        }),
        onExit: vi.fn(() => noop),
        onCwd: vi.fn(() => noop),
      },
      window: {
        isMaximized: vi.fn(async () => false),
        onMaximizedChange: vi.fn(() => noop),
        create: vi.fn(async () => undefined),
        minimize: vi.fn(async () => undefined),
        maximize: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
      browser: {
        create: vi.fn(async () => undefined),
        listDownloads: vi.fn(async () => []),
        onDownloadUpdated: vi.fn(() => noop),
        onLoginDetected: vi.fn(() => noop),
        onUpdated: vi.fn(() => noop),
        onOpenUrl: vi.fn(() => noop),
        onAuthRequired: vi.fn(() => noop),
        onFindUpdated: vi.fn(() => noop),
        onFlowApprovalNeeded: vi.fn(() => noop),
        onFlowProgress: vi.fn(() => noop),
        onFocusAddressBar: vi.fn(() => noop),
        onMiniClosed: vi.fn(() => noop),
        onMiniState: vi.fn(() => noop),
        onOpenInternalPhone: vi.fn(() => noop),
        onPermissionRequested: vi.fn(() => noop),
        onAgentState: vi.fn(() => noop),
        getAgentState: vi.fn(async () => ({ ok: true, state: null })),
        hide: vi.fn(async () => undefined),
        activate: vi.fn(async () => undefined),
        show: vi.fn(async () => undefined),
        navigate: vi.fn(async () => undefined),
        findInPage: vi.fn(async () => undefined),
        stopFindInPage: vi.fn(async () => undefined),
        openExternal: vi.fn(async () => undefined),
        setBounds: vi.fn(async () => undefined),
        setMiniBounds: vi.fn(async () => undefined),
        goBack: vi.fn(async () => undefined),
        goForward: vi.fn(async () => undefined),
        reload: vi.fn(async () => undefined),
        popIn: vi.fn(async () => undefined),
        closeMini: vi.fn(async () => undefined),
        miniOpenInternal: vi.fn(async () => undefined),
        approveFlowStep: vi.fn(async () => undefined),
        rejectFlowStep: vi.fn(async () => undefined),
        stopFlow: vi.fn(async () => undefined),
        authResponse: vi.fn(async () => undefined),
        diagnoseActive: vi.fn(async () => ({}) as never),
      },
      system: {
        checkNetwork: vi.fn(async () => ({ online: true })),
      },
    };
    win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
    return () => {
      if (prevLucidAPI === undefined) delete win.lucidAPI;
      else win.lucidAPI = prevLucidAPI;
    };
  }

  function resetStores() {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ...mockSettingsOverrides },
      hasApiKey: false,
      hasPingKey: false,
      isLocalBackendAvailable: false,
      isLocalModelAvailable: false,
      isLoading: false,
    }));
    useAIStore.setState({
      sessions: [],
      currentSessionId: null,
      messages: [],
      contextDirectory: null,
      isSessionsLoaded: false,
      pendingAiPrompt: null,
    });
    useBrowserStore.setState({ panelTab: 'ai', tabs: [], activeTabId: null });
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useToastStore.setState({ notifications: [] });
    useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
    useSplitPaneStore.getState().resetForTests();
  }

  beforeEach(() => {
    restoreLucidAPI = installMock();
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
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    mockSettingsOverrides = {
      luciferAiEnabled: false,
      luciferAiSilenced: false,
      pingServerEnabled: true,
      toolbarPlugins: { 'ai-chat': true, synth: true, help: true, llmbuilder: true },
      installedAddons: ['persona-plex'],
    };
    resetStores();
  });

  afterEach(() => {
    restoreLucidAPI();
    vi.restoreAllMocks();
  });

  /** How many fallback output panes contain the marker. */
  function outputsWithMarker(marker: string): number {
    return screen
      .getAllByTestId('xterm-fallback-output')
      .filter((el) => (el.textContent ?? '').includes(marker)).length;
  }

  test('click off to a plain tab and back: the pane’s output, draft and PTY delivery all survive', async () => {
    // A split group [terminal-1, terminal-3] + a plain tab.
    const a = await useTerminalStore.getState().createTab();
    const b = await useTerminalStore.getState().createTab();
    const c = await useSplitPaneStore.getState().splitTab(a);
    expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, c]);

    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));
      expect(screen.getAllByTestId('xterm-fallback-output')).toHaveLength(3);

      // A running command's output lands in the first pane.
      act(() => {
        for (const handler of dataHandlers) handler(a, 'PANE-MARKER-7Q');
      });
      await waitFor(() => expect(outputsWithMarker('PANE-MARKER-7Q')).toBe(1));

      // A draft in the first pane's input line (the jsdom
      // stand-in for the prompt line — its state lives in the
      // surface and remounts with it, exactly like devInput).
      const inputs = screen.getAllByTestId('xterm-fallback-input');
      fireEvent.change(inputs[0], { target: { value: 'draft-xyz' } });
      expect((inputs[0] as HTMLTextAreaElement).value).toBe('draft-xyz');

      // Click off to the plain tab — the split disappears from
      // view, but the panes must stay mounted underneath.
      fireEvent.click(screen.getByTestId(`tab-${b}`));
      expect(useTerminalStore.getState().activeTabId).toBe(b);
      expect(outputsWithMarker('PANE-MARKER-7Q')).toBe(1);
      expect(useSplitPaneStore.getState().groups).not.toEqual({});

      // Click back to the split tab.
      fireEvent.click(screen.getByTestId(`tab-${a}`));
      expect(useTerminalStore.getState().activeTabId).toBe(a);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));

      // The output survived (the xterm was never disposed),
      // the draft survived, and new PTY data still lands —
      // a running command's output is not silently dropped.
      expect(outputsWithMarker('PANE-MARKER-7Q')).toBe(1);
      expect(
        (screen.getAllByTestId('xterm-fallback-input')[0] as HTMLTextAreaElement).value,
      ).toBe('draft-xyz');
      act(() => {
        for (const handler of dataHandlers) handler(a, 'AFTER-BACK-9Z');
      });
      await waitFor(() => expect(outputsWithMarker('AFTER-BACK-9Z')).toBe(1));
      expect(outputsWithMarker('PANE-MARKER-7Q')).toBe(1);

      // The group and the tabs are untouched by the round trip.
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, c]);
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b, c]);
    } finally {
      unmount();
    }
  });

  test('the blood-drop panel hides the terminals without unmounting them (P1c)', async () => {
    mockSettingsOverrides = {
      ...mockSettingsOverrides,
      luciferAiEnabled: true,
      luciferAiSilenced: false,
    };
    resetStores();
    const a = await useTerminalStore.getState().createTab();
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));
      act(() => {
        for (const handler of dataHandlers) handler(a, 'BLOOD-MARKER-3K');
      });
      await waitFor(() => expect(outputsWithMarker('BLOOD-MARKER-3K')).toBe(1));

      // Open the blood drop panel from the strip tab.
      fireEvent.click(screen.getByTestId('blood-drop-tab'));
      expect(screen.getByTestId('lucifer-ai-tab-panel')).not.toBeNull();
      // The terminal is hidden — but still mounted, output intact.
      expect(outputsWithMarker('BLOOD-MARKER-3K')).toBe(1);

      // Close the panel from the strip (clicking a terminal tab).
      fireEvent.click(screen.getByTestId(`tab-${a}`));
      expect(screen.queryByTestId('lucifer-ai-tab-panel')).toBeNull();
      expect(outputsWithMarker('BLOOD-MARKER-3K')).toBe(1);
    } finally {
      unmount();
    }
  });
});

// ------------------------------------------------- P2/P8/P13: strip container

describe('P2 — context-menu bulk closes ask first, then close pane-aware', () => {
  const mockDetach = {
    dragStart: vi.fn(),
    dragMove: vi.fn(),
    dragEnd: vi.fn(),
    dragCancel: vi.fn(),
    dragDiag: vi.fn(),
    reportBarRect: vi.fn(),
    onDragDetect: vi.fn(() => () => {}),
    onDragDetectClear: vi.fn(() => () => {}),
    popIn: vi.fn().mockResolvedValue({ ok: true }),
    notifyTabClosed: vi.fn(),
  };
  const mockDestroy = vi.fn();
  let prevLucidAPI: unknown;
  let prevResizeObserver: unknown;

  const TABS = [
    { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
    { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
    { id: 'terminal-3', title: 'Terminal 3', cwd: '/tmp', isActive: false },
    { id: 'terminal-4', title: 'Terminal 4', cwd: '/tmp', isActive: false },
  ];

  function twoPaneGroup() {
    return {
      'split-1': {
        id: 'split-1',
        root: {
          type: 'split' as const,
          id: 'split-node-1',
          direction: 'vertical' as const,
          sizes: [50, 50] as [number, number],
          first: { type: 'leaf' as const, tabId: 'terminal-1' },
          second: { type: 'leaf' as const, tabId: 'terminal-2' },
        },
      },
    };
  }

  function threePaneGroup() {
    return {
      'split-1': {
        id: 'split-1',
        root: {
          type: 'split' as const,
          id: 'split-node-1',
          direction: 'vertical' as const,
          sizes: [50, 50] as [number, number],
          first: { type: 'leaf' as const, tabId: 'terminal-1' },
          second: {
            type: 'split' as const,
            id: 'split-node-2',
            direction: 'horizontal' as const,
            sizes: [50, 50] as [number, number],
            first: { type: 'leaf' as const, tabId: 'terminal-2' },
            second: { type: 'leaf' as const, tabId: 'terminal-3' },
          },
        },
      },
    };
  }

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      terminal: {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: mockDestroy,
        detach: mockDetach,
      },
    };
    prevResizeObserver = win.ResizeObserver;
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.clearAllMocks();
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: TABS.slice(0, 3), activeTabId: 'terminal-1' });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
  });

  function openMenu(tabId: string) {
    fireEvent.contextMenu(screen.getByTestId(`tab-${tabId}`), { clientX: 100, clientY: 20 });
    expect(screen.getByTestId('tab-context-menu')).not.toBeNull();
  }

  test('"Close Other Tabs" on a split tab’s neighbour stages the bulk ask — confirm closes the panes, never silently', () => {
    useSplitPaneStore.setState({ groups: twoPaneGroup() });
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      openMenu('terminal-3');
      fireEvent.click(screen.getByText('Close Other Tabs'));
      const dialog = screen.getByTestId('tab-close-ask');
      expect(dialog.getAttribute('aria-label')).toBe('Close 2 other tabs?');
      expect(dialog.textContent).toContain('This closes 2 tabs, including 2 panes of a split group.');
      expect(mockDestroy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('tab-close-ask-close-tabs'));
      expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
      expect(mockDestroy).toHaveBeenCalledWith('terminal-2');
      expect(mockDestroy).toHaveBeenCalledTimes(2);
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-3']);
      expect(useSplitPaneStore.getState().groups).toEqual({});
      expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    } finally {
      unmount();
    }
  });

  test('"Close Tabs to the Right" on a used plain tab asks — Keep keeps everything', () => {
    useHistoryStore.getState().setBlocks('terminal-3', [block('b1', 'ls')]);
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      openMenu('terminal-2');
      fireEvent.click(screen.getByText('Close Tabs to the Right'));
      const dialog = screen.getByTestId('tab-close-ask');
      expect(dialog.getAttribute('aria-label')).toBe('Close 1 tab to the right?');
      expect(dialog.textContent).toContain('This closes 1 tab.');
      expect(mockDestroy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('tab-close-ask-keep-tabs'));
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
        'terminal-1',
        'terminal-2',
        'terminal-3',
      ]);
      expect(screen.queryByTestId('tab-close-ask')).toBeNull();
    } finally {
      unmount();
    }
  });

  test('unused, ungrouped targets close silently — no ask, pane-aware', () => {
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      openMenu('terminal-1');
      fireEvent.click(screen.getByText('Close Other Tabs'));
      expect(screen.queryByTestId('tab-close-ask')).toBeNull();
      expect(mockDestroy).toHaveBeenCalledWith('terminal-2');
      expect(mockDestroy).toHaveBeenCalledWith('terminal-3');
      expect(mockDestroy).toHaveBeenCalledTimes(2);
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);
    } finally {
      unmount();
    }
  });

  test('mixed targets: panes and a plain tab close together on confirm, the anchor survives', () => {
    useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-3' });
    useSplitPaneStore.setState({ groups: twoPaneGroup() });
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      openMenu('terminal-3');
      fireEvent.click(screen.getByText('Close Other Tabs'));
      const dialog = screen.getByTestId('tab-close-ask');
      expect(dialog.getAttribute('aria-label')).toBe('Close 3 other tabs?');
      expect(dialog.textContent).toContain('This closes 3 tabs, including 2 panes of a split group.');
      fireEvent.click(screen.getByTestId('tab-close-ask-close-tabs'));
      expect(mockDestroy).toHaveBeenCalledWith('terminal-1');
      expect(mockDestroy).toHaveBeenCalledWith('terminal-2');
      expect(mockDestroy).toHaveBeenCalledWith('terminal-4');
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-3']);
      expect(useSplitPaneStore.getState().groups).toEqual({});
    } finally {
      unmount();
    }
  });
});

describe('P8 — the unsplit-all dialog derives its count live from the group', () => {
  const mockDetach = {
    dragStart: vi.fn(),
    dragMove: vi.fn(),
    dragEnd: vi.fn(),
    dragCancel: vi.fn(),
    dragDiag: vi.fn(),
    reportBarRect: vi.fn(),
    onDragDetect: vi.fn(() => () => {}),
    onDragDetectClear: vi.fn(() => () => {}),
    popIn: vi.fn().mockResolvedValue({ ok: true }),
    notifyTabClosed: vi.fn(),
  };
  const mockDestroy = vi.fn();
  let prevLucidAPI: unknown;
  let prevResizeObserver: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      terminal: {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: mockDestroy,
        detach: mockDetach,
      },
    };
    prevResizeObserver = win.ResizeObserver;
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.clearAllMocks();
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({
      tabs: [
        { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
        { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
        { id: 'terminal-3', title: 'Terminal 3', cwd: '/tmp', isActive: false },
      ],
      activeTabId: 'terminal-1',
    });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
    useSplitPaneStore.setState({
      groups: {
        'split-1': {
          id: 'split-1',
          root: {
            type: 'split' as const,
            id: 'split-node-1',
            direction: 'vertical' as const,
            sizes: [50, 50] as [number, number],
            first: { type: 'leaf' as const, tabId: 'terminal-1' },
            second: {
              type: 'split' as const,
              id: 'split-node-2',
              direction: 'horizontal' as const,
              sizes: [50, 50] as [number, number],
              first: { type: 'leaf' as const, tabId: 'terminal-2' },
              second: { type: 'leaf' as const, tabId: 'terminal-3' },
            },
          },
        },
      },
    });
    useSplitPaneStore.getState().requestUnsplitAll('terminal-1');
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
  });

  test('the dialog names the tab and the live count; it follows the group down and vanishes when the group dissolves', () => {
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      let dialog = screen.getByTestId('tab-close-ask');
      expect(dialog.getAttribute('aria-label')).toBe('Unsplit all 3 panes in "Terminal 1"?');
      expect(dialog.textContent).toContain('This closes the other 2 panes.');

      // One pane closes while the ask sits open: the dialog
      // follows the live count (P4) instead of showing the
      // frozen 3.
      act(() => {
        useSplitPaneStore.getState().closePane('terminal-3');
      });
      dialog = screen.getByTestId('tab-close-ask');
      expect(dialog.getAttribute('aria-label')).toBe('Unsplit all 2 panes in "Terminal 1"?');
      expect(dialog.textContent).toContain('This closes the other 1 pane.');

      // The last pane closes: the group dissolves, the ask is
      // gone — not shown with a dead count.
      act(() => {
        useSplitPaneStore.getState().closePane('terminal-2');
      });
      expect(screen.queryByTestId('tab-close-ask')).toBeNull();
      expect(useSplitPaneStore.getState().unsplitAllAsk).toBeNull();
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);
    } finally {
      unmount();
    }
  });
});

describe('P13 — ⌘U unsplits the active tab', () => {
  const mockDetach = {
    dragStart: vi.fn(),
    dragMove: vi.fn(),
    dragEnd: vi.fn(),
    dragCancel: vi.fn(),
    dragDiag: vi.fn(),
    reportBarRect: vi.fn(),
    onDragDetect: vi.fn(() => () => {}),
    onDragDetectClear: vi.fn(() => () => {}),
    popIn: vi.fn().mockResolvedValue({ ok: true }),
    notifyTabClosed: vi.fn(),
  };
  const mockDestroy = vi.fn();
  let prevLucidAPI: unknown;
  let prevResizeObserver: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      terminal: {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: mockDestroy,
        detach: mockDetach,
      },
    };
    prevResizeObserver = win.ResizeObserver;
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.clearAllMocks();
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({
      tabs: [
        { id: 'terminal-1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
        { id: 'terminal-2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
      ],
      activeTabId: 'terminal-1',
    });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
    useSplitPaneStore.setState({
      groups: {
        'split-1': {
          id: 'split-1',
          root: {
            type: 'split' as const,
            // The node id must parse as node-N: unsplitOneTab
            // finds the newest split by its numeric id, and
            // 'split-node-1' does not parse (NaN), so the
            // guard would no-op.
            id: 'node-1',
            direction: 'vertical' as const,
            sizes: [50, 50] as [number, number],
            first: { type: 'leaf' as const, tabId: 'terminal-1' },
            second: { type: 'leaf' as const, tabId: 'terminal-2' },
          },
        },
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    win.ResizeObserver = prevResizeObserver;
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ blocksByTab: {} });
    useSplitPaneStore.getState().resetForTests();
  });

  test('⌘U undoes one split — the keyboard twin of the pill and /unsplit', () => {
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      fireEvent.keyDown(window, { key: 'u', metaKey: true });
      expect(mockDestroy).toHaveBeenCalledWith('terminal-2');
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);
      expect(useSplitPaneStore.getState().groups).toEqual({});
      // A second press with no split is a no-op.
      fireEvent.keyDown(window, { key: 'u', metaKey: true });
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  test('⇧⌘U does nothing — plain Cmd+U only, like ⌘D', () => {
    const { unmount } = render(React.createElement(TerminalTabs, {}));
    try {
      fireEvent.keyDown(window, { key: 'U', metaKey: true, shiftKey: true });
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(useTerminalStore.getState().tabs).toHaveLength(2);
    } finally {
      unmount();
    }
  });
});
