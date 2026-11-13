// @vitest-environment jsdom
/**
 * Terminal sessions — the overnight heavy terminal work,
 * end to end through the real Terminal (2026-11-13).
 *
 * Covered here: the hint line per context (including the
 * auto-detection offer), ⌘⏎ hand-off from the composer and
 * from the xterm, Esc back to the terminal session, the mode
 * pill switching sessions (Option A), the agent view at
 * DEFCON 1 (composer visible, xterm unmounted, intro card),
 * and Up/Down walking the agent session's past prompts.
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
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSessionStore } from '../src/stores/sessionStore';
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
  useHistoryStore.setState({ blocksByTab: {} });
  useTerminalStore.setState({
    tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: TAB_CWD, isActive: true }],
    activeTabId: 'tab-1',
  });
  useSessionStore.setState({ agentSessions: [], activeSessionId: null, agentBlocksBySession: {} });
  resetGitStatusCacheForTests();
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
  useSessionStore.setState({ agentSessions: [], activeSessionId: null, agentBlocksBySession: {} });
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

function renderNonDevmode(level: 1 | 2 | 3) {
  setDefconLevel(level);
  return render(<Terminal tabId="tab-1" />);
}

/** The composer's input (the fallback textarea in jsdom) — the
 *  linked composer in the prompt section, in both session kinds. */
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

function agentSessions() {
  return useSessionStore.getState().agentSessions;
}

function agentBlocks(sessionId: string) {
  return useSessionStore.getState().agentBlocksBySession[sessionId] ?? [];
}

describe('Terminal sessions — the hint line', () => {
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

describe('Terminal sessions — hand-off and Esc', () => {
  test('⌘⏎ from the composer creates an agent session with the draft as its first prompt', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });
    const session = agentSessions()[0];
    expect(useSessionStore.getState().activeSessionId).toBe(session.id);
    expect(session.title).toBe('fix the build');
    expect(session.cwd).toBe(TAB_CWD);
    const blocks = agentBlocks(session.id);
    expect(blocks.some((b) => b.kind === 'agent-prompt' && b.command === 'fix the build')).toBe(true);
    expect(blocks.some((b) => b.kind === 'notice')).toBe(true);

    // The agent view: header says Agent + title, the intro card
    // is gone (blocks exist), the hint line is the way back.
    expect(headerText()).toContain('Agent');
    expect(headerText()).toContain('fix the build');
    expect(screen.queryByTestId('agent-intro-card')).toBeNull();
    expect(hintLineText()).toBe('esc back to terminal · ↑ past prompts');
    // The composer is still the input, and the draft cleared.
    expect(composerInput().value).toBe('');
  });

  test('⌘⏎ with an empty draft creates an empty agent session (no first prompt)', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });
    const session = agentSessions()[0];
    expect(session.title).toBe('New agent conversation');
    expect(agentBlocks(session.id)).toHaveLength(0);
    // Empty agent session: the intro card teaches the session.
    expect(screen.getByTestId('agent-intro-card')).not.toBeNull();
    expect(screen.getByTestId('agent-intro-card').textContent).toContain(TAB_CWD);
  });

  test('Esc in the agent session returns to the terminal session', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });

    fireEvent.keyDown(composerInput(), { key: 'Escape' });
    await waitFor(() => {
      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
    expect(headerText()).toContain('Terminal');
    expect(headerText()).toContain('plain shell');
    expect(hintLineText()).toBe('⌘⏎ new agent conversation · ↑ past commands');
    // The agent session survives the trip back — Esc switches,
    // it does not close.
    expect(agentSessions()).toHaveLength(1);
  });

  test('⌘⏎ from the xterm (window-level listener) creates an agent session', async () => {
    renderNonDevmode(1);
    const xtermInput = await screen.findByTestId('xterm-fallback-input');
    (xtermInput as HTMLElement).focus();
    fireEvent.keyDown(xtermInput, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });
    expect(useSessionStore.getState().activeSessionId).toBe(agentSessions()[0].id);
    // The agent view replaces the xterm at any DEFCON level.
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.getByTestId('prompter-composer-wrap')).not.toBeNull();
  });
});

describe('Terminal sessions — the mode pill', () => {
  test('clicking the mode pill creates an agent session; clicking again returns to the terminal', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    const pill = screen.getByTestId('mode-pill');
    expect(pill.textContent).toContain('Terminal');

    fireEvent.click(pill);
    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });
    expect(useSessionStore.getState().activeSessionId).toBe(agentSessions()[0].id);
    expect(screen.getByTestId('mode-pill').textContent).toContain('Agent');

    fireEvent.click(screen.getByTestId('mode-pill'));
    await waitFor(() => {
      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
    expect(screen.getByTestId('mode-pill').textContent).toContain('Terminal');
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

describe('Terminal sessions — the agent view at DEFCON 1', () => {
  test('an agent session has the composer and the feed at any level — no xterm', async () => {
    renderNonDevmode(1);
    await screen.findByTestId('xterm-surface');
    fireEvent.click(screen.getByTestId('mode-pill'));
    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
    });
    expect(screen.queryByTestId('xterm-surface')).toBeNull();
    expect(screen.getByTestId('prompter-composer-wrap')).not.toBeNull();
    expect(screen.getByTestId('agent-intro-card')).not.toBeNull();
    expect(screen.getByTestId('terminal-blocks')).not.toBeNull();
    expect(hintLineText()).toBe('esc back to terminal · ↑ past prompts');
  });
});

describe('Terminal sessions — agent prompt history', () => {
  test('Up/Down walk the session’s past prompts, most recent first', async () => {
    renderNonDevmode(3);
    await screen.findByTestId('prompter-composer-wrap');
    typeInComposer('fix the build');
    fireEvent.keyDown(composerInput(), { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(agentSessions()).toHaveLength(1);
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
});
