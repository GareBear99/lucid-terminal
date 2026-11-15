// @vitest-environment jsdom
/**
 * Feed bookmark (sweep item 7) — bookmark first, share blocked.
 *
 * A per-block star in the feed actions, persisted with the
 * block per tab/profile (the same persistence as isCollapsed);
 * a filled star in the block header marks it even while
 * collapsed. The History panel shows the star on bookmarked
 * rows and filters to bookmarked only.
 *
 * Share is NOT built here — it needs Gary's backend/export
 * decision; building it as a local-only fake is forbidden.
 *
 * Run with: npx vitest run tests/blockBookmark.test.tsx
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import { ConversationHistory } from '../src/components/Sidebar/ConversationHistory';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string, bookmarked = false): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    isBookmarked: bookmarked,
  };
}

describe('feed bookmark — sweep item 7', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  test('the star toggles the bookmark; the header star marks it', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('a', 'ls'), block('b', 'pwd')] },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(screen.queryByTestId('block-bookmarked')).toBeNull();

    fireEvent.click(screen.getAllByTestId('block-bookmark')[0]);
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isBookmarked).toBe(true);
    expect(screen.getAllByTestId('block-bookmarked')).toHaveLength(1);
    expect(screen.getAllByTestId('block-bookmark')[0].getAttribute('aria-label')).toBe(
      'Remove bookmark',
    );
    expect(screen.getAllByTestId('block-bookmark')[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getAllByTestId('block-bookmark')[0]);
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isBookmarked).toBe(false);
    expect(screen.queryByTestId('block-bookmarked')).toBeNull();
  });

  test('a bookmarked block keeps its header star while collapsed', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('a', 'ls', true)] },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-collapse'));
    // The output and actions hide, but the header star stays.
    expect(screen.queryByTestId('block-output')).toBeNull();
    expect(screen.getByTestId('block-bookmarked')).not.toBeNull();
  });

  test('toggleBlockBookmarked is a no-op for an unknown block', () => {
    useHistoryStore.setState({ blocksByTab: { 'tab-1': [block('a', 'ls')] } });
    useHistoryStore.getState().toggleBlockBookmarked('tab-1', 'missing');
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isBookmarked).toBe(false);
  });
});

describe('History panel bookmark filter — sweep item 7', () => {
  const blocks = [block('a', 'ls', true), block('b', 'pwd', false)];

  test('bookmarked rows carry a star; the filter narrows to them', () => {
    render(<ConversationHistory blocks={blocks} onJumpToBlock={() => {}} />);
    expect(screen.getByTestId('history-item-bookmarked-a')).not.toBeNull();
    expect(screen.queryByTestId('history-item-bookmarked-b')).toBeNull();
    expect(screen.getByText('ls')).not.toBeNull();
    expect(screen.getByText('pwd')).not.toBeNull();

    fireEvent.click(screen.getByTestId('history-bookmarks-only'));
    expect(screen.getByText('ls')).not.toBeNull();
    expect(screen.queryByText('pwd')).toBeNull();
    expect(screen.getByText('1 command')).not.toBeNull();

    fireEvent.click(screen.getByTestId('history-bookmarks-only'));
    expect(screen.getByText('pwd')).not.toBeNull();
    expect(screen.getByText('2 commands')).not.toBeNull();
  });

  test('the filter composes with the search', () => {
    render(<ConversationHistory blocks={blocks} onJumpToBlock={() => {}} />);
    fireEvent.click(screen.getByTestId('history-bookmarks-only'));
    fireEvent.change(screen.getByPlaceholderText('Search commands...'), {
      target: { value: 'pwd' },
    });
    // pwd is not bookmarked, so the bookmarked-only + search pair is empty.
    expect(screen.getByText('No matching commands')).not.toBeNull();
  });

  test('filter on with nothing bookmarked reads the bookmarked empty state', () => {
    render(
      <ConversationHistory blocks={[block('b', 'pwd', false)]} onJumpToBlock={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('history-bookmarks-only'));
    expect(screen.getByText('No bookmarked commands yet')).not.toBeNull();
    expect(screen.getByText('Star a block in the feed to find it here')).not.toBeNull();
  });
});
