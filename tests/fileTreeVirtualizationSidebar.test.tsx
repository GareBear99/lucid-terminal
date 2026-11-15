// @vitest-environment jsdom
/**
 * Explorer virtualized render (files-section fix step 4).
 *
 * The tree renders only the rows in the scroll window (plus
 * overscan), with top/bottom spacers standing in for the rest — so
 * expanding big folders no longer mounts thousands of DOM rows.
 * These tests pin the component behaviour:
 * - A 30-row tree renders only the first window of rows (10, the
 *   overscan, while the viewport is unmeasured in jsdom) — the
 *   11th row is not in the DOM.
 * - The bottom spacer stands in for the off-screen rows: its height
 *   is (total - rendered) * 28px, so the scrollbar still spans the
 *   whole tree.
 * - A small tree renders whole — virtualization changes nothing
 *   when the list fits the window.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../src/components/Layout/Sidebar';
import { useFileStore } from '../src/stores/fileStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { FileEntry } from '../src/types';

const DIR = '/Users/gary';

let prevLucidAPI: unknown;

function renderExplorer() {
  const result = render(
    <Sidebar
      width={250}
      onWidthChange={vi.fn()}
      currentView="terminal"
      onViewChange={vi.fn()}
      showAI={false}
      onToggleAI={vi.fn()}
      onOpenBloodDrop={vi.fn()}
      onToggleForge={vi.fn()}
    />,
  );
  // The Explorer panel is not the default (History is) — open it.
  fireEvent.click(screen.getByLabelText('Explorer'));
  return result;
}

function setEntries(names: string[]) {
  useFileStore.setState({
    currentDir: DIR,
    entries: names.map((name) => ({
      path: `${DIR}/${name}`,
      name,
      isDirectory: false,
      isFile: true,
      size: 0,
      modified: 0,
    })),
    expandedDirs: new Set<string>(),
    selectedPath: null,
    error: null,
    isLoading: false,
  });
}

beforeEach(() => {
  const win = window as unknown as Record<string, unknown>;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    settings: {
      set: vi.fn(),
      getAll: vi.fn(async () => ({})),
      hasApiKey: vi.fn(async () => false),
      hasPingKey: vi.fn(async () => false),
      getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
    },
    fs: {
      readDir: vi.fn(async (): Promise<FileEntry[]> => []),
    },
  };
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...base,
      toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true, mouse: true },
      luciferAiEnabled: true,
      toolbarOrder: [],
      installedAddons: [],
    },
  });
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  win.lucidAPI = prevLucidAPI;
});

describe('Explorer virtualized tree render', () => {
  test('a 30-row tree renders only the first window; the rest is a spacer', () => {
    const names = Array.from({ length: 30 }, (_, i) => `file-${String(i).padStart(2, '0')}.txt`);
    setEntries(names);
    const { container } = renderExplorer();

    // First window (overscan, 10 rows) is in the DOM.
    expect(screen.getByText('file-00.txt')).toBeTruthy();
    expect(screen.getByText('file-09.txt')).toBeTruthy();
    // The 11th row is NOT mounted.
    expect(screen.queryByText('file-10.txt')).toBeNull();
    expect(screen.queryByText('file-29.txt')).toBeNull();

    // The bottom spacer stands in for the 20 off-screen rows.
    const spacers = container.querySelectorAll('div[aria-hidden="true"]');
    const heights = [...spacers]
      .map((el) => (el as HTMLElement).style.height)
      .filter((h) => h !== '');
    expect(heights).toContain('560px');
  });

  test('a small tree renders whole', () => {
    setEntries(['a.txt', 'b.txt', 'c.txt']);
    renderExplorer();

    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('b.txt')).toBeTruthy();
    expect(screen.getByText('c.txt')).toBeTruthy();
  });
});
