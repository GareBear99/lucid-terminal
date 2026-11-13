// @vitest-environment jsdom
/**
 * Tab switching — the tab strip shows terminal tabs only
 * (heavy terminal work, 2026-11-13; REBUILT 2026-11-13
 * ~08:21 PST per Gary — Warp's in-tab agent flow).
 *
 * Covered here: clicking a terminal tab selects it and does
 * NOTHING else (no agent session, no agent row — there are
 * no agent rows), ⌘1–⌘9 switch terminal tabs only, and
 * switching tabs preserves each tab's mode (a tab flipped to
 * Agent stays Agent when you come back).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSessionStore, getTabMode } from '../src/stores/sessionStore';

const TABS = [
  { id: 'terminal-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: false },
  { id: 'terminal-2', title: 'Terminal 2', cwd: '/Users/gary/lucid-terminal', isActive: false },
  { id: 'terminal-3', title: 'Terminal 3', cwd: '/Users/gary/lucid-terminal', isActive: false },
];

function setUp() {
  useTerminalStore.setState({ tabs: TABS, activeTabId: 'terminal-1' });
  useSessionStore.getState().resetForTests();
}

beforeEach(setUp);

afterEach(() => {
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  useSessionStore.getState().resetForTests();
});

describe('TerminalTabs', () => {
  test('renders the terminal tabs, and nothing else', () => {
    render(<TerminalTabs />);
    for (const tab of TABS) {
      expect(screen.getByText(tab.title)).toBeTruthy();
    }
    expect(screen.getByText('Terminal 1')).toBeTruthy();
    // No agent rows, no stack numbers, no Sparkles rows.
    expect(document.querySelectorAll('[data-testid^="session-tab-"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="agent-"]')).toHaveLength(0);
    expect(screen.queryByText(/new agent conversation/i)).toBeNull();
  });

  test('clicking a tab selects it and does not touch any tab’s mode', () => {
    useSessionStore.getState().setTabMode('terminal-2', 'agent');
    render(<TerminalTabs />);
    fireEvent.click(screen.getByText('Terminal 2'));
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
  });

  test('⌘1–⌘9 switch terminal tabs only', () => {
    render(<TerminalTabs />);
    fireEvent.keyDown(document, { key: '2', metaKey: true });
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
    fireEvent.keyDown(document, { key: '3', metaKey: true });
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-3');
    fireEvent.keyDown(document, { key: '1', metaKey: true });
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-1');
  });

  test('switching tabs preserves each tab’s mode', () => {
    useSessionStore.getState().setTabMode('terminal-2', 'agent');
    render(<TerminalTabs />);
    fireEvent.click(screen.getByText('Terminal 2'));
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('agent');
    fireEvent.click(screen.getByText('Terminal 1'));
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-2')).toBe('agent');
    expect(getTabMode(useSessionStore.getState().tabMode, 'terminal-1')).toBe('terminal');
  });
});
