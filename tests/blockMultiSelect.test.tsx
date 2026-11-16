// @vitest-environment jsdom
/**
 * Multi-select (2026-11-15): click / shift-click / Ctrl-click
 * a feed block to select it, and the bulk-action row (copy-all /
 * re-run-all / clear) that appears while the selection is
 * non-empty.
 *
 * The selection lives in historyStore and is EPHEMERAL — never
 * persisted (serializeHistory writes blocksByTab only). Re-run-all
 * re-runs only the shell commands (kind 'command'), in feed order,
 * one at a time through the caller's onRerun; agent/notice/
 * scrollback blocks are skipped.
 *
 * Run with: npx vitest run tests/blockMultiSelect.test.tsx
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string, kind?: TerminalBlock['kind']): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    ...(kind ? { kind } : {}),
  };
}

function seed(ids: string[]) {
  useHistoryStore.setState({
    blocksByTab: { 'tab-1': ids.map((id) => block(id, `cmd-${id}`)) },
    selectedBlockIdsByTab: {},
    selectionAnchorByTab: {},
  });
}

function articles() {
  return screen.getAllByTestId('terminal-block');
}

beforeEach(() => {
  useHistoryStore.setState({
    blocksByTab: {},
    selectedBlockIdsByTab: {},
    selectionAnchorByTab: {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('multi-select — the store', () => {
  test('plain click (selectBlockOnly) selects just that block and sets the anchor', () => {
    seed(['a', 'b', 'c']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'b');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['b']);
    expect(useHistoryStore.getState().selectionAnchorByTab['tab-1']).toBe('b');
    s.selectBlockOnly('tab-1', 'a');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['a']);
  });

  test('Ctrl-click (toggleBlockSelected) adds and removes one block, and moves the anchor', () => {
    seed(['a', 'b', 'c']);
    const s = useHistoryStore.getState();
    s.toggleBlockSelected('tab-1', 'a');
    s.toggleBlockSelected('tab-1', 'c');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['a', 'c']);
    s.toggleBlockSelected('tab-1', 'a');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['c']);
    expect(useHistoryStore.getState().selectionAnchorByTab['tab-1']).toBe('a');
  });

  test('shift-click (selectBlockRange) selects the range from the anchor, in feed order', () => {
    seed(['a', 'b', 'c', 'd']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'b');
    s.selectBlockRange('tab-1', 'd');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['b', 'c', 'd']);
    // A second shift-click extends from the SAME anchor (the
    // anchor does not move on a shift-click).
    s.selectBlockRange('tab-1', 'a');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['a', 'b']);
  });

  test('shift-click with no anchor selects just the clicked block', () => {
    seed(['a', 'b', 'c']);
    useHistoryStore.getState().selectBlockRange('tab-1', 'b');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['b']);
  });

  test('select actions are no-ops for an unknown block', () => {
    seed(['a']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'nope');
    s.toggleBlockSelected('tab-1', 'nope');
    s.selectBlockRange('tab-1', 'nope');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1'] ?? []).toEqual([]);
  });

  test('setBlocks prunes the selection to the blocks that still exist', () => {
    seed(['a', 'b', 'c']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'a');
    s.toggleBlockSelected('tab-1', 'c');
    s.setBlocks('tab-1', (prev) => prev.filter((b) => b.id !== 'a'));
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual(['c']);
  });

  test('clearBlocks and removeTab drop the selection', () => {
    seed(['a', 'b']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'a');
    s.clearBlocks('tab-1');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual([]);
    seed(['a', 'b']);
    s.selectBlockOnly('tab-1', 'a');
    s.removeTab('tab-1');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toBeUndefined();
  });

  test('clearBlockSelection empties the selection and the anchor', () => {
    seed(['a', 'b']);
    const s = useHistoryStore.getState();
    s.selectBlockOnly('tab-1', 'a');
    s.clearBlockSelection('tab-1');
    expect(useHistoryStore.getState().selectedBlockIdsByTab['tab-1']).toEqual([]);
    expect(useHistoryStore.getState().selectionAnchorByTab['tab-1']).toBeNull();
  });
});

describe('multi-select — the feed', () => {
  test('plain click selects one block and shows the bulk row with the count', () => {
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(screen.queryByTestId('block-bulk-actions')).toBeNull();
    fireEvent.click(articles()[1]);
    expect(articles()[1].getAttribute('data-block-selected')).toBe('true');
    expect(articles()[0].getAttribute('data-block-selected')).toBe('false');
    expect(screen.getByTestId('block-bulk-actions')).toBeTruthy();
    expect(screen.getByTestId('block-bulk-count').textContent).toBe('1 selected');
  });

  test('Ctrl-click toggles blocks into the selection; a second Ctrl-click removes one', () => {
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(articles()[0], { ctrlKey: true });
    fireEvent.click(articles()[2], { ctrlKey: true });
    expect(screen.getByTestId('block-bulk-count').textContent).toBe('2 selected');
    expect(articles()[0].getAttribute('data-block-selected')).toBe('true');
    expect(articles()[2].getAttribute('data-block-selected')).toBe('true');
    fireEvent.click(articles()[0], { ctrlKey: true });
    expect(screen.getByTestId('block-bulk-count').textContent).toBe('1 selected');
    expect(articles()[0].getAttribute('data-block-selected')).toBe('false');
  });

  test('shift-click selects the range from the last clicked block', () => {
    seed(['a', 'b', 'c', 'd']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(articles()[1]);
    fireEvent.click(articles()[3], { shiftKey: true });
    expect(screen.getByTestId('block-bulk-count').textContent).toBe('3 selected');
    expect(articles()[1].getAttribute('data-block-selected')).toBe('true');
    expect(articles()[2].getAttribute('data-block-selected')).toBe('true');
    expect(articles()[3].getAttribute('data-block-selected')).toBe('true');
    expect(articles()[0].getAttribute('data-block-selected')).toBe('false');
  });

  test('Copy all copies the selected commands, one per line, in feed order', async () => {
    let copied = '';
    const writeText = vi.fn(async (t: string) => {
      copied = t;
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(articles()[0]);
    fireEvent.click(articles()[2], { ctrlKey: true });
    fireEvent.click(screen.getByTestId('block-bulk-copy-all'));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(copied).toBe('cmd-a\ncmd-c');
  });

  test('Re-run all calls onRerun with the selected shell commands in feed order, then clears', () => {
    const onRerun = vi.fn();
    seed(['a', 'b', 'c']);
    // 'b' is an agent prompt — selectable for copy, but not
    // a re-runnable shell command, so re-run-all skips it.
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [block('a', 'cmd-a'), block('b', 'prompt-b', 'agent-prompt'), block('c', 'cmd-c')],
      },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} onRerun={onRerun} fill />);
    fireEvent.click(articles()[0]);
    fireEvent.click(articles()[1], { ctrlKey: true });
    fireEvent.click(articles()[2], { ctrlKey: true });
    expect(screen.getByTestId('block-bulk-rerun-all').textContent).toContain('(2)');
    fireEvent.click(screen.getByTestId('block-bulk-rerun-all'));
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(onRerun).toHaveBeenCalledWith(['cmd-a', 'cmd-c']);
    // The selection is cleared after the re-run.
    expect(screen.queryByTestId('block-bulk-actions')).toBeNull();
  });

  test('Re-run all does not render without onRerun (agent mode)', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(articles()[0]);
    expect(screen.getByTestId('block-bulk-actions')).toBeTruthy();
    expect(screen.queryByTestId('block-bulk-rerun-all')).toBeNull();
  });

  test('Clear drops the selection and the bulk row', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(articles()[0]);
    expect(screen.getByTestId('block-bulk-actions')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-bulk-clear'));
    expect(screen.queryByTestId('block-bulk-actions')).toBeNull();
    expect(articles()[0].getAttribute('data-block-selected')).toBe('false');
  });
});
