// @vitest-environment jsdom
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

import { useHistoryStore, EMPTY_BLOCKS, HISTORY_STORAGE_KEY, HISTORY_MAX_BLOCKS_PER_TAB, HISTORY_MAX_OUTPUT_CHARS, flushHistoryPersistence, clearPersistedHistory, readPersistedHistory } from '../src/stores/historyStore';
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

/**
 * Persistence across a relaunch (Gary, 2026-11-09 — history must
 * survive a relaunch, not reset to 0 commands). A fresh module import
 * is a fresh launch: the store rehydrates from localStorage.
 */
describe('history persistence across relaunch', () => {
  beforeEach(() => {
    localStorage.clear();
    clearPersistedHistory();
    useHistoryStore.setState({ blocksByTab: {} });
    // The reset above schedules a debounced persist of {} — flush
    // now so no stray timer writes over the test's own data later.
    flushHistoryPersistence();
  });

  test('setBlocks persists and rehydrates as restored + complete on a fresh import', async () => {
    const api = useHistoryStore.getState();
    api.setBlocks('terminal-1', [block('b1', 'ls'), block('b2', 'pwd')]);
    flushHistoryPersistence();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).not.toBeNull();

    // A fresh import = a new launch.
    vi.resetModules();
    const fresh = await import('../src/stores/historyStore');
    const blocks = fresh.useHistoryStore.getState().blocksByTab['terminal-1'];
    expect(blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
    // Restored: a record for the History panel, never the live feed.
    expect(blocks.every((b) => b.restored === true)).toBe(true);
    // Complete: the run ended when the app closed.
    expect(blocks.every((b) => b.isComplete === true)).toBe(true);
  });

  test('clearBlocks persists the cleared state', () => {
    const api = useHistoryStore.getState();
    api.setBlocks('terminal-1', [block('b1', 'ls')]);
    api.setBlocks('terminal-2', [block('b2', 'pwd')]);
    api.clearBlocks('terminal-1');
    flushHistoryPersistence();
    const persisted = readPersistedHistory();
    expect(persisted['terminal-1']).toBeUndefined();
    expect(persisted['terminal-2']).toHaveLength(1);
  });

  test('corrupt storage rehydrates empty, never throws', async () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, 'this is not json{');
    vi.resetModules();
    const fresh = await import('../src/stores/historyStore');
    expect(fresh.useHistoryStore.getState().blocksByTab).toEqual({});
    // And the reader itself is safe to call directly.
    expect(readPersistedHistory()).toEqual({});
  });

  test('wrong-shaped storage rehydrates empty', async () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ 'terminal-1': 'nope' }));
    vi.resetModules();
    const fresh = await import('../src/stores/historyStore');
    expect(fresh.useHistoryStore.getState().blocksByTab).toEqual({});
  });

  test('caps: at most 100 blocks per tab, newest kept; output trimmed', () => {
    const api = useHistoryStore.getState();
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...block(`b${i}`, `cmd-${i}`),
      output: 'x'.repeat(5000),
    }));
    api.setBlocks('terminal-1', many);
    flushHistoryPersistence();
    const persisted = readPersistedHistory()['terminal-1'];
    expect(persisted).toHaveLength(HISTORY_MAX_BLOCKS_PER_TAB);
    // Newest 100 kept (b50..b149).
    expect(persisted[0].id).toBe('b50');
    expect(persisted[99].id).toBe('b149');
    expect(persisted.every((b) => b.output.length <= HISTORY_MAX_OUTPUT_CHARS)).toBe(true);
  });
});
