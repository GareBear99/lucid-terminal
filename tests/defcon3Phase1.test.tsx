// @vitest-environment jsdom
/**
 * DEFCON 3 Phase 1 — linked composer in devmode (Gary, 2026-11-09
 * ~08:10 PST — "proceed until complete", same composer in both
 * modes).
 *
 * At DEFCON 3+ in devmode the prompt-section composer is LINKED to
 * the terminal it sits under (the prompter): slash lines route
 * explicitly to runSlashCommand (never the shell, no wipe — the
 * line was never echoed); bare lines go composed `text + '\r'`
 * via terminal.write into the real shell; output sinks to the
 * terminal feed in ALL THREE LuciferAI states (on / off /
 * silenced) — the dev console is retired as a composer sink.
 * While the composer owns typing, xterm keystrokes must not also
 * reach the PTY; the xterm cursor is hidden always at level 3.
 * One InputArea across LuciferAI on/off (dragged height lifted
 * into Terminal), so toggling never resets it.
 *
 * Below 3 today's behavior is unchanged (typing at the xterm
 * cursor; dev bar delinked in devmode) — covered by
 * tests/devModeTerminal.test.tsx at level 1, plus one explicit
 * level-2 check here. Non-devmode landing is a later phase:
 * at level 3 in non-devmode the cursor stays and xterm keeps
 * owning input.
 *
 * Harness: same as tests/devModeTerminal.test.tsx — jsdom has no
 * canvas, so XtermSurface renders its plain-text fallback and
 * InputArea falls back to a plain textarea (Monaco mocked to fail
 * fast).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { defconPrompterActive } from '../src/lib/defcon';

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
    settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false, defconLevel: 1, defconMergeReading: null },
  });
  vi.restoreAllMocks();
});

function setDefconLevel(level: 1 | 2 | 3) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, defconLevel: level } });
}

function setDevMode(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, devMode: enabled } });
}

function setLuciferAiEnabled(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: enabled } });
}

function setLuciferAiSilenced(silenced: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiSilenced: silenced } });
}

/** Type a command into the DEFCON 3 composer and press Enter. */
function submitToComposer(command: string) {
  const bar = screen.getByTestId('dev-command-bar');
  const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Type a command into the xterm fallback input line and press Enter. */
function submitToTerminal(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function terminalOutputText(): string {
  return screen.getByTestId('xterm-fallback-output').textContent ?? '';
}

describe('defconPrompterActive — the level is the switch (DEFCON 2 precedent)', () => {
  test('off at levels 1 and 2, on at level 3', () => {
    expect(defconPrompterActive(1)).toBe(false);
    expect(defconPrompterActive(2)).toBe(false);
    expect(defconPrompterActive(3)).toBe(true);
  });
});

describe('DEFCON 3 linked composer in devmode — submit routing', () => {
  test('a slash line from the composer runs as a Lucid command and never reaches the shell', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('/fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    // The composed slash line is echoed into the feed above its
    // output — and the output lands in the terminal feed.
    await waitFor(() => {
      expect(terminalOutputText()).toContain('$ /fixnet stats');
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('fixnet stats output');
    });
    // Never the shell: no PTY write, no one-shot execution.
    expect(writeMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  test('a bare line goes via terminal.write with \\r — never one-shot executeCommand', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi\r');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  test('composer output reaches the terminal feed with LuciferAI OFF (the old OFF-case gap, closed)', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    // The dev console is retired as a composer sink — it does not
    // render at DEFCON 3 even while the note would have gone there.
    expect(screen.queryByTestId('dev-console')).toBeNull();

    submitToComposer('/help');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('/help needs LuciferAI');
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dev-console')).toBeNull();
  });

  test('composer output reaches the terminal feed while LuciferAI is SILENCED', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    setLuciferAiSilenced(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    expect(screen.queryByTestId('dev-console')).toBeNull();

    submitToComposer('/help');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('LuciferAI is silenced');
    });
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('Lucid-local commands still run while SILENCED — and their output lands in the feed', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    setLuciferAiSilenced(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('/fixnet stats');
    await waitFor(() => {
      expect(commandMock).toHaveBeenCalledWith('fixnet stats');
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('fixnet stats output');
    });
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe('DEFCON 3 cursor — hidden always at level 3, present below 3', () => {
  test('level 3, devmode: cursor hidden', async () => {
    setDevMode(true);
    setDefconLevel(3);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('true');
  });

  test('level 1, devmode: cursor present', async () => {
    setDevMode(true);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('false');
  });

  test('level 2, devmode: cursor present', async () => {
    setDevMode(true);
    setDefconLevel(2);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('false');
  });

  test('level 3, NON-devmode: cursor present — the prompter has not landed there yet (Phase 5)', async () => {
    setDevMode(false);
    setDefconLevel(3);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('false');
  });
});

describe('DEFCON 3 input ownership — the composer owns typing', () => {
  test('xterm keystrokes do not reach the PTY while the composer owns typing', async () => {
    setDevMode(true);
    setDefconLevel(3);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToTerminal('echo hi');
    // Let any ungated path settle — nothing may be written.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(writeMock).not.toHaveBeenCalled();
    expect(terminalOutputText()).not.toContain('echo hi');
  });

  test('below 3, xterm input still reaches the PTY (unchanged behavior)', async () => {
    setDevMode(true);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi');
    });
  });

  test('clicking the prompt section keeps the composer typable — it does not focus xterm', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const bar = screen.getByTestId('dev-command-bar');
    const composer = within(bar).getByPlaceholderText(/Monaco unavailable/) as HTMLElement;
    const xtermInput = screen.getByTestId('xterm-fallback-input');
    composer.focus();
    expect(document.activeElement).toBe(composer);
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).toBe(composer);
    expect(document.activeElement).not.toBe(xtermInput);
  });
});

describe('DEFCON 3 one composer across LuciferAI on/off', () => {
  test('toggling LuciferAI off keeps the SAME composer input mounted — no remount, no height reset', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    const { rerender } = render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const bar = screen.getByTestId('dev-command-bar');
    // Squared wrapper while on (the settled ON visual).
    const composerOn = screen.getByTestId('prompter-composer');
    expect(composerOn.className).toContain('rounded-none');
    expect(within(bar).queryByTestId('dev-send-arrow')).toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    const composerInput = within(bar).getByPlaceholderText(/Monaco unavailable/);
    // The drag handle is on the one composer.
    expect(within(bar).queryByTestId('input-drag-handle')).not.toBeNull();

    // Toggle LuciferAI off — the same Terminal stays mounted.
    setLuciferAiEnabled(false);
    rerender(<Terminal tabId="tab-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('dev-send-arrow')).not.toBeNull();
    });

    const barOff = screen.getByTestId('dev-command-bar');
    // THE SAME input element — not a remount: the dragged height
    // (lifted into Terminal) and the typed state survive the toggle.
    expect(within(barOff).getByPlaceholderText(/Monaco unavailable/)).toBe(composerInput);
    expect(within(barOff).queryByTestId('input-drag-handle')).not.toBeNull();
    // Settled OFF visuals: gold arrow + ~ + bubble, no blood drop,
    // no dev console — on the same composer.
    const sendArrow = within(barOff).getByTestId('dev-send-arrow');
    expect(sendArrow.textContent).toBe('➜');
    expect(sendArrow.className).toContain('text-[var(--warning)]');
    expect(within(barOff).getByText('~')).not.toBeNull();
    expect(within(barOff).queryByTestId('blood-drop-svg')).toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    // The bubble wrapper around the same input: flex-1, rounded-lg.
    const inputOuter = composerInput.parentElement as HTMLElement;
    const bubble = inputOuter.parentElement as HTMLElement;
    expect(bubble.className).toContain('flex-1');
    expect(bubble.className).toContain('rounded-lg');
  });

  test('header says linked at DEFCON 3 — not delinked', async () => {
    setDevMode(true);
    setDefconLevel(3);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const header = screen.getByTestId('prompt-section-header').textContent ?? '';
    expect(header).toContain('DEFCON 3 — prompt linked');
    expect(header).not.toContain('delinked');
  });
});

describe('below 3 the delinked bar is unchanged (level 2)', () => {
  test('a bare line in the bar still runs detached via executeCommand at level 2', async () => {
    setDevMode(true);
    setDefconLevel(2);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const bar = screen.getByTestId('dev-command-bar');
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
    fireEvent.change(input, { target: { value: 'echo hello-dev' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });
    expect(writeMock).not.toHaveBeenCalled();
    // The delinked console still renders below 3.
    expect(screen.getByTestId('dev-console')).not.toBeNull();
    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('false');
  });
});
