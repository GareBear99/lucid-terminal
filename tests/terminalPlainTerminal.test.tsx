// @vitest-environment jsdom
/**
 * Terminal with LuciferAI OFF is a plain terminal (Gary, 2026-11-07
 * ~20:17 PST): "with the blood drop toggle now it should be no
 * different then a terminal".
 *
 * REAL TERMINAL (Gary, 2026-11-07: "terminal is not a terminal at
 * all"): the surface is xterm.js on a node-pty login shell — bare
 * words go to the shell PTY per keystroke, and Lucid commands are
 * slash-only. This file pins the OFF behaviour under that design:
 *
 * - OFF: no blood drop next to the prompt, no heartbeat.
 * - OFF: bare LuciferAI words (`llm list`, `tokens`, `help`,
 *   `env`, `plan`, natural language) go to the shell PTY — the
 *   terminal never speaks LuciferAI and never calls the plugin.
 * - OFF: the Lucid-local paths still work, but ONLY as slash
 *   commands (`/fixnet stats`, `/history`, `/workflow status`).
 *   Their bare forms are shell commands now.
 * - ON: the blood drop renders lit, and `/llm list` goes to the
 *   plugin — while bare `llm list` still goes to the shell.
 *
 * The deep coupling was twofold. (1) The prompt blood drop stayed
 * visible (darkened) while the plugin was off. (2) The terminal
 * intercepted LuciferAI words and either refused them or routed
 * them to the plugin. Both are gone: the drop renders only while
 * on, and bare words reach the shell.
 *
 * Harness: jsdom has no canvas 2d context, so XtermSurface renders
 * its plain-text fallback (xterm-fallback-input textarea +
 * xterm-fallback-output pane) with the same per-keystroke `onInput`
 * contract as the real surface. Typing here drives the same code
 * path the real terminal takes. The heavy children are stubbed
 * (SentinelFace runs a rAF gaze loop; FixNetStatus fetches stats
 * on mount).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';

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

/** Type a command into the fallback input line and press Enter. */
function submitCommand(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Everything written to the PTY so far, in order. Keystrokes go
 *  per keystroke (or per change event in the fallback), so a
 *  submitted line arrives as the chars plus '\r' — or, for a slash
 *  line, the chars plus '\x15\r' (the line wiped from the shell). */
function ptyWritten(): string {
  return writeMock.mock.calls.map((c) => String(c[1])).join('');
}

/** The fallback output pane's text so far. */
function outputText(): string {
  return screen.getByTestId('xterm-fallback-output').textContent ?? '';
}

/** Wait until a slash command's output has landed in the pane — i.e.
 *  the async chain (80 ms echo wait → write → finally) has
 *  finished. The old waits only checked the backend mock, so the
 *  test ended while the chain was still pending; on the macOS
 *  release runner the file's jsdom env tore down inside that
 *  window and the finally's setState threw an unhandled rejection
 *  (run 42640504309). Waiting for the output closes the window. */
async function waitForOutput(text: string) {
  await waitFor(() => {
    expect(outputText()).toContain(text);
  });
}

function setLuciferAiEnabled(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: enabled } });
}

/** No LuciferAI refusal anywhere in the terminal output. */
function noRefusalInOutput() {
  const output = screen.getByTestId('xterm-fallback-output').textContent ?? '';
  expect(output).not.toContain('LuciferAI is disabled');
  expect(output).not.toContain('enable it in Settings');
}

describe('Terminal with LuciferAI OFF is a plain terminal', () => {
  test('no blood drop next to the prompt, no heartbeat', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" luciferToggleActive={false} onToggleLuciferAi={() => {}} />);
    await screen.findByTestId('xterm-surface');
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    expect(screen.queryByText('🩸')).toBeNull();
    expect(screen.queryByText(/Awaiting Commands/)).toBeNull();
  });

  test('LuciferAI words go to the shell PTY — llm, tokens, help, env', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    for (const cmd of ['llm list', 'tokens', 'help', 'env']) {
      submitCommand(cmd);
      await waitFor(() => {
        expect(ptyWritten()).toContain(`${cmd}\r`);
      });
    }
    // No LuciferAI refusal anywhere — the terminal never spoke LuciferAI.
    noRefusalInOutput();
    // Nothing went to the plugin backend for these.
    expect(commandMock).not.toHaveBeenCalled();
    expect(llmListMock).not.toHaveBeenCalled();
  });

  test('plan does NOT open the planning panel when off — it goes to the shell', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    submitCommand('plan');
    await waitFor(() => {
      expect(ptyWritten()).toContain('plan\r');
    });
    expect(screen.queryByText('Manage and track implementation plans')).toBeNull();
    noRefusalInOutput();
  });

  test('a natural-language query goes to the shell, not the plugin', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    submitCommand('explain docker containers');
    await waitFor(() => {
      expect(ptyWritten()).toContain('explain docker containers\r');
    });
    expect(commandMock).not.toHaveBeenCalled();
    noRefusalInOutput();
  });

  test('the Lucid-local paths keep working when off — as SLASH commands only', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    // Slash form: runs the local path, and the line is wiped from
    // the shell (Ctrl+U) instead of executed by it.
    submitCommand('/fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    await waitForOutput('fixnet stats output');
    expect(ptyWritten()).toContain('\x15\r');
    expect(ptyWritten()).not.toContain('fixnet stats\r');

    submitCommand('/history');
    await waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalled();
    });
    await waitForOutput('pwd');

    submitCommand('/workflow status');
    await waitFor(() => {
      expect(workflowStatusMock).toHaveBeenCalled();
    });
    await waitForOutput('workflow');

    // Bare forms are shell commands now — they go to the PTY as
    // executed lines.
    submitCommand('fixnet stats');
    await waitFor(() => {
      expect(ptyWritten()).toContain('fixnet stats\r');
    });
    noRefusalInOutput();
  });

  test('shell commands still go to the shell', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    submitCommand('ls -la');
    await waitFor(() => {
      expect(ptyWritten()).toContain('ls -la\r');
    });
    noRefusalInOutput();
  });
});

describe('Terminal with LuciferAI ON keeps the drop and the plugin routing', () => {
  test('the blood drop renders lit, and /llm list goes to the plugin — not the shell', async () => {
    setLuciferAiEnabled(true);
    const { unmount } = render(
      <Terminal tabId="tab-1" luciferToggleActive={true} onToggleLuciferAi={() => {}} />,
    );
    try {
      await screen.findByTestId('xterm-surface');
      const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
      expect(button).toBeTruthy();
      expect(button.className.split(' ')).toContain('opacity-100');
      expect(button.className.split(' ')).not.toContain('opacity-40');

      submitCommand('/llm list');
      await waitFor(() => {
        expect(llmListMock).toHaveBeenCalledTimes(1);
      });
      // Wait for the output to land before unmounting — otherwise
      // the slash chain is still pending at unmount (see
      // waitForOutput) and only the mounted guard stands between
      // it and the torn-down env.
      await waitForOutput('[]');
      // The slash line was wiped from the shell, never executed.
      expect(ptyWritten()).not.toContain('llm list\r');
    } finally {
      unmount();
    }
  });

  test('bare llm list goes to the shell even when ON — only the slash form is Lucid', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    submitCommand('llm list');
    await waitFor(() => {
      expect(ptyWritten()).toContain('llm list\r');
    });
    expect(llmListMock).not.toHaveBeenCalled();
  });
});
