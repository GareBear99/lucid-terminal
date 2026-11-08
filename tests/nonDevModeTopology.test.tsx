// @vitest-environment jsdom
/**
 * Non-devmode topology (Gary, 2026-11-08 ~07:05 PST) — the real
 * topology sync, clean page unison.
 *
 * NON-DEVMODE (devMode OFF, the default): the prompt section and
 * the xterm surface share ONE input topology — clicking anywhere
 * in the prompt section focuses the terminal, typing always lands
 * in the shell — and the page is a clean unison: FULL BLACK
 * background, BLACK prompt bar, like Warp AI. The glass backwall
 * and glass prompt section are the DEV-MODE look now (covered in
 * tests/terminalPromptGlass.test.tsx and
 * tests/terminalMainScreenMist.test.tsx).
 *
 * FAILSAFE (Gary, 2026-11-08 ~07:05 PST): if the topology sync
 * fails or desyncs while in non-devmode, the app FALLS INTO dev
 * mode — dev mode ON, detached bar + dev console — so the terminal
 * still works. It must never be left with a broken, synced-but-
 * dead prompt bar. The fallback is VISIBLE: an amber notice above
 * the dev bar AND a line in the dev console. Dev mode ON still
 * means desync (unchanged) — and a failure while already in dev
 * mode does not re-fire the fallback.
 *
 * Harness: jsdom has no canvas, so XtermSurface renders its
 * plain-text fallback and InputArea falls back to a plain
 * textarea (Monaco is mocked to fail fast, same pattern as
 * tests/devModeTerminal.test.tsx).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { checkPromptFocus } from '../src/lib/topologySync';

// Monaco never mounts here: the loader rejects at once, so
// InputArea renders its plain-textarea fallback immediately.
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
let executeCommandMock: ReturnType<typeof vi.fn>;
let settingsSetMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeMock = vi.fn();
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
      command: vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' }),
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

/** Type a line into the xterm fallback input and press Enter. */
function submitToTerminal(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function devConsoleText(): string {
  return screen.getByTestId('dev-console-output').textContent ?? '';
}

describe('non-devmode — full black page, black prompt bar (Warp-style)', () => {
  test('full black unison: opaque black page, solid black bar, black backwall — no glass, no DEV artifacts', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    // The page root is opaque black — the mist behind it never shows.
    expect(screen.getByTestId('terminal-page').className).toContain('bg-black');
    // The prompt bar is solid black, not the glass gradient.
    const section = screen.getByTestId('prompt-section');
    expect(section.style.background).toContain('0, 0, 0');
    expect(section.getAttribute('style') ?? '').not.toContain('linear-gradient');
    expect(section.className).toContain('border-t-2');
    // The backwall is solid black: square corners + divider kept,
    // glass (translucent tint + blur) gone.
    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(wrap.className).toContain('bg-black');
    expect(wrap.className).toContain('rounded-none');
    expect(wrap.className).toContain('border-t-2');
    expect(wrap.className).not.toContain('backdrop-blur-md');
    expect(wrap.className).not.toContain('bg-[var(--bg-tertiary)]/50');
    // BLACK BACKBOARD (Gary, 2026-11-08 ~07:27 PST): the xterm
    // surface itself is full black #000 in non-devmode — the
    // terminal background is black, not transparent over the mist.
    expect(screen.getByTestId('xterm-surface').getAttribute('data-black-background')).toBe('true');
    // No dev-mode artifacts: no badge, no detached bar, no console.
    expect(screen.queryByTestId('dev-command-bar')).toBeNull();
    expect(screen.queryByTestId('dev-console')).toBeNull();
    expect(screen.queryByText('DEV — prompt bar delinked')).toBeNull();
    expect(screen.queryByTestId('topology-fallback-notice')).toBeNull();
    // Still the synced plain shell, not the delinked note.
    expect(screen.getByTestId('prompt-section-header').textContent).toContain('plain shell');
  });

  test('dev mode ON keeps the glass: gradient bar, glass backwall, transparent page', async () => {
    setDevMode(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    expect(screen.getByTestId('terminal-page').className).not.toContain('bg-black');
    const section = screen.getByTestId('prompt-section');
    expect(section.getAttribute('style') ?? '').toContain('linear-gradient');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expect(wrap.className).toContain('bg-[var(--bg-tertiary)]/50');
    expect(wrap.className).toContain('backdrop-blur-md');
    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    // Dev mode: the xterm surface stays transparent (the mist
    // shows through) — the black backboard is non-devmode only.
    expect(screen.getByTestId('xterm-surface').getAttribute('data-black-background')).toBe('false');
  });
});

describe('checkPromptFocus — the click half of the sync (pure)', () => {
  test('no surface mounted → not ok, reason names the surface', () => {
    const check = checkPromptFocus(false, () => {});
    expect(check.ok).toBe(false);
    expect(check.reason ?? '').toContain('not mounted');
  });

  test('focus throws → not ok, reason carries the error', () => {
    const check = checkPromptFocus(true, () => {
      throw new Error('focus broke');
    });
    expect(check.ok).toBe(false);
    expect(check.reason ?? '').toContain('focus broke');
  });

  test('surface present and focus works → ok', () => {
    const focus = vi.fn();
    const check = checkPromptFocus(true, focus);
    expect(check.ok).toBe(true);
    expect(focus).toHaveBeenCalled();
  });
});

describe('topology failsafe — sync failure falls into dev mode', () => {
  test('a click that cannot focus the terminal falls into dev mode with a visible notice', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    // Break the focus half of the sync: the surface's focus throws.
    const xtermInput = screen.getByTestId('xterm-fallback-input');
    vi.spyOn(xtermInput, 'focus').mockImplementation(() => {
      throw new Error('focus broke');
    });

    fireEvent.click(screen.getByTestId('prompt-section'));

    // The failsafe flips devMode ON (persisted via settings.set).
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('devMode', true);
    });
    // The detached bar + dev console render, and the fallback is
    // VISIBLE: an amber notice above the bar AND a line in the console.
    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
    expect(screen.getByTestId('dev-console')).not.toBeNull();
    const notice = screen.getByTestId('topology-fallback-notice');
    expect(notice.textContent).toContain('Topology sync failed');
    expect(notice.textContent).toContain('focus broke');
    await waitFor(() => {
      expect(devConsoleText()).toContain('Topology sync failed');
    });
    // The detached bar still works: a bare line runs one-shot.
    const bar = screen.getByTestId('dev-command-bar');
    const input = within(bar).getByPlaceholderText(/Monaco unavailable/);
    fireEvent.change(input, { target: { value: 'echo hello-dev' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledWith('echo hello-dev');
    });
  });

  test('a PTY write failure falls into dev mode instead of dropping keystrokes silently', async () => {
    setDevMode(false);
    writeMock.mockImplementation(() => {
      throw new Error('pty write broke');
    });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('ls');

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('devMode', true);
    });
    expect(screen.getByTestId('topology-fallback-notice').textContent).toContain('writing to the terminal failed');
    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
  });

  test('already in dev mode: a PTY write failure does NOT re-fire the fallback', async () => {
    setDevMode(true);
    writeMock.mockImplementation(() => {
      throw new Error('pty write broke');
    });
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    submitToTerminal('ls');

    // The write failed, but dev mode was already on — the safe mode
    // is already the mode, so no fallback flip is attempted.
    expect(settingsSetMock).not.toHaveBeenCalledWith('devMode', true);
    expect(screen.queryByTestId('topology-fallback-notice')).toBeNull();
  });

  test('turning dev mode off resets the guard: a still-broken sync falls back again', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    const xtermInput = screen.getByTestId('xterm-fallback-input');
    vi.spyOn(xtermInput, 'focus').mockImplementation(() => {
      throw new Error('focus broke');
    });

    fireEvent.click(screen.getByTestId('prompt-section'));
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('devMode', true);
    });
    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();

    // Retry: turn dev mode off again (the user retrying the sync).
    await useSettingsStore.getState().updateSetting('devMode', false);
    await waitFor(() => {
      expect(screen.queryByTestId('dev-command-bar')).toBeNull();
    });

    // The sync is still broken — the next click falls back again.
    fireEvent.click(screen.getByTestId('prompt-section'));
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledTimes(3);
    });
    expect(settingsSetMock).toHaveBeenNthCalledWith(2, 'devMode', false);
    expect(settingsSetMock).toHaveBeenNthCalledWith(3, 'devMode', true);
    expect(screen.getByTestId('topology-fallback-notice')).not.toBeNull();
  });

  test('dismissing the notice hides it but stays in dev mode', async () => {
    setDevMode(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');

    const xtermInput = screen.getByTestId('xterm-fallback-input');
    vi.spyOn(xtermInput, 'focus').mockImplementation(() => {
      throw new Error('focus broke');
    });
    fireEvent.click(screen.getByTestId('prompt-section'));
    await waitFor(() => {
      expect(screen.getByTestId('topology-fallback-notice')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss topology fallback notice' }));
    expect(screen.queryByTestId('topology-fallback-notice')).toBeNull();
    // Still in dev mode — dismissing the banner does not re-sync.
    expect(screen.getByTestId('dev-command-bar')).not.toBeNull();
  });
});
