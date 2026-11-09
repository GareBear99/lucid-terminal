// @vitest-environment jsdom
/**
 * CodeEditor empty-state theme tests.
 *
 * Regression (Gary, 2026-11-09 — "still black not the theme"): the
 * Files/Editor centre with no files open rendered pure black — the
 * empty-state div was transparent over the app root's bg-black, so the
 * page read as a black hole between themed panels. The empty state
 * must carry the stored theme's own background token, never black.
 *
 * Scope: the empty-state path only. The open-file editor surface is
 * hardcoded stock vs-dark (#1E1E1E) by design and is NOT covered here.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useFileStore } from '../src/stores/fileStore';
import CodeEditor from '../src/components/Editor/CodeEditor';

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => new Promise(() => {}),
    config: () => {},
  },
  default: () => <div data-testid="monaco-editor" />,
}));

beforeEach(() => {
  useFileStore.setState({ openFiles: [], activeFilePath: null });
});

afterEach(() => {
  act(() => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });
  vi.clearAllMocks();
});

describe('CodeEditor empty state', () => {
  it('renders the empty state on the theme background, never pure black', () => {
    render(<CodeEditor />);

    const message = screen.getByText('No files open. Select a file from the explorer.');
    const container = message.parentElement as HTMLElement;

    // The stored theme's background token — lucifer bgPrimary #0d0608.
    expect(container.className).toContain('bg-[var(--bg-primary)]');
    // No black anywhere on the empty-state container.
    expect(container.className).not.toContain('bg-black');
    expect(container.className).not.toContain('#000000');
    expect(container.className).not.toContain('bg-[#000');
  });

  it('does not render the empty state once a file is open', () => {
    useFileStore.setState({
      openFiles: [
        {
          path: '/tmp/notes.ts',
          name: 'notes.ts',
          content: 'const answer = 42;\n',
          originalContent: 'const answer = 42;\n',
          isDirty: false,
        },
      ],
      activeFilePath: '/tmp/notes.ts',
    });

    render(<CodeEditor />);

    expect(
      screen.queryByText('No files open. Select a file from the explorer.')
    ).toBeNull();
  });
});
