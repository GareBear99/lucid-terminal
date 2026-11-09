// @vitest-environment jsdom
/**
 * Prompter composer border — non-devmode DEFCON 3 only (Gary,
 * 2026-11-09 ~10:58 PST — "get rid of the box outline on the
 * prompt on non dev mode", "this only applies to non dev mode
 * defcon 3 i saw it in").
 *
 * In non-devmode the prompt section is a solid black bar
 * (Warp-style) and the composer's `border
 * border-[var(--border)]` reads as a box outline around the
 * prompt — so at DEFCON 3+ in NON-devmode the composer drops
 * the border (background untouched). Devmode keeps the border
 * exactly as-is. DEFCON 1/2 do not use this composer, so
 * nothing changes there.
 *
 * Harness: same as tests/defcon3Phase5.test.tsx — jsdom has
 * no canvas, so XtermSurface renders its plain-text fallback
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

describe('Prompter composer border — non-devmode DEFCON 3 only', () => {
  test('non-devmode at level 3, LuciferAI on: composer has NO border, background untouched', async () => {
    renderNonDevmode(3);
    const composer = await screen.findByTestId('prompter-composer');

    expect(composer.className).not.toContain('border');
    // Background untouched — the bar is still the settled fill.
    expect(composer.className).toContain('bg-[var(--bg-tertiary)]/50');
  });

  test('devmode at level 3, LuciferAI on: composer KEEPS the border', async () => {
    renderDevmode(3);
    const composer = await screen.findByTestId('prompter-composer');

    expect(composer.className).toContain('border border-[var(--border)]');
    expect(composer.className).toContain('bg-[var(--bg-tertiary)]/50');
  });

  test('non-devmode below 3: no composer at all (unchanged behaviour)', async () => {
    renderNonDevmode(2);
    await screen.findByTestId('xterm-surface');

    expect(screen.queryByTestId('prompter-composer')).toBeNull();
    expect(screen.queryByTestId('prompter-composer-wrap')).toBeNull();
  });
});
