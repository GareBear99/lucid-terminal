// @vitest-environment jsdom
/**
 * LuciferAI silenced — potential daemon only (Gary, 2026-11-08 ~06:41 PST).
 *
 * When the blood drop is grey (silenced), LuciferAI is dormant — it
 * exists in potential and does nothing active:
 * (a) the visual causal bubbles are removed from LuciferAI inputs
 *     (they return on un-silence);
 * (b) the terminal link is disabled — LuciferAI cannot send to or
 *     receive from the terminal (the blood drop tab is inert,
 *     plugin slash commands are refused, the plugin is not probed
 *     or retried);
 * (c) awaiting commands is disabled — the "Idle • Awaiting
 *     Commands..." heartbeat is gone, commands are not queued or
 *     awaited;
 * (d) its state and causal ticks are PRESERVED, frozen, never
 *     reset or re-numbered — on un-silence everything returns
 *     exactly where it left off and the ticks resume from the
 *     frozen count.
 *
 * What is NOT gated: the OFF behavior (LuciferAI OFF = no drop,
 * plain terminal, zero residue); Persona Plex auto-speak (no gate,
 * Gary 2026-11-08 ~01:16 PST); AI Chat as a plugin (it keeps
 * working as Lucid AI — only its bubble chrome hides while
 * silenced); the Lucid-local slash commands (fix / fixnet /
 * browser / workflow / history / devmode), which run with
 * LuciferAI on, off, or silenced.
 *
 * Run with: npx vitest run tests/luciferSilenced.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import Terminal from '../src/components/Terminal/Terminal';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import AIChat from '../src/components/AI/AIChat';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useAIStore } from '../src/stores/aiStore';
import { LUCIFER_AI_SILENCED_NOTE } from '../src/lib/luciferAi';
import type { ChatMessage } from '../src/types';

// Monaco never mounts here: the loader rejects at once, so
// InputArea renders its plain-textarea fallback immediately
// (no 8s timeout, no editor).
vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => Promise.reject(new Error('monaco down')),
    config: () => {},
  },
  default: () => null,
}));

vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let writeMock: ReturnType<typeof vi.fn>;
let commandMock: ReturnType<typeof vi.fn>;
let executeCommandMock: ReturnType<typeof vi.fn>;
let settingsSetMock: ReturnType<typeof vi.fn>;
let getTokenStatsMock: ReturnType<typeof vi.fn>;

function installTerminalMock() {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
  getTokenStatsMock = vi.fn().mockResolvedValue({});
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
      executeCommand: executeCommandMock,
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: commandMock,
      getHistory: vi.fn().mockResolvedValue([{ command: 'pwd' }]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
      getTokenStats: getTokenStatsMock,
    },
    settings: { set: settingsSetMock },
  };
}

function restoreTerminalMock() {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  vi.restoreAllMocks();
}

function setTerminalSettings(patch: Partial<{ devMode: boolean; luciferAiEnabled: boolean; luciferAiSilenced: boolean }>) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, ...patch } });
}

function setActiveTab() {
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: '/tmp', isActive: true }],
    activeTabId: 'tab-1',
  });
}

/** Type a command into the detached dev bar and press Enter. */
function submitToDevBar(command: string) {
  const bar = screen.getByTestId('dev-command-bar');
  const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function devConsoleText(): string {
  return screen.getByTestId('dev-console-output').textContent ?? '';
}

describe('silenced slash commands — refused at the gate, never queued or awaited', () => {
  beforeEach(() => {
    installTerminalMock();
    useHistoryStore.setState({ blocksByTab: {} });
    setActiveTab();
    setTerminalSettings({ devMode: true, luciferAiEnabled: true, luciferAiSilenced: true });
  });

  afterEach(() => {
    restoreTerminalMock();
    useHistoryStore.setState({ blocksByTab: {} });
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false },
    });
    useTerminalStore.setState({ tabs: [], activeTabId: null });
  });

  test('/llm is refused with the silenced note and the plugin is never called', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/llm');
    await waitFor(() => {
      expect(devConsoleText()).toContain(LUCIFER_AI_SILENCED_NOTE);
    });
    expect(commandMock).not.toHaveBeenCalled();
  });

  test('/tokens is refused with the silenced note and getTokenStats is never called', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/tokens');
    await waitFor(() => {
      expect(devConsoleText()).toContain(LUCIFER_AI_SILENCED_NOTE);
    });
    expect(getTokenStatsMock).not.toHaveBeenCalled();
    expect(commandMock).not.toHaveBeenCalled();
  });

  test('/help is refused with the silenced note — the panel does not open', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/help');
    await waitFor(() => {
      expect(devConsoleText()).toContain(LUCIFER_AI_SILENCED_NOTE);
    });
    expect(commandMock).not.toHaveBeenCalled();
  });

  test('a Lucid-local command still runs while silenced — /fixnet is not a LuciferAI command', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    await waitFor(() => {
      expect(devConsoleText()).toContain('fixnet stats output');
    });
    expect(devConsoleText()).not.toContain(LUCIFER_AI_SILENCED_NOTE);
  });

  test('un-silencing restores the commands — /tokens runs again, from where it left off', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/tokens');
    await waitFor(() => {
      expect(devConsoleText()).toContain(LUCIFER_AI_SILENCED_NOTE);
    });
    expect(getTokenStatsMock).not.toHaveBeenCalled();

    // Click the grey drop = un-silence (here, flip the setting).
    setTerminalSettings({ luciferAiSilenced: false });
    submitToDevBar('/tokens');
    await waitFor(() => {
      expect(getTokenStatsMock).toHaveBeenCalled();
    });
  });
});

describe('silenced heartbeat — awaiting commands is disabled', () => {
  beforeEach(() => {
    installTerminalMock();
    useHistoryStore.setState({ blocksByTab: {} });
    setActiveTab();
  });

  afterEach(() => {
    restoreTerminalMock();
    useHistoryStore.setState({ blocksByTab: {} });
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false },
    });
    useTerminalStore.setState({ tabs: [], activeTabId: null });
  });

  test('speaking shows "Awaiting Commands"; silencing hides it; un-silencing brings it back', async () => {
    setTerminalSettings({ devMode: false, luciferAiEnabled: true, luciferAiSilenced: false });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    // The probe marks the plugin available, then the heartbeat
    // renders its idle line.
    await waitFor(() => {
      expect(screen.queryByText(/Awaiting Commands/)).not.toBeNull();
    });

    // Silence: the daemon is dormant — not awaiting anything.
    setTerminalSettings({ luciferAiSilenced: true });
    await waitFor(() => {
      expect(screen.queryByText(/Awaiting Commands/)).toBeNull();
    });

    // Un-silence: awaiting resumes exactly where it left off.
    setTerminalSettings({ luciferAiSilenced: false });
    await waitFor(() => {
      expect(screen.queryByText(/Awaiting Commands/)).not.toBeNull();
    });
  });

  test('silenced from the start never shows the heartbeat', async () => {
    setTerminalSettings({ devMode: false, luciferAiEnabled: true, luciferAiSilenced: true });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    // Let the (paused) probe settle — the heartbeat must still
    // be absent, because silenced never awaits.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Awaiting Commands/)).toBeNull();
  });
});

describe('silenced blood drop tab — the terminal link is inert', () => {
  const noop = () => undefined;
  const tabs = [{ id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true }];

  function renderTab(disabled: boolean, onChange: (active: boolean) => void) {
    return render(
      <TerminalTabsView
        tabs={tabs}
        activeTabId="t1"
        notifications={[]}
        notificationsOpen={false}
        showBloodDrop
        bloodDropActive={false}
        bloodDropDisabled={disabled}
        onBloodDropActiveChange={onChange}
        onCreateTab={noop}
        onCloseTab={noop}
        onRenameTab={noop}
        onSelectTab={noop}
        onToggleNotifications={noop}
        onDismissNotification={noop}
        onClearAllNotifications={noop}
      />,
    );
  }

  test('while silenced, clicking the blood drop tab does nothing', () => {
    const onChange = vi.fn();
    renderTab(true, onChange);
    const tab = screen.getByTestId('blood-drop-tab');
    expect(tab.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tab);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('while speaking, clicking the blood drop tab opens the panel', () => {
    const onChange = vi.fn();
    renderTab(false, onChange);
    const tab = screen.getByTestId('blood-drop-tab');
    expect(tab.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(tab);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// --- AI Chat bubbles while silenced -------------------------------------

function installAiMock() {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const noop = () => undefined;
  const mock = {
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
      getModelStatuses: vi.fn(async () => ({})),
    },
  };
  win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

function resetAiStores() {
  useAIStore.setState({
    sessions: [],
    currentSessionId: null,
    messages: [],
    contextDirectory: null,
    isLoading: false,
    isSessionsLoaded: false,
    streamingMessage: '',
    streamStartedAt: null,
    generatingSessionId: null,
    pingQuota: null,
    pendingAiPrompt: null,
  });
  useSettingsStore.setState({ hasApiKey: true });
}

const userMsg = (id: string, content: string, tick: number): ChatMessage => ({
  id,
  role: 'user',
  content,
  timestamp: 1000 + tick,
  ritualTick: tick,
});

const assistantMsg = (id: string, content: string, tick: number): ChatMessage => ({
  id,
  role: 'assistant',
  content,
  timestamp: 2000 + tick,
  ritualTick: tick,
});

describe('silenced AI Chat bubbles — the visual bubble leaves the input, the message and its tick stay', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installAiMock();
    resetAiStores();
    // jsdom has no scrollIntoView — AIChat scrolls to the newest
    // message on every messages change, so stub it or setting
    // messages throws.
    if (typeof (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView !== 'function') {
      (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
    }
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  async function settleMount() {
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
  }

  function setChatMessages() {
    useAIStore.setState({
      messages: [userMsg('u1', 'hello silenced world', 0), assistantMsg('a1', 'and the reply', 1)],
    });
  }

  function setSilenced(silenced: boolean) {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, luciferAiEnabled: true, luciferAiSilenced: silenced },
    });
  }

  test('speaking: the user input renders as a bubble (rounded, filled, right-aligned)', async () => {
    setSilenced(false);
    const { container } = render(<AIChat onClose={() => undefined} />);
    await settleMount();
    setChatMessages();
    await waitFor(() => {
      expect(screen.getByText('hello silenced world')).not.toBeNull();
    });
    // The bubble chrome: the filled rounded bubble div.
    const bubble = container.querySelector('.rounded-2xl');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain('hello silenced world');
  });

  test('silenced: the user input renders flat — no bubble chrome — but the text and its tick are unchanged', async () => {
    setSilenced(true);
    const { container } = render(<AIChat onClose={() => undefined} />);
    await settleMount();
    setChatMessages();
    await waitFor(() => {
      expect(screen.getByText('hello silenced world')).not.toBeNull();
    });
    // No bubble chrome anywhere: no rounded-2xl bubble div.
    expect(container.querySelector('.rounded-2xl')).toBeNull();
    // The message is still there, with its content intact.
    expect(screen.getByText('and the reply')).not.toBeNull();
    // The tick is preserved — silencing never re-numbers.
    const stored = useAIStore.getState().messages;
    expect(stored.find((m) => m.id === 'u1')?.ritualTick).toBe(0);
    expect(stored.find((m) => m.id === 'a1')?.ritualTick).toBe(1);
  });

  test('un-silencing brings the bubble back', async () => {
    setSilenced(true);
    const { container } = render(<AIChat onClose={() => undefined} />);
    await settleMount();
    setChatMessages();
    await waitFor(() => {
      expect(screen.getByText('hello silenced world')).not.toBeNull();
    });
    expect(container.querySelector('.rounded-2xl')).toBeNull();

    setSilenced(false);
    await waitFor(() => {
      expect(container.querySelector('.rounded-2xl')).not.toBeNull();
    });
    expect(container.querySelector('.rounded-2xl')?.textContent).toContain('hello silenced world');
  });
});
