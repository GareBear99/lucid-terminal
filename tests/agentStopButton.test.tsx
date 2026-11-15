// @vitest-environment jsdom
/**
 * Zed Stop button (2026-11-15): the terminal chrome's Stop
 * button for a running agent turn.
 *
 * - Appears only while this tab is in agent mode AND a run is
 *   in flight (the reactive agentRunStore signal).
 * - Clicking it calls stopAgentRun for the tab (the abort
 *   itself — AbortController fires, pending reviews cancel —
 *   is covered in tests/agentSession.test.ts).
 * - Gone the moment the signal clears (the run's finally).
 * - Never shows in guest: agent mode is refused there, so no
 *   run can be in flight.
 *
 * Placement (recorded): a separate chrome button beside the
 * composer in renderPrompterComposer — NOT InputArea's
 * onInterrupt, which is the shell Ctrl+C interrupt (\x03 to
 * the PTY), a different action from aborting an agent run.
 *
 * Harness: the prompterComposerBorder pattern — jsdom has no
 * canvas, so XtermSurface renders its plain-text fallback and
 * InputArea falls back to a plain textarea (Monaco mocked to
 * fail fast). The heavy children are stubbed.
 */
import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSessionStore } from '../src/stores/sessionStore';
import { useAgentRunStore } from '../src/stores/agentRunStore';
import { stopAgentRun } from '../src/lib/agentSession';

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
vi.mock('../src/components/FixNet/FixNetStatus', () => ({
  FixNetStatus: () => null,
}));

// The button's only job is to call stopAgentRun for the tab —
// spy on it (the abort's effects are the session tests'). The
// rest of the module stays real.
vi.mock('../src/lib/agentSession', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/agentSession')>();
  return { ...orig, stopAgentRun: vi.fn(() => true) };
});

const mockedStopAgentRun = stopAgentRun as unknown as Mock;

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

const TAB_CWD = '/Users/gary/lucid-terminal';

beforeEach(() => {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      create: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      onData: () => () => {},
      onExit: () => () => {},
      onCwd: () => () => {},
      write: vi.fn(),
      executeCommand: vi.fn().mockResolvedValue({ success: true, output: '' }),
    },
    fs: { getHomeDir: vi.fn().mockResolvedValue('/home/test') },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: vi.fn().mockResolvedValue({}),
      getHistory: vi.fn().mockResolvedValue([]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
    },
  };
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true } as never],
    activeTabId: 'tab-1',
  });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useSessionStore.getState().resetForTests();
  useAgentRunStore.getState().resetAgentRunStoreForTests();
  mockedStopAgentRun.mockClear();
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: true, defconLevel: 3 },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  useSessionStore.getState().resetForTests();
  useAgentRunStore.getState().resetAgentRunStoreForTests();
  vi.restoreAllMocks();
});

/** Flip the tab to agent mode — the composer is its input. */
function enterAgentMode() {
  expect(useSessionStore.getState().setTabMode('tab-1', 'agent')).toBe('agent');
}

describe('Terminal: agent Stop button (Zed follow-on, 2026-11-15)', () => {
  test('appears only while a run is in flight, and disappears when the run ends', async () => {
    enterAgentMode();
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer');

    // No run in flight — no button.
    expect(screen.queryByTestId('agent-stop')).toBeNull();

    // The run starts — the signal fires, the button appears.
    act(() => {
      useAgentRunStore.getState().setAgentRunInFlight('tab-1', true);
    });
    await screen.findByTestId('agent-stop');

    // The run ends — the signal clears, the button is gone.
    act(() => {
      useAgentRunStore.getState().setAgentRunInFlight('tab-1', false);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('agent-stop')).toBeNull();
    });
  });

  test('clicking Stop calls stopAgentRun for this tab', async () => {
    enterAgentMode();
    act(() => {
      useAgentRunStore.getState().setAgentRunInFlight('tab-1', true);
    });
    render(<Terminal tabId="tab-1" />);
    const button = await screen.findByTestId('agent-stop');

    fireEvent.click(button);

    expect(mockedStopAgentRun).toHaveBeenCalledTimes(1);
    expect(mockedStopAgentRun).toHaveBeenCalledWith('tab-1');
  });

  test('no button in terminal mode, even when the signal is set', async () => {
    // The tab stays in terminal mode; the signal alone must
    // never surface the button (it is an agent-run control).
    act(() => {
      useAgentRunStore.getState().setAgentRunInFlight('tab-1', true);
    });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer');

    expect(screen.queryByTestId('agent-stop')).toBeNull();
  });

  test('no button in guest — agent mode is refused there', async () => {
    useHistoryStore.setState({ guestSessionActive: true });
    // The flip itself is refused in guest (setTabMode
    // returns null) — the tab stays in terminal mode.
    expect(useSessionStore.getState().setTabMode('tab-1', 'agent')).toBeNull();
    act(() => {
      useAgentRunStore.getState().setAgentRunInFlight('tab-1', true);
    });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer');

    expect(screen.queryByTestId('agent-stop')).toBeNull();
  });
});
