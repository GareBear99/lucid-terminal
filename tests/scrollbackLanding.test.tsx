// @vitest-environment jsdom
/**
 * Scrollback lost landing at DEFCON 3 (sweep item 16).
 *
 * Landing at level 3+ unmounts the xterm surface, and with it
 * the pre-landing transcript — the feed started empty. The fix
 * is a live mirror: every chunk the surface shows is mirrored
 * into a transcript while the surface is mounted; on landing
 * the mirror snapshots into ONE 'scrollback' block in the feed.
 * A scrollback block is a transcript, not a command — it renders
 * with a SCROLLBACK badge and no re-input / copy-cmd buttons.
 *
 * Run with: npx vitest run tests/scrollbackLanding.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { BlockList } from '../src/components/Terminal/BlockList';
import {
  createScrollbackMirror,
  newScrollbackBlock,
} from '../src/lib/terminalBlocks';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { TerminalBlock } from '../src/types';

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => Promise.reject(new Error('monaco down')),
    config: () => {},
  },
  default: () => null,
}));

vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));

describe('scrollback mirror — sweep item 16', () => {
  test('mirrors PTY chunks and snapshots them as one scrollback block', () => {
    const mirror = createScrollbackMirror('tab-1');
    mirror.mirror('gary@mini ~ % ls\r\n', 'pty');
    mirror.mirror('file-a  file-b\r\n', 'pty');
    mirror.mirror('gary@mini ~ % ', 'pty');
    const block = mirror.snapshot('Scrollback — terminal transcript before DEFCON 3', 5000);
    expect(block).not.toBeNull();
    expect(block!.kind).toBe('scrollback');
    expect(block!.command).toBe('Scrollback — terminal transcript before DEFCON 3');
    expect(block!.isComplete).toBe(true);
    expect(block!.durationMs).toBeUndefined();
    expect(block!.output).toContain('ls');
    expect(block!.output).toContain('file-a  file-b');
    // Snapshot resets — a second snapshot is empty.
    expect(mirror.snapshot('x', 6000)).toBeNull();
  });

  test('an empty mirror snapshots to null', () => {
    const mirror = createScrollbackMirror('tab-1');
    expect(mirror.snapshot('x', 1000)).toBeNull();
    mirror.mirror('   \n\n', 'pty');
    expect(mirror.snapshot('x', 1000)).toBeNull();
  });

  test('a clear-screen sequence drops the pre-clear transcript', () => {
    const mirror = createScrollbackMirror('tab-1');
    mirror.mirror('old output\r\n', 'pty');
    mirror.mirror('\x1b[2Jnew output\r\n', 'pty');
    const block = mirror.snapshot('x', 2000);
    expect(block!.output).toContain('new output');
    expect(block!.output).not.toContain('old output');
  });

  test('newScrollbackBlock trims trailing blank lines and rejects blank output', () => {
    expect(newScrollbackBlock('  \n\n', 'x', 1000)).toBeNull();
    const block = newScrollbackBlock('line one\nline two\n\n\n', 'label', 1000);
    expect(block!.output).toBe('line one\nline two');
  });
});

describe('BlockList — scrollback block rendering', () => {
  beforeEach(() => {
    useHistoryStore.setState({ blocksByTab: {} });
  });

  function scrollbackBlock(): TerminalBlock {
    return {
      id: 'sb-1',
      command: 'Scrollback — terminal transcript before DEFCON 3',
      output: 'gary@mini ~ % ls\nfile-a  file-b',
      timestamp: 5000,
      isComplete: true,
      kind: 'scrollback',
    };
  }

  test('renders a SCROLLBACK badge, the transcript, and no re-input', () => {
    useHistoryStore.setState({ blocksByTab: { 'tab-1': [scrollbackBlock()] } });
    render(<BlockList tabId="tab-1" onReinput={() => {}} fill />);
    expect(screen.getByText('SCROLLBACK')).not.toBeNull();
    expect(screen.getByText(/file-a/)).not.toBeNull();
    expect(screen.queryByTestId('block-reinput')).toBeNull();
    expect(screen.queryByTestId('block-copy-command')).toBeNull();
    // Copy-out, find and the fold chevron stay.
    expect(screen.getByTestId('block-copy-output')).not.toBeNull();
    expect(screen.getByTestId('block-find')).not.toBeNull();
    expect(screen.getByTestId('block-collapse')).not.toBeNull();
  });
});

// --- Full landing test: feed PTY chunks below 3, land at 3, the
// transcript is one scrollback block in the feed. Modelled on the
// defcon3Phase1 harness (same mocks, plus a captured onData).
const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let dataCallback: ((id: string, data: string) => void) | null;

beforeEach(() => {
  dataCallback = null;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: vi.fn((cb: (id: string, data: string) => void) => {
        dataCallback = cb;
        return () => {};
      }),
      onExit: () => () => {},
      write: vi.fn(),
      executeCommand: vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' }),
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' }),
      getHistory: vi.fn().mockResolvedValue([{ command: 'pwd' }]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
      getTokenStats: vi.fn().mockResolvedValue({}),
    },
    settings: { set: vi.fn(async () => undefined) },
  };
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false, defconLevel: 1 },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: false, luciferAiSilenced: false, defconLevel: 1, defconMergeReading: null },
  });
  vi.restoreAllMocks();
});

function setDefconLevel(level: 1 | 2 | 3) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, defconLevel: level } });
}

describe('landing at DEFCON 3 carries the scrollback — sweep item 16', () => {
  test('PTY output below 3 becomes one scrollback block on landing', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    expect(dataCallback).not.toBeNull();

    // Work in the xterm below 3: two shell lines.
    dataCallback!('tab-1', 'gary@mini ~ % ls\r\n');
    dataCallback!('tab-1', 'file-a  file-b\r\n');
    dataCallback!('tab-1', 'gary@mini ~ % pwd\r\n');
    dataCallback!('tab-1', '/Users/gary\r\n');
    // A chunk for another tab must not leak into this tab's mirror.
    dataCallback!('tab-2', 'other-tab-output\r\n');

    // Land at DEFCON 3: the surface unmounts, the feed is the
    // sole surface — and the transcript rides along as one block.
    setDefconLevel(3);
    await screen.findByTestId('prompter-composer-wrap');
    await waitFor(() => {
      const blocks = useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
      expect(blocks.some((b) => b.kind === 'scrollback')).toBe(true);
    });
    const blocks = useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
    const scrollback = blocks.find((b) => b.kind === 'scrollback')!;
    expect(scrollback.output).toContain('file-a  file-b');
    expect(scrollback.output).toContain('/Users/gary');
    expect(scrollback.output).not.toContain('other-tab-output');
    expect(screen.getByText('SCROLLBACK')).not.toBeNull();
  });

  test('landing with an empty transcript carries no block', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    setDefconLevel(3);
    await screen.findByTestId('prompter-composer-wrap');
    const blocks = useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
    expect(blocks.some((b) => b.kind === 'scrollback')).toBe(false);
  });
});
