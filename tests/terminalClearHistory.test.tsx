// @vitest-environment jsdom
/**
 * Terminal history regression tests — rewritten for the REAL terminal
 * (Gary, 2026-11-07: "terminal is not a terminal at all").
 *
 * The old tests pinned the simulation-era dispatcher: bare
 * `clear history` cleared Lucid's conversation-history store and
 * bare `history` showed it. That behaviour is SUPERSEDED by Gary's
 * real-terminal order — bare words go to the shell, always, so
 * `history` is now zsh history and `clear history` is a shell
 * command. Lucid's conversation history is reachable only as an
 * EXPLICIT slash command: `/history` shows it, `/history clear`
 * clears it (the backend conversation AND the history store the
 * History panel reads AND the visible screen — the empty screen IS
 * the confirmation, like Unix `clear`).
 *
 * Live failure behind the original test (2026-11-06, LuciferAI
 * disabled): `clear history` printed "✅ Conversation history
 * cleared" but the terminal blocks and the History panel stayed put
 * — the `case 'history'` clear branch only cleared the backend AI
 * conversation, never the history store. The slash clear still
 * clears the store, so the History panel shows 0 commands.
 *
 * This renders the real Terminal (LuciferAI disabled, so the plugin
 * probe short-circuits) with the heavy children stubbed, seeds two
 * blocks, submits commands through the xterm fallback input, and
 * asserts where each one went.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { TerminalBlock } from '../src/types';

// Heavy children the test does not care about — stub them so the render
// stays light (SentinelFace runs a rAF gaze loop; FixNetStatus fetches
// stats on mount).
vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));
vi.mock('../src/components/FixNet/FixNetStatus', () => ({
  FixNetStatus: () => null,
}));

function block(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let clearHistoryMock: ReturnType<typeof vi.fn>;
let getHistoryMock: ReturnType<typeof vi.fn>;
let writeMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })),
      configurable: true,
    });
  }
  clearHistoryMock = vi.fn().mockResolvedValue(undefined);
  getHistoryMock = vi.fn().mockResolvedValue([{ command: 'pwd' }]);
  writeMock = vi.fn();
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
    },
    lucid: {
      clearHistory: clearHistoryMock,
      getHistory: getHistoryMock,
    },
  };
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
});

/** Type a command into the fallback input line and press Enter. */
function submitCommand(command: string) {
  const input = screen.getByTestId('xterm-fallback-input');
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Everything written to the PTY so far, in order. */
function ptyWritten(): string {
  return writeMock.mock.calls.map((c) => String(c[1])).join('');
}

function disableLuciferAi() {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
  return base;
}

function restoreLuciferAi(base: ReturnType<typeof useSettingsStore.getState>['settings']) {
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: true } });
}

describe('Terminal history — real terminal', () => {
  test('/history clear empties the history store and the visible screen', async () => {
    const base = disableLuciferAi();
    try {
      const api = useHistoryStore.getState();
      api.setBlocks('tab-1', [block('b1', 'llm list'), block('b2', 'pwd')]);
      expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(2);

      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('xterm-surface');

      submitCommand('/history clear');

      await waitFor(() => {
        expect(useHistoryStore.getState().blocksByTab['tab-1'] ?? []).toEqual([]);
      });
      // The backend AI conversation was still cleared too.
      expect(clearHistoryMock).toHaveBeenCalledTimes(1);
      // The line was wiped from the shell, never executed by it.
      expect(ptyWritten()).toContain('\x15\r');
      expect(ptyWritten()).not.toContain('history clear\r');
      // The screen is empty — that IS the confirmation.
      expect(screen.getByTestId('xterm-fallback-output').textContent).toBe('');
    } finally {
      restoreLuciferAi(base);
    }
  });

  test('/history (slash) shows the Lucid conversation history', async () => {
    const base = disableLuciferAi();
    try {
      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('xterm-surface');
      submitCommand('/history');

      await waitFor(() => {
        expect(getHistoryMock).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('xterm-fallback-output').textContent).toContain('pwd');
      });
      expect(clearHistoryMock).not.toHaveBeenCalled();
      expect(ptyWritten()).not.toContain('history\r');
    } finally {
      restoreLuciferAi(base);
    }
  });

  test('bare history goes to the shell — it is zsh history now, not Lucid history', async () => {
    const base = disableLuciferAi();
    try {
      const api = useHistoryStore.getState();
      api.setBlocks('tab-1', [block('b1', 'llm list'), block('b2', 'pwd')]);

      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('xterm-surface');
      submitCommand('history');

      await waitFor(() => {
        expect(ptyWritten()).toContain('history\r');
      });
      expect(getHistoryMock).not.toHaveBeenCalled();
      expect(clearHistoryMock).not.toHaveBeenCalled();
      // The store is untouched — the shell owns history now.
      expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(2);
    } finally {
      restoreLuciferAi(base);
    }
  });

  test('bare clear history goes to the shell and clears nothing', async () => {
    const base = disableLuciferAi();
    try {
      const api = useHistoryStore.getState();
      api.setBlocks('tab-1', [block('b1', 'llm list'), block('b2', 'pwd')]);

      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('xterm-surface');
      submitCommand('clear history');

      await waitFor(() => {
        expect(ptyWritten()).toContain('clear history\r');
      });
      expect(clearHistoryMock).not.toHaveBeenCalled();
      expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(2);
    } finally {
      restoreLuciferAi(base);
    }
  });
});
