// @vitest-environment jsdom
/**
 * CodeEditor truncated-preview behaviour (files-section fix
 * step 3).
 *
 * A file over the open cap arrives as a read-only preview
 * (isTruncated + fullSize on the OpenFile). The editor must:
 * - show a banner saying how much of the file is shown,
 * - make Monaco (and the fallback textarea) read-only,
 * - skip the per-open heavy set: no tree-sitter parse, no LSP
 *   document open, no diagnostics / gutter / model-status
 *   scheduling for the preview.
 * A normal file is untouched: no banner, editable, heavy
 * effects run.
 *
 * The Monaco editor itself is stubbed out here (as in
 * codeEditorFallback.test.tsx) — what matters is the props
 * CodeEditor passes it and the effects it does or does not run.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useFileStore } from '../src/stores/fileStore';
import type { OpenFile } from '../src/stores/fileStore';
import CodeEditor from '../src/components/Editor/CodeEditor';

const mockState = vi.hoisted(() => ({
  // When null, loader.init() never settles (the load hangs).
  initImpl: null as null | (() => Promise<unknown>),
  lastMonacoProps: null as Record<string, unknown> | null,
  updateFileTree: vi.fn(),
  openDocument: vi.fn(),
  dropFileTreesExcept: vi.fn(),
  dropDocumentsExcept: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: () => (mockState.initImpl ? mockState.initImpl() : new Promise(() => {})),
    config: () => {},
  },
  default: (props: Record<string, unknown>) => {
    mockState.lastMonacoProps = props;
    return <div data-testid="monaco-editor" data-language={props.language as string} />;
  },
}));

vi.mock('../src/lib/treeSitter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/treeSitter')>();
  return {
    ...actual,
    updateFileTree: (...args: unknown[]) => mockState.updateFileTree(...args),
    dropFileTreesExcept: (...args: unknown[]) => mockState.dropFileTreesExcept(...args),
    getScopeDescriptorAtPosition: () => null,
  };
});

vi.mock('../src/lib/engineClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/engineClient')>();
  return {
    ...actual,
    getEngineClient: () => ({
      openDocument: (...args: unknown[]) => mockState.openDocument(...args),
      changeDocument: vi.fn(),
      getDiagnostics: () => [],
      dropDocumentsExcept: (...args: unknown[]) => mockState.dropDocumentsExcept(...args),
      ensureReady: async () => {},
      getCompletions: () => null,
      resolveCompletion: (item: unknown) => item,
      getStructureIdentifiers: () => [],
      getPatternCompletions: () => [],
      getHover: () => null,
      getSymbolReport: () => null,
      getSignatureHelp: () => null,
    }),
  };
});

const MB = 1024 * 1024;

const truncatedFile: OpenFile = {
  path: '/tmp/big.log',
  name: 'big.log',
  content: 'x'.repeat(1000),
  originalContent: 'x'.repeat(1000),
  isDirty: false,
  isTruncated: true,
  fullSize: 5 * MB,
};

const normalFile: OpenFile = {
  path: '/tmp/notes.ts',
  name: 'notes.ts',
  content: 'const answer = 42;\n',
  originalContent: 'const answer = 42;\n',
  isDirty: false,
};

const seedOpenFile = (file: OpenFile) => {
  useFileStore.setState({
    openFiles: [{ ...file }],
    activeFilePath: file.path,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  mockState.initImpl = () => Promise.resolve({});
  mockState.lastMonacoProps = null;
  mockState.updateFileTree.mockClear();
  mockState.openDocument.mockClear();
  mockState.dropFileTreesExcept.mockClear();
  mockState.dropDocumentsExcept.mockClear();
});

afterEach(() => {
  act(() => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('CodeEditor truncated preview', () => {
  it('shows the banner with the shown and full sizes', async () => {
    seedOpenFile(truncatedFile);
    render(<CodeEditor />);
    await act(async () => {});

    expect(screen.getByTestId('large-file-banner')).toBeTruthy();
    expect(screen.getByTestId('large-file-banner').textContent).toContain(
      'Large file — showing the first 1.0 MB of 5.0 MB. Read-only preview; editing is disabled.',
    );
  });

  it('passes readOnly to Monaco for a truncated file', async () => {
    seedOpenFile(truncatedFile);
    render(<CodeEditor />);
    await act(async () => {});

    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
    const options = mockState.lastMonacoProps?.options as { readOnly?: boolean };
    expect(options.readOnly).toBe(true);
  });

  it('skips the heavy per-open effects for a truncated file', async () => {
    seedOpenFile(truncatedFile);
    render(<CodeEditor />);
    await act(async () => {});
    // Let the 150 ms diagnostics / gutter / status timers fire.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockState.updateFileTree).not.toHaveBeenCalled();
    expect(mockState.openDocument).not.toHaveBeenCalled();
  });

  it('makes the fallback textarea read-only for a truncated file', async () => {
    mockState.initImpl = null; // Monaco never loads.
    seedOpenFile(truncatedFile);
    render(<CodeEditor />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    const fallback = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(fallback.readOnly).toBe(true);
    expect(fallback.value).toBe('x'.repeat(1000));
    expect(screen.getByTestId('large-file-banner')).toBeTruthy();
  });

  it('a normal file is untouched: no banner, editable, heavy effects run', async () => {
    seedOpenFile(normalFile);
    render(<CodeEditor />);
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId('large-file-banner')).toBeNull();
    const options = mockState.lastMonacoProps?.options as { readOnly?: boolean };
    expect(options.readOnly).toBe(false);
    expect(mockState.updateFileTree).toHaveBeenCalledWith(
      normalFile.path,
      normalFile.content,
    );
    expect(mockState.openDocument).toHaveBeenCalledWith(
      normalFile.path,
      normalFile.content,
    );
  });

  it('the fallback textarea stays editable for a normal file', async () => {
    mockState.initImpl = null; // Monaco never loads.
    seedOpenFile(normalFile);
    render(<CodeEditor />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    const fallback = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(fallback.readOnly).toBe(false);
    expect(screen.queryByTestId('large-file-banner')).toBeNull();
  });
});
