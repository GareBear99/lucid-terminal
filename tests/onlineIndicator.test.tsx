// @vitest-environment jsdom
/**
 * Online indicator tests (Gary, 2026-11-09 ~02:51 PST, refined ~02:52 PST).
 *
 * A circle + label on the FixNet line, top-right, opposite the
 * FixNet stats: green circle + "online" while the terminal is active
 * within the system to the computer, blackened circle + "offline"
 * when it is not.
 *
 * The state is the terminal's real PTY state, not a timer: the store
 * records a shell's death from the main process's `terminal:exit`
 * event (markTabExited), and isActiveTerminalOnline derives the
 * boolean from the active tab + exitedTabs + createErrors.
 *
 * Covers:
 * (a) OnlineIndicator renders green + "online" when online, and a
 *     blackened dot + "offline" when offline;
 * (b) isActiveTerminalOnline: offline with no tabs, online with a
 *     live active tab, offline when the active tab exited or failed
 *     to spawn, unaffected by a dead non-active tab;
 * (c) the store: markTabExited records the exit, closeTab drops the
 *     record, createTab clears a stale record when a tab number is
 *     reused (numbers are recycled, so a fresh terminal-1 must not
 *     inherit the old terminal-1's death);
 * (d) FixNetStatus: the indicator sits on the SAME line as the
 *     FixNet stats (same flex row, FixNet left, indicator right) and
 *     shows "online" + green for a live active tab, "offline" +
 *     blackened for an exited active tab or no tabs at all.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OnlineIndicator } from '../src/components/FixNet/OnlineIndicator';
import { FixNetStatus } from '../src/components/FixNet/FixNetStatus';
import { useTerminalStore, isActiveTerminalOnline } from '../src/stores/terminalStore';
import type { TerminalTab } from '../src/types';

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

function tab(id: string, isActive: boolean): TerminalTab {
  return { id, title: `Terminal ${id}`, cwd: '/Users/gary', isActive };
}

function mockLucidAPI() {
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    fs: { getHomeDir: vi.fn(async () => '/Users/gary') },
    terminal: {
      create: vi.fn(async () => {}),
      destroy: vi.fn(),
    },
    lucid: {
      getFixNetStats: vi.fn(async () => ({
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
});

describe('OnlineIndicator', () => {
  it('shows a green dot + "online" when the terminal is active', () => {
    render(<OnlineIndicator isOnline />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-online')).toBe('true');
    expect(indicator.textContent).toContain('online');
    const dot = screen.getByTestId('online-dot');
    expect(dot.className).toContain('bg-green-500');
    expect(dot.className).not.toContain('bg-black');
  });

  it('shows a blackened dot + "offline" when the terminal is not active', () => {
    render(<OnlineIndicator isOnline={false} />);

    const indicator = screen.getByTestId('online-indicator');
    expect(indicator.getAttribute('data-online')).toBe('false');
    expect(indicator.textContent).toContain('offline');
    const dot = screen.getByTestId('online-dot');
    // Blackened (Gary, 2026-11-09 ~02:52 PST): a black dot. The
    // border keeps it visible against the black screen.
    expect(dot.className).toContain('bg-black');
    expect(dot.className).toContain('border');
    expect(dot.className).not.toContain('bg-green-500');
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

describe('terminalStore exitedTabs', () => {
  it('markTabExited records the shell death by tab id + exit code', () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
      });
      useTerminalStore.getState().markTabExited('terminal-1', 130);
    });

    expect(useTerminalStore.getState().exitedTabs).toEqual({ 'terminal-1': 130 });
    expect(isActiveTerminalOnline(useTerminalStore.getState())).toBe(false);
  });

  it('closeTab drops the exited record with the tab', () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: { 'terminal-1': 1 },
      });
      useTerminalStore.getState().closeTab('terminal-1');
    });

    expect(useTerminalStore.getState().tabs).toEqual([]);
    expect(useTerminalStore.getState().exitedTabs).toEqual({});
  });

  it('createTab clears a stale exited record when the tab number is reused', async () => {
    // The old terminal-1 died; no tabs remain, so the next create
    // reuses terminal-1 — it must come up live, not inherit the death.
    act(() => {
      useTerminalStore.setState({
        tabs: [],
        activeTabId: null,
        exitedTabs: { 'terminal-1': 130 },
      });
    });

    let id = '';
    await act(async () => {
      id = await useTerminalStore.getState().createTab();
    });

    expect(id).toBe('terminal-1');
    expect(useTerminalStore.getState().exitedTabs).toEqual({});
    expect(isActiveTerminalOnline(useTerminalStore.getState())).toBe(true);
  });
});

describe('FixNetStatus — online indicator on the FixNet line', () => {
  it('shows green + "online" on the same line as FixNet when the active tab is live', async () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
      });
    });
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-online')).toBe('true');
    expect(indicator.textContent).toContain('online');
    expect(screen.getByTestId('online-dot').className).toContain('bg-green-500');
    // The FixNet stats are still there, on the SAME row: FixNet left,
    // indicator right (flex row, space between).
    const row = indicator.parentElement;
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('FixNet:');
    expect(row!.className).toContain('justify-between');
    unmount();
  });

  it('shows blackened + "offline" when the active tab\'s shell exited', async () => {
    act(() => {
      useTerminalStore.setState({
        tabs: [tab('terminal-1', true)],
        activeTabId: 'terminal-1',
        exitedTabs: { 'terminal-1': 130 },
      });
    });
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-online')).toBe('false');
    expect(indicator.textContent).toContain('offline');
    const dot = screen.getByTestId('online-dot');
    expect(dot.className).toContain('bg-black');
    expect(dot.className).not.toContain('bg-green-500');
    // FixNet stats still render on the same line.
    expect(indicator.parentElement!.textContent).toContain('FixNet:');
    unmount();
  });

  it('shows blackened + "offline" with no tabs at all', async () => {
    const { unmount } = render(<FixNetStatus />);

    const indicator = await screen.findByTestId('online-indicator');
    expect(indicator.getAttribute('data-online')).toBe('false');
    expect(indicator.textContent).toContain('offline');
    expect(screen.getByTestId('online-dot').className).toContain('bg-black');
    unmount();
  });
});
