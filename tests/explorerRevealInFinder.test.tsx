// @vitest-environment jsdom
/**
 * Explorer "Reveal in Finder" context-menu tests.
 *
 * The fs:openInExplorer IPC handler (electron/ipc/fileSystem.ts,
 * shell.showItemInFolder) existed with zero callers — the Explorer
 * context menu is its caller. Right-clicking a tree item shows
 * "Reveal in Finder" (macOS) / "Show in Explorer" (Windows) /
 * "Show in Files" (Linux); clicking it reveals that item in the
 * system file manager and closes the menu.
 *
 * Run with: npx vitest run tests/explorerRevealInFinder.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExplorerPanel } from '../src/components/Sidebar/ExplorerPanel';
import { useFileStore } from '../src/stores/fileStore';

describe('Explorer context menu — Reveal in Finder', () => {
  const mockOpenInExplorer = vi.fn(async (_path: string) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      fs: { openInExplorer: mockOpenInExplorer },
    };
    mockOpenInExplorer.mockClear();
    useFileStore.setState({
      currentDir: '/tmp/ws',
      entries: [
        {
          name: 'notes.ts',
          path: '/tmp/ws/notes.ts',
          isDirectory: false,
          isFile: true,
          size: 1,
          modified: 0,
        },
      ],
      expandedDirs: [],
      selectedPath: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    useFileStore.setState({ entries: [], currentDir: '', selectedPath: null });
    vi.clearAllMocks();
  });

  test('right-click shows Reveal in Finder and clicking it reveals the item', async () => {
    render(<ExplorerPanel width={240} onMinimize={() => {}} />);

    fireEvent.contextMenu(screen.getByText('notes.ts'), {
      clientX: 50,
      clientY: 50,
    });

    // jsdom reports no navigator.platform, so the app defaults to
    // macOS (detectPlatform) — the Mac label.
    const reveal = screen.getByText('Reveal in Finder');
    expect(reveal).toBeTruthy();
    // The pre-existing items are still there.
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();

    fireEvent.click(reveal);

    await waitFor(() => {
      expect(mockOpenInExplorer).toHaveBeenCalledWith('/tmp/ws/notes.ts');
    });
    // The menu closes after the reveal.
    expect(screen.queryByText('Reveal in Finder')).toBeNull();
  });
});
