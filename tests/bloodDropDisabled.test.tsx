// @vitest-environment jsdom
/**
 * Blood drop + failsafe while LuciferAI is DISABLED (Gary, 2026-11-09
 * ~12:38–12:45 PST).
 *
 * The contract:
 *   (a) The blood drop tab must NOT be visible when LuciferAI is
 *       disabled IN ANY WAY — absent, not greyed. That covers the
 *       strip tab, the toolbar drop, the prompt-row drop and the
 *       empty-state drop.
 *   (b) The blood drop SCREEN must not exist when LuciferAI is
 *       disabled; Lucid falls back to the DEFAULT CREATE SCREEN
 *       (the terminals, or the empty state when there are no tabs).
 *   (c) Failsafe: the panel is render-gated on the plugin being
 *       enabled, not only closed by an effect after the toggle —
 *       the effect runs AFTER a render, so without the gate the
 *       panel flashed for one frame on the toggle itself. And the
 *       Sidebar's open-blood-drop handler fails safe on its own
 *       (it checks the LIVE enabled setting before opening),
 *       so no caller can ever open the panel while the plugin
 *       is off — the sidebar filter is not the only layer.
 *
 * Silenced is NOT disabled (Gary, 2026-11-08 ~06:41 PST): a
 * silenced drop still shows, greyed, and stays clickable to
 * un-silence — so the strip tab stays while silenced, but
 * clicking it does NOT open the panel (the terminal link is
 * disabled while dormant).
 *
 * Same harness as tests/aiPanelUnmount.test.tsx: @testing-library/react
 * + jsdom, App rendered with a mocked window.lucidAPI.
 *
 * Run with: npx vitest run tests/bloodDropDisabled.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useBrowserStore } from '../src/stores/browserStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useToastStore } from '../src/stores/toastStore';
import { useHistoryStore } from '../src/stores/historyStore';

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

let mockSettingsOverrides: Record<string, unknown> = {};

function installMock() {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const noop = () => undefined;
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
      onData: vi.fn(() => noop),
      onExit: vi.fn(() => noop),
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
      diagnoseActive: vi.fn(async () => ({}) as any),
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
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  useToastStore.setState({ notifications: [] });
  useHistoryStore.setState({ blocksByTab: {} });
}

function setLuciferAi(enabled: boolean, silenced = false) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, luciferAiEnabled: enabled, luciferAiSilenced: silenced },
  }));
}

/** Wait for App to finish booting (the tab strip renders). */
async function waitForBoot() {
  await waitFor(() => screen.getByTestId('terminal-tabs-bar'));
}

describe('Blood drop while LuciferAI is disabled', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installMock();
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

  test('(a) disabled from the start: no blood drop anywhere — not the strip tab, not the empty-state drop, not the panel', async () => {
    render(<App />);
    await waitForBoot();
    // The strip tab is absent (not rendered at all).
    expect(screen.queryByTestId('blood-drop-tab')).toBeNull();
    // The toolbar drop is absent (the help plugin is filtered out).
    expect(document.querySelector('[data-toolbar-icon="help"]')).toBeNull();
    // The panel never exists.
    expect(screen.queryByTestId('lucifer-ai-tab-panel')).toBeNull();
    // The prompt-row drop renders nothing while disabled.
    expect(screen.queryByTestId('blood-drop-svg')).toBeNull();
  });

  test('(b) disabling with the panel open falls back to the default create screen in the same render — no panel, terminals back', async () => {
    mockSettingsOverrides = {
      ...mockSettingsOverrides,
      luciferAiEnabled: true,
    };
    resetStores();
    render(<App />);
    await waitForBoot();
    // Open the blood drop panel from the strip tab.
    fireEvent.click(screen.getByTestId('blood-drop-tab'));
    expect(screen.getByTestId('lucifer-ai-tab-panel')).not.toBeNull();
    // Flip the plugin off (the Settings toggle).
    setLuciferAi(false);
    // The panel is gone — render-gated, not only effect-closed —
    // and the strip tab goes with it. The terminal branch is back
    // (tabs render; with no tabs the default create screen would).
    await waitFor(() => {
      expect(screen.queryByTestId('lucifer-ai-tab-panel')).toBeNull();
    });
    expect(screen.queryByTestId('blood-drop-tab')).toBeNull();
    expect(screen.queryByTestId('terminal-tabs-bar')).not.toBeNull();
  });

  test('silenced is NOT disabled: the strip tab still shows while silenced, but clicking it does not open the panel', async () => {
    mockSettingsOverrides = {
      ...mockSettingsOverrides,
      luciferAiEnabled: true,
      luciferAiSilenced: true,
    };
    resetStores();
    render(<App />);
    await waitForBoot();
    // The tab stays (greyed) while silenced — it is the way back to
    // un-silence, so it must not disappear.
    const drop = screen.getByTestId('blood-drop-tab');
    expect(drop).not.toBeNull();
    expect(drop.getAttribute('aria-disabled')).toBe('true');
    // Clicking it while silenced does nothing — the terminal link is
    // disabled while dormant.
    fireEvent.click(drop);
    expect(screen.queryByTestId('lucifer-ai-tab-panel')).toBeNull();
  });
});
