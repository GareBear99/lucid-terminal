// @vitest-environment jsdom
/**
 * Editor status bar component tests.
 *
 * The bar renders its registered tiles in priority order; the
 * core tiles behave like Atom's: the path tile copies on click
 * (Shift-click: relative), the cursor tile opens go-to-line,
 * the selection tile only appears with a selection, the grammar
 * tile switches the model language, the line-ending tile
 * converts the whole buffer. The git tile needs the git IPC,
 * so it is covered by the absence rule here (no bridge → no
 * tile) and by the live check.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { EditorStatusBar } from '../src/components/Editor/EditorStatusBar';
import { useEditorStatusBarStore } from '../src/stores/editorStatusBarStore';
import { useEditorStatusStore } from '../src/stores/editorStatusStore';
import { useFileStore } from '../src/stores/fileStore';
import { useModalStore } from '../src/stores/modalStore';
import {
  setActiveMonacoEditor,
  resetActiveMonacoEditorForTests,
} from '../src/lib/editorHandle';

const writeText = vi.fn(async () => {});

beforeEach(() => {
  useEditorStatusBarStore.getState().resetForTests();
  useEditorStatusStore.getState().resetForTests();
  useModalStore.getState().close();
  resetActiveMonacoEditorForTests();
  useFileStore.setState({ activeFilePath: null, currentDir: '', openFiles: [] });
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockClear();
});

afterEach(() => {
  resetActiveMonacoEditorForTests();
});

function publishEditor(
  overrides: {
    filePath?: string | null;
    languageId?: string | null;
    eol?: 'LF' | 'CRLF' | 'Mixed' | null;
    lineNumber?: number;
    column?: number;
    selectionCount?: number;
    lineCount?: number;
  } = {},
) {
  useEditorStatusStore.getState().publish({
    filePath: '/home/test/proj/src/a.ts',
    languageId: 'typescript',
    eol: 'LF',
    lineNumber: 12,
    column: 4,
    selectionCount: 0,
    lineCount: 100,
    ...overrides,
  });
}

describe('EditorStatusBar', () => {
  test('renders the core tiles in order: path, cursor, language, endings', () => {
    useFileStore.setState({
      activeFilePath: '/home/test/proj/src/a.ts',
      currentDir: '/home/test/proj',
    });
    publishEditor();
    render(<EditorStatusBar />);
    const bar = screen.getByTestId('editor-status-bar');
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain('/home/test/proj/src/a.ts');
    expect(bar.textContent).toContain('Ln 12, Col 4');
    expect(bar.textContent).toContain('TypeScript');
    expect(bar.textContent).toContain('LF');
    // Priority order: path before cursor before language before endings.
    const text = bar.textContent ?? '';
    expect(text.indexOf('/home/test/proj/src/a.ts')).toBeLessThan(text.indexOf('Ln 12'));
    expect(text.indexOf('Ln 12')).toBeLessThan(text.indexOf('TypeScript'));
    expect(text.indexOf('TypeScript')).toBeLessThan(text.indexOf('LF'));
  });

  test('a custom tile registers through the same API and orders by priority', () => {
    useFileStore.setState({
      activeFilePath: '/home/test/proj/src/a.ts',
      currentDir: '/home/test/proj',
    });
    publishEditor();
    useEditorStatusBarStore
      .getState()
      .registerTile({ id: 'custom', side: 'left', priority: 15, render: () => 'CUSTOM-TILE' });
    render(<EditorStatusBar />);
    const bar = screen.getByTestId('editor-status-bar');
    expect(bar.textContent).toContain('CUSTOM-TILE');
    // Priority 15 sits between the path tile (10) and the cursor
    // tile (20) — the API, not a hardcoded row, decides order.
    expect((bar.textContent ?? '').indexOf('CUSTOM-TILE')).toBeLessThan(
      (bar.textContent ?? '').indexOf('Ln 12'),
    );
  });

  test('the path tile copies the absolute path on click, the relative path on Shift-click', () => {
    useFileStore.setState({
      activeFilePath: '/home/test/proj/src/a.ts',
      currentDir: '/home/test/proj',
    });
    publishEditor();
    render(<EditorStatusBar />);
    const button = screen.getByTitle(/click copies the absolute path/);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith('/home/test/proj/src/a.ts');
    fireEvent.click(button, { shiftKey: true });
    expect(writeText).toHaveBeenCalledWith('src/a.ts');
  });

  test('the cursor tile opens go-to-line', () => {
    publishEditor();
    render(<EditorStatusBar />);
    fireEvent.click(screen.getByText('Ln 12, Col 4'));
    expect(useModalStore.getState().openModal).toBe('goto-line');
  });

  test('the selection tile only appears when there is a selection', () => {
    publishEditor({ selectionCount: 0 });
    const { rerender } = render(<EditorStatusBar />);
    expect(screen.queryByText(/selected/)).toBeNull();
    publishEditor({ selectionCount: 7 });
    rerender(<EditorStatusBar />);
    expect(screen.getByText('7 selected')).toBeTruthy();
  });

  test('the grammar tile switches the model language through the editor handle', async () => {
    const setModelLanguage = vi.fn();
    const model = { getLanguageId: () => 'typescript' };
    setActiveMonacoEditor({
      editor: { getModel: () => model },
      monaco: { editor: { setModelLanguage } },
    });
    publishEditor();
    render(<EditorStatusBar />);
    fireEvent.click(screen.getByText('TypeScript'));
    await waitFor(() => expect(screen.getByTestId('status-bar-dropdown')).toBeTruthy());
    fireEvent.click(screen.getByText('Python'));
    expect(setModelLanguage).toHaveBeenCalledWith(model, 'python');
    expect(useEditorStatusStore.getState().languageId).toBe('python');
  });

  test('the line-ending tile converts the whole buffer in one edit', async () => {
    const applyEdits = vi.fn();
    const setEOL = vi.fn();
    const model = {
      getValue: () => 'a\r\nb\r\n',
      getFullModelRange: () => ({ startLineNumber: 1, endLineNumber: 3 }),
      applyEdits,
      setEOL,
    };
    setActiveMonacoEditor({ editor: { getModel: () => model }, monaco: {} });
    publishEditor({ eol: 'CRLF' });
    render(<EditorStatusBar />);
    fireEvent.click(screen.getByText('CRLF'));
    await waitFor(() => expect(screen.getByTestId('status-bar-dropdown')).toBeTruthy());
    fireEvent.click(screen.getByText('LF'));
    expect(applyEdits).toHaveBeenCalledTimes(1);
    expect(applyEdits.mock.calls[0][0][0].text).toBe('a\nb\n');
    expect(setEOL).toHaveBeenCalledWith('\n');
    expect(useEditorStatusStore.getState().eol).toBe('LF');
  });

  test('with no file open the bar hides entirely (no filler, no empty strip, no git tile)', () => {
    render(<EditorStatusBar />);
    // Nothing to say: no bar at all, not an empty strip.
    expect(screen.queryByTestId('editor-status-bar')).toBeNull();
    expect(screen.queryByText('No file open')).toBeNull();
  });
});
