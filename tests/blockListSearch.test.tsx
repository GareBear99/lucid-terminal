// @vitest-environment jsdom
/**
 * Feed in-block search + filter-lines (sweep item 5).
 *
 * Per-block "find in output": the Find button opens a find
 * row over the block's output; matches highlight (the active
 * one distinctly), next/prev cycle them, the count reads
 * n/m; the Filter toggle shows only the matching lines.
 * With no query the output renders exactly as before.
 *
 * Run with: npx vitest run tests/blockListSearch.test.tsx
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

const OUTPUT = [
  'starting build',
  'error: missing module foo',
  'warning: deprecated call',
  'error: missing module bar',
  'build finished',
].join('\n');

function block(): TerminalBlock {
  return {
    id: 'b1',
    command: 'npm run build',
    output: OUTPUT,
    timestamp: 1000,
    isComplete: true,
  };
}

function seed() {
  useHistoryStore.setState({ blocksByTab: { 'tab-1': [block()] } });
}

function marks(): HTMLElement[] {
  return Array.from(document.querySelectorAll('mark'));
}

function activeMark(): HTMLElement | undefined {
  return marks().find((m) => m.className.includes('text-[var(--bg-primary)]'));
}

describe('feed in-block search — sweep item 5', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  test('Find opens the row; a query highlights matches and counts them', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(screen.queryByTestId('block-search')).toBeNull();

    fireEvent.click(screen.getByTestId('block-find'));
    expect(screen.getByTestId('block-search')).not.toBeNull();
    const input = screen.getByTestId('block-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'error' } });

    expect(marks()).toHaveLength(2);
    expect(screen.getByTestId('block-search-count').textContent).toBe('1/2');
    expect(activeMark()?.textContent).toBe('error');
    // The second match is the inactive style.
    expect(marks()[1].className).toContain('/30');
  });

  test('next/prev cycle the active match and wrap around', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    fireEvent.change(screen.getByTestId('block-search-input'), { target: { value: 'error' } });

    fireEvent.click(screen.getByTestId('block-search-next'));
    expect(screen.getByTestId('block-search-count').textContent).toBe('2/2');
    expect(activeMark()).toBe(marks()[1]);
    // Wraps to the first.
    fireEvent.click(screen.getByTestId('block-search-next'));
    expect(screen.getByTestId('block-search-count').textContent).toBe('1/2');
    expect(activeMark()).toBe(marks()[0]);
    // Prev from the first wraps to the last.
    fireEvent.click(screen.getByTestId('block-search-prev'));
    expect(screen.getByTestId('block-search-count').textContent).toBe('2/2');
  });

  test('Enter steps forward, Shift+Enter steps back', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    const input = screen.getByTestId('block-search-input');
    fireEvent.change(input, { target: { value: 'error' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('block-search-count').textContent).toBe('2/2');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByTestId('block-search-count').textContent).toBe('1/2');
  });

  test('matching is case-insensitive; no matches reads 0/0', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    const input = screen.getByTestId('block-search-input');
    fireEvent.change(input, { target: { value: 'ERROR' } });
    expect(marks()).toHaveLength(2);
    expect(screen.getByTestId('block-search-count').textContent).toBe('1/2');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(marks()).toHaveLength(0);
    expect(screen.getByTestId('block-search-count').textContent).toBe('0/0');
  });

  test('Filter shows only the matching lines', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    fireEvent.change(screen.getByTestId('block-search-input'), { target: { value: 'error' } });
    // Unfiltered, every line is present.
    expect(screen.getByTestId('block-output').textContent).toContain('build finished');

    fireEvent.click(screen.getByTestId('block-search-filter'));
    const shown = screen.getByTestId('block-output').textContent ?? '';
    expect(shown).toContain('error: missing module foo');
    expect(shown).toContain('error: missing module bar');
    expect(shown).not.toContain('starting build');
    expect(shown).not.toContain('warning: deprecated call');
    expect(shown).not.toContain('build finished');
    // The count is unchanged — filtered-out lines hold no matches.
    expect(screen.getByTestId('block-search-count').textContent).toBe('1/2');
    expect(screen.getByTestId('block-search-filter').getAttribute('aria-pressed')).toBe('true');
  });

  test('Escape closes the find row; Find toggles it back', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    const input = screen.getByTestId('block-search-input');
    fireEvent.change(input, { target: { value: 'error' } });
    expect(marks()).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('block-search')).toBeNull();
    // Closing the row clears the highlights.
    expect(marks()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('block-find'));
    expect(screen.getByTestId('block-search')).not.toBeNull();
  });

  test('a regex-special query is treated literally, not as a pattern', () => {
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [{ ...block(), output: 'a+b aab' }],
      },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    fireEvent.click(screen.getByTestId('block-find'));
    fireEvent.change(screen.getByTestId('block-search-input'), { target: { value: 'a+b' } });
    expect(marks()).toHaveLength(1);
    expect(marks()[0].textContent).toBe('a+b');
  });

  test('with no query the output renders as raw text (the common path)', () => {
    seed();
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(screen.getByTestId('block-output').textContent).toBe(OUTPUT);
    expect(marks()).toHaveLength(0);
  });
});
