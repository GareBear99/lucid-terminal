// @vitest-environment jsdom
/**
 * Unified feed tests (heavy terminal work, 2026-11-13 — Warp is
 * one ordered list of blocks; Lucid had two surfaces taking
 * turns).
 *
 * The UnifiedFeed renders one list per session through the same
 * BlockList: terminal sessions read the live terminal transcript
 * (historyStore, restored blocks excluded), agent sessions read
 * their own blocks. A terminal block carries its exit code and
 * git state in the header when captured — never faked. An agent
 * session with no blocks shows the intro card, not an empty list.
 *
 * jsdom + @testing-library/react: the feed reads zustand stores,
 * and under renderToStaticMarkup zustand returns the store's
 * initial state (the server snapshot), so set-up state would
 * never render. The pure-presentational siblings (PillRow,
 * HintLine) stay SSR in their own files.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { UnifiedFeed } from '../src/components/Terminal/UnifiedFeed';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSessionStore, AGENT_NOT_BUILT_NOTICE } from '../src/stores/sessionStore';
import type { TerminalSession } from '../src/stores/sessionStore';
import type { TerminalBlock, GitStatus } from '../src/types';

const TAB_ID = 'tab-1';
const noop = () => undefined;

const GIT: GitStatus = {
  branch: 'main',
  ahead: 1,
  behind: 0,
  changedFiles: 3,
  addedLines: 12,
  deletedLines: 4,
};

function commandBlock(overrides: Partial<TerminalBlock> & { id: string }): TerminalBlock {
  return {
    command: 'ls',
    output: 'a\nb',
    timestamp: 1,
    isComplete: true,
    ...overrides,
  };
}

const TERMINAL_SESSION: TerminalSession = {
  id: TAB_ID,
  kind: 'terminal',
  title: 'Terminal 1',
  createdAt: 1,
  tabId: TAB_ID,
  cwd: '/tmp',
};

const AGENT_SESSION: TerminalSession = {
  id: 'agent-1',
  kind: 'agent',
  title: 'fix the build',
  createdAt: 1,
  cwd: '/tmp',
  attachedBlockIds: ['b1'],
};

function renderFeed(session: TerminalSession | null, fill = true) {
  const { container } = render(
    React.createElement(UnifiedFeed, { session, tabId: TAB_ID, onReinput: noop, fill }),
  );
  return container.innerHTML;
}

beforeEach(() => {
  useHistoryStore.setState({ blocksByTab: {} });
  useSessionStore.setState({ agentSessions: [], activeSessionId: null, agentBlocksBySession: {} });
});

afterEach(() => {
  useHistoryStore.setState({ blocksByTab: {} });
  useSessionStore.setState({ agentSessions: [], activeSessionId: null, agentBlocksBySession: {} });
});

describe('UnifiedFeed — terminal sessions', () => {
  it('renders the tab’s live blocks, command + output', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [
          commandBlock({ id: 'b1', command: 'npm test', output: 'all green' }),
          commandBlock({ id: 'b2', command: 'ls', output: 'a\nb' }),
        ],
      },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).toContain('npm test');
    expect(html).toContain('all green');
    expect(html).toContain('ls');
    expect(html).toContain('data-testid="terminal-blocks"');
  });

  it('excludes restored blocks — the feed is the live transcript, never last session’s record', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [
          commandBlock({ id: 'b1', command: 'old command', restored: true }),
          commandBlock({ id: 'b2', command: 'live command' }),
        ],
      },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).not.toContain('old command');
    expect(html).toContain('live command');
  });

  it('renders the empty fill container with no blocks — no intro card, no blocks', () => {
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).toContain('data-testid="terminal-blocks"');
    expect(html).not.toContain('agent-intro-card');
    expect(screen.queryByTestId('terminal-block')).toBeNull();
  });

  it('shows the exit code chip when captured — red for non-zero', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [commandBlock({ id: 'b1', command: 'make', exitCode: 1 })],
      },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).toContain('data-testid="block-exit-code"');
    expect(html).toContain('exit 1');
    expect(html).toContain('text-red-400');
  });

  it('shows exit 0 muted when the command succeeded', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [commandBlock({ id: 'b1', command: 'make', exitCode: 0 })],
      },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).toContain('exit 0');
    expect(html).not.toContain('text-red-400');
  });

  it('shows no exit code chip when nothing was captured — never faked', () => {
    useHistoryStore.setState({
      blocksByTab: { [TAB_ID]: [commandBlock({ id: 'b1', command: 'make' })] },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).not.toContain('block-exit-code');
  });

  it('shows the git state chip when stamped — branch + ahead + counts', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [commandBlock({ id: 'b1', command: 'git status', gitState: GIT })],
      },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).toContain('data-testid="block-git-state"');
    expect(html).toContain('main ↑1');
    expect(html).toContain('3 • +12 -4');
  });

  it('shows no git chip when the submit-time lookup found no repo', () => {
    useHistoryStore.setState({
      blocksByTab: { [TAB_ID]: [commandBlock({ id: 'b1', command: 'ls' })] },
    });
    const html = renderFeed(TERMINAL_SESSION);
    expect(html).not.toContain('block-git-state');
  });
});

describe('UnifiedFeed — agent sessions', () => {
  it('renders the session’s own blocks — prompt, notice, no terminal blocks', () => {
    useHistoryStore.setState({
      blocksByTab: { [TAB_ID]: [commandBlock({ id: 'b1', command: 'terminal command' })] },
    });
    useSessionStore.setState({
      agentBlocksBySession: {
        'agent-1': [
          commandBlock({ id: 'p1', kind: 'agent-prompt', command: 'fix the build', output: '' }),
          commandBlock({ id: 'n1', kind: 'notice', command: '', output: AGENT_NOT_BUILT_NOTICE }),
        ],
      },
    });
    const html = renderFeed(AGENT_SESSION);
    expect(html).toContain('fix the build');
    expect(html).toContain('AGENT');
    expect(html).toContain(AGENT_NOT_BUILT_NOTICE);
    expect(html).not.toContain('terminal command');
  });

  it('shows the intro card with no blocks — title, cwd, attached count', () => {
    const html = renderFeed(AGENT_SESSION);
    expect(html).toContain('data-testid="agent-intro-card"');
    expect(html).toContain('New agent conversation');
    expect(html).toContain('/tmp');
    expect(html).toContain('1 block attached as context');
  });

  it('the intro card omits the attached line when nothing is attached', () => {
    const html = renderFeed({ ...AGENT_SESSION, attachedBlockIds: [] });
    expect(html).toContain('data-testid="agent-intro-card"');
    expect(html).not.toContain('attached as context');
  });
});

describe('UnifiedFeed — no session', () => {
  it('renders nothing when there is no active session', () => {
    const { container } = render(
      React.createElement(UnifiedFeed, { session: null, tabId: TAB_ID, onReinput: noop, fill: true }),
    );
    expect(container.innerHTML).toBe('');
  });
});
