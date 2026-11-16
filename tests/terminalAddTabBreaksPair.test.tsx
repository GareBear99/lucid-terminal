// @vitest-environment jsdom
/**
 * Adding a tab breaks split pairs, LIVE (Gary, 2026-11-16, build
 * cea360f — "as soon as i add a tab it breaks the pairs").
 *
 * ROOT CAUSE (2026-11-16, clean cea360f): `createTab` ALWAYS
 * activates the new tab, and App derives the visible panes
 * solely from `activeTabId` (`getVisibleTabIds` — the active
 * tab's whole group, else just the active tab). So adding a tab
 * while a split is showing ALWAYS collapses the split view to
 * the single new pane: the pair vanishes from view the instant
 * the tab is added. cea360f fixed only the strip marking — the
 * groups survive in the store, the marks stay, and clicking a
 * member restores the pair (all proven by the passing probes
 * below) — but from Gary's seat the pair is broken the moment
 * he adds a tab, because the view itself collapses.
 *
 * FIX: adding a plain tab while a split is visible must not take over the view — the new tab is created in the strip, not
 * activated, so the pair stays on screen; clicking the new tab
 * shows it. When no split is visible, "+" behaves exactly as
 * before (the new tab shows at once). Split creation keeps
 * activating (focus follows the new pane), as do reopen and
 * restart.
 *
 *   1. split terminal-1 + terminal-2 into a pair (both visible);
 *   2. add a new tab with the real "+" button;
 *   3. the pair must stay linked in the store AND marked in the
 *      strip AND restorable: clicking either member tab in the
 *      strip must bring BOTH panes back side by side, with the
 *      new tab hidden — and clicking the new tab must hide the
 *      pair again without destroying it.
 *
 * Visibility is read from the DOM, not from surface counts: every
 * Terminal stays mounted while hidden (App P1 stable trees), so
 * counting `xterm-surface` elements can never see this bug — a
 * hidden pane and a visible pane both count. Each pane is
 * identified by its cwd chip (distinct cwds per tab), and a pane
 * is visible only when no ancestor carries the `hidden` class.
 *
 * Run with: npx vitest run tests/terminalAddTabBreaksPair.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSplitPaneStore, groupTabIds, findGroupForTab } from '../src/stores/splitPaneStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useBrowserStore } from '../src/stores/browserStore';
import { useToastStore } from '../src/stores/toastStore';
import { useFeedLineQueueStore } from '../src/lib/terminalFeedLine';
import { registerBuiltinCommands } from '../src/lib/builtinCommands';
import { CommandRegistry } from '../src/lib/commandRegistry';

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

describe('adding a tab breaks split pairs, live (App level)', () => {
  let restoreLucidAPI: () => void;

  function installMock() {
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    const noop = () => undefined;
    const mock = {
      settings: {
        getAll: vi.fn(async () => ({ luciferAiEnabled: false, luciferAiSilenced: false, pingServerEnabled: true, toolbarPlugins: { 'ai-chat': true, synth: true, help: true, llmbuilder: true }, installedAddons: ['persona-plex'] })),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
        set: vi.fn(async () => undefined),
      },
      ai: { getSessions: vi.fn(async () => []), saveSession: vi.fn(async () => undefined), deleteSession: vi.fn(async () => undefined), clearSessions: vi.fn(async () => undefined), chat: vi.fn(async () => undefined), cancelStream: vi.fn(noop), checkLocalBackend: vi.fn(async () => false), onStream: vi.fn(() => noop), onStreamEnd: vi.fn(() => noop), onStreamError: vi.fn(() => noop), onSnapshotHit: vi.fn(() => noop) },
      lucid: { checkModelsInstalled: vi.fn(async () => ({ installed: false })), getModelStatuses: vi.fn(async () => ({})), getUserId: vi.fn(async () => ({ success: true, userId: 'test-user' })), installTinyLlama: vi.fn(async () => ({ success: false, error: 'mock' })), onInstallTinyLlamaProgress: vi.fn(() => noop), init: vi.fn(async () => ({ success: false, error: 'mock' })) },
      fs: { getHomeDir: vi.fn(async () => '/tmp/test-home'), readDir: vi.fn(async () => []), selectDirectory: vi.fn(async () => null) },
      terminal: { create: vi.fn(async () => undefined), write: vi.fn(async () => undefined), destroy: vi.fn(async () => undefined), onData: vi.fn(() => noop), onExit: vi.fn(() => noop), onCwd: vi.fn(() => noop) },
      window: { isMaximized: vi.fn(async () => false), onMaximizedChange: vi.fn(() => noop), create: vi.fn(async () => undefined), minimize: vi.fn(async () => undefined), maximize: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
      browser: { create: vi.fn(async () => undefined), listDownloads: vi.fn(async () => []), onDownloadUpdated: vi.fn(() => noop), onLoginDetected: vi.fn(() => noop), onUpdated: vi.fn(() => noop), onOpenUrl: vi.fn(() => noop), onAuthRequired: vi.fn(() => noop), onFindUpdated: vi.fn(() => noop), onFlowApprovalNeeded: vi.fn(() => noop), onFlowProgress: vi.fn(() => noop), onFocusAddressBar: vi.fn(() => noop), onMiniClosed: vi.fn(() => noop), onMiniState: vi.fn(() => noop), onOpenInternalPhone: vi.fn(() => noop), onPermissionRequested: vi.fn(() => noop), onAgentState: vi.fn(() => noop), getAgentState: vi.fn(async () => ({ ok: true, state: null })), hide: vi.fn(async () => undefined), activate: vi.fn(async () => undefined), show: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined), findInPage: vi.fn(async () => undefined), stopFindInPage: vi.fn(() => noop), openExternal: vi.fn(async () => undefined), setBounds: vi.fn(async () => undefined), setMiniBounds: vi.fn(async () => undefined), goBack: vi.fn(async () => undefined), goForward: vi.fn(async () => undefined), reload: vi.fn(async () => undefined), popIn: vi.fn(async () => undefined), closeMini: vi.fn(async () => undefined), miniOpenInternal: vi.fn(async () => undefined), approveFlowStep: vi.fn(async () => undefined), rejectFlowStep: vi.fn(async () => undefined), stopFlow: vi.fn(async () => undefined), authResponse: vi.fn(async () => undefined), diagnoseActive: vi.fn(async () => ({}) as never) },
      system: { checkNetwork: vi.fn(async () => ({ online: true })) },
    };
    win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
    return () => { if (prevLucidAPI === undefined) delete win.lucidAPI; else win.lucidAPI = prevLucidAPI; };
  }

  function resetStores() {
    const { tabs, closeTab } = useTerminalStore.getState();
    tabs.forEach((t) => closeTab(t.id));
    useTerminalStore.getState().resetForTests();
    useTerminalStore.setState({ tabs: [], activeTabId: null, createErrors: {}, exitedTabs: {} });
    useToastStore.setState({ notifications: [] });
    useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
    useSplitPaneStore.getState().resetForTests();
    useFeedLineQueueStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, luciferAiEnabled: false, luciferAiSilenced: false }, hasApiKey: false, hasPingKey: false, isLocalBackendAvailable: false, isLocalModelAvailable: false, isLoading: false }));
    useAIStore.setState({ sessions: [], currentSessionId: null, messages: [], contextDirectory: null, isSessionsLoaded: false, pendingAiPrompt: null });
    useBrowserStore.setState({ panelTab: 'ai', tabs: [], activeTabId: null });
  }

  beforeEach(() => {
    restoreLucidAPI = installMock();
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', { value: vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })), configurable: true });
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    resetStores();
  });

  afterEach(() => { restoreLucidAPI(); vi.restoreAllMocks(); });

  /** Is this element (or any ancestor) hidden with the `hidden` class? */
  function isHidden(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
      if (node.classList.contains('hidden')) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * The cwds of the panes the user actually SEES, in DOM order.
   * Each Terminal root (`terminal-page`) shows its tab's cwd in
   * the prompt-section header (a span titled with the cwd; in
   * plain non-devmode it carries no testid). A pane is visible
   * only when no ancestor is `hidden`. Distinct cwds per tab
   * make the pane identifiable.
   */
  function visiblePaneCwds(): string[] {
    return screen
      .getAllByTestId('terminal-page')
      .filter((page) => !isHidden(page))
      .map(
        (page) =>
          Array.from(page.querySelectorAll('span[title]'))
            .map((el) => el.getAttribute('title') ?? '')
            .find((t) => t.startsWith('/tmp/')) ?? '?',
      );
  }

  /** The strip's pair marking for a tab id. */
  function stripMarks(id: string): boolean {
    return screen.getByTestId(`tab-${id}`).getAttribute('data-split-group') === 'true';
  }

  /** The split pills of the VISIBLE panes only, in DOM order. */
  function visiblePills(): string[] {
    return screen
      .getAllByTestId('terminal-page')
      .filter((page) => !isHidden(page))
      .map((page) => page.querySelector('[data-testid="split-toggle-pill"]')?.textContent ?? '?');
  }

  test('adding a tab via the + button: the pair stays linked, marked, and restorable by clicking a member', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/pair-a');
    const b = await useSplitPaneStore.getState().splitTab(a);
    expect(b).toBe('terminal-2');
    expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);

    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      // Both panes visible side by side, divider between them.
      expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']);
      // Every Terminal renders a pill, hidden panes included —
      // read only the VISIBLE panes' pills.
      expect(visiblePills()).toEqual(['Unsplit', 'Unsplit']);
      expect(stripMarks(a)).toBe(true);
      expect(stripMarks(b)).toBe(true);

      // A draft in the first pane's input line: if adding a tab
      // remounts the panes, the draft (and the xterm scrollback
      // it stands in for) is lost with them.
      const inputsBefore = screen.getAllByTestId('xterm-fallback-input');
      fireEvent.change(inputsBefore[0], { target: { value: 'draft-keep-me' } });
      expect((inputsBefore[0] as HTMLTextAreaElement).value).toBe('draft-keep-me');

      // Gary's repro: click the real "+" button in the strip.
      // Adding a tab must NOT collapse the visible pair: the
      // pair stays on screen (the new tab is created in the
      // strip, not activated), and clicking the new tab shows it.
      fireEvent.click(screen.getByTitle('New Terminal'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));
      const c = useTerminalStore.getState().tabs.find((t) => t.id !== a && t.id !== b)!.id;
      // The pair stays the active view — the new tab did not take it over.
      expect(useTerminalStore.getState().activeTabId).toBe(b);
      expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']);

      // The pair is intact in the store and still marked.
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(stripMarks(a)).toBe(true);
      expect(stripMarks(b)).toBe(true);
      expect(stripMarks(c)).toBe(false);
      // The draft survived the add — the panes were never remounted.
      expect(
        (screen.getAllByTestId('xterm-fallback-input')[0] as HTMLTextAreaElement).value,
      ).toBe('draft-keep-me');

      // Click the new tab: it shows alone, the pair hidden but intact.
      fireEvent.click(screen.getByTestId(`tab-${c}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/test-home']));
      expect(useTerminalStore.getState().activeTabId).toBe(c);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(stripMarks(a)).toBe(true);
      expect(stripMarks(b)).toBe(true);

      // Click back to a member of the pair: BOTH panes must come
      // back side by side, and the new tab must hide. This is the
      // way back — without it the pair reads as broken.
      fireEvent.click(screen.getByTestId(`tab-${a}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']));
      expect(useTerminalStore.getState().activeTabId).toBe(a);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(visiblePills()).toEqual(['Unsplit', 'Unsplit']);
      // The draft survived the round trip — the panes were never remounted.
      expect(
        (screen.getAllByTestId('xterm-fallback-input')[0] as HTMLTextAreaElement).value,
      ).toBe('draft-keep-me');

      // Click the other member: the pair stays up (focus moves
      // within it), and the new tab stays hidden.
      fireEvent.click(screen.getByTestId(`tab-${b}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']));
      expect(useTerminalStore.getState().activeTabId).toBe(b);

      // Click the new tab again: single pane, pair hidden but intact.
      fireEvent.click(screen.getByTestId(`tab-${c}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/test-home']));
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(stripMarks(a)).toBe(true);
      expect(stripMarks(b)).toBe(true);
    } finally {
      unmount();
    }
  });

  test('adding a tab via the store: the pair stays restorable, and the new tab can itself be split', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/pair-a');
    const b = await useSplitPaneStore.getState().splitTab(a);
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));

      const c = await useTerminalStore.getState().createTab('/tmp/plain-c');
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(visiblePaneCwds()).toEqual(['/tmp/plain-c']);

      // Click back to the pair, then split the new tab: a second
      // pair must form without touching the first.
      fireEvent.click(screen.getByTestId(`tab-${a}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']));
      fireEvent.click(screen.getByTestId(`tab-${c}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/plain-c']));
      const d = await useSplitPaneStore.getState().splitTab(c);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(4));
      expect(visiblePaneCwds()).toEqual(['/tmp/plain-c', '/tmp/plain-c']);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, c)!)).toEqual([c, d]);
      for (const id of [a, b, c, d]) expect(stripMarks(id)).toBe(true);

      // And back to the first pair again — both pairs survive the round trip.
      fireEvent.click(screen.getByTestId(`tab-${b}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']));
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, c)!)).toEqual([c, d]);
    } finally {
      unmount();
    }
  });

  test('createTab({ activate:false }): the tab is created but the active tab does not move', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/a');
    const b = await useSplitPaneStore.getState().splitTab(a);
    expect(useTerminalStore.getState().activeTabId).toBe(b);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);

    // Background create: the tab lands in the strip, inactive,
    // and the pair's active pane keeps focus.
    const c = await useTerminalStore.getState().createTab('/tmp/c', { activate: false });
    expect(c).toBe('terminal-3');
    expect(useTerminalStore.getState().activeTabId).toBe(b);
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a, b, c]);
    expect(useTerminalStore.getState().tabs.find((t) => t.id === c)?.isActive).toBe(false);
    expect(useTerminalStore.getState().tabs.find((t) => t.id === b)?.isActive).toBe(true);
    expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);

    // Default still activates — split creation, reopen and
    // restart all rely on it.
    const d = await useTerminalStore.getState().createTab('/tmp/d');
    expect(useTerminalStore.getState().activeTabId).toBe(d);
    expect(useTerminalStore.getState().tabs.find((t) => t.id === d)?.isActive).toBe(true);
  });

  test('createTab({ activate:false }) with no active tab still activates — never an active-less state', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/a', { activate: false });
    expect(useTerminalStore.getState().activeTabId).toBe(a);
    expect(useTerminalStore.getState().tabs.find((t) => t.id === a)?.isActive).toBe(true);
  });

  test('no split visible: the + button still activates the new tab at once', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/solo-a');
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));
      expect(visiblePaneCwds()).toEqual(['/tmp/solo-a']);

      fireEvent.click(screen.getByTitle('New Terminal'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      const b = useTerminalStore.getState().tabs.find((t) => t.id !== a)!.id;
      // The common case is unchanged: the new tab shows at once.
      expect(useTerminalStore.getState().activeTabId).toBe(b);
      expect(visiblePaneCwds()).toEqual(['/tmp/test-home']);
      expect(screen.getByTestId(`tab-${a}`).getAttribute('data-split-group')).toBeNull();
      expect(screen.getByTestId(`tab-${b}`).getAttribute('data-split-group')).toBeNull();
    } finally {
      unmount();
    }
  });

  test('palette New Terminal Tab (Cmd+T path): no takeover while a split is visible, activates otherwise', async () => {
    const a = await useTerminalStore.getState().createTab('/tmp/pair-a');
    const b = await useSplitPaneStore.getState().splitTab(a);
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));

      const registry = new CommandRegistry();
      const switchView = vi.fn();
      registerBuiltinCommands(
        { switchView, toggleAI: () => {}, openHelp: () => {} },
        registry,
      );
      const ctx = {
        view: 'terminal' as const,
        hasActiveFile: false,
        hasOpenFiles: false,
        luciferAiEnabled: false,
        luciferAiSilenced: false,
      };
      expect(await registry.dispatch('terminal:new-tab', ctx)).toBe(true);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));
      const c = useTerminalStore.getState().tabs.find((t) => t.id !== a && t.id !== b)!.id;
      // The pair stays on screen; the new tab waits in the strip.
      expect(useTerminalStore.getState().activeTabId).toBe(b);
      expect(visiblePaneCwds()).toEqual(['/tmp/pair-a', '/tmp/pair-a']);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
      expect(switchView).toHaveBeenCalledWith('terminal');

      // Click the new tab, then run the command again with no
      // split visible: this time it activates at once.
      fireEvent.click(screen.getByTestId(`tab-${c}`));
      await waitFor(() => expect(visiblePaneCwds()).toEqual(['/tmp/test-home']));
      expect(await registry.dispatch('terminal:new-tab', ctx)).toBe(true);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(4));
      const d = useTerminalStore.getState().tabs.find((t) => ![a, b, c].includes(t.id))!.id;
      expect(useTerminalStore.getState().activeTabId).toBe(d);
      expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);
    } finally {
      unmount();
    }
  });
});
