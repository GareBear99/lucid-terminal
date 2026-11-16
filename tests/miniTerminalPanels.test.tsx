// @vitest-environment jsdom
/**
 * Detached windows get panels (sweep item 8).
 *
 * A detached tab is no longer terminal-only: the MiniTerminal
 * carries the same History panel (with its tick rail) and the
 * same Docs panel as the main window, toggled from a left
 * rail — one panel at a time, same components, same stores.
 * The settle rides along: at level 3+ in devmode the detached
 * feed is the sole surface too (xterm unmounted).
 *
 * Run with: npx vitest run tests/miniTerminalPanels.test.tsx
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MiniTerminal from '../src/components/Terminal/MiniTerminal';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useFileStore } from '../src/stores/fileStore';
import { useCommandHistoryStore, COMMAND_HISTORY_STORAGE_KEY } from '../src/stores/commandHistoryStore';
import type { TerminalBlock } from '../src/types';

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => Promise.reject(new Error('monaco down')),
    config: () => {},
  },
  default: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const TAB = { id: 'terminal-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: true };

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let mockSettings: Record<string, unknown>;
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

function setLevel(level: 1 | 2 | 3, devMode = false) {
  mockSettings = {
    ...useSettingsStore.getState().settings,
    theme: 'dark',
    devMode,
    defconLevel: level,
    defconMergeReading: 'b',
    luciferAiEnabled: false,
  };
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, devMode, defconLevel: level, luciferAiEnabled: false },
  });
  useTerminalStore.setState({ tabs: [{ ...TAB }], activeTabId: TAB.id });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  prevLucidAPI = win.lucidAPI;
  changedCallback = null;
  setLevel(3);
  installLucidAPI();
  useHistoryStore.setState({ blocksByTab: {} });
  useCommandHistoryStore.setState({ entries: [], profileId: '', loaded: false, guestSessionActive: false, guestStash: null, guestStashProfileId: null });
  localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
});

function seedBlock(): TerminalBlock {
  return {
    id: 'b1',
    command: 'echo hi',
    output: 'hi',
    timestamp: 1000,
    isComplete: true,
  };
}

describe('MiniTerminal side panels — sweep item 8', () => {
  test('the rail shows History + Docs; neither panel is open at launch', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));
    expect(screen.getByTestId('mini-panel-history')).not.toBeNull();
    expect(screen.getByTestId('mini-panel-docs')).not.toBeNull();
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.queryByTestId('mini-docs-panel')).toBeNull();
  });

  test('History opens the tab\'s history; a second click closes it', async () => {
    useHistoryStore.setState({ blocksByTab: { 'terminal-1': [seedBlock()] } });
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    expect(screen.getByText('History')).not.toBeNull();
    // The command shows twice while the panel is open — once
    // in the feed's block header, once in the history item.
    expect(screen.getAllByText('echo hi')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    expect(screen.getAllByText('echo hi')).toHaveLength(1);
  });

  test('clicking a history item jumps to the block in the feed', async () => {
    useHistoryStore.setState({ blocksByTab: { 'terminal-1': [seedBlock()] } });
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    // The feed renders the live block; the jump scrolls to it
    // (jsdom has no scrollIntoView — the handler guards it, so
    // the click must not throw). The history item is the
    // button; the feed header is a span.
    expect(screen.getByTestId('terminal-block')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /echo hi/ }));
    expect(screen.getByTestId('terminal-block')).not.toBeNull();
  });

  test('Docs opens the docs panel with its empty state; minimize + expand work', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-docs'));
    expect(screen.getByTestId('mini-docs-panel')).not.toBeNull();
    expect(
      screen.getByText('Open a file and place the cursor on a symbol to see its documentation.'),
    ).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Minimize docs'));
    expect(screen.queryByTestId('mini-docs-panel')).toBeNull();
    expect(screen.getByLabelText('Show docs')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Show docs'));
    expect(screen.getByTestId('mini-docs-panel')).not.toBeNull();
  });

  test('only one panel is open at a time', async () => {
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    expect(screen.getByText('History')).not.toBeNull();
    fireEvent.click(screen.getByTestId('mini-panel-docs'));
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.getByTestId('mini-docs-panel')).not.toBeNull();
  });

  test('the settle rides along: devmode at level 3 unmounts the xterm, feed is the sole surface', async () => {
    setLevel(3, true);
    render(<MiniTerminal />);
    // The badge is null in devmode by design (Gary,
    // 2026-11-09), and MiniTerminal has no dev-command-bar —
    // wait on its own prompt section instead.
    await screen.findByTestId('mini-prompt-section');
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.queryByTestId('mini-terminal-surface-wrap')).toBeNull();
    const list = screen.getByTestId('terminal-blocks');
    expect(list.className).toContain('flex-1');
    expect(list.className).not.toContain('max-h-72');
  });
});

describe('MiniTerminal command history palette — sweep item 5, detached half', () => {
  test('Ctrl+R at level 3 opens the palette; selecting re-inputs into the composer', async () => {
    render(<MiniTerminal />);
    await screen.findByTestId('mini-prompt-section');
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
    // Seed AFTER mount: the mount effect loads the profile's
    // history from storage and would overwrite an earlier seed.
    useCommandHistoryStore.setState({ entries: ['ls', 'echo hi'] });

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    await screen.findByTestId('fuzzy-modal');
    expect(screen.getByTestId('fuzzy-modal-input').getAttribute('placeholder')).toBe(
      'Search command history',
    );
    // Newest first — the same list the main window shows.
    const rows = screen.getAllByTestId(/^fuzzy-modal-item-/);
    expect(rows.map((r) => r.textContent)).toEqual(['echo hi', 'ls']);

    fireEvent.click(rows[0]);
    await waitFor(() => expect(screen.queryByTestId('fuzzy-modal')).toBeNull());
    // Re-input: the command is in the composer, not run.
    const wrap = screen.getByTestId('prompter-composer-wrap');
    const composer = wrap.querySelector('textarea') as HTMLTextAreaElement;
    expect(composer.value).toBe('echo hi');
    const api = win.lucidAPI as unknown as { terminal: { write: ReturnType<typeof vi.fn> } };
    expect(api.terminal.write).not.toHaveBeenCalled();
  });

  test('Ctrl+R below 3 does not open the palette (the shell keeps its reverse-search)', async () => {
    setLevel(1);
    render(<MiniTerminal />);
    await screen.findByTestId('xterm-surface');
    useCommandHistoryStore.setState({ entries: ['ls'] });

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
  });

  test('plain R (no Ctrl) does not open the palette', async () => {
    render(<MiniTerminal />);
    await screen.findByTestId('mini-prompt-section');
    fireEvent.keyDown(window, { key: 'r' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
  });
});

describe('MiniTerminal Explorer — the detached Explorer panel', () => {
  const DIR = '/Users/gary';
  function seedEntries() {
    useFileStore.setState({
      currentDir: DIR,
      entries: [
        { path: `${DIR}/notes.txt`, name: 'notes.txt', isDirectory: false, isFile: true, size: 10, modified: 0 },
        { path: `${DIR}/src`, name: 'src', isDirectory: true, isFile: false, size: 0, modified: 0 },
      ],
      expandedDirs: new Set<string>(),
      selectedPath: null,
      error: null,
      isLoading: false,
    });
  }

  function installFsAndDetach() {
    const api = win.lucidAPI as unknown as Record<string, unknown>;
    const detachMock = vi.fn(async () => ({ ok: true }));
    (api as { fs?: unknown }).fs = {
      getStats: vi.fn(async () => ({ size: 10 })),
      readFile: vi.fn(async () => 'hello notes'),
      selectDirectory: vi.fn(async () => null),
    };
    (api as { filesDetach?: unknown }).filesDetach = {
      detach: detachMock,
      getDetachState: vi.fn(async () => null),
      getPendingMainFiles: vi.fn(async () => []),
      popIn: vi.fn(async () => ({ ok: true })),
      onFileAdded: vi.fn(() => () => {}),
      onFileRemoved: vi.fn(() => () => {}),
    };
    return detachMock;
  }

  test('the rail shows Explorer; clicking it opens the same Explorer panel', async () => {
    seedEntries();
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));
    expect(screen.getByTestId('mini-panel-explorer')).not.toBeNull();
    expect(screen.queryByTestId('explorer-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('mini-panel-explorer'));
    expect(screen.getByTestId('explorer-panel')).not.toBeNull();
    expect(screen.getByText('notes.txt')).not.toBeNull();
    expect(screen.getByText('src')).not.toBeNull();
    // The current-dir row shows the workspace root (the
    // terminal's cwd chip shows the same path — scope the
    // check to the panel).
    expect(screen.getByTestId('explorer-panel').textContent).toContain(DIR);
  });

  test('one panel at a time: opening Explorer closes History, and vice versa', async () => {
    seedEntries();
    useHistoryStore.setState({ blocksByTab: { 'terminal-1': [seedBlock()] } });
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    expect(screen.getByText('History')).not.toBeNull();
    fireEvent.click(screen.getByTestId('mini-panel-explorer'));
    expect(screen.getByTestId('explorer-panel')).not.toBeNull();
    expect(screen.queryByText('History')).toBeNull();

    fireEvent.click(screen.getByTestId('mini-panel-history'));
    expect(screen.queryByTestId('explorer-panel')).toBeNull();
    expect(screen.getByText('History')).not.toBeNull();
  });

  test('Explorer minimize + expand work (minimize, never delete)', async () => {
    seedEntries();
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-explorer'));
    expect(screen.getByTestId('explorer-panel')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Minimize explorer'));
    expect(screen.queryByTestId('explorer-panel')).toBeNull();
    expect(screen.getByLabelText('Show explorer')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Show explorer'));
    expect(screen.getByTestId('explorer-panel')).not.toBeNull();
  });

  test('clicking a file detaches it into a MiniFiles window at the click point', async () => {
    seedEntries();
    const detachMock = installFsAndDetach();
    render(<MiniTerminal />);
    await waitFor(() => expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3'));

    fireEvent.click(screen.getByTestId('mini-panel-explorer'));
    fireEvent.click(screen.getByText('notes.txt'), { clientX: 120, clientY: 200 });
    await waitFor(() => expect(detachMock).toHaveBeenCalledTimes(1));
    const [file, x, y] = detachMock.mock.calls[0];
    expect(file.path).toBe(`${DIR}/notes.txt`);
    expect(file.content).toBe('hello notes');
    expect(x).toBe(120);
    expect(y).toBe(200);
  });
});
