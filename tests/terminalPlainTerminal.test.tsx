// @vitest-environment jsdom
/**
 * Terminal as a plain terminal when LuciferAI is off (Gary,
 * 2026-11-07 ~20:17 PST): "when luciferAI is disabled or off
 * with the blood drop toggle now it should be no different then a
 * terminal".
 *
 * The deep coupling was twofold. (1) The prompt blood drop stayed
 * rendered while off (darkened, clickable) — a LuciferAI trace in
 * a terminal that was supposed to be plain. (2) The command
 * router intercepted LuciferAI words and answered them with a
 * LuciferAI refusal ("LuciferAI is disabled — enable it in
 * Settings → Plugins...") instead of letting the shell have them —
 * so words that are real shell commands (help, history, env,
 * install) never reached the PTY, and the terminal spoke
 * LuciferAI while off.
 *
 * The fix: when off, the drop is gone entirely (no leftover), the
 * heartbeat is gone, and LuciferAI command words are rewritten
 * to 'shell' before the switch, so they go to the shell PTY —
 * bash builtins work, anything else is "command not found".
 * Only the Lucid-local paths keep their handling (shell, the
 * local FixNet workflow, the browser diagnostic, the conversation
 * history, the workflow status — see PLAIN_TERMINAL_KEEPERS).
 *
 * This renders the real Terminal (LuciferAI disabled, so the
 * plugin probe short-circuits) with the Monaco editor mocked
 * (same pattern as tests/inputArea.test.tsx) and the heavy
 * children stubbed, submits commands through the prompt, and
 * asserts where each one went.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';

// --- Monaco mock (same pattern as tests/inputArea.test.tsx) ---
const mockState = vi.hoisted(() => ({
  initImpl: null as null | (() => Promise<unknown>),
  editorProps: null as null | Record<string, any>,
  mounted: false,
}));

vi.mock('@monaco-editor/react', () => {
  const fakeEditor = {
    getValue: () => '',
    setValue: () => {},
    getModel: () => null,
    setPosition: () => {},
    addCommand: () => {},
    focus: () => {},
    getContentHeight: () => 40,
    onDidContentSizeChange: () => ({ dispose: () => {} }),
  };
  const fakeMonaco = {
    editor: { defineTheme: () => {}, setTheme: () => {} },
    KeyCode: { Enter: 3, UpArrow: 16, DownArrow: 18 },
  };
  return {
    loader: {
      init: () =>
        mockState.initImpl ? mockState.initImpl() : new Promise(() => {}),
      config: () => {},
    },
    default: (props: Record<string, any>) => {
      mockState.editorProps = props;
      return (
        <div
          data-testid="monaco-editor"
          ref={(el: unknown) => {
            if (el && !mockState.mounted) {
              mockState.mounted = true;
              props.onMount?.(fakeEditor, fakeMonaco);
            }
          }}
        />
      );
    },
  };
});

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
let commandMock: ReturnType<typeof vi.fn>;
let getHistoryMock: ReturnType<typeof vi.fn>;
let clearHistoryMock: ReturnType<typeof vi.fn>;
let workflowStatusMock: ReturnType<typeof vi.fn>;
let llmListMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockState.initImpl = () => Promise.resolve();
  mockState.editorProps = null;
  mockState.mounted = false;
  // jsdom has no scrollIntoView; the terminal auto-scrolls on new blocks.
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
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
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  getHistoryMock = vi.fn().mockResolvedValue([{ command: 'pwd' }]);
  clearHistoryMock = vi.fn().mockResolvedValue(undefined);
  workflowStatusMock = vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} });
  llmListMock = vi.fn().mockResolvedValue([]);
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: commandMock,
      getHistory: getHistoryMock,
      clearHistory: clearHistoryMock,
      workflowStatus: workflowStatusMock,
      llmList: llmListMock,
    },
  };
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  vi.restoreAllMocks();
});

/** Type a command into the mocked prompt and press Send. */
function submitCommand(command: string) {
  expect(mockState.editorProps).not.toBeNull();
  act(() => {
    mockState.editorProps!.onChange(command);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
}

function setLuciferAiEnabled(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: enabled } });
}

/** No block anywhere may carry a LuciferAI refusal. */
function noRefusalInBlocks(tabId = 'tab-1') {
  const blocks = useHistoryStore.getState().blocksByTab[tabId] ?? [];
  for (const b of blocks) {
    expect(b.output ?? '').not.toContain('LuciferAI is disabled');
    expect(b.output ?? '').not.toContain('enable it in Settings');
  }
}

describe('Terminal with LuciferAI OFF is a plain terminal', () => {
  test('no blood drop next to the prompt, no heartbeat', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" luciferToggleActive={false} onToggleLuciferAi={() => {}} />);
    await screen.findByTestId('monaco-editor');
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    expect(screen.queryByText('🩸')).toBeNull();
    expect(screen.queryByText(/Awaiting Commands/)).toBeNull();
  });

  test('LuciferAI words go to the shell PTY — llm, tokens, help, env', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');

    for (const cmd of ['llm list', 'tokens', 'help', 'env']) {
      submitCommand(cmd);
      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledWith('tab-1', `${cmd}\n`);
      });
    }
    // No LuciferAI refusal anywhere — the terminal never spoke LuciferAI.
    noRefusalInBlocks();
    // Nothing went to the plugin backend for these.
    expect(commandMock).not.toHaveBeenCalled();
    expect(llmListMock).not.toHaveBeenCalled();
  });

  test('plan does NOT open the planning panel when off — it goes to the shell', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
    submitCommand('plan');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'plan\n');
    });
    expect(screen.queryByText('Manage and track implementation plans')).toBeNull();
    noRefusalInBlocks();
  });

  test('a natural-language query goes to the shell, not the plugin', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
    submitCommand('explain docker containers');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'explain docker containers\n');
    });
    expect(commandMock).not.toHaveBeenCalled();
    noRefusalInBlocks();
  });

  test('the Lucid-local paths keep working when off — fixnet, history, workflow', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');

    submitCommand('fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    expect(writeMock).not.toHaveBeenCalledWith('tab-1', 'fixnet stats\n');

    submitCommand('history');
    await waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalled();
    });

    submitCommand('workflow status');
    await waitFor(() => {
      expect(workflowStatusMock).toHaveBeenCalled();
    });
    noRefusalInBlocks();
  });

  test('shell commands still go to the shell', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
    submitCommand('ls -la');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'ls -la\n');
    });
    noRefusalInBlocks();
  });
});

describe('Terminal with LuciferAI ON keeps the drop and the plugin routing', () => {
  test('the blood drop renders lit, and llm list goes to the plugin — not the shell', async () => {
    setLuciferAiEnabled(true);
    const { unmount } = render(
      <Terminal tabId="tab-1" luciferToggleActive={true} onToggleLuciferAi={() => {}} />,
    );
    try {
      await screen.findByTestId('monaco-editor');
      const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
      expect(button).toBeTruthy();
      expect(button.className.split(' ')).toContain('opacity-100');
      expect(button.className.split(' ')).not.toContain('opacity-40');

      submitCommand('llm list');
      await waitFor(() => {
        expect(llmListMock).toHaveBeenCalledTimes(1);
      });
      expect(writeMock).not.toHaveBeenCalledWith('tab-1', 'llm list\n');
    } finally {
      unmount();
    }
  });
});
