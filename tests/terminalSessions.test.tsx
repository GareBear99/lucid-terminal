// @vitest-environment jsdom
/**
 * Terminal mode — the mode pill as a same-tab toggle (heavy
 * terminal work, 2026-11-13; REBUILT 2026-11-13 ~08:21 PST
 * per Gary — Warp's in-tab agent flow).
 *
 * Covered here: the hint line per context (including the
 * auto-detection offer), ⌘⏎ hand-off from the composer and
 * from the xterm (flips the SAME tab to Agent, draft as first
 * prompt), Esc back to Terminal, the mode pill flipping the
 * tab's mode and nothing else (no new tab, no new session, no
 * new row), the agent view at DEFCON 1 (composer visible,
 * xterm unmounted, the tab's own feed), switching tabs
 * preserving each tab's mode + conversation, and Up/Down
 * walking the tab's past agent prompts.
 *
 * Harness: same as tests/defcon3Phase5.test.tsx — jsdom has
 * no canvas, so XtermSurface renders its plain-text fallback
 * and InputArea falls back to a plain textarea (Monaco mocked
 * to fail fast). The PTY stream is driven by capturing the
 * onData handler the Terminal registers.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore, selectHistoryBlocksForTab } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSessionStore, getTabMode } from '../src/stores/sessionStore';
import { resetGitStatusCacheForTests } from '../src/lib/useGitStatus';

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
let gitStatusMock: ReturnType<typeof vi.fn>;
let dataHandler: ((id: string, data: string) => void) | null;

const TAB_CWD = '/Users/gary/lucid-terminal';

beforeEach(() => {
  writeMock = vi.fn();
  commandMock = vi.fn().mockResolvedValue({ terminalOutput: 'fixnet stats output' });
  executeCommandMock = vi.fn().mockResolvedValue({ success: true, output: 'hello-dev' });
  settingsSetMock = vi.fn(async (_key: string, _value: unknown) => undefined);
  gitStatusMock = vi.fn().mockResolvedValue(null);
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
    git: { getStatus: gitStatusMock },
    settings: { set: settingsSetMock },
  };
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true }],
    activeTabId: 'tab-1',
  });
  useSessionStore.getState().resetForTests();
  resetGitStatusCacheForTests();
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, luciferAiEnabled: true, luciferAiSilenced: false },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useTerminalStore.setState({ tabs: [], activeTabId: null });
  useSessionStore.getState().resetForTests();
  resetGitStatusCacheForTests();
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

function renderNonDevmode(level: 1 | 2 | 3, tabId = 'tab-1') {
  setDefconLevel(level);
  return render(<Terminal tabId={tabId} />);
}

/** The composer's input (the fallback textarea in jsdom) — the
 *  linked composer in the prompt section, in both modes. */
function composerInput(): HTMLTextAreaElement {
  const wrap = screen.getByTestId('prompter-composer-wrap');
  const textarea = wrap.querySelector('textarea');
  expect(textarea).not.toBeNull();
  return textarea as HTMLTextAreaElement;
}

/** Type a line into the composer and press Enter. */
function submitToComposer(text: string) {
  const input = composerInput();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Type a line into the composer without submitting. */
function typeInComposer(text: string) {
  fireEvent.change(composerInput(), { target: { value: text } });
}

function hintLineText(): string {
  return screen.getByTestId('terminal-hint-line').textContent ?? '';
}

function headerText(): string {
  return screen.getByTestId('prompt-section-header').textContent ?? '';
}

function tabMode(tabId = 'tab-1') {
  return getTabMode(useSessionStore.getState().tabMode, tabId);
}

function tabBlocks(tabId = 'tab-1') {
  return useHistoryStore.getState().blocksByTab[tabId] ?? [];
}

describe('Terminal mode — the hint line', () => {
  test('below DEFCON 3 the hint line offers only the hand-off the window listener provides', async () => {
    renderNonDevmode(1);
    await screen.findByTestId('xterm-surface');
    expect(hintLineText()).toBe('⌘⏎ new agent conversation');
  });

  test('at DEFCON 3 with an empty draft the hint line offers the hand-off and composer history', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    expect(hintLineText()).toBe('⌘⏎ new agent conversation · ↑ past commands');
  });

  test('a draft the auto-detection reads as a prompt changes the hint line to the hand-off offer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    expect(hintLineText()).toBe('looks like a prompt — ⌘⏎ send to agent');
  });

  test('a draft that is a shell command does not trigger the hand-off offer', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('ls -la /tmp');
    expect(hintLineText()).toBe('↑ past commands');
  });
});

describe('Terminal mode — hand-off and Esc', () => {
  test('⌘⏎ from the composer flips the SAME tab to Agent with the draft as its first prompt', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    // One tab, no new tab, no new session, no new row.
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid^="session-tab-"]')).toHaveLength(0);
    // The prompt lands in the tab's own feed — one memory.
    const blocks = tabBlocks();
    expect(blocks.some((b) => b.kind === 'agent-prompt' && b.command === 'fix the build')).toBe(true);
    expect(blocks.some((b) => b.kind === 'notice')).toBe(true);

    // The agent view: header says Agent + the tab title, the
    // hint line is the way back.
    expect(headerText()).toContain('Agent');
    expect(headerText()).toContain('Terminal 1');
    expect(screen.queryByTestId('agent-intro-card')).toBeNull();
    expect(hintLineText()).toBe('esc back to terminal · ↑ past prompts');
    // The composer is still the input, and the draft cleared.
    expect(composerInput().value).toBe('');
  });

  test('⌘⏎ with an empty draft flips to Agent with no prompt — same tab, empty feed', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(tabBlocks()).toHaveLength(0);
    // No intro card: the feed is the tab's feed, empty.
    expect(screen.queryByTestId('agent-intro-card')).toBeNull();
    expect(screen.getByTestId('terminal-blocks')).not.toBeNull();
  });

  test('Esc in agent mode returns the SAME tab to Terminal — the prompt stays in the feed', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });

    fireEvent.keyDown(composerInput(), { key: 'Escape' });
    await waitFor(() => {
      expect(tabMode()).toBe('terminal');
    });
    expect(headerText()).toContain('Terminal');
    expect(headerText()).toContain('plain shell');
    expect(hintLineText()).toBe('⌘⏎ new agent conversation · ↑ past commands');
    // Esc flips the mode, it does not close anything: the
    // prompt is still in the tab's feed (one memory).
    expect(tabBlocks().some((b) => b.kind === 'agent-prompt' && b.command === 'fix the build')).toBe(true);
  });

  test('⌘⏎ from the xterm (window-level listener) flips the same tab to Agent', async () => {
    renderNonDevmode(1);
    const xtermInput = await screen.findByTestId('xterm-fallback-input');
    (xtermInput as HTMLElement).focus();
    fireEvent.keyDown(xtermInput, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    // The agent view replaces the xterm at any DEFCON level.
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.getByTestId('prompter-composer-wrap')).not.toBeNull();
  });
});

describe('Terminal mode — the mode pill', () => {
  test('clicking the mode pill flips the tab’s mode and creates nothing', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const pill = screen.getByTestId('mode-pill');
    expect(pill.textContent).toContain('Terminal');

    fireEvent.click(pill);
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid^="session-tab-"]')).toHaveLength(0);
    expect(useSessionStore.getState().tabMode).toEqual({ 'tab-1': 'agent' });
    expect(screen.getByTestId('mode-pill').textContent).toContain('Agent');

    fireEvent.click(screen.getByTestId('mode-pill'));
    await waitFor(() => {
      expect(tabMode()).toBe('terminal');
    });
    expect(screen.getByTestId('mode-pill').textContent).toContain('Terminal');
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });

  test('the pill row shows the driving-agent label, the cwd pill and the version pill', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const row = screen.getByTestId('prompt-pill-row');
    expect(row.textContent).toContain('LLMBuilder');
    expect(row.textContent).toContain(TAB_CWD);
    expect(row.textContent).toMatch(/v\d+\.\d+\.\d+/);
    // Not a repo in this harness — no git pills, never faked.
    expect(screen.queryByTestId('git-branch-pill')).toBeNull();
  });
});

describe('Terminal mode — switching tabs preserves mode + conversation', () => {
  test('each tab keeps its own mode and its own feed', async () => {
    useTerminalStore.setState({
      tabs: [
        { id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true },
        { id: 'tab-2', title: 'Terminal 2', cwd: TAB_CWD, isActive: false },
      ],
      activeTabId: 'tab-1',
    });
    const { rerender } = renderNonDevmode(3, 'tab-1');
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(tabMode('tab-1')).toBe('agent');
    });

    // Tab 2: terminal mode, its own empty feed.
    useTerminalStore.setState({ activeTabId: 'tab-2' });
    rerender(<Terminal tabId="tab-2" />);
    await waitFor(() => {
      expect(screen.getByTestId('mode-pill').textContent).toContain('Terminal');
    });
    expect(tabMode('tab-2')).toBe('terminal');
    expect(tabBlocks('tab-2')).toHaveLength(0);

    // Back to tab 1: agent mode and the prompt are still there.
    useTerminalStore.setState({ activeTabId: 'tab-1' });
    rerender(<Terminal tabId="tab-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('mode-pill').textContent).toContain('Agent');
    });
    expect(tabMode('tab-1')).toBe('agent');
    expect(tabBlocks('tab-1').some((b) => b.kind === 'agent-prompt' && b.command === 'fix the build')).toBe(true);
  });
});

describe('Terminal mode — flipping the pill does not change the feed', () => {
  test('the same feed shows in both modes — terminal blocks stay visible in Agent mode', async () => {
    useHistoryStore.setState({
      blocksByTab: {
        'tab-1': [{ id: 'b1', command: 'ls', output: 'a\nb', timestamp: 1, isComplete: true }],
      },
    });
    renderNonDevmode(1);
    await screen.findByTestId('xterm-surface');
    fireEvent.click(screen.getByTestId('mode-pill'));
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    // The feed is the same feed: the earlier terminal block is
    // still there, in Agent mode.
    expect(screen.getByTestId('terminal-blocks').textContent).toContain('ls');
    expect(screen.queryByTestId('agent-intro-card')).toBeNull();
  });
});

describe('Terminal mode — the agent view at DEFCON 1', () => {
  test('agent mode has the composer and the feed at any level — no xterm, no intro card', async () => {
    renderNonDevmode(1);
    await screen.findByTestId('xterm-surface');
    fireEvent.click(screen.getByTestId('mode-pill'));
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.getByTestId('prompter-composer-wrap')).not.toBeNull();
    expect(screen.queryByTestId('agent-intro-card')).toBeNull();
    expect(screen.getByTestId('terminal-blocks')).not.toBeNull();
    expect(hintLineText()).toBe('esc back to terminal · ↑ past prompts');
  });
});

describe('Terminal mode — agent prompt history', () => {
  test('Up/Down walk the tab’s past agent prompts, most recent first', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    submitToComposer('explain the error');

    fireEvent.keyDown(composerInput(), { key: 'ArrowUp' });
    expect(composerInput().value).toBe('explain the error');
    fireEvent.keyDown(composerInput(), { key: 'ArrowUp' });
    expect(composerInput().value).toBe('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'ArrowDown' });
    expect(composerInput().value).toBe('explain the error');
    fireEvent.keyDown(composerInput(), { key: 'ArrowDown' });
    expect(composerInput().value).toBe('');
  });

  test('an agent prompt lands in the tab’s History — one memory, no separate store', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(tabMode()).toBe('agent');
    });
    const history = selectHistoryBlocksForTab(useHistoryStore.getState(), 'tab-1');
    expect(history.some((b) => b.kind === 'agent-prompt' && b.command === 'fix the build')).toBe(true);
  });
});
