// @vitest-environment jsdom
/**
 * BlockList never renders restored blocks (Gary, 2026-11-09 — command
 * history must survive a relaunch, as a RECORD).
 *
 * Restored blocks are last session's commands. The feed is the live
 * session's transcript: showing them would present commands this
 * shell never ran as if they ran now. They still show in the History
 * panel (the record) — only the feed filters them out. A tab with
 * ONLY restored blocks renders an empty feed, exactly like a tab
 * with no blocks at all.
 *
 * Run with: npx vitest run tests/blockListRestored.test.tsx
 */
import { render, screen } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string, restored = false): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    restored: restored || undefined,
  };
}

describe('BlockList with restored blocks', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  test('renders live blocks, never restored ones', () => {
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [block('old', 'ls', true), block('live', 'pwd')],
      },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} />);
    expect(screen.getByText('pwd')).not.toBeNull();
    expect(screen.queryByText('ls')).toBeNull();
    expect(screen.queryByText('out-ls')).toBeNull();
  });

  test('a tab with only restored blocks renders an empty feed (devmode: null)', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('old', 'ls', true)] },
    });
    const { container } = render(<BlockList tabId="tab-1" onReinput={() => {}} />);
    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
