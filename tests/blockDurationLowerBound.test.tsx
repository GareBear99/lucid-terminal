// @vitest-environment jsdom
/**
 * Slow-pause duration (sweep item 15).
 *
 * A block closes after 500 ms of PTY quiescence — a command
 * that pauses output longer than that mid-run (`sleep 2; echo
 * done`) closes early, and the header duration understated
 * the run. The fix: a quiescence-closed duration is marked a
 * lower bound (`durationIsLowerBound`) and the header renders
 * it with "≥", so it never states a false number. Force-closes
 * (next submit, slash resolve, shell exit) close on proof the
 * prompt returned and stay plain.
 *
 * Run with: npx vitest run tests/blockDurationLowerBound.test.tsx
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { closeBlock, formatBlockDuration } from '../src/lib/terminalBlocks';
import { BlockList } from '../src/components/Terminal/BlockList';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock } from '../src/types';

function block(overrides: Partial<TerminalBlock> = {}): TerminalBlock {
  return {
    id: 'a',
    command: 'sleep 2; echo done',
    output: 'done',
    timestamp: 1000,
    isComplete: false,
    ...overrides,
  };
}

describe('closeBlock — sweep item 15', () => {
  test('a quiet close stamps the duration as a lower bound', () => {
    const closed = closeBlock(block(), 1500, { lowerBound: true });
    expect(closed.isComplete).toBe(true);
    expect(closed.durationMs).toBe(500);
    expect(closed.durationIsLowerBound).toBe(true);
  });

  test('a force close stamps an exact duration (no lower-bound flag)', () => {
    const closed = closeBlock(block(), 3000);
    expect(closed.isComplete).toBe(true);
    expect(closed.durationMs).toBe(2000);
    expect(closed.durationIsLowerBound).toBeUndefined();
  });

  test('first close wins — a later force close cannot clear the flag or restamp', () => {
    const quiet = closeBlock(block(), 1500, { lowerBound: true });
    const forced = closeBlock(quiet, 3000);
    expect(forced).toBe(quiet);
    expect(forced.durationMs).toBe(500);
    expect(forced.durationIsLowerBound).toBe(true);
  });

  test('formatBlockDuration is unchanged', () => {
    expect(formatBlockDuration(500)).toBe('500ms');
    expect(formatBlockDuration(2000)).toBe('2.0s');
  });
});

describe('BlockList header — sweep item 15', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  test('a quiescence-closed duration renders with "≥" and an honest title', () => {
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [block({ isComplete: true, durationMs: 500, durationIsLowerBound: true })],
      },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const duration = screen.getByTitle(
      'at least 500ms — closed on output quiescence; the command may have run longer',
    );
    expect(duration.textContent).toBe('≥500ms');
  });

  test('a force-closed duration renders plain, with a plain title', () => {
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [block({ isComplete: true, durationMs: 2000 })],
      },
    });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    const duration = screen.getByTitle('2000ms');
    expect(duration.textContent).toBe('2.0s');
  });
});
