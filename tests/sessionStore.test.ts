// Terminal sessions — segregation + stacking (heavy terminal
// work, 2026-11-13). Agent sessions are owned here; terminal
// sessions are a view over terminalStore.tabs.
import { describe, test, expect, beforeEach } from 'vitest';
import {
  useSessionStore,
  selectSessions,
  selectActiveSession,
  getFeedBlocksForSession,
  selectAgentPromptHistory,
  NEW_AGENT_SESSION_TITLE,
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

beforeEach(() => {
  useSessionStore.getState().resetForTests();
  useTerminalStore.setState({ tabs: [TAB_1, TAB_2], activeTabId: 'terminal-1' });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
});

describe('createAgentSession', () => {
  test('creates an agent session and switches to it', () => {
    const id = useSessionStore.getState().createAgentSession({ cwd: '/Users/gary' });
    expect(id).toBe('agent-1');
    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe('agent-1');
    expect(state.agentSessions).toHaveLength(1);
    expect(state.agentSessions[0].kind).toBe('agent');
    expect(state.agentSessions[0].title).toBe(NEW_AGENT_SESSION_TITLE);
    expect(state.agentSessions[0].cwd).toBe('/Users/gary');
  });

  test('numbers reuse the lowest free number after a close', () => {
    const a = useSessionStore.getState().createAgentSession();
    useSessionStore.getState().createAgentSession();
    useSessionStore.getState().closeAgentSession(a!);
    expect(useSessionStore.getState().createAgentSession()).toBe('agent-1');
  });

  test('a first prompt submits immediately and titles the session', () => {
    const id = useSessionStore.getState().createAgentSession({ firstPrompt: 'why is the build failing?' });
    const session = useSessionStore.getState().agentSessions.find((s) => s.id === id);
    expect(session?.title).toBe('why is the build failing?');
    const blocks = useSessionStore.getState().agentBlocksBySession[id!];
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('agent-prompt');
    expect(blocks[1].kind).toBe('notice');
    expect(blocks[1].output).toBe(AGENT_NOT_BUILT_NOTICE);
  });

  test('refuses while a guest session is veiled in', () => {
    useHistoryStore.getState().enterGuestSession();
    expect(useSessionStore.getState().createAgentSession()).toBeNull();
    expect(useSessionStore.getState().agentSessions).toHaveLength(0);
    useHistoryStore.getState().exitGuestSession();
  });
});

describe('submitAgentPrompt', () => {
  test('appends prompt + notice, titles from the first prompt only', () => {
    const id = useSessionStore.getState().createAgentSession()!;
    expect(useSessionStore.getState().submitAgentPrompt(id, 'first prompt here')).toBe(true);
    expect(useSessionStore.getState().submitAgentPrompt(id, 'second prompt here')).toBe(true);
    const session = useSessionStore.getState().agentSessions.find((s) => s.id === id);
    expect(session?.title).toBe('first prompt here');
    expect(useSessionStore.getState().agentBlocksBySession[id]).toHaveLength(4);
  });

  test('empty prompts and unknown sessions return false', () => {
    const id = useSessionStore.getState().createAgentSession()!;
    expect(useSessionStore.getState().submitAgentPrompt(id, '   ')).toBe(false);
    expect(useSessionStore.getState().submitAgentPrompt('agent-99', 'hi')).toBe(false);
  });
});

describe('closeAgentSession', () => {
  test('drops the session + blocks and returns to the terminal session', () => {
    const id = useSessionStore.getState().createAgentSession({ firstPrompt: 'hello' })!;
    useSessionStore.getState().closeAgentSession(id);
    const state = useSessionStore.getState();
    expect(state.agentSessions).toHaveLength(0);
    expect(state.agentBlocksBySession[id]).toBeUndefined();
    expect(state.activeSessionId).toBeNull();
  });

  test('closing a non-active session leaves the active one alone', () => {
    const a = useSessionStore.getState().createAgentSession()!;
    const b = useSessionStore.getState().createAgentSession()!;
    useSessionStore.getState().switchToAgentSession(a);
    useSessionStore.getState().closeAgentSession(b);
    expect(useSessionStore.getState().activeSessionId).toBe(a);
  });
});

describe('switching', () => {
  test('switchToTerminalSession sets the tab active and clears the agent session', () => {
    useSessionStore.getState().createAgentSession();
    useSessionStore.getState().switchToTerminalSession('terminal-2');
    expect(useTerminalStore.getState().activeTabId).toBe('terminal-2');
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });

  test('switchToAgentSession ignores unknown ids', () => {
    useSessionStore.getState().switchToAgentSession('agent-99');
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });
});

describe('selectors', () => {
  test('selectSessions lists terminal tabs first, then agent sessions', () => {
    const id = useSessionStore.getState().createAgentSession()!;
    const sessions = selectSessions(
      useTerminalStore.getState().tabs,
      useSessionStore.getState().agentSessions,
    );
    expect(sessions.map((s) => s.id)).toEqual(['terminal-1', 'terminal-2', id]);
    expect(sessions[0].kind).toBe('terminal');
    expect(sessions[2].kind).toBe('agent');
  });

  test('selectActiveSession is the active tab when no agent session is active', () => {
    const active = selectActiveSession(
      useTerminalStore.getState().tabs,
      'terminal-2',
      [],
      null,
    );
    expect(active?.id).toBe('terminal-2');
    expect(active?.kind).toBe('terminal');
  });

  test('selectActiveSession is the agent session when one is active', () => {
    const id = useSessionStore.getState().createAgentSession()!;
    const active = selectActiveSession(
      useTerminalStore.getState().tabs,
      'terminal-1',
      useSessionStore.getState().agentSessions,
      id,
    );
    expect(active?.id).toBe(id);
    expect(active?.kind).toBe('agent');
  });

  test('getFeedBlocksForSession reads the live terminal transcript, restored excluded', () => {
    useHistoryStore.setState({
      blocksByTab: {
        'terminal-1': [commandBlock('b1', 'ls'), { ...commandBlock('b2', 'old'), restored: true }],
      },
    });
    const session = selectActiveSession(
      useTerminalStore.getState().tabs,
      'terminal-1',
      [],
      null,
    );
    const blocks = getFeedBlocksForSession(
      session,
      useHistoryStore.getState().blocksByTab,
      {},
    );
    expect(blocks.map((b) => b.id)).toEqual(['b1']);
  });

  test('getFeedBlocksForSession reads the agent session blocks', () => {
    const id = useSessionStore.getState().createAgentSession({ firstPrompt: 'hello there' })!;
    const session = selectActiveSession(
      useTerminalStore.getState().tabs,
      'terminal-1',
      useSessionStore.getState().agentSessions,
      id,
    );
    const blocks = getFeedBlocksForSession(
      session,
      {},
      useSessionStore.getState().agentBlocksBySession,
    );
    expect(blocks.map((b) => b.kind)).toEqual(['agent-prompt', 'notice']);
  });

  test('selectAgentPromptHistory walks prompts most recent first', () => {
    const id = useSessionStore.getState().createAgentSession()!;
    useSessionStore.getState().submitAgentPrompt(id, 'first');
    useSessionStore.getState().submitAgentPrompt(id, 'second');
    expect(
      selectAgentPromptHistory(useSessionStore.getState().agentBlocksBySession, id),
    ).toEqual(['second', 'first']);
  });
});

describe('guest veil', () => {
  test('a guest session starting drops every agent session', () => {
    useSessionStore.getState().createAgentSession({ firstPrompt: 'hello' });
    expect(useSessionStore.getState().agentSessions).toHaveLength(1);
    useHistoryStore.getState().enterGuestSession();
    expect(useSessionStore.getState().agentSessions).toHaveLength(0);
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    useHistoryStore.getState().exitGuestSession();
  });
});
