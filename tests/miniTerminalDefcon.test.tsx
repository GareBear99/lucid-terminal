// @vitest-environment jsdom
/**
 * MiniTerminal global DEFCON state (Gary, 2026-11-13 ~13:24 PST —
 * "terminal tabs should always be in the global defcon state,
 * even when pulled out").
 *
 * A detached terminal tab window must stay in the SAME global
 * DEFCON state as the main window — not its own level, not the
 * default. That means: the level comes from the shared settings
 * store (the same source the main window uses), the DEFCON 2
 * merge renders in the detached window (mist back layer, veil,
 * no terminal box, whiter text via XtermSurface), the badge
 * shows the level, and a /defcon change in the main window
 * follows live via the settings:changed push.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MiniTerminal from '../src/components/Terminal/MiniTerminal';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useProfileStore } from '../src/stores/profileStore';

// Monaco never mounts here: the loader rejects at once, so
// InputArea renders its plain-textarea fallback immediately
// (no 8s timeout, no editor) — same mock as the DEFCON 3
// phase tests.
vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => Promise.reject(new Error('monaco down')),
    config: () => {},
  },
  default: () => null,
}));

// jsdom has no ResizeObserver; the tab strip's bar-rect effect
// constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const TAB = { id: 'terminal-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: true };

const win = window as unknown as {
  lucidAPI?: unknown;
};

let prevLucidAPI: unknown;
// The settings main would return from settings:getAll — the
// test drives the level through this, the way the real app does.
let mockSettings: Record<string, unknown>;
// The settings:changed listener MiniTerminal registers.
let changedCallback: ((key: string, value: unknown) => void) | null = null;

function installLucidAPI() {
  const noopUnsub = () => () => {};
  win.lucidAPI = {
    settings: {
      getAll: vi.fn(async () => ({ ...mockSettings })),
      get: vi.fn(async (_key: string) => undefined),
      set: vi.fn(async () => {}),
      hasApiKey: vi.fn(async () => false),
      hasPingKey: vi.fn(async () => false),
      hasTelegramBotToken: vi.fn(async () => false),
      hasStripeApiKey: vi.fn(async () => false),
      hasKaggleApiKey: vi.fn(async () => false),
      hasTotpSecret: vi.fn(async () => false),
      getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      getRunOnStartup: vi.fn(async () => false),
      onChanged: vi.fn((cb: (key: string, value: unknown) => void) => {
        changedCallback = cb;
        return () => {
          changedCallback = null;
        };
      }),
    },
    ai: {
      checkLocalBackend: vi.fn(async () => false),
    },
    lucid: {
      init: vi.fn(async () => ({ success: true })),
      getModelStatuses: vi.fn(async () => ({})),
    },
    terminal: {
      write: vi.fn(),
      resize: vi.fn(),
      onData: vi.fn(noopUnsub),
      onExit: vi.fn(noopUnsub),
      onCwd: vi.fn(noopUnsub),
      create: vi.fn(async () => {}),
      detach: {
        getDetachState: vi.fn(async () => null),
        claimTab: vi.fn(),
        popIn: vi.fn(async () => ({ ok: true })),
        onTabAdded: vi.fn(noopUnsub),
        onTabRemoved: vi.fn(noopUnsub),
        onTabDetached: vi.fn(noopUnsub),
        onReleaseNumber: vi.fn(noopUnsub),
        // Cross-window number registry (Gary, 2026-11-13):
        // the hook subscribes to reserve broadcasts and
        // seeds its numbers from main on mount.
        onReserveNumber: vi.fn(noopUnsub),
        getReservedNumbers: vi.fn(async () => []),
        onDragDetect: vi.fn(noopUnsub),
        onDragDetectClear: vi.fn(noopUnsub),
        reportBarRect: vi.fn(),
      },
    },
    window: {
      close: vi.fn(),
    },
  };
}

function setLevel(level: 1 | 2 | 3) {
  mockSettings = {
    ...useSettingsStore.getState().settings,
    theme: 'dark',
    devMode: false,
    defconLevel: level,
    defconMergeReading: 'b',
    // LuciferAI is default OFF — reset it here so a test that
    // enables it never leaks into the next one.
    luciferAiEnabled: false,
  };
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, devMode: false, defconLevel: level, luciferAiEnabled: false },
  });
  useTerminalStore.setState({ tabs: [{ ...TAB }], activeTabId: TAB.id });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  prevLucidAPI = win.lucidAPI;
  changedCallback = null;
  setLevel(3);
  installLucidAPI();
  // Fresh blocks per test: the detached composer builds live
  // blocks in this renderer's historyStore.
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  // Do NOT clear the terminal store here: the component is still
  // mounted until RTL's cleanup unmounts it, and emptying the
  // tabs fires its close-on-empty effect (window.close) after
  // the mock is gone. The next test's setLevel resets the tabs.
});

describe('MiniTerminal global DEFCON state (Gary, 2026-11-13)', () => {
  test('at DEFCON 3 the detached window shows the global level and the merge', async () => {
    render(<MiniTerminal />);
    // The badge reads the same store as the main terminal.
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));
    // The mist back layer is always rendered (the main app's
    // background, behind the terminal).
    expect(screen.getByTestId('mini-defcon-mist')).toBeTruthy();
    expect(screen.getAllByTestId('smoke-puff').length).toBe(7);
    // The merge veil on the content layer (same classes as the
    // main terminal page). The surface wrap is GONE at level 3
    // in non-devmode — the prompter feed is the sole surface
    // (xterm unmounted), so there is no box to assert on.
    const content = screen.getByTestId('mini-terminal-content');
    expect(content.className).toContain('bg-black/25');
    expect(content.className).toContain('backdrop-blur-sm');
    expect(screen.queryByTestId('mini-terminal-surface-wrap')).toBeNull();
  });

  test('at DEFCON 1 the badge reads 1 but the window never renders below DEFCON 2 (the floor)', async () => {
    // Gary, 2026-11-13 ~13:55 PST — an external window "should
    // never regress naturally below the current defcon 2 state":
    // the badge still reads the GLOBAL level (1), but the
    // rendering is floored at 2 — the merge veil, no terminal
    // box — never the DEFCON 1 solid box.
    setLevel(1);
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 1'));
    const content = screen.getByTestId('mini-terminal-content');
    expect(content.className).toContain('bg-black/25');
    expect(content.className).toContain('backdrop-blur-sm');
    const wrap = screen.getByTestId('mini-terminal-surface-wrap');
    expect(wrap.className).toContain('border-0');
    expect(wrap.className).toContain('bg-transparent');
    expect(wrap.className).not.toContain('bg-black');
  });

  test('a /defcon change in the main window follows live via settings:changed', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));
    expect(changedCallback).not.toBeNull();
    // Main sets the level to 1; the push carries the key and
    // the mini reloads settings from main. The badge follows
    // to 1 — but the rendering stays floored at the DEFCON 2
    // merge (Gary, 2026-11-13 ~13:55 PST), never the solid box.
    mockSettings = { ...mockSettings, defconLevel: 1 };
    changedCallback?.('defconLevel', 1);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 1'));
    const wrap = screen.getByTestId('mini-terminal-surface-wrap');
    expect(wrap.className).toContain('border-0');
    expect(wrap.className).toContain('bg-transparent');
    expect(wrap.className).not.toContain('bg-black');
    const content = screen.getByTestId('mini-terminal-content');
    expect(content.className).toContain('bg-black/25');
  });

  test('the chrome title starts past the traffic-light circles', async () => {
    // Gary, 2026-11-13 ~14:06 PST — "have the terminal wording
    // start past the circles": the frameless window draws the
    // macOS traffic lights over the chrome's top-left, so the
    // title needs left padding clearing the whole cluster.
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('mini-terminal-chrome')).toBeTruthy());
    const chrome = screen.getByTestId('mini-terminal-chrome');
    expect(chrome.className).toContain('pl-[76px]');
  });

  test('at DEFCON 3 the detached window gets the full prompter (composer + feed, xterm unmounted in non-devmode)', async () => {
    // Gary, 2026-11-13 ~13:55 PST — the detached window "should
    // be no different as defcon proposes": at level 3 the linked
    // composer is the input and the live blocks feed IS the
    // terminal surface, exactly as in the main window.
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    expect(screen.getByTestId('terminal-blocks')).toBeTruthy();
    expect(screen.getByTestId('mini-prompt-section')).toBeTruthy();
    // Non-devmode level 3 unmounts the xterm (the feed is the
    // sole surface, so output appears exactly once).
    expect(screen.queryByTestId('mini-terminal-surface-wrap')).toBeNull();
  });

  test('composer submit runs a bare command: block opens and the PTY gets it', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    const textarea = screen.getByTestId('prompter-composer-wrap').querySelector('textarea');
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: 'ls' } });
    fireEvent.keyDown(textarea!, { key: 'Enter' });
    const writeMock = (win.lucidAPI as unknown as { terminal: { write: ReturnType<typeof vi.fn> } }).terminal.write;
    await waitFor(() => expect(writeMock).toHaveBeenCalledWith('terminal-1', 'ls\r'));
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
    expect(blocks[blocks.length - 1]?.command).toBe('ls');
  });

  test('/defcon in the detached composer changes the level and writes the confirmation into the block', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    const textarea = screen.getByTestId('prompter-composer-wrap').querySelector('textarea');
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: '/defcon 2' } });
    fireEvent.keyDown(textarea!, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 2'));
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
    const block = blocks[blocks.length - 1];
    expect(block?.command).toBe('/defcon 2');
    expect(block?.output).toContain('DEFCON 2');
  });

  test('other slash lines never reach the shell', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    const textarea = screen.getByTestId('prompter-composer-wrap').querySelector('textarea');
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: '/help' } });
    fireEvent.keyDown(textarea!, { key: 'Enter' });
    const writeMock = (win.lucidAPI as unknown as { terminal: { write: ReturnType<typeof vi.fn> } }).terminal.write;
    await waitFor(() => {
      const blocks = useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
      expect(blocks[blocks.length - 1]?.command).toBe('/help');
    });
    expect(writeMock).not.toHaveBeenCalled();
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
    expect(blocks[blocks.length - 1]?.output).toContain('Slash commands run in the main window');
  });
});

describe('MiniTerminal prompt section — blood drop, hint line, pill row (Gary, 2026-11-13 ~14:35 PST)', () => {
  // The external prompt + pills were all messed up without
  // them, and the drop must be there: the detached prompt
  // section is the full prompter, same as the main window.
  function setLuciferAiEnabled(enabled: boolean) {
    mockSettings = { ...mockSettings, luciferAiEnabled: enabled };
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, luciferAiEnabled: enabled },
    });
  }

  test('at DEFCON 3 with LuciferAI on: blood drop + hint line + pill row all present', async () => {
    setLuciferAiEnabled(true);
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    // The blood drop: after the probe resolves the droplet SVG
    // renders (not the ⏳/⚪ status glyphs).
    await waitFor(() => {
      const drop = screen.getByTestId('blood-drop');
      expect(drop.querySelector('svg')).not.toBeNull();
    });
    // The hint line teaches the next keystroke.
    expect(screen.getByTestId('terminal-hint-line').textContent).toContain('new agent conversation');
    // The pill row: mode, driving-agent, cwd, version — correct
    // layout, no overlap (one row, flex-wrap, shrink-0 pills).
    expect(screen.getByTestId('prompt-pill-row')).toBeTruthy();
    expect(screen.getByTestId('mode-pill').textContent).toContain('Terminal');
    expect(screen.getByTestId('driving-agent-pill').textContent).toBe('LLMBuilder');
    expect(screen.getByTestId('cwd-pill').textContent).toBe('/Users/gary');
    expect(screen.getByTestId('version-pill')).toBeTruthy();
    // No repo in the test (no git API mock) — the git pills stay
    // hidden rather than rendering empty.
    expect(screen.queryByTestId('git-branch-pill')).toBeNull();
    expect(screen.queryByTestId('git-counts-pill')).toBeNull();
  });

  test('with LuciferAI off the drop is gone but the hint line and pills stay', async () => {
    // Default setLevel leaves LuciferAI off (default OFF).
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('prompter-composer')).toBeTruthy());
    expect(screen.queryByTestId('blood-drop')).toBeNull();
    expect(screen.getByTestId('terminal-hint-line')).toBeTruthy();
    expect(screen.getByTestId('prompt-pill-row')).toBeTruthy();
    expect(screen.getByTestId('mode-pill')).toBeTruthy();
  });

  test('in guest the mode pill is disabled (terminal-only, same as the main window)', async () => {
    setLuciferAiEnabled(true);
    const profileState = useProfileStore.getState();
    const prevProfiles = profileState.profiles;
    const prevActiveProfileId = profileState.activeProfileId;
    useProfileStore.setState({
      profiles: [
        {
          id: 'guest',
          name: 'Guest',
          status: 'guest',
          verifiedGates: [],
          createdAt: '2026-11-13',
          lastActiveAt: null,
        },
      ],
      activeProfileId: 'guest',
    });
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('mode-pill')).toBeTruthy());
    // No jest-dom in this repo — assert on the DOM property.
    expect((screen.getByTestId('mode-pill') as HTMLButtonElement).disabled).toBe(true);
    // The rest of the prompt still renders for guests.
    expect(screen.getByTestId('blood-drop')).toBeTruthy();
    expect(screen.getByTestId('prompt-pill-row')).toBeTruthy();
    // Restore the profile so later tests are unaffected.
    useProfileStore.setState({ profiles: prevProfiles, activeProfileId: prevActiveProfileId });
  });
});
