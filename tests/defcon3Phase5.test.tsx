// @vitest-environment jsdom
/**
 * DEFCON 3 Phase 5 — non-devmode landing, the settle (Gary,
 * 2026-11-09 ~08:10 PST — "proceed until complete", same
 * composer in both modes).
 *
 * At DEFCON 3+ in NON-devmode the SAME composer lands in the
 * prompt section (the shared renderPrompterComposer — not a
 * second input), the xterm surface is UNMOUNTED, and the
 * BlockList IS the feed (fill variant: the terminal column,
 * borderless and transparent per the DEFCON 2 merge). Output
 * appears exactly once — in blocks. The duplication decision
 * and its known costs (scrollback lost on landing; no live
 * surface for full-screen interactive programs at level 3 in
 * non-devmode) are recorded in src/components/Terminal/
 * BlockList.tsx.
 *
 * Below 3, non-devmode is byte-for-byte today's behavior:
 * typing at the xterm cursor, no composer, no blocks. The
 * non-devmode shape stays intact at 3 — one feed,
 * bottom-pinned, solid black bar, mist as DEFCON 2 left it.
 * Themes untouched (theme vars only); the header keeps its
 * plain cwd text (the pill chip stays devmode-only — the
 * settled header is not redesigned).
 *
 * Also covered here end to end: the Phase 4 criteria through
 * the real /defcon command — /defcon 3 from level 2 shows
 * the first two met and the third open; a bare /defcon read
 * at level 3 shows all three met.
 *
 * Harness: same as tests/defcon3Phase3.test.tsx — jsdom has
 * no canvas, so XtermSurface renders its plain-text fallback
 * and InputArea falls back to a plain textarea (Monaco mocked
 * to fail fast). The PTY stream is driven by capturing the
 * onData handler the Terminal registers.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';

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
let dataHandler: ((id: string, data: string) => void) | null;

const TAB_CWD = '/Users/gary/lucid-terminal';

beforeEach(() => {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
  dataHandler = null;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: (h: (id: string, data: string) => void) => {
        dataHandler = h;
        return () => {};
      },
      onExit: () => () => {},
      onCwd: () => () => {},
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
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true }],
    activeTabId: 'tab-1',
  });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  useTerminalStore.setState({ tabs: [], activeTabId: null });
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

function renderNonDevmode(level: 1 | 2 | 3, luciferAiEnabled = true, silenced = false) {
  setDevMode(false);
  setDefconLevel(level);
  setLuciferAiEnabled(luciferAiEnabled);
  setLuciferAiSilenced(silenced);
  render(<Terminal tabId="tab-1" />);
}

function renderDevmode(level: 1 | 2 | 3, luciferAiEnabled = true, silenced = false) {
  setDevMode(true);
  setDefconLevel(level);
  setLuciferAiEnabled(luciferAiEnabled);
  setLuciferAiSilenced(silenced);
  render(<Terminal tabId="tab-1" />);
}

/** The non-devmode composer's input (the fallback textarea in jsdom). */
function nonDevmodeComposerInput(): HTMLTextAreaElement {
  const wrap = screen.getByTestId('prompter-composer-wrap');
  return within(wrap).getByPlaceholderText(/Monaco unavailable/) as HTMLTextAreaElement;
}

/** Type a command into the non-devmode composer and press Enter. */
function submitToNonDevmodeComposer(command: string) {
  const input = nonDevmodeComposerInput();
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Type into the non-devmode composer without submitting. */
function typeInNonDevmodeComposer(text: string) {
  fireEvent.change(nonDevmodeComposerInput(), { target: { value: text } });
}

/** The devmode composer's input (inside the dev-command-bar). */
function devComposerInput(): HTMLTextAreaElement {
  const bar = screen.getByTestId('dev-command-bar');
  return within(bar).getByPlaceholderText(/Monaco unavailable/) as HTMLTextAreaElement;
}

/** Type a command into the devmode composer and press Enter. */
function submitToDevComposer(command: string) {
  const input = devComposerInput();
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

/** Drive a PTY chunk into the Terminal, as the shell would. */
function emitPty(data: string) {
  expect(dataHandler).not.toBeNull();
  dataHandler?.('tab-1', data);
}

function blocks() {
  return useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
}

describe('DEFCON 3 Phase 5 — the landing shape (the settle)', () => {
  test('non-devmode at level 3: composer in the prompt section, no xterm, solid black bar, mist as DEFCON 2 left it', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    // The SAME composer, in the prompt section — not the dev bar.
    expect(screen.getByTestId('prompter-composer')).not.toBeNull();
    expect(screen.queryByTestId('dev-command-bar')).toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    // No xterm surface at all — no flashing cursor as the input.
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    // The non-devmode shape intact: solid black prompt bar,
    // DEFCON 2 veil on the page (mist behind the text), static
    // hint, plain cwd text, plain-shell header.
    expect(screen.getByTestId('prompt-section').style.background).toContain('0, 0, 0');
    expect(screen.getByTestId('terminal-page').className).toContain('bg-black/25');
    expect(screen.getByText('Real shell — type /help for Lucid commands')).not.toBeNull();
    expect(screen.getByText(TAB_CWD)).not.toBeNull();
    expect(screen.queryByTestId('cwd-chip')).toBeNull();
    const header = screen.getByTestId('prompt-section-header');
    expect(header.textContent).toContain('plain shell');
    expect(header.textContent).not.toContain('DEFCON 3 — prompt linked');
    expect(header.textContent).not.toContain('DEV — prompt bar delinked');
  });

  test('below 3, non-devmode is byte-for-byte today’s behavior — level 2', async () => {
    renderNonDevmode(2);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('xterm-surface').getAttribute('data-cursor-hidden')).toBe('false');
    expect(screen.queryByTestId('prompter-composer')).toBeNull();
    expect(screen.queryByTestId('prompter-composer-wrap')).toBeNull();
    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
    expect(screen.getByTestId('prompt-section').style.background).toContain('0, 0, 0');

    // Typing still lands in the shell, at the xterm cursor.
    submitToTerminal('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi');
    });
    expect(blocks()).toHaveLength(0);
  });

  test('below 3, non-devmode is byte-for-byte today’s behavior — level 1', async () => {
    renderNonDevmode(1);
    await screen.findByTestId('xterm-surface');

    expect(screen.queryByTestId('prompter-composer')).toBeNull();
    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
    expect(screen.getByTestId('terminal-page').className).toContain('bg-black');
    expect(screen.getByTestId('terminal-page').className).not.toContain('bg-black/25');
  });

  test('dropping back below 3 restores the xterm surface', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.queryByTestId('xterm-surface')).toBeNull();

    // The level is a milestone, not a lock: dropping it
    // remounts a fresh surface on the live shell.
    setDefconLevel(2);
    await screen.findByTestId('xterm-surface');
    expect(screen.queryByTestId('prompter-composer')).toBeNull();
  });

  test('clicking the prompt section does NOT fire the topology failsafe at level 3', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    // The xterm is unmounted, so the focus check would read
    // termRef null — the prompter gate must return before it,
    // or the failsafe would force dev mode on for a surface
    // that is deliberately gone.
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(settingsSetMock).not.toHaveBeenCalledWith('devMode', true);
    expect(useSettingsStore.getState().settings.devMode).toBe(false);
  });
});

describe('DEFCON 3 Phase 5 — the non-devmode composer works like the devmode one', () => {
  test('a bare line reaches the PTY and its output lands in blocks ONLY — no second copy', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi\r');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
    await waitFor(() => expect(blocks()).toHaveLength(1));

    emitPty('echo hi\r\nhi\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
    // The duplication is gone: there is no xterm surface for
    // the same output to appear in a second time.
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.queryByTestId('xterm-fallback-output')).toBeNull();
  });

  test('two submits render as two blocks with a faint 1px var(--border) divider', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('echo one');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty('echo one\r\none\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('one'));

    submitToNonDevmodeComposer('echo two');
    await waitFor(() => expect(blocks()).toHaveLength(2));
    emitPty('echo two\r\ntwo\r\n');
    await waitFor(() => expect(blocks()[1].output).toContain('two'));

    const blockEls = screen.getAllByTestId('terminal-block');
    expect(blockEls).toHaveLength(2);
    const dividers = screen.getAllByTestId('block-divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].className).toContain('border-[var(--border)]');
    // Headers carry cwd + duration: the first block closed at
    // the second submit, so it is complete with a duration.
    expect(blocks()[0].isComplete).toBe(true);
    expect(typeof blocks()[0].durationMs).toBe('number');
    const header = within(blockEls[0]).getByTestId('block-header');
    expect(header.textContent).toContain('echo one');
    expect(header.textContent).toContain(TAB_CWD);
  });

  test('a slash line runs as a Lucid command and never reaches the shell', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('/defcon');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    await waitFor(
      () => expect(blocks()[0].output).toContain('DEFCON 3 — PROMPTER'),
      { timeout: 3000 },
    );
    expect(writeMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
    // Real criteria in the block transcript — all met at 3.
    expect(blocks()[0].output).toContain('[x] DEFCON 2 complete');
    expect(blocks()[0].output).toContain('[x] The prompter built');
    expect(blocks()[0].output).toContain('[x] Everything sorted out');
  });

  test('Ctrl+C / Ctrl+D forward from the non-devmode composer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    typeInNonDevmodeComposer('echo hi');
    const input = nonDevmodeComposerInput();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'd', ctrlKey: true });
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x03');
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x04');
  });

  test('ghost suggestion shows in the non-devmode composer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('echo hello');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hello\r');
    });

    typeInNonDevmodeComposer('echo h');
    const ghost = screen.getByTestId('composer-ghost-suggestion');
    expect(ghost.textContent).toBe('echo hello');
  });

  test('re-input from a block returns the command to the non-devmode composer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));

    const blockEl = screen.getByTestId('terminal-block');
    fireEvent.click(within(blockEl).getByTestId('block-reinput'));
    expect(nonDevmodeComposerInput().value).toBe('echo hi');
  });

  test('OFF state: the non-devmode composer still works — gold arrow + ~ + bubble, output in blocks', async () => {
    renderNonDevmode(3, false);
    await screen.findByTestId('prompter-composer-wrap');

    // LuciferAI off: the settled OFF visuals, same as devmode.
    expect(screen.getByTestId('dev-send-arrow')).not.toBeNull();
    expect(screen.getByText('~')).not.toBeNull();

    submitToNonDevmodeComposer('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi\r');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty('hi\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
  });
});

describe('DEFCON 3 Phase 5 — the BlockList fill variant', () => {
  test('non-devmode: the list IS the feed — flex-1, borderless, transparent', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    submitToNonDevmodeComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    const list = screen.getByTestId('terminal-blocks');
    expect(list.className).toContain('flex-1');
    expect(list.className).toContain('border-0');
    expect(list.className).toContain('bg-transparent');
    expect(list.className).not.toContain('max-h-72');
  });

  test('devmode: the list stays the capped panel above the live xterm', async () => {
    renderDevmode(3);
    await screen.findByTestId('dev-command-bar');

    submitToDevComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    const list = screen.getByTestId('terminal-blocks');
    expect(list.className).toContain('max-h-72');
    expect(list.className).not.toContain('flex-1');
    expect(screen.getByTestId('xterm-surface')).not.toBeNull();
  });
});

describe('DEFCON 3 Phase 4 — criteria through the real /defcon command', () => {
  test('/defcon 3 from level 2 shows the first two met and the third open', async () => {
    // Devmode keeps the xterm mounted across the level change,
    // so the set output is durable here (in non-devmode the
    // surface unmounts as the level lands — see the report).
    renderDevmode(2);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon 3');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Still open:');
    });
    expect(terminalOutputText()).toContain('[ ] Everything sorted out');
    expect(terminalOutputText()).not.toContain('[ ] DEFCON 2 complete');
    expect(terminalOutputText()).not.toContain('[ ] The prompter built');
    expect(settingsSetMock).toHaveBeenCalledWith('defconLevel', 3);
  });

  test('a bare /defcon read at level 3 shows all three met', async () => {
    renderDevmode(2);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon 3');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Still open:');
    });
    // The order landed: the level is 3 now, so the composer
    // is live in devmode — read the settled state from it.
    await screen.findByTestId('dev-command-bar');
    submitToDevComposer('/defcon');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    await waitFor(
      () => expect(blocks()[0].output).toContain('[x] DEFCON 2 complete'),
      { timeout: 3000 },
    );
    expect(blocks()[0].output).toContain('[x] The prompter built');
    expect(blocks()[0].output).toContain('[x] Everything sorted out');
    expect(blocks()[0].output).not.toContain('[ ]');
  });
});

describe('extend drag tab — gone in non-devmode, kept in devmode (Gary, 2026-11-10 ~03:58 PST)', () => {
  test('non-devmode at level 3: the shared composer has NO extend drag tab — clean black', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const wrap = screen.getByTestId('prompter-composer-wrap');
    // The composer input is there and typeable — only the drag tab is gone.
    expect(within(wrap).getByPlaceholderText(/Monaco unavailable/)).not.toBeNull();
    expect(within(wrap).queryByTestId('input-drag-handle')).toBeNull();
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('devmode at level 3: the SAME composer KEEPS the extend drag tab', async () => {
    renderDevmode(3);
    await screen.findByTestId('dev-command-bar');
    const bar = screen.getByTestId('dev-command-bar');
    expect(within(bar).queryByTestId('input-drag-handle')).not.toBeNull();
  });
});
