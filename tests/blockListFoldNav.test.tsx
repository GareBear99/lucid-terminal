// @vitest-environment jsdom
/**
 * Feed fold/collapse + keyboard block navigation (sweep items 3, 4).
 *
 * Item 3: the chevron in the block header flips the block's
 * isCollapsed in the store; the output and the per-block
 * actions hide while collapsed, the header stays.
 * Item 4: ⌘↑/⌘↓ (and Ctrl) move a focused-block highlight;
 * ⌘Home/⌘End jump to the first/last block; the header is
 * sticky within the feed's scroll container. While an Atom
 * modal is open the feed must NOT steal the arrows.
 *
 * Multi-select is NOT built here (the larger half of item 4
 * — reported as remaining); these tests cover nav only.
 *
 * Run with: npx vitest run tests/blockListFoldNav.test.tsx
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
import { useModalStore } from '../src/stores/modalStore';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
  };
}

function seed(ids: string[]) {
  useHistoryStore.setState({
    blocksByTab: { 'tab-1': ids.map((id) => block(id, `cmd-${id}`)) },
  });
}

describe('feed fold — sweep item 3', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
    useModalStore.setState({ openModal: null });
  });

  test('chevron collapses one block: output and actions hide, header stays', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const chevrons = screen.getAllByTestId('block-collapse');
    expect(chevrons).toHaveLength(2);
    expect(screen.getAllByTestId('block-output')).toHaveLength(2);

    fireEvent.click(chevrons[0]);
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isCollapsed).toBe(true);
    // Only the second block's output remains; both headers stay.
    expect(screen.getAllByTestId('block-output')).toHaveLength(1);
    expect(screen.getAllByTestId('block-output')[0].textContent).toContain('out-cmd-b');
    expect(screen.getAllByTestId('block-header')).toHaveLength(2);
    expect(screen.getAllByTestId('terminal-block')[0].textContent).toContain('cmd-a');
    // The collapsed block's actions hide with its output.
    expect(screen.getAllByTestId('block-reinput')).toHaveLength(1);
    // The chevron now offers to expand.
    expect(screen.getAllByTestId('block-collapse')[0].getAttribute('aria-label')).toBe(
      'Expand block',
    );
  });

  test('chevron toggles back: output returns on expand', () => {
    seed(['a']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const chevron = screen.getByTestId('block-collapse');
    fireEvent.click(chevron);
    expect(screen.queryByTestId('block-output')).toBeNull();
    fireEvent.click(screen.getByTestId('block-collapse'));
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isCollapsed).toBe(false);
    expect(screen.getByTestId('block-output').textContent).toContain('out-cmd-a');
  });

  test('toggleBlockCollapsed is a no-op for an unknown block', () => {
    seed(['a']);
    useHistoryStore.getState().toggleBlockCollapsed('tab-1', 'missing');
    expect(useHistoryStore.getState().blocksByTab['tab-1'][0].isCollapsed).toBeUndefined();
    useHistoryStore.getState().toggleBlockCollapsed('tab-missing', 'a');
    expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(1);
  });
});

describe('feed keyboard block navigation — sweep item 4', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
    useModalStore.setState({ openModal: null });
  });

  const focusedIds = () =>
    screen
      .getAllByTestId('terminal-block')
      .filter((el) => el.getAttribute('data-block-focused') === 'true')
      .map((el) => el.id);

  test('⌘↓ moves the highlight down from the first block; ⌘↑ moves it back', () => {
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(focusedIds()).toEqual([]);
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(focusedIds()).toEqual(['block-a']);
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(focusedIds()).toEqual(['block-b']);
    fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true });
    expect(focusedIds()).toEqual(['block-a']);
  });

  test('⌘↑ from no focus lands on the last block; ⌘↓ stops at the last', () => {
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true });
    expect(focusedIds()).toEqual(['block-c']);
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(focusedIds()).toEqual(['block-c']);
  });

  test('Ctrl+↑/↓ is the same navigation (the Ctrl equivalent)', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
    expect(focusedIds()).toEqual(['block-a']);
    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
    expect(focusedIds()).toEqual(['block-b']);
  });

  test('⌘End / ⌘Home jump to the last / first block', () => {
    seed(['a', 'b', 'c']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.keyDown(window, { key: 'End', metaKey: true });
    expect(focusedIds()).toEqual(['block-c']);
    fireEvent.keyDown(window, { key: 'Home', metaKey: true });
    expect(focusedIds()).toEqual(['block-a']);
  });

  test('plain ArrowDown does not move the highlight (it belongs to the prompt/xterm)', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(focusedIds()).toEqual([]);
  });

  test('an open Atom modal owns the arrows — the feed does not steal them', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    useModalStore.getState().open('palette');
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(focusedIds()).toEqual([]);
    useModalStore.getState().close();
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(focusedIds()).toEqual(['block-a']);
  });

  test('clicking a block focuses it; the header is sticky', () => {
    seed(['a', 'b']);
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getAllByTestId('terminal-block')[1]);
    expect(focusedIds()).toEqual(['block-b']);
    for (const header of screen.getAllByTestId('block-header')) {
      expect(header.className).toContain('sticky');
      expect(header.className).toContain('top-0');
    }
  });
});
