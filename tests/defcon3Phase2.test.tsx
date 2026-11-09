// @vitest-environment jsdom
/**
 * DEFCON 3 Phase 2 — blocks in devmode (Gary, 2026-11-09 ~08:10 PST
 * — "proceed until complete", same composer in both modes).
 *
 * At DEFCON 3+ in devmode every composer submit opens a block in
 * the REVIVED historyStore (`blocksByTab` / `setBlocks` — zero
 * callers before this phase): command + submit stamp + live cwd.
 * The block closes on next-prompt detection — PTY quiescence
 * after the submit's output burst (500 ms quiet), a slash
 * command resolving, the next submit, or the shell exiting —
 * with durationMs = close − submit. The prompt is never parsed
 * out of the stream and PS1 / shell config is never touched
 * (see src/lib/terminalBlocks.ts). Blocks render as DOM above
 * the xterm in the same terminal column (one feed), with a real
 * faint 1px `var(--border)` divider between them, a header
 * carrying cwd + duration, and copy-command / copy-output /
 * re-input actions. Long output scrolls inside its block.
 * Exit-code coloring is DEFERRED (not capturable cleanly) and
 * is asserted absent here only by the header showing RUNNING /
 * CMD, never an exit code.
 *
 * Below level 3 the old paths create NO blocks. Non-devmode
 * landing is Phase 5 (tests/defcon3Phase5.test.tsx) — the
 * same composer + block list land there, with the xterm
 * surface unmounted so output appears exactly once.
 *
 * Harness: same as tests/defcon3Phase1.test.tsx — jsdom has no
 * canvas, so XtermSurface renders its plain-text fallback and
 * InputArea falls back to a plain textarea (Monaco mocked to
 * fail fast). The PTY stream is driven by capturing the onData
 * handler the Terminal registers.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import {
  appendBlockOutput,
  closeBlock,
  formatBlockDuration,
  newBlock,
} from '../src/lib/terminalBlocks';

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
let clipboardMock: ReturnType<typeof vi.fn>;
let dataHandler: ((id: string, data: string) => void) | null;

const TAB_CWD = '/Users/gary/lucid-terminal';

beforeEach(() => {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
  clipboardMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardMock },
    configurable: true,
  });
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

/** Type a command into the DEFCON 3 composer and press Enter. */
function submitToComposer(command: string) {
  const bar = screen.getByTestId('dev-command-bar');
  const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Drive a PTY chunk into the Terminal, as the shell would. */
function emitPty(data: string) {
  expect(dataHandler).not.toBeNull();
  dataHandler?.('tab-1', data);
}

/** The blocks the store holds for this tab — the store must
 *  actually be written, never left empty. */
function blocks() {
  return useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
}

describe('terminalBlocks — pure helpers', () => {
  test('newBlock carries command, submit stamp and live cwd, open (no duration)', () => {
    const before = Date.now();
    const block = newBlock('echo hi', TAB_CWD, before);
    expect(block.command).toBe('echo hi');
    expect(block.cwd).toBe(TAB_CWD);
    expect(block.timestamp).toBe(before);
    expect(block.isComplete).toBe(false);
    expect(block.durationMs).toBeUndefined();
    expect(block.output).toBe('');
    expect(block.id).toMatch(/^block-/);
  });

  test('closeBlock stamps durationMs = close − submit, and the first close wins', () => {
    const block = newBlock('echo hi', TAB_CWD, 1000);
    const closed = closeBlock(block, 1750);
    expect(closed.isComplete).toBe(true);
    expect(closed.durationMs).toBe(750);
    // A second close cannot restamp the duration.
    expect(closeBlock(closed, 9999)).toBe(closed);
    expect(closeBlock(closed, 9999).durationMs).toBe(750);
  });

  test('formatBlockDuration: milliseconds under a second, one-decimal seconds above', () => {
    expect(formatBlockDuration(0)).toBe('0ms');
    expect(formatBlockDuration(500)).toBe('500ms');
    expect(formatBlockDuration(999)).toBe('999ms');
    expect(formatBlockDuration(1000)).toBe('1.0s');
    expect(formatBlockDuration(2750)).toBe('2.8s');
  });

  test('appendBlockOutput accumulates a transcript and caps it', () => {
    const block = newBlock('yes', TAB_CWD, 1000);
    const appended = appendBlockOutput(block, 'hello\n');
    expect(appended.output).toBe('hello\n');
    expect(appendBlockOutput(appended, '')).toBe(appended);
    const flooded = appendBlockOutput(block, 'x'.repeat(200_000));
    expect(flooded.output.length).toBeLessThanOrEqual(100_000);
  });
});

describe('DEFCON 3 blocks — created on composer submit', () => {
  test('a bare submit writes a block to the store with cwd + submit stamp', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    expect(blocks()).toHaveLength(0);
    submitToComposer('echo hi');

    await waitFor(() => expect(blocks()).toHaveLength(1));
    const [block] = blocks();
    expect(block.command).toBe('echo hi');
    expect(block.cwd).toBe(TAB_CWD);
    expect(block.timestamp).toBeGreaterThanOrEqual(Date.now() - 5000);
    expect(block.isComplete).toBe(false);
    expect(block.durationMs).toBeUndefined();
    // Rendered above the xterm, header carries the cwd.
    expect(screen.getByTestId('terminal-blocks')).not.toBeNull();
    const header = screen.getByTestId('block-header').textContent ?? '';
    expect(header).toContain(TAB_CWD);
    expect(header).toContain('echo hi');
    expect(header).toContain('RUNNING');
  });

  test('a slash submit writes a block too — and its output lands in the block, not just the feed', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('/fixnet stats');
    await waitFor(() => expect(commandMock).toHaveBeenCalledWith('fixnet stats'));
    await waitFor(() => expect(blocks()).toHaveLength(1));
    await waitFor(() => expect(blocks()[0].isComplete).toBe(true));
    const [block] = blocks();
    expect(block.command).toBe('/fixnet stats');
    expect(block.durationMs).toBeDefined();
    expect(block.output).toContain('fixnet stats output');
    // The `$` echo is the feed's, not the block's — the command
    // is already the block header.
    expect(block.output).not.toContain('$ /fixnet stats');
    // ...but the feed still shows it (Phase 1 behavior kept).
    expect(screen.getByTestId('xterm-fallback-output').textContent).toContain('$ /fixnet stats');
  });
});

describe('DEFCON 3 blocks — closed on next-prompt detection, with duration', () => {
  test('a bare block captures PTY output, then closes when the stream goes quiet — header shows the duration', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty('echo hi\r\nhi\r\n');

    // The PTY chunk is the block's output, live.
    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
    await waitFor(() => {
      expect(screen.getByTestId('block-output').textContent).toContain('hi');
    });
    expect(blocks()[0].isComplete).toBe(false);

    // Next-prompt detection: the stream goes quiet (500 ms),
    // the prompt is taken to have returned, the block closes.
    await waitFor(() => expect(blocks()[0].isComplete).toBe(true), { timeout: 3000 });
    const [block] = blocks();
    expect(block.durationMs).toBeDefined();
    expect(block.durationMs).toBeGreaterThanOrEqual(0);
    const header = screen.getByTestId('block-header').textContent ?? '';
    expect(header).toContain('CMD');
    expect(header).not.toContain('RUNNING');
    expect(header).toMatch(/\d+(ms|s)/);
    expect(header).toContain(TAB_CWD);
  });

  test('late output after the quiet close still lands in the same block — nothing is lost', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty('echo hi\r\n');
    await waitFor(() => expect(blocks()[0].isComplete).toBe(true), { timeout: 3000 });
    const durationAtClose = blocks()[0].durationMs;
    // A slow command's late chunk: output still attributed to
    // this block (the duration is not restamped).
    emitPty('late output\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('late output'));
    expect(blocks()[0].isComplete).toBe(true);
    expect(blocks()[0].durationMs).toBe(durationAtClose);
  });

  test('the next submit force-closes the previous block', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo one');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    expect(blocks()[0].isComplete).toBe(false);
    submitToComposer('echo two');
    await waitFor(() => expect(blocks()).toHaveLength(2));
    expect(blocks()[0].isComplete).toBe(true);
    expect(blocks()[0].durationMs).toBeDefined();
    expect(blocks()[1].command).toBe('echo two');
  });
});

describe('DEFCON 3 blocks — dividers, headers, scrolling', () => {
  test('a faint divider renders between two blocks — a real 1px var(--border) line, always on', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo one');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    submitToComposer('echo two');
    await waitFor(() => expect(blocks()).toHaveLength(2));

    expect(screen.getAllByTestId('terminal-block')).toHaveLength(2);
    const dividers = screen.getAllByTestId('block-divider');
    expect(dividers).toHaveLength(1);
    // Real visible faint line, not a comment: 1px border in
    // the theme's border var.
    expect(dividers[0].className).toContain('border-t');
    expect(dividers[0].className).toContain('border-[var(--border)]');
  });

  test('one block has no divider', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo one');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    expect(screen.queryByTestId('block-divider')).toBeNull();
  });

  test('a long output scrolls inside its block', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty(`long output ${'x'.repeat(500)}\r\n`);
    await waitFor(() => expect(blocks()[0].output).toContain('long output'));

    const output = screen.getByTestId('block-output');
    expect(output.className).toContain('max-h-48');
    expect(output.className).toContain('overflow-y-auto');
  });
});

describe('DEFCON 3 blocks — per-block actions', () => {
  test('copy command, copy output, and re-input all work', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty('echo hi\r\nhi there\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('hi there'));

    const blockEl = screen.getByTestId('terminal-block');
    fireEvent.click(within(blockEl).getByTestId('block-copy-command'));
    await waitFor(() => expect(clipboardMock).toHaveBeenCalledWith('echo hi'));

    fireEvent.click(within(blockEl).getByTestId('block-copy-output'));
    await waitFor(() => {
      expect(clipboardMock).toHaveBeenCalledWith(expect.stringContaining('hi there'));
    });

    // Re-input puts the command back into the composer.
    fireEvent.click(within(blockEl).getByTestId('block-reinput'));
    const bar = screen.getByTestId('dev-command-bar');
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/) as HTMLTextAreaElement;
    expect(input.value).toBe('echo hi');
  });
});

describe('below 3, no blocks are created by the old paths', () => {
  test('level 1 devmode: xterm-typed and delinked-bar submits create no blocks', async () => {
    setDevMode(true);
    setDefconLevel(1);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    // Xterm-typed bare line (the old input path).
    const xtermInput = screen.getByTestId('xterm-fallback-input');
    fireEvent.change(xtermInput, { target: { value: 'echo hi' } });
    fireEvent.keyDown(xtermInput, { key: 'Enter' });
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi');
    });

    // Delinked dev-bar bare line (one-shot executeCommand).
    const bar = screen.getByTestId('dev-command-bar');
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
    fireEvent.change(input, { target: { value: 'echo hello-dev' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });

    expect(blocks()).toHaveLength(0);
    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
  });

  test('level 3 NON-devmode: the block list HAS landed (Phase 5) — composer submit opens a block, output lands once', async () => {
    setDevMode(false);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer-wrap');

    // The non-devmode composer is the same InputArea (fallback
    // textarea in jsdom) — submitted from the prompt section,
    // not the dev bar.
    const wrap = screen.getByTestId('prompter-composer-wrap');
    const input = within(wrap).getByPlaceholderText(/Monaco unavailable/);
    fireEvent.change(input, { target: { value: 'echo hi' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi\r');
    });
    await waitFor(() => expect(blocks()).toHaveLength(1));

    // PTY output lands in the block transcript — and there is
    // no xterm surface for it to duplicate into.
    emitPty('echo hi\r\nhi\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.queryByTestId('xterm-fallback-output')).toBeNull();
    expect(screen.getByTestId('terminal-blocks')).not.toBeNull();
  });
});
