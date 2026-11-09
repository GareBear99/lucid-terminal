// @vitest-environment jsdom
/**
 * Online indicator tests (Gary, 2026-11-09 ~03:58 PST, refined ~04:00 PST).
 *
 * Just the DOT on the FixNet line, top-right, opposite the FixNet
 * stats — no visible text label. Hovering the dot opens a hover
 * overlay in which a cursor TYPES the status out character by
 * character (typewriter effect), with the dot TRAVELLING along
 * after the typed text: every character pushes the dot one step
 * further, so the dot shifts position as the text grows.
 *
 * Three states, from the terminal's real PTY state (not a timer):
 * green dot = online (hover types "online"), blackened dot =
 * offline (hover types "offline"), GREY dot = unknown (hover
 * types "N/A") — unknown while no PTY state is known yet
 * (ptyStateKnown false). Grey REPLACES the old hiding: the row
 * renders from the start with a grey dot instead of the whole
 * line hiding until the first FixNet stats fetch.
 *
 * Covers:
 * (a) OnlineIndicator renders dot-only (no visible status text)
 *     with the right dot colour per state;
 * (b) hover overlay: no overlay until hover, then the status
 *     types out char by char with a visible typing cursor, and
 *     the travelling dot sits after the typed text and shifts
 *     along as the text grows; unknown types "N/A";
 * (c) activeTerminalStatus: unknown while ptyStateKnown is false,
 *     online/offline from the same real PTY state as
 *     isActiveTerminalOnline once known;
 * (d) isActiveTerminalOnline: unchanged behaviour (offline with
 *     no tabs, online with a live active tab, offline when the
 *     active tab exited or failed to spawn, unaffected by a dead
 *     non-active tab);
 * (e) the store: markTabExited + createTab mark PTY state known;
 *     closing the last tab leaves the terminal offline, not
 *     unknown again;
 * (f) FixNetStatus: the indicator sits on the SAME line as the
 *     FixNet stats (same flex row, FixNet left, indicator right);
 *     the row renders from the start with a grey dot before the
 *     first stats fetch, and shows the live status once PTY state
 *     is known.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  OnlineIndicator,
  TYPE_INTERVAL_MS,
} from '../src/components/FixNet/OnlineIndicator';
import { FixNetStatus } from '../src/components/FixNet/FixNetStatus';
import {
  useTerminalStore,
  isActiveTerminalOnline,
  activeTerminalStatus,
} from '../src/stores/terminalStore';
import type { TerminalTab } from '../src/types';

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

function tab(id: string, isActive: boolean): TerminalTab {
  return { id, title: `Terminal ${id}`, cwd: '/Users/gary', isActive };
}

function mockLucidAPI(getFixNetStats?: () => Promise<unknown>) {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    fs: { getHomeDir: vi.fn(async () => '/Users/gary') },
    terminal: {
      create: vi.fn(async () => {}),
      destroy: vi.fn(),
    },
    lucid: {
      getFixNetStats:
        getFixNetStats ??
        vi.fn(async () => ({
          success: true,
          fixes_count: 0,
          scripts_count: 0,
          last_sync: null,
          offline_percentage: 0,
        })),
    },
  };
}

function restoreLucidAPI() {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
}

function resetTerminalStore() {
  useTerminalStore.setState({
    tabs: [],
    activeTabId: null,
    createErrors: {},
    exitedTabs: {},
    ptyStateKnown: false,
  });
  useTerminalStore.getState().resetForTests();
}

beforeEach(() => {
  mockLucidAPI();
  resetTerminalStore();
});

afterEach(() => {
  act(() => {
    resetTerminalStore();
  });
  restoreLucidAPI();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('OnlineIndicator — dot only', () => {
  it('shows just a green dot with NO visible text when online', () => {
    render(<OnlineIndicator status="online" />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('online');
    // Dot only: no visible status text at all.
    expect(indicator.textContent).toBe('');
    expect(screen.queryByText('online')).toBeNull();
    const dot = screen.getByTestId('online-dot');
    expect(dot.className).toContain('bg-green-500');
    expect(dot.className).not.toContain('bg-black');
    expect(dot.className).not.toContain('bg-gray-500');
  });

  it('shows just a blackened dot with NO visible text when offline', () => {
    render(<OnlineIndicator status="offline" />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('offline');
    expect(indicator.textContent).toBe('');
    expect(screen.queryByText('offline')).toBeNull();
    const dot = screen.getByTestId('online-dot');
    // Blackened (Gary, 2026-11-09 ~02:52 PST): a black dot. The
    // border keeps it visible against the black screen.
    expect(dot.className).toContain('bg-black');
    expect(dot.className).toContain('border');
    expect(dot.className).not.toContain('bg-green-500');
    expect(dot.className).not.toContain('bg-gray-500');
  });

  it('shows just a GREY dot with NO visible text when unknown', () => {
    render(<OnlineIndicator status="unknown" />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('unknown');
    expect(indicator.textContent).toBe('');
    expect(screen.queryByText('N/A')).toBeNull();
    const dot = screen.getByTestId('online-dot');
    expect(dot.className).toContain('bg-gray-500');
    expect(dot.className).not.toContain('bg-green-500');
    expect(dot.className).not.toContain('bg-black');
  });
});

describe('OnlineIndicator — hover overlay types the status out', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function hoverIndicator() {
    render(<OnlineIndicator status="online" />);
    const indicator = screen.getByTestId('online-indicator');
    fireEvent.mouseEnter(indicator);
    return indicator;
  }

  it('shows no overlay until hovered', () => {
    render(<OnlineIndicator status="online" />);
    expect(screen.queryByTestId('online-status-overlay')).toBeNull();
    expect(screen.queryByTestId('typing-cursor')).toBeNull();
  });

  it('types "online" out character by character with a visible cursor', () => {
    hoverIndicator();

    const overlay = screen.getByTestId('online-status-overlay');
    expect(overlay).not.toBeNull();
    // The typing cursor is visible from the first frame.
    expect(screen.getByTestId('typing-cursor')).not.toBeNull();

    // Nothing typed yet on open; then one character per interval.
    expect(screen.getByTestId('typed-status-text').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('o');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('on');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 4);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('online');
    // Typing stops at the full text; the cursor stays visible.
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 10);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('online');
    expect(screen.getByTestId('typing-cursor')).not.toBeNull();
  });

  it('the travelling dot sits after the typed text and shifts along as it grows', () => {
    hoverIndicator();

    const travelling = screen.getByTestId('online-dot-travelling');
    const typed = screen.getByTestId('typed-status-text');
    // The dot mirrors the state colour (green while online).
    expect(travelling.className).toContain('bg-green-500');
    // Order inside the overlay: typed text, then the dot, then the
    // typing cursor — so the dot is pushed along by the text.
    expect(travelling.previousSibling).toBe(typed);
    expect(screen.getByTestId('typing-cursor').previousSibling).toBe(travelling);

    // As the text grows, the dot stays glued after it: the text
    // before the dot goes from "" to "on" to "online", i.e. the
    // dot's position shifts with the typing instead of sitting still.
    expect((travelling.previousSibling as Element).textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 2);
    });
    expect((travelling.previousSibling as Element).textContent).toBe('on');
    expect(travelling.previousSibling).toBe(typed);
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 4);
    });
    expect((travelling.previousSibling as Element).textContent).toBe('online');
    expect(travelling.previousSibling).toBe(typed);
  });

  it('types "offline" for the offline state', () => {
    render(<OnlineIndicator status="offline" />);
    fireEvent.mouseEnter(screen.getByTestId('online-indicator'));

    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 7);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('offline');
    expect(screen.getByTestId('online-dot-travelling').className).toContain('bg-black');
  });

  it('types "N/A" for the unknown (grey) state', () => {
    render(<OnlineIndicator status="unknown" />);
    fireEvent.mouseEnter(screen.getByTestId('online-indicator'));

    expect(screen.getByTestId('typed-status-text').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 3);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('N/A');
    expect(screen.getByTestId('online-dot-travelling').className).toContain('bg-gray-500');
  });

  it('hides the overlay and resets the typing when hover ends', () => {
    const indicator = hoverIndicator();
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS * 6);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('online');

    fireEvent.mouseLeave(indicator);
    expect(screen.queryByTestId('online-status-overlay')).toBeNull();

    // Hovering again starts the typing over from scratch.
    fireEvent.mouseEnter(indicator);
    expect(screen.getByTestId('typed-status-text').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS);
    });
    expect(screen.getByTestId('typed-status-text').textContent).toBe('o');
  });
});

describe('activeTerminalStatus', () => {
  it('is unknown while no PTY state is known yet', () => {
    expect(
      activeTerminalStatus({
        tabs: [],
        activeTabId: null,
        exitedTabs: {},
        createErrors: {},
        ptyStateKnown: false,
      }),
    ).toBe('unknown');
  });

  it('is online with a live active tab once PTY state is known', () => {
    expect(
      activeTerminalStatus({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: {},
        createErrors: {},
        ptyStateKnown: true,
      }),
    ).toBe('online');
  });

  it('is offline when the active tab exited, once PTY state is known', () => {
    expect(
      activeTerminalStatus({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: { 'terminal-1': 130 },
        createErrors: {},
        ptyStateKnown: true,
      }),
    ).toBe('offline');
  });

  it('is offline with no tabs once PTY state is known (all tabs closed)', () => {
    expect(
      activeTerminalStatus({
        tabs: [],
        activeTabId: null,
        exitedTabs: {},
        createErrors: {},
        ptyStateKnown: true,
      }),
    ).toBe('offline');
  });
});

describe('isActiveTerminalOnline', () => {
  it('is offline with no tabs at all (the empty state)', () => {
    expect(
      isActiveTerminalOnline({ tabs: [], activeTabId: null, exitedTabs: {}, createErrors: {} }),
    ).toBe(false);
  });

  it('is online with a live active tab', () => {
    expect(
      isActiveTerminalOnline({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: {},
        createErrors: {},
      }),
    ).toBe(true);
  });

  it('is offline when the active tab\'s shell exited', () => {
    expect(
      isActiveTerminalOnline({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: { 'terminal-1': 130 },
        createErrors: {},
      }),
    ).toBe(false);
  });

  it('is offline when the active tab failed to spawn', () => {
    expect(
      isActiveTerminalOnline({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: {},
        createErrors: { 'terminal-1': 'spawn ENOENT' },
      }),
    ).toBe(false);
  });

  it('stays online when a NON-active tab died but the active one is live', () => {
    expect(
      isActiveTerminalOnline({
        tabs: [tab('terminal-1', false), tab('terminal-2', true)],
        activeTabId: 'terminal-2',
        exitedTabs: { 'terminal-1': 1 },
        createErrors: {},
      }),
    ).toBe(true);
  });

  it('is offline when the active id names no tab', () => {
    expect(
      isActiveTerminalOnline({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-99',
        exitedTabs: {},
        createErrors: {},
      }),
    ).toBe(false);
  });
});

describe('terminalStore ptyStateKnown', () => {
  it('markTabExited records the exit AND marks PTY state known', () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
      });
      useTerminalStore.getState().markTabExited('terminal-1', 130);
    });

    expect(useTerminalStore.getState().exitedTabs).toEqual({ 'terminal-1': 130 });
    expect(useTerminalStore.getState().ptyStateKnown).toBe(true);
    expect(activeTerminalStatus(useTerminalStore.getState())).toBe('offline');
  });

  it('createTab marks PTY state known (a live tab reads online, not unknown)', async () => {
    let id = '';
    await act(async () => {
      id = await useTerminalStore.getState().createTab();
    });

    expect(id).toBe('terminal-1');
    expect(useTerminalStore.getState().ptyStateKnown).toBe(true);
    expect(activeTerminalStatus(useTerminalStore.getState())).toBe('online');
  });

  it('closing the last tab leaves the terminal offline, not unknown again', async () => {
    // Close by the id createTab actually returned: the module-level
    // used-tab-numbers set persists across tests in this file, so a
    // tab created by an earlier test may hold terminal-1 and this
    // create reuses the next free number.
    let id = '';
    await act(async () => {
      id = await useTerminalStore.getState().createTab();
    });
    act(() => {
      useTerminalStore.getState().closeTab(id);
    });

    expect(useTerminalStore.getState().tabs).toEqual([]);
    expect(useTerminalStore.getState().ptyStateKnown).toBe(true);
    expect(activeTerminalStatus(useTerminalStore.getState())).toBe('offline');
  });

  it('createTab clears a stale exited record when the tab number is reused', async () => {
    // A tab is created, dies, and is closed — freeing its number —
    // but a stale exited record lingers for that id. The next
    // create reuses the freed number and must come up live, not
    // inherit the death. (The id is whatever number is free here:
    // the module-level used-numbers set persists across tests in
    // this file, so it is not necessarily terminal-1.)
    let firstId = '';
    await act(async () => {
      firstId = await useTerminalStore.getState().createTab();
    });
    act(() => {
      useTerminalStore.getState().markTabExited(firstId, 130);
      useTerminalStore.getState().closeTab(firstId);
      // Stale record for the freed id, as if the death was recorded
      // after the close.
      useTerminalStore.setState({ exitedTabs: { [firstId]: 130 } });
    });

    let id = '';
    await act(async () => {
      id = await useTerminalStore.getState().createTab();
    });

    expect(id).toBe(firstId);
    expect(useTerminalStore.getState().exitedTabs).toEqual({});
    expect(activeTerminalStatus(useTerminalStore.getState())).toBe('online');
  });
});

describe('FixNetStatus — online indicator on the FixNet line', () => {
  it('shows a green dot-only indicator on the same line as FixNet when the active tab is live', async () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        ptyStateKnown: true,
      });
    });
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('online');
    // Dot only: no visible status text on the line.
    expect(indicator.textContent).toBe('');
    expect(screen.getByTestId('online-dot').className).toContain('bg-green-500');
    // The FixNet stats are still there, on the SAME row: FixNet left,
    // indicator right (flex row, space between).
    const row = indicator.parentElement;
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('FixNet:');
    expect(row!.className).toContain('justify-between');
    unmount();
  });

  it('shows a blackened dot-only indicator when the active tab\'s shell exited', async () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: { 'terminal-1': 130 },
        ptyStateKnown: true,
      });
    });
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('offline');
    expect(indicator.textContent).toBe('');
    const dot = screen.getByTestId('online-dot');
    expect(dot.className).toContain('bg-black');
    expect(dot.className).not.toContain('bg-green-500');
    // FixNet stats still render on the same line.
    expect(indicator.parentElement!.textContent).toContain('FixNet:');
    unmount();
  });

  it('shows a GREY dot (unknown) while no PTY state is known yet', async () => {
    // Store reset leaves ptyStateKnown false: startup, no tab yet.
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('unknown');
    expect(indicator.textContent).toBe('');
    expect(screen.getByTestId('online-dot').className).toContain('bg-gray-500');
    expect(indicator.parentElement!.textContent).toContain('FixNet:');
    unmount();
  });

  it('renders the row with a grey dot BEFORE the first stats fetch lands (no more hiding)', async () => {
    // The stats fetch never resolves: the old code rendered nothing
    // until it did. The dot must be visible immediately, grey.
    mockLucidAPI(() => new Promise(() => {}));
    const { unmount } = render(<FixNetStatus />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-status')).toBe('unknown');
    expect(screen.getByTestId('online-dot').className).toContain('bg-gray-500');
    expect(indicator.parentElement!.textContent).toContain('FixNet:');
    unmount();
  });
});
