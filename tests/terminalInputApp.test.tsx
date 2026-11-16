// @vitest-environment jsdom
/**
 * Terminal input at App level (Gary, 2026-11-16 — "terminals dont
 * take input anymore" on cea360f): typing in a terminal must reach
 * the PTY write path — in a plain tab, in a split pane, and after
 * an unsplit remounts the surviving pane.
 *
 * The direct-<Terminal> test (terminalPlainTerminal.test.tsx)
 * passes 8/8 on clean cea360f, so the fallback input → onInput →
 * handleXtermInput → ptyWrite chain works when Terminal is rendered
 * alone. This file renders the real <App /> (the splitConjoin P1
 * harness): the App hosting — flat host vs tree leaf, the remount
 * on split/unsplit, focus-follows-newest-pane — is the part the
 * direct test never exercises.
 *
 * Harness: jsdom has no canvas 2d context, so XtermSurface renders
 * its plain-text fallback (xterm-fallback-input textarea) with the
 * same per-keystroke `onInput` contract as the real surface.
 *
 * Run with: npx vitest run tests/terminalInputApp.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSplitPaneStore } from '../src/stores/splitPaneStore';
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

/** jsdom has no IntersectionObserver: the fix observes the
 *  terminal root for becoming visible, so the tests drive it
 *  through this mock. observe() records the target; fireAll
 *  delivers an intersection change for every observed target. */
type IOCallback = (
  entries: Array<{ isIntersecting: boolean; target: Element }>,
  observer: unknown,
) => void;
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  targets = new Set<Element>();
  constructor(callback: IOCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  static fireAll(isIntersecting: boolean) {
    for (const inst of MockIntersectionObserver.instances) {
      const entries = [...inst.targets].map((target) => ({ isIntersecting, target }));
      if (entries.length > 0) inst.callback(entries, inst);
    }
  }
  static reset() {
    MockIntersectionObserver.instances = [];
  }
}

describe('terminal input at App level', () => {
  let restoreLucidAPI: () => void;
  let writeMock: ReturnType<typeof vi.fn>;

  function installMock() {
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    const noop = () => undefined;
    writeMock = vi.fn(async () => undefined);
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
      terminal: { create: vi.fn(async () => undefined), write: writeMock, destroy: vi.fn(async () => undefined), onData: vi.fn(() => noop), onExit: vi.fn(() => noop), onCwd: vi.fn(() => noop) },
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
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    MockIntersectionObserver.reset();
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', { value: vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })), configurable: true });
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    resetStores();
  });

  afterEach(() => { restoreLucidAPI(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  /** Everything written to the PTY so far for `tabId`, in order. */
  function ptyWritten(tabId: string): string {
    return writeMock.mock.calls
      .filter((c) => c[0] === tabId)
      .map((c) => String(c[1]))
      .join('');
  }

  /** Type `text` + Enter into the fallback input at `index`. */
  function typeIntoPane(text: string, index = 0) {
    const input = screen.getAllByTestId('xterm-fallback-input')[index];
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  test('plain tab: typing reaches the PTY', async () => {
    const a = await useTerminalStore.getState().createTab();
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));

      typeIntoPane('ls -la');
      await waitFor(() => {
        expect(ptyWritten(a)).toContain('ls -la\r');
      });
    } finally {
      unmount();
    }
  });

  test('split panes: typing in each pane reaches its own PTY', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useSplitPaneStore.getState().splitTab(a);
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));

      typeIntoPane('echo one', 0);
      await waitFor(() => {
        expect(ptyWritten(a)).toContain('echo one\r');
      });
      typeIntoPane('echo two', 1);
      await waitFor(() => {
        expect(ptyWritten(b)).toContain('echo two\r');
      });
      // Nothing crossed panes.
      expect(ptyWritten(a)).not.toContain('echo two');
      expect(ptyWritten(b)).not.toContain('echo one');
    } finally {
      unmount();
    }
  });

  test('after unsplit remount: the surviving pane still takes input', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useSplitPaneStore.getState().splitTab(a);
    expect(b).toBe('terminal-2');
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));

      // Unsplit from the newest pane's pill (Gary's live repro):
      // the surviving pane remounts flat-host — its xterm is a
      // fresh surface on the live PTY.
      const pills = screen.getAllByTestId('split-toggle-pill');
      fireEvent.click(pills[1]);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));
      expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual(['terminal-1']);

      typeIntoPane('pwd');
      await waitFor(() => {
        expect(ptyWritten(a)).toContain('pwd\r');
      });
    } finally {
      unmount();
    }
  });

  test('after /split + /unsplit round trip: the surviving pane still takes input', async () => {
    const a = await useTerminalStore.getState().createTab();
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));

      typeIntoPane('/split');
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      typeIntoPane('/unsplit', 1);
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));

      typeIntoPane('whoami');
      await waitFor(() => {
        expect(ptyWritten(a)).toContain('whoami\r');
      });
    } finally {
      unmount();
    }
  });

  test('switching tabs focuses the newly active terminal (Gary 2026-11-16: terminals dont take input)', async () => {
    const a = await useTerminalStore.getState().createTab();
    const b = await useTerminalStore.getState().createTab();
    expect(b).toBe('terminal-2');
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(2));
      const inputs = screen.getAllByTestId('xterm-fallback-input');
      expect(inputs).toHaveLength(2);
      // The new tab is active and its input is focused (mount).
      expect(document.activeElement).toBe(inputs[1]);

      // Move focus away — the strip button takes it, the way a
      // real click does — then click the FIRST tab in the strip.
      // The tab switch must hand focus to that tab's terminal:
      // focus is only ever set at surface mount, so a switch
      // between already-mounted tabs leaves focus on the strip
      // (BODY in the live app) and typing goes nowhere.
      screen.getByTitle('New Terminal').focus();
      expect(document.activeElement).toBe(screen.getByTitle('New Terminal'));
      fireEvent.click(screen.getByTestId(`tab-${a}`));

      await waitFor(() => {
        expect(document.activeElement).toBe(inputs[0]);
      });
      // And typing now reaches that tab's PTY.
      typeIntoPane('pwd', 0);
      await waitFor(() => {
        expect(ptyWritten(a)).toContain('pwd\r');
      });
    } finally {
      unmount();
    }
  });

  test('becoming visible refocuses the active terminal (return from another view)', async () => {
    await useTerminalStore.getState().createTab();
    const { unmount } = render(<App />);
    try {
      await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
      await waitFor(() => expect(screen.getAllByTestId('xterm-surface')).toHaveLength(1));
      const input = screen.getByTestId('xterm-fallback-input');
      expect(document.activeElement).toBe(input);

      // The terminal is hidden while another view is up (the
      // container takes `hidden`) and shown again on return —
      // no remount, no activation change, so nothing refocuses
      // it. The visibility observer is what hands focus back.
      screen.getByTitle('New Terminal').focus();
      expect(document.activeElement).toBe(screen.getByTitle('New Terminal'));
      MockIntersectionObserver.fireAll(false);
      MockIntersectionObserver.fireAll(true);

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    } finally {
      unmount();
    }
  });
});
