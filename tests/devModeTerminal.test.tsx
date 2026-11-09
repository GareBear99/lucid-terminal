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
 * console beneath it — but only while LuciferAI is on (Gary,
 * 2026-11-08 ~11:22 PST: the console disappears when the
 * original prompt input comes back). Clicking the prompt section
 * does NOT focus the terminal. Slash lines run through
 * runSlashCommand with the dev console as their output sink; bare
 * lines run detached via terminal:executeCommand. The visible
 * terminal screen is never written to by the bar, and it keeps
 * running independently.
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
    settings: { ...base, devMode: false, luciferAiEnabled: false, defconLevel: 1, defconMergeReading: null },
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
    // The dev console only renders while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST) — so this console assertion runs ON.
    setLuciferAiEnabled(true);
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
    // Dev console present only while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST).
    setLuciferAiEnabled(true);
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
    // Dev console present only while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST).
    setLuciferAiEnabled(true);
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
    // Dev console present only while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST).
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('false');
    await waitFor(() => {
      expect(devConsoleText()).toContain('boom');
    });
    expect(terminalOutputText()).not.toContain('boom');
  });

  test('/help needs-LuciferAI note has nowhere visible to go when off (Gary, 2026-11-08) — dev console hidden, screen untouched', async () => {
    setDevMode(true);
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    // The dev console is gone when LuciferAI is off (the original
    // prompt input is back) — the note still goes to the dev sink
    // state, but it has nowhere visible to go until the top-feed
    // routing lands.
    expect(screen.queryByTestId('dev-console')).toBeNull();

    submitToDevBar('/help');
    // Let the detached submit settle (the /help handler writes
    // the note to the dev sink, not the screen), then the console
    // must still be absent and the screen must not carry the note.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('dev-console')).toBeNull();
    expect(terminalOutputText()).not.toContain('/help needs LuciferAI');
  });

  test('the dev console Clear button empties it', async () => {
    setDevMode(true);
    // Dev console present only while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST).
    setLuciferAiEnabled(true);
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
    // And the drop itself renders while on (the main-prompt
    // LuciferStatusIndicator) — present while on, gone while off
    // (Gary, 2026-11-09 ~02:17 PST).
    expect(screen.getByTestId('blood-drop-svg')).not.toBeNull();
    submitToDevBar('echo hello-dev');
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });
  });

  test('the dev bar prompt has NO blood drop when LuciferAI is off (Gary, 2026-11-09) — gold arrow + ~ tilde + extending input, half-way rounded edges, inside the original BUBBLE', async () => {
    // LuciferAI OFF (the default here): the ORIGINAL Lucid terminal
    // prompt (pre-ec33aa9, 4d8ef4e) — exactly as in Gary's photo,
    // MINUS the blood drop. Gary, 2026-11-09 ~02:17 PST: when
    // LuciferAI is OFF the blood drop must be GONE — including
    // this dev bar OFF branch. Its presence while off breaks the
    // system (off = plain terminal, zero residue). This OVERRIDES
    // the b82010d photo design that kept the drop here as the
    // silencer/toggle. What stays: the GOLD ARROW (the ➜ send
    // arrow, gold, first in the row, before the ~; Gary,
    // 2026-11-08 ~11:46 PST: "you took mine out and never put it
    // back" — it is his arrow, in the photo, and it goes back in)
    // + the ~ tilde (the squiggly line, as in the photo; Gary,
    // 2026-11-08 ~11:44 PST: "no arrow prompt either" — there is
    // NO prompt arrow in the original; the ❯ was a misstep and is
    // removed, the ~ is back) + an input that EXTENDS (flex-1)
    // with HALF-WAY ROUNDED edges (rounded-lg) inside the ORIGINAL
    // prompt BUBBLE (Gary, 2026-11-08 ~11:40 PST: the bubble is
    // back — the distinct rounded input field, dark background +
    // subtle border, as in the photo, from before the terminal
    // and glass work; the wrapper carries the bubble, the InputArea
    // inside stays flat).
    // No blood drop, no prompt arrow, no Sentinel face, no
    // "Idle • Awaiting Commands..." line.
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    const bar = screen.getByTestId('dev-command-bar');
    // NO blood drop while LuciferAI is off — neither the droplet
    // SVG nor the toggle button renders in the bar. (The main
    // prompt's LuciferStatusIndicator is gated on luciferAiEnabled
    // too, so no blood-drop-svg exists anywhere on screen.)
    expect(within(bar).queryByTestId('blood-drop-svg')).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    // The GOLD ARROW is back in — the ➜ send arrow, gold, first
    // in the row, before the ~. (getByText throws if it is missing,
    // so reaching here proves it is rendered.) It is GOLD
    // (text-[var(--warning)]) and it sits before the ~ tilde in
    // the row order.
    const sendArrow = within(bar).getByTestId('dev-send-arrow');
    expect(sendArrow.textContent).toBe('➜');
    expect(sendArrow.className).toContain('text-[var(--warning)]');
    // The original prompt has the ~ tilde before the input — and
    // NO prompt arrow (the ❯ was a misstep, removed 2026-11-08).
    // (getByText throws if it is missing, so reaching here proves
    // it is rendered.)
    const tilde = within(bar).getByText('~');
    expect(tilde.textContent).toBe('~');
    expect(within(bar).queryByText('❯')).toBeNull();
    // Order: the gold arrow comes BEFORE the ~ tilde.
    expect(
      Boolean(sendArrow.compareDocumentPosition(tilde) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    // The input itself is bare — no rounding — BUT with the 12px side
    // padding back (Gary, 2026-11-08 "recover it all"): flat is no
    // bubble chrome, not no padding; the cursor must not hug the edge.
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
    const inputOuter = input.parentElement as HTMLElement;
    expect(inputOuter.className).not.toContain('rounded');
    expect(inputOuter.className).toContain('px-3');
    // And the drag handle is back on the dev-bar input too (recovered
    // 2026-11-08): drag up to grow, down to shrink, max halfway.
    expect(within(bar).queryByTestId('input-drag-handle')).not.toBeNull();
    // The wrapper around the input EXTENDS and is HALF-WAY ROUNDED
    // (rounded-lg) AND carries the ORIGINAL prompt BUBBLE — a dark
    // background + subtle border, as in Gary's photo. (Gary,
    // 2026-11-08 ~11:40 PST: the bubble is back. The InputArea
    // inside stays flat; the bubble is the wrapper.)
    const wrapper = inputOuter.parentElement as HTMLElement;
    expect(wrapper.className).toContain('flex-1');
    expect(wrapper.className).toContain('rounded-lg');
    expect(wrapper.className).toContain('overflow-hidden');
    expect(wrapper.className).not.toContain('rounded-none');
    expect(wrapper.className).not.toContain('rounded-full');
    expect(wrapper.className).toContain('border');
    expect(wrapper.className).toContain('bg-');
  });

  test('the dev console is ABSENT when LuciferAI is off in devmode (Gary, 2026-11-08) — it disappears when the original prompt input comes back', async () => {
    setDevMode(true);
    // LuciferAI OFF (the default here): the original prompt input
    // is back, so the dev console must not render at all.
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    expect(screen.queryByTestId('dev-console-output')).toBeNull();
    expect(screen.queryByText('Dev console — detached output')).toBeNull();
  });

  test('the dev bar prompt is squared when LuciferAI is on (Gary, 2026-11-08)', async () => {
    setDevMode(true);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" luciferToggleActive={true} onToggleLuciferAi={() => {}} />);
    await screen.findByTestId('dev-command-bar');

    const bar = screen.getByTestId('dev-command-bar');
    // Squared edge, indicating the bottom drop section.
    const wrapper = bar.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('rounded-none');
    expect(wrapper.className).not.toContain('rounded-lg');
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
    expect(input.parentElement?.className).toContain('rounded-none');
  });

  test('the rainbow swirl shows while a dev-bar command runs, then clears (Gary, 2026-11-08)', async () => {
    // Hold the detached execution open so the bar stays processing.
    let resolveExec: (v: unknown) => void = () => {};
    executeCommandMock.mockImplementation(
      () => new Promise((res) => { resolveExec = res; }),
    );
    setDevMode(true);
    // Dev console present only while LuciferAI is on (Gary,
    // 2026-11-08 ~11:22 PST) — the final output assertion below
    // reads it.
    setLuciferAiEnabled(true);
    const { container } = render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    // No rainbow while idle.
    expect(container.querySelector('.processing-glow-border')).toBeNull();

    submitToDevBar('echo hello-dev');
    // While the command is still running, the rainbow swirls.
    await waitFor(() => {
      expect(container.querySelector('.processing-glow-border')).not.toBeNull();
    });
    expect(container.querySelector('.processing-glow-pulse')).not.toBeNull();

    // Let the command finish — the rainbow clears.
    resolveExec({ success: true, output: 'hello-dev' });
    await waitFor(() => {
      expect(container.querySelector('.processing-glow-border')).toBeNull();
    });
    await waitFor(() => {
      expect(devConsoleText()).toContain('hello-dev');
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

describe('/defcon slash command (Gary, 2026-11-09)', () => {
  test('/defcon with no argument prints the current level and its criteria', async () => {
    setDevMode(false);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('DEFCON 1 — NOW');
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('war zone');
    });
    expect(settingsSetMock).not.toHaveBeenCalled();
  });

  test('/defcon 2 from the terminal stream sets the level — and says honestly what is still open', async () => {
    setDevMode(false);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon 2');
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('defconLevel', 2);
    });
    await waitFor(() => {
      expect(terminalOutputText()).toContain('DEFCON 2');
    });
    // Nothing picked yet — the reading is still open (the merge
    // build itself has landed; only the pick is outstanding).
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Still open');
    });
  });

  test('/defcon 9 prints usage, and changes nothing', async () => {
    setDevMode(false);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon 9');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('Usage: /defcon');
    });
    expect(settingsSetMock).not.toHaveBeenCalled();
  });

  test('/defcon merge b from the dev bar picks the merge reading — the merge is built and takes effect at DEFCON 2', async () => {
    setDevMode(true);
    // The dev console only renders while LuciferAI is on — the
    // merge confirmation lands there, so enable it for this test.
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');

    submitToDevBar('/defcon merge b');
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('defconMergeReading', 'b');
    });
    await waitFor(() => {
      expect(devConsoleText()).toContain('merge reading picked');
    });
    // The merge is built (reading (b)) — picking the reading no
    // longer says "NOT done"; it says where the merge takes effect.
    await waitFor(() => {
      expect(devConsoleText()).toContain('takes effect at DEFCON 2');
    });
  });

  test('/defcon merge with no reading prints the three readings, and changes nothing', async () => {
    setDevMode(false);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('/defcon merge');
    await waitFor(() => {
      expect(terminalOutputText()).toContain('terminal over mist');
    });
    expect(settingsSetMock).not.toHaveBeenCalled();
  });
});

describe('DEFCON 2 merge, reading (b) — mist as direct background (Gary, 2026-11-09 ~04:27–04:30 PST)', () => {
  // No jest-dom in this repo — assert on DOM properties, not
  // matchers. Class tokens, split exactly: 'bg-black' must not
  // false-match 'bg-black/50'.
  function classesOf(el: HTMLElement): string[] {
    return el.className.split(/\s+/);
  }

  test('DEFCON 1, non-devmode: the page is exactly as it stands — opaque black, solid black wrap', async () => {
    setDevMode(false);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    const page = screen.getByTestId('terminal-page');
    expect(classesOf(page)).toContain('bg-black');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(classesOf(wrap)).toContain('bg-black');
    expect(classesOf(wrap)).not.toContain('backdrop-blur-sm');
    expect(classesOf(wrap)).not.toContain('bg-black/50');
  });

  test('DEFCON 2, non-devmode: the black lifts — mist directly behind the text, darkening blur, bar untouched', async () => {
    setDevMode(false);
    setDefconLevel(2);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    // The opaque black is gone from the page root, so the mist
    // behind shows through — that is where the DEFCONs take effect.
    const page = screen.getByTestId('terminal-page');
    expect(classesOf(page)).not.toContain('bg-black');
    // The wrap drops the solid black for the darkening blur:
    // mist directly behind the text, darkened where the text sits.
    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(classesOf(wrap)).toContain('bg-black/50');
    expect(classesOf(wrap)).toContain('backdrop-blur-sm');
    expect(classesOf(wrap)).not.toContain('bg-black');
    expect(classesOf(wrap)).not.toContain('bg-[var(--bg-tertiary)]/50');
    // The prompt section is NOT part of the merge — the solid
    // black Warp bar stays exactly as it is.
    const section = screen.getByTestId('prompt-section');
    expect(section.style.background).toBe('rgb(0, 0, 0)');
  });

  test('DEFCON 2, devmode: the frosted glass drops for the same darkening blur', async () => {
    setDevMode(true);
    setDefconLevel(2);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(classesOf(wrap)).toContain('bg-black/50');
    expect(classesOf(wrap)).toContain('backdrop-blur-sm');
    expect(classesOf(wrap)).not.toContain('bg-[var(--bg-tertiary)]/50');
    expect(classesOf(wrap)).not.toContain('backdrop-blur-md');
  });

  test('DEFCON 1, devmode: the frosted glass stays — the merge has not taken effect', async () => {
    setDevMode(true);
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(classesOf(wrap)).toContain('bg-[var(--bg-tertiary)]/50');
    expect(classesOf(wrap)).toContain('backdrop-blur-md');
    expect(classesOf(wrap)).not.toContain('bg-black/50');
  });
});

describe('dev bar sizing + dev console placement in devmode (Gary, 2026-11-08)', () => {
  /** No fixed height on the element itself: the bar sizes to its
   *  content. (h-full is the page root filling the window, not a bar
   *  height — it never appears here.) */
  function expectNoFixedHeight(el: HTMLElement) {
    const classes = el.className.split(/\s+/);
    expect(classes.filter((c) => /^h-/.test(c))).toEqual([]);
  }

  test('bar sizes to its content whether elements are there or gone; console below only when LuciferAI is ON', async () => {
    // OFF: original prompt back, NO dev console — and the bar is still
    // content-sized, no gap left behind by the missing console, face,
    // or anything else. Drag handle + bubble input still there.
    setDevMode(true);
    setLuciferAiEnabled(false);
    const off = render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');
    const barOff = screen.getByTestId('dev-command-bar');
    expectNoFixedHeight(barOff);
    expectNoFixedHeight(screen.getByTestId('prompt-section'));
    expect(screen.queryByTestId('dev-console')).toBeNull();
    expect(within(barOff).queryByTestId('input-drag-handle')).not.toBeNull();
    off.unmount();

    // ON: squared prompt + dev console BELOW the bar (it is the bar's
    // last child, so it sits underneath the prompt) — still no fixed
    // height, the bar just grows to fit it.
    setDevMode(true);
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');
    const barOn = screen.getByTestId('dev-command-bar');
    expectNoFixedHeight(barOn);
    expectNoFixedHeight(screen.getByTestId('prompt-section'));
    const consoleEl = screen.getByTestId('dev-console');
    expect(barOn.lastElementChild).toBe(consoleEl);
    expect(within(barOn).queryByTestId('input-drag-handle')).not.toBeNull();
  });
});
