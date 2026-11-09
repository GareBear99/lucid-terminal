// @vitest-environment jsdom
/**
 * DEFCON 3 fix — devmode cursor at level 3 + block transcript
 * fidelity (Gary, 2026-11-09).
 *
 * Fix 1 — the cursor: Phase 1 hid it with the literal theme
 * colour 'transparent', which live shows as a solid WHITE
 * block (focused) / hollow WHITE outline (unfocused). Root
 * cause, read from the installed xterm.js 5.5.0 sources: the
 * DOM renderer injects cursor CSS from `colors.cursor`, and
 * `css.toColor` throws on ANY colour whose alpha is not 0xFF
 * — including 'transparent' — so `parseColor` falls back to
 * `DEFAULT_CURSOR` (#ffffff). The fix is the 8-digit hex
 * form `#rrggbbaa`, which takes `css.toColor`'s fast path
 * with no alpha validation. jsdom has no canvas so the real
 * xterm never mounts here — the test pins the exact colour
 * values the effect applies (the live look is the proof).
 *
 * Fix 2 — the transcript: block output carried raw ANSI
 * prompt codes and a doubled first character (`eecho`,
 * `ssleep`). The doubling is NOT a double write — verified
 * against a real interactive zsh on a PTY, every submit
 * echoes as `<first-char> BS <full line>` (`e\x08echo hi`):
 * zsh echoes the first keystroke, backs up, reprints the
 * line. The live xterm reads the backspace as "cursor
 * left", so the screen is correct; the raw-text transcript
 * keeps both copies. The fix sanitizes at the capture
 * funnel (`appendBlockOutput`), never at the write path.
 *
 * LIVE BUG in that fix, found in the first live verify
 * (pid 26799): a slash block read "… % ev mode ON" — the
 * "D" of "Dev" gone. The peeled trailing partial escape
 * sat at the end of the stored output and glued onto the
 * next capture's first character (`\x1b[` + "Dev" → CSI
 * `\x1b[D` stripped). The fix holds the partial per-block,
 * outside the stored text, and offers it only to the next
 * chunk of the SAME stream (the PTY); termWriteLines
 * captures never see it. Tests below pin all three shapes
 * (CSI, OSC, drop).
 *
 * Harness: same as tests/defcon3Phase2.test.tsx — jsdom has
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
import { defconCursorThemeColors } from '../src/components/Terminal/XtermSurface';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import {
  appendBlockOutput,
  dropPendingEscape,
  newBlock,
  sanitizeBlockTranscript,
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

/** The blocks the store holds for this tab. */
function blocks() {
  return useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
}

describe('DEFCON 3 fix — devmode cursor colours at level 3', () => {
  test('hidden: fully-transparent 8-digit hex, never the literal transparent', () => {
    const colors = defconCursorThemeColors(true);
    // The literal 'transparent' is what Phase 1 used — and
    // what xterm.js 5.5.0 css.toColor rejects (alpha != 0xFF),
    // falling back to DEFAULT_CURSOR #ffffff (the white block
    // seen live). The 8-digit hex takes the fast path.
    expect(colors.cursor).not.toBe('transparent');
    expect(colors.cursorAccent).not.toBe('transparent');
    expect(colors.cursor).toBe('#58a6ff00');
    expect(colors.cursorAccent).toBe('#0d111700');
    expect(colors.cursor).toMatch(/^#[0-9a-f]{8}$/);
    expect(colors.cursor.endsWith('00')).toBe(true);
    expect(colors.cursorAccent.endsWith('00')).toBe(true);
  });

  test('visible: the standing block cursor returns below level 3', () => {
    expect(defconCursorThemeColors(false)).toEqual({
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
    });
  });
});

describe('DEFCON 3 fix — sanitizeBlockTranscript', () => {
  test('plain text passes through unchanged', () => {
    expect(sanitizeBlockTranscript('hello\nworld')).toBe('hello\nworld');
    expect(sanitizeBlockTranscript('')).toBe('');
    expect(sanitizeBlockTranscript('echo hi\r\nhi\r\n')).toBe('echo hi\nhi\n');
  });

  test('strips ANSI colour, bracketed-paste, erase and keypad sequences', () => {
    expect(
      sanitizeBlockTranscript('\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[?2004h'),
    ).toBe('gary@mac ~ $');
    expect(sanitizeBlockTranscript('\x1b[?25l\x1b[1m\x1b[7m#\x1b[27m\x1b[0m')).toBe('#');
    expect(sanitizeBlockTranscript('\x1b]7;file://mac/Users/gary\x07pwd')).toBe('pwd');
    expect(sanitizeBlockTranscript('\x1b[?1h\x1b=\x1b[?1l\x1b>')).toBe('');
    expect(sanitizeBlockTranscript('a\x1b[Kb')).toBe('ab');
  });

  test('zsh echo-backspace: e BS echo hi reads as echo hi, not eecho', () => {
    expect(sanitizeBlockTranscript('e\x08echo hi')).toBe('echo hi');
    expect(sanitizeBlockTranscript('s\x08sleep 0')).toBe('sleep 0');
  });

  test('a full zsh submit chunk: ANSI gone, first char single, prompt text kept', () => {
    const chunk =
      'e\x08echo hi\x1b[?1l\x1b>\x1b[?2004l\r\r\nhi\r\n' +
      '\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[K\x1b[?2004h';
    expect(sanitizeBlockTranscript(chunk)).toBe('echo hi\nhi\ngary@mac ~ $');
  });

  test('lone carriage return overwrites the line, like the terminal', () => {
    expect(sanitizeBlockTranscript('50%\r100%\n')).toBe('100%\n');
    // The shell's post-submit \r\r\n keeps the echoed line.
    expect(sanitizeBlockTranscript('echo hi\r\r\nhi\r\n')).toBe('echo hi\nhi\n');
  });

  test('sanitizing is idempotent', () => {
    const chunk =
      'e\x08echo hi\x1b[?1l\x1b>\x1b[?2004l\r\r\nhi\r\n' +
      '\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[K\x1b[?2004h';
    const once = sanitizeBlockTranscript(chunk);
    expect(sanitizeBlockTranscript(once)).toBe(once);
  });
});

describe('DEFCON 3 fix — appendBlockOutput sanitizes the transcript', () => {
  test('a backspace pair split across two PTY chunks still reads clean', () => {
    const block = newBlock('echo hi', TAB_CWD, 1000);
    const afterFirst = appendBlockOutput(block, 'e');
    expect(afterFirst.output).toBe('e');
    const afterSecond = appendBlockOutput(afterFirst, '\x08echo hi\r\n');
    expect(afterSecond.output).toBe('echo hi\n');
  });

  test('an escape split across two chunks still strips', () => {
    const block = newBlock('echo hi', TAB_CWD, 1000);
    const afterFirst = appendBlockOutput(block, '\x1b[3');
    const afterSecond = appendBlockOutput(afterFirst, '2mgreen\x1b[0m\n');
    expect(afterSecond.output).toBe('green\n');
  });
});

describe("DEFCON 3 fix — a split escape never eats the next capture's first character", () => {
  test('LIVE BUG (pid 26799): PTY redraw ending mid-escape + slash write keeps the D', () => {
    const block = newBlock('/devmode on', TAB_CWD, 1000);
    // The prompt redraw from the resize the slash itself
    // caused (termWriteLines waits for the next PTY chunk
    // before writing, so the redraw lands first), its last
    // PTY chunk ending mid-escape — bracketed-paste enable
    // split after the CSI introducer.
    const redraw =
      '\x1b[?2004l\r\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[K\x1b[';
    const afterRedraw = appendBlockOutput(block, redraw);
    expect(afterRedraw.output).toBe('gary@mac ~ $');
    // The slash message, captured via termWriteLines — a
    // DIFFERENT stream from the PTY. Its first character
    // must survive: the old code read "ev mode ON" here.
    const afterWrite = appendBlockOutput(afterRedraw, 'Dev mode ON — prompt bar delinked', {
      source: 'write',
    });
    expect(afterWrite.output).toBe('gary@mac ~ $Dev mode ON — prompt bar delinked');
    expect(afterWrite.output).toContain('Dev mode ON');
  });

  test('a PTY chunk completing the split escape strips it, no residue', () => {
    const block = newBlock('/devmode on', TAB_CWD, 1000);
    const afterFirst = appendBlockOutput(block, '\x1b[32mgary@mac\x1b[0m $ \x1b[');
    expect(afterFirst.output).toBe('gary@mac $');
    const afterSecond = appendBlockOutput(afterFirst, '?2004h');
    expect(afterSecond.output).toBe('gary@mac $');
    const afterThird = appendBlockOutput(afterSecond, 'echo hi\n');
    expect(afterThird.output).toBe('gary@mac $echo hi\n');
  });

  test('a mid-OSC split + slash write: the write is not swallowed by the OSC', () => {
    const block = newBlock('/devmode on', TAB_CWD, 1000);
    const afterFirst = appendBlockOutput(block, '\x1b]7;file://mac/Users/gary');
    expect(afterFirst.output).toBe('');
    const afterWrite = appendBlockOutput(afterFirst, 'Dev mode ON', { source: 'write' });
    expect(afterWrite.output).toBe('Dev mode ON');
    // The PTY remainder (BEL terminator) completes the OSC —
    // no residue, and the write text is untouched.
    const afterSecond = appendBlockOutput(afterWrite, '\x07');
    expect(afterSecond.output).toBe('Dev mode ON');
  });

  test('dropping the pending abandons the escape', () => {
    const block = newBlock('echo hi', TAB_CWD, 1000);
    const afterFirst = appendBlockOutput(block, 'prompt \x1b[');
    expect(afterFirst.output).toBe('prompt');
    dropPendingEscape(block.id);
    const afterSecond = appendBlockOutput(afterFirst, '?2004h');
    // The escape was abandoned: the remainder is literal text.
    expect(afterSecond.output).toBe('prompt?2004h');
  });
});

describe('DEFCON 3 fix — live-shaped block transcript in devmode', () => {
  test('a submitted echo shows a clean transcript: no ANSI, no doubled first char', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    // Exactly what a real interactive zsh emits for this submit.
    emitPty(
      'e\x08echo hi\x1b[?1l\x1b>\x1b[?2004l\r\r\nhi\r\n' +
        '\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[K\x1b[?2004h',
    );

    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
    const [block] = blocks();
    expect(block.output).toBe('echo hi\nhi\ngary@mac ~ $');
    expect(block.output).not.toContain('eecho');
    expect(block.output).not.toContain('\x1b');
    const rendered = screen.getByTestId('block-output').textContent ?? '';
    expect(rendered).toContain('echo hi');
    expect(rendered).not.toContain('eecho');
    expect(rendered).not.toContain('\x1b');
  });

  test('a submitted sleep shows a clean transcript too', async () => {
    setDevMode(true);
    setDefconLevel(3);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToComposer('sleep 0');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    emitPty(
      's\x08sleep 0\x1b[?1l\x1b>\x1b[?2004l\r\r\n' +
        '\x1b[32mgary@mac\x1b[0m \x1b[34m~\x1b[0m $ \x1b[K\x1b[?2004h',
    );

    await waitFor(() => expect(blocks()[0].output).toContain('sleep 0'));
    expect(blocks()[0].output).toBe('sleep 0\ngary@mac ~ $');
    expect(blocks()[0].output).not.toContain('ssleep');
  });
});
