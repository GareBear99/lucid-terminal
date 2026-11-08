// @vitest-environment jsdom
/**
 * Dev mode topology (Gary, 2026-11-07) — Terminal behaviour.
 *
 * OFF (default, topology-synced): the prompt section and the
 * xterm surface share one input topology — clicking anywhere in
 * the prompt section focuses the terminal, so typing always
 * lands in the shell. No detached bar renders.
 *
 * ON (delinked): a detached command bar appears in the prompt
 * section (revived InputArea, own input state) with its own dev
 * console beneath it. Clicking the prompt section does NOT focus
 * the terminal. Slash lines run through runSlashCommand with the
 * dev console as their output sink; bare lines run detached via
 * terminal:executeCommand. The visible terminal screen is never
 * written to by the bar, and it keeps running independently.
 *
 * Harness: jsdom has no canvas, so XtermSurface renders its
 * plain-text fallback and InputArea falls back to a plain
 * textarea (Monaco is mocked to fail fast, same pattern as
 * tests/inputArea.test.tsx) — the tests drive the fallback paths.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';

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

beforeEach(() => {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
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
      getTokenStats: vi.fn().mockResolvedValue({}),
    },
    settings: { set: settingsSetMock },
  };
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false },
  });
  vi.restoreAllMocks();
});

function setDevMode(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, devMode: enabled } });
}

function setLuciferAiEnabled(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: enabled } });
}

/** Type a command into the xterm fallback input line and press Enter. */
function submitToTerminal(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
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

function terminalOutputText(): string {
  return screen.getByTestId('xterm-fallback-output').textContent ?? '';
}

describe('dev mode OFF (default, topology-synced)', () => {
  test('no detached bar, no DEV badge — and clicking the prompt section focuses the terminal', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.queryByTestId('dev-command-bar')).toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    expect(screen.queryByText('DEV — prompt bar delinked')).toBeNull();
    // No jest-dom in this repo — assert on DOM properties, not matchers.
    expect(screen.getByTestId('prompt-section-header').textContent).toContain('plain shell');

    // The fallback input autofocuses on mount; blur it, then a
    // click anywhere in the prompt section must refocus it.
    const xtermInput = screen.getByTestId('xterm-fallback-input');
    (xtermInput as HTMLElement).blur();
    expect(document.activeElement).not.toBe(xtermInput);
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).toBe(xtermInput);
  });
});

describe('dev mode ON (delinked)', () => {
  test('detached bar + DEV badge + delinked note render; prompt-section click does NOT focus the terminal', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    expect(screen.getByTestId('dev-console')).not.toBeNull();
    expect(screen.getByText('DEV — prompt bar delinked')).not.toBeNull();
    expect(screen.getByTestId('prompt-section-header').textContent).toContain('delinked — no live cwd');
    expect(screen.getByTestId('prompt-section-header').textContent).not.toContain('plain shell');

    // Blur whatever autofocused, then a click on the prompt
    // section must NOT hand focus to the terminal: the bar is
    // independent and has to stay typable.
    const xtermInput = screen.getByTestId('xterm-fallback-input');
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).not.toBe(xtermInput);
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).not.toBe(xtermInput);
  });

  test('a slash command in the bar routes to the dev console, never the terminal screen', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    await waitFor(() => {
      expect(devConsoleText()).toContain('fixnet stats output');
    });
    // The bar never writes to the PTY or the screen.
    expect(writeMock).not.toHaveBeenCalled();
    expect(terminalOutputText()).not.toContain('fixnet stats output');
  });

  test('a bare line in the bar runs detached via executeCommand — terminal screen untouched', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('echo hello-dev');
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });
    await waitFor(() => {
      expect(devConsoleText()).toContain('hello-dev');
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(terminalOutputText()).not.toContain('hello-dev');
  });

  test('a failed detached command shows its error in the dev console, not the screen', async () => {
    executeCommandMock.mockResolvedValue({ success: false, output: '', error: 'boom' });
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('false');
    await waitFor(() => {
      expect(devConsoleText()).toContain('boom');
    });
    expect(terminalOutputText()).not.toContain('boom');
  });

  test('/help needs-LuciferAI note goes through the dev sink when off', async () => {
    setDevMode(true);
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/help');
    await waitFor(() => {
      expect(devConsoleText()).toContain('/help needs LuciferAI');
    });
    expect(terminalOutputText()).not.toContain('/help needs LuciferAI');
  });

  test('the dev console Clear button empties it', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('echo hello-dev');
    await waitFor(() => {
      expect(devConsoleText()).toContain('hello-dev');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear dev console' }));
    expect(devConsoleText()).not.toContain('hello-dev');
  });

  test('the bar works with LuciferAI ON too — dev mode is orthogonal', async () => {
    setDevMode(true);
    setLuciferAiEnabled(true);
    // The blood drop button renders only with the toggle handler
    // (same as tests/terminalPlainTerminal.test.tsx).
    render(<Terminal tabId="tab-1" luciferToggleActive={true} onToggleLuciferAi={() => {}} />);
    await screen.findByTestId('dev-command-bar');

    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    // The blood drop is still there (LuciferAI surface, untouched
    // by dev mode) — and the bar is still detached.
    expect(screen.getByRole('button', { name: 'Toggle LuciferAI' })).not.toBeNull();
    submitToDevBar('echo hello-dev');
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });
  });
});

describe('/devmode slash command', () => {
  test('/devmode on from the terminal stream turns dev mode on and shows the bar', async () => {
    setDevMode(false);
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/devmode on');
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('devMode', true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Dev mode ON');
    });
  });

  test('/devmode off from the dev bar turns it off — confirmation lands in the terminal stream', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/devmode off');
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('devMode', false);
    });
    // The bar unmounts with the flip, so its confirmation goes
    // to the stream instead (the prompt again, once re-synced).
    await waitFor(() => {
      expect(screen.queryByTestId('dev-command-bar')).toBeNull();
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Dev mode OFF');
    });
  });

  test('/devmode with no argument prints usage, and changes nothing', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/devmode');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Usage: /devmode on|off');
    });
    expect(settingsSetMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dev-command-bar')).toBeNull();
  });
});
