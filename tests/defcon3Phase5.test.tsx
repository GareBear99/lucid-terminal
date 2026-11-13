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
  return render(<Terminal tabId="tab-1" />);
}

function renderDevmode(level: 1 | 2 | 3, luciferAiEnabled = true, silenced = false) {
  setDevMode(true);
  setDefconLevel(level);
  setLuciferAiEnabled(luciferAiEnabled);
  setLuciferAiSilenced(silenced);
  render(<Terminal tabId="tab-1" />);
}

/** The non-devmode composer's input (the fallback textarea in jsdom).
 *  Found by element, not by placeholder text: when the
 *  true-placeholder ghost words are showing (Gary, 2026-11-13
 *  ~02:02 PST), the textarea's native placeholder is suppressed
 *  so the two placeholders never double-render — the overlay
 *  IS the placeholder there. */
function nonDevmodeComposerInput(): HTMLTextAreaElement {
  const wrap = screen.getByTestId('prompter-composer-wrap');
  const textarea = wrap.querySelector('textarea');
  expect(textarea).not.toBeNull();
  return textarea as HTMLTextAreaElement;
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
    expect(screen.getByText('Type a command e.g. ls')).not.toBeNull();
    // getAllByText, not getByText: the cwd shows twice now —
    // the header's plain text AND the pill row's copyable cwd
    // pill (heavy terminal work, 2026-11-13 — the known
    // triple-display wart, see PillRow.tsx).
    expect(screen.getAllByText(TAB_CWD).length).toBeGreaterThan(0);
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
    expect(nonDevmodeComposerInput()).not.toBeNull();
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

describe('Prompt input row — cursor on the same line as the blood drop icon (Gary, 2026-11-12 ~10:13 PST)', () => {
  test('level 3, LuciferAI on, empty input: one row holds [drop] [composer] with the ghost words INSIDE it as a true placeholder — the caret overlaps the ghost text (Gary, 2026-11-13 ~02:02 PST, Warp reference)', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const row = screen.getByTestId('prompt-input-row');
    const drop = screen.getByTestId('blood-drop');
    const wrap = screen.getByTestId('prompter-composer-wrap');
    expect(row.contains(drop)).toBe(true);
    expect(row.contains(wrap)).toBe(true);
    // No separate words span before the composer anymore — the
    // words live INSIDE the composer wrap as the placeholder
    // overlay. That is the whole point: the caret used to sit in
    // front of static text (Gary ~16:30 PST) because the span
    // was a sibling before the composer.
    expect(within(row).queryByTestId('prompt-hint-words')).toBeNull();
    const overlay = within(wrap).getByTestId('composer-hint-placeholder');
    expect(overlay.textContent).toBe('Type a command e.g. ls');
    // Caret-overlap positioning: the overlay starts at the
    // composer's text origin — the same classes the ghost
    // suggestion overlay uses to align with the editor/textarea
    // text (left-3 = the 12px container padding, py-[10px] =
    // the editor's top padding, 13px/leading-5 = the editor
    // font). The caret at position 0 sits on the ghost text,
    // exactly like Warp's screenshot. jsdom has no layout, so
    // the classes are the check — the live deploy still needs
    // eyes on it.
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('left-3');
    expect(overlay.className).toContain('py-[10px]');
    expect(overlay.className).toContain('text-[13px]');
    expect(overlay.className).toContain('leading-5');
    // The composer input is typeable in the row — the caret lives here now.
    expect(nonDevmodeComposerInput()).not.toBeNull();
  });

  test('typing makes the words VANISH entirely: normal ghost words — gone once there is input, no faded trail behind the cursor (Gary, 2026-11-12 ~15:12 PST)', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    // Empty first: the words are there, inside the composer as
    // the placeholder overlay.
    expect(screen.getByTestId('composer-hint-placeholder').textContent).toBe(
      'Type a command e.g. ls',
    );
    typeInNonDevmodeComposer('ls');
    const row = screen.getByTestId('prompt-input-row');
    // No words span anywhere in the row once there is input.
    expect(within(row).queryByTestId('prompt-hint-words')).toBeNull();
    // And no placeholder overlay either — it hides on input too.
    expect(within(row).queryByTestId('composer-hint-placeholder')).toBeNull();
    // The typed text is in the composer, in the row.
    expect(nonDevmodeComposerInput().value).toBe('ls');
  });

  test('level 3, LuciferAI off: no words at all — the cursor repositions without them (zero residue)', async () => {
    renderNonDevmode(3, false);
    await screen.findByTestId('prompter-composer-wrap');
    const row = screen.getByTestId('prompt-input-row');
    expect(within(row).queryByTestId('prompt-hint-words')).toBeNull();
    expect(within(row).queryByTestId('composer-hint-placeholder')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    // The composer is still there and typeable — only LuciferAI's surfaces are gone.
    expect(within(row).getByPlaceholderText(/Monaco unavailable/)).not.toBeNull();
  });

  test('level 3, drop grey (silenced): the same words — never mentions anything is off', async () => {
    renderNonDevmode(3, true, true);
    await screen.findByTestId('prompter-composer-wrap');
    const overlay = screen.getByTestId('composer-hint-placeholder');
    expect(overlay.textContent).toBe('Type a command e.g. ls');
    expect(screen.getByTestId('prompt-input-row').textContent).not.toMatch(/silenc|paused|disabled/i);
  });

  test('multi-line input keeps the row intact (auto-extend untouched): [drop] [composer], words gone once there is input', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInNonDevmodeComposer('echo one\necho two');
    const row = screen.getByTestId('prompt-input-row');
    const wrap = screen.getByTestId('prompter-composer-wrap');
    expect(row.contains(wrap)).toBe(true);
    expect(within(row).queryByTestId('prompt-hint-words')).toBeNull();
    expect(nonDevmodeComposerInput().value).toBe('echo one\necho two');
  });

  test('below 3 the row keeps the static hint (LuciferAI on) and drops it when off', async () => {
    const first = renderNonDevmode(2, true);
    await screen.findByTestId('xterm-surface');
    expect(screen.getByTestId('prompt-hint-words').textContent).toBe(
      'Type a command e.g. ls',
    );
    expect(screen.queryByTestId('prompter-composer-wrap')).toBeNull();
    first.unmount();

    renderNonDevmode(2, false);
    await screen.findByTestId('xterm-surface');
    expect(screen.queryByTestId('prompt-hint-words')).toBeNull();
  });
});

describe('Prompt-row clicks focus the composer (Gary, 2026-11-12 — the prompt-row click fix)', () => {
  // The fallback textarea auto-focuses on mount in jsdom, so
  // every test here blurs FIRST — otherwise the assertion would
  // pass without the click doing anything at all.
  function blurComposer() {
    nonDevmodeComposerInput().blur();
    expect(document.activeElement).not.toBe(nonDevmodeComposerInput());
  }

  test('clicking the hint words focuses the composer — the words are not a dead span', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const words = screen.getByTestId('composer-hint-placeholder');
    // The words are a label, not a target: clicks pass through them.
    expect(words.className).toContain('pointer-events-none');
    blurComposer();
    fireEvent.click(words);
    expect(document.activeElement).toBe(nonDevmodeComposerInput());
  });

  test('clicking anywhere in the prompt section focuses the composer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    blurComposer();
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).toBe(nonDevmodeComposerInput());
    // And the topology failsafe did NOT fire — the composer is the
    // input at level 3, not a missing xterm surface.
    expect(settingsSetMock).not.toHaveBeenCalledWith('devMode', true);
    expect(useSettingsStore.getState().settings.devMode).toBe(false);
  });

  test('after typing the words are gone, so clicking the prompt section still focuses the composer (no dead span left behind)', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInNonDevmodeComposer('ls');
    // The words vanished entirely — nothing to click on, nothing blocking.
    expect(screen.queryByTestId('prompt-hint-words')).toBeNull();
    blurComposer();
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).toBe(nonDevmodeComposerInput());
  });

  test('devmode: clicking the prompt section does NOT steal focus into the dev bar', async () => {
    renderDevmode(3);
    await screen.findByTestId('dev-command-bar');
    const input = devComposerInput();
    input.blur();
    expect(document.activeElement).not.toBe(input);
    fireEvent.click(screen.getByTestId('prompt-section'));
    expect(document.activeElement).not.toBe(input);
  });
});

describe('True-placeholder ghost words — per-tab first prompt (Gary, 2026-11-13 ~02:02 PST, Warp reference)', () => {
  test('hidden on input; returns when emptied again — but only while the tab has not had its first prompt', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.getByTestId('composer-hint-placeholder')).not.toBeNull();
    typeInNonDevmodeComposer('ls');
    expect(screen.queryByTestId('composer-hint-placeholder')).toBeNull();
    // Emptied again, still no prompt sent: the words come back.
    typeInNonDevmodeComposer('');
    expect(screen.getByTestId('composer-hint-placeholder').textContent).toBe(
      'Type a command e.g. ls',
    );
  });

  test('after the first prompt to a tab the words are gone even when the input is empty again', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.getByTestId('composer-hint-placeholder')).not.toBeNull();
    submitToNonDevmodeComposer('ls');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'ls\r');
    });
    // Submit clears the input — and the words do NOT come back:
    // this tab has had its first prompt.
    expect(nonDevmodeComposerInput().value).toBe('');
    expect(screen.queryByTestId('composer-hint-placeholder')).toBeNull();
    expect(screen.queryByTestId('prompt-hint-words')).toBeNull();
    expect(useTerminalStore.getState().tabs[0].hasPrompted).toBe(true);
  });

  test("per-tab: one tab's first prompt never affects another tab; switching tabs does not leak the state", async () => {
    const first = renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    submitToNonDevmodeComposer('ls');
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalledWith('tab-1', 'ls\r');
    });
    expect(screen.queryByTestId('composer-hint-placeholder')).toBeNull();
    first.unmount();

    // A fresh second tab still shows its own ghost words.
    useTerminalStore.setState((state) => ({
      tabs: [...state.tabs, { id: 'tab-2', title: 'Terminal 2', cwd: TAB_CWD, isActive: false }],
      activeTabId: 'tab-2',
    }));
    const second = render(<Terminal tabId="tab-2" />);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.getByTestId('composer-hint-placeholder').textContent).toBe(
      'Type a command e.g. ls',
    );
    second.unmount();

    // Back to the first tab: its words stay gone — the store
    // holds the per-tab state, not the component.
    useTerminalStore.setState({ activeTabId: 'tab-1' });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('prompter-composer-wrap');
    expect(screen.queryByTestId('composer-hint-placeholder')).toBeNull();
  });
});
