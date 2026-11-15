// @vitest-environment jsdom
/**
 * The docs panel tests (Kite mapping #4 — the sidebar
 * pattern — 2026-11-14).
 *
 * The panel is a reader: it subscribes to the cursor bus
 * and asks the engine client for the symbol report. The
 * client here is a stub — the engine itself is proven by
 * tests/engineClient.test.ts, not here. What is proven
 * here: the empty states, the signature/prose split, the
 * definition + references render, and the 1-based Monaco →
 * 0-based LSP position conversion.
 *
 * Run with: npx vitest run tests/docsPanel.test.tsx
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocsPanel,
  resolveLocationPath,
  splitHoverMarkdown,
} from '../src/components/Sidebar/DocsPanel';
import {
  publishDocsCursor,
  resetDocsCursorForTests,
} from '../src/lib/docsCursor';
import {
  getPendingEditorJump,
  resetEditorJumpForTests,
} from '../src/lib/editorJump';
import type { EngineClient, SymbolReport } from '../src/lib/engineClient';
import type { LspPosition } from '../src/lib/tsLspContract';

const REPORT: SymbolReport = {
  identifier: 'greet',
  hover: {
    contents:
      '```typescript\nconst greet: (name: string) => string\n```\n\nGreets the user.',
    range: undefined,
  },
  definition: [
    {
      uri: '/ws/app.ts',
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
      },
    },
  ],
  references: [
    {
      uri: '/ws/app.ts',
      range: {
        start: { line: 3, character: 15 },
        end: { line: 3, character: 20 },
      },
    },
  ],
};

function stubClient(report: SymbolReport | null, ready = true): {
  client: EngineClient;
  calls: Array<{ path: string; position: LspPosition; word: string }>;
} {
  const calls: Array<{ path: string; position: LspPosition; word: string }> = [];
  const client = {
    isReady: () => ready,
    getSymbolReport: (path: string, position: LspPosition, word: string) => {
      calls.push({ path, position, word });
      return report;
    },
  } as unknown as EngineClient;
  return { client, calls };
}

beforeEach(() => {
  resetDocsCursorForTests();
  resetEditorJumpForTests();
});

/** Publish the cursor for REPORT and render the panel with a
 *  stubbed opener (the live funnel needs the bridge). */
function renderPanel(
  report: SymbolReport,
  opts: { onJumpToEditor?: () => void } = {},
) {
  publishDocsCursor({
    path: '/ws/app.ts',
    lineNumber: 4,
    column: 18,
    word: 'greet',
  });
  const { client } = stubClient(report);
  const openFile = vi.fn(async (path: string) => ({
    result: 'opened' as const,
    path,
  }));
  const onJumpToEditor = vi.fn(opts.onJumpToEditor ?? (() => {}));
  render(
    <DocsPanel
      client={client}
      openFile={openFile}
      onJumpToEditor={onJumpToEditor}
    />,
  );
  return { openFile, onJumpToEditor };
}

describe('splitHoverMarkdown — the fenced signature + JSDoc', () => {
  it('splits the signature from the prose', () => {
    const split = splitHoverMarkdown(
      '```typescript\nconst greet: (name: string) => string\n```\n\nGreets the user.',
    );
    expect(split.signature).toBe('const greet: (name: string) => string');
    expect(split.prose).toBe('Greets the user.');
  });

  it('a hover with no fence is all prose', () => {
    expect(splitHoverMarkdown('Just some docs.')).toEqual({
      signature: null,
      prose: 'Just some docs.',
    });
  });

  it('a code-only hover has no prose', () => {
    expect(
      splitHoverMarkdown('```typescript\nconst a = 1;\n```'),
    ).toEqual({ signature: 'const a = 1;', prose: '' });
  });
});

describe('DocsPanel — the reader of the engine', () => {
  it('asks the client with the 0-based LSP position and renders the report', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const { client, calls } = stubClient(REPORT);
    render(<DocsPanel client={client} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      path: '/ws/app.ts',
      position: { line: 3, character: 17 },
      word: 'greet',
    });
    expect(screen.getByText('greet')).toBeTruthy();
    expect(
      screen.getByText('const greet: (name: string) => string'),
    ).toBeTruthy();
    expect(screen.getByText('Greets the user.')).toBeTruthy();
    expect(screen.getByText('Defined in')).toBeTruthy();
    expect(screen.getByText('app.ts:1')).toBeTruthy();
    expect(screen.getByText('References (1)')).toBeTruthy();
    expect(screen.getByText('app.ts:4')).toBeTruthy();
  });

  it('caps the references at five with a "+N more" line', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const many: SymbolReport = {
      ...REPORT,
      references: Array.from({ length: 7 }, (_, i) => ({
        uri: '/ws/app.ts',
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: 5 },
        },
      })),
    };
    const { client } = stubClient(many);
    render(<DocsPanel client={client} />);
    expect(screen.getByText('References (7)')).toBeTruthy();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it('shows the empty state before any cursor is published', () => {
    const { client } = stubClient(REPORT);
    render(<DocsPanel client={client} />);
    expect(
      screen.getByText(
        'Open a file and place the cursor on a symbol to see its documentation.',
      ),
    ).toBeTruthy();
  });

  it('shows the empty state when the cursor sits on whitespace', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 1,
      column: 1,
      word: null,
    });
    const { client, calls } = stubClient(REPORT);
    render(<DocsPanel client={client} />);
    expect(screen.getByText('No symbol under the cursor.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('shows the loading state when the engine is down, and never asks it', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const { client, calls } = stubClient(REPORT, false);
    render(<DocsPanel client={client} />);
    expect(
      screen.getByText(
        'The language service is still loading — docs will appear when it is ready.',
      ),
    ).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('shows "no documentation" when the engine has no hover for the symbol', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const { client } = stubClient(null);
    render(<DocsPanel client={client} />);
    expect(screen.getByText(/No documentation for/)).toBeTruthy();
    expect(screen.getByText('greet')).toBeTruthy();
  });

  it('follows the cursor when it moves', () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const { client, calls } = stubClient(REPORT);
    render(<DocsPanel client={client} />);
    expect(screen.getByText('Greets the user.')).toBeTruthy();
    act(() => {
      publishDocsCursor({
        path: '/ws/app.ts',
        lineNumber: 2,
        column: 5,
        word: null,
      });
    });
    expect(screen.getByText('No symbol under the cursor.')).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe('resolveLocationPath — plain paths and file:// URIs', () => {
  it('a plain absolute path resolves as-is', () => {
    expect(resolveLocationPath('/ws/app.ts')).toBe('/ws/app.ts');
  });

  it('a file:// URI resolves to its path', () => {
    expect(resolveLocationPath('file:///ws/app.ts')).toBe('/ws/app.ts');
  });

  it('a percent-encoded file:// URI is decoded', () => {
    expect(resolveLocationPath('file:///ws/my%20project/app.ts')).toBe(
      '/ws/my project/app.ts',
    );
  });

  it('empty, non-file schemes and relative paths do not resolve', () => {
    expect(resolveLocationPath('')).toBeNull();
    expect(resolveLocationPath('untitled:Untitled-1')).toBeNull();
    expect(resolveLocationPath('vscode-vfs://x/y.ts')).toBeNull();
    expect(resolveLocationPath('relative/app.ts')).toBeNull();
    expect(resolveLocationPath('file://localhost/ws/app.ts')).toBeNull();
  });
});

describe('DocsPanel click-to-jump — the location is the jump', () => {
  it('clicking a definition opens the file and requests the jump at its start', async () => {
    const { openFile, onJumpToEditor } = renderPanel(REPORT);
    fireEvent.click(screen.getByRole('button', { name: 'app.ts:1' }));
    await waitFor(() => expect(openFile).toHaveBeenCalledWith('/ws/app.ts'));
    expect(onJumpToEditor).toHaveBeenCalledTimes(1);
    // Definition at LSP line 0, character 6 → editor line 1, column 7.
    expect(getPendingEditorJump()).toEqual({
      path: '/ws/app.ts',
      lineNumber: 1,
      column: 7,
    });
  });

  it('clicking a reference jumps to the reference, not the definition', async () => {
    const { openFile } = renderPanel(REPORT);
    fireEvent.click(screen.getByRole('button', { name: 'app.ts:4' }));
    await waitFor(() => expect(openFile).toHaveBeenCalledWith('/ws/app.ts'));
    // Reference at LSP line 3, character 15 → editor line 4, column 16.
    expect(getPendingEditorJump()).toEqual({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 16,
    });
  });

  it('a file:// definition resolves to its path before opening', async () => {
    const { openFile } = renderPanel({
      ...REPORT,
      definition: [
        {
          uri: 'file:///ws/other.ts',
          range: {
            start: { line: 9, character: 2 },
            end: { line: 9, character: 7 },
          },
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'other.ts:10' }));
    await waitFor(() =>
      expect(openFile).toHaveBeenCalledWith('/ws/other.ts'),
    );
    expect(getPendingEditorJump()).toEqual({
      path: '/ws/other.ts',
      lineNumber: 10,
      column: 3,
    });
  });

  it('a failed open stops the jump — no view switch, no pending jump', async () => {
    publishDocsCursor({
      path: '/ws/app.ts',
      lineNumber: 4,
      column: 18,
      word: 'greet',
    });
    const { client } = stubClient(REPORT);
    const openFile = vi.fn(async (_path: string) => null);
    const onJumpToEditor = vi.fn();
    render(
      <DocsPanel
        client={client}
        openFile={openFile}
        onJumpToEditor={onJumpToEditor}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'app.ts:1' }));
    await waitFor(() => expect(openFile).toHaveBeenCalledWith('/ws/app.ts'));
    // Let the rejected jump settle — the handler returns after the
    // failed open, so a tick is enough to prove nothing follows.
    await act(async () => {});
    expect(onJumpToEditor).not.toHaveBeenCalled();
    expect(getPendingEditorJump()).toBeNull();
  });

  it('an unresolvable location is plain text and clicking does nothing', async () => {
    const { openFile, onJumpToEditor } = renderPanel({
      ...REPORT,
      definition: [
        {
          uri: 'untitled:Untitled-1',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ],
      // The reference must be unresolvable too, or the panel
      // still renders a button for it and the assertion below
      // proves nothing.
      references: [
        {
          uri: 'untitled:Untitled-1',
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 5 },
          },
        },
      ],
    });
    expect(screen.queryByRole('button')).toBeNull();
    const label = screen.getByText('untitled:Untitled-1:1');
    fireEvent.click(label);
    await act(async () => {});
    expect(openFile).not.toHaveBeenCalled();
    expect(onJumpToEditor).not.toHaveBeenCalled();
    expect(getPendingEditorJump()).toBeNull();
  });
});
