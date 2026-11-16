// @vitest-environment jsdom
/**
 * Find-and-replace panel tests.
 *
 * The panel is opt-in (projectSearchEnabled): disabled shows
 * the opt-in card, enabled shows the search UI. A search
 * runs through the preload bridge, results group by file,
 * clicking a match jumps to it, and Replace All rewrites
 * through the bridge and toasts the count.
 *
 * Run with: npx vitest run tests/findReplacePanel.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor } from '@testing-library/react';
import { FindReplacePanel } from '../src/components/Search/FindReplacePanel';
import { useFindReplaceStore } from '../src/stores/findReplaceStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useFileStore } from '../src/stores/fileStore';
import { useToastStore } from '../src/stores/toastStore';

const SEARCH_RESULT = {
  matches: [
    { file: '/Users/gary/project/a.ts', line: 1, column: 7, text: 'const foo = 1;', matchText: 'foo' },
    { file: '/Users/gary/project/a.ts', line: 3, column: 4, text: '// foo again', matchText: 'foo' },
    { file: '/Users/gary/project/b.ts', line: 1, column: 10, text: 'function foo() {}', matchText: 'foo' },
  ],
  truncated: false,
  engine: 'ripgrep',
  root: '/Users/gary/project',
};

function installBridge(overrides: Record<string, unknown> = {}) {
  const search = {
    search: vi.fn(async () => SEARCH_RESULT),
    replace: vi.fn(async () => ({ filesChanged: 2, replacedCount: 3 })),
    ...((overrides.search as Record<string, unknown>) ?? {}),
  };
  (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
    fs: {
      readDir: async (dir: string) =>
        dir === '/Users/gary/project'
          ? [{ name: 'package.json', path: '/Users/gary/project/package.json', isDirectory: false, isFile: true, size: 0, modified: 0 }]
          : [],
      readFile: async () => 'changed content',
    },
    settings: {
      set: vi.fn(async () => {}),
    },
    search,
    ...(overrides as Record<string, unknown>),
  };
  return search;
}

describe('FindReplacePanel', () => {
  const originalLucidAPI = (window as unknown as { lucidAPI?: unknown }).lucidAPI;

  beforeEach(() => {
    useFindReplaceStore.setState({ open: false, initialQuery: '' });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, projectSearchEnabled: true },
    }));
    useFileStore.setState({
      currentDir: '/Users/gary/project',
      activeFilePath: '/Users/gary/project/a.ts',
    });
    useToastStore.setState({ notifications: [] });
  });

  afterEach(() => {
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = originalLucidAPI;
  });

  test('shows the opt-in card while disabled, with an Enable button', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, projectSearchEnabled: false },
    }));
    installBridge();
    const { getByText } = render(<FindReplacePanel />);
    act(() => {
      useFindReplaceStore.getState().openPanel();
    });
    expect(getByText('Find in Project')).toBeTruthy();
    expect(getByText(/opt-in/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByText('Enable project search'));
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.projectSearchEnabled).toBe(true);
    });
  });

  test('searches through the bridge and groups results by file', async () => {
    const search = installBridge();
    const { getByTestId, getByText, findByText } = render(<FindReplacePanel />);
    act(() => {
      useFindReplaceStore.getState().openPanel();
    });
    fireEvent.change(getByTestId('find-replace-query'), {
      target: { value: 'foo' },
    });
    await act(async () => {
      fireEvent.click(getByTestId('find-replace-search'));
    });
    await waitFor(() => {
      expect(search.search).toHaveBeenCalled();
    });
    const [root, options] = search.search.mock.calls[0] as [string, Record<string, unknown>];
    expect(root).toBe('/Users/gary/project');
    expect(options.query).toBe('foo');
    expect(options.scope).toBe('project');
    expect(await findByText(/3 matches in 2 files/)).toBeTruthy();
    expect(getByText('a.ts')).toBeTruthy();
    expect(getByText('b.ts')).toBeTruthy();
    expect(getByText('const foo = 1;')).toBeTruthy();
  });

  test('Replace All calls the bridge and toasts the count', async () => {
    const search = installBridge();
    const { getByTestId, findByText } = render(<FindReplacePanel />);
    act(() => {
      useFindReplaceStore.getState().openPanel();
    });
    fireEvent.change(getByTestId('find-replace-query'), {
      target: { value: 'foo' },
    });
    await act(async () => {
      fireEvent.click(getByTestId('find-replace-search'));
    });
    await findByText(/3 matches in 2 files/);
    fireEvent.change(getByTestId('find-replace-replacement'), {
      target: { value: 'baz' },
    });
    await act(async () => {
      fireEvent.click(getByTestId('find-replace-replace-all'));
    });
    await waitFor(() => {
      expect(search.replace).toHaveBeenCalled();
    });
    const [root, replacement, matches] = search.replace.mock.calls[0] as [
      string,
      string,
      unknown[],
    ];
    expect(root).toBe('/Users/gary/project');
    expect(replacement).toBe('baz');
    expect(matches).toHaveLength(3);
    await waitFor(() => {
      expect(
        useToastStore
          .getState()
          .notifications.some((t) => t.message.includes('3 matches')),
      ).toBe(true);
    });
  });

  test('an empty query shows an error, not a search', async () => {
    const search = installBridge();
    const { getByTestId, getByText } = render(<FindReplacePanel />);
    act(() => {
      useFindReplaceStore.getState().openPanel();
    });
    await act(async () => {
      fireEvent.click(getByTestId('find-replace-search'));
    });
    expect(search.search).not.toHaveBeenCalled();
    expect(getByText('Type something to search for.')).toBeTruthy();
  });
});
