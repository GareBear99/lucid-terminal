// @vitest-environment jsdom
/**
 * DEFCON 3 Phase 3 — the rest of the prompter in devmode (Gary,
 * 2026-11-09 ~08:10 PST — "proceed until complete", same
 * composer in both modes).
 *
 * 1. Interrupt from the composer (the Phase 1 flag): the
 *    xterm-input gate drops ALL xterm input including Ctrl+C /
 *    Ctrl+D, so the composer forwards them — Ctrl+C sends
 *    `\x03` (interrupt), Ctrl+D sends `\x04` (EOF) to the PTY
 *    via `terminal.write`. Selection rule (decided): Ctrl+C
 *    copies when text is selected, interrupts only when
 *    nothing is selected.
 * 2. Inline suggestion + Tab completion (smallest coherent
 *    form): faded ghost text from the composer's own submitted
 *    history (`devHistory` prefix match) and from known
 *    slash-command names (the `SLASH_COMMAND_NAMES` surface
 *    `findClosestCommand` draws from — reused, not rebuilt).
 *    Accepted with Right-arrow (cursor at end) or Tab. Tab
 *    NEVER goes to the shell: with a ghost it accepts, without
 *    one it does nothing. No shell-history completion, no fuzzy
 *    path completion, no completion popup.
 * 3. Chips (smallest form): the live cwd renders as a chip in
 *    the prompt section. No git-branch / runtime-version /
 *    change-count chips — no such data exists in the terminal
 *    code; deferred, not invented.
 * 4. Hint bar: stays static ("Ask Lucid...") — decided, not built dynamic.
 * 5. Multi-line + syntax highlighting: already in `InputArea`
 *    (Monaco `language="shell"`, grows with content). Verified
 *    they still work in the linked composer: multi-line input
 *    is exercised here through the fallback textarea
 *    (Shift+Enter keeps a newline without submitting).
 *    Syntax highlighting itself is Monaco-only and cannot be
 *    exercised in jsdom (Monaco is mocked to fail fast, as in
 *    Phases 1/2) — verified by code inspection instead:
 *    `language="shell"` and the `lucid-dark` token rules are
 *    unchanged, and `wordWrap: 'off'` stays (input keeps
 *    scrolling right, standing design).
 * 6. Re-input from a block: built in Phase 2 — verified here
 *    from the Phase 3 composer (with the ghost / interrupt
 *    wiring present), not rebuilt.
 * 7. Exit-code coloring: re-examined in Phase 3, deferral
 *    CONFIRMED — no clean mechanism exists (see
 *    src/lib/terminalBlocks.ts for the rejected candidates).
 *    `exitCode?` stays unwritten; this file asserts it is
 *    never faked.
 * 8. OFF/ON/silenced matrix re-run for the linked composer:
 *    Lucid-local commands run in all three states; plugin
 *    commands refuse when off/silenced.
 *
 * Harness: same as tests/defcon3Phase1.test.tsx — jsdom has
 * no canvas, so XtermSurface renders its plain-text fallback
 * and InputArea falls back to a plain textarea (Monaco mocked
 * to fail fast).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { computeGhostSuggestion } from '../src/lib/prompterSuggestions';
import { SLASH_COMMAND_NAMES } from '../src/utils/commandRouter';

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

/** The composer input (the fallback textarea in jsdom). */
function composerInput(): HTMLTextAreaElement {
  const bar = screen.getByTestId('dev-command-bar');
  return within(bar).getByPlaceholderText(/Monaco unavailable/) as HTMLTextAreaElement;
}

/** Type into the composer without submitting. */
function typeInComposer(text: string) {
  fireEvent.change(composerInput(), { target: { value: text } });
}

/** Type a command into the DEFCON 3 composer and press Enter. */
function submitToComposer(command: string) {
  const input = composerInput();
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function terminalOutputText(): string {
  return screen.getByTestId('xterm-fallback-output').textContent ?? '';
}

/** Feed a PTY chunk into the terminal (drives block output + the quiet-close timer). */
function emitPty(data: string) {
  dataHandler?.('tab-1', data);
}

function blocks() {
  return useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
}

function renderPrompter(luciferAiEnabled = true, silenced = false) {
  setDevMode(true);
  setDefconLevel(3);
  setLuciferAiEnabled(luciferAiEnabled);
  setLuciferAiSilenced(silenced);
  render(<Terminal tabId="tab-1" />);
  return screen.findByTestId('dev-command-bar');
}

describe('computeGhostSuggestion — the pure suggestion rule', () => {
  test('bare lines complete from the most recent matching history entry', () => {
    const history = ['echo hello', 'ls', 'echo hi'];
    expect(computeGhostSuggestion('echo h', history)).toBe('echo hi');
    expect(computeGhostSuggestion('ec', history)).toBe('echo hi');
    expect(computeGhostSuggestion('l', history)).toBe('ls');
  });

  test('no ghost for an exact match, no match, empty input, or multi-line input', () => {
    const history = ['echo hello'];
    expect(computeGhostSuggestion('echo hello', history)).toBeNull();
    expect(computeGhostSuggestion('zzz', history)).toBeNull();
    expect(computeGhostSuggestion('', history)).toBeNull();
    expect(computeGhostSuggestion('echo\necho hello', history)).toBeNull();
  });

  test('slash lines complete the command word from known slash names', () => {
    expect(computeGhostSuggestion('/fi', [])).toBe('/fix');
    expect(computeGhostSuggestion('/fixn', [])).toBe('/fixnet');
    expect(computeGhostSuggestion('/defco', [])).toBe('/defcon');
    expect(computeGhostSuggestion('/devm', [])).toBe('/devmode');
    expect(computeGhostSuggestion('/ll', [])).toBe('/llm');
  });

  test('no slash ghost for a complete name, a bare slash, arguments, or an unknown name', () => {
    expect(computeGhostSuggestion('/fix', [])).toBeNull();
    expect(computeGhostSuggestion('/', [])).toBeNull();
    expect(computeGhostSuggestion('/fix ', [])).toBeNull();
    expect(computeGhostSuggestion('/fix a', [])).toBeNull();
    expect(computeGhostSuggestion('/zzz', [])).toBeNull();
  });

  test('the slash catalogue is the findClosestCommand surface, slash names included', () => {
    expect(SLASH_COMMAND_NAMES).toContain('fix');
    expect(SLASH_COMMAND_NAMES).toContain('defcon');
    expect(SLASH_COMMAND_NAMES).toContain('devmode');
    expect(SLASH_COMMAND_NAMES).toContain('help');
  });
});

describe('DEFCON 3 composer — Ctrl+C / Ctrl+D forwarding (the Phase 1 flag)', () => {
  test('Ctrl+C with nothing selected sends \\x03 (interrupt) to the PTY', async () => {
    await renderPrompter();
    typeInComposer('echo hi');
    const input = composerInput();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x03');
    // The draft is NOT cleared: \x03 interrupts the shell, the
    // composer's text is the user's to keep or discard.
    expect(composerInput().value).toBe('echo hi');
  });

  test('Ctrl+C with text selected copies — it does NOT interrupt', async () => {
    await renderPrompter();
    typeInComposer('echo hi');
    const input = composerInput();
    input.setSelectionRange(0, 4);
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('Cmd+C (the platform copy chord) never interrupts', async () => {
    await renderPrompter();
    typeInComposer('echo hi');
    const input = composerInput();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'c', metaKey: true });
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('Ctrl+D sends \\x04 (EOF) to the PTY', async () => {
    await renderPrompter();
    const input = composerInput();
    fireEvent.keyDown(input, { key: 'd', ctrlKey: true });
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x04');
  });

  test('Ctrl+C / Ctrl+D also forward while LuciferAI is OFF', async () => {
    await renderPrompter(false);
    const input = composerInput();
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'd', ctrlKey: true });
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x03');
    expect(writeMock).toHaveBeenCalledWith('tab-1', '\x04');
  });

  test('below 3 the delinked bar forwards nothing to the PTY', async () => {
    setDevMode(true);
    setDefconLevel(2);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const input = composerInput();
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'd', ctrlKey: true });
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe('DEFCON 3 composer — ghost suggestion + Tab completion', () => {
  test('a ghost appears from composer history (faded remainder after the input)', async () => {
    await renderPrompter();
    submitToComposer('echo hello');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hello\r');
    });

    typeInComposer('echo h');
    const ghost = screen.getByTestId('composer-ghost-suggestion');
    // The overlay mirrors the typed text (hidden) plus the
    // faded remainder — its full text is the suggestion, and
    // the remainder span carries the faded theme styling.
    expect(ghost.textContent).toBe('echo hello');
    const remainder = within(ghost).getByText('ello');
    expect(remainder.className).toContain('text-[var(--text-muted)]');
    expect(remainder.className).toContain('opacity-60');
  });

  test('a ghost appears from a slash-command name', async () => {
    await renderPrompter();
    typeInComposer('/fi');
    const ghost = screen.getByTestId('composer-ghost-suggestion');
    expect(ghost.textContent).toBe('/fix');
  });

  test('Right-arrow accepts the ghost when the cursor is at the end', async () => {
    await renderPrompter();
    submitToComposer('echo hello');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hello\r');
    });

    typeInComposer('echo h');
    const input = composerInput();
    input.setSelectionRange(6, 6);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(composerInput().value).toBe('echo hello');
    // Accepting is not submitting — nothing went to the shell.
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  test('Right-arrow mid-line does NOT accept the ghost', async () => {
    await renderPrompter();
    submitToComposer('echo hello');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hello\r');
    });

    typeInComposer('echo h');
    const input = composerInput();
    input.setSelectionRange(2, 2);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(composerInput().value).toBe('echo h');
  });

  test('Tab completes a slash name — and does not submit or reach the shell', async () => {
    await renderPrompter();
    typeInComposer('/fi');
    fireEvent.keyDown(composerInput(), { key: 'Tab' });
    expect(composerInput().value).toBe('/fix');
    expect(writeMock).not.toHaveBeenCalled();
    expect(blocks()).toHaveLength(0);
  });

  test('Tab accepts a history ghost', async () => {
    await renderPrompter();
    submitToComposer('echo hello');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hello\r');
    });

    typeInComposer('echo h');
    fireEvent.keyDown(composerInput(), { key: 'Tab' });
    expect(composerInput().value).toBe('echo hello');
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  test('bare-line Tab with no ghost does nothing — never the shell, never a tab char', async () => {
    await renderPrompter();
    typeInComposer('zzzqqq');
    fireEvent.keyDown(composerInput(), { key: 'Tab' });
    expect(composerInput().value).toBe('zzzqqq');
    expect(writeMock).not.toHaveBeenCalled();
    expect(blocks()).toHaveLength(0);
  });

  test('no ghost below 3 — the delinked bar does not suggest', async () => {
    setDevMode(true);
    setDefconLevel(2);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    typeInComposer('/fi');
    expect(screen.queryByTestId('composer-ghost-suggestion')).toBeNull();
  });
});

describe('DEFCON 3 composer — cwd chip, static hint, multi-line, re-input', () => {
  test('the live cwd renders as a chip in the prompt section', async () => {
    await renderPrompter();
    const chip = screen.getByTestId('cwd-chip');
    expect(chip.textContent).toBe(TAB_CWD);
    // A chip, not plain text: pill + border + tertiary bg,
    // theme vars only.
    expect(chip.className).toContain('rounded-full');
    expect(chip.className).toContain('border-[var(--border)]');
    expect(chip.className).toContain('bg-[var(--bg-tertiary)]/50');
  });

  test('no cwd chip below 3, and none in non-devmode (Phase 5: plain cwd text stays)', async () => {
    setDevMode(true);
    setDefconLevel(2);
    const first = render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');
    expect(screen.queryByTestId('cwd-chip')).toBeNull();
    first.unmount();

    // Non-devmode at level 3 keeps its plain cwd text — the
    // chip stays devmode-only (Phase 5 decision: the settled
    // header is not redesigned; the context is present either
    // way, and block headers carry the cwd too).
    setDevMode(false);
    setDefconLevel(3);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.queryByTestId('cwd-chip')).toBeNull();
    expect(screen.getByText(TAB_CWD)).not.toBeNull();
  });

  test('the hint bar stays static', async () => {
    await renderPrompter();
    expect(screen.getByText('Ask Lucid...')).not.toBeNull();
  });

  test('multi-line input: Shift+Enter keeps a newline without submitting', async () => {
    await renderPrompter();
    typeInComposer('echo one');
    fireEvent.keyDown(composerInput(), { key: 'Enter', shiftKey: true });
    expect(writeMock).not.toHaveBeenCalled();
    expect(blocks()).toHaveLength(0);

    typeInComposer('echo one\necho two');
    expect(composerInput().value).toBe('echo one\necho two');
    // Multi-line input has no ghost — the suggestion is
    // single-line only.
    expect(screen.queryByTestId('composer-ghost-suggestion')).toBeNull();
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('re-input from a block returns the command to the composer', async () => {
    await renderPrompter();
    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));

    const blockEl = screen.getByTestId('terminal-block');
    fireEvent.click(within(blockEl).getByTestId('block-reinput'));
    expect(composerInput().value).toBe('echo hi');
  });
});

describe('DEFCON 3 composer — exit-code coloring stays deferred, never faked', () => {
  test('a closed slash block carries no exitCode', async () => {
    await renderPrompter();
    submitToComposer('/fixnet stats');
    await waitFor(() => {
      expect(blocks()).toHaveLength(1);
      expect(blocks()[0].isComplete).toBe(true);
    });
    expect(blocks()[0].exitCode).toBeUndefined();
  });

  test('a closed bare block carries no exitCode', async () => {
    await renderPrompter();
    submitToComposer('echo hi');
    await waitFor(() => expect(blocks()).toHaveLength(1));
    // The quiet timer arms on PTY chunks, not on submit — feed
    // the block its output, then the stream goes quiet (500 ms)
    // and the block closes.
    emitPty('echo hi\r\nhi\r\n');
    await waitFor(() => expect(blocks()[0].output).toContain('hi'));
    // The quiet timer closes the block (500 ms) — its output
    // attribution keeps running until the next submit, so the
    // close is about duration only, never about an exit code.
    await waitFor(() => expect(blocks()[0].isComplete).toBe(true), { timeout: 3000 });
    expect(blocks()[0].exitCode).toBeUndefined();
  });
});

describe('DEFCON 3 composer — OFF/ON/silenced matrix (re-run for the linked composer)', () => {
  test.each([
    ['ON', true, false],
    ['OFF', false, false],
    ['SILENCED', true, true],
  ])('Lucid-local /defcon runs while %s', async (_label, enabled, silenced) => {
    await renderPrompter(enabled, silenced);
    submitToComposer('/defcon');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('DEFCON 3');
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  test('plugin /tokens runs while ON', async () => {
    await renderPrompter(true, false);
    submitToComposer('/tokens');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('{}');
    });
  });

  test('plugin /tokens refuses while OFF', async () => {
    await renderPrompter(false, false);
    submitToComposer('/tokens');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('/tokens needs LuciferAI');
    });
  });

  test('plugin /tokens refuses while SILENCED', async () => {
    await renderPrompter(true, true);
    submitToComposer('/tokens');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('LuciferAI is silenced');
    });
  });

  test.each([
    ['ON', true, false],
    ['OFF', false, false],
    ['SILENCED', true, true],
  ])('bare shell lines reach the PTY while %s', async (_label, enabled, silenced) => {
    await renderPrompter(enabled, silenced);
    submitToComposer('echo hi');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'echo hi\r');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });
});
