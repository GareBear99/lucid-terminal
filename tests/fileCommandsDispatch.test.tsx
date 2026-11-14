// @vitest-environment jsdom
/**
 * File slash commands — dispatch through the REAL terminal
 * (Gary, 2026-11-14 — "just the basic ones"). /file opens the
 * Files page (the Editor view, via the onOpenFiles prop App
 * passes as setCurrentView('editor')); /open opens a file in
 * the editor; /new creates an empty file and opens it.
 *
 * The dispatch is Lucid-local, like /split: no LuciferAI gate,
 * no silenced gate, no guest gate — the same store calls the
 * Files tab makes, so guest runs them session-only. Paths
 * resolve against the Files tab's root (fileStore.currentDir);
 * absolute paths are used as given. Errors go to the feed with
 * `write`, the same one-line shape as /plan's bad-input errors.
 *
 * /delete and /rename were dropped by Gary (~14:17 / ~14:20
 * PST) — there is no dispatch for them; the parser pins that
 * in tests/fileCommands.test.ts.
 *
 * This renders the real Terminal (LuciferAI disabled, so the
 * plugin probe short-circuits) with the heavy children stubbed,
 * mocks the file store's actions, and submits through the DEFCON 3
 * composer (the prompt section's fallback textarea in jsdom).
 * DEFCON is set to 3 in the test so the prompter is active and
 * slash output lands in the feed block (the store default is
 * level 1, where openBlock is a no-op) — at level 3 the xterm
 * surface is unmounted, so the xterm fallback input does not
 * exist here; the composer is the submit path.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useFileStore } from '../src/stores/fileStore';

// Heavy children the test does not care about — stub them so the render
// stays light (SentinelFace runs a rAF gaze loop; FixNetStatus fetches
// stats on mount).
vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));
vi.mock('../src/components/FixNet/FixNetStatus', () => ({
  FixNetStatus: () => null,
}));

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let writeMock: ReturnType<typeof vi.fn>;
let openFileMock: ReturnType<typeof vi.fn>;
let createFileMock: ReturnType<typeof vi.fn>;
let openFilesMock: ReturnType<typeof vi.fn>;
let origFileStore: ReturnType<typeof useFileStore.getState>;
let origSettings: ReturnType<typeof useSettingsStore.getState>['settings'];

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })),
      configurable: true,
    });
  }
  writeMock = vi.fn();
  openFileMock = vi.fn().mockResolvedValue(true);
  createFileMock = vi.fn().mockResolvedValue(undefined);
  openFilesMock = vi.fn();
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      create: vi.fn().mockResolvedValue(undefined),
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
    },
    lucid: {
      clearHistory: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
    },
  };
  origFileStore = useFileStore.getState();
  useFileStore.setState({
    currentDir: '/home/gary',
    error: null,
    openFile: openFileMock,
    createFile: createFileMock,
  });
  origSettings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...origSettings, luciferAiEnabled: false, defconLevel: 3 },
  });
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useFileStore.setState(origFileStore);
  useSettingsStore.setState({ settings: origSettings });
  useHistoryStore.setState({ blocksByTab: {} });
});

/** Type a command into the DEFCON 3 composer and press Enter. */
async function submitCommand(command: string) {
  const wrap = await screen.findByTestId('prompter-composer-wrap');
  // Monaco fails slowly in jsdom (~8s), so the fallback textarea
  // appears long after the wrap — wait for it. Found by element,
  // not placeholder: with LuciferAI enabled the ghost words
  // suppress the textarea's native placeholder, so the
  // placeholder text is not a stable handle.
  let input: HTMLTextAreaElement | null = null;
  await waitFor(
    () => {
      input = wrap.querySelector('textarea') as HTMLTextAreaElement | null;
      expect(input).not.toBeNull();
    },
    { timeout: 15000 },
  );
  fireEvent.change(input!, { target: { value: command } });
  fireEvent.keyDown(input!, { key: 'Enter' });
}

/** Everything the feed holds for the tab, commands + outputs. */
function feedText(): string {
  return (useHistoryStore.getState().blocksByTab['tab-1'] ?? [])
    .map((b) => `${b.command}\n${b.output}`)
    .join('\n');
}

describe('file commands — dispatch', () => {
  test('/file opens the Files page and touches no file', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/file');
    await waitFor(() => expect(openFilesMock).toHaveBeenCalledTimes(1));
    expect(openFileMock).not.toHaveBeenCalled();
    expect(createFileMock).not.toHaveBeenCalled();
  }, 30000);

  test('/open opens the file in the editor, resolved against the Files root', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/open notes.txt');
    await waitFor(() => expect(openFileMock).toHaveBeenCalledWith('/home/gary/notes.txt'));
    expect(openFilesMock).toHaveBeenCalledTimes(1);
  }, 30000);

  test('/open keeps an absolute path whole', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/open /tmp/notes.txt');
    await waitFor(() => expect(openFileMock).toHaveBeenCalledWith('/tmp/notes.txt'));
    expect(openFilesMock).toHaveBeenCalledTimes(1);
  }, 30000);

  test('/open on a missing file errors in the feed and opens nothing', async () => {
    openFileMock.mockResolvedValue(false);
    useFileStore.setState({ error: 'Failed to read file: ENOENT: no such file' });
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/open missing.txt');
    await waitFor(() => expect(openFileMock).toHaveBeenCalledWith('/home/gary/missing.txt'));
    await waitFor(() =>
      expect(feedText()).toContain('Could not open "missing.txt"'),
    );
    expect(openFilesMock).not.toHaveBeenCalled();
  }, 30000);

  test('/open with no argument shows usage in the feed', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/open');
    await waitFor(() => expect(feedText()).toContain('Usage: /open <file>'));
    expect(openFileMock).not.toHaveBeenCalled();
    expect(openFilesMock).not.toHaveBeenCalled();
  }, 30000);

  test('/new creates the file (Files create — an existing file is truncated) and opens the editor', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/new notes.txt');
    await waitFor(() => expect(createFileMock).toHaveBeenCalledWith('/home/gary/notes.txt'));
    expect(openFilesMock).toHaveBeenCalledTimes(1);
  }, 30000);

  test('/new with no argument shows usage in the feed', async () => {
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/new');
    await waitFor(() => expect(feedText()).toContain('Usage: /new <file>'));
    expect(createFileMock).not.toHaveBeenCalled();
    expect(openFilesMock).not.toHaveBeenCalled();
  }, 30000);

  test('/file works with LuciferAI enabled too — no plugin gate', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, luciferAiEnabled: true },
    }));
    render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
    await submitCommand('/file');
    await waitFor(() => expect(openFilesMock).toHaveBeenCalledTimes(1));
  }, 30000);

  test('guest: /open runs the same store call — no guest gate', async () => {
    useHistoryStore.getState().enterGuestSession();
    try {
      render(<Terminal tabId="tab-1" onOpenFiles={openFilesMock} />);
      await submitCommand('/open notes.txt');
      await waitFor(() => expect(openFileMock).toHaveBeenCalledWith('/home/gary/notes.txt'));
      expect(openFilesMock).toHaveBeenCalledTimes(1);
    } finally {
      useHistoryStore.getState().exitGuestSession();
    }
  }, 30000);
});
