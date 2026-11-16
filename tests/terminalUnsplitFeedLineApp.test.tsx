// @vitest-environment jsdom
/**
 * The unsplit feed line, LIVE (Gary, 2026-11-16 — the line never
 * appeared on build 179d944, although tests/terminalUnsplit.test.tsx
 * passed 8/8): the pill / ⌘U / palette / /unsplit all write their
 * "Closed …" line through a Terminal instance that the very unsplit
 * unmounts — on the final unsplit App moves the surviving pane
 * from the split-tree leaf to its flat host, so its Terminal
 * remounts and its xterm scrollback resets (App.tsx P1 known
 * limit), and the async termWriteLines resolves after the unmount
 * into a disposed surface. The old test rendered ONE <Terminal>
 * directly, so no tree/flat-host swap ever happened and the write
 * always landed — the test exercised the wrong topology.
 *
 * These tests render the real <App /> (the splitConjoin P1
 * harness), click the real pill, and read the real fallback
 * output — the line must survive the remount and appear in the
 * surviving pane's feed.
 *
 * Also: the strip's pair marking (the "links") is per-pair, not
 * active-tab-only — adding a new tab must not unmark the existing
 * pairs (Gary, 2026-11-16: "when you add a new tab it breaks all
 * your links").
 *
 * Run with: npx vitest run tests/terminalUnsplitFeedLineApp.test.tsx
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

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

describe('unsplit feed line, live (App level)', () => {
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
    // Close every tab through the store API (not a bare setState)
    // so tab NUMBERS are freed: resetForTests does not clear the
    // module-level usedTabNumbers, and a bare tabs:[] would leak
    // numbers across tests — later tests would create terminal-2
    // as their FIRST tab and every hardcoded id would shift.
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

  /** The fallback outputs' text, joined — the live feed in jsdom. */
  function feedText(): string {
    return screen.getAllByTestId('xterm-fallback-output').map((el) => el.textContent ?? '').join('\n');
  }

  async function waitForFeed(text: string) {
    await waitFor(() => {
      expect(feedText()).toContain(text);
    });
  }

  test('pill unsplit in the NEWEST pane (Gary’s live repro): the line survives the remount', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useSplitPaneStore.getState().splitTab(a);
    expect(b).toBe('terminal-2');
    expect(groupTabIds(findGroupForTab(useSplitPaneStore.getState().groups, a)!)).toEqual([a, b]);

    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      // Both panes' pills read Unsplit; the active pane is the
      // newest (focus follows the split), so its pill is second
      // in DOM order — the button Gary pressed live.
      const pills = screen.getAllByTestId('split-toggle-pill');
      expect(pills).toHaveLength(2);
      expect(pills[0].textContent).toBe('Unsplit');
      expect(pills[1].textContent).toBe('Unsplit');

      fireEvent.click(pills[1]);

      // The pane rejoins AND the line lands in the surviving
      // pane's feed — it used to vanish with the remount.
      await waitForFeed('Closed terminal-2 — back to one terminal.');
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);
      expect(useSplitPaneStore.getState().groups).toEqual({});
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));
      expect(screen.getAllByTestId('split-toggle-pill')[0].textContent).toBe('Split');
    } finally {
      unmount();
    }
  });

  test('pill unsplit in the SURVIVING pane: the line lands in its own feed', async () => {
    const a = await useTerminalStore.getState().createTab();
    await useSplitPaneStore.getState().splitTab(a); // terminal-2
    await useSplitPaneStore.getState().splitTab(a); // terminal-3

    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));

      // Click Unsplit in terminal-1's pill (first in DOM order):
      // terminal-3 (the newest) closes, terminal-1 survives
      // with no remount — the line must still appear exactly once.
      const pills = screen.getAllByTestId('split-toggle-pill');
      expect(pills).toHaveLength(3);
      fireEvent.click(pills[0]);

      await waitForFeed('Closed terminal-3 — 2 panes left.');
      expect(feedText().match(/Closed terminal-3 — 2 panes left\./g)?.length).toBe(1);
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
        'terminal-1',
        'terminal-2',
      ]);
      expect(Object.keys(useSplitPaneStore.getState().groups)).toHaveLength(1);
    } finally {
      unmount();
    }
  });

  test('/split writes its confirmation line into the source pane after the join remount', async () => {
    const a = await useTerminalStore.getState().createTab();
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));

      const input = screen.getByTestId('xterm-fallback-input');
      fireEvent.change(input, { target: { value: '/split' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      await waitForFeed('Split — two terminals side by side. /unsplit undoes the last split.');
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([
        'terminal-1',
        'terminal-2',
      ]);
    } finally {
      unmount();
    }
  });

  test('adding a new tab does not unmark the existing pairs in the strip', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useSplitPaneStore.getState().splitTab(a);
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      expect(screen.getByTestId(`tab-${a}`).getAttribute('data-split-group')).toBe('true');
      expect(screen.getByTestId(`tab-${b}`).getAttribute('data-split-group')).toBe('true');

      // Add a plain tab: the pair is intact in the store, and
      // the strip must keep showing it as a pair — the links
      // are per-pair, not a property of the active tab.
      const c = await useTerminalStore.getState().createTab();
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(3));
      expect(findGroupForTab(useSplitPaneStore.getState().groups, a)).not.toBeNull();
      expect(screen.getByTestId(`tab-${a}`).getAttribute('data-split-group')).toBe('true');
      expect(screen.getByTestId(`tab-${b}`).getAttribute('data-split-group')).toBe('true');
      expect(screen.getByTestId(`tab-${c}`).getAttribute('data-split-group')).toBeNull();

      // A second pair + another new tab: both pairs stay marked.
      const d = await useSplitPaneStore.getState().splitTab(c);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(4));
      const e = await useTerminalStore.getState().createTab();
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(5));
      for (const id of [a, b, c, d]) {
        expect(screen.getByTestId(`tab-${id}`).getAttribute('data-split-group')).toBe('true');
      }
      expect(screen.getByTestId(`tab-${e}`).getAttribute('data-split-group')).toBeNull();
    } finally {
      unmount();
    }
  });
});
