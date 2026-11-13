// @vitest-environment jsdom
/**
 * Terminal feed ordering — newest closest to the prompt, like Warp
 * (Gary, 2026-11-12 ~17:11 PST: "i dont like how it goes to the top
 * and doesnt order closest like warp").
 *
 * The defect: new blocks append at the END of the store array and
 * render in that order into a plain overflow-y-auto div with NO
 * scroll management anywhere — so the feed's content starts at the
 * TOP of the column (one block sits at the top, empty black below,
 * prompt far below), and once the feed overflows scrollTop stays 0
 * while new blocks land below the visible fold. The fix (BlockList):
 * the container is flex-col with the blocks wrapped in an mt-auto
 * div (short content hugs the bottom, newest right above the
 * prompt), plus sticky follow-scroll (new content pins the feed to
 * the bottom while the user is pinned there; scrolling up unpins
 * it, so reading old output is never yanked).
 *
 * Run with: npx vitest run tests/terminalFeedOrder.test.tsx
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
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

/** jsdom does no layout: scrollHeight/clientHeight are 0 unless
 *  mocked. Define them on the feed container to simulate overflow. */
function mockFeedMetrics(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

describe('terminal feed ordering — newest closest to the prompt', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  test('newest block renders last in the feed, closest to the prompt', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('old', 'ls'), block('new', 'pwd')] },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const rendered = screen.getAllByTestId('terminal-block');
    expect(rendered).toHaveLength(2);
    expect(rendered[0].textContent).toContain('ls');
    // Last in DOM = lowest in the feed = closest to the prompt below.
    expect(rendered[1].textContent).toContain('pwd');
  });

  test('short content is bottom-anchored (mt-auto) in both feed variants', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('one', 'ls')] },
    });
    const fill = render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const fillContainer = screen.getByTestId('terminal-blocks');
    expect(fillContainer.className).toContain('flex-col');
    expect(screen.getByTestId('terminal-blocks-content').className).toContain('mt-auto');
    fill.unmount();

    render(<BlockList tabId="tab-1" onReinput={() => {}} />);
    expect(screen.getByTestId('terminal-blocks').className).toContain('flex-col');
    expect(screen.getByTestId('terminal-blocks-content').className).toContain('mt-auto');
  });

  test('feed pins to the bottom when new content lands while pinned', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('one', 'ls')] },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const container = screen.getByTestId('terminal-blocks') as HTMLElement;
    mockFeedMetrics(container, 1000, 200);
    // Pinned at the bottom: 1000 - 800 - 200 = 0 within threshold.
    container.scrollTop = 800;
    act(() => {
      useHistoryStore.setState({
        blocksByTab: { 'tab-1': [block('one', 'ls'), block('two', 'pwd')] },
      });
    });
    expect(container.scrollTop).toBe(1000);
  });

  test('feed does not yank when the user scrolled up to read old output', () => {
    useHistoryStore.setState({
      blocksByTab: { 'tab-1': [block('one', 'ls')] },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const container = screen.getByTestId('terminal-blocks') as HTMLElement;
    mockFeedMetrics(container, 1000, 200);
    // Scrolled to the top: 1000 - 0 - 200 = 800, far from pinned.
    container.scrollTop = 0;
    fireEvent.scroll(container);
    act(() => {
      useHistoryStore.setState({
        blocksByTab: { 'tab-1': [block('one', 'ls'), block('two', 'pwd')] },
      });
    });
    expect(container.scrollTop).toBe(0);
  });
});
