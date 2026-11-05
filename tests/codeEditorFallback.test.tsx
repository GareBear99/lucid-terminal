// @vitest-environment jsdom
/**
 * CodeEditor Monaco fallback tests.
 *
 * Hand-checkable case: with Monaco failing to load, the file editor must
 * still become editable — a plain textarea appears (within the 8 s wait,
 * or at once if the load rejects) instead of sitting on "Loading..."
 * forever. Typing in the fallback edits the open file exactly like the
 * Monaco editor would.
 *
 * The Monaco editor itself is stubbed out here: what matters is whether
 * CodeEditor gives up on it and renders the textarea. The loader-config
 * half (local bundle, no CDN) is covered by tests/monacoLoader.test.ts.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useFileStore } from '../src/stores/fileStore';
import CodeEditor from '../src/components/Editor/CodeEditor';

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

const openFile = {
  path: '/tmp/notes.ts',
  name: 'notes.ts',
  content: 'const answer = 42;\n',
  originalContent: 'const answer = 42;\n',
  isDirty: false,
};

const seedOpenFile = () => {
  useFileStore.setState({
    openFiles: [{ ...openFile }],
    activeFilePath: openFile.path,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  mockState.initImpl = null;
  seedOpenFile();
});

afterEach(() => {
  // Reset the store while the component is still mounted (RTL cleans up
  // after this hook), so the reset itself has to be inside act too.
  act(() => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('CodeEditor Monaco fallback', () => {
  it('shows a textarea with the file content when Monaco never loads', () => {
    render(<CodeEditor />);

    // Still waiting on Monaco: no way to type yet, and no hang text either.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();

    // The 8 s wait passes with Monaco still hanging.
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    const fallback = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(fallback.value).toBe('const answer = 42;\n');
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
  });

  it('shows the textarea at once when the Monaco load rejects', async () => {
    mockState.initImpl = () => Promise.reject(new Error('bundle failed to load'));
    render(<CodeEditor />);

    await act(async () => {});

    const fallback = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(fallback.value).toBe('const answer = 42;\n');
  });

  it('keeps the Monaco editor when it loads, even past the 8 s wait', async () => {
    mockState.initImpl = () => Promise.resolve({});
    render(<CodeEditor />);

    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
  });

  it('typing in the fallback edits the open file and marks it dirty', () => {
    render(<CodeEditor />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    const fallback = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(fallback, { target: { value: 'const answer = 43;\n' } });

    const [file] = useFileStore.getState().openFiles;
    expect(file.content).toBe('const answer = 43;\n');
    expect(file.isDirty).toBe(true);
  });
});
