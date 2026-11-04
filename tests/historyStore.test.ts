/**
 * Per-tab history store tests.
 *
 * The chats (Conversation History sidebar) live in the main Sidebar,
 * outside every Terminal — so the command blocks live here, keyed by
 * tab id, instead of as local state inside each Terminal. The store must
 * keep tabs isolated: writing one tab's blocks never touches another's,
 * and clearing history clears only the active tab.
 *
 * Run with: npm test
 */

import { useHistoryStore, EMPTY_BLOCKS } from '../src/stores/historyStore';
import { TerminalBlock } from '../src/types';

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

function reset() {
  useHistoryStore.setState({ blocksByTab: {} });
}

describe('useHistoryStore', () => {
  beforeEach(reset);

  test('starts empty', () => {
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
  });

  test('setBlocks with a value stores that tab\'s blocks', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    expect(useHistoryStore.getState().blocksByTab['tab-1']).toEqual([
      block('b1', 'ls'),
    ]);
  });

  test('setBlocks with a functional updater receives the previous blocks', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    api.setBlocks('tab-1', (prev) => [...prev, block('b2', 'pwd')]);
    const blocks = useHistoryStore.getState().blocksByTab['tab-1'];
    expect(blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  test('tabs are isolated: writing one tab never touches another', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    api.setBlocks('tab-2', [block('b2', 'pwd')]);
    api.setBlocks('tab-1', (prev) => [...prev, block('b3', 'whoami')]);
    const s = useHistoryStore.getState();
    expect(s.blocksByTab['tab-1'].map((b) => b.id)).toEqual(['b1', 'b3']);
    expect(s.blocksByTab['tab-2'].map((b) => b.id)).toEqual(['b2']);
  });

  test('a functional updater on a tab with no blocks starts from empty', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-9', (prev) => {
      expect(prev).toBe(EMPTY_BLOCKS);
      return [block('b1', 'ls')];
    });
    expect(useHistoryStore.getState().blocksByTab['tab-9']).toHaveLength(1);
  });

  test('clearBlocks clears only that tab', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    api.setBlocks('tab-2', [block('b2', 'pwd')]);
    api.clearBlocks('tab-1');
    const s = useHistoryStore.getState();
    expect(s.blocksByTab['tab-1']).toEqual([]);
    expect(s.blocksByTab['tab-2']).toHaveLength(1);
  });

  test('removeTab drops only that tab\'s blocks', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    api.setBlocks('tab-2', [block('b2', 'pwd')]);
    api.removeTab('tab-1');
    const s = useHistoryStore.getState();
    expect(s.blocksByTab['tab-1']).toBeUndefined();
    expect(s.blocksByTab['tab-2']).toHaveLength(1);
  });

  test('removeTab on an unknown tab is a no-op', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('tab-1', [block('b1', 'ls')]);
    api.removeTab('tab-404');
    expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(1);
  });
});
