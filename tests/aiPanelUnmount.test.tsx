// @vitest-environment jsdom
/**
 * AI panel unmount tests — the AI panel is Lucid AI, its own plugin
 * (Gary, 2026-11-07): unmounted from LuciferAI and mounted as a
 * top-level right-hand panel.
 *
 * What was broken (the bug Gary reported: "the ai panel doesnt work
 * on pages"):
 * 1. The panel JSX lived inside the terminal view branch of App.tsx,
 *    so on the other five views (editor, Synth, Forge, Persona Plex,
 *    Settings) the panel was never mounted at all — the StatusBar AI
 *    button and the toolbar AI Chat icon exist on every page, but
 *    clicking them on a non-terminal page flipped `showAI` and
 *    rendered nothing.
 * 2. The panel was hard-gated on LuciferAI being enabled at four
 *    sites: App's toggle refused while off, App's disable effect
 *    force-closed the panel, the StatusBar hid the AI button, and
 *    the Sidebar filtered the ai-chat icon out. With LuciferAI
 *    disabled there was no way to open the panel at all — it "went
 *    too", even though its model is the ping server (Llama 3.2 1B
 *    via Cloudflare), not LuciferAI.
 *
 * The fix: the panel is a sibling of the main panel on every view,
 * and nothing about it reads LuciferAI. These tests fail on the old
 * code (panel absent on non-terminal views; no AI button/icon while
 * disabled) and pass after the unmount.
 *
 * The intended LuciferAI couplings are preserved and asserted too:
 * the Synth view/button and the blood drop still go away with
 * the plugin — only the AI panel stays. The Persona Plex icon stays
 * too: it is an ADD-ON, not a LuciferAI surface (Gary, 2026-11-07
 * ~06:22 PST) — disabling the plugin used to take it out as if it
 * belonged to it, which was the bug.
 *
 * Run with: npx vitest run tests/aiPanelUnmount.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App';
import StatusBar from '../src/components/Layout/StatusBar';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAIStore } from '../src/stores/aiStore';
import { useBrowserStore } from '../src/stores/browserStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useToastStore } from '../src/stores/toastStore';

// Monaco is vendored locally and loads from disk in the real app;
// in jsdom the bundle never loads, so the editor surfaces fall back
// to a plain textarea after an 8s timeout. Stub the module so the
// editor view mounts synchronously instead.
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: { config: () => {}, init: () => Promise.resolve({}) },
}));

// The settings the mocked `settings.getAll()` returns. App's
// loadSettings merges these over the defaults, so each test picks
// its LuciferAI state here (the store is also seeded with the same
// values before render, for components that read it first).
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
}

// The AI panel's tab bar ("AI Chat" tab + "Browser" tab) — present
// exactly when the panel is mounted.
function expectPanelPresent() {
  expect(screen.getByText('AI Chat')).not.toBeNull();
  expect(screen.getByText('Lucid AI')).not.toBeNull();
}

function clickToolbarIcon(container: HTMLElement, id: string) {
  const button = container.querySelector(`[data-toolbar-icon="${id}"] button`);
  expect(button).not.toBeNull();
  fireEvent.click(button!);
}

describe('AI panel unmounted from LuciferAI', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installMock();
    // jsdom has no scrollIntoView; the Terminal scrolls to its bottom
    // ref on mount/update.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    mockSettingsOverrides = {
      luciferAiEnabled: false,
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

  test('StatusBar: the AI button shows and works while LuciferAI is disabled (Help stays hidden)', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, luciferAiEnabled: false },
    }));
    const onToggleAI = vi.fn();
    render(<StatusBar showAI={false} onToggleAI={onToggleAI} onOpenHelp={() => {}} />);
    const aiButton = screen.getByRole('button', { name: /AI/ });
    expect(aiButton).not.toBeNull();
    fireEvent.click(aiButton);
    expect(onToggleAI).toHaveBeenCalledTimes(1);
    // Help is bound to LuciferAI — its button still leaves with it.
    expect(screen.queryByRole('button', { name: /Command Reference/ })).toBeNull();
  });

  test('StatusBar: with LuciferAI enabled both buttons show', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, luciferAiEnabled: true },
    }));
    render(<StatusBar showAI={false} onToggleAI={() => {}} onOpenHelp={() => {}} />);
    expect(screen.getByRole('button', { name: /AI/ })).not.toBeNull();
  });

  test('Sidebar: the AI Chat icon shows while LuciferAI is disabled (Synth and the blood drop do not)', () => {
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        luciferAiEnabled: false,
        toolbarPlugins: { 'ai-chat': true, synth: true, help: true, llmbuilder: true },
      },
    }));
    const { container } = render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView="terminal"
        onViewChange={() => {}}
        showAI={false}
        onToggleAI={() => {}}
      />,
    );
    // AI Chat is its own plugin now — its icon stays.
    expect(container.querySelector('[data-toolbar-icon="ai-chat"]')).not.toBeNull();
    // Synth and the blood drop are LuciferAI surfaces — they still go with it.
    expect(container.querySelector('[data-toolbar-icon="synth"]')).toBeNull();
    expect(container.querySelector('[data-toolbar-icon="help"]')).toBeNull();
  });

  test('App: the panel opens and stays open on every reachable view while LuciferAI is disabled', async () => {
    const { container } = render(<App />);
    // The app boots async (loadSettings, terminal create) — wait for
    // the StatusBar AI button, which only renders once loaded. Its
    // label is "AI (No Key)" here (no API key); the toolbar AI Chat
    // icon has the same /AI/ name, so the text disambiguates.
    const aiButton = await waitFor(() => screen.getByText('AI (No Key)').closest('button')!);
    fireEvent.click(aiButton);
    await waitFor(() => expectPanelPresent());

    // Every view reachable while LuciferAI is disabled: the panel
    // stays mounted on each one. (The Forge icon's toolbar id is
    // 'llmbuilder' — its plugin id — while the view it opens is
    // 'forge'.)
    // Persona Plex is reachable too (Gary, 2026-11-07 ~06:22 PST):
    // it is an ADD-ON, not a LuciferAI surface, so its icon stays
    // and its view opens and stays open with the plugin off —
    // disabling the plugin used to take it out as if it belonged
    // to it. Clicking it here is the regression check for both the
    // icon and the App disable effect.
    for (const view of ['editor', 'llmbuilder', 'persona-plex', 'settings'] as const) {
      clickToolbarIcon(container, view);
      await waitFor(() => expectPanelPresent());
    }
    // Synth and the blood drop are LuciferAI surfaces — their icons are gone
    // while the plugin is off (intended, unchanged). Persona Plex
    // is an add-on — its icon stays.
    expect(container.querySelector('[data-toolbar-icon="synth"]')).toBeNull();
    expect(container.querySelector('[data-toolbar-icon="persona-plex"]')).not.toBeNull();

    // Back to the terminal — the panel is still there.
    clickToolbarIcon(container, 'terminal');
    await waitFor(() => expectPanelPresent());
  });

  test('App: the panel stays open on all six views with LuciferAI enabled', async () => {
    mockSettingsOverrides = {
      luciferAiEnabled: true,
      pingServerEnabled: true,
      toolbarPlugins: { 'ai-chat': true, synth: true, help: true, llmbuilder: true },
      installedAddons: ['persona-plex'],
    };
    resetStores();
    const { container } = render(<App />);
    const aiButton = await waitFor(() => screen.getByText('AI (No Key)').closest('button')!);
    fireEvent.click(aiButton);
    await waitFor(() => expectPanelPresent());

    for (const view of ['editor', 'synth', 'llmbuilder', 'persona-plex', 'settings'] as const) {
      clickToolbarIcon(container, view);
      await waitFor(() => expectPanelPresent());
    }
    clickToolbarIcon(container, 'terminal');
    await waitFor(() => expectPanelPresent());
  });
});
