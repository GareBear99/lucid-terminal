// @vitest-environment jsdom
/**
 * Command history palette (sweep item 5) — Ctrl+R over the
 * command history.
 *
 * The palette lists the global command history newest first,
 * deduplicated; selecting a command re-inputs it into the
 * composer (it fills the input, it does not run). The Ctrl+R
 * binding only fires while the composer owns typing (level
 * 3+ terminal mode) — below 3 Ctrl+R stays the shell's
 * readline reverse-search, and in agent mode there is no
 * shell command to re-input.
 *
 * Run with: npx vitest run tests/commandHistoryPalette.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandHistoryPalette } from '../src/components/Terminal/CommandHistoryPalette';
import { useCommandHistoryStore } from '../src/stores/commandHistoryStore';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';

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

beforeEach(() => {
  writeMock = vi.fn();
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: writeMock,
      executeCommand: vi.fn().mockResolvedValue({ success: true, output: '' }),
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      command: vi.fn().mockResolvedValue({ terminalOutput: '' }),
      getHistory: vi.fn().mockResolvedValue([]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      workflowStatus: vi.fn().mockResolvedValue({ workflow: {}, fixnet: {} }),
      llmList: vi.fn().mockResolvedValue([]),
      getTokenStats: vi.fn().mockResolvedValue({}),
    },
    settings: { set: vi.fn(async () => undefined) },
  };
  useHistoryStore.setState({ blocksByTab: {} });
  useCommandHistoryStore.setState({ entries: [] });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: true, luciferAiEnabled: false, luciferAiSilenced: false, defconLevel: 3 },
  });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  useCommandHistoryStore.setState({ entries: [] });
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

describe('CommandHistoryPalette — the list', () => {
  test('newest first, deduplicated (the most recent occurrence wins)', () => {
    useCommandHistoryStore.setState({ entries: ['ls', 'pwd', 'ls', 'echo hi'] });
    const onReinput = vi.fn();
    render(<CommandHistoryPalette open onReinput={onReinput} onClose={() => {}} />);
    const rows = screen.getAllByTestId(/^fuzzy-modal-item-/);
    expect(rows.map((r) => r.textContent)).toEqual(['echo hi', 'ls', 'pwd']);
  });

  test('empty history reads "No commands yet"', () => {
    render(<CommandHistoryPalette open onReinput={() => {}} onClose={() => {}} />);
    expect(screen.getByText('No commands yet')).not.toBeNull();
  });

  test('typing filters; Enter re-inputs the selected command and closes', () => {
    useCommandHistoryStore.setState({ entries: ['ls', 'pwd', 'echo hi'] });
    const onReinput = vi.fn();
    const onClose = vi.fn();
    render(<CommandHistoryPalette open onReinput={onReinput} onClose={onClose} />);
    const input = screen.getByTestId('fuzzy-modal-input');
    fireEvent.change(input, { target: { value: 'echo' } });
    expect(screen.getAllByTestId(/^fuzzy-modal-item-/)).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    expect(onReinput).toHaveBeenCalledWith('echo hi');
  });

  test('closed renders nothing', () => {
    useCommandHistoryStore.setState({ entries: ['ls'] });
    render(<CommandHistoryPalette open={false} onReinput={() => {}} onClose={() => {}} />);
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
  });
});

describe('Ctrl+R binding — Terminal', () => {
  test('Ctrl+R at level 3 opens the palette; selecting re-inputs into the composer', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
    // Seed AFTER mount: Terminal's mount effect loads the
    // profile's history from storage and would overwrite an
    // earlier seed.
    useCommandHistoryStore.setState({ entries: ['ls', 'echo hi'] });

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    await screen.findByTestId('fuzzy-modal');
    expect(screen.getByTestId('fuzzy-modal-input').getAttribute('placeholder')).toBe(
      'Search command history',
    );
    // Newest first.
    const rows = screen.getAllByTestId(/^fuzzy-modal-item-/);
    expect(rows.map((r) => r.textContent)).toEqual(['echo hi', 'ls']);

    fireEvent.click(rows[0]);
    await waitFor(() => expect(screen.queryByTestId('fuzzy-modal')).toBeNull());
    // Re-input: the command is in the composer, not run.
    const bar = screen.getByTestId('dev-command-bar');
    const composer = bar.querySelector('textarea') as HTMLTextAreaElement;
    expect(composer.value).toBe('echo hi');
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('Ctrl+R below 3 does not open the palette (the shell keeps its reverse-search)', async () => {
    setDefconLevel(1);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    useCommandHistoryStore.setState({ entries: ['ls'] });

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
  });

  test('plain R (no Ctrl) does not open the palette', async () => {
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('dev-command-bar');
    fireEvent.keyDown(window, { key: 'r' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('fuzzy-modal')).toBeNull();
  });
});
