// @vitest-environment jsdom
/**
 * Prompt bottom-pinned from launch — non-devmode DEFCON 3 only
 * (Gary, 2026-11-09 ~11:41 PST — "see how its at the top" /
 * "After something is input it sets right" / "thats the issue").
 *
 * In non-devmode DEFCON 3 the xterm surface is unmounted, so the
 * block list is the SOLE feed — and when it was empty it returned
 * null, leaving nothing above the prompt section to fill the
 * terminal column, so the prompt sat at the TOP on launch (empty
 * feed, 0 commands) and only dropped to the bottom once the first
 * block existed. The empty fill-mode list now still occupies the
 * column (the same flex-1 container), so the prompt is
 * bottom-pinned from launch. Devmode is unchanged: the empty list
 * still returns null there, and the live xterm below is the filler.
 *
 * Harness: same as tests/prompterComposerBorder.test.tsx — jsdom
 * has no canvas, so XtermSurface renders its plain-text fallback
 * and InputArea falls back to a plain textarea (Monaco mocked
 * to fail fast).
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';

// Monaco never mounts here: the loader rejects at once, so
// InputArea renders its plain-textarea fallback immediately
// (no 8s timeout, no editor).
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

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let writeMock: ReturnType<typeof vi.fn>;
let commandMock: ReturnType<typeof vi.fn>;
let executeCommandMock: ReturnType<typeof vi.fn>;
let settingsSetMock: ReturnType<typeof vi.fn>;
let dataHandler: ((id: string, data: string) => void) | null;

const TAB_CWD = '/Users/gary/lucid-terminal';

beforeEach(() => {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
  dataHandler = null;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: (h: (id: string, data: string) => void) => {
        dataHandler = h;
        return () => {};
      },
      onExit: () => () => {},
      onCwd: () => () => {},
      write: writeMock,
      executeCommand: executeCommandMock,
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: commandMock,
      getHistory: vi.fn().mockResolvedValue([{ command: 'pwd' }]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
      getTokenStats: vi.fn().mockResolvedValue({}),
    },
    settings: { set: settingsSetMock },
  };
  useHistoryStore.setState({ blocksByTab: {} });
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true }],
    activeTabId: 'tab-1',
  });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: true, luciferAiSilenced: false },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: true, luciferAiSilenced: false, defconLevel: 1, defconMergeReading: null },
  });
  vi.restoreAllMocks();
});

function setDefconLevel(level: 1 | 2 | 3) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, defconLevel: level } });
}

function setDevMode(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, devMode: enabled } });
}

function renderNonDevmode(level: 1 | 2 | 3) {
  setDevMode(false);
  setDefconLevel(level);
  render(<Terminal tabId="tab-1" />);
}

function renderDevmode(level: 1 | 2 | 3) {
  setDevMode(true);
  setDefconLevel(level);
  render(<Terminal tabId="tab-1" />);
}

describe('Prompt bottom-pinned from launch — non-devmode DEFCON 3 empty feed', () => {
  test('non-devmode at level 3, 0 blocks: the empty feed still fills the column, prompt last', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');

    // The bug's context: no xterm surface at all in this state.
    expect(screen.queryByTestId('xterm-surface')).toBeNull();

    // The fix: the empty fill-mode list renders the flex-1
    // container, so the column has a filler above the prompt.
    const blocks = screen.getByTestId('terminal-blocks');
    expect(blocks.className).toContain('flex-1');
    expect(blocks.children).toHaveLength(0);

    // The prompt section comes AFTER the filler in the flex
    // column, and is the column's last child — so it sits at
    // the bottom from launch, not at the top.
    const prompt = screen.getByTestId('prompt-section');
    expect(prompt.compareDocumentPosition(blocks)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    const content = screen.getByTestId('terminal-content');
    expect(content.lastElementChild).toBe(prompt);
  });

  test('devmode at level 3, 0 blocks: empty list still returns null, xterm is the filler (unchanged)', async () => {
    renderDevmode(3);
    // In devmode the composer lives in the dev command bar, not
    // the prompt-section wrap — wait on the composer itself.
    await screen.findByTestId('prompter-composer');

    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
    expect(screen.getByTestId('xterm-surface')).not.toBeNull();
  });

  test('non-devmode below 3: no block list at all in the empty state (unchanged)', async () => {
    renderNonDevmode(2);
    await screen.findByTestId('xterm-surface');

    expect(screen.queryByTestId('terminal-blocks')).toBeNull();
    expect(screen.queryByTestId('prompter-composer')).toBeNull();
  });
});
