// @vitest-environment jsdom
/**
 * Unified feed tests (heavy terminal work, 2026-11-13 — Warp is
 * one ordered list of blocks; Lucid had two surfaces taking
 * turns; REBUILT 2026-11-13 ~08:21 PST per Gary — Warp's
 * in-tab agent flow).
 *
 * The UnifiedFeed renders ONE list for the tab through the same
 * BlockList: terminal blocks and agent blocks interleaved, in
 * the order they happened — one memory per tab. A terminal
 * block carries its exit code and git state in the header when
 * captured — never faked. Agent prompts and notices render in
 * the same feed; there is no intro card and no separate agent
 * view.
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

function renderFeed(fill = true) {
  const { container } = render(
    React.createElement(UnifiedFeed, { tabId: TAB_ID, onReinput: noop, fill }),
  );
  return container.innerHTML;
}

beforeEach(() => {
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useSessionStore.getState().resetForTests();
});

afterEach(() => {
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useSessionStore.getState().resetForTests();
});

describe('UnifiedFeed — one feed, one memory', () => {
  it('renders the tab’s live blocks, command + output', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [
          commandBlock({ id: 'b1', command: 'npm test', output: 'all green' }),
          commandBlock({ id: 'b2', command: 'ls', output: 'a\nb' }),
        ],
      },
    });
    const html = renderFeed();
    expect(html).toContain('npm test');
    expect(html).toContain('all green');
    expect(html).toContain('ls');
    expect(html).toContain('data-testid="terminal-blocks"');
  });

  it('interleaves terminal blocks and agent blocks in the order they happened', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [
          commandBlock({ id: 'b1', command: 'ls', output: 'a\nb' }),
          commandBlock({ id: 'p1', kind: 'agent-prompt', command: 'fix the build', output: '' }),
          commandBlock({ id: 'n1', kind: 'notice', command: '', output: AGENT_NOT_BUILT_NOTICE }),
          commandBlock({ id: 'b2', command: 'npm test', output: 'all green' }),
        ],
      },
    });
    const html = renderFeed();
    expect(html).toContain('ls');
    expect(html).toContain('fix the build');
    expect(html).toContain('AGENT');
    expect(html).toContain(AGENT_NOT_BUILT_NOTICE);
    expect(html).toContain('npm test');
    // In order: the terminal block before the agent prompt, the
    // prompt before the notice, the notice before the next
    // terminal block — one ordered list, not two views.
    expect(html.indexOf('ls')).toBeLessThan(html.indexOf('fix the build'));
    expect(html.indexOf('fix the build')).toBeLessThan(html.indexOf(AGENT_NOT_BUILT_NOTICE));
    expect(html.indexOf(AGENT_NOT_BUILT_NOTICE)).toBeLessThan(html.indexOf('npm test'));
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
    const html = renderFeed();
    expect(html).not.toContain('old command');
    expect(html).toContain('live command');
  });

  it('renders the empty fill container with no blocks — no intro card, no blocks', () => {
    const html = renderFeed();
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
    const html = renderFeed();
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
    const html = renderFeed();
    expect(html).toContain('exit 0');
    expect(html).not.toContain('text-red-400');
  });

  it('shows no exit code chip when nothing was captured — never faked', () => {
    useHistoryStore.setState({
      blocksByTab: { [TAB_ID]: [commandBlock({ id: 'b1', command: 'make' })] },
    });
    const html = renderFeed();
    expect(html).not.toContain('block-exit-code');
  });

  it('shows the git state chip when stamped — branch + ahead + counts', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [commandBlock({ id: 'b1', command: 'git status', gitState: GIT })],
      },
    });
    const html = renderFeed();
    expect(html).toContain('data-testid="block-git-state"');
    expect(html).toContain('main ↑1');
    expect(html).toContain('3 • +12 -4');
  });

  it('shows no git chip when the submit-time lookup found no repo', () => {
    useHistoryStore.setState({
      blocksByTab: { [TAB_ID]: [commandBlock({ id: 'b1', command: 'ls' })] },
    });
    const html = renderFeed();
    expect(html).not.toContain('block-git-state');
  });

  it('a prompt submitted through the store lands in the feed — one memory', () => {
    useHistoryStore.setState({
      blocksByTab: {
        [TAB_ID]: [commandBlock({ id: 'b1', command: 'ls' })],
      },
    });
    useSessionStore.getState().submitAgentPrompt(TAB_ID, 'fix the build', '/tmp');
    const html = renderFeed();
    expect(html).toContain('ls');
    expect(html).toContain('fix the build');
    expect(html).toContain(AGENT_NOT_BUILT_NOTICE);
    expect(html.indexOf('ls')).toBeLessThan(html.indexOf('fix the build'));
  });
});
