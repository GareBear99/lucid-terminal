// @vitest-environment jsdom
/**
 * Empty-terminal-state editor option tests (Gary, 2026-11-06).
 *
 * When no terminal tab is open the UI says "No terminal open" with a
 * "Create Terminal" button — it must ALSO offer a "Create Editor"
 * button that opens an editor tab for file editing, VS Code-style.
 * The editor itself already exists (CodeEditor + fileStore); what was
 * missing was the way in: the empty state had no editor option, and
 * the editor view was gated on openFiles.length > 0, so with no files
 * open the editor icon fell through to the terminal instead.
 *
 * Covers:
 * (a) the empty state shows BOTH the terminal and the editor option;
 * (b) choosing the editor option fires onCreateEditor (and not the
 *     terminal handler), and vice versa;
 * (c) the editor renders with zero files open — its own empty state
 *     ("No files open. Select a file from the explorer.") is what the
 *     user sees, instead of the terminal;
 * (d) the file open / edit / save round-trip the editor tab drives:
 *     openFile reads the file, editing marks it dirty, saveFile writes
 *     it back and clears the dirty flag.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmptyTerminalState } from '../src/components/Terminal/EmptyTerminalState';
import CodeEditor from '../src/components/Editor/CodeEditor';
import { useFileStore } from '../src/stores/fileStore';

const mockState = vi.hoisted(() => ({
  // When null, loader.init() never settles (the load hangs).
  initImpl: null as null | (() => Promise<unknown>),
}));

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => (mockState.initImpl ? mockState.initImpl() : new Promise(() => {})),
    config: () => {},
  },
  default: (props: Record<string, unknown>) => (
    <div data-testid="monaco-editor" data-language={props.language as string} />
  ),
}));

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

function mockFs() {
  const files = new Map<string, string>([['/tmp/notes.txt', 'hello\n']]);
  const fs = {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: no such file ${path}`);
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = { fs };
  return { fs, files };
}

function restoreLucidAPI() {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
}

function resetFileStore() {
  useFileStore.setState({ openFiles: [], activeFilePath: null, error: null });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockState.initImpl = null;
  resetFileStore();
});

afterEach(() => {
  act(() => {
    resetFileStore();
  });
  restoreLucidAPI();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('EmptyTerminalState', () => {
  it('shows BOTH the terminal option and the editor option', () => {
    render(<EmptyTerminalState onCreateTerminal={() => {}} onCreateEditor={() => {}} />);

    expect(screen.getByText('No terminal open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Terminal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Editor' })).toBeTruthy();
  });

  it('choosing Create Editor fires onCreateEditor and not onCreateTerminal', () => {
    const onCreateTerminal = vi.fn();
    const onCreateEditor = vi.fn();
    render(
      <EmptyTerminalState onCreateTerminal={onCreateTerminal} onCreateEditor={onCreateEditor} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Editor' }));

    expect(onCreateEditor).toHaveBeenCalledTimes(1);
    expect(onCreateTerminal).not.toHaveBeenCalled();
  });

  it('choosing Create Terminal fires onCreateTerminal and not onCreateEditor', () => {
    const onCreateTerminal = vi.fn();
    const onCreateEditor = vi.fn();
    render(
      <EmptyTerminalState onCreateTerminal={onCreateTerminal} onCreateEditor={onCreateEditor} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Terminal' }));

    expect(onCreateTerminal).toHaveBeenCalledTimes(1);
    expect(onCreateEditor).not.toHaveBeenCalled();
  });
});

describe('Editor view with no files open', () => {
  it('renders the editor empty state instead of falling through to a terminal', () => {
    render(<CodeEditor />);

    expect(
      screen.getByText('No files open. Select a file from the explorer.')
    ).toBeTruthy();
  });
});

describe('Editor file open / edit / save', () => {
  it('opens a file, marks it dirty on edit, and saves it back clean', async () => {
    const { fs } = mockFs();

    const opened = await act(async () => useFileStore.getState().openFile('/tmp/notes.txt'));
    expect(opened).toBe(true);

    let file = useFileStore.getState().openFiles[0];
    expect(file.name).toBe('notes.txt');
    expect(file.content).toBe('hello\n');
    expect(file.isDirty).toBe(false);
    expect(useFileStore.getState().activeFilePath).toBe('/tmp/notes.txt');

    act(() => {
      useFileStore.getState().updateFileContent('/tmp/notes.txt', 'hello world\n');
    });
    file = useFileStore.getState().openFiles[0];
    expect(file.content).toBe('hello world\n');
    expect(file.isDirty).toBe(true);

    await act(async () => {
      await useFileStore.getState().saveFile('/tmp/notes.txt');
    });
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/notes.txt', 'hello world\n');
    file = useFileStore.getState().openFiles[0];
    expect(file.isDirty).toBe(false);
  });

  it('opening the same file again just activates it instead of duplicating it', async () => {
    mockFs();

    await act(async () => useFileStore.getState().openFile('/tmp/notes.txt'));
    await act(async () => useFileStore.getState().openFile('/tmp/notes.txt'));

    expect(useFileStore.getState().openFiles).toHaveLength(1);
    expect(useFileStore.getState().activeFilePath).toBe('/tmp/notes.txt');
  });
});
