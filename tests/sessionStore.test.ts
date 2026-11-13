// Tab mode — the mode pill (heavy terminal work, 2026-11-13;
// REBUILT 2026-11-13 ~08:21 PST per Gary — Warp's in-tab
// agent flow). ONE session per tab: the pill flips ONLY the
// tab's mode, and agent prompts are ordinary blocks in the
// tab's own feed (one memory per tab).
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  useSessionStore,
  getTabMode,
  selectAgentPromptHistory,
  AGENT_NOT_BUILT_NOTICE,
} from '../src/stores/sessionStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

const TAB_1 = { id: 'terminal-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: true };
const TAB_2 = { id: 'terminal-2', title: 'Terminal 2', cwd: '/Users/gary/lucid-terminal', isActive: false };

function commandBlock(id: string, command: string): TerminalBlock {
  return { id, command, output: 'out', timestamp: 1, isComplete: true };
}

function resetAll() {
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useTerminalStore.setState({ tabs: [TAB_1, TAB_2], activeTabId: 'terminal-1' });
  useSessionStore.getState().resetForTests();
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  resetAll();
});

describe('tab mode', () => {
  test('defaults to terminal, sets agent, toggles back', () => {
    const state = useSessionStore.getState();
    expect(getTabMode(state.tabMode, 'terminal-1')).toBe('terminal');
    expect(state.setTabMode('terminal-1', 'agent')).toBe('agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('agent');
    expect(useSessionStore.getState().toggleTabMode('terminal-1')).toBe('terminal');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
  });

  test('mode is per-tab: flipping one tab leaves the other terminal', () => {
    useSessionStore.getState().setTabMode('terminal-1', 'agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('terminal');
  });

  test('a closed tab’s mode dies with it — a fresh tab reusing the id starts terminal', () => {
    useSessionStore.getState().setTabMode('terminal-2', 'agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('agent');
    // Closing the tab (terminalStore drops the tab) prunes the mode.
    useTerminalStore.setState({ tabs: [TAB_1], activeTabId: 'terminal-1' });
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('terminal');
    // A fresh tab reusing the id starts terminal.
    useTerminalStore.setState({ tabs: [TAB_1, TAB_2], activeTabId: 'terminal-2' });
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('terminal');
  });

  test('refuses agent mode while a guest session is veiled in', () => {
    useHistoryStore.getState().enterGuestSession();
    expect(useSessionStore.getState().setTabMode('terminal-1', 'agent')).toBeNull();
    expect(useSessionStore.getState().toggleTabMode('terminal-1')).toBeNull();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
    useHistoryStore.getState().exitGuestSession();
  });
});

describe('submitAgentPrompt', () => {
  test('appends prompt + notice to the tab’s own feed — one memory, no separate store', () => {
    useHistoryStore.setState({
      blocksByTab: { 'terminal-1': [commandBlock('b1', 'ls')] },
    });
    expect(useSessionStore.getState().submitAgentPrompt('terminal-1', 'fix the build', '/Users/gary')).toBe(true);
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'];
    expect(blocks.map((b) => b.command)).toEqual(['ls', 'fix the build', '']);
    expect(blocks[1].kind).toBe('agent-prompt');
    expect(blocks[1].cwd).toBe('/Users/gary');
    expect(blocks[2].kind).toBe('notice');
    expect(blocks[2].output).toBe(AGENT_NOT_BUILT_NOTICE);
  });

  test('a second prompt appends after the first — one conversation, in order', () => {
    useSessionStore.getState().submitAgentPrompt('terminal-1', 'first prompt here');
    useSessionStore.getState().submitAgentPrompt('terminal-1', 'second prompt here');
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'];
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((b) => b.kind === 'agent-prompt').map((b) => b.command)).toEqual([
      'first prompt here',
      'second prompt here',
    ]);
  });

  test('empty prompts return false and append nothing', () => {
    expect(useSessionStore.getState().submitAgentPrompt('terminal-1', '   ')).toBe(false);
    expect(useHistoryStore.getState().blocksByTab['terminal-1'] ?? []).toHaveLength(0);
  });

  test('refuses while a guest session is veiled in', () => {
    useHistoryStore.getState().enterGuestSession();
    expect(useSessionStore.getState().submitAgentPrompt('terminal-1', 'hello')).toBe(false);
    expect(useHistoryStore.getState().blocksByTab['terminal-1'] ?? []).toHaveLength(0);
    useHistoryStore.getState().exitGuestSession();
  });
});

describe('selectAgentPromptHistory', () => {
  test('walks the tab’s agent prompts most recent first, ignoring terminal blocks and notices', () => {
    useSessionStore.getState().submitAgentPrompt('terminal-1', 'first');
    useHistoryStore.setState({
      blocksByTab: {
        'terminal-1': [
          ...(useHistoryStore.getState().blocksByTab['terminal-1'] ?? []),
          commandBlock('b9', 'ls'),
        ],
      },
    });
    useSessionStore.getState().submitAgentPrompt('terminal-1', 'second');
    expect(
      selectAgentPromptHistory(useHistoryStore.getState().blocksByTab, 'terminal-1'),
    ).toEqual(['second', 'first']);
  });

  test('empty for a tab with no agent prompts', () => {
    useHistoryStore.setState({ blocksByTab: { 'terminal-1': [commandBlock('b1', 'ls')] } });
    expect(selectAgentPromptHistory(useHistoryStore.getState().blocksByTab, 'terminal-1')).toEqual([]);
  });
});

describe('guest veil', () => {
  test('entering a guest session resets agent mode to terminal; exiting restores it exactly', () => {
    useSessionStore.getState().setTabMode('terminal-1', 'agent');
    useSessionStore.getState().setTabMode('terminal-2', 'terminal');
    useHistoryStore.getState().enterGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
    useHistoryStore.getState().exitGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('terminal');
  });

  test('a mode for a tab closed during the guest session is not restored', () => {
    useSessionStore.getState().setTabMode('terminal-2', 'agent');
    useHistoryStore.getState().enterGuestSession();
    useTerminalStore.setState({ tabs: [TAB_1], activeTabId: 'terminal-1' });
    useHistoryStore.getState().exitGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('terminal');
  });

  test('a fresh guest replacing the old one keeps the owner’s modes stashed', () => {
    useSessionStore.getState().setTabMode('terminal-1', 'agent');
    useHistoryStore.getState().enterGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
    useHistoryStore.getState().resetGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
    useHistoryStore.getState().exitGuestSession();
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('agent');
  });
});
